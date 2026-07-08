import { createFileRoute } from "@tanstack/react-router";
import type { PDFDocument, PDFFont, PDFPage, RGB } from "pdf-lib";

// Lazy-load pdf-lib inside the handler (tslib default-interop crash on Workers).
type PdfLib = typeof import("pdf-lib");
let pdfLibPromise: Promise<PdfLib> | null = null;
const loadPdfLib = () => (pdfLibPromise ??= import("pdf-lib"));

type Body = { prompt?: string; model?: string; font?: string };

type Run = { text: string; bold?: boolean; italic?: boolean };
type CalloutVariant = "info" | "success" | "warning" | "danger";
type Block =
  | { type: "h2" | "h3"; text: string }
  | { type: "p"; runs: Run[] }
  | { type: "ul" | "ol"; items: string[] }
  | { type: "callout"; variant: CalloutVariant; title?: string; text: string }
  | { type: "keytakeaways"; items: string[] }
  | { type: "table"; headers: string[]; rows: string[][] }
  | { type: "quote"; text: string; attribution?: string }
  | { type: "image"; prompt: string; caption?: string }
  | { type: "divider" }
  | { type: "references"; items: string[] };

type Doc = {
  title: string;
  subtitle?: string;
  font?: string;
  blocks: Block[];
};

function pickPdfModel(): string {
  // Faster than gpt-5-mini; two sequential calls + image generations must
  // fit within the Worker's wall-clock budget, so speed matters more than
  // marginal quality gains here.
  return "google/gemini-2.5-flash";
}

async function fetchWithTimeout(url: string, init: RequestInit, ms: number): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

const DRAFT_SYSTEM = `You are a senior editorial writer producing premium, magazine-quality long-form documents.

Step 1 — ANALYZE (silent): identify topic, purpose, audience, tone, language (mirror the user's language — Urdu/Roman-Urdu → same), and required sections.

Step 2 — DRAFT: produce a COMPLETE, professionally structured document. Not an outline — the finished content, deep and substantial.

The document MUST contain a rich mix of the following components (use them where they naturally fit — do NOT force one of everything, but a good report typically has: cover info, 4–8 sections, 1–3 callouts, 1 key-takeaways box, 1 table if data is compared, 2–4 image suggestions, references at the end).

Use this plain-text markup EXACTLY (no code fences, no other syntax):

TITLE: <the document title>
SUBTITLE: <a one-line subtitle / tagline>

## Section heading
### Sub-section
Normal paragraph text. **bold** *italic* for emphasis.
- bullet item
1. numbered item

> Quote text — Attribution

[!INFO] Optional Title | Body text of the info callout.
[!SUCCESS] Optional Title | Body text.
[!WARNING] Optional Title | Body text.
[!DANGER] Optional Title | Body text.

[KEY]
- takeaway one
- takeaway two
- takeaway three
[/KEY]

[TABLE]
Header 1 | Header 2 | Header 3
---
row 1 col 1 | row 1 col 2 | row 1 col 3
row 2 col 1 | row 2 col 2 | row 2 col 3
[/TABLE]

[IMAGE: A vivid photographic description of the image to generate | Short caption shown under the image]

---     (a horizontal divider — use sparingly between major parts)

[REFERENCES]
1. Author, "Title", Publisher, Year.
2. Author, "Title", URL.
[/REFERENCES]

Rules:
- Start with TITLE and SUBTITLE lines.
- Do NOT include the title as a heading in the body.
- Write substantial content per section (multiple paragraphs, not one-liner).
- Prefer concrete facts, examples, real-world context, and comparisons.
- Image prompts must be visually specific ("high-detail photograph of…", "clean vector infographic of…"). No people-named celebrities.
- End with a References section if factual/technical.`;

const LAYOUT_SYSTEM = `You convert a finished draft into a strict JSON layout for a premium PDF renderer. Return ONLY a JSON object (no prose, no code fences) with this exact shape:

{
  "title": "Main document title",
  "subtitle": "One-line subtitle (optional)",
  "font": "Helvetica" | "Times" | "Courier",
  "blocks": [
    {"type":"h2","text":"Section heading"},
    {"type":"h3","text":"Sub-section"},
    {"type":"p","runs":[{"text":"Normal "},{"text":"bold","bold":true},{"text":" text."}]},
    {"type":"ul","items":["bullet one","bullet two"]},
    {"type":"ol","items":["step one","step two"]},
    {"type":"callout","variant":"info|success|warning|danger","title":"Optional","text":"body"},
    {"type":"keytakeaways","items":["one","two","three"]},
    {"type":"table","headers":["A","B"],"rows":[["1","2"],["3","4"]]},
    {"type":"quote","text":"...","attribution":"Author"},
    {"type":"image","prompt":"detailed visual prompt","caption":"Short caption"},
    {"type":"divider"},
    {"type":"references","items":["1. ...","2. ..."]}
  ]
}

Rules:
- Preserve ALL content from the draft — every paragraph, every bullet, every table row, every callout, every image, every reference.
- Never emit raw markdown symbols (#, ##, **, *, _) in any text field. Convert **bold** → run.bold, *italic* → run.italic.
- TITLE line → top-level "title". SUBTITLE line → top-level "subtitle". Never emit an h1 block.
- ## → h2, ### → h3.
- "- item" → ul.items. "1. item" → ol.items.
- "> text — author" → quote with attribution.
- "[!INFO] Title | body" → callout with variant "info". Same for SUCCESS/WARNING/DANGER.
- [KEY]…[/KEY] → keytakeaways with the bullet items.
- [TABLE]…[/TABLE] → table. First row is headers (split by "|"), rest are rows.
- [IMAGE: prompt | caption] → image block. Preserve prompt exactly.
- "---" line → divider.
- [REFERENCES]…[/REFERENCES] → references block with numbered items.
- Font mapping: Arial/Roboto/Helvetica/sans-serif → "Helvetica"; Times/serif → "Times"; Courier/mono → "Courier".`;

