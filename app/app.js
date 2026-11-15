// V Learn app: player (2D/3D), narration, AI lessons, follow-ups, mic, and module-to-video mode.
import {
  validateLesson, buildLessonPrompt, buildRepairMessage, parseLessonReply,
  buildFollowUpPrompt, sanitizeQuestion, moduleCitation,
} from "./core.js";
import { GOLDEN_LESSONS } from "./lessons.js";
import { Stage } from "./engine.js";
import { connectAi } from "./ai.js";
import { readModuleFile } from "./ingest.js";
import { buildCourse } from "./course.js";
import { osiSteps, OSI_LAYERS, OSI_CITATIONS } from "./osi.js";
import { SAMPLE_MODULE, SAMPLE_COURSE } from "./samples/intro-module.js";

const $ = (s) => document.querySelector(s);
const make = (tag, props = {}, text) => {
  const n = document.createElement(tag);
  Object.assign(n, props);
  if (text !== undefined) n.textContent = text;
  return n;
};
const delay = (ms) => new Promise((r) => setTimeout(r, ms));

const GOLDEN_BADGE = { text: "Built-in · reviewed", kind: "verified" };
const AI_BADGE = { text: "AI-built · structure checked, not hand-verified", kind: "ai" };

const state = {
  lesson: null, i: 0, playing: false, run: 0, voice: true, gen: 0, ask: 0, abort: null,
  view: "2d", speed: 1, single: null, finished: false,
};
const stage2d = new Stage($("#stage"), { onPacketClick: () => $("#step-card").focus() });
let stage3d = null, load3d = null, no3d = false;
const cur = () => (state.view === "3d" && stage3d ? stage3d : stage2d);

let sample = null, tts = null, dictation = null;
const MAX_REPAIRS = 2;

// ---------- Voice ----------
function stopSpeech() {
  try { tts?.stop(); } catch {}
  try { window.speechSynthesis?.cancel(); } catch {}
}
function speak(text) {
  if (!state.voice) return Promise.resolve();
  stopSpeech();
  if (tts) return Promise.resolve(tts.speak(text, { rate: Math.min(1.5, Math.max(0.7, state.speed)) })).catch(() => {});
  const synth = window.speechSynthesis;
  if (!synth || typeof SpeechSynthesisUtterance === "undefined") return Promise.resolve();
  return new Promise((resolve) => {
    const u = new SpeechSynthesisUtterance(text);
    u.rate = Math.min(1.4, Math.max(0.8, state.speed));
    const done = () => { clearTimeout(guard); resolve(); };
    const guard = setTimeout(done, 1500 + text.length * 90);
    u.onend = done;
    u.onerror = done;
    synth.speak(u);
  });
}
const canSpeak = () => state.voice && (tts || (window.speechSynthesis && typeof SpeechSynthesisUtterance !== "undefined"));
const holdFor = (text) => Math.min(9000, Math.max(2500, String(text).length * 55)) / state.speed;
// Speak, or (voice off / no speech engine) hold long enough to read the text.
const narrate = (text) => (canSpeak() ? speak(text) : delay(holdFor(text)));

// ---------- 2D / 3D ----------
function webglLikely() {
  try {
    const c = document.createElement("canvas");
    return !!(window.WebGLRenderingContext && (c.getContext("webgl2") || c.getContext("webgl")));
  } catch { return false; }
}

function disable3d(note) {
  no3d = true;
  stage3d = null;
  $("#view3d").replaceChildren();
  $("#view-3d").disabled = true;
  const n = $("#view-note");
  n.textContent = note;
  n.hidden = false;
}

// Loads three.js and the 3D stage on first use. Resolves to the stage, or null (then 2D only).
function ensure3d() {
  if (stage3d) return Promise.resolve(stage3d);
  if (no3d) return Promise.resolve(null);
  load3d ||= import("./engine3d.js").then(({ Stage3D }) => {
    if (!Stage3D.supported()) throw new Error("WebGL is not available");
    $("#view3d").hidden = false; // measure a real size on creation
    const s = new Stage3D($("#view3d"), { onPacketClick: () => $("#step-card").focus() });
    s.speed = state.speed;
    stage3d = s;
    return s;
  }).catch((e) => {
    console.warn("3D view unavailable:", e);
    disable3d("3D isn't available on this device, so V Learn is showing 2D.");
    return null;
  });
  return load3d;
}

