// V Learn app: player, narration, AI lessons, follow-ups, mic.
import {
  validateLesson, buildLessonPrompt, buildRepairMessage, parseLessonReply,
  buildFollowUpPrompt, sanitizeQuestion,
} from "./core.js";
import { GOLDEN_LESSONS } from "./lessons.js";
import { Stage } from "./engine.js";

const $ = (s) => document.querySelector(s);
const make = (tag, props = {}, text) => {
  const n = document.createElement(tag);
  Object.assign(n, props);
  if (text !== undefined) n.textContent = text;
  return n;
};

const state = { lesson: null, i: 0, playing: false, run: 0, voice: true, gen: 0, ask: 0, abort: null };
const stage = new Stage($("#stage"), { onPacketClick: () => $("#step-card").focus() });

let sample = null, tts = null, dictation = null;
const MAX_REPAIRS = 2;

// ---------- Voice ----------
let speakingWith = null;
function stopSpeech() {
  try { tts?.stop(); } catch {}
  try { window.speechSynthesis?.cancel(); } catch {}
  speakingWith = null;
}
function speak(text) {
  if (!state.voice) return Promise.resolve();
  stopSpeech();
  if (tts) {
    speakingWith = "tts";
    return tts.speak(text, { rate: Math.min(1.5, Math.max(0.7, stage.speed)) }).catch(() => {});
  }
  const synth = window.speechSynthesis;
  if (!synth || typeof SpeechSynthesisUtterance === "undefined") return Promise.resolve();
  return new Promise((resolve) => {
    const u = new SpeechSynthesisUtterance(text);
    u.rate = Math.min(1.4, Math.max(0.8, stage.speed));
    const done = () => { clearTimeout(guard); resolve(); };
    const guard = setTimeout(done, 1500 + text.length * 90);
    u.onend = done;
    u.onerror = done;
    speakingWith = "browser";
    synth.speak(u);
  });
}

// ---------- Rendering ----------
const nameOf = (id) => state.lesson.devices.find((d) => d.id === id)?.label || id;
const protoOf = (step) => (step.action.type === "highlight" ? "NOTE" : step.action.packet.protocol);

function renderLesson(lesson, badge) {
  pause();
  state.lesson = lesson;
  state.i = 0;
  state.finished = false;
  $("#lesson-title").textContent = lesson.title;
  $("#lesson-question").textContent = "“" + lesson.question + "”";
  const b = $("#lesson-badge");
  b.textContent = badge.text;
  b.dataset.kind = badge.kind;
  stage.load(lesson);

  const body = $("#capture");
  body.replaceChildren();
  lesson.steps.forEach((s, i) => {
    const tr = make("tr", { tabIndex: 0 });
    tr.dataset.i = i;
    const a = s.action;
    const route = a.type === "highlight" ? nameOf(a.device) : `${nameOf(a.path[0])} → ${nameOf(a.path[a.path.length - 1])}`;
    const info = a.type === "highlight" ? a.caption : a.type === "drop" ? `${a.packet.label} — blocked` : a.packet.label;
    const proto = make("span", { className: "proto" }, protoOf(s));
    proto.dataset.proto = protoOf(s);
    const cells = [make("td", { className: "num" }, String(i + 1)), make("td"), make("td", {}, route), make("td", {}, info)];
    cells[1].append(proto);
    tr.append(...cells);
    tr.addEventListener("click", () => goTo(i, true));
    tr.addEventListener("keydown", (e) => { if (e.key === "Enter") goTo(i, true); });
    body.append(tr);
  });

  const all = $("#sources-all");
  all.replaceChildren();
  for (const c of lesson.citations) {
    const li = make("li");
    li.append(make("a", { href: c.url, target: "_blank", rel: "noopener noreferrer" }, c.title));
    all.append(li);
  }
  $("#followup-answer").hidden = true;
  $("#followup-label").hidden = true;
  state.ask++;
  showStep(0);
  stage.play(lesson.steps[0], { instant: true });
  setPlaying(false);
  for (const chip of document.querySelectorAll(".chip[data-golden]")) {
    chip.setAttribute("aria-pressed", String(GOLDEN_LESSONS[+chip.dataset.golden] === lesson));
  }
}

