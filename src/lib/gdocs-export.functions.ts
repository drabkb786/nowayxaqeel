import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const GATEWAY = "https://connector-gateway.lovable.dev/google_docs/v1";

type Req = Record<string, unknown>;

interface Segment {
  text: string;
  bold?: boolean;
  italic?: boolean;
}

// Parse a line for **bold** and *italic* segments
function parseInline(line: string): Segment[] {
  const out: Segment[] = [];
  const re = /(\*\*([^*]+)\*\*|\*([^*]+)\*|__([^_]+)__|_([^_]+)_)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(line)) !== null) {
    if (m.index > last) out.push({ text: line.slice(last, m.index) });
    if (m[2] || m[4]) out.push({ text: m[2] ?? m[4]!, bold: true });
    else if (m[3] || m[5]) out.push({ text: m[3] ?? m[5]!, italic: true });
    last = m.index + m[0].length;
  }
  if (last < line.length) out.push({ text: line.slice(last) });
  return out.length ? out : [{ text: line }];
}

interface Block {
  kind: "title" | "h1" | "h2" | "h3" | "h4" | "para" | "bullet" | "numbered";
  segs: Segment[];
}

function parseMarkdown(md: string, docHasTitle: boolean): Block[] {
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  const blocks: Block[] = [];
  let sawTitle = docHasTitle;
  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!line.trim()) continue;
    // strip inline code backticks (keep text)
    const clean = line.replace(/`([^`]+)`/g, "$1");
    let mHead = /^(#{1,6})\s+(.*)$/.exec(clean);
    if (mHead) {
      const level = mHead[1].length;
      const text = mHead[2].trim();
      if (level === 1 && !sawTitle) {
        blocks.push({ kind: "title", segs: parseInline(text) });
        sawTitle = true;
        continue;
      }
      const kind = level === 1 ? "h1" : level === 2 ? "h2" : level === 3 ? "h3" : "h4";
      blocks.push({ kind, segs: parseInline(text) });
      continue;
    }
    let mBul = /^\s*[-*+]\s+(.*)$/.exec(clean);
    if (mBul) {
      blocks.push({ kind: "bullet", segs: parseInline(mBul[1]) });
      continue;
    }
    let mNum = /^\s*\d+\.\s+(.*)$/.exec(clean);
    if (mNum) {
      blocks.push({ kind: "numbered", segs: parseInline(mNum[1]) });
      continue;
    }
    blocks.push({ kind: "para", segs: parseInline(clean) });
  }
  return blocks;
}

function buildRequests(blocks: Block[]): { requests: Req[]; title?: string } {
  const requests: Req[] = [];
  let index = 1;
  const styleOps: Req[] = [];
  const paraOps: Req[] = [];
  const bulletRanges: Array<{ start: number; end: number; kind: "bullet" | "numbered" }> = [];
  let title: string | undefined;

  for (const b of blocks) {
    const fullText = b.segs.map((s) => s.text).join("");
    if (!fullText) continue;
    const paraStart = index;
    // insert text + newline
    requests.push({
      insertText: { location: { index }, text: fullText + "\n" },
    });
    // per-segment bold/italic
    let cursor = index;
    for (const seg of b.segs) {
      const segStart = cursor;
      const segEnd = cursor + seg.text.length;
      if (seg.bold || seg.italic) {
        const textStyle: Record<string, boolean> = {};
        const fields: string[] = [];
        if (seg.bold) { textStyle.bold = true; fields.push("bold"); }
        if (seg.italic) { textStyle.italic = true; fields.push("italic"); }
        styleOps.push({
          updateTextStyle: {
            range: { startIndex: segStart, endIndex: segEnd },
            textStyle,
            fields: fields.join(","),
          },
        });
      }
      cursor = segEnd;
    }
    const paraEnd = index + fullText.length + 1; // include newline
    if (b.kind === "title") {
      title = fullText;
      paraOps.push({
        updateParagraphStyle: {
          range: { startIndex: paraStart, endIndex: paraEnd },
          paragraphStyle: { namedStyleType: "TITLE" },
          fields: "namedStyleType",
        },
      });
    } else if (b.kind === "h1" || b.kind === "h2" || b.kind === "h3" || b.kind === "h4") {
      const lvl = b.kind.slice(1);
      paraOps.push({
        updateParagraphStyle: {
          range: { startIndex: paraStart, endIndex: paraEnd },
          paragraphStyle: { namedStyleType: `HEADING_${lvl}` },
          fields: "namedStyleType",
        },
      });
    } else if (b.kind === "bullet" || b.kind === "numbered") {
      bulletRanges.push({ start: paraStart, end: paraEnd, kind: b.kind });
    } else {
      paraOps.push({
        updateParagraphStyle: {
          range: { startIndex: paraStart, endIndex: paraEnd },
          paragraphStyle: { namedStyleType: "NORMAL_TEXT" },
          fields: "namedStyleType",
        },
      });
    }
    index = paraEnd;
  }

  // Append style ops after all inserts so ranges remain valid
  requests.push(...styleOps, ...paraOps);
  for (const r of bulletRanges) {
    requests.push({
      createParagraphBullets: {
        range: { startIndex: r.start, endIndex: r.end },
        bulletPreset: r.kind === "bullet" ? "BULLET_DISC_CIRCLE_SQUARE" : "NUMBERED_DECIMAL_ALPHA_ROMAN",
      },
    });
  }
  return { requests, title };
}

async function gwFetch(path: string, init: RequestInit = {}) {
  const lovableKey = process.env.LOVABLE_API_KEY;
  const connKey = process.env.GOOGLE_DOCS_API_KEY;
  if (!lovableKey || !connKey) {
    throw new Error("Google Docs connector not configured.");
  }
  const res = await fetch(`${GATEWAY}${path}`, {
    ...init,
    headers: {
      "Authorization": `Bearer ${lovableKey}`,
      "X-Connection-Api-Key": connKey,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const text = await res.text();
  if (!res.ok) {
    console.error(`Google Docs gateway ${res.status}: ${text}`);
    throw new Error(`Google Docs API failed [${res.status}]: ${text.slice(0, 500)}`);
  }
  return text ? JSON.parse(text) : {};
}

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
  .handler(async ({ data }) => {
    const blocks = parseMarkdown(data.markdown, Boolean(data.title));
    const { requests, title: parsedTitle } = buildRequests(blocks);
    const docTitle =
      (data.title && data.title.trim()) ||
      parsedTitle ||
      `Research — ${new Date().toLocaleString()}`;

    const created = await gwFetch("/documents", {
      method: "POST",
      body: JSON.stringify({ title: docTitle }),
    });
    const documentId = created.documentId as string;
    if (!documentId) throw new Error("Google Docs API did not return a documentId.");

    if (requests.length) {
      await gwFetch(`/documents/${documentId}:batchUpdate`, {
        method: "POST",
        body: JSON.stringify({ requests }),
      });
    }

    return {
      documentId,
      title: docTitle,
      url: `https://docs.google.com/document/d/${documentId}/edit`,
    };
  });