function mapFont(name?: string): "Helvetica" | "Times" | "Courier" {
  const n = (name || "").toLowerCase();
  if (n.includes("times") || n.includes("serif")) return "Times";
  if (n.includes("courier") || n.includes("mono")) return "Courier";
  return "Helvetica";
}

async function callLLM(
  systemMsg: string,
  userMsg: string,
  model: string,
  key: string,
  jsonMode: boolean,
): Promise<string> {
  const isOpenAI = model.startsWith("openai/");
  const body: Record<string, unknown> = {
    model,
    messages: [
      { role: "system", content: systemMsg },
      { role: "user", content: userMsg },
    ],
  };
  if (jsonMode) body.response_format = { type: "json_object" };
  if (isOpenAI) body.service_tier = "priority";
  const res = await fetchWithTimeout("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }, 90_000);
  if (!res.ok) throw new Error(`LLM ${res.status}: ${await res.text()}`);
  const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  return (json.choices?.[0]?.message?.content ?? "").trim();
}

async function draftAndLayout(prompt: string, model: string, key: string): Promise<Doc> {
  const draft = await callLLM(DRAFT_SYSTEM, prompt, model, key, false);
  if (!draft) throw new Error("Empty draft from model");
  const layoutUser = `Convert this finished draft into the required JSON layout. Preserve every section, paragraph, table row, callout, image, and reference.\n\n---DRAFT---\n${draft}`;
  let lastErr: unknown = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const raw = await callLLM(LAYOUT_SYSTEM, layoutUser, model, key, true);
      const cleaned = raw.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
      const parsed = JSON.parse(cleaned) as Doc;
      if (!parsed || !Array.isArray(parsed.blocks)) throw new Error("bad doc shape");
      return parsed;
    } catch (e) {
      lastErr = e;
    }
  }
  throw new Error(`Layout step failed: ${lastErr instanceof Error ? lastErr.message : String(lastErr)}`);
}

// ---------- Image generation (parallel, capped) ----------

async function generateImageBytes(prompt: string, key: string): Promise<Uint8Array | null> {
  try {
    const res = await fetchWithTimeout("https://ai.gateway.lovable.dev/v1/images/generations", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-image",
        messages: [{ role: "user", content: prompt }],
        modalities: ["image", "text"],
      }),
    }, 45_000);
    if (!res.ok) return null;
    const json = (await res.json()) as { data?: Array<{ b64_json?: string }> };
    const b64 = json.data?.[0]?.b64_json;
    if (!b64) return null;
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  } catch {
    return null;
  }
}

async function hydrateImages(doc: Doc, key: string, cap = 3): Promise<Map<number, Uint8Array>> {
  const targets: number[] = [];
  doc.blocks.forEach((b, i) => { if (b.type === "image" && b.prompt) targets.push(i); });
  const picked = targets.slice(0, cap);
  const results = await Promise.all(picked.map((i) => {
    const b = doc.blocks[i] as Extract<Block, { type: "image" }>;
    return generateImageBytes(b.prompt, key).then((bytes) => ({ i, bytes }));
  }));
  const map = new Map<number, Uint8Array>();
  for (const r of results) if (r.bytes) map.set(r.i, r.bytes);
  return map;
}

// ---------- PDF rendering ----------

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
type Fonts = Awaited<ReturnType<typeof pickFonts>>;

// Strip characters (incl. emoji) that StandardFonts can't render.
function clean(s: unknown): string {
  const str =
    typeof s === "string"
      ? s
      : s == null
        ? ""
        : Array.isArray(s)
          ? s.map((x) => clean(x)).join(" ")
          : typeof s === "object"
            ? JSON.stringify(s)
            : String(s);
  return str
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\u2026/g, "...")
    .replace(/\u00A0/g, " ")
    .replace(/[\u2022\u25CF\u25E6\u2043\u2219]/g, "-")
    // eslint-disable-next-line no-control-regex
    .replace(/[^\x00-\xFF]/g, "");
}