function showStep(i) {
  const lesson = state.lesson;
  const s = lesson.steps[i];
  state.i = i;
  $("#step-count").textContent = `Step ${i + 1} of ${lesson.steps.length}`;
  const proto = $("#step-proto");
  proto.textContent = protoOf(s);
  proto.dataset.proto = protoOf(s);
  const a = s.action;
  $("#step-path").textContent = a.type === "highlight" ? `Inside: ${nameOf(a.device)}` : a.path.map(nameOf).join("  →  ");
  $("#step-narration").textContent = s.narration;

  const fields = $("#step-fields");
  fields.replaceChildren();
  const entries = a.type === "highlight" ? [] : Object.entries(a.packet.fields || {});
  if (a.type === "drop") entries.push(["result", "Blocked: " + a.reason]);
  for (const [k, v] of entries) {
    const row = make("div");
    row.append(make("dt", {}, k), make("dd", {}, v));
    fields.append(row);
  }
  fields.hidden = entries.length === 0;

  const src = $("#step-sources");
  src.replaceChildren();
  for (const id of s.citationIds) {
    const c = lesson.citations.find((x) => x.id === id);
    if (!c) continue;
    src.append(make("a", { href: c.url, target: "_blank", rel: "noopener noreferrer" }, c.title.split(":")[0]));
  }

  for (const tr of $("#capture").children) tr.classList.toggle("current", +tr.dataset.i === i);
  $("#capture").children[i]?.scrollIntoView({ block: "nearest" });
  $("#prev").disabled = i === 0;
  $("#next").disabled = i === lesson.steps.length - 1;
}

// On narrow screens the stage scrolls sideways; keep the action in view.
function followOnPhone(step) {
  const box = $(".stage-scroll");
  if (!box || box.scrollWidth <= box.clientWidth + 4) return;
  const a = step.action;
  const id = a.type === "highlight" ? a.device : a.path[a.path.length - 1];
  const vb = $("#stage").viewBox.baseVal;
  const x = (stage.pos[id].x / vb.width) * box.scrollWidth;
  box.scrollTo({ left: x - box.clientWidth / 2, behavior: "smooth" });
}

// ---------- Playback ----------
function setPlaying(on) {
  state.playing = on;
  const btn = $("#play");
  btn.setAttribute("aria-label", on ? "Pause" : "Play");
  btn.dataset.state = on ? "pause" : "play";
  $("#play-text").textContent = on ? "Pause" : state.i === 0 ? "Play lesson" : "Play";
}

async function runFrom(i) {
  const run = ++state.run;
  for (let k = i; k < state.lesson.steps.length; k++) {
    showStep(k);
    const step = state.lesson.steps[k];
    followOnPhone(step);
    // Without a voice, hold each step long enough to read the narration.
    const hold = state.voice ? 0 : Math.min(9000, Math.max(2500, step.narration.length * 55)) / stage.speed;
    await Promise.all([stage.play(step), speak(step.narration), new Promise((r) => setTimeout(r, hold))]);
    if (run !== state.run || !state.playing) return;
    await new Promise((r) => setTimeout(r, 350 / stage.speed));
    if (run !== state.run || !state.playing) return;
  }
  state.finished = true;
  setPlaying(false);
}

function play() {
  if (!state.lesson) return;
  const from = state.finished ? 0 : state.i;
  state.finished = false;
  setPlaying(true);
  runFrom(from);
}
function pause() {
  state.run++;
  stage.cancel();
  stopSpeech();
  setPlaying(false);
}
function goTo(i, animate) {
  const wasPlaying = state.playing;
  pause();
  state.finished = false;
  i = Math.max(0, Math.min(state.lesson.steps.length - 1, i));
  showStep(i);
  if (wasPlaying) { setPlaying(true); runFrom(i); return; }
  followOnPhone(state.lesson.steps[i]);
  if (animate) {
    stage.play(state.lesson.steps[i]);
    speak(state.lesson.steps[i].narration);
  } else stage.play(state.lesson.steps[i], { instant: true });
}

