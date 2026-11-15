// Phase 1: outline prompts. Phase 2 (after outlines exist): lesson prompts for each lesson item.
// Usage: node evals/course/make-prompts.mjs outline | lessons
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { buildOutlinePrompt, buildModuleLessonPrompt, parseOutlineReply } from "../../app/core.js";
import { GOLDEN_LESSONS } from "../../app/lessons.js";
import { SAMPLE_MODULE } from "../../app/samples/intro-module.js";

const here = (p) => new URL(p, import.meta.url);
const routingText = readFileSync(here("./module-routing.txt"), "utf8");
export const MODULES = {
  intro: SAMPLE_MODULE,
  routing: { title: "Week 7: Routing Basics", text: routingText, pages: 5, slides: 0 },
};
const phase = process.argv[2];
for (const [name, mod] of Object.entries(MODULES)) {
  if (phase === "outline") {
    writeFileSync(here(`./prompts/${name}-outline.txt`), buildOutlinePrompt(mod));
  } else if (phase === "lessons") {
    const f = here(`./outputs/${name}-outline.txt`);
    if (!existsSync(f)) continue;
    const p = parseOutlineReply(readFileSync(f, "utf8"));
    if (p.kind !== "lesson") continue;
    (p.lesson.items || []).forEach((it, i) => {
      if (it.type === "lesson") writeFileSync(here(`./prompts/${name}-lesson-${String(i).padStart(2, "0")}.txt`), buildModuleLessonPrompt(it, mod, GOLDEN_LESSONS[0]));
    });
  }
}
console.log("ok", phase);
