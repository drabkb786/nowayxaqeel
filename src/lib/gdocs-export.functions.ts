import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { exportMarkdownToGoogleDocs } from "./gdocs-export.server";

export const exportToGoogleDocs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { markdown: string; title?: string }) => {
    if (!input || typeof input.markdown !== "string" || !input.markdown.trim()) {
      throw new Error("Missing markdown content.");
    }
    return {
      markdown: input.markdown.slice(0, 100_000),
      title: (input.title ?? "").slice(0, 200),
    };
  })
  .handler(async ({ data }) => exportMarkdownToGoogleDocs(data));