// ---------- AI lessons ----------
function setStatus(text, kind = "info") {
  const s = $("#ask-status");
  s.textContent = text;
  s.dataset.kind = kind;
  s.hidden = !text;
}

async function generateLesson(question) {
  let q;
  try { q = sanitizeQuestion(question); } catch (e) { return setStatus(e.message, "error"); }
  if (!sample) return setStatus("Custom questions need Claude. Open this page in Claude while signed in, or pick a ready-made lesson below.", "error");

  pause();
  const gen = ++state.gen;
  state.abort?.abort();
  const controller = new AbortController();
  state.abort = controller;
  const stale = () => gen !== state.gen;
  setBusy(true);
  setStatus("Planning your lesson…");
  const messages = [{ role: "user", content: buildLessonPrompt(q, GOLDEN_LESSONS[0]) }];
  try {
    for (let attempt = 0; attempt <= MAX_REPAIRS; attempt++) {
      const reply = await sample(messages, { modelTier: "default", cache: false, signal: controller.signal });
      if (stale()) return;
      const parsed = parseLessonReply(reply.text);
      if (parsed.kind === "error") return setStatus(parsed.message, "error");
      let errors;
      if (parsed.kind === "invalid") errors = [parsed.message + " Reply with the lesson JSON only."];
      else {
        parsed.lesson.question = q;
        const result = validateLesson(parsed.lesson);
        if (result.ok) {
          renderLesson(result.lesson, { text: "AI-built · structure checked, not hand-verified", kind: "ai" });
          setStatus("");
          $("#lesson").scrollIntoView({ behavior: "smooth", block: "start" });
          return;
        }
        errors = result.errors;
      }
      if (attempt === MAX_REPAIRS) break;
      setStatus(`Checking it… found ${errors.length} problem${errors.length === 1 ? "" : "s"}, sending them back to fix (try ${attempt + 2} of ${MAX_REPAIRS + 1})`);
      messages.push({ role: "assistant", content: reply.text.slice(0, 20000) }, { role: "user", content: buildRepairMessage(errors) });
    }
    setStatus("I couldn't build a lesson for that one that passed every accuracy check, so I won't show a shaky version. Try rephrasing, or pick a ready-made lesson.", "error");
  } catch (e) {
    if (stale() || e?.name === "AbortError" || e?.code === "aborted") return;
    const msg = e?.code === "rate_limited" ? "Claude is busy right now. Wait a moment and try again."
      : e?.code === "not_granted" ? "Custom questions need permission to use Claude. Allow it from the page's permissions, or pick a ready-made lesson."
      : "Something went wrong while building the lesson. Try again.";
    setStatus(msg, "error");
  } finally {
    if (!stale()) setBusy(false);
  }
}

function setBusy(on) {
  $("#ask-btn").disabled = on;
  for (const b of document.querySelectorAll(".suggest")) b.disabled = on;
}

// ---------- Follow-ups ----------
async function askFollowUp(question) {
  const out = $("#followup-answer");
  let q;
  try { q = sanitizeQuestion(question); } catch (e) { out.hidden = false; out.textContent = e.message; return; }
  if (!sample) { out.hidden = false; out.textContent = "Follow-up questions need Claude. Open this page in Claude while signed in."; return; }
  pause();
  const ask = ++state.ask;
  const lesson = state.lesson;
  const live = () => ask === state.ask && lesson === state.lesson;
  const btn = $("#followup-btn");
  btn.disabled = true;
  out.hidden = false;
  out.textContent = "Thinking…";
  try {
    const r = await sample(buildFollowUpPrompt(lesson, state.i, q), {
      modelTier: "quick", cache: false,
      onText: ({ text }) => { if (live()) out.textContent = text; },
    });
    if (!live()) return;
    out.textContent = r.text.trim();
    $("#followup-label").hidden = false;
    speak(out.textContent);
  } catch (e) {
    out.textContent = e?.code === "rate_limited" ? "Claude is busy right now. Try again in a moment." : "I couldn't get an answer. Try again.";
  } finally {
    btn.disabled = false;
  }
}