function syncToggle() {
  $("#view-2d").setAttribute("aria-pressed", String(state.view === "2d"));
  $("#view-3d").setAttribute("aria-pressed", String(state.view === "3d"));
}

// Only the latest request counts: a slow 3D load must not override a later click on 2D.
let viewReq = 0;
async function setView(v) {
  const req = ++viewReq;
  if (v === "3d" && !(await ensure3d())) v = "2d";
  if (req !== viewReq) { showSurface(currentSurface); return; }
  if (v === state.view) { syncToggle(); showSurface(currentSurface); return; }
  const wasPlaying = state.playing;
  const step = state.i;
  halt();
  state.view = v;
  syncToggle();
  redisplay(wasPlaying, step);
}

// Show what is current on the active view, and keep playing if we were.
function redisplay(wasPlaying, step) {
  if (video.active) {
    const item = video.items[video.i];
    if (wasPlaying) return startVideo(video.i, item?.type === "lesson" ? step : 0);
    setPlaying(false);
    if (!item) return showWaiting();
    return showItemStill(item, step);
  }
  showSurface("lesson");
  prep();
  showStep(step);
  cur().play(state.lesson.steps[step], { instant: true });
  if (wasPlaying) { setPlaying(true); runFrom(step); } else setPlaying(false);
}

// ---------- Surfaces (what fills the screen) ----------
let currentSurface = "lesson";
function showSurface(kind) {
  currentSurface = kind;
  const three = state.view === "3d" && !!stage3d;
  $("#view2d").hidden = three || kind !== "lesson";
  $("#view3d").hidden = !three || kind === "waiting";
  $("#card2d").hidden = three || kind !== "card";
  $("#osi2d").hidden = three || kind !== "osi";
  $("#waiting").hidden = kind !== "waiting";
}

// Make sure the active stage has the current lesson loaded.
function prep() {
  const st = cur();
  if (st.lesson !== state.lesson) st.load(state.lesson);
  return st;
}

// ---------- Rendering ----------
const nameOf = (id) => state.lesson.devices.find((d) => d.id === id)?.label || id;
const protoOf = (step) => (step.action.type === "highlight" ? "NOTE" : step.action.packet.protocol);

// A citation chip: library sources link out, module pages are plain text.
function citeChip(id, library) {
  const c = library.find((x) => x.id === id);
  if (c) return make("a", { href: c.url, target: "_blank", rel: "noopener noreferrer" }, c.title.split(":")[0]);
  const m = video.active ? moduleCitation(id, video.info) : null;
  return m ? make("span", { className: "cite-chip" }, m.title) : null;
}

function setHead(badge, title, question) {
  const b = $("#lesson-badge");
  b.textContent = badge.text;
  b.dataset.kind = badge.kind;
  $("#lesson-title").textContent = title;
  $("#lesson-question").textContent = question;
}

function fillSources(list) {
  const all = $("#sources-all");
  all.replaceChildren();
  for (const c of list) {
    const li = make("li");
    if (c.url) li.append(make("a", { href: c.url, target: "_blank", rel: "noopener noreferrer" }, c.title));
    else li.textContent = c.title;
    all.append(li);
  }
}

function resetFollowUp() {
  $("#followup-answer").hidden = true;
  $("#followup-label").hidden = true;
  state.ask++;
}

// Fill the head, packet log and sources for a lesson. No playback changes.
function fillLesson(lesson, badge) {
  state.lesson = lesson;
  state.i = 0;
  state.finished = false;
  setHead(badge, lesson.title, "“" + lesson.question + "”");

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

  const mod = [];
  if (video.active) {
    const ids = new Set(lesson.steps.flatMap((s) => s.citationIds));
    for (const id of ids) { const m = moduleCitation(id, video.info); if (m) mod.push(m); }
  }
  fillSources([...lesson.citations, ...mod]);
  resetFollowUp();
  for (const chip of document.querySelectorAll(".chip[data-golden]")) {
    chip.setAttribute("aria-pressed", String(!video.active && GOLDEN_LESSONS[+chip.dataset.golden] === lesson));
  }
}

