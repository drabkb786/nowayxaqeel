import { createFileRoute } from "@tanstack/react-router";
import { convertToModelMessages, streamText, type UIMessage } from "ai";
import { createLovableGateway } from "@/lib/ai-gateway.server";

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

        const gateway = createLovableGateway(key);
        const COMPARISON_RULES = `\n\nSTRUCTURED COMPARISON RULES (MANDATORY when the user asks to compare two or more subjects — items, tools, concepts, products, options, etc.):\n1. Brief Overview: Start with a 1-2 sentence intro defining the subjects being compared.\n2. Side-by-Side Comparison Table: Render a proper Markdown table comparing the subjects across relevant, objective criteria (Features, Performance, Cost, Ease of Use, etc.). Use \`|\` pipes and a header separator row so it renders as a real table.\n3. Detailed Breakdown: Use H3 sub-headings (### ) with bullet points covering:\n   - Pros and Cons for each subject\n   - Key Features exclusive to each\n4. Final Verdict / Recommendation: End with a clear, practical recommendation stating which option suits which use case (e.g., "Choose X if you need…, choose Y if your priority is…").\nDo NOT respond to comparison requests with long unstructured paragraphs. Always follow this format.`;
        const sys = ((body.system?.trim() ?? "") + COMPARISON_RULES).trim();
        try {
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