// ---------- Mic ----------
let micTarget = null;
function wireMic(button, input) {
  button.addEventListener("click", () => {
    if (!dictation) return;
    if (micTarget) { dictation.stop().catch(() => {}); return; }
    micTarget = input;
    dictation.start().catch((e) => {
      micTarget = null;
      if (e?.code === "not_granted") for (const b of document.querySelectorAll(".mic")) b.hidden = true;
    });
  });
}

// ---------- Wiring ----------
function init() {
  const lib = $("#library");
  GOLDEN_LESSONS.forEach((l, i) => {
    const chip = make("button", { type: "button", className: "chip" }, l.title);
    chip.dataset.golden = i;
    chip.addEventListener("click", () => {
      renderLesson(l, { text: "Verified lesson · hand-checked", kind: "verified" });
      $("#lesson").scrollIntoView({ behavior: "smooth", block: "start" });
    });
    lib.append(chip);
  });

  for (const s of document.querySelectorAll(".suggest")) {
    s.addEventListener("click", () => { $("#question").value = s.textContent; generateLesson(s.textContent); });
  }

  $("#ask-form").addEventListener("submit", (e) => { e.preventDefault(); generateLesson($("#question").value); });
  $("#followup-form").addEventListener("submit", (e) => { e.preventDefault(); askFollowUp($("#followup-q").value); });

  $("#play").addEventListener("click", () => (state.playing ? pause() : play()));
  $("#prev").addEventListener("click", () => goTo(state.i - 1, true));
  $("#next").addEventListener("click", () => goTo(state.i + 1, true));
  $("#replay").addEventListener("click", () => goTo(state.i, true));
  $("#speed").addEventListener("change", (e) => { stage.speed = +e.target.value; });
  $("#voice").addEventListener("click", (e) => {
    state.voice = !state.voice;
    e.currentTarget.setAttribute("aria-pressed", String(state.voice));
    $("#voice-text").textContent = state.voice ? "Voice on" : "Voice off";
    if (!state.voice) stopSpeech();
  });

  document.addEventListener("keydown", (e) => {
    if (e.target.closest("input, textarea, select, button, [contenteditable]")) return;
    if (e.key === " ") { e.preventDefault(); state.playing ? pause() : play(); }
    else if (e.key === "ArrowRight") goTo(state.i + 1, true);
    else if (e.key === "ArrowLeft") goTo(state.i - 1, true);
  });

  wireMic($("#ask-mic"), $("#question"));
  wireMic($("#followup-mic"), $("#followup-q"));

  renderLesson(GOLDEN_LESSONS[0], { text: "Verified lesson · hand-checked", kind: "verified" });

  // Light up Claude-powered features when the viewer can run them.
  const use = window.claude?.use?.bind(window.claude);
  if (!use) { markAiAvailability(false); return; }
  use("sample").then((s) => { sample = s; markAiAvailability(!!s); }).catch(() => markAiAvailability(false));
  use("tts").then((t) => { tts = t; }).catch(() => {});
  use("dictation").then((d) => {
    dictation = d;
    if (!d) return;
    for (const b of document.querySelectorAll(".mic")) b.hidden = false;
    d.onFinal(({ text }) => { if (micTarget) micTarget.value = (micTarget.value + " " + text).trim(); });
    d.onState(({ state: st }) => {
      for (const b of document.querySelectorAll(".mic")) b.setAttribute("aria-pressed", String(st === "listening" && micTarget && b.dataset.for === micTarget.id));
      if (st === "idle") micTarget = null;
    });
  }).catch(() => {});
}

function markAiAvailability(on) {
  document.body.dataset.ai = on ? "on" : "off";
}

init();