const PAGE_W = 612;   // US Letter
const PAGE_H = 792;
const MARGIN = 54;
const CONTENT_W = PAGE_W - MARGIN * 2;
const BODY_SIZE = 11;
const BODY_LEADING = 15.5;
const PARA_GAP = 8;

function wrap(text: string, font: PDFFont, size: number, maxW: number): string[] {
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
}

type Palette = {
  primary: RGB;
  secondary: RGB;
  accent: RGB;
  danger: RGB;
  success: RGB;
  ink: RGB;
  mute: RGB;
  panel: RGB;
  hair: RGB;
  white: RGB;
};

async function makePalette(): Promise<Palette> {
  const { rgb } = await loadPdfLib();
  return {
    primary: rgb(0, 0.784, 0.588),      // #00C896
    secondary: rgb(0.055, 0.647, 0.914), // #0EA5E9
    accent: rgb(0.961, 0.620, 0.043),    // #F59E0B
    danger: rgb(0.937, 0.267, 0.267),    // #EF4444
    success: rgb(0.063, 0.725, 0.506),   // #10B981
    ink: rgb(0.09, 0.11, 0.15),
    mute: rgb(0.42, 0.46, 0.52),
    panel: rgb(0.97, 0.98, 0.99),
    hair: rgb(0.87, 0.89, 0.92),
    white: rgb(1, 1, 1),
  };
}

function tint(rgbFn: (r: number, g: number, b: number) => RGB, c: RGB, alpha: number): RGB {
  // approximate tint by mixing with white
  return rgbFn(
    c.red + (1 - c.red) * (1 - alpha),
    c.green + (1 - c.green) * (1 - alpha),
    c.blue + (1 - c.blue) * (1 - alpha),
  );
}

// ---------------- Cursor-based page builder ----------------
type Ctx = {
  pdf: PDFDocument;
  fonts: Fonts;
  pal: Palette;
  rgb: (r: number, g: number, b: number) => RGB;
  images: Map<number, Uint8Array>;
  page: PDFPage;
  y: number;
  pages: PDFPage[];
  sectionMarks: { text: string; pageIndex: number }[];
  imageCounter: number;
};

function newPage(ctx: Ctx) {
  ctx.page = ctx.pdf.addPage([PAGE_W, PAGE_H]);
  ctx.pages.push(ctx.page);
  ctx.y = PAGE_H - MARGIN;
}
function ensure(ctx: Ctx, needed: number) {
  if (ctx.y - needed < MARGIN + 30) newPage(ctx);
}

function drawRuns(ctx: Ctx, runs: Run[], opts: { size?: number; leading?: number; indent?: number; color?: RGB } = {}) {
  const size = opts.size ?? BODY_SIZE;
  const leading = opts.leading ?? BODY_LEADING;
  const indent = opts.indent ?? 0;
  const color = opts.color ?? ctx.pal.ink;
  const spaceW = ctx.fonts.regular.widthOfTextAtSize(" ", size);
  let cx = MARGIN + indent;
  ensure(ctx, leading);
  let lineTop = ctx.y;
  const maxX = PAGE_W - MARGIN;
  for (const run of runs) {
    const font: PDFFont =
      run.bold && run.italic ? ctx.fonts.boldItalic :
      run.bold ? ctx.fonts.bold :
      run.italic ? ctx.fonts.italic : ctx.fonts.regular;
    const chunks = clean(run.text).split(/(\s+)/);
    for (const chunk of chunks) {
      if (!chunk) continue;
      if (/^\s+$/.test(chunk)) {
        if (cx > MARGIN + indent) cx += spaceW;
        continue;
      }
      const w = font.widthOfTextAtSize(chunk, size);
      if (cx + w > maxX && cx > MARGIN + indent) {
        ctx.y -= leading;
        ensure(ctx, leading);
        lineTop = ctx.y;
        cx = MARGIN + indent;
      }
      ctx.page.drawText(chunk, { x: cx, y: lineTop - size, size, font, color });
      cx += w;
    }
  }
  ctx.y -= leading + PARA_GAP;
}

