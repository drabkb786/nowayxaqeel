import { createFileRoute } from "@tanstack/react-router";
import { convertToModelMessages, streamText, type UIMessage } from "ai";

type Body = {
  messages?: UIMessage[];
  model?: string;
  system?: string;
};

const ALLOWED = new Set([
  "openai/gpt-5.5",
  "openai/gpt-5",
  "openai/gpt-5-mini",
  "openai/gpt-5-nano",
  "google/gemini-2.5-pro",
  "google/gemini-2.5-flash",
  "google/gemini-2.5-flash-lite",
]);

const URL_REGEX = /\bhttps?:\/\/[^\s<>"'`)]+/gi;
const MAX_URLS = 4;
const PER_URL_CHARS = 8000;
const TRANSCRIPT_CHAR_LIMIT = 24000;
const TRANSCRIPT_WAIT_MS = 25_000;
const FIRECRAWL_WAIT_MS = 18_000;

const YT_HOST_RE = /^(?:www\.|m\.|music\.)?(?:youtube\.com|youtu\.be)$/i;

function extractYouTubeId(rawUrl: string): string | null {
  try {
    const u = new URL(rawUrl);
    if (!YT_HOST_RE.test(u.hostname)) return null;
    if (u.hostname.toLowerCase().endsWith("youtu.be")) {
      const id = u.pathname.replace(/^\/+/, "").split("/")[0];
      return id && /^[\w-]{6,}$/.test(id) ? id : null;
    }
    // youtube.com
    if (u.pathname === "/watch") {
      const v = u.searchParams.get("v");
      return v && /^[\w-]{6,}$/.test(v) ? v : null;
    }
    const shortsMatch = u.pathname.match(/^\/(shorts|embed|live)\/([\w-]{6,})/);
    if (shortsMatch) return shortsMatch[2];
    return null;
  } catch {
    return null;
  }
}

function formatTimestamp(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}

function withWaitLimit<T>(work: Promise<T>, ms: number, fallback: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    work.finally(() => {
      if (timer) clearTimeout(timer);
    }),
    new Promise<T>((resolve) => {
      timer = setTimeout(() => resolve(fallback), ms);
    }),
  ]);
}

async function fetchYouTubeTranscript(videoId: string) {
  try {
    const { YoutubeTranscript } = await import("youtube-transcript");
    const items = (await YoutubeTranscript.fetchTranscript(videoId)) as Array<{
      text?: string;
      offset?: number;
    }>;
    if (!items || items.length === 0) {
      return { ok: false as const, error: "No transcript items returned." };
    }
    // Build a timestamped transcript, decoding basic HTML entities.
    const decode = (s: string) =>
      s
        .replace(/&amp;/g, "&")
        .replace(/&#39;/g, "'")
        .replace(/&quot;/g, '"')
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&nbsp;/g, " ");
    const lines = items.map((it) => {
      const offsetSec =
        typeof it.offset === "number" && it.offset > 1000 ? it.offset / 1000 : Number(it.offset ?? 0);
      return `[${formatTimestamp(offsetSec)}] ${decode(String(it.text ?? "")).trim()}`;
    });
    let transcript = lines.join("\n");
    let truncated = false;
    if (transcript.length > TRANSCRIPT_CHAR_LIMIT) {
      transcript = transcript.slice(0, TRANSCRIPT_CHAR_LIMIT);
      truncated = true;
    }
    return { ok: true as const, transcript, truncated, itemCount: items.length };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false as const, error: msg };
  }
}

function fetchYouTubeTranscriptWithLimit(videoId: string) {
  return withWaitLimit(fetchYouTubeTranscript(videoId), TRANSCRIPT_WAIT_MS, {
    ok: false as const,
    error: "Transcript fetch took too long.",
  });
}

function extractLatestUserText(messages: UIMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role !== "user") continue;
    const parts = (m as unknown as { parts?: Array<{ type: string; text?: string }> }).parts;
    if (Array.isArray(parts)) {
      const text = parts
        .filter((p) => p.type === "text" && typeof p.text === "string")
        .map((p) => p.text as string)
        .join(" ")
        .trim();
      if (text) return text;
    }
  }
  return "";
}