function renderLesson(lesson, badge) {
  pause();
  exitVideo(false);
  state.single = { lesson, badge };
  fillLesson(lesson, badge);
  showSurface("lesson");
  prep();
  showStep(0);
  cur().play(lesson.steps[0], { instant: true });
  setPlaying(false);
}

function setInfo({ count, proto, path, narration, sources }) {
  $("#step-count").textContent = count;
  const p = $("#step-proto");
  p.textContent = proto || "";
  p.hidden = !proto;
  if (proto) p.dataset.proto = proto === "OSI" ? "NOTE" : proto;
  $("#step-path").textContent = path || "";
  $("#step-narration").textContent = narration;
  $("#step-fields").hidden = true;
  const src = $("#step-sources");
  src.replaceChildren(...sources.filter(Boolean));
}

function showStep(i) {
  const lesson = state.lesson;
  const s = lesson.steps[i];
  state.i = i;
  $("#item-intro").hidden = true;
  const a = s.action;
  setInfo({
    count: `Step ${i + 1} of ${lesson.steps.length}`,
    proto: protoOf(s),
    path: a.type === "highlight" ? `Inside: ${nameOf(a.device)}` : a.path.map(nameOf).join("  →  "),
    narration: s.narration,
    sources: s.citationIds.map((id) => citeChip(id, lesson.citations)),
  });
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

  for (const tr of $("#capture").children) tr.classList.toggle("current", +tr.dataset.i === i);
  const row = $("#capture").children[i];
  if (row) { const box = row.closest(".scroll"); box.scrollTop = Math.max(0, row.offsetTop - box.clientHeight / 2); }
  if (video.active) syncVideoControls();
  else {
    $("#prev").disabled = i === 0;
    $("#next").disabled = i === lesson.steps.length - 1;
  }
}

// On narrow screens the 2D stage scrolls sideways; keep the action in view.
function followOnPhone(step) {
  if (cur() !== stage2d) return;
  const box = $(".stage-scroll");
  if (!box || box.scrollWidth <= box.clientWidth + 4) return;
  const a = step.action;
  const id = a.type === "highlight" ? a.device : a.path[a.path.length - 1];
  const vb = $("#stage").viewBox.baseVal;
  const x = (stage2d.pos[id].x / vb.width) * box.scrollWidth;
  box.scrollTo({ left: x - box.clientWidth / 2, behavior: "smooth" });
}

// ---------- Playback (single lesson) ----------
function setPlaying(on) {
  state.playing = on;
  const btn = $("#play");
  btn.setAttribute("aria-label", on ? "Pause" : "Play");
  btn.dataset.state = on ? "pause" : "play";
  const start = video.active ? video.i === 0 && !video.started : state.i === 0;
  $("#play-text").textContent = on ? "Pause" : start ? (video.active ? "Play video" : "Play lesson") : "Play";
}

async function playSteps(from, run) {
  for (let k = from; k < state.lesson.steps.length; k++) {
    showStep(k);
    const step = state.lesson.steps[k];
    followOnPhone(step);
    const st = cur();
    await Promise.all([st.play(step), narrate(step.narration)]);
    if (run !== state.run) return false;
    await delay(350 / state.speed);
    if (run !== state.run) return false;
  }
  return true;
}

async function runFrom(i) {
  const run = ++state.run;
  if (!(await playSteps(i, run))) return;
  state.finished = true;
  setPlaying(false);
}

// Stop everything that is animating or speaking. Running loops see the new run number and exit.
function halt() {
  state.run++;
  stage2d.cancel();
  stage3d?.cancel();
  stopSpeech();
  wakeWaiters();
}
function pause() {
  halt();
  setPlaying(false);
}
function play() {
  if (video.active) return startVideo(video.finished ? 0 : video.i);
  if (!state.lesson) return;
  const from = state.finished ? 0 : state.i;
  state.finished = false;
  setPlaying(true);
  runFrom(from);
}
const togglePlay = () => (state.playing ? pause() : play());