function drawHeading(ctx: Ctx, text: string, level: 2 | 3) {
  const cleaned = clean(text);
  if (level === 2) {
    ensure(ctx, 44);
    ctx.y -= 6;
    // accent chip
    ctx.page.drawRectangle({ x: MARGIN, y: ctx.y - 18, width: 4, height: 22, color: ctx.pal.primary });
    const size = 17;
    const lines = wrap(cleaned, ctx.fonts.bold, size, CONTENT_W - 14);
    for (let i = 0; i < lines.length; i++) {
      ensure(ctx, 22);
      ctx.page.drawText(lines[i], { x: MARGIN + 14, y: ctx.y - size, size, font: ctx.fonts.bold, color: ctx.pal.ink });
      ctx.y -= 22;
    }
    ctx.y -= 4;
    ctx.page.drawLine({ start: { x: MARGIN, y: ctx.y }, end: { x: PAGE_W - MARGIN, y: ctx.y }, thickness: 0.5, color: ctx.pal.hair });
    ctx.y -= 10;
    ctx.sectionMarks.push({ text: cleaned, pageIndex: ctx.pages.length - 1 });
  } else {
    ensure(ctx, 26);
    ctx.y -= 4;
    const size = 12.5;
    const lines = wrap(cleaned, ctx.fonts.bold, size, CONTENT_W);
    for (const line of lines) {
      ensure(ctx, 17);
      ctx.page.drawText(line, { x: MARGIN, y: ctx.y - size, size, font: ctx.fonts.bold, color: ctx.pal.secondary });
      ctx.y -= 17;
    }
    ctx.y -= 3;
  }
}

function calloutColors(pal: Palette, v: CalloutVariant): { border: RGB; text: RGB } {
  if (v === "success") return { border: pal.success, text: pal.success };
  if (v === "warning") return { border: pal.accent, text: pal.accent };
  if (v === "danger") return { border: pal.danger, text: pal.danger };
  return { border: pal.secondary, text: pal.secondary };
}

function drawCallout(ctx: Ctx, cb: Extract<Block, { type: "callout" }>) {
  const { border, text: labelColor } = calloutColors(ctx.pal, cb.variant);
  const bg = tint(ctx.rgb, border, 0.10);
  const padX = 14;
  const padY = 12;
  const innerW = CONTENT_W - padX * 2 - 6;
  // measure
  const titleLines = cb.title ? wrap(clean(cb.title), ctx.fonts.bold, 11.5, innerW) : [];
  const bodyLines = wrap(clean(cb.text), ctx.fonts.regular, BODY_SIZE, innerW);
  const contentH = titleLines.length * 15 + (titleLines.length ? 4 : 0) + bodyLines.length * BODY_LEADING;
  const boxH = contentH + padY * 2;
  ensure(ctx, boxH + 10);
  const yTop = ctx.y;
  ctx.page.drawRectangle({ x: MARGIN, y: yTop - boxH, width: CONTENT_W, height: boxH, color: bg });
  ctx.page.drawRectangle({ x: MARGIN, y: yTop - boxH, width: 4, height: boxH, color: border });
  let ty = yTop - padY;
  const label = cb.variant.toUpperCase();
  ctx.page.drawText(label, { x: MARGIN + padX + 6, y: ty - 9, size: 8.5, font: ctx.fonts.bold, color: labelColor });
  ty -= 12;
  for (const l of titleLines) {
    ctx.page.drawText(l, { x: MARGIN + padX + 6, y: ty - 11.5, size: 11.5, font: ctx.fonts.bold, color: ctx.pal.ink });
    ty -= 15;
  }
  if (titleLines.length) ty -= 2;
  for (const l of bodyLines) {
    ctx.page.drawText(l, { x: MARGIN + padX + 6, y: ty - BODY_SIZE, size: BODY_SIZE, font: ctx.fonts.regular, color: ctx.pal.ink });
    ty -= BODY_LEADING;
  }
  ctx.y = yTop - boxH - 10;
}

function drawKeyTakeaways(ctx: Ctx, kb: Extract<Block, { type: "keytakeaways" }>) {
  const padX = 16;
  const padY = 14;
  const innerW = CONTENT_W - padX * 2;
  const items = kb.items.map((it) => clean(it));
  const wrapped = items.map((it) => wrap(it, ctx.fonts.regular, BODY_SIZE, innerW - 16));
  const contentH = 22 + wrapped.reduce((acc, w) => acc + w.length * BODY_LEADING + 4, 0);
  const boxH = contentH + padY * 2;
  ensure(ctx, boxH + 12);
  const yTop = ctx.y;
  const bg = tint(ctx.rgb, ctx.pal.primary, 0.10);
  ctx.page.drawRectangle({ x: MARGIN, y: yTop - boxH, width: CONTENT_W, height: boxH, color: bg });
  ctx.page.drawRectangle({ x: MARGIN, y: yTop - boxH, width: CONTENT_W, height: 4, color: ctx.pal.primary });
  let ty = yTop - padY - 2;
  ctx.page.drawText("KEY TAKEAWAYS", { x: MARGIN + padX, y: ty - 10, size: 9.5, font: ctx.fonts.bold, color: ctx.pal.primary });
  ty -= 20;
  for (const w of wrapped) {
    ctx.page.drawText("\u2022", { x: MARGIN + padX, y: ty - BODY_SIZE + 1, size: BODY_SIZE, font: ctx.fonts.bold, color: ctx.pal.primary });
    for (let i = 0; i < w.length; i++) {
      ctx.page.drawText(w[i], { x: MARGIN + padX + 14, y: ty - BODY_SIZE, size: BODY_SIZE, font: ctx.fonts.regular, color: ctx.pal.ink });
      ty -= BODY_LEADING;
    }
    ty -= 4;
  }
  ctx.y = yTop - boxH - 12;
}

