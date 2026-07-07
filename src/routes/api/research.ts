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

        const apiKey = process.env.PERPLEXITY_API_KEY;
        if (!apiKey) {
          return new Response(
            "Deep Research requires a Perplexity API key. Please add PERPLEXITY_API_KEY and try again.",
            { status: 400 },
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

        // Ensure the last message is the user's current query
        if (messages[messages.length - 1]?.role !== "user") {
          messages.push({ role: "user", content: query });
        }

        try {
          const pplxRes = await fetch("https://api.perplexity.ai/chat/completions", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${apiKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: "sonar-pro",
              messages,
              temperature: 0.2,
              max_tokens: 4000,
              return_citations: true,
              search_context_size: "high",
            }),
          });

          if (!pplxRes.ok) {
            const errText = await pplxRes.text();
            console.error(`Perplexity failed [${pplxRes.status}]: ${errText}`);
            return uiFallback(FALLBACK_MESSAGE);
          }

          const json = (await pplxRes.json()) as {
            choices?: Array<{ message?: { content?: string } }>;
            citations?: string[];
            search_results?: Array<{ title?: string; url?: string }>;
          };

          let content = json.choices?.[0]?.message?.content?.trim() ?? "";
          if (!content) return uiFallback(FALLBACK_MESSAGE);

          const citations = json.citations ?? [];
          const results = json.search_results ?? [];

          // If model didn't include a References section, append one from citations
          if (!/##\s*References/i.test(content) && (citations.length || results.length)) {
            const refs = citations.length
              ? citations.map((url, i) => {
                  const match = results[i];
                  const title = match?.title || safeHost(url);
                  return `[${i + 1}] ${title} — ${url}`;
                })
              : results.map((r, i) => `[${i + 1}] ${r.title || safeHost(r.url || "")} — ${r.url || ""}`);
            content += `\n\n## References\n${refs.join("\n")}`;
          }

          return uiStreamResponse(content);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error("Perplexity request error:", msg);
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