function goTo(i, animate) {
  if (!state.lesson) return;
  if (video.active) {
    // Inside a video lesson: pause the video and show that step. Play restarts the item.
    if (video.items[video.i]?.type !== "lesson") return;
    pause();
    i = Math.max(0, Math.min(state.lesson.steps.length - 1, i));
    showStep(i);
    prep().play(state.lesson.steps[i]);
    speak(state.lesson.steps[i].narration);
    return;
  }
  const wasPlaying = state.playing;
  pause();
  state.finished = false;
  i = Math.max(0, Math.min(state.lesson.steps.length - 1, i));
  showStep(i);
  if (wasPlaying) { setPlaying(true); runFrom(i); return; }
  followOnPhone(state.lesson.steps[i]);
  if (animate) {
    cur().play(state.lesson.steps[i]);
    speak(state.lesson.steps[i].narration);
  } else cur().play(state.lesson.steps[i], { instant: true });
}

// ---------- Video mode (a course built from a module) ----------
const video = {
  active: false, gen: 0, abort: null, course: null, items: [], status: [], info: { pages: 0, slides: 0 },
  total: 0, i: 0, done: false, failed: false, finished: false, started: false, waiters: new Set(),
};
function wakeWaiters() { for (const w of video.waiters) w(); video.waiters.clear(); }

const itemTitle = (it) => it.type === "lesson" ? it.topic : it.type === "card" ? it.title
  : it.focus === "layers" ? "OSI model: the seven layers" : "OSI model: how data is wrapped";
const kindOf = (it) => it.type === "osi" ? "verified" : it.type === "lesson" ? "ai" : it.fallback ? "fallback" : "module";
const badgeOf = (it) => ({ text: it.label, kind: kindOf(it) });

function enterVideo() {
  if (video.active) return;
  halt();
  video.active = true;
  document.body.dataset.mode = "video";
  $("#course-bar").hidden = false;
  $("#prev").setAttribute("aria-label", "Previous item");
  $("#next").setAttribute("aria-label", "Next item");
  for (const chip of document.querySelectorAll(".chip[data-golden]")) chip.setAttribute("aria-pressed", "false");
}

// Leave video mode. With restore, show the last single lesson again.
function exitVideo(restore = true) {
  if (!video.active) return;
  halt();
  video.active = false;
  delete document.body.dataset.mode;
  $("#course-bar").hidden = true;
  $("#prev").setAttribute("aria-label", "Previous step");
  $("#next").setAttribute("aria-label", "Next step");
  markCurrent();
  if (restore) renderLesson(state.single?.lesson || GOLDEN_LESSONS[0], state.single?.badge || GOLDEN_BADGE);
}

function syncVideoControls() {
  $("#prev").disabled = video.i <= 0;
  $("#next").disabled = video.i >= video.total - 1;
}

function setItemBar(k) {
  const it = video.items[k] || video.course?.items[k];
  $("#item-count").textContent = `Item ${k + 1} of ${video.total}`;
  $("#item-title").textContent = it ? itemTitle(it) : "";
  const b = $("#item-badge");
  const built = video.items[k];
  b.hidden = !built;
  if (built) { b.textContent = built.label; b.dataset.kind = kindOf(built); }
  syncVideoControls();
  markCurrent();
}

function showWaiting(text = "Building the next part…", kind = "info") {
  const w = $("#waiting");
  w.dataset.kind = kind;
  $("#waiting-text").textContent = text;
  showSurface("waiting");
  const it = video.course?.items[video.i];
  setHead({ text: "Building", kind: "ai" }, it ? itemTitle(it) : "Next part", "From: " + (video.course?.title || ""));
  setInfo({ count: `Item ${video.i + 1} of ${video.total}`, narration: text, sources: [] });
  $("#item-intro").hidden = true;
}