function drawTable(ctx: Ctx, tb: Extract<Block, { type: "table" }>) {
  const cols = Math.max(tb.headers.length, ...tb.rows.map((r) => r.length));
  if (cols === 0) return;
  const colW = CONTENT_W / cols;
  const padX = 8;
  const padY = 7;
  const cellSize = 10.5;
  const cellLead = 13.5;

  const measure = (cells: string[]) =>
    Math.max(1, ...cells.map((c) => wrap(clean(c), ctx.fonts.regular, cellSize, colW - padX * 2).length));

  const headerLines = measure(tb.headers);
  const headerH = headerLines * cellLead + padY * 2;
  ensure(ctx, headerH + 20);
  // Header
  ctx.page.drawRectangle({ x: MARGIN, y: ctx.y - headerH, width: CONTENT_W, height: headerH, color: ctx.pal.primary });
  for (let ci = 0; ci < cols; ci++) {
    const cell = tb.headers[ci] ?? "";
    const lines = wrap(clean(cell), ctx.fonts.bold, cellSize, colW - padX * 2);
    let ty = ctx.y - padY - cellSize;
    for (const l of lines) {
      ctx.page.drawText(l, { x: MARGIN + ci * colW + padX, y: ty, size: cellSize, font: ctx.fonts.bold, color: ctx.pal.white });
      ty -= cellLead;
    }
  }
  ctx.y -= headerH;

  // Rows
  for (let ri = 0; ri < tb.rows.length; ri++) {
    const row = tb.rows[ri];
    const lines = measure(row);
    const rowH = lines * cellLead + padY * 2;
    ensure(ctx, rowH);
    if (ri % 2 === 0) {
      ctx.page.drawRectangle({ x: MARGIN, y: ctx.y - rowH, width: CONTENT_W, height: rowH, color: ctx.pal.panel });
    }
    // grid lines
    ctx.page.drawLine({ start: { x: MARGIN, y: ctx.y - rowH }, end: { x: MARGIN + CONTENT_W, y: ctx.y - rowH }, thickness: 0.4, color: ctx.pal.hair });
    for (let ci = 0; ci < cols; ci++) {
      const cell = row[ci] ?? "";
      const wrapped = wrap(clean(cell), ctx.fonts.regular, cellSize, colW - padX * 2);
      let ty = ctx.y - padY - cellSize;
      for (const l of wrapped) {
        ctx.page.drawText(l, { x: MARGIN + ci * colW + padX, y: ty, size: cellSize, font: ctx.fonts.regular, color: ctx.pal.ink });
        ty -= cellLead;
      }
    }
    ctx.y -= rowH;
  }
  ctx.y -= 10;
}

function drawQuote(ctx: Ctx, qb: Extract<Block, { type: "quote" }>) {
  const padX = 14;
  const padY = 10;
  const innerW = CONTENT_W - padX * 2 - 6;
  const lines = wrap(clean(qb.text), ctx.fonts.italic, 12, innerW);
  const attribLines = qb.attribution ? wrap(clean(`— ${qb.attribution}`), ctx.fonts.regular, 10, innerW) : [];
  const boxH = lines.length * 16 + (attribLines.length ? 4 + attribLines.length * 13 : 0) + padY * 2;
  ensure(ctx, boxH + 10);
  const yTop = ctx.y;
  ctx.page.drawRectangle({ x: MARGIN, y: yTop - boxH, width: 3, height: boxH, color: ctx.pal.accent });
  let ty = yTop - padY;
  for (const l of lines) {
    ctx.page.drawText(l, { x: MARGIN + padX + 6, y: ty - 12, size: 12, font: ctx.fonts.italic, color: ctx.pal.ink });
    ty -= 16;
  }
  if (attribLines.length) ty -= 4;
  for (const l of attribLines) {
    ctx.page.drawText(l, { x: MARGIN + padX + 6, y: ty - 10, size: 10, font: ctx.fonts.regular, color: ctx.pal.mute });
    ty -= 13;
  }
  ctx.y = yTop - boxH - 10;
}

