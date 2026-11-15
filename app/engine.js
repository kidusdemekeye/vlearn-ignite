// V Learn engine: draws a validated lesson as an SVG network and animates its steps.
// It only ever receives lessons that passed validateLesson(). All text goes in via textContent.
import { layoutLesson } from "./core.js";

const NS = "http://www.w3.org/2000/svg";
const el = (name, attrs = {}, parent) => {
  const n = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  if (parent) parent.appendChild(n);
  return n;
};
const txt = (parent, attrs, text) => { const t = el("text", attrs, parent); t.textContent = text; return t; };

const KIND_LABEL = {
  laptop: "LAPTOP", phone: "PHONE", router: "ROUTER", switch: "SWITCH", access_point: "WI-FI AP",
  firewall: "FIREWALL", dns_resolver: "DNS RESOLVER", dns_root: "ROOT DNS", dns_tld: "TLD DNS",
  dns_authoritative: "AUTH DNS", web_server: "WEB SERVER", server: "HOST", internet: "INTERNET",
};

// Simple line icons drawn in a 40x40 box centred on (0,0).
function drawIcon(g, kind) {
  const s = { fill: "none", stroke: "currentColor", "stroke-width": 2, "stroke-linecap": "round", "stroke-linejoin": "round" };
  const P = (d) => el("path", { d, ...s }, g);
  switch (kind) {
    case "laptop": P("M-13 -9h26v15h-26z M-18 10h36"); break;
    case "phone": P("M-8 -15h16v30h-16z M-3 11h6"); break;
    case "router": P("M-16 2h32v10h-32z M-10 2l-4-12 M10 2l4-12 M-10 7h1 M-5 7h1"); break;
    case "switch": P("M-18 -6h36v12h-36z M-12 0h2 M-6 0h2 M0 0h2 M6 0h2 M12 0h2"); break;
    case "access_point": P("M-4 12h8 M0 12v-8 M-9 -4a12 12 0 0 1 18 0 M-14 -9a19 19 0 0 1 28 0"); break;
    case "firewall": P("M-16 -12h32v24h-32z M-16 -4h32 M-16 4h32 M-6 -12v8 M6 -4v8 M-6 4v8"); break;
    case "internet": P("M-14 8a7 7 0 0 1 0-14a10 10 0 0 1 19-3a7 7 0 0 1 9 9a5 5 0 0 1 -2 8z"); break;
    default: // servers and DNS
      P("M-12 -14h24v8h-24z M-12 -3h24v8h-24z M-12 8h24v7h-24z M-7 -10h1 M-7 1h1 M-7 11h1");
  }
}

export class Stage {
  constructor(svg, { onPacketClick } = {}) {
    this.svg = svg;
    this.onPacketClick = onPacketClick;
    this.speed = 1;
    this.reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  load(lesson) {
    this.lesson = lesson;
    const { positions, width, height } = layoutLesson(lesson);
    this.pos = positions;
    this.svg.replaceChildren();
    this.svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
    const defs = el("defs", {}, this.svg);
    const pat = el("pattern", { id: "grid", width: 28, height: 28, patternUnits: "userSpaceOnUse" }, defs);
    el("circle", { cx: 1, cy: 1, r: 1, class: "grid-dot" }, pat);
    el("rect", { x: 0, y: 0, width, height, fill: "url(#grid)" }, this.svg);

    this.linkLayer = el("g", { class: "links" }, this.svg);
    this.nodeLayer = el("g", { class: "nodes" }, this.svg);
    this.fxLayer = el("g", { class: "fx" }, this.svg);
    this.links = new Map();
    this.nodes = new Map();

    for (const l of lesson.links) {
      const a = positions[l.a], b = positions[l.b];
      const line = el("line", { x1: a.x, y1: a.y, x2: b.x, y2: b.y, class: "link" }, this.linkLayer);
      this.links.set(l.a + "|" + l.b, line);
      this.links.set(l.b + "|" + l.a, line);
    }
    for (const d of lesson.devices) {
      const p = positions[d.id];
      const g = el("g", { class: "node", transform: `translate(${p.x} ${p.y})` }, this.nodeLayer);
      el("circle", { r: 46, class: "node-ring" }, g);
      el("rect", { x: -38, y: -30, width: 76, height: 60, rx: 14, class: "node-box" }, g);
      const icon = el("g", { class: "node-icon" }, g);
      drawIcon(icon, d.kind);
      txt(g, { y: 52, class: "node-label", "text-anchor": "middle" }, d.label);
      txt(g, { y: 68, class: "node-kind", "text-anchor": "middle" }, KIND_LABEL[d.kind] || d.kind.toUpperCase());
      this.nodes.set(d.id, g);
    }
  }

  clear() {
    this.fxLayer?.replaceChildren();
    for (const line of new Set(this.links?.values() || [])) line.removeAttribute("data-proto"), line.classList.remove("active");
    for (const g of this.nodes?.values() || []) g.classList.remove("pulse", "dropped");
  }

  cancel() { this.token = (this.token || 0) + 1; }

  // Plays one step. Resolves when the animation is done (or immediately if cancelled).
  play(step, { instant = false } = {}) {
    this.cancel();
    const token = this.token;
    this.clear();
    const a = step.action;
    if (a.type === "highlight") return this.#highlight(a, token, instant);
    return this.#travel(a, token, instant);
  }

  #caption(x, y, text, cls) {
    const g = el("g", { class: "caption " + (cls || ""), transform: `translate(${x} ${y})` }, this.fxLayer);
    const rect = el("rect", { y: -15, height: 30, rx: 8 }, g);
    const t = txt(g, { "text-anchor": "middle", y: 5 }, text);
    const w = Math.min(560, Math.max(80, (t.getComputedTextLength?.() || text.length * 7.4) + 24));
    rect.setAttribute("x", -w / 2);
    rect.setAttribute("width", w);
    // keep inside the stage
    const vb = this.svg.viewBox.baseVal;
    const cx = Math.min(Math.max(x, w / 2 + 8), vb.width - w / 2 - 8);
    const cy = Math.max(y, 22);
    g.setAttribute("transform", `translate(${cx} ${cy})`);
    return g;
  }

