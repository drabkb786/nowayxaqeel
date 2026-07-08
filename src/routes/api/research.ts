import { createFileRoute } from "@tanstack/react-router";
import type { UIMessage } from "ai";

type Body = {
  messages?: UIMessage[];
  model?: string;
  system?: string;
};

const FALLBACK_MESSAGE =
  "Unable to retrieve verified internet data for this query at the moment.";

function extractLatestUserQuery(messages: UIMessage[]): string {
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

function extractPriorTurns(messages: UIMessage[]): Array<{ role: "user" | "assistant"; content: string }> {
  const out: Array<{ role: "user" | "assistant"; content: string }> = [];
  for (const m of messages) {
    if (m.role !== "user" && m.role !== "assistant") continue;
    const parts = (m as unknown as { parts?: Array<{ type: string; text?: string }> }).parts;
    if (!Array.isArray(parts)) continue;
    const text = parts
      .filter((p) => p.type === "text" && typeof p.text === "string")
      .map((p) => p.text as string)
      .join(" ")
      .trim();
    if (text) out.push({ role: m.role, content: text });
  }
  return out;
}

const ACADEMIC_SYSTEM = `You are an Advanced Academic & Research AI powered by real-time multi-source web search. Deliver highly accurate, evidence-based, objective analysis with the rigor of a senior university researcher.

STRICT RULES:
1. DEEP RESEARCH DEPTH: Investigate the query across AT LEAST 25 distinct, high-quality web sources (target 25–30). Prefer authoritative outlets: peer-reviewed papers, government/official statistics, reputable news, established industry reports, and well-known expert sites. Avoid low-quality blogs, SEO farms, and duplicate mirrors.
2. ZERO HALLUCINATION: Never invent facts, statistics, dates, or quotes. If the searched sources do not contain verified information on a specific aspect, explicitly write: "I do not have sufficient verified information on this specific aspect."
3. MULTI-SOURCE SYNTHESIS: Cross-reference claims across the retrieved sources. Prefer claims corroborated by multiple sources; flag conflicting or single-source claims.
4. IN-TEXT NUMERIC CITATIONS: Every substantive claim, statistic, or quote MUST end with numeric citations like [1], [3], [12] that map to the search citations. Do not fabricate citation numbers. Cite widely — at least 25 unique citation numbers should appear across the report.
5. OBJECTIVE TONE: Formal, neutral, academic. No emotive language, no personal opinions, no filler.
6. LENGTH: Produce a thorough long-form report (typically 1500–3000 words) that fully exploits the depth of the retrieved sources.

MANDATORY REPORT STRUCTURE (use these exact H2 headings):
## Executive Summary
3–5 sentences summarizing the core verified findings.

## Detailed Multi-Point Analysis
Use H3 sub-headings for each logical component of the topic. Break down mechanisms, methodologies, statistics, historical context, and multiple perspectives with bulleted or numbered lists. Every major claim carries [n] citations.

## Evidence & Examples
Real-world case studies, historical precedents, datasets, or established principles drawn strictly from the retrieved sources, each with [n] citations.

## Conflicting Views & Limitations
Highlight where sources disagree, note data gaps, and call out unresolved debates.

## Conclusion
Logical wrap-up grounded strictly in the discussed evidence.

## References
Numbered list of ALL sources actually cited (aim for 25–30), in the exact format: "[n] Title — URL". Use ONLY the citations returned by the search; do not invent URLs.`;

export const Route = createFileRoute("/api/research")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let body: Body;
        try {
          body = (await request.json()) as Body;
        } catch {
          return new Response("Invalid JSON body", { status: 400 });
        }
        if (!Array.isArray(body.messages)) {
          return new Response("messages required", { status: 400 });
        }

        const apiKey = process.env.LOVABLE_API_KEY;
        if (!apiKey) {
          return new Response(
            "Deep Research is not configured on this project.",
            { status: 500 },
          );
        }

        const query = extractLatestUserQuery(body.messages);
        if (!query) return new Response("No user query found", { status: 400 });

        const history = extractPriorTurns(body.messages);
        const extraSystem = (body.system ?? "").trim();
        const systemPrompt = extraSystem
          ? `${ACADEMIC_SYSTEM}\n\nAdditional user instructions:\n${extraSystem}`
          : ACADEMIC_SYSTEM;

        const messages = [
          { role: "system", content: systemPrompt },
          ...history,
        ];

        if (messages[messages.length - 1]?.role !== "user") {
          messages.push({ role: "user", content: query });
        }

        try {
          const geminiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${apiKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: "google/gemini-2.5-pro",
              messages,
              temperature: 0.2,
              max_tokens: 8000,
              // OpenRouter web-search plugin — grounds Gemini with live web results and annotations.
              plugins: [{ id: "web", max_results: 30 }],
            }),
          });

          if (!geminiRes.ok) {
            const errText = await geminiRes.text();
            console.error(`Gemini deep-research failed [${geminiRes.status}]: ${errText}`);
            return uiFallback(`${FALLBACK_MESSAGE} (${geminiRes.status})`);
          }

          const json = (await geminiRes.json()) as {
            choices?: Array<{
              message?: {
                content?: string;
                annotations?: Array<{
                  type?: string;
                  url_citation?: { url?: string; title?: string };
                }>;
              };
            }>;
          };

          let content = json.choices?.[0]?.message?.content?.trim() ?? "";
          if (!content) return uiFallback(FALLBACK_MESSAGE);

          const annotations = json.choices?.[0]?.message?.annotations ?? [];
          const cites = annotations
            .filter((a) => a?.type === "url_citation" && a.url_citation?.url)
            .map((a) => ({ url: a.url_citation!.url!, title: a.url_citation!.title || "" }));

          if (!/##\s*References/i.test(content) && cites.length) {
            const refs = cites.map(
              (c, i) => `[${i + 1}] ${c.title || safeHost(c.url)} — ${c.url}`,
            );
            content += `\n\n## References\n${refs.join("\n")}`;
          }

          return uiStreamResponse(content);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error("Gemini deep-research request error:", msg);
          return uiFallback(FALLBACK_MESSAGE);
        }
      },
    },
  },
});

function safeHost(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/**
 * Emit a UI Message Stream compatible response so `useChat`/`DefaultChatTransport`
 * can render the assistant reply exactly like the /api/chat endpoint.
 */
function uiStreamResponse(text: string): Response {
  const messageId = `msg_${Date.now().toString(36)}`;
  const partId = `part_${Date.now().toString(36)}`;
  const encoder = new TextEncoder();

  const events = [
    { type: "start", messageId },
    { type: "start-step" },
    { type: "text-start", id: partId },
    { type: "text-delta", id: partId, delta: text },
    { type: "text-end", id: partId },
    { type: "finish-step" },
    { type: "finish" },
  ];

  const stream = new ReadableStream({
    start(controller) {
      for (const ev of events) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(ev)}\n\n`));
      }
      controller.enqueue(encoder.encode(`data: [DONE]\n\n`));
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "x-vercel-ai-ui-message-stream": "v1",
    },
  });
}

function uiFallback(text: string): Response {
  return uiStreamResponse(text);
}