function extractUrls(text: string): string[] {
  const matches = text.match(URL_REGEX) ?? [];
  const cleaned = matches.map((u) => u.replace(/[)\].,;:!?]+$/g, ""));
  return Array.from(new Set(cleaned)).slice(0, MAX_URLS);
}

async function firecrawlScrape(apiKey: string, url: string) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FIRECRAWL_WAIT_MS);
  try {
    const res = await fetch("https://api.firecrawl.dev/v2/scrape", {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        url,
        formats: ["markdown"],
        onlyMainContent: true,
      }),
    });
    if (!res.ok) {
      const errText = await res.text();
      return { url, ok: false as const, error: `HTTP ${res.status}: ${errText.slice(0, 200)}` };
    }
    const json = (await res.json()) as {
      data?: { markdown?: string; metadata?: { title?: string } };
    };
    const md = json.data?.markdown?.trim() ?? "";
    const title = json.data?.metadata?.title ?? "";
    if (!md) return { url, ok: false as const, error: "No content extracted" };
    return { url, ok: true as const, title, markdown: md.slice(0, PER_URL_CHARS) };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { url, ok: false as const, error: msg };
  } finally {
    clearTimeout(timer);
  }
}

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = (await request.json()) as Body;
        if (!Array.isArray(body.messages)) {
          return new Response("messages required", { status: 400 });
        }
        const model = body.model && ALLOWED.has(body.model) ? body.model : "openai/gpt-5.5";
        const key = process.env.LOVABLE_API_KEY;
        if (!key) return new Response("Missing LOVABLE_API_KEY", { status: 500 });

        const COMPARISON_RULES = `\n\nSTRUCTURED COMPARISON RULES (MANDATORY when the user asks to compare two or more subjects — items, tools, concepts, products, options, etc.):\n1. Brief Overview: Start with a 1-2 sentence intro defining the subjects being compared.\n2. Side-by-Side Comparison Table: Render a proper Markdown table comparing the subjects across relevant, objective criteria (Features, Performance, Cost, Ease of Use, etc.). Use \`|\` pipes and a header separator row so it renders as a real table.\n3. Detailed Breakdown: Use H3 sub-headings (### ) with bullet points covering:\n   - Pros and Cons for each subject\n   - Key Features exclusive to each\n4. Final Verdict / Recommendation: End with a clear, practical recommendation stating which option suits which use case (e.g., "Choose X if you need…, choose Y if your priority is…").\nDo NOT respond to comparison requests with long unstructured paragraphs. Always follow this format.`;
        const LANGUAGE_RULES = `\n\nLANGUAGE MATCHING (MANDATORY):\n- Detect the language and script of the user's most recent message.\n- If the user writes in Urdu script (اردو), reply in fluent Urdu using Urdu script.\n- If the user writes in Roman Urdu (Urdu/Hindi words written with Latin letters, e.g. "ye kaam nhi kar rha", "mujhe batao", "kya haal hai"), reply in the SAME Roman Urdu style — natural, conversational, using Latin letters. Do NOT switch to Urdu script and do NOT reply in formal English unless the user explicitly asks.\n- If the user writes in English, reply in English.\n- If the user mixes languages, mirror their mix.\n- Understand common Roman Urdu spellings and abbreviations (nhi = nahi, kar rha = kar raha, kiya = kya, wagera = waghera, isko set karo = fix this, kaam = work, etc.).`;

        // URL detection → split YouTube vs other URLs
        let urlContext = "";
        let videoContext = "";
        const fcKey = process.env.FIRECRAWL_API_KEY;
        const latestText = extractLatestUserText(body.messages);
        const allUrls = extractUrls(latestText);

        const ytEntries: Array<{ url: string; videoId: string }> = [];
        const otherUrls: string[] = [];
        for (const u of allUrls) {
          const vid = extractYouTubeId(u);
          if (vid) ytEntries.push({ url: u, videoId: vid });
          else otherUrls.push(u);
        }

        // YouTube transcripts → Video Analyst context
        if (ytEntries.length > 0) {
          const results = await Promise.all(
            ytEntries.map(async (e) => ({ ...e, res: await fetchYouTubeTranscriptWithLimit(e.videoId) })),
          );
          const blocks: string[] = [];
          let anyOk = false;
          results.forEach((r, i) => {
            const n = i + 1;
            if (r.res.ok) {
              anyOk = true;
              const trunc = r.res.truncated ? "\n[transcript truncated for length]" : "";
              blocks.push(
                `--- VIDEO [${n}]\nURL: ${r.url}\nVideo ID: ${r.videoId}\n\nTRANSCRIPT (with timestamps):\n${r.res.transcript}${trunc}`,
              );
            } else {
              blocks.push(
                `--- VIDEO [${n}]\nURL: ${r.url}\n(Transcript unavailable: ${r.res.error})`,
              );
            }
          });
          if (anyOk) {
            videoContext = `\n\nYOU ARE A "VIDEO ANALYST".\nThe user shared ${ytEntries.length} YouTube video(s). The closed-caption transcript(s) below are the ONLY authoritative source for answering questions about the video(s).\n\n${blocks.join("\n\n")}\n\nRULES FOR VIDEO-BASED ANSWERS:\n- Answer strictly from the transcript above. Do not use outside knowledge about the video, channel, or creator.\n- Cite the video as [n] matching the VIDEO numbers when referencing content.\n- Include rough timestamps (from the [mm:ss] or [h:mm:ss] markers) when quoting or summarizing a specific moment.\n- If the user asks for a summary, produce: (a) a 2-3 sentence Overview, (b) 5-8 "Key Takeaways" bullets, each with a rough timestamp, (c) a short "Conclusion" line.\n- If the transcript does not cover the user's question, say so explicitly instead of guessing.\n- Never invent quotes, statistics, or facts that are not present in the transcript.`;
          } else {
            // All YT transcripts failed → return friendly UI error immediately.
            return new Response(
              "Sorry, I couldn't fetch the transcript for this video. It might not have closed captions enabled.",
              { status: 200, headers: { "Content-Type": "text/plain" } },
            );
          }
        }

        // Firecrawl for remaining non-YouTube URLs
        if (otherUrls.length > 0 && fcKey) {
          const scraped = await Promise.all(otherUrls.map((u) => firecrawlScrape(fcKey, u)));
          const blocks: string[] = [];
          scraped.forEach((s, i) => {
            const n = i + 1;
            if (s.ok) {
              blocks.push(`--- SOURCE [${n}] ${s.title || s.url}\nURL: ${s.url}\n\n${s.markdown}`);
            } else {
              blocks.push(`--- SOURCE [${n}] ${s.url}\n(Failed to scrape: ${s.error})`);
            }
          });
          urlContext = `\n\nURL CONTEXT (scraped from the user-provided links; treat as the authoritative source and answer STRICTLY from this content — if the answer is not present, say so explicitly instead of guessing):\n\n${blocks.join("\n\n")}\n\nRULES FOR URL-BASED ANSWERS:\n- Base every factual claim strictly on the scraped SOURCE blocks above.\n- Cite the source inline as [n] matching the SOURCE numbers.\n- If the scraped content does not cover the user's question, say: "The provided page does not contain information about that."\n- Do not invent facts, statistics, or quotes that are not in the scraped text.`;
        } else if (otherUrls.length > 0 && !fcKey) {
          urlContext = `\n\nNOTE: The user provided ${otherUrls.length} URL(s) but the Firecrawl connector is not configured, so the pages could not be scraped. Ask the user to enable Firecrawl or paste the relevant text.`;
        }

        const sys = ((body.system?.trim() ?? "") + COMPARISON_RULES + videoContext + urlContext).trim();
        try {
          const { createLovableGateway } = await import("@/lib/ai-gateway.server");
          const gateway = createLovableGateway(key);
          const result = streamText({
            model: gateway(model),
            system: sys,
            messages: await convertToModelMessages(body.messages),
          });
          return result.toUIMessageStreamResponse({ originalMessages: body.messages });
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          return new Response(msg, { status: 500 });
        }
      },
    },
  },
});