  #highlight(a, token, instant) {
    const g = this.nodes.get(a.device);
    const p = this.pos[a.device];
    g.classList.add("pulse");
    this.#caption(p.x, p.y - 64, a.caption, "note");
    const ms = instant || this.reduced ? 0 : 1400 / this.speed;
    return new Promise((res) => setTimeout(res, ms)).then(() => token === this.token);
  }

  #travel(a, token, instant) {
    const pts = a.path.map((id) => this.pos[id]);
    for (let i = 0; i < a.path.length - 1; i++) {
      const line = this.links.get(a.path[i] + "|" + a.path[i + 1]);
      line.classList.add("active");
      line.setAttribute("data-proto", a.packet.protocol);
    }
    const pkt = el("g", { class: "packet", "data-proto": a.packet.protocol, tabindex: 0, role: "button" }, this.fxLayer);
    const inner = el("g", { class: "packet-inner" }, pkt);
    const body = el("rect", { y: -14, height: 28, rx: 14, class: "packet-body" }, inner);
    const tag = txt(inner, { x: 0, y: 5, "text-anchor": "middle", class: "packet-text" }, `${a.packet.protocol} · ${a.packet.label}`);
    const w = Math.max(70, (tag.getComputedTextLength?.() || tag.textContent.length * 7.4) + 26);
    body.setAttribute("x", -w / 2);
    body.setAttribute("width", w);
    pkt.addEventListener("click", () => this.onPacketClick?.(a.packet));
    pkt.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") this.onPacketClick?.(a.packet); });

    const place = (x, y) => pkt.setAttribute("transform", `translate(${x} ${y - 4})`);
    const segs = pts.length - 1;
    const end = () => {
      const last = pts[pts.length - 1];
      place(last.x, last.y - 52);
      if (a.type === "drop") {
        pkt.classList.add("blocked");
        this.nodes.get(a.path[a.path.length - 1]).classList.add("dropped");
        const p = pts[pts.length - 1];
        const x = el("g", { class: "drop-x", transform: `translate(${p.x + 30} ${p.y - 30})` }, this.fxLayer);
        el("path", { d: "M-8 -8L8 8M8 -8L-8 8" }, x);
        this.#caption(p.x, p.y + 96, "Blocked: " + a.reason, "warn");
      }
    };

    if (instant || this.reduced) { end(); return Promise.resolve(token === this.token); }

    const perHop = 1150 / this.speed;
    const start = performance.now();
    const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
    return new Promise((resolve) => {
      const frame = (now) => {
        if (token !== this.token) return resolve(false);
        // rAF timestamps can be slightly earlier than `start`; clamp so t never goes negative.
        const t = Math.min(Math.max(0, (now - start) / perHop), segs);
        const i = Math.min(Math.floor(t), segs - 1);
        const local = ease(t - i);
        const A = pts[i], B = pts[i + 1];
        // ride just above the cable, then rise to sit above the device at the end
        const lift = t >= segs ? 52 : 0;
        place(A.x + (B.x - A.x) * local, A.y + (B.y - A.y) * local - lift);
        if (t >= segs) {
          end();
          if (a.type === "drop") pkt.querySelector(".packet-inner").classList.add("shake");
          setTimeout(() => resolve(token === this.token), a.type === "drop" ? 700 / this.speed : 250);
          return;
        }
        requestAnimationFrame(frame);
      };
      requestAnimationFrame(frame);
    });
  }
}