// --- cards ---
function cardSources(card) {
  const lib = video.course?.citations || [];
  return card.citationIds.map((id) => citeChip(id, lib));
}
function fillCardInfo(card) {
  setHead(badgeOf(card), card.title, "From: " + (video.course?.title || ""));
  setInfo({ count: card.fallback ? "Note" : "Summary card", narration: card.narration, sources: cardSources(card) });
  $("#item-intro").hidden = true;
  const lib = video.course?.citations || [];
  fillSources(card.citationIds.map((id) => lib.find((c) => c.id === id) || moduleCitation(id, video.info)).filter(Boolean));
  clearCapture("This part is a summary card, so no packets are sent.");
}
function renderCard2d(card, all) {
  const b = $("#card2d-badge");
  b.textContent = card.label;
  b.dataset.kind = kindOf(card);
  $("#card2d-title").textContent = card.title;
  $("#card2d-points").replaceChildren(...card.points.map((p) => make("li", { className: all ? "on" : "" }, p)));
  const cites = $("#card2d-cites");
  cites.className = "cites" + (all ? " on" : "");
  const chips = cardSources(card).filter(Boolean);
  cites.replaceChildren(...(chips.length ? [make("span", { className: "label" }, "Source"), ...chips] : []));
}
async function revealCard2d(card, run) {
  renderCard2d(card, false);
  const lis = [...$("#card2d-points").children];
  for (let i = 0; i < lis.length; i++) {
    await delay((i === 0 ? 300 : 900) / state.speed);
    if (run !== state.run) return false;
    lis[i].classList.add("on");
  }
  $("#card2d-cites").classList.add("on");
  return true;
}

// --- OSI ---
const SIDE = { sender: "Sender", medium: "On the wire", receiver: "Receiver" };
const LAYER_COLOR = { 7: "http", 6: "tls", 5: "quic", 4: "tcp", 3: "dns", 2: "arp", 1: "icmp" };
function buildOsi2d() {
  const grid = $("#osi-grid");
  const cells = [make("div", { className: "osi-head" }, "Sender"), make("div"), make("div", { className: "osi-head" }, "Receiver")];
  for (const l of OSI_LAYERS) {
    for (const side of ["sender", "wire", "receiver"]) {
      if (side === "wire") {
        const w = make("div", { className: l.n === 1 ? "osi-wire" : "" });
        if (l.n === 1) w.id = "osi-wire";
        cells.push(w);
        continue;
      }
      const c = make("div", { className: "osi-layer" });
      c.dataset.side = side;
      c.dataset.layer = l.n;
      c.style.setProperty("--lc", `var(--p-${LAYER_COLOR[l.n]})`);
      c.append(make("span", { className: "ln" }, String(l.n)), make("span", { className: "nm" }, l.name), make("span", { className: "pdu" }, l.pdu));
      cells.push(c);
    }
  }
  grid.replaceChildren(...cells);
}
function drawOsi2d(st) {
  for (const c of document.querySelectorAll(".osi-layer")) {
    c.classList.toggle("on", !!st && (st.side === "medium" ? false : c.dataset.side === st.side && +c.dataset.layer === st.layer));
  }
  $("#osi-wire").classList.toggle("on", st?.side === "medium");
  $("#osi-cap").textContent = st ? st.caption : "";
}
function fillOsiInfo(item, i, steps) {
  const st = steps[i];
  setHead(badgeOf(item), itemTitle(item), "From: " + (video.course?.title || ""));
  setInfo({
    count: `Step ${i + 1} of ${steps.length}`, proto: "OSI",
    path: `${SIDE[st.side]} · ${st.caption}`, narration: st.narration,
    sources: [citeChip("rfc1122", OSI_CITATIONS)],
  });
  const intro = $("#item-intro");
  intro.textContent = item.narration ? "AI intro: " + item.narration : "";
  intro.hidden = !item.narration;
}
function osiPanels() {
  fillSources(OSI_CITATIONS);
  clearCapture("This part shows the layer model, so no packets are sent.");
}

function clearCapture(text) {
  const tr = make("tr");
  tr.style.cursor = "default";
  tr.append(make("td", { colSpan: 4 }, text));
  $("#capture").replaceChildren(tr);
}

// Show an item's first frame without playing (used when paused).
function showItemStill(item, step = 0) {
  setItemBar(video.i);
  if (item.type === "lesson") {
    fillLesson(item.lesson, badgeOf(item));
    showSurface("lesson");
    prep();
    showStep(step);
    cur().play(item.lesson.steps[step], { instant: true });
  } else if (item.type === "card") {
    fillCardInfo(item);
    showSurface("card");
    if (cur() === stage3d) stage3d.showCard(item, { label: item.label });
    else renderCard2d(item, true);
  } else {
    const steps = osiSteps(item.focus);
    osiPanels();
    fillOsiInfo(item, 0, steps);
    showSurface("osi");
    if (cur() === stage3d) stage3d.showOsi(steps.slice(0, 1), () => {});
    else drawOsi2d(steps[0]);
  }
}

