import { test } from "node:test";
import assert from "node:assert/strict";
import { validateLesson } from "../app/core.js";
import { GOLDEN_LESSONS } from "../app/lessons.js";

test("there are at least four golden lessons", () => {
  assert.ok(GOLDEN_LESSONS.length >= 4);
});

for (const lesson of GOLDEN_LESSONS) {
  test(`golden lesson passes validation: ${lesson.title}`, () => {
    const r = validateLesson(lesson);
    assert.equal(r.ok, true, r.ok ? "" : r.errors.join("\n"));
  });
}

test("golden lessons have unique titles", () => {
  const titles = GOLDEN_LESSONS.map((l) => l.title);
  assert.equal(new Set(titles).size, titles.length);
});

test("golden lessons only use documentation or private IP addresses", () => {
  const ipRe = /\b(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})\b/g;
  const ok = (a, b, c) =>
    (a === 192 && b === 0 && c === 2) ||
    (a === 198 && b === 51 && c === 100) ||
    (a === 203 && b === 0 && c === 113) ||
    a === 10 ||
    (a === 192 && b === 168) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 0 && b === 0 && c === 0) ||
    (a === 255 && b === 255 && c === 255);
  for (const lesson of GOLDEN_LESSONS) {
    for (const m of JSON.stringify(lesson).matchAll(ipRe)) {
      const [a, b, c] = m.slice(1, 4).map(Number);
      assert.ok(ok(a, b, c), `${lesson.title} uses ${m[0]}`);
    }
  }
});
