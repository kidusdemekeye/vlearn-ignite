import { test } from "node:test";
import assert from "node:assert/strict";
import JSZip from "jszip";
import {
  slideXmlToText,
  docXmlToText,
  slideOrder,
  truncateModule,
  extractPptx,
  extractDocx,
  readModuleFile,
} from "../app/ingest.js";

const NO_TEXT = "This file has no readable text (it may be scanned images).";
const BAD_TYPE = "Please upload a PDF, PowerPoint (.pptx), Word (.docx) or text file.";

test("slideXmlToText decodes entities and joins runs per paragraph", () => {
  const xml =
    "<p:sld><a:p><a:r><a:t>TCP &amp; UDP</a:t></a:r><a:r><a:t> basics</a:t></a:r></a:p>" +
    "<a:p><a:r><a:t>&lt;SYN&gt; &quot;ok&quot; &apos;x&apos; &#65;&#x42;</a:t></a:r></a:p></p:sld>";
  assert.equal(slideXmlToText(xml), "TCP & UDP basics\n<SYN> \"ok\" 'x' AB");
});

test("docXmlToText turns paragraphs into lines", () => {
  const xml =
    "<w:body><w:p><w:r><w:t>Heading</w:t></w:r></w:p>" +
    '<w:p><w:r><w:t xml:space="preserve">Hello </w:t></w:r><w:r><w:t>A&amp;B</w:t></w:r></w:p></w:body>';
  assert.equal(docXmlToText(xml), "Heading\nHello A&B");
});

test("slideOrder sorts numerically", () => {
  assert.deepEqual(
    slideOrder(["ppt/slides/slide10.xml", "ppt/slides/slide2.xml", "ppt/slides/slide1.xml", "ppt/slides/_rels/slide1.xml.rels"]),
    ["ppt/slides/slide1.xml", "ppt/slides/slide2.xml", "ppt/slides/slide10.xml"],
  );
});

test("truncateModule keeps every part's first line and stays under max", () => {
  const parts = Array.from({ length: 10 }, (_, i) => ({
    label: `[slide ${i + 1}]`,
    text: `Title ${i + 1}\n` + "body ".repeat(500),
  }));
  const out = truncateModule(parts, 1000);
  assert.ok(out.length <= 1000);
  for (let i = 1; i <= 10; i++) assert.ok(out.includes(`Title ${i}`), "missing title " + i);
});

test("truncateModule returns everything when under max", () => {
  const out = truncateModule([{ label: "[page 1]", text: "a\nb" }, { label: "[page 2]", text: "c" }], 1000);
  assert.equal(out, "[page 1]\na\nb\n\n[page 2]\nc");
});

async function makePptx() {
  const zip = new JSZip();
  const slide = (t) => `<p:sld><a:p><a:r><a:t>${t}</a:t></a:r></a:p></p:sld>`;
  zip.file("ppt/slides/slide2.xml", slide("Second &amp; last"));
  zip.file("ppt/slides/slide1.xml", slide("First"));
  return zip;
}

test("extractPptx reads slides in order with markers", async () => {
  const r = await extractPptx(await makePptx());
  assert.equal(r.slides, 2);
  assert.equal(r.pages, 0);
  assert.ok(r.text.indexOf("[slide 1]\nFirst") >= 0);
  assert.ok(r.text.indexOf("[slide 2]\nSecond & last") > r.text.indexOf("[slide 1]"));
});

test("extractDocx chunks paragraphs into pages", async () => {
  const zip = new JSZip();
  const p = (t) => `<w:p><w:r><w:t>${t}</w:t></w:r></w:p>`;
  zip.file("word/document.xml", "<w:body>" + Array.from({ length: 10 }, (_, i) => p("para" + i + " " + "x".repeat(700))).join("") + "</w:body>");
  const r = await extractDocx(zip);
  assert.ok(r.pages >= 2);
  assert.equal(r.slides, 0);
  assert.ok(r.text.startsWith("[page 1]\npara0"));
  assert.ok(r.text.includes("[page 2]"));
});

test("readModuleFile reads pptx, txt and rejects bad input", async () => {
  const buf = await (await makePptx()).generateAsync({ type: "uint8array" });
  const pptx = { name: "Net Intro.pptx", arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) };
  const r = await readModuleFile(pptx, { JSZip });
  assert.equal(r.title, "Net Intro");
  assert.equal(r.slides, 2);

  const txt = { name: "notes.md", text: async () => "Hello\n\nWorld" };
  const t = await readModuleFile(txt);
  assert.equal(t.title, "notes");
  assert.equal(t.pages, 1);
  assert.ok(t.text.startsWith("[page 1]\nHello"));

  await assert.rejects(readModuleFile({ name: "e.txt", text: async () => "  \n " }), { message: NO_TEXT });
  await assert.rejects(readModuleFile({ name: "x.exe", text: async () => "x" }), { message: BAD_TYPE });
});

test("truncateModule caps heads so many long single-line parts all survive", () => {
  const parts = Array.from({ length: 60 }, (_, i) => ({
    label: `[page ${i + 1}]`,
    text: `Topic${i + 1} ` + "word ".repeat(1000),
  }));
  const out = truncateModule(parts, 25000);
  assert.ok(out.length <= 25000);
  for (let i = 1; i <= 60; i++) assert.ok(out.includes(`[page ${i}]\nTopic${i} `), "missing page " + i);
});