async function playItem(k, run, fromStep) {
  const item = video.items[k];
  setItemBar(k);
  if (item.type === "lesson") {
    fillLesson(item.lesson, badgeOf(item));
    showSurface("lesson");
    prep();
    return playSteps(Math.min(fromStep, item.lesson.steps.length - 1), run);
  }
  if (item.type === "card") {
    fillCardInfo(item);
    showSurface("card");
    const anim = cur() === stage3d ? stage3d.showCard(item, { label: item.label }) : revealCard2d(item, run);
    await Promise.all([anim, narrate(item.narration)]);
    if (run === state.run) await delay(1200 / state.speed);
    return run === state.run;
  }
  const steps = osiSteps(item.focus);
  osiPanels();
  fillOsiInfo(item, 0, steps);
  showSurface("osi");
  if (cur() === stage3d) {
    await stage3d.showOsi(steps, (i, st) => {
      if (run !== state.run) return;
      fillOsiInfo(item, i, steps);
      return narrate(st.narration);
    });
    return run === state.run;
  }
  for (let i = 0; i < steps.length; i++) {
    fillOsiInfo(item, i, steps);
    drawOsi2d(steps[i]);
    await Promise.all([narrate(steps[i].narration), delay(1600 / state.speed)]);
    if (run !== state.run) return false;
  }
  return true;
}

async function runVideo(k, fromStep) {
  const run = ++state.run;
  setPlaying(true);
  for (; k < video.total; k++, fromStep = 0) {
    video.i = k;
    video.started = true;
    if (!video.items[k]) {
      setItemBar(k);
      if (video.failed) break;
      showWaiting();
      while (!video.items[k] && run === state.run && !video.failed) await new Promise((r) => video.waiters.add(r));
      if (run !== state.run) return;
      if (!video.items[k]) break;
    }
    await playItem(k, run, fromStep);
    if (run !== state.run) return;
    if (k < video.total - 1) { await delay(600 / state.speed); if (run !== state.run) return; }
  }
  if (video.failed && !video.items[k] && k < video.total) {
    showWaiting("Couldn't build the rest of this module. The parts above are ready to watch.", "error");
  } else video.finished = true;
  setPlaying(false);
}

function startVideo(k, fromStep = 0) {
  if (!video.total) return;
  halt();
  enterVideo();
  video.finished = false;
  video.i = Math.max(0, Math.min(video.total - 1, k));
  runVideo(video.i, fromStep);
}

// ---------- Module upload ----------
function setModuleStatus(text, kind = "info") {
  const s = $("#module-status");
  s.textContent = text;
  s.dataset.kind = kind;
  s.hidden = !text;
}

const STATE_TEXT = { waiting: "Waiting", building: "Building", ready: "Ready", fallback: "Couldn't animate", stopped: "Not built" };
function renderProgress() {
  const panel = $("#progress");
  const items = video.course?.items || [];
  panel.hidden = !items.length;
  $("#progress-title").textContent = video.course?.title || "";
  const ol = $("#module-progress");
  ol.replaceChildren(...items.map((src, k) => {
    const it = video.items[k] || src;
    const li = make("li");
    li.dataset.state = video.status[k] || "waiting";
    const btn = make("button", { type: "button", className: "prog-item", disabled: !video.items[k] });
    btn.dataset.k = k;
    btn.append(make("span", { className: "n" }, String(k + 1)), make("span", { className: "t" }, itemTitle(it)), make("span", { className: "st" }, STATE_TEXT[li.dataset.state]));
    btn.addEventListener("click", () => {
      if (!video.items[k]) return;
      startVideo(k);
      $("#lesson").scrollIntoView({ behavior: "smooth", block: "start" });
    });
    li.append(btn);
    return li;
  }));
  markCurrent();
}
function markCurrent() {
  for (const b of document.querySelectorAll(".prog-item")) {
    b.setAttribute("aria-current", String(video.active && +b.dataset.k === video.i));
  }
}

