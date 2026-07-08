import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/transcribe")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const key = process.env.LOVABLE_API_KEY;
        if (!key) return new Response("Missing LOVABLE_API_KEY", { status: 500 });

        const ct = request.headers.get("content-type") ?? "";
        if (!ct.toLowerCase().includes("multipart/form-data")) {
          return new Response("multipart/form-data required", { status: 400 });
        }

        const form = await request.formData();
        const file = form.get("file");
        const wantStream = String(form.get("stream") ?? "") === "true";
        if (!(file instanceof Blob) || file.size === 0) {
          return new Response("Empty or missing audio file", { status: 400 });
        }
        if (file.size < 1024) {
          return new Response("Recording too short — please try again.", { status: 400 });
        }

        const mime = (file.type || "").split(";")[0].toLowerCase();
        const extMap: Record<string, string> = {
          "audio/webm": "webm",
          "audio/mp4": "mp4",
          "audio/mpeg": "mp3",
          "audio/mp3": "mp3",
          "audio/wav": "wav",
          "audio/x-wav": "wav",
          "audio/ogg": "ogg",
        };
        const ext = extMap[mime] ?? "webm";

        const upstream = new FormData();
        upstream.append("model", "openai/gpt-4o-transcribe");
        upstream.append("file", file, `recording.${ext}`);
        if (wantStream) upstream.append("stream", "true");

        try {
          const res = await fetch("https://ai.gateway.lovable.dev/v1/audio/transcriptions", {
            method: "POST",
            headers: { Authorization: `Bearer ${key}` },
            body: upstream,
          });

          if (!res.ok) {
            const text = await res.text().catch(() => "");
            return new Response(text || `Transcription failed: ${res.status}`, { status: res.status });
          }

          if (wantStream && res.body) {
            return new Response(res.body, {
              headers: {
                "Content-Type": "text/event-stream",
                "Cache-Control": "no-cache, no-transform",
                "Connection": "keep-alive",
              },
            });
          }

          const text = await res.text();
          try {
            const json = JSON.parse(text) as { text?: string };
            return new Response(JSON.stringify({ text: json.text ?? "" }), {
              headers: { "Content-Type": "application/json" },
            });
          } catch {
            return new Response(JSON.stringify({ text }), {
              headers: { "Content-Type": "application/json" },
            });
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          return new Response(msg, { status: 500 });
        }
      },
    },
  },
});
