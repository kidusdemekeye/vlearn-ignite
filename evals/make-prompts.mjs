// Writes the exact prompt the app sends for each eval question.
import { readFileSync, writeFileSync } from "node:fs";
import { buildLessonPrompt } from "../app/core.js";
import { GOLDEN_LESSONS } from "../app/lessons.js";
const qs = JSON.parse(readFileSync(new URL("./questions.json", import.meta.url)));
qs.forEach((q, i) => writeFileSync(new URL(`./prompts/q${String(i + 1).padStart(2, "0")}.txt`, import.meta.url), buildLessonPrompt(q, GOLDEN_LESSONS[0])));
console.log(`wrote ${qs.length} prompts`);
