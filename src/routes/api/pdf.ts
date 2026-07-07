import { createFileRoute } from "@tanstack/react-router";
import type { PDFDocument, PDFFont } from "pdf-lib";

// Lazy-load pdf-lib inside the handler.
// Importing it at module scope causes the whole SSR entry to crash on
// Cloudflare Workers ("Cannot destructure property '__extends' of tslib.default")
// because the bundler emits a broken tslib default-interop shim.
type PdfLib = typeof import("pdf-lib");
let pdfLibPromise: Promise<PdfLib> | null = null;
const loadPdfLib = () => (pdfLibPromise ??= import("pdf-lib"));

type Body = { prompt?: string; model?: string; font?: string };

type Run = { text: string; bold?: boolean; italic?: boolean };
type Block =
  | { type: "h1" | "h2" | "h3"; text: string }
  | { type: "p"; runs: Run[] }
  | { type: "ul" | "ol"; items: string[] }
  | { type: "image"; prompt: string; caption?: string };

type Doc = { title: string; font?: string; blocks: Block[] };

function pickPdfModel(): string {
  return "openai/gpt-5-mini";
}

const SYSTEM = `You are an expert document layout assistant. Return ONLY a JSON object (no prose, no code fences) with this exact shape:
{
  "title": "Main document title",
  "font": "Helvetica" | "Times" | "Courier",
  "blocks": [
    {"type":"h2","text":"Section heading"},
    {"type":"h3","text":"Sub-section"},
    {"type":"p","runs":[{"text":"Normal "},{"text":"bold","bold":true},{"text":" and "},{"text":"italic","italic":true},{"text":" text."}]},
    {"type":"ul","items":["bullet one","bullet two"]},
    {"type":"ol","items":["step one","step two"]},
    {"type":"p","runs":[{"text":"Detailed explanatory text instead of generated images."}]}
  ]
}

Rules:
- Never emit raw markdown symbols (#, ##, **, *, _, -) in any text field. Convert emphasis into run.bold / run.italic.
- The document TITLE goes in the top-level "title" field ONLY — do NOT repeat it as an h1 block. Never use "h1" in blocks.
- Use h2 for major sections, h3 for sub-sections.
- Use ul for bullet lists, ol for numbered lists — never inline hyphens or "•".
- Split a paragraph into multiple runs whenever emphasis (bold/italic) changes.
- Do NOT include image blocks. Generate a complete text-only PDF so the request finishes reliably.
- Produce enough substantial content to fully answer the user's request; do not stop at a stub.
- Font mapping: Arial/Roboto/Helvetica/sans-serif → "Helvetica"; Times/"Times New Roman"/serif → "Times"; Courier/mono → "Courier".`;

function mapFont(name?: string): "Helvetica" | "Times" | "Courier" {
  const n = (name || "").toLowerCase();
  if (n.includes("times") || n.includes("serif")) return "Times";
  if (n.includes("courier") || n.includes("mono")) return "Courier";
  return "Helvetica";
}

async function callLLMJson(prompt: string, model: string, key: string): Promise<Doc> {
  const isOpenAI = model.startsWith("openai/");
  const body: Record<string, unknown> = {
    model,
    messages: [
      { role: "system", content: SYSTEM },
      { role: "user", content: prompt },
    ],
    response_format: { type: "json_object" },
  };
  if (isOpenAI) body.service_tier = "priority";
  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`LLM ${res.status}: ${await res.text()}`);
  const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const content = json.choices?.[0]?.message?.content ?? "";
  const cleaned = content.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  const parsed = JSON.parse(cleaned) as Doc;
  if (!parsed || !Array.isArray(parsed.blocks)) throw new Error("bad doc shape");
  return parsed;
}

async function pickFonts(pdf: PDFDocument, family: "Helvetica" | "Times" | "Courier") {
  const { StandardFonts } = await loadPdfLib();
  if (family === "Times") {
    return {
      regular: await pdf.embedFont(StandardFonts.TimesRoman),
      bold: await pdf.embedFont(StandardFonts.TimesRomanBold),
      italic: await pdf.embedFont(StandardFonts.TimesRomanItalic),
      boldItalic: await pdf.embedFont(StandardFonts.TimesRomanBoldItalic),
    };
  }
  if (family === "Courier") {
    return {
      regular: await pdf.embedFont(StandardFonts.Courier),
      bold: await pdf.embedFont(StandardFonts.CourierBold),
      italic: await pdf.embedFont(StandardFonts.CourierOblique),
      boldItalic: await pdf.embedFont(StandardFonts.CourierBoldOblique),
    };
  }
  return {
    regular: await pdf.embedFont(StandardFonts.Helvetica),
    bold: await pdf.embedFont(StandardFonts.HelveticaBold),
    italic: await pdf.embedFont(StandardFonts.HelveticaOblique),
    boldItalic: await pdf.embedFont(StandardFonts.HelveticaBoldOblique),
  };
}

// Sanitize text to Latin-1 (StandardFonts only support WinAnsi)
function clean(s: string): string {
  return s
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\u2026/g, "...")
    .replace(/\u00A0/g, " ")
    // eslint-disable-next-line no-control-regex
    .replace(/[^\x00-\xFF]/g, "?");
}