async function drawImage(ctx: Ctx, block: Extract<Block, { type: "image" }>, blockIndex: number) {
  ctx.imageCounter += 1;
  const bytes = ctx.images.get(blockIndex);
  const caption = clean(block.caption || block.prompt);
  const figLabel = `Figure ${ctx.imageCounter}`;
  if (bytes) {
    try {
      const img = await ctx.pdf.embedPng(bytes);
      const maxW = CONTENT_W;
      const maxH = 260;
      const ratio = Math.min(maxW / img.width, maxH / img.height);
      const w = img.width * ratio;
      const h = img.height * ratio;
      const preLines = wrap(caption, ctx.fonts.italic, 9.5, CONTENT_W);
      const totalH = h + 8 + preLines.length * 12 + 12;
      ensure(ctx, totalH + 6);
      const x = MARGIN + (CONTENT_W - w) / 2;
      const yImg = ctx.y - h;
      // subtle frame
      ctx.page.drawRectangle({ x: x - 2, y: yImg - 2, width: w + 4, height: h + 4, color: ctx.pal.hair });
      ctx.page.drawImage(img, { x, y: yImg, width: w, height: h });
      ctx.y = yImg - 14;
      // Caption: "Figure N — text" centered
      const combined = `${figLabel} — ${caption}`;
      const capLines = wrap(combined, ctx.fonts.italic, 9.5, CONTENT_W);
      for (let li = 0; li < capLines.length; li++) {
        const line = capLines[li];
        const w2 = ctx.fonts.italic.widthOfTextAtSize(line, 9.5);
        // Draw label prefix bold on first line
        if (li === 0 && line.startsWith(figLabel)) {
          const rest = line.slice(figLabel.length);
          const labelW = ctx.fonts.bold.widthOfTextAtSize(figLabel, 9.5);
          const restW = ctx.fonts.italic.widthOfTextAtSize(rest, 9.5);
          const startX = MARGIN + (CONTENT_W - (labelW + restW)) / 2;
          ctx.page.drawText(figLabel, { x: startX, y: ctx.y - 9.5, size: 9.5, font: ctx.fonts.bold, color: ctx.pal.primary });
          ctx.page.drawText(rest, { x: startX + labelW, y: ctx.y - 9.5, size: 9.5, font: ctx.fonts.italic, color: ctx.pal.mute });
        } else {
          ctx.page.drawText(line, { x: MARGIN + (CONTENT_W - w2) / 2, y: ctx.y - 9.5, size: 9.5, font: ctx.fonts.italic, color: ctx.pal.mute });
        }
        ctx.y -= 12;
      }
      ctx.y -= 8;
      return;
    } catch { /* fall through */ }
  }
  // Fallback: styled placeholder
  const h = 140;
  ensure(ctx, h + 30);
  ctx.page.drawRectangle({ x: MARGIN, y: ctx.y - h, width: CONTENT_W, height: h, color: ctx.pal.panel });
  ctx.page.drawRectangle({ x: MARGIN, y: ctx.y - h, width: CONTENT_W, height: h, borderColor: ctx.pal.hair, borderWidth: 0.5 });
  const label = `${figLabel} — ${caption}`;
  const lines = wrap(label, ctx.fonts.italic, 10, CONTENT_W - 40);
  let ty = ctx.y - h / 2 + lines.length * 6;
  for (const l of lines) {
    const w2 = ctx.fonts.italic.widthOfTextAtSize(l, 10);
    ctx.page.drawText(l, { x: MARGIN + (CONTENT_W - w2) / 2, y: ty, size: 10, font: ctx.fonts.italic, color: ctx.pal.mute });
    ty -= 12;
  }
  ctx.y -= h + 12;
}

function drawDivider(ctx: Ctx) {
  ensure(ctx, 24);
  ctx.y -= 6;
  const cx = PAGE_W / 2;
  ctx.page.drawLine({ start: { x: MARGIN + 40, y: ctx.y }, end: { x: cx - 8, y: ctx.y }, thickness: 0.6, color: ctx.pal.hair });
  ctx.page.drawCircle({ x: cx, y: ctx.y, size: 2, color: ctx.pal.primary });
  ctx.page.drawLine({ start: { x: cx + 8, y: ctx.y }, end: { x: PAGE_W - MARGIN - 40, y: ctx.y }, thickness: 0.6, color: ctx.pal.hair });
  ctx.y -= 14;
}

function drawReferences(ctx: Ctx, rb: Extract<Block, { type: "references" }>) {
  drawHeading(ctx, "References", 2);
  for (const item of rb.items) {
    const clean1 = clean(item);
    drawRuns(ctx, [{ text: clean1 }], { size: 10, leading: 13, indent: 8 });
  }
}

