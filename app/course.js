// Turns an uploaded module into a validated course: outline first, then each lesson in order.
// No DOM here. AI output is untrusted: every reply is validated before it is used.
import {
  buildOutlinePrompt, parseOutlineReply, buildModuleLessonPrompt, buildRepairMessage,
  parseLessonReply, validateCourse, validateLesson, fallbackCard, moduleCitation, locateTopic,
} from "./core.js";
import { GOLDEN_LESSONS } from "./lessons.js";

export const OUTLINE_FAILED = "Couldn't read the structure of this module. Try a shorter file or a PDF.";
const LABELS = {
  lesson: "AI-built · structure checked, not hand-verified",
  card: "From your module · AI summary",
  osi: "Built-in · reviewed",
  fallback: "From your module · couldn't animate",
};

const NETWORK = /failed to fetch|networkerror|load failed|network ?error|err_network|econnrefused|enotfound/i;

// What to show when building the video fails. Raw library or network errors are never shown.
// Shown when the plan's monthly AI budget is used up.
export const QUOTA_TEXT = (e) => `${e?.message || "You've used this month's AI."} Upgrade under Pricing to keep going, or try the built-in lessons.`;

export function buildErrorText(e) {
  if (e?.code === "rate_limited") return "Claude is busy right now. Wait a moment and try again.";
  if (e?.code === "quota") return QUOTA_TEXT(e);
  if (e?.code === "not_granted") return "Building a video needs permission to use Claude. Allow it from the page's permissions, or try the sample module.";
  if (NETWORK.test(String(e?.message ?? ""))) return "Couldn't reach the AI. Check your connection and try again.";
  if (e?.code || !e?.message || e?.name !== "Error" || /^Internal error/.test(e.message)) return "Something went wrong while building the video. Try again.";
  return e.message;
}

function abortError() {
  const e = new Error("Aborted");
  e.name = "AbortError";
  return e;
}

// One AI call that stops waiting the moment the signal aborts, and ignores late replies.
async function call(ai, input, signal) {
  if (signal?.aborted) throw abortError();
  let off;
  const aborted = new Promise((_, reject) => {
    off = () => reject(abortError());
    signal?.addEventListener("abort", off, { once: true });
  });
  try {
    const reply = await Promise.race([Promise.resolve(ai(input, { modelTier: "default", signal })), aborted]);
    if (signal?.aborted) throw abortError();
    return reply;
  } finally {
    signal?.removeEventListener("abort", off);
  }
}

// Where the topic is covered, as { page, kind } or null; only numbers that exist in the module count.
function pageFor(item, module) {
  const loc = locateTopic(module, item.topic);
  if (!loc || !moduleCitation(`module_${loc.kind}${loc.n}`, { pages: module.pages, slides: module.slides })) return null;
  return loc;
}

// Ask, validate, and repair up to maxRepairs times. `check(reply)` returns {ok, value} or {ok:false, errors}.
// Failures from the AI itself (rate limits, network) count as failed attempts when `soft` is true.
async function attempt(ai, prompt, check, { signal, maxRepairs, soft }) {
  let messages = prompt;
  let lastError;
  for (let tries = 0; tries <= maxRepairs; tries++) {
    let reply;
    try {
      reply = await call(ai, messages, signal);
    } catch (err) {
      // Running out of the plan's AI budget stops the build; retrying can't help.
      if (err?.name === "AbortError" || err?.code === "quota" || !soft) throw err;
      lastError = err;
      messages = prompt;
      continue;
    }
    const text = String(reply?.text ?? "");
    const verdict = check(text);
    if (verdict.ok || verdict.final) return verdict;
    const turn = typeof messages === "string" ? [{ role: "user", content: messages }] : messages;
    messages = [
      ...turn,
      { role: "assistant", content: text },
      { role: "user", content: verdict.errors ? buildRepairMessage(verdict.errors) : "Reply with the outline JSON only." },
    ];
    lastError = undefined;
  }
  return { ok: false, lastError };
}

export async function buildCourse(module, ai, { onOutline, onItem, signal, maxRepairs = 2 } = {}) {
  const info = { pages: module.pages, slides: module.slides };
  const opts = { signal, maxRepairs };
  if (signal?.aborted) throw abortError();

  // 1. Outline. AI replies never get allowFallback.
  const out = await attempt(ai, buildOutlinePrompt(module), (text) => {
    const parsed = parseOutlineReply(text);
    if (parsed.kind === "error") return { ok: false, final: true, message: parsed.message };
    if (parsed.kind === "invalid") return { ok: false, errors: null };
    const v = validateCourse(parsed.lesson, info);
    return v.ok ? { ok: true, value: v.course } : { ok: false, errors: v.errors };
  }, { ...opts, soft: false });
  if (!out.ok) throw new Error(out.message ?? OUTLINE_FAILED);
  const outline = out.value;
  if (signal?.aborted) throw abortError();
  onOutline?.(outline);

  // 2. Items, strictly in order.
  const items = [];
  for (let i = 0; i < outline.items.length; i++) {
    if (signal?.aborted) throw abortError();
    const src = outline.items[i];
    let item;
    if (src.type === "lesson") {
      // A question the prompt builder rejects (e.g. only "<>") makes this item a fallback card.
      let prompt = null;
      try { prompt = buildModuleLessonPrompt(src, module, GOLDEN_LESSONS[0]); } catch {}
      const res = prompt === null ? { ok: false } : await attempt(ai, prompt, (text) => {
        const parsed = parseLessonReply(text);
        if (parsed.kind !== "lesson") return { ok: false, errors: [parsed.message] };
        const lesson = { ...parsed.lesson, question: src.question };
        const v = validateLesson(lesson, info);
        return v.ok ? { ok: true, value: v.lesson ?? lesson } : { ok: false, errors: v.errors };
      }, { ...opts, soft: true });
      item = res.ok
        ? { type: "lesson", topic: src.topic, question: src.question, lesson: res.value, label: LABELS.lesson }
        : (() => { const loc = pageFor(src, module); return { ...fallbackCard(src, loc?.n ?? null, loc?.kind), label: LABELS.fallback }; })();
    } else if (src.type === "card") {
      item = { ...src, label: LABELS.card };
    } else {
      item = { ...src, label: LABELS.osi };
    }
    if (signal?.aborted) throw abortError();
    items.push(item);
    onItem?.(i, item);
  }

  // 3. Check the assembled course. validateCourse strips lesson/label, so check a stripped copy
  // (lesson items reduced to topic/question) and return the full assembled object.
  const stripped = items.map((it) => (it.type === "lesson" ? { type: "lesson", topic: it.topic, question: it.question }
    : (({ label, ...rest }) => rest)(it)));
  const check = validateCourse({ ...outline, items: stripped }, info, { allowFallback: true });
  if (!check.ok) throw new Error("Internal error: assembled course failed validation: " + check.errors.join("; "));
  return { ...outline, items };
}