async function renderPdf(doc: Doc): Promise<Uint8Array> {
  const { PDFDocument, rgb } = await loadPdfLib();
  const pdf = await PDFDocument.create();
  const family = mapFont(doc.font);
  const fonts = await pickFonts(pdf, family);

  const PAGE_W = 612; // US Letter
  const PAGE_H = 792;
  const MARGIN = 54; // 0.75"
  const CONTENT_W = PAGE_W - MARGIN * 2;
  const black = rgb(0.08, 0.08, 0.1);
  const accent = rgb(0.34, 0.22, 0.82);

  // Typography — single-spaced with comfortable leading (~1.35x)
  const BODY_SIZE = 11;
  const BODY_LEADING = 15; // ~1.36x
  const PARA_GAP = 7;

  let page = pdf.addPage([PAGE_W, PAGE_H]);
  let y = PAGE_H - MARGIN;

  const ensureSpace = (needed: number) => {
    if (y - needed < MARGIN) {
      page = pdf.addPage([PAGE_W, PAGE_H]);
      y = PAGE_H - MARGIN;
    }
  };

  const wrap = (text: string, font: PDFFont, size: number, maxW: number): string[] => {
    const words = text.split(/\s+/).filter(Boolean);
    const lines: string[] = [];
    let line = "";
    for (const w of words) {
      const trial = line ? `${line} ${w}` : w;
      if (font.widthOfTextAtSize(trial, size) > maxW && line) {
        lines.push(line);
        line = w;
      } else line = trial;
    }
    if (line) lines.push(line);
    return lines;
  };

  const drawHeading = (text: string, size: number, leading: number, gapBefore: number, gapAfter: number) => {
    const f = fonts.bold;
    const lines = wrap(clean(text), f, size, CONTENT_W);
    ensureSpace(gapBefore + leading);
    y -= gapBefore;
    for (const line of lines) {
      ensureSpace(leading);
      page.drawText(line, { x: MARGIN, y: y - size, size, font: f, color: black });
      y -= leading;
    }
    y -= gapAfter;
  };

  // Title
  if (doc.title) {
    const f = fonts.bold;
    const size = 22;
    const leading = 28;
    const lines = wrap(clean(doc.title), f, size, CONTENT_W);
    for (const line of lines) {
      ensureSpace(leading);
      page.drawText(line, { x: MARGIN, y: y - size, size, font: f, color: accent });
      y -= leading;
    }
    y -= 6;
    ensureSpace(2);
    page.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE_W - MARGIN, y }, thickness: 0.8, color: accent });
    y -= 14;
  }

  const drawRuns = (runs: Run[], size = BODY_SIZE, leading = BODY_LEADING, indent = 0) => {
    const spaceW = fonts.regular.widthOfTextAtSize(" ", size);
    let cx = MARGIN + indent;
    ensureSpace(leading);
    let lineTop = y;
    const maxX = PAGE_W - MARGIN;
    for (const run of runs) {
      const font: PDFFont = run.bold && run.italic ? fonts.boldItalic
        : run.bold ? fonts.bold
        : run.italic ? fonts.italic
        : fonts.regular;
      const chunks = clean(run.text).split(/(\s+)/);
      for (const chunk of chunks) {
        if (!chunk) continue;
        if (/^\s+$/.test(chunk)) {
          // collapse any run of whitespace to a single space width
          if (cx > MARGIN + indent) cx += spaceW;
          continue;
        }
        const w = font.widthOfTextAtSize(chunk, size);
        if (cx + w > maxX && cx > MARGIN + indent) {
          y -= leading;
          ensureSpace(leading);
          lineTop = y;
          cx = MARGIN + indent;
        }
        page.drawText(chunk, { x: cx, y: lineTop - size, size, font, color: black });
        cx += w;
      }
    }
    y -= leading + PARA_GAP;
  };

  const drawImagePlaceholder = (block: Extract<Block, { type: "image" }>) => {
    const label = block.caption || block.prompt;
    if (label) drawRuns([{ text: `[Visual note: ${label}]`, italic: true }]);
  };

  for (const block of doc.blocks) {
    if (block.type === "h1") drawHeading(block.text, 18, 22, 10, 4);
    else if (block.type === "h2") drawHeading(block.text, 15, 19, 10, 3);
    else if (block.type === "h3") drawHeading(block.text, 12, 16, 8, 2);
    else if (block.type === "p") drawRuns(block.runs || []);
    else if (block.type === "ul") {
      for (const item of block.items || []) {
        ensureSpace(BODY_LEADING);
        page.drawText("•", { x: MARGIN + 4, y: y - BODY_SIZE, size: BODY_SIZE, font: fonts.regular, color: accent });
        drawRuns([{ text: item }], BODY_SIZE, BODY_LEADING, 16);
      }
    } else if (block.type === "ol") {
      let i = 1;
      for (const item of block.items || []) {
        ensureSpace(BODY_LEADING);
        page.drawText(`${i}.`, { x: MARGIN + 2, y: y - BODY_SIZE, size: BODY_SIZE, font: fonts.regular, color: accent });
        drawRuns([{ text: item }], BODY_SIZE, BODY_LEADING, 22);
        i++;
      }
    } else if (block.type === "image") {
      drawImagePlaceholder(block);
    }
  }

  return await pdf.save();
}

export const Route = createFileRoute("/api/pdf")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const { prompt, model, font } = (await request.json()) as Body;
          if (!prompt || !prompt.trim()) return new Response("prompt required", { status: 400 });
          const key = process.env.LOVABLE_API_KEY;
          if (!key) return new Response("Missing LOVABLE_API_KEY", { status: 500 });

          const chosenModel = pickPdfModel();
          const userPrompt = font
            ? `${prompt}\n\n(Preferred font family: ${font})`
            : prompt;

          const doc = await callLLMJson(userPrompt, chosenModel, key);
          if (font && !doc.font) doc.font = font;
          const bytes = await renderPdf(doc);
          const b64 = Buffer.from(bytes).toString("base64");
          const filename = (doc.title || "document")
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-+|-+$/g, "")
            .slice(0, 60) || "document";
          return Response.json({ b64_pdf: b64, mediaType: "application/pdf", filename: `${filename}.pdf`, title: doc.title });
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          return new Response(msg, { status: 500 });
        }
      },
    },
  },
});
