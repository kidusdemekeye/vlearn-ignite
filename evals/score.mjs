// Parses and validates each model reply exactly as the app does, and writes results.json.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { parseLessonReply, validateLesson } from "../app/core.js";
const qs = JSON.parse(readFileSync(new URL("./questions.json", import.meta.url)));
const rows = qs.map((q, i) => {
  const id = `q${String(i + 1).padStart(2, "0")}`;
  const f = new URL(`./outputs/${id}.txt`, import.meta.url);
  if (!existsSync(f)) return { id, q, result: "missing" };
  const parsed = parseLessonReply(readFileSync(f, "utf8"));
  if (parsed.kind === "error") return { id, q, result: "declined", message: parsed.message };
  if (parsed.kind === "invalid") return { id, q, result: "unparseable" };
  parsed.lesson.question = q;
  const v = validateLesson(parsed.lesson);
  return v.ok
    ? { id, q, result: "valid", steps: v.lesson.steps.length, devices: v.lesson.devices.length, citations: v.lesson.citations.map((c) => c.id) }
    : { id, q, result: "invalid", errors: v.errors };
});
writeFileSync(new URL("./results.json", import.meta.url), JSON.stringify(rows, null, 2));
for (const r of rows) console.log(r.id, r.result, r.errors ? r.errors.slice(0, 3).join(" | ") : "");
