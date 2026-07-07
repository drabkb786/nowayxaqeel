import { createFileRoute } from "@tanstack/react-router";
import { PDFDocument, StandardFonts, rgb, type PDFFont } from "pdf-lib";

type Body = { prompt?: string; model?: string; font?: string };

type Run = { text: string; bold?: boolean; italic?: boolean };
type Block =
  | { type: "h1" | "h2" | "h3"; text: string }
  | { type: "p"; runs: Run[] }
  | { type: "ul" | "ol"; items: string[] };

type Doc = { title: string; font?: string; blocks: Block[] };

const SYSTEM = `You are an expert document layout assistant. Return ONLY a JSON object (no prose, no code fences) with this exact shape:
{
  "title": "Main document title",
  "font": "Helvetica" | "Times" | "Courier",
  "blocks": [
    {"type":"h1","text":"..."},
    {"type":"h2","text":"..."},
    {"type":"h3","text":"..."},
    {"type":"p","runs":[{"text":"...","bold":true},{"text":"..."},{"text":"...","italic":true}]},
    {"type":"ul","items":["...","..."]},
    {"type":"ol","items":["...","..."]}
  ]
}

Rules:
- Never include raw markdown (#, ##, **, *, _). Convert emphasis into run.bold / run.italic.
- Use h1 ONCE for the document title area (or set title only; h1 optional in blocks).
- Use h2 for major sections, h3 for sub-sections.
- Use ul for bullet lists, ol for numbered lists — never hyphens in paragraphs.
- Split paragraphs into runs when emphasis changes.
- Keep it professional and cleanly structured for the requested topic.
- If user asks for a specific font (Arial, Roboto, Times New Roman, Courier), map:
  Arial/Roboto/Helvetica → "Helvetica"; Times/"Times New Roman"/serif → "Times"; Courier/mono → "Courier".`;

function mapFont(name?: string): "Helvetica" | "Times" | "Courier" {
  const n = (name || "").toLowerCase();
  if (n.includes("times") || n.includes("serif")) return "Times";
  if (n.includes("courier") || n.includes("mono")) return "Courier";
  return "Helvetica";
}

async function callLLMJson(prompt: string, model: string, key: string): Promise<Doc> {
  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: prompt },
      ],
      response_format: { type: "json_object" },
    }),
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
  const pdf = await PDFDocument.create();
  const family = mapFont(doc.font);
  const fonts = await pickFonts(pdf, family);

  const PAGE_W = 612; // US Letter
  const PAGE_H = 792;
  const MARGIN = 54; // 0.75"
  const CONTENT_W = PAGE_W - MARGIN * 2;
  const black = rgb(0.08, 0.08, 0.1);
  const accent = rgb(0.34, 0.22, 0.82);

  let page = pdf.addPage([PAGE_W, PAGE_H]);
  let y = PAGE_H - MARGIN;

  const ensureSpace = (needed: number) => {
    if (y - needed < MARGIN) {
      page = pdf.addPage([PAGE_W, PAGE_H]);
      y = PAGE_H - MARGIN;
    }
  };

  const wrap = (text: string, font: PDFFont, size: number, maxW: number): string[] => {
    const words = text.split(/\s+/);
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

  const drawHeading = (text: string, size: number, gapBefore: number, gapAfter: number) => {
    const f = fonts.bold;
    const lines = wrap(clean(text), f, size, CONTENT_W);
    ensureSpace(gapBefore + size + 4);
    y -= gapBefore;
    for (const line of lines) {
      ensureSpace(size + 4);
      page.drawText(line, { x: MARGIN, y: y - size, size, font: f, color: black });
      y -= size + 4;
    }
    y -= gapAfter;
  };

  // Title
  if (doc.title) {
    const f = await fonts.bold;
    const size = 22;
    const lines = wrap(clean(doc.title), f, size, CONTENT_W);
    for (const line of lines) {
      ensureSpace(size + 6);
      page.drawText(line, { x: MARGIN, y: y - size, size, font: f, color: accent });
      y -= size + 6;
    }
    y -= 10;
    ensureSpace(2);
    page.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE_W - MARGIN, y }, thickness: 0.8, color: accent });
    y -= 14;
  }

  const drawRuns = async (runs: Run[], size = 11, indent = 0) => {
    const spaceW = (await fonts.regular).widthOfTextAtSize(" ", size);
    let cx = MARGIN + indent;
    ensureSpace(size + 4);
    let lineTop = y;
    const maxX = PAGE_W - MARGIN;
    for (const run of runs) {
      const font = await (run.bold && run.italic ? fonts.boldItalic
        : run.bold ? fonts.bold
        : run.italic ? fonts.italic
        : fonts.regular);
      const words = clean(run.text).split(/(\s+)/);
      for (const chunk of words) {
        if (!chunk) continue;
        if (/^\s+$/.test(chunk)) {
          cx += spaceW;
          continue;
        }
        const w = font.widthOfTextAtSize(chunk, size);
        if (cx + w > maxX) {
          y -= size + 4;
          ensureSpace(size + 4);
          lineTop = y;
          cx = MARGIN + indent;
        }
        page.drawText(chunk, { x: cx, y: lineTop - size, size, font, color: black });
        cx += w;
      }
    }
    y -= size + 8;
  };

  for (const block of doc.blocks) {
    if (block.type === "h1") await drawHeading(block.text, 20, 12, 6);
    else if (block.type === "h2") await drawHeading(block.text, 16, 10, 4);
    else if (block.type === "h3") await drawHeading(block.text, 13, 8, 3);
    else if (block.type === "p") await drawRuns(block.runs || [], 11, 0);
    else if (block.type === "ul") {
      for (const item of block.items || []) {
        ensureSpace(16);
        const f = await fonts.regular;
        page.drawText("•", { x: MARGIN, y: y - 11, size: 11, font: f, color: accent });
        await drawRuns([{ text: item }], 11, 16);
      }
      y -= 4;
    } else if (block.type === "ol") {
      let i = 1;
      for (const item of block.items || []) {
        ensureSpace(16);
        const f = await fonts.regular;
        page.drawText(`${i}.`, { x: MARGIN, y: y - 11, size: 11, font: f, color: accent });
        await drawRuns([{ text: item }], 11, 22);
        i++;
      }
      y -= 4;
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

          const chosenModel = model || "openai/gpt-5.5";
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