function drawCoverPage(ctx: Ctx, doc: Doc) {
  // Full-width top color band
  ctx.page.drawRectangle({ x: 0, y: PAGE_H - 12, width: PAGE_W, height: 12, color: ctx.pal.primary });
  // Big accent chip
  ctx.page.drawRectangle({ x: MARGIN, y: PAGE_H / 2 + 90, width: 46, height: 6, color: ctx.pal.accent });
  // Title
  const title = clean(doc.title || "Untitled Report");
  const titleSize = 34;
  const titleLines = wrap(title, ctx.fonts.bold, titleSize, PAGE_W - MARGIN * 2);
  let ty = PAGE_H / 2 + 60;
  for (const l of titleLines) {
    ctx.page.drawText(l, { x: MARGIN, y: ty - titleSize, size: titleSize, font: ctx.fonts.bold, color: ctx.pal.ink });
    ty -= titleSize + 6;
  }
  // Subtitle
  if (doc.subtitle) {
    const sub = clean(doc.subtitle);
    const subLines = wrap(sub, ctx.fonts.italic, 15, PAGE_W - MARGIN * 2);
    ty -= 8;
    for (const l of subLines) {
      ctx.page.drawText(l, { x: MARGIN, y: ty - 15, size: 15, font: ctx.fonts.italic, color: ctx.pal.mute });
      ty -= 20;
    }
  }
  // Meta strip near bottom
  const stripY = 110;
  ctx.page.drawLine({ start: { x: MARGIN, y: stripY + 30 }, end: { x: PAGE_W - MARGIN, y: stripY + 30 }, thickness: 0.6, color: ctx.pal.hair });
  const date = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  ctx.page.drawText("PREMIUM REPORT", { x: MARGIN, y: stripY + 12, size: 9, font: ctx.fonts.bold, color: ctx.pal.primary });
  ctx.page.drawText(date, { x: MARGIN, y: stripY - 4, size: 10, font: ctx.fonts.regular, color: ctx.pal.mute });
  const rightLabel = "Prepared by NOWAY AQEEL";
  const rw = ctx.fonts.regular.widthOfTextAtSize(rightLabel, 10);
  ctx.page.drawText(rightLabel, { x: PAGE_W - MARGIN - rw, y: stripY - 4, size: 10, font: ctx.fonts.regular, color: ctx.pal.mute });
  // Bottom color band
  ctx.page.drawRectangle({ x: 0, y: 0, width: PAGE_W, height: 6, color: ctx.pal.secondary });
}

function drawTocPage(ctx: Ctx, doc: Doc, marks: { text: string; pageNumber: number }[]) {
  // Heading
  ctx.page.drawText("Table of Contents", { x: MARGIN, y: PAGE_H - MARGIN - 24, size: 22, font: ctx.fonts.bold, color: ctx.pal.ink });
  ctx.page.drawLine({ start: { x: MARGIN, y: PAGE_H - MARGIN - 34 }, end: { x: PAGE_W - MARGIN, y: PAGE_H - MARGIN - 34 }, thickness: 1, color: ctx.pal.primary });
  let ty = PAGE_H - MARGIN - 60;
  const size = 11.5;
  const gap = 22;
  for (let i = 0; i < marks.length; i++) {
    if (ty < MARGIN + 40) break;
    const m = marks[i];
    const num = String(i + 1).padStart(2, "0");
    ctx.page.drawText(num, { x: MARGIN, y: ty, size, font: ctx.fonts.bold, color: ctx.pal.primary });
    const titleX = MARGIN + 30;
    const pageStr = String(m.pageNumber);
    const pw = ctx.fonts.bold.widthOfTextAtSize(pageStr, size);
    const rightX = PAGE_W - MARGIN;
    // title (truncate if too long)
    let title = clean(m.text);
    const maxTitleW = rightX - titleX - pw - 20;
    while (ctx.fonts.regular.widthOfTextAtSize(title, size) > maxTitleW && title.length > 4) {
      title = title.slice(0, -2);
    }
    if (title !== clean(m.text)) title = title.replace(/\s+\S*$/, "") + "…";
    const tw = ctx.fonts.regular.widthOfTextAtSize(title, size);
    ctx.page.drawText(title, { x: titleX, y: ty, size, font: ctx.fonts.regular, color: ctx.pal.ink });
    // dotted leader
    const dotStart = titleX + tw + 6;
    const dotEnd = rightX - pw - 6;
    for (let x = dotStart; x < dotEnd; x += 4) {
      ctx.page.drawCircle({ x, y: ty + 3, size: 0.6, color: ctx.pal.hair });
    }
    ctx.page.drawText(pageStr, { x: rightX - pw, y: ty, size, font: ctx.fonts.bold, color: ctx.pal.ink });
    ty -= gap;
  }
}

