import { createFileRoute } from "@tanstack/react-router";

type Body = { prompt?: string; model?: string };

const ALLOWED = new Set([
  "google/gemini-3-pro-image",
  "google/gemini-3.1-flash-image",
  "google/gemini-2.5-flash-image",
  "openai/gpt-image-2",
  "openai/gpt-image-1-mini",
]);

export const Route = createFileRoute("/api/image")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { prompt, model } = (await request.json()) as Body;
        if (!prompt || !prompt.trim()) {
          return new Response("prompt required", { status: 400 });
        }
        const key = process.env.LOVABLE_API_KEY;
        if (!key) return new Response("Missing LOVABLE_API_KEY", { status: 500 });

        const chosen = model && ALLOWED.has(model) ? model : "google/gemini-3-pro-image";

        const body = chosen.startsWith("openai/")
          ? { model: chosen, prompt, n: 1, size: "1024x1024" }
          : {
              model: chosen,
              messages: [{ role: "user", content: prompt }],
              modalities: ["image", "text"],
            };

        const res = await fetch("https://ai.gateway.lovable.dev/v1/images/generations", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${key}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
        });

        if (!res.ok) {
          const text = await res.text().catch(() => "");
          return new Response(text || "image generation failed", { status: res.status });
        }
        const json = (await res.json()) as { data?: Array<{ b64_json?: string }> };
        const b64 = json.data?.[0]?.b64_json;
        if (!b64) return new Response("no image returned", { status: 502 });
        return Response.json({ b64_json: b64, mediaType: "image/png" });
      },
    },
  },
});
