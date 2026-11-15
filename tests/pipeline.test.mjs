import { test } from "node:test";
import assert from "node:assert/strict";
import { buildCourse } from "../app/course.js";
import { locateTopic, validateCourse } from "../app/core.js";
import { GOLDEN_LESSONS } from "../app/lessons.js";

const NOSTRUCT = "Couldn't read the structure of this module. Try a shorter file or a PDF.";
const module_ = {
  title: "module3.pdf", pages: 4, slides: 0,
  text: "[page 1] Intro to networks.\n[page 2] Cables and topologies are covered here.\n[page 3] A DNS lookup turns a name into an address. The resolver asks servers.\n[page 4] The end.",
};
const card = { type: "card", title: "Cable types", points: ["Copper carries electrical signals", "Fibre carries light"], narration: "Cables carry bits.", citationIds: ["module_p2"] };
const outline = (items) => ({ version: 1, title: "Module 3", source: "module3.pdf", items, citations: [] });
const lessonItem = (topic = "DNS lookup") => ({ type: "lesson", topic, question: "How does a DNS lookup work?" });
const goodLesson = () => ({ ...GOLDEN_LESSONS[0], question: "How does a DNS lookup work?" });
const json = (o) => ({ text: JSON.stringify(o) });

// Scripted fake ai: each entry is a reply object, a string, or an Error to reject with.
function fake(script) {
  const calls = [];
  const fn = async (input, opts) => {
    calls.push({ input, opts });
    const next = script.shift();
    if (next === undefined) throw new Error("script exhausted");
    if (typeof next === "function") return next(opts);
    if (next instanceof Error) throw next;
    return typeof next === "string" ? { text: next } : next;
  };
  fn.calls = calls;
  return fn;
}
const rateLimited = () => Object.assign(new Error("slow down"), { code: "rate_limited" });

test("valid outline on first try: onOutline once, items reported in order, cards and osi labelled", async () => {
  const items = [card, { type: "osi", focus: "layers" }, { type: "card", ...card, title: "More" }];
  const ai = fake([json(outline(items))]);
  const seen = []; let outlines = 0;
  const result = await buildCourse(module_, ai, { onOutline: () => outlines++, onItem: (i, it) => seen.push([i, it]) });
  assert.equal(outlines, 1);
  assert.deepEqual(seen.map((s) => s[0]), [0, 1, 2]);
  assert.equal(seen[0][1].label, "From your module · AI summary");
  assert.equal(seen[1][1].label, "Built-in · reviewed");
  assert.equal(result.items.length, 3);
  assert.equal(ai.calls.length, 1);
  assert.equal(ai.calls[0].opts.modelTier, "default");
});

test("lessons are generated one at a time in order and carry lesson and label", async () => {
  const ai = fake([json(outline([lessonItem("DNS lookup"), card, lessonItem("DNS again")])), json(goodLesson()), json(goodLesson())]);
  const seen = [];
  const result = await buildCourse(module_, ai, { onItem: (i, it) => seen.push(i) });
  assert.deepEqual(seen, [0, 1, 2]);
  assert.equal(result.items[0].type, "lesson");
  assert.equal(result.items[0].lesson.question, "How does a DNS lookup work?");
  assert.equal(result.items[0].label, "AI-built · structure checked, not hand-verified");
  assert.equal(result.items[1].label, "From your module · AI summary");
  assert.equal(result.title, "Module 3");
});

test("invalid lesson twice then valid: the valid one is used", async () => {
  const ai = fake([json(outline([lessonItem()])), json({ nope: 1 }), "not json at all", json(goodLesson())]);
  const result = await buildCourse(module_, ai, {});
  assert.equal(result.items[0].type, "lesson");
  assert.equal(ai.calls.length, 4);
  // repair round carries the earlier reply and a repair message
  const last = ai.calls[3].input;
  assert.ok(Array.isArray(last) && last.at(-1).role === "user");
});

