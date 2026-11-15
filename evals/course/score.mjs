// Scores outlines and lessons exactly as the app validates them; writes results.json.
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { parseOutlineReply, parseLessonReply, validateCourse, validateLesson } from "../../app/core.js";
import { MODULES } from "./make-prompts.mjs";

const here = (p) => new URL(p, import.meta.url);
const out = { outlines: [], lessons: [] };
for (const [name, mod] of Object.entries(MODULES)) {
  const info = { pages: mod.pages, slides: mod.slides };
  let raw;
  try { raw = readFileSync(here(`./outputs/${name}-outline.txt`), "utf8"); } catch { continue; }
  const p = parseOutlineReply(raw);
  const v = p.kind === "lesson" ? validateCourse(p.lesson, info) : { ok: false, errors: [p.kind] };
  out.outlines.push({ module: name, valid: v.ok, items: p.lesson?.items?.map((i) => i.type), errors: v.ok ? [] : v.errors });
  for (const f of readdirSync(here("./outputs/")).filter((f) => f.startsWith(name + "-lesson-")).sort()) {
    const lp = parseLessonReply(readFileSync(here(`./outputs/${f}`), "utf8"));
    const lv = lp.kind === "lesson" ? validateLesson(lp.lesson, info) : { ok: false, errors: [lp.kind] };
    out.lessons.push({ file: f, valid: lv.ok, steps: lp.lesson?.steps?.length, errors: lv.ok ? [] : lv.errors.slice(0, 5) });
  }
}
writeFileSync(here("./results.json"), JSON.stringify(out, null, 2));
for (const o of out.outlines) console.log("outline", o.module, o.valid ? "valid" : "INVALID", o.items?.join(","), o.errors.slice(0, 3).join(" | "));
for (const l of out.lessons) console.log("lesson", l.file, l.valid ? "valid" : "INVALID", l.errors.join(" | "));