// A new upload or the sample: stop the old build and playback; late results are ignored.
function newSession() {
  video.abort?.abort();
  video.abort = null;
  if (video.active) exitVideo(true); else pause();
  video.gen++;
  Object.assign(video, {
    course: null, items: [], status: [], info: { pages: 0, slides: 0 }, total: 0, i: 0,
    done: false, failed: false, finished: false, started: false,
  });
  renderProgress();
  return video.gen;
}

function errorText(e) {
  if (e?.code === "rate_limited") return "Claude is busy right now. Wait a moment and try again.";
  if (e?.code === "not_granted") return "Building a video needs permission to use Claude. Allow it from the page's permissions, or try the sample module.";
  if (e?.code || !e?.message || /^Internal error/.test(e.message)) return "Something went wrong while building the video. Try again.";
  return e.message;
}

async function handleFile(file) {
  if (!file) return;
  const gen = newSession();
  const stale = () => gen !== video.gen;
  if (!sample) {
    setModuleStatus("Turning your own file into a video needs an AI connection. Open this page in Claude while signed in, or try the sample module.", "error");
    return;
  }
  setModuleStatus(`Reading ${file.name}…`);
  let module;
  try {
    module = await readModuleFile(file, { JSZip: window.JSZip, pdfjsLib: window.pdfjsLib });
  } catch (e) {
    if (!stale()) setModuleStatus(e?.message || "I couldn't read that file.", "error");
    return;
  }
  if (stale()) return;
  const controller = new AbortController();
  video.abort = controller;
  video.info = { pages: module.pages, slides: module.slides };
  setModuleStatus("Planning the video from your module…");
  try {
    await buildCourse(module, sample, {
      signal: controller.signal,
      maxRepairs: MAX_REPAIRS,
      onOutline: (course) => {
        if (stale()) return;
        video.course = course;
        video.total = course.items.length;
        video.status = course.items.map((_, k) => (k === 0 ? "building" : "waiting"));
        renderProgress();
        setModuleStatus(`Building ${video.total} part${video.total === 1 ? "" : "s"}. The video starts as soon as the first one is ready.`);
      },
      onItem: (k, item) => {
        if (stale()) return;
        video.items[k] = item;
        video.status[k] = item.fallback ? "fallback" : "ready";
        if (k + 1 < video.total) video.status[k + 1] = "building";
        renderProgress();
        wakeWaiters();
        if (k === 0) {
          startVideo(0);
          $("#lesson").scrollIntoView({ behavior: "smooth", block: "start" });
        } else if (video.active && video.i === k && !state.playing) setItemBar(k);
      },
    });
    if (stale()) return;
    video.done = true;
    const fb = video.items.filter((it) => it.fallback).length;
    setModuleStatus(fb
      ? `All ${video.total} parts are ready. ${fb} couldn't be animated accurately, so they show a note pointing to your module instead.`
      : `All ${video.total} parts are ready.`);
  } catch (e) {
    if (stale() || e?.name === "AbortError") return;
    video.failed = true;
    video.status = video.status.map((s) => (s === "building" || s === "waiting" ? "stopped" : s));
    renderProgress();
    wakeWaiters();
    setModuleStatus(errorText(e), "error");
  } finally {
    if (video.abort === controller) video.abort = null;
  }
}