test("invalid lesson 3 times: fallback card citing the module page", async () => {
  const ai = fake([json(outline([lessonItem()])), json({}), json({}), json({})]);
  const seen = [];
  const result = await buildCourse(module_, ai, { onItem: (i, it) => seen.push(it) });
  const it = result.items[0];
  assert.equal(it.type, "card");
  assert.equal(it.fallback, true);
  assert.equal(it.label, "From your module · couldn't animate");
  assert.deepEqual(it.citationIds, ["module_p3"]); // last marker at or before the topic hit
  assert.equal(seen[0], it);
});

test("fallback with no page marker near the topic has no page", async () => {
  const m = { title: "x.txt", pages: 0, slides: 0, text: "Plain text about handshakes." };
  const ai = fake([json(outline([lessonItem("TCP handshake")])), json({}), json({}), json({})]);
  const result = await buildCourse(m, ai, {});
  assert.equal(result.items[0].fallback, true);
  assert.deepEqual(result.items[0].citationIds, []);
});

test("rate_limited during a lesson counts as a failed attempt, then fallback", async () => {
  const ai = fake([json(outline([lessonItem()])), rateLimited(), rateLimited(), rateLimited()]);
  const result = await buildCourse(module_, ai, {});
  assert.equal(result.items[0].fallback, true);
  assert.equal(ai.calls.length, 4);
});

test("rate_limited once then a valid lesson is used", async () => {
  const ai = fake([json(outline([lessonItem()])), rateLimited(), json(goodLesson())]);
  const result = await buildCourse(module_, ai, {});
  assert.equal(result.items[0].type, "lesson");
});

test("outline invalid 3 times rejects with the structure message and never calls onOutline", async () => {
  const ai = fake([json({ version: 1 }), "garbage", json({ version: 1 })]);
  let called = false;
  await assert.rejects(buildCourse(module_, ai, { onOutline: () => { called = true; } }), { message: NOSTRUCT });
  assert.equal(called, false);
  assert.equal(ai.calls.length, 3);
});

test("outline that tries the fallback key is rejected", async () => {
  const fb = { ...card, fallback: true };
  const ai = fake([json(outline([fb])), json(outline([fb])), json(outline([fb]))]);
  await assert.rejects(buildCourse(module_, ai, {}), { message: NOSTRUCT });
});

test("outline repaired on the second try", async () => {
  const ai = fake([json({ version: 1 }), json(outline([card]))]);
  const result = await buildCourse(module_, ai, {});
  assert.equal(result.items.length, 1);
});

test("outline {error} reply rejects with that message", async () => {
  const ai = fake([json({ error: "V Learn teaches networking." })]);
  await assert.rejects(buildCourse(module_, ai, {}), { message: "V Learn teaches networking." });
  assert.equal(ai.calls.length, 1);
});

test("AI error during the outline is rethrown", async () => {
  const ai = fake([rateLimited()]);
  await assert.rejects(buildCourse(module_, ai, {}), { code: "rate_limited" });
});

test("abort after the outline: no onItem calls, no more AI calls, AbortError", async () => {
  const ctl = new AbortController();
  const ai = fake([json(outline([lessonItem(), card])), () => new Promise(() => {})]);
  const seen = [];
  const p = buildCourse(module_, ai, {
    signal: ctl.signal, onOutline: () => setTimeout(() => ctl.abort(), 0), onItem: (i) => seen.push(i),
  });
  await assert.rejects(p, { name: "AbortError" });
  assert.deepEqual(seen, []);
  assert.equal(ai.calls.length <= 2, true);
  const n = ai.calls.length;
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(ai.calls.length, n);
});

test("reply that arrives after abort is ignored", async () => {
  const ctl = new AbortController();
  const ai = fake([json(outline([lessonItem()])), () => { ctl.abort(); return json(goodLesson()); }]);
  const seen = [];
  await assert.rejects(buildCourse(module_, ai, { signal: ctl.signal, onItem: (i) => seen.push(i) }), { name: "AbortError" });
  assert.deepEqual(seen, []);
});

test("already-aborted signal makes no AI call", async () => {
  const ctl = new AbortController(); ctl.abort();
  const ai = fake([]);
  await assert.rejects(buildCourse(module_, ai, { signal: ctl.signal }), { name: "AbortError" });
  assert.equal(ai.calls.length, 0);
});