function stampFooters(ctx: Ctx, docTitle: string) {
  const totalContentPages = ctx.pages.length - 1; // exclude cover
  for (let i = 1; i < ctx.pages.length; i++) {
    const p = ctx.pages[i];
    // top hairline
    p.drawLine({ start: { x: MARGIN, y: PAGE_H - MARGIN + 18 }, end: { x: PAGE_W - MARGIN, y: PAGE_H - MARGIN + 18 }, thickness: 0.4, color: ctx.pal.hair });
    // header title
    const t = clean(docTitle);
    const tSize = 8.5;
    p.drawText(t, { x: MARGIN, y: PAGE_H - MARGIN + 24, size: tSize, font: ctx.fonts.bold, color: ctx.pal.mute });
    const right = "PREMIUM REPORT";
    const rw = ctx.fonts.bold.widthOfTextAtSize(right, tSize);
    p.drawText(right, { x: PAGE_W - MARGIN - rw, y: PAGE_H - MARGIN + 24, size: tSize, font: ctx.fonts.bold, color: ctx.pal.primary });
    // footer line
    p.drawLine({ start: { x: MARGIN, y: MARGIN - 18 }, end: { x: PAGE_W - MARGIN, y: MARGIN - 18 }, thickness: 0.4, color: ctx.pal.hair });
    const pageLabel = `${i} / ${totalContentPages}`;
    const plw = ctx.fonts.regular.widthOfTextAtSize(pageLabel, 9);
    p.drawText(pageLabel, { x: PAGE_W - MARGIN - plw, y: MARGIN - 30, size: 9, font: ctx.fonts.regular, color: ctx.pal.mute });
    p.drawText(clean(docTitle), { x: MARGIN, y: MARGIN - 30, size: 9, font: ctx.fonts.regular, color: ctx.pal.mute });
  }
}

async function renderPdf(doc: Doc, key: string): Promise<Uint8Array> {
  const { PDFDocument, rgb } = await loadPdfLib();
  const pdf = await PDFDocument.create();
  const family = mapFont(doc.font);
  const fonts = await pickFonts(pdf, family);
  const pal = await makePalette();
  const images = await hydrateImages(doc, key, 6);

  const ctx: Ctx = {
    pdf, fonts, pal, rgb, images,
    page: pdf.addPage([PAGE_W, PAGE_H]),
    y: PAGE_H - MARGIN,
    pages: [],
    sectionMarks: [],
    imageCounter: 0,
  };
  ctx.pages.push(ctx.page);

  // 1. Cover
  drawCoverPage(ctx, doc);

  // 2. TOC placeholder — reserve one page (we'll draw after we know section pages)
  newPage(ctx);
  const tocPageIndex = ctx.pages.length - 1;

  // 3. Body
  newPage(ctx);
  for (let i = 0; i < doc.blocks.length; i++) {
    const b = doc.blocks[i];
    if (b.type === "h2") drawHeading(ctx, b.text, 2);
    else if (b.type === "h3") drawHeading(ctx, b.text, 3);
    else if (b.type === "p") drawRuns(ctx, b.runs || []);
    else if (b.type === "ul") {
      for (const item of b.items || []) {
        ensure(ctx, BODY_LEADING);
        ctx.page.drawCircle({ x: MARGIN + 6, y: ctx.y - BODY_SIZE + 4, size: 1.8, color: ctx.pal.primary });
        drawRuns(ctx, [{ text: item }], { indent: 18 });
      }
      ctx.y -= 2;
    } else if (b.type === "ol") {
      let n = 1;
      for (const item of b.items || []) {
        ensure(ctx, BODY_LEADING);
        ctx.page.drawText(`${n}.`, { x: MARGIN + 2, y: ctx.y - BODY_SIZE, size: BODY_SIZE, font: ctx.fonts.bold, color: ctx.pal.primary });
        drawRuns(ctx, [{ text: item }], { indent: 22 });
        n++;
      }
      ctx.y -= 2;
    } else if (b.type === "callout") drawCallout(ctx, b);
    else if (b.type === "keytakeaways") drawKeyTakeaways(ctx, b);
    else if (b.type === "table") drawTable(ctx, b);
    else if (b.type === "quote") drawQuote(ctx, b);
    else if (b.type === "image") await drawImage(ctx, b, i);
    else if (b.type === "divider") drawDivider(ctx);
    else if (b.type === "references") drawReferences(ctx, b);
  }

  // 4. Draw TOC on the reserved page
  ctx.page = ctx.pages[tocPageIndex];
  ctx.y = PAGE_H - MARGIN;
  const marks = ctx.sectionMarks.map((m) => ({ text: m.text, pageNumber: m.pageIndex })); // pageIndex here = page number relative to cover=0
  drawTocPage(ctx, doc, marks);

  // 5. Stamp headers/footers on all pages except cover
  stampFooters(ctx, doc.title || "Document");

  return await pdf.save();
}

export const Route = createFileRoute("/api/pdf")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const { prompt, font } = (await request.json()) as Body;
          if (!prompt || !prompt.trim()) return new Response("prompt required", { status: 400 });
          const key = process.env.LOVABLE_API_KEY;
          if (!key) return new Response("Missing LOVABLE_API_KEY", { status: 500 });

          const chosenModel = pickPdfModel();
          const userPrompt = font ? `${prompt}\n\n(Preferred font family: ${font})` : prompt;

          const doc = await draftAndLayout(userPrompt, chosenModel, key);
          if (font && !doc.font) doc.font = font;
          const bytes = await renderPdf(doc, key);
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
