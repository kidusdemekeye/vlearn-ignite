import { test } from "node:test";
import assert from "node:assert/strict";
import { validateCourse, validateLesson, moduleCitation, SOURCE_LIBRARY } from "../app/core.js";
import { SAMPLE_MODULE, SAMPLE_COURSE } from "../app/samples/intro-module.js";

const info = { pages: SAMPLE_MODULE.pages, slides: SAMPLE_MODULE.slides };
const LABELS = {
  lesson: "AI-built · structure checked, not hand-verified",
  card: "From your module · AI summary",
  osi: "Built-in · reviewed",
};

test("sample module has 6 marked pages and no slides", () => {
  assert.equal(SAMPLE_MODULE.title, "Intro to Networking: How your laptop gets online");
  assert.equal(SAMPLE_MODULE.pages, 6);
  assert.equal(SAMPLE_MODULE.slides, 0);
  const marks = [...SAMPLE_MODULE.text.matchAll(/\[page (\d+)\]/g)].map((m) => Number(m[1]));
  assert.deepEqual(marks, [1, 2, 3, 4, 5, 6]);
});

test("sample course passes validateCourse with the module's page count", () => {
  const r = validateCourse(SAMPLE_COURSE, info);
  assert.equal(r.ok, true, JSON.stringify(r.errors));
  assert.ok(SAMPLE_COURSE.items.length >= 6 && SAMPLE_COURSE.items.length <= 8);
});

test("sample course mixes osi, lessons and a card citing the module", () => {
  const types = SAMPLE_COURSE.items.map((it) => it.type);
  assert.ok(SAMPLE_COURSE.items.some((it) => it.type === "osi" && it.focus === "encapsulation"));
  assert.ok(types.filter((t) => t === "lesson").length >= 4);
  assert.ok(SAMPLE_COURSE.items.some((it) => it.type === "card" && it.citationIds.some((c) => c.startsWith("module_p"))));
  assert.ok(!SAMPLE_COURSE.items.some((it) => it.fallback), "sample has no fallback cards");
});

test("every lesson passes validateLesson and matches its outline question", () => {
  for (const it of SAMPLE_COURSE.items.filter((x) => x.type === "lesson")) {
    const r = validateLesson(it.lesson, info);
    assert.equal(r.ok, true, it.topic + ": " + JSON.stringify(r.errors));
    assert.equal(it.lesson.question, it.question);
    assert.ok(it.lesson.steps.length >= 4 && it.lesson.steps.length <= 16, it.topic + " step count");
  }
});

test("each item carries the label buildCourse would set", () => {
  for (const it of SAMPLE_COURSE.items) assert.equal(it.label, LABELS[it.type], it.type);
});

test("every module citation is in range; library citations are exact", () => {
  const ids = [];
  for (const it of SAMPLE_COURSE.items) {
    if (it.type === "card") ids.push(...it.citationIds);
    if (it.type === "lesson") for (const s of it.lesson.steps) ids.push(...s.citationIds);
  }
  for (const id of ids.filter((x) => x.startsWith("module_"))) assert.ok(moduleCitation(id, info), id);
  for (const c of SAMPLE_COURSE.citations) assert.deepEqual(c, SOURCE_LIBRARY.find((s) => s.id === c.id));
});

test("the Wi-Fi lesson uses 802.11 with an access point and cites the standard", () => {
  const wifi = SAMPLE_COURSE.items.find((it) => it.type === "lesson" && it.lesson.devices.some((d) => d.kind === "access_point"));
  assert.ok(wifi);
  const protos = wifi.lesson.steps.filter((s) => s.action.packet).map((s) => s.action.packet.protocol);
  assert.ok(protos.includes("802.11"));
  assert.ok(wifi.lesson.citations.some((c) => c.id === "ieee80211_2020"));
  const labels = wifi.lesson.steps.map((s) => s.action.packet?.label ?? "").join(" | ").toLowerCase();
  for (const w of ["beacon", "probe request", "probe response", "authentication", "association request", "association response"]) {
    assert.ok(labels.includes(w), "missing " + w);
  }
});

test("the DNS server DHCP hands out is the resolver the DNS lesson asks", () => {
  const lessons = SAMPLE_COURSE.items.filter((it) => it.type === "lesson").map((it) => it.lesson);
  const ack = lessons.flatMap((l) => l.steps).find((s) => s.action.packet?.label.startsWith("DHCPACK"));
  const query = lessons.flatMap((l) => l.steps).find((s) => s.action.packet?.protocol === "DNS");
  assert.ok(query.action.packet.fields.resolver.startsWith(ack.action.packet.fields.DNS));
});