test("signal is passed to every ai call", async () => {
  const ctl = new AbortController();
  const ai = fake([json(outline([lessonItem()])), json(goodLesson())]);
  await buildCourse(module_, ai, { signal: ctl.signal });
  assert.ok(ai.calls.every((c) => c.opts.signal === ctl.signal));
});

test("fallback for a topic with no hit in the text is uncited", async () => {
  const ai = fake([json(outline([lessonItem("Quantum zebras")])), json({}), json({}), json({})]);
  const result = await buildCourse(module_, ai, {});
  assert.equal(result.items[0].fallback, true);
  assert.deepEqual(result.items[0].citationIds, []);
});

test("slide-only module: fallback cites module_sN and the course validates", async () => {
  const m = { title: "deck.pptx", pages: 0, slides: 3, text: "[slide 1] Intro\n[slide 2] The TCP handshake uses SYN packets.\n[slide 3] End" };
  const ai = fake([json(outline([lessonItem("TCP handshake")])), json({}), json({}), json({})]);
  const result = await buildCourse(m, ai, {});
  assert.deepEqual(result.items[0].citationIds, ["module_s2"]);
  assert.equal(result.items[0].points[0], "Covered in your module on slide 2");
  const stripped = { ...result, items: [{ ...result.items[0], label: undefined }] };
  delete stripped.items[0].label;
  assert.equal(validateCourse(stripped, { slides: 3 }, { allowFallback: true }).ok, true);
});

test("locateTopic: last marker at or before the hit, else first after, else null", () => {
  const m = { text: "[page 1] a\n[page 2] b zebra c\n[page 3] d" };
  assert.deepEqual(locateTopic(m, "Zebra stuff"), { kind: "p", n: 2 });
  assert.deepEqual(locateTopic({ text: "intro zebra\n[slide 4] x" }, "zebra"), { kind: "s", n: 4 });
  assert.equal(locateTopic(m, "nothing here"), null);
  assert.equal(locateTopic({ text: "zebra only" }, "zebra"), null);
});

test("an outline question the prompt builder rejects becomes a fallback card, the build continues", async () => {
  const bad = { type: "lesson", topic: "DNS lookup", question: "<>" };
  const ai = fake([json(outline([bad, card]))]);
  const seen = [];
  const result = await buildCourse(module_, ai, { onItem: (i, it) => seen.push(it) });
  assert.equal(ai.calls.length, 1); // outline only: no lesson call for the bad question
  assert.equal(result.items[0].type, "card");
  assert.equal(result.items[0].fallback, true);
  assert.equal(result.items[0].label, "From your module · couldn't animate");
  assert.equal(result.items[1].title, "Cable types");
  assert.equal(seen.length, 2);
});

test("buildErrorText: network failures get a connection message; existing messages unchanged", async () => {
  const { buildErrorText, OUTLINE_FAILED } = await import("../app/course.js");
  const NET = "Couldn't reach the AI. Check your connection and try again.";
  const GEN = "Something went wrong while building the video. Try again.";
  assert.equal(buildErrorText(new TypeError("Failed to fetch")), NET);
  assert.equal(buildErrorText(new TypeError("NetworkError when attempting to fetch resource.")), NET);
  assert.equal(buildErrorText(new TypeError("Load failed")), NET);
  assert.equal(buildErrorText(rateLimited()), "Claude is busy right now. Wait a moment and try again.");
  assert.match(buildErrorText(Object.assign(new Error("x"), { code: "not_granted" })), /needs permission to use Claude/);
  assert.equal(buildErrorText(Object.assign(new Error("AI request failed"), { code: "unavailable" })), GEN);
  assert.equal(buildErrorText(new Error("Internal error: assembled course failed validation: x")), GEN);
  assert.equal(buildErrorText(new SyntaxError("Unexpected token < in JSON at position 0")), GEN);
  assert.equal(buildErrorText(undefined), GEN);
  assert.equal(buildErrorText(new Error(OUTLINE_FAILED)), OUTLINE_FAILED);
  assert.equal(buildErrorText(new Error("This module is not about networking.")), "This module is not about networking.");
});