function fakePdfjs(pages) {
  return {
    getDocument: () => ({
      promise: Promise.resolve({
        numPages: pages.length,
        getPage: async (n) => ({ getTextContent: async () => ({ items: pages[n - 1] }) }),
      }),
    }),
  };
}
const pdfFile = { name: "Lec 1.pdf", arrayBuffer: async () => new ArrayBuffer(8) };

test("readModuleFile reads pdf pages with markers and line breaks", async () => {
  const pdfjsLib = fakePdfjs([
    [{ str: "Intro", hasEOL: true }, { str: "TCP", hasEOL: false }, { str: "handshake", hasEOL: true }],
    [{ str: "Page two", hasEOL: false }],
  ]);
  const r = await readModuleFile(pdfFile, { pdfjsLib });
  assert.equal(r.title, "Lec 1");
  assert.equal(r.pages, 2);
  assert.equal(r.slides, 0);
  assert.equal(r.text, "[page 1]\nIntro\nTCP handshake\n\n[page 2]\nPage two");
});

test("readModuleFile rejects an all-empty pdf", async () => {
  const pdfjsLib = fakePdfjs([[{ str: " ", hasEOL: false }], []]);
  await assert.rejects(readModuleFile(pdfFile, { pdfjsLib }), { message: NO_TEXT });
});

test("truncateModule keeps every label with ~150 long single-line parts", () => {
  const parts = Array.from({ length: 150 }, (_, i) => ({
    label: `[page ${i + 1}]`,
    text: `Topic${i + 1} ` + "word ".repeat(1000),
  }));
  const out = truncateModule(parts, 25000);
  assert.ok(out.length <= 25000);
  for (let i = 1; i <= 150; i++) assert.ok(out.includes(`[page ${i}]\nTopic${i} `), "missing page " + i);
});

test("truncateModule falls back to labels only when heads cannot fit", () => {
  const parts = Array.from({ length: 1500 }, (_, i) => ({ label: `[page ${i + 1}]`, text: "word ".repeat(100) }));
  const out = truncateModule(parts, 25000);
  assert.ok(out.length <= 25000);
  for (let i = 1; i <= 1500; i++) assert.ok(out.includes(`[page ${i}]`), "missing page " + i);
});

test("truncateModule merges parts into ranges when labels alone cannot fit (n=2500)", () => {
  const n = 2500;
  const parts = Array.from({ length: n }, (_, i) => ({ label: `[page ${i + 1}]`, text: `T${i + 1}\n` + "word ".repeat(50) }));
  const out = truncateModule(parts, 25000);
  assert.ok(out.length <= 25000);
  assert.ok(/\[pages? 1[-\]]/.test(out));
  const covered = new Set();
  for (const m of out.matchAll(/\[pages? (\d+)(?:-(\d+))?\]/g)) {
    const a = Number(m[1]), b = Number(m[2] ?? m[1]);
    for (let k = a; k <= b; k++) covered.add(k);
  }
  for (let k = 1; k <= n; k++) assert.ok(covered.has(k), "uncovered page " + k);
  assert.ok(/-2500\]/.test(out) || out.includes("[page 2500]"));
});

test("truncateModule merges slide ranges too (n=3000)", () => {
  const parts = Array.from({ length: 3000 }, (_, i) => ({ label: `[slide ${i + 1}]`, text: "x" }));
  const out = truncateModule(parts, 25000);
  assert.ok(out.length <= 25000);
  assert.ok(/\[slides \d+-3000\]/.test(out));
});

test("out-of-range numeric entities are kept as text instead of throwing", () => {
  const xml = "<a:p><a:r><a:t>bad &#x110000; &#99999999; ok &#65;</a:t></a:r></a:p>";
  assert.equal(slideXmlToText(xml), "bad &#x110000; &#99999999; ok A");
  assert.equal(docXmlToText("<w:p><w:r><w:t>x &#x7FFFFFFF;</w:t></w:r></w:p>"), "x &#x7FFFFFFF;");
});

test("line breaks and tabs inside a paragraph keep words apart", () => {
  const slide = "<a:p><a:r><a:t>Port</a:t></a:r><a:br/><a:r><a:t>numbers</a:t></a:r>" +
    "<a:br><a:rPr lang=\"en-US\"/></a:br><a:r><a:t>TCP</a:t></a:r><a:tab/><a:r><a:t>UDP</a:t></a:r></a:p>";
  assert.equal(slideXmlToText(slide), "Port\nnumbers\nTCP UDP");
  const doc = "<w:p><w:pPr><w:tabs><w:tab w:val=\"left\" w:pos=\"720\"/></w:tabs></w:pPr>" +
    "<w:r><w:t>Layer</w:t><w:tab/><w:t>4</w:t><w:br/><w:t>Transport</w:t><w:br w:type=\"page\"/><w:t>end</w:t></w:r></w:p>";
  assert.equal(docXmlToText(doc), "Layer 4\nTransport\nend");
});
