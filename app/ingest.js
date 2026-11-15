// Reading uploaded modules (PDF, PPTX, DOCX, text) in the browser.
// No npm imports: JSZip and pdf.js are browser globals loaded from a CDN.

export const MAX_MODULE_CHARS = 25000;
const CHUNK_CHARS = 3000;
const HEAD_MAX = 200;
const MIN_HEAD = 20;
const ERR_EMPTY = "This file has no readable text (it may be scanned images).";
const ERR_TYPE = "Please upload a PDF, PowerPoint (.pptx), Word (.docx) or text file.";

// An out-of-range code point would throw a RangeError: keep the original text instead.
const codePoint = (m, n) => (n >= 0 && n <= 0x10ffff ? String.fromCodePoint(n) : m);

function decodeEntities(s) {
  return s
    .replace(/&#x([0-9a-fA-F]+);/g, (m, h) => codePoint(m, parseInt(h, 16)))
    .replace(/&#(\d+);/g, (m, d) => codePoint(m, parseInt(d, 10)))
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

// Line breaks and run-level tabs become text runs, so words don't run together.
// (Tab stops in paragraph properties carry attributes and are left alone.)
function breaksToRuns(para, ns) {
  return para
    .replace(new RegExp(`<${ns}:br\\b[^>]*?(?:\\/>|>[\\s\\S]*?<\\/${ns}:br>)`, "g"), `<${ns}:t>\n</${ns}:t>`)
    .replace(new RegExp(`<${ns}:tab\\s*\\/>`, "g"), `<${ns}:t> </${ns}:t>`);
}

function runsToText(xml, paraRe, runRe, ns) {
  const lines = [];
  for (const raw of xml.match(paraRe) || []) {
    const para = breaksToRuns(raw, ns);
    let line = "";
    for (const m of para.matchAll(runRe)) line += m[1];
    line = decodeEntities(line).split("\n").map((l) => l.trim()).filter(Boolean).join("\n");
    if (line) lines.push(line);
  }
  return lines.join("\n");
}

export function slideXmlToText(xml) {
  return runsToText(String(xml), /<a:p[ >][\s\S]*?<\/a:p>/g, /<a:t(?:\s[^>]*)?>([\s\S]*?)<\/a:t>/g, "a");
}

export function docXmlToText(xml) {
  return runsToText(String(xml), /<w:p[ >][\s\S]*?<\/w:p>/g, /<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g, "w");
}

export function slideOrder(paths) {
  const num = (p) => Number(/ppt\/slides\/slide(\d+)\.xml$/.exec(p)?.[1]);
  return paths
    .filter((p) => /^ppt\/slides\/slide\d+\.xml$/.test(p))
    .sort((a, b) => num(a) - num(b));
}

function mergeLabel(group) {
  const a = /^\[(page|slide) (\d+)\]$/.exec(group[0].label);
  const b = /^\[(page|slide) (\d+)\]$/.exec(group[group.length - 1].label);
  if (!a || !b || group.length === 1) return group[0].label;
  return `[${a[1]}s ${a[2]}-${b[2]}]`;
}

function groupParts(parts, size) {
  const groups = [];
  for (let i = 0; i < parts.length; i += size) {
    const g = parts.slice(i, i + size);
    groups.push({ label: mergeLabel(g), text: g.map((p) => p.text).join("\n") });
  }
  return groups;
}

function labelsFit(parts, max) {
  return parts.reduce((n, p) => n + p.label.length, 0) + 2 * Math.max(0, parts.length - 1) <= max;
}

export function truncateModule(parts, max = MAX_MODULE_CHARS) {
  if (!labelsFit(parts, max)) {
    let size = 2;
    while (size < parts.length && !labelsFit(groupParts(parts, size), max)) size++;
    parts = groupParts(parts, size);
  }
  const n = parts.length;
  const budget = n ? Math.floor((max - 2 * (n - 1)) / n) : 0;
  const heads = parts.map((p) => {
    const [first, ...others] = String(p.text).split("\n");
    let cap = Math.min(HEAD_MAX, budget - p.label.length - 1);
    if (cap < MIN_HEAD) cap = 0; // too many parts: keep the label only
    const rest = [first.slice(cap), ...others].join("\n").replace(/^\n/, "");
    return { head: cap ? `${p.label}\n${first.slice(0, cap)}` : p.label, rest };
  });
  const sep = "\n\n";
  let used = heads.reduce((n, h) => n + h.head.length, 0) + sep.length * Math.max(0, heads.length - 1);
  const out = heads.map((h) => h.head);
  for (let i = 0; i < heads.length; i++) {
    const room = max - used - 1; // 1 for the newline joining body to head
    if (room <= 0 || !heads[i].rest) continue;
    const body = heads[i].rest.slice(0, room);
    out[i] += "\n" + body;
    used += body.length + 1;
  }
  return out.join(sep).slice(0, max);
}

export async function extractPptx(zip) {
  const names = slideOrder(Object.keys(zip.files));
  const parts = [];
  for (let i = 0; i < names.length; i++) {
    const text = slideXmlToText(await zip.file(names[i]).async("string"));
    parts.push({ label: `[slide ${i + 1}]`, text });
  }
  return finish(parts, 0, parts.length);
}

function chunkText(text) {
  const paras = text.split(/\n+/).filter((p) => p.trim());
  const chunks = [];
  let cur = "";
  for (const p of paras) {
    if (cur && cur.length + p.length + 1 > CHUNK_CHARS) {
      chunks.push(cur);
      cur = "";
    }
    cur += (cur ? "\n" : "") + p;
  }
  if (cur) chunks.push(cur);
  return chunks;
}

function chunkedParts(text) {
  return chunkText(text).map((t, i) => ({ label: `[page ${i + 1}]`, text: t }));
}

export async function extractDocx(zip) {
  const file = zip.file("word/document.xml");
  if (!file) throw new Error(ERR_EMPTY);
  const parts = chunkedParts(docXmlToText(await file.async("string")));
  return finish(parts, parts.length, 0);
}

function finish(parts, pages, slides) {
  const nonEmpty = parts.filter((p) => p.text.trim());
  if (!nonEmpty.length) throw new Error(ERR_EMPTY);
  return { text: truncateModule(parts.filter((p) => p.text.trim()), MAX_MODULE_CHARS), pages, slides };
}

async function extractPdf(buffer, pdfjsLib) {
  if (!pdfjsLib) throw new Error("PDF reader is not loaded yet. Please try again in a moment.");
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
  const parts = [];
  for (let n = 1; n <= pdf.numPages; n++) {
    const page = await pdf.getPage(n);
    const content = await page.getTextContent();
    const raw = content.items.map((it) => it.str + (it.hasEOL ? "\n" : " ")).join("");
    const text = raw.replace(/[ \t]+/g, " ").replace(/ ?\n[ \n]*/g, "\n").trim();
    parts.push({ label: `[page ${n}]`, text });
  }
  const r = finish(parts, pdf.numPages, 0);
  return r;
}

export async function readModuleFile(file, { JSZip = globalThis.JSZip, pdfjsLib = globalThis.pdfjsLib } = {}) {
  const name = String(file.name || "");
  const m = /^(.*)\.([^.]+)$/.exec(name);
  const title = (m ? m[1] : name).trim() || "Module";
  const ext = (m ? m[2] : "").toLowerCase();
  let r;
  if (ext === "pptx" || ext === "docx") {
    if (!JSZip) throw new Error("File reader is not loaded yet. Please try again in a moment.");
    const zip = await JSZip.loadAsync(await file.arrayBuffer());
    r = ext === "pptx" ? await extractPptx(zip) : await extractDocx(zip);
  } else if (ext === "pdf") {
    r = await extractPdf(await file.arrayBuffer(), pdfjsLib);
  } else if (ext === "txt" || ext === "md") {
    const parts = chunkedParts(await file.text());
    r = finish(parts, parts.length, 0);
  } else {
    throw new Error(ERR_TYPE);
  }
  return { title, text: r.text, pages: r.pages, slides: r.slides };
}
