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

const MAX_SOURCES = 28;
const PER_SOURCE_CHARS = 4000;

type SearchHit = {
  url: string;
  title?: string;
  description?: string;
  markdown?: string;
  content?: string;
};

function extractLatestUserQuery(messages: UIMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role !== "user") continue;
    const parts = (m as unknown as { parts?: Array<{ type: string; text?: string }> }).parts;
    if (Array.isArray(parts)) {
      const text = parts.filter((p) => p.type === "text" && typeof p.text === "string").map((p) => p.text as string).join(" ").trim();
      if (text) return text;
    }
  }
  return "";
}

async function firecrawlSearch(apiKey: string, query: string): Promise<SearchHit[]> {
  const res = await fetch("https://api.firecrawl.dev/v2/search", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query,
      limit: MAX_SOURCES,
      scrapeOptions: {
        formats: ["markdown"],
        onlyMainContent: true,
      },
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Firecrawl search failed [${res.status}]: ${text}`);
  }
  const json = (await res.json()) as { data?: SearchHit[] | { web?: SearchHit[] } };
  const raw = json.data;
  const hits: SearchHit[] = Array.isArray(raw)
    ? raw
    : Array.isArray(raw?.web)
      ? (raw!.web as SearchHit[])
      : [];
  return hits.filter((h) => h && typeof h.url === "string");
}

function truncate(s: string, n: number) {
  if (!s) return "";
  return s.length <= n ? s : s.slice(0, n) + "…";
}

function hostOf(url: string) {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return url; }
}

function buildContextBlock(hits: SearchHit[]) {
  const lines: string[] = [];
  const refs: string[] = [];
  hits.forEach((h, i) => {
    const idx = i + 1;
    const host = hostOf(h.url);
    const title = (h.title || host).trim();
    const body = truncate((h.markdown || h.content || h.description || "").trim(), PER_SOURCE_CHARS);
    lines.push(`--- [${idx}] ${title} (${host}) ${h.url} ---\n${body || "(no extracted content)"}`);
    refs.push(`[${idx}] ${title} — ${h.url}`);
  });
  return { context: lines.join("\n\n"), refsList: refs.join("\n") };
}

const ACADEMIC_SYSTEM = `You are an Advanced Academic & Research AI. Absolute priority: highly accurate, comprehensive, evidence-based, objective information with the rigor of a senior university researcher.

STRICT RULES:
1. ZERO HALLUCINATION: Do NOT invent facts, numbers, dates, quotes, or case studies. If verified information for a specific aspect is missing from the provided sources, explicitly write: "I do not have sufficient verified information on this specific aspect."
2. CROSS-REFERENCING: Prefer claims corroborated across many sources. Flag or downweight claims found on only one low-authority source. Present balanced views when sources disagree.
3. IN-TEXT CITATIONS: Every substantive claim, statistic, or quote MUST end with numeric citations like [1], [3], [12] referencing the numbered sources in the provided context. Do not fabricate source numbers.
4. OBJECTIVE TONE: Formal, neutral, academic. No emotive language, no personal opinions, no conversational filler.
5. SOURCE ATTRIBUTION LOGIC: Where relevant, indicate the basis ("According to established principles in…", "Historical data from [n] indicates…").

MANDATORY REPORT STRUCTURE (use these exact H2 headings):
## Executive Summary
2–3 sentence overview of core findings.

## Detailed Analysis
Use H3 sub-headings for logical components. Use bullet/numbered lists to break down mechanisms, methodologies, and multiple perspectives. Every major claim carries [n] citations.

## Evidence & Examples
Support the analysis with established principles, historical precedents, or real-world case studies drawn ONLY from the provided sources, each with [n] citations.

## Conclusion
Logical wrap-up based strictly on the discussed evidence.

## References
Numbered list of the sources you actually cited, in the exact format: "[n] Title — URL". Only include sources that appear in the provided context.

You will be given a CONTEXT block with numbered web sources. Use ONLY that context plus well-established general knowledge. If the context is empty or unrelated, say so explicitly instead of guessing.`;

export const Route = createFileRoute("/api/research")({
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
        const fcKey = process.env.FIRECRAWL_API_KEY;
        if (!fcKey) {
          return new Response(
            "Deep Research requires the Firecrawl connector. Please connect Firecrawl from the Connectors panel and try again.",
            { status: 400 },
          );
        }

        const query = extractLatestUserQuery(body.messages);
        if (!query) return new Response("No user query found", { status: 400 });

        let hits: SearchHit[] = [];
        try {
          hits = await firecrawlSearch(fcKey, query);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          return new Response(`Web research failed: ${msg}`, { status: 502 });
        }

        const { context, refsList } = buildContextBlock(hits);
        const sourceCount = hits.length;

        const researchSystem = `${ACADEMIC_SYSTEM}

USER QUERY: ${query}

NUMBER OF SOURCES ANALYZED: ${sourceCount}

CONTEXT (numbered web sources — cite as [n]):
${context || "(no sources returned)"}

REFERENCE LIST (must appear verbatim under the References heading, keeping only the sources you actually cited):
${refsList}

Extra user system prompt (may be empty):
${(body.system ?? "").trim()}`;

        try {
          const { createLovableGateway } = await import("@/lib/ai-gateway.server");
          const gateway = createLovableGateway(key);
          const result = streamText({
            model: gateway(model),
            system: researchSystem,
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