function playSample() {
  newSession();
  video.course = SAMPLE_COURSE;
  video.items = [...SAMPLE_COURSE.items];
  video.total = video.items.length;
  video.status = video.items.map((it) => (it.fallback ? "fallback" : "ready"));
  video.info = { pages: SAMPLE_MODULE.pages, slides: SAMPLE_MODULE.slides };
  video.done = true;
  renderProgress();
  setModuleStatus("This sample was converted ahead of time, so it plays without an AI connection.");
  startVideo(0);
  $("#lesson").scrollIntoView({ behavior: "smooth", block: "start" });
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
  if (!sample) return setStatus("Custom questions need an AI connection. Open this page in Claude, or deploy it with an Anthropic API key. Ready-made lessons work everywhere.", "error");

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
          renderLesson(result.lesson, AI_BADGE);
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
  if (video.active && video.items[video.i]?.type !== "lesson") {
    out.hidden = false;
    out.textContent = "Follow-up questions work on the animated lessons. Skip to a lesson part and ask there.";
    return;
  }
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
function wireUpload() {
  const input = $("#module-file");
  input.addEventListener("change", () => { const f = input.files?.[0]; input.value = ""; handleFile(f); });
  $("#sample-btn").addEventListener("click", playSample);
  const drop = $("#drop");
  let depth = 0;
  drop.addEventListener("dragenter", (e) => { e.preventDefault(); depth++; drop.classList.add("over"); });
  drop.addEventListener("dragleave", () => { if (--depth <= 0) { depth = 0; drop.classList.remove("over"); } });
  drop.addEventListener("dragover", (e) => { e.preventDefault(); if (e.dataTransfer) e.dataTransfer.dropEffect = "copy"; });
  drop.addEventListener("drop", (e) => {
    e.preventDefault();
    depth = 0;
    drop.classList.remove("over");
    handleFile(e.dataTransfer?.files?.[0]);
  });
  // A file dropped anywhere else must not navigate away from the app.
  for (const ev of ["dragover", "drop"]) {
    window.addEventListener(ev, (e) => { if (!e.target.closest?.("#drop")) e.preventDefault(); });
  }
}

function init() {
  const lib = $("#library");
  GOLDEN_LESSONS.forEach((l, i) => {
    const chip = make("button", { type: "button", className: "chip" }, l.title);
    chip.dataset.golden = i;
    chip.addEventListener("click", () => {
      renderLesson(l, GOLDEN_BADGE);
      $("#lesson").scrollIntoView({ behavior: "smooth", block: "start" });
    });
    lib.append(chip);
  });

  for (const s of document.querySelectorAll(".suggest")) {
    s.addEventListener("click", () => { $("#question").value = s.textContent; generateLesson(s.textContent); });
  }

  $("#ask-form").addEventListener("submit", (e) => { e.preventDefault(); generateLesson($("#question").value); });
  $("#followup-form").addEventListener("submit", (e) => { e.preventDefault(); askFollowUp($("#followup-q").value); });

  const step = (d) => (video.active ? startVideo(video.i + d) : goTo(state.i + d, true));
  $("#play").addEventListener("click", togglePlay);
  $("#prev").addEventListener("click", () => step(-1));
  $("#next").addEventListener("click", () => step(1));
  $("#replay").addEventListener("click", () => goTo(state.i, true));
  $("#speed").addEventListener("change", (e) => {
    state.speed = +e.target.value;
    stage2d.speed = state.speed;
    if (stage3d) stage3d.speed = state.speed;
  });
  $("#voice").addEventListener("click", (e) => {
    state.voice = !state.voice;
    e.currentTarget.setAttribute("aria-pressed", String(state.voice));
    $("#voice-text").textContent = state.voice ? "Voice on" : "Voice off";
    if (!state.voice) stopSpeech();
  });
  $("#view-2d").addEventListener("click", () => setView("2d"));
  $("#view-3d").addEventListener("click", () => setView("3d"));

  document.addEventListener("keydown", (e) => {
    if (e.target.closest("input, textarea, select, button, [contenteditable]")) return;
    if (e.key === " ") { e.preventDefault(); togglePlay(); }
    else if (e.key === "ArrowRight") step(1);
    else if (e.key === "ArrowLeft") step(-1);
  });

  wireMic($("#ask-mic"), $("#question"));
  wireMic($("#followup-mic"), $("#followup-q"));
  wireUpload();
  buildOsi2d();

  renderLesson(GOLDEN_LESSONS[0], GOLDEN_BADGE);

  // Default view: 3D when WebGL works, except on narrow screens where 3D labels get too small.
  if (!webglLikely()) disable3d("3D needs WebGL, which isn't available here, so V Learn is showing 2D.");
  else if (!matchMedia("(max-width: 720px)").matches) setView("3d");

  // Light up AI features: Claude session inside Claude, or our /api/ai route when published elsewhere.
  // window.__vlearnTestAi is a test hook for the browser harness; it is never set in production.
  const testAi = typeof window.__vlearnTestAi === "function" ? window.__vlearnTestAi : null;
  if (testAi) { sample = testAi; markAiAvailability(true); }
  connectAi().then((ai) => { sample = testAi || ai; markAiAvailability(!!sample); })
    .catch(() => markAiAvailability(!!testAi));
  const use = window.claude?.use?.bind(window.claude);
  if (!use) return;
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
