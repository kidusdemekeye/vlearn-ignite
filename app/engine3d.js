// V Learn 3D stage: the same validated lessons as the 2D Stage, drawn with three.js.
// Loaded lazily by the app only when WebGL is available. All text is drawn to canvas
// textures (never innerHTML). Colours come from the page's CSS custom properties, so the
// scene follows the light/dark theme.
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { layoutLesson, SOURCE_LIBRARY } from "./core.js";
import { OSI_LAYERS } from "./osi.js";

const KIND_LABEL = {
  laptop: "LAPTOP", phone: "PHONE", router: "ROUTER", switch: "SWITCH", access_point: "WI-FI AP",
  firewall: "FIREWALL", dns_resolver: "DNS RESOLVER", dns_root: "ROOT DNS", dns_tld: "TLD DNS",
  dns_authoritative: "AUTH DNS", web_server: "WEB SERVER", server: "HOST", internet: "INTERNET",
};
// Same line icons as the 2D engine (40x40 box centred on 0,0), drawn with Path2D.
const ICONS = {
  laptop: "M-13 -9h26v15h-26z M-18 10h36",
  phone: "M-8 -15h16v30h-16z M-3 11h6",
  router: "M-16 2h32v10h-32z M-10 2l-4-12 M10 2l4-12 M-10 7h1 M-5 7h1",
  switch: "M-18 -6h36v12h-36z M-12 0h2 M-6 0h2 M0 0h2 M6 0h2 M12 0h2",
  access_point: "M-4 12h8 M0 12v-8 M-9 -4a12 12 0 0 1 18 0 M-14 -9a19 19 0 0 1 28 0",
  firewall: "M-16 -12h32v24h-32z M-16 -4h32 M-16 4h32 M-6 -12v8 M6 -4v8 M-6 4v8",
  internet: "M-14 8a7 7 0 0 1 0-14a10 10 0 0 1 19-3a7 7 0 0 1 9 9a5 5 0 0 1 -2 8z",
  server: "M-12 -14h24v8h-24z M-12 -3h24v8h-24z M-12 8h24v7h-24z M-7 -10h1 M-7 1h1 M-7 11h1",
};
// Colour of each OSI layer (header slabs and layer tint), taken from protocol colours.
const LAYER_COLOR = { 7: "http", 6: "tls", 5: "quic", 4: "tcp", 3: "dns", 2: "arp", 1: "icmp" };

const FONT = {
  body: '"IBM Plex Sans", "Segoe UI", system-ui, sans-serif',
  mono: '"IBM Plex Mono", ui-monospace, Menlo, monospace',
  display: '"Bricolage Grotesque", "Avenir Next", "Segoe UI", system-ui, sans-serif',
};
const UNIT = 100;      // canvas px per world unit for textures on meshes
const TEX_SCALE = 3;   // texture pixels per logical px (sharp at devicePixelRatio 2)
const DEVICE = { w: 1.0, h: 0.42, d: 0.72 };
const FLY_Y = 0.78;
const Z_STRETCH = 1.7;    // packet cruising height above the surface
const UP = new THREE.Vector3(0, 1, 0);

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
const easeOut = (t) => 1 - Math.pow(1 - t, 3);
const easeOutBack = (t) => { const c = 1.5; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };
const protoKey = (p) => (p === "802.11" ? "wifi" : String(p || "").toLowerCase());

function readTheme() {
  const cs = getComputedStyle(document.documentElement);
  const v = (name, fb) => cs.getPropertyValue(name).trim() || fb;
  const t = {
    bg: v("--bg", "#eef2f5"), surface: v("--surface", "#ffffff"), sunk: v("--sunk", "#e3e9ee"),
    ink: v("--ink", "#102030"), muted: v("--muted", "#566778"), line: v("--line", "#c6d1da"),
    accent: v("--accent", "#0a6c86"), warn: v("--warn", "#c0352b"), onP: v("--on-p", "#ffffff"),
  };
  t.dark = new THREE.Color(t.bg).getHSL({}).l < 0.4;
  t.proto = (p) => v("--p-" + protoKey(p), t.accent);
  return t;
}

// Split text into lines that fit maxWidth; keeps at most maxLines (last one gets an ellipsis).
function wrap(ctx, text, maxWidth, maxLines = 4) {
  const words = String(text ?? "").split(/\s+/).filter(Boolean);
  const lines = [];
  let cur = "";
  for (const w of words) {
    const next = cur ? cur + " " + w : w;
    if (ctx.measureText(next).width > maxWidth && cur) { lines.push(cur); cur = w; } else cur = next;
  }
  if (cur) lines.push(cur);
  const out = lines.slice(0, maxLines).map((l) => {
    let s = l;
    while (ctx.measureText(s).width > maxWidth && s.length > 1) s = s.slice(0, -1);
    return s === l ? l : s.slice(0, -1) + "…";
  });
  if (lines.length > maxLines) {
    let last = out[maxLines - 1];
    while (ctx.measureText(last + "…").width > maxWidth && last.length > 1) last = last.slice(0, -1);
    out[maxLines - 1] = last.replace(/[\s,.;:]+$/, "") + "…";
  }
  return out;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect ? ctx.roundRect(x, y, w, h, r) : ctx.rect(x, y, w, h);
}

function citationName(id) {
  const m = /^module_([ps])(\d+)$/.exec(id);
  if (m) return `Your module, ${m[1] === "p" ? "page" : "slide"} ${m[2]}`;
  const s = SOURCE_LIBRARY.find((x) => x.id === id);
  const name = s ? s.title.split(":")[0] : id;
  return name.length > 30 ? name.slice(0, 29) + "…" : name;
}

// A canvas texture whose content is laid out by `layout(ctx, theme)` → { w, h, draw(ctx) } in logical px.
class Painted {
  constructor(layout, theme, scale = TEX_SCALE) {
    this.layout = layout;
    this.scale = scale;
    this.canvas = document.createElement("canvas");
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.anisotropy = 4;
    this.paint(theme);
  }
  paint(theme) {
    const ctx = this.canvas.getContext("2d");
    const plan = this.layout(ctx, theme);
    const S = this.scale;
    const W = Math.max(2, Math.ceil(plan.w * S)), H = Math.max(2, Math.ceil(plan.h * S));
    if (this.canvas.width !== W || this.canvas.height !== H) {
      this.canvas.width = W; this.canvas.height = H;
      this.texture.dispose(); // size changed: let three re-allocate
    }
    ctx.setTransform(S, 0, 0, S, 0, 0);
    ctx.clearRect(0, 0, plan.w, plan.h);
    plan.draw(ctx);
    this.w = plan.w; this.h = plan.h;
    this.texture.needsUpdate = true;
    this.onPaint?.();
  }
}

export class Stage3D {
  static supported() {
    try {
      const c = document.createElement("canvas");
      return !!(window.WebGLRenderingContext && (c.getContext("webgl2") || c.getContext("webgl")));
    } catch { return false; }
  }

  constructor(container, { onPacketClick } = {}) {
    this.container = container;
    this.onPacketClick = onPacketClick;
    this.speed = 1;
    this.token = 0;
    this.pos = {};
    this.mode = "empty";
    this.tweens = [];
    this.ambient = new Set();
    this.waits = new Set();
    this.screenSprites = new Set();
    this.clickables = [];
    this.currentPacket = null;
    this.theme = readTheme();
    this.reducedMq = matchMedia("(prefers-reduced-motion: reduce)");

    const narrow = Math.min(window.innerWidth, screen?.width || Infinity) < 700;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, narrow ? 1.5 : 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    const canvas = this.renderer.domElement;
    canvas.style.display = "block";
    canvas.style.width = "100%";
    canvas.style.touchAction = "manipulation";
    canvas.setAttribute("role", "img");
    canvas.setAttribute("aria-label", "3D network scene showing the current step");
    canvas.tabIndex = 0;
    container.appendChild(canvas);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(34, 16 / 9, 0.1, 200);
    this.view = { target: new THREE.Vector3(), dist: 12, elev: 0.9, azim: 0.28 };
    this.goal = { target: new THREE.Vector3(), dist: 12, elev: 0.9, azim: 0.28 };

    this.hemi = new THREE.HemisphereLight(0xffffff, 0xffffff, 1.75);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xffffff, 1.6);
    this.sun.position.set(-4, 9, 6);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(narrow ? 1024 : 2048, narrow ? 1024 : 2048);
    Object.assign(this.sun.shadow.camera, { left: -9, right: 9, top: 9, bottom: -9, near: 1, far: 30 });
    this.sun.shadow.radius = 5;
    this.sun.shadow.bias = -0.0008;
    this.scene.add(this.sun, this.sun.target);

    this.gridTex = this.#gridTexture();
    this.ground = new THREE.Mesh(
      new THREE.PlaneGeometry(80, 80),
      new THREE.MeshStandardMaterial({ roughness: 1, metalness: 0, map: this.gridTex }),
    );
    this.ground.rotation.x = -Math.PI / 2;
    this.ground.receiveShadow = true;
    this.scene.add(this.ground);
    this.scene.fog = new THREE.Fog(0xffffff, 18, 46);

    this.net = new THREE.Group();
    this.fx = new THREE.Group();
    this.scene.add(this.net, this.fx);

    // shared geometry (never disposed per object)
    this.geo = {
      device: new RoundedBoxGeometry(DEVICE.w, DEVICE.h, DEVICE.d, 4, 0.1),
      capsule: new THREE.CapsuleGeometry(0.1, 0.26, 6, 16),
      plane: new THREE.PlaneGeometry(1, 1),
      ring: new THREE.RingGeometry(0.62, 0.7, 64),
    };
    for (const g of Object.values(this.geo)) g.userData.keep = true;
    this.glowTex = this.#glowTexture();
    this.dashTex = this.#dashTexture();

    this.#applyTheme(false);

    this.#bindEvents();
    this.#resize();
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.#loop);
    document.fonts?.ready?.then(() => !this.disposed && this.#applyTheme(true));
  }

  get reduced() { return this.reducedMq.matches; }

  // ---------- public API ----------

  load(lesson) {
    this.cancel();
    this.#clearFx();
    this.#removeMode();
    this.#disposeChildren(this.net);
    this.lesson = lesson;
    const { positions, width, height } = layoutLesson(lesson);
    this.pos = positions;
    this.world = {};
    for (const [id, p] of Object.entries(positions)) {
      // depth gets extra room: seen from above at an angle, rows would otherwise crowd their labels
      this.world[id] = new THREE.Vector3((p.x - width / 2) / UNIT, 0, ((p.y - height / 2) / UNIT) * Z_STRETCH);
    }
    this.devices = new Map();
    this.links = new Map();

    for (const l of lesson.links) {
      const a = this.world[l.a], b = this.world[l.b];
      if (!a || !b) continue;
      const link = this.#makeCable(a, b);
      link.ends = [l.a, l.b];
      this.links.set(l.a + "|" + l.b, link);
      this.links.set(l.b + "|" + l.a, link);
    }
    for (const d of lesson.devices) {
      const p = this.world[d.id];
      if (p) this.devices.set(d.id, this.#makeDevice(d, p));
    }
    this.mode = "network";
    this.net.visible = true;
    this.#frameNetwork(Object.keys(this.world), { instant: true, all: true });
  }

  clear() {
    this.#clearFx();
    const left = this.#removeMode();
    if (this.lesson) {
      this.mode = "network";
      this.net.visible = true;
      if (left) this.#frameNetwork(Object.keys(this.world), { instant: true, all: true });
    }
  }

  cancel() {
    this.token++;
    for (const tw of this.tweens) tw.resolve(false);
    this.tweens = [];
    for (const w of this.waits) w(false);
    this.waits.clear();
  }

  // Plays one step. Resolves true when done, false if cancelled.
  play(step, { instant = false } = {}) {
    this.cancel();
    const token = this.token;
    this.clear();
    if (!this.lesson || !step?.action) return Promise.resolve(token === this.token);
    const a = step.action;
    const inst = instant || this.reduced;
    if (a.type === "highlight") return this.#highlight(a, token, inst);
    return this.#travel(a, token, inst);
  }

  showCard(card, { label } = {}) {
    this.cancel();
    const token = this.token;
    this.#clearFx();
    this.#enterMode("card");
    const reduced = this.reduced;
    const aspect = this.width / Math.max(1, this.height);
    const W = aspect < 1 ? 620 : 980;
    const points = (card?.points || []).slice(0, 6);
    const reveal = points.map(() => 0);
    let titleA = 0;
    const chips = (card?.citationIds || []).map(citationName);

    const painted = new Painted((ctx, t) => {
      const pad = 56, inner = W - pad * 2;
      ctx.font = `800 46px ${FONT.display}`;
      const titleLines = wrap(ctx, card?.title || "", inner, 3);
      ctx.font = `400 27px ${FONT.body}`;
      const pointLines = points.map((p) => wrap(ctx, p, inner - 40, 4));
      let h = pad + (label ? 46 : 0) + titleLines.length * 54 + 22;
      for (const pl of pointLines) h += pl.length * 37 + 18;
      h += chips.length ? 70 : 10;
      h += pad - 14;
      return {
        w: W, h,
        draw: (c) => {
          c.fillStyle = t.surface;
          roundRect(c, 0, 0, W, h, 34); c.fill();
          c.strokeStyle = t.line; c.lineWidth = 2;
          roundRect(c, 1, 1, W - 2, h - 2, 33); c.stroke();
          c.fillStyle = t.accent;
          roundRect(c, pad, 0, 120, 8, 4); c.fill();
          let y = pad;
          c.textBaseline = "alphabetic";
          if (label) {
            c.font = `500 17px ${FONT.mono}`;
            const tw = Math.min(inner, c.measureText(label.toUpperCase()).width + 28);
            c.globalAlpha = titleA;
            c.strokeStyle = t.accent; c.lineWidth = 1.5;
            roundRect(c, pad, y - 4, tw, 32, 16); c.stroke();
            c.fillStyle = t.accent;
            c.fillText(wrap(c, label.toUpperCase(), inner - 28, 1)[0] || "", pad + 14, y + 18);
            y += 46;
          }
          c.globalAlpha = titleA;
          c.fillStyle = t.ink;
          c.font = `800 46px ${FONT.display}`;
          for (const line of titleLines) { y += 46; c.fillText(line, pad, y); y += 8; }
          y += 22;
          c.font = `400 27px ${FONT.body}`;
          pointLines.forEach((pl, i) => {
            const a = reveal[i];
            c.globalAlpha = a;
            const dx = (1 - a) * 18;
            c.fillStyle = t.accent;
            c.beginPath(); c.arc(pad + 9 + dx, y + 20, 7, 0, Math.PI * 2); c.fill();
            c.fillStyle = t.ink;
            for (const line of pl) { y += 30; c.fillText(line, pad + 40 + dx, y); y += 7; }
            y += 18;
          });
          if (chips.length) {
            c.globalAlpha = reveal.length ? reveal[reveal.length - 1] : titleA;
            y += 18;
            c.font = `500 18px ${FONT.mono}`;
            let x = pad;
            for (const chip of chips) {
              const cw = c.measureText(chip).width + 28;
              if (x + cw > W - pad) break;
              c.fillStyle = t.sunk;
              roundRect(c, x, y, cw, 36, 10); c.fill();
              c.fillStyle = t.muted;
              c.fillText(chip, x + 14, y + 24);
              x += cw + 10;
            }
          }
          c.globalAlpha = 1;
        },
      };
    }, this.theme, 2);

    const mat = new THREE.MeshBasicMaterial({ map: painted.texture, transparent: true, toneMapped: false, fog: false });
    const panel = new THREE.Mesh(this.geo.plane, mat);
    const shadow = new THREE.Mesh(this.geo.plane, new THREE.MeshBasicMaterial({ map: this.glowTex, color: 0x000000, transparent: true, opacity: 0.18, depthWrite: false }));
    shadow.rotation.x = -Math.PI / 2;
    const group = new THREE.Group();
    const holder = new THREE.Group();
    holder.add(panel);
    group.add(holder, shadow);
    const size = () => {
      const s = 1 / UNIT;
      panel.scale.set(painted.w * s, painted.h * s, 1);
      panel.position.y = painted.h * s / 2;
      shadow.scale.set(painted.w * s * 1.1, 1.6, 1);
    };
    painted.onPaint = size;
    size();
    group.userData.retheme = () => painted.paint(this.theme);
    group.userData.dispose = () => { painted.texture.dispose(); };
    holder.position.y = 0.35;
    const TILT = -0.1; // face the camera (which looks slightly down) so the card has no keystone
    holder.rotation.x = TILT;
    this.modeGroup.add(group);

    const hw = painted.w / UNIT / 2, hh = painted.h / UNIT;
    this.#frameBox(new THREE.Box3(new THREE.Vector3(-hw, 0.35, -0.2), new THREE.Vector3(hw, 0.35 + hh, 0.2)),
      { elev: 0.1, azim: 0, instant: true, fill: 0.86 });

    let bob = 0;
    this.ambient.add((now, dt) => { if (!reduced) { bob += dt; holder.position.y = 0.35 + Math.sin(bob * 1.3) * 0.025; } });

    const repaint = () => painted.paint(this.theme);
    if (reduced) { titleA = 1; repaint(); }
    else { holder.rotation.x = -0.5; holder.position.z = -1.2; panel.material.opacity = 0; }
    const floatIn = reduced ? Promise.resolve(true) : this.#tween(700 / this.speed, (t) => {
      const e = easeOut(t);
      holder.rotation.x = TILT - 0.5 * (1 - e);
      holder.position.z = -1.2 * (1 - e);
      panel.material.opacity = e;
      titleA = clamp(t * 1.6, 0, 1);
      repaint();
    }, token);

    return floatIn.then(async (ok) => {
      for (let i = 0; ok && i < points.length; i++) {
        if (!(ok = await this.#wait(i === 0 ? 300 / this.speed : 900 / this.speed, token))) break;
        if (reduced) { reveal[i] = 1; repaint(); continue; }
        ok = await this.#tween(380 / this.speed, (t) => { reveal[i] = easeOut(t); repaint(); }, token);
      }
      return ok && token === this.token;
    });
  }

  showOsi(steps, onStep) {
    this.cancel();
    const token = this.token;
    this.#clearFx();
    this.#enterMode("osi");
    const osi = this.#buildOsi();
    this.modeGroup.add(osi.group);
    this.#frameBox(new THREE.Box3(new THREE.Vector3(-4.5, 0, -0.6), new THREE.Vector3(4.5, 4.55, 0.9)),
      { elev: 0.09, azim: 0, instant: true, fill: 0.94 });
    const list = Array.isArray(steps) ? steps : [];
    return (async () => {
      let prev = null;
      for (let i = 0; i < list.length; i++) {
        if (token !== this.token) return false;
        const st = list[i];
        try { onStep?.(i, st); } catch (e) { console.error(e); }
        const t0 = performance.now();
        const ok = await osi.go(st, prev, token);
        if (!ok) return false;
        const left = 1600 / this.speed - (performance.now() - t0);
        if (left > 0 && !(await this.#wait(left, token))) return false;
        prev = st;
      }
      return token === this.token;
    })();
  }

  dispose() {
    if (this.disposed) return;
    this.cancel();
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.ro?.disconnect();
    this.mo?.disconnect();
    this.reducedMq.removeEventListener?.("change", this.onSchemeChange);
    this.schemeMq?.removeEventListener?.("change", this.onSchemeChange);
    this.#clearFx();
    this.#removeMode();
    this.#disposeChildren(this.net);
    this.scene.traverse((o) => { o.geometry?.dispose(); if (o.material) [].concat(o.material).forEach((m) => { m.map?.dispose(); m.dispose(); }); });
    for (const g of Object.values(this.geo)) g.dispose();
    this.gridTex.dispose(); this.glowTex.dispose(); this.dashTex.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss?.();
    this.renderer.domElement.remove();
  }

  // ---------- network scene ----------

  #makeDevice(d, p) {
    const group = new THREE.Group();
    group.position.copy(p);
    const body = new THREE.Mesh(this.geo.device, new THREE.MeshStandardMaterial({ roughness: 0.62, metalness: 0 }));
    body.position.y = DEVICE.h / 2;
    body.castShadow = true;
    body.receiveShadow = true;
    group.add(body);

    // icon on the top face
    const icon = new Painted((ctx, t) => ({
      w: 64, h: 64,
      draw: (c) => {
        c.translate(32, 32);
        c.strokeStyle = t.ink; c.lineWidth = 2.2; c.lineCap = "round"; c.lineJoin = "round";
        c.stroke(new Path2D(ICONS[d.kind] || ICONS.server));
      },
    }), this.theme);
    const top = new THREE.Mesh(this.geo.plane, new THREE.MeshBasicMaterial({ map: icon.texture, transparent: true, depthWrite: false, toneMapped: false }));
    top.rotation.x = -Math.PI / 2;
    top.position.y = DEVICE.h + 0.002;
    top.scale.set(0.5, 0.5, 1);
    group.add(top);

    // name + kind label in front, constant size on screen
    const label = this.#screenLabel((ctx, t) => {
      ctx.font = `600 14px ${FONT.body}`;
      const name = wrap(ctx, d.label, 170, 2);
      const nw = Math.max(...name.map((l) => ctx.measureText(l).width));
      ctx.font = `500 10px ${FONT.mono}`;
      const kind = KIND_LABEL[d.kind] || String(d.kind).toUpperCase();
      const w = Math.ceil(Math.max(nw, ctx.measureText(kind).width) + 18);
      const h = 14 + name.length * 18 + 14;
      return {
        w, h,
        draw: (c) => {
          c.fillStyle = t.surface; c.globalAlpha = 0.82;
          roundRect(c, 0, 0, w, h, 8); c.fill();
          c.globalAlpha = 1;
          c.textAlign = "center";
          c.fillStyle = t.ink; c.font = `600 14px ${FONT.body}`;
          name.forEach((l, i) => c.fillText(l, w / 2, 19 + i * 18));
          c.fillStyle = t.muted; c.font = `500 10px ${FONT.mono}`;
          c.fillText(kind, w / 2, h - 9);
        },
      };
    }, { anchorY: 0.82 });
    // the pill tucks slightly over the block's front face, which keeps rows from crowding
    label.position.set(0, 0, DEVICE.d / 2 + 0.02);
    group.add(label);

    group.userData.retheme = () => {
      const t = this.theme;
      const c = new THREE.Color(t.surface);
      if (t.dark) c.lerp(new THREE.Color(t.line), 0.85);
      body.material.color.copy(c);
      icon.paint(t);
    };
    group.userData.retheme();
    const dev = { group, body, label, lift: 0, liftGoal: 0, glow: 0, glowGoal: 0, glowColor: new THREE.Color() };
    this.ambient.add(this.#deviceUpdater(dev));
    group.userData.ambientKey = dev;
    this.net.add(group);
    return dev;
  }

  #deviceUpdater(dev) {
    return (now, dt) => {
      const k = 1 - Math.exp(-dt * 7);
      dev.lift += (dev.liftGoal - dev.lift) * k;
      dev.glow += (dev.glowGoal - dev.glow) * k;
      dev.group.position.y = dev.lift;
      const pulse = dev.pulsing ? 0.55 + 0.45 * Math.sin(now / 260) : 1;
      dev.body.material.emissive.copy(dev.glowColor).multiplyScalar(dev.glow * pulse * (this.theme.dark ? 0.22 : 0.4));
    };
  }

  #makeCable(a, b) {
    const s = a.clone(); s.y = 0.1;
    const e = b.clone(); e.y = 0.1;
    const len = s.distanceTo(e);
    const geo = new THREE.TubeGeometry(new THREE.LineCurve3(s, e), 8, 0.035, 8, false);
    const idle = new THREE.MeshStandardMaterial({ roughness: 0.8 });
    const tex = this.dashTex.clone();
    tex.repeat.set(Math.max(2, Math.round(len * 5)), 1);
    const active = new THREE.MeshStandardMaterial({ roughness: 0.5, emissiveMap: tex, emissiveIntensity: 1.6 });
    const mesh = new THREE.Mesh(geo, idle);
    mesh.castShadow = true;
    mesh.userData.retheme = () => {
      idle.color.set(this.theme.line);
      if (mesh.userData.proto != null) this.#tintCable(link, mesh.userData.proto);
    };
    const link = { mesh, idle, active, tex, dir: 1, startId: null };
    mesh.userData.dispose = () => { tex.dispose(); active.dispose(); idle.dispose(); };
    mesh.userData.retheme();
    this.net.add(mesh);
    return link;
  }

  #tintCable(link, protocol) {
    const c = new THREE.Color(this.theme.proto(protocol));
    link.active.color.copy(c).multiplyScalar(0.55);
    link.active.emissive.copy(c);
    link.mesh.material = link.active;
    link.mesh.userData.proto = protocol;
  }

  #activateCable(fromId, toId, protocol) {
    const link = this.links.get(fromId + "|" + toId);
    if (!link) return;
    this.#tintCable(link, protocol);
    link.dir = link.ends[0] === fromId ? -1 : 1;
  }

  #resetNetwork() {
    for (const link of new Set(this.links?.values() || [])) {
      link.mesh.material = link.idle;
      link.mesh.userData.proto = null;
    }
    for (const dev of this.devices?.values() || []) {
      dev.liftGoal = 0; dev.glowGoal = 0; dev.pulsing = false;
    }
  }

  // Small scenes stay whole on screen and the camera drifts toward the current path;
  // wide scenes (many columns) crop to the path with some context around it.
  #frameNetwork(ids, { instant = false, all = false } = {}) {
    const pad = (b) => { b.min.x -= 0.75; b.max.x += 0.75; b.min.z -= 0.55; b.max.z += 0.9; b.max.y = 0.9; return b; };
    const allBox = new THREE.Box3();
    for (const p of Object.values(this.world)) allBox.expandByPoint(p);
    const box = new THREE.Box3();
    for (const id of ids) if (this.world[id]) box.expandByPoint(this.world[id]);
    if (all || box.isEmpty()) return this.#frameBox(pad(allBox), { elev: 0.98, azim: 0.24, instant });
    pad(allBox); pad(box);
    const wide = allBox.max.x - allBox.min.x > 10.5;
    if (wide) {
      const c = box.getCenter(new THREE.Vector3());
      const sz = box.getSize(new THREE.Vector3());
      box.setFromCenterAndSize(c, new THREE.Vector3(Math.max(sz.x, 7.5), sz.y, Math.max(sz.z, 3)));
      box.min.y = 0;
      return this.#frameBox(box, { elev: 0.98, azim: 0.24, instant });
    }
    const bias = box.getCenter(new THREE.Vector3()).sub(allBox.getCenter(new THREE.Vector3())).multiplyScalar(0.2).setY(0);
    this.#frameBox(allBox, { elev: 0.98, azim: 0.24, instant, bias, fill: 0.95 });
  }

  // Puts the camera so the box fills the view (fill = fraction of the view used). The box is
  // centred by its on-screen (perspective) extent, then nudged by `bias` (world units), and the
  // distance is grown until every corner still fits.
  #frameBox(box, { elev, azim, instant = false, fill = 0.92, bias = null }) {
    const dir = new THREE.Vector3(Math.sin(azim) * Math.cos(elev), Math.sin(elev), Math.cos(azim) * Math.cos(elev));
    const right = new THREE.Vector3().crossVectors(UP, dir).normalize();
    const up = new THREE.Vector3().crossVectors(dir, right).normalize();
    const vt = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)) * fill;
    const ht = vt * this.camera.aspect;
    const corners = [];
    for (let i = 0; i < 8; i++) corners.push(new THREE.Vector3(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z));
    const center = box.getCenter(new THREE.Vector3());
    const p = new THREE.Vector3();
    const fit = () => {
      let dist = 3;
      for (const c of corners) {
        p.subVectors(c, center);
        const z = p.dot(dir);
        dist = Math.max(dist, Math.abs(p.dot(right)) / ht + z, Math.abs(p.dot(up)) / vt + z);
      }
      return dist;
    };
    let dist = fit();
    for (let it = 0; it < 4; it++) {
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
      for (const c of corners) {
        p.subVectors(c, center);
        const depth = Math.max(0.5, dist - p.dot(dir));
        const sx = p.dot(right) / depth, sy = p.dot(up) / depth;
        x0 = Math.min(x0, sx); x1 = Math.max(x1, sx); y0 = Math.min(y0, sy); y1 = Math.max(y1, sy);
      }
      center.addScaledVector(right, ((x0 + x1) / 2) * dist).addScaledVector(up, ((y0 + y1) / 2) * dist);
      dist = fit();
    }
    if (bias) { center.add(bias); dist = fit(); }
    Object.assign(this.goal, { elev, azim, dist });
    this.goal.target.copy(center);
    this.lastFrame = { box: box.clone(), elev, azim, fill, bias: bias && bias.clone() };
    if (instant || this.reduced) {
      Object.assign(this.view, { elev, azim, dist });
      this.view.target.copy(center);
    }
  }

  #highlight(a, token, instant) {
    const dev = this.devices.get(a.device);
    if (!dev) return Promise.resolve(token === this.token);
    this.#frameNetwork([a.device, ...this.#neighbours(a.device)], { instant });
    dev.liftGoal = 0.22; dev.glowGoal = 1; dev.pulsing = !instant;
    dev.glowColor.set(this.theme.accent);
    if (instant) { dev.lift = dev.liftGoal; dev.glow = 1; }

    // expanding ring on the surface
    const ringMat = new THREE.MeshBasicMaterial({ color: this.theme.accent, transparent: true, depthWrite: false, side: THREE.DoubleSide });
    const ring = new THREE.Mesh(this.geo.ring, ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.copy(this.world[a.device]).setY(0.01);
    ring.userData.retheme = () => ringMat.color.set(this.theme.accent);
    this.fx.add(ring);
    if (instant) { ring.scale.setScalar(1.05); ringMat.opacity = 0.5; }
    else {
      let t = 0;
      this.ambient.add(ring.userData.tick = (now, dt) => {
        t = (t + dt / 1.4) % 1;
        ring.scale.setScalar(0.85 + t * 0.7);
        ringMat.opacity = 0.75 * (1 - t);
      });
    }

    const cap = this.#caption(a.caption, "note");
    cap.position.copy(this.world[a.device]).setY(DEVICE.h + 0.62);
    cap.userData.follow = dev;
    this.fx.add(cap);
    const ms = instant ? 0 : 1400 / this.speed;
    return this.#wait(ms, token);
  }

  #neighbours(id) {
    const out = [];
    for (const l of this.lesson.links) { if (l.a === id) out.push(l.b); if (l.b === id) out.push(l.a); }
    return out;
  }

  #caption(text, kind, { below = false } = {}) {
    return this.#screenLabel((ctx, t) => {
      ctx.font = `500 13px ${FONT.body}`;
      const lines = wrap(ctx, text, 300, 3);
      const w = Math.ceil(Math.max(80, ...lines.map((l) => ctx.measureText(l).width)) + 24);
      const h = 12 + lines.length * 18 + 4;
      const top = 0;
      return {
        w, h: below ? h : h + 8,
        draw: (c) => {
          c.fillStyle = kind === "warn" ? t.warn : t.ink;
          roundRect(c, 0, top, w, h, 8); c.fill();
          if (!below) { c.beginPath(); c.moveTo(w / 2 - 7, h); c.lineTo(w / 2, h + 7); c.lineTo(w / 2 + 7, h); c.fill(); }
          c.fillStyle = kind === "warn" ? t.onP : t.bg;
          c.font = `500 13px ${FONT.body}`;
          c.textAlign = "center";
          lines.forEach((l, i) => c.fillText(l, w / 2, top + 22 + i * 18));
        },
      };
    }, { anchorY: 0, order: 20 });
  }

  #travel(a, token, instant) {
    const path = (a.path || []).filter((id) => this.world[id]);
    if (path.length < 2) return Promise.resolve(token === this.token);
    this.#frameNetwork(path, { instant });
    for (let i = 0; i < path.length - 1; i++) this.#activateCable(path[i], path[i + 1], a.packet.protocol);
    const color = new THREE.Color(this.theme.proto(a.packet.protocol));

    const pkt = new THREE.Group();
    const body = new THREE.Mesh(this.geo.capsule, new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.75, roughness: 0.3 }));
    body.rotation.z = Math.PI / 2;
    body.castShadow = true;
    const spin = new THREE.Group();
    spin.add(body);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowTex, color, transparent: true, opacity: 0.7, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    glow.scale.set(1.1, 1.1, 1);
    let blocked = false;
    const label = this.#screenLabel((ctx, t) => {
      const text = `${a.packet.protocol} · ${a.packet.label}`;
      ctx.font = `500 13px ${FONT.mono}`;
      const line = wrap(ctx, text, 280, 1)[0] || "";
      const w = Math.ceil(ctx.measureText(line).width + 26), h = 28;
      return {
        w, h,
        draw: (c) => {
          c.fillStyle = blocked ? t.warn : t.proto(a.packet.protocol);
          roundRect(c, 0, 0, w, h, 14); c.fill();
          c.fillStyle = t.onP; c.font = `500 13px ${FONT.mono}`;
          c.textAlign = "center";
          c.fillText(line, w / 2, 19);
        },
      };
    }, { anchorY: 0, order: 25 });
    label.position.y = 0.2;
    pkt.add(spin, glow, label);
    const recolor = () => {
      const c = new THREE.Color(blocked ? this.theme.warn : this.theme.proto(a.packet.protocol));
      body.material.color.copy(c); body.material.emissive.copy(c); glow.material.color.copy(c);
      label.userData.painted.paint(this.theme);
    };
    pkt.userData.retheme = () => {
      recolor();
      for (let i = 0; i < path.length - 1; i++) this.#activateCable(path[i], path[i + 1], a.packet.protocol);
    };
    this.fx.add(pkt);
    this.currentPacket = a.packet;
    this.clickables = [body, label];
    this.renderer.domElement.setAttribute("aria-label", `${a.packet.protocol} packet: ${a.packet.label}. Press Enter for details`);

    // flowing dashes on the active cables
    const links = [];
    for (let i = 0; i < path.length - 1; i++) { const l = this.links.get(path[i] + "|" + path[i + 1]); if (l) links.push(l); }
    if (!instant) this.ambient.add(pkt.userData.tick = (now, dt) => { for (const l of links) l.tex.offset.x += l.dir * dt * 1.6; });

    const pts = path.map((id) => this.world[id]);
    const at = (i, u) => {
      const A = pts[i], B = pts[i + 1];
      const v = new THREE.Vector3().lerpVectors(A, B, u);
      const arc = 0.22 + 0.06 * A.distanceTo(B);
      v.y = FLY_Y + Math.sin(Math.PI * u) * arc;
      return v;
    };
    const face = (i) => { const d = new THREE.Vector3().subVectors(pts[i + 1], pts[i]); spin.rotation.y = Math.atan2(-d.z, d.x); };
    const lastI = pts.length - 2;
    const dropStop = 1 - 0.62 / Math.max(0.8, pts[lastI].distanceTo(pts[lastI + 1]));
    const finish = () => {
      if (a.type !== "drop") { pkt.position.copy(pts[pts.length - 1]).setY(FLY_Y + 0.15); return; }
      blocked = true;
      recolor();
      const dev = this.devices.get(path[path.length - 1]);
      if (dev) { dev.glowColor.set(this.theme.warn); dev.glowGoal = 1; if (instant) dev.glow = 1; }
      const end = pts[pts.length - 1];
      const x = this.#screenLabel((ctx, t) => ({
        w: 30, h: 30,
        draw: (c) => {
          c.fillStyle = t.warn; c.beginPath(); c.arc(15, 15, 14, 0, Math.PI * 2); c.fill();
          c.strokeStyle = t.onP; c.lineWidth = 3.2; c.lineCap = "round";
          c.beginPath(); c.moveTo(9.5, 9.5); c.lineTo(20.5, 20.5); c.moveTo(20.5, 9.5); c.lineTo(9.5, 20.5); c.stroke();
        },
      }), { anchorY: 0.5, order: 26 });
      x.position.copy(end).setY(DEVICE.h + 0.45);
      // the warning goes below the device's name label (like the 2D view); the X marks the device
      const cap = this.#caption("Blocked: " + a.reason, "warn", { below: true });
      cap.position.copy(end).setZ(end.z + DEVICE.d / 2 + 0.02);
      const devLabel = dev?.label?.userData.painted;
      const place = () => { cap.center.y = 1 + ((devLabel ? devLabel.h * 0.82 : 40) + 8) / cap.userData.painted.h; };
      cap.userData.painted.onPaint = place;
      place();
      this.fx.add(x, cap);
      if (instant) pkt.position.copy(at(lastI, dropStop - 0.12));
    };

    face(0);
    if (instant) {
      face(lastI);
      finish();
      return Promise.resolve(token === this.token);
    }
    pkt.position.copy(at(0, 0));
    const perHop = 1150 / this.speed;
    const hops = pts.length - 1;
    const run = async () => {
      for (let i = 0; i < hops; i++) {
        face(i);
        const isLast = i === hops - 1;
        const stop = isLast && a.type === "drop" ? dropStop : 1;
        const ok = await this.#tween(perHop * (isLast && a.type === "drop" ? stop : 1), (t) => {
          pkt.position.copy(at(i, easeInOut(t) * stop));
          spin.rotation.x += 0.04;
        }, token);
        if (!ok) return false;
      }
      if (a.type === "drop") {
        finish();
        // bounce back off the device
        const ok = await this.#tween(650 / this.speed, (t) => {
          const back = Math.sin(Math.min(1, t * 1.4) * Math.PI / 2) * 0.12;
          const u = dropStop - back - 0.04 * Math.sin(t * Math.PI * 3) * (1 - t);
          pkt.position.copy(at(lastI, u));
          pkt.position.y += Math.abs(Math.sin(t * Math.PI * 2)) * 0.18 * (1 - t);
        }, token);
        if (!ok) return false;
        return this.#wait(250 / this.speed, token);
      }
      const from = pkt.position.clone();
      const to = pts[pts.length - 1].clone().setY(FLY_Y + 0.15);
      const ok = await this.#tween(220, (t) => pkt.position.lerpVectors(from, to, easeOut(t)), token);
      if (!ok) return false;
      return this.#wait(120, token);
    };
    return run();
  }

  // ---------- OSI scene ----------

  #buildOsi() {
    const group = new THREE.Group();
    const SLAB = { w: 4.0, h: 0.4, d: 1.1 };
    const X = { sender: -2.4, receiver: 2.4 };
    const layerY = (n) => 0.38 + (n - 1) * 0.5;
    const BLOCK_OFF = 0.6; // block sits on the inner part of each slab, labels on the outer part
    const blockX = { sender: X.sender + BLOCK_OFF, receiver: X.receiver - BLOCK_OFF };
    blockX.medium = 0;
    const slabs = { sender: new Map(), receiver: new Map() };
    const layerColor = (n) => this.theme.proto(LAYER_COLOR[n]);

    const slabGeo = new RoundedBoxGeometry(SLAB.w, SLAB.h, SLAB.d, 3, 0.06);
    const meshes = [];
    for (const side of ["sender", "receiver"]) {
      for (const L of OSI_LAYERS) {
        const mat = new THREE.MeshStandardMaterial({ transparent: true, opacity: 0.3, roughness: 0.4, depthWrite: false });
        const slab = new THREE.Mesh(slabGeo, mat);
        slab.position.set(X[side], layerY(L.n), 0);
        slab.renderOrder = 1;
        const painted = new Painted((ctx, t) => ({
          w: 116, h: 40,
          draw: (c) => {
            const right = side === "receiver";
            c.textAlign = right ? "right" : "left";
            const x = right ? 112 : 4;
            c.fillStyle = t.ink; c.font = `600 15px ${FONT.body}`;
            c.fillText(`${L.n}  ${L.name}`, x, 17);
            c.fillStyle = t.muted; c.font = `500 10px ${FONT.mono}`;
            c.fillText(L.pdu.toUpperCase(), x, 33);
          },
        }), this.theme);
        const lab = new THREE.Mesh(this.geo.plane, new THREE.MeshBasicMaterial({ map: painted.texture, transparent: true, depthWrite: false, toneMapped: false, fog: false }));
        lab.scale.set(1.16, 0.4, 1);
        lab.position.set(X[side] + (side === "sender" ? -1.32 : 1.32), layerY(L.n), SLAB.d / 2 + 0.01);
        lab.renderOrder = 3;
        const entry = { slab, mat, painted, active: 0, goal: 0, n: L.n };
        slabs[side].set(L.n, entry);
        meshes.push(slab, lab);
        slab.userData.retheme = () => { mat.color.set(layerColor(L.n)); mat.emissive.set(layerColor(L.n)); painted.paint(this.theme); };
        slab.userData.retheme();
        lab.userData.dispose = () => painted.texture.dispose();
      }
      const title = this.#meshText((ctx, t) => ({
        w: 200, h: 28,
        draw: (c) => { c.fillStyle = t.muted; c.font = `500 15px ${FONT.mono}`; c.textAlign = "center"; c.fillText(side.toUpperCase(), 100, 19); },
      }));
      title.position.set(X[side], layerY(7) + 0.48, 0);
      group.add(title);
    }
    group.add(...meshes);
    group.userData.dispose = () => slabGeo.dispose();

    // the medium: a cable between the two stacks at layer 1
    const cable = new THREE.Mesh(
      new THREE.TubeGeometry(new THREE.LineCurve3(new THREE.Vector3(X.sender + 1.2, 0.09, 0.75), new THREE.Vector3(X.receiver - 1.2, 0.09, 0.75)), 8, 0.035, 8, false),
      new THREE.MeshStandardMaterial({ roughness: 0.8 }),
    );
    cable.castShadow = true;
    cable.userData.retheme = () => cable.material.color.set(this.theme.line);
    cable.userData.retheme();
    group.add(cable);

    // the data block: [L2 hdr][IP hdr][L4 hdr][DATA][FCS]
    const PART = [
      { key: "h2", w: 0.5, n: 2, text: "MAC hdr" },
      { key: "h3", w: 0.5, n: 3, text: "IP hdr" },
      { key: "h4", w: 0.5, n: 4, text: "L4 hdr" },
      { key: "data", w: 0.72, n: 7, text: "DATA" },
      { key: "tr", w: 0.38, n: 2, text: "FCS" },
    ];
    const BH = 0.3, BD = 0.34;
    const block = new THREE.Group();
    block.position.z = SLAB.d / 2 + 0.12;
    const partGeo = new RoundedBoxGeometry(1, BH, BD, 2, 0.035);
    const parts = {};
    let encrypted = 0;
    for (const P of PART) {
      const mat = new THREE.MeshStandardMaterial({ roughness: 0.45, transparent: true });
      const mesh = new THREE.Mesh(partGeo, mat);
      const painted = new Painted((ctx, t) => ({
        w: P.w * UNIT, h: BH * UNIT,
        draw: (c) => {
          c.textAlign = "center";
          c.fillStyle = t.onP;
          if (P.key === "data") {
            c.font = `600 12px ${FONT.mono}`;
            c.fillText("DATA", P.w * UNIT / 2, encrypted > 0.5 ? 14 : 19);
            if (encrypted > 0.5) { c.font = `500 9px ${FONT.mono}`; c.fillText("encrypted", P.w * UNIT / 2, 25); }
          } else {
            c.font = `600 11px ${FONT.mono}`;
            c.fillText(P.text, P.w * UNIT / 2, 19);
          }
        },
      }), this.theme);
      const face = new THREE.Mesh(this.geo.plane, new THREE.MeshBasicMaterial({ map: painted.texture, transparent: true, depthWrite: false, toneMapped: false, fog: false }));
      face.position.z = BD / 2 + 0.003;
      face.renderOrder = 5;
      const holder = new THREE.Group();
      holder.add(mesh, face);
      block.add(holder);
      parts[P.key] = { ...P, holder, mesh, face, mat, painted, p: 0 };
      mesh.userData.retheme = () => {
        const c = new THREE.Color(P.key === "data" ? (encrypted > 0.5 ? this.theme.proto("tls") : this.theme.accent) : layerColor(P.n));
        mat.color.copy(c); mat.emissive.copy(c).multiplyScalar(0.18);
        painted.paint(this.theme);
      };
      mesh.userData.retheme();
      face.userData.dispose = () => painted.texture.dispose();
    }
    block.userData.dispose = () => partGeo.dispose();
    // bits overlay
    const bitsPainted = new Painted((ctx, t) => ({
      w: 260, h: BH * UNIT,
      draw: (c) => {
        c.fillStyle = t.ink; c.globalAlpha = 0.92; roundRect(c, 0, 0, 260, BH * UNIT, 6); c.fill(); c.globalAlpha = 1;
        c.fillStyle = t.proto("icmp"); c.font = `600 13px ${FONT.mono}`; c.textAlign = "center";
        c.fillText("1 0 1 1 0 0 1 0 1 1 1 0 0 1 0 1 0 0 1 1", 130, 20);
      },
    }), this.theme);
    const bits = new THREE.Mesh(this.geo.plane, new THREE.MeshBasicMaterial({ map: bitsPainted.texture, transparent: true, depthWrite: false, toneMapped: false, opacity: 0, fog: false }));
    bits.position.z = BD / 2 + 0.01;
    bits.renderOrder = 6;
    bits.userData.retheme = () => bitsPainted.paint(this.theme);
    bits.userData.dispose = () => bitsPainted.texture.dispose();
    block.add(bits);
    let pBits = 0;
    block.visible = false;
    group.add(block);

    const layout = () => {
      let total = 0;
      for (const P of PART) total += P.w * parts[P.key].p;
      let x = -total / 2;
      for (const P of PART) {
        const pt = parts[P.key];
        const w = Math.max(0.0001, P.w * pt.p);
        pt.holder.visible = pt.p > 0.01;
        pt.holder.scale.set(w, 1, 1);
        pt.face.scale.set(1, BH, 1);
        pt.holder.position.x = x + w / 2;
        pt.mat.opacity = 1 - 0.5 * pBits;
        x += w;
      }
      bits.scale.set(Math.max(0.0001, total), BH, 1);
      bits.material.opacity = pBits;
      bits.visible = pBits > 0.01;
    };

    // S(k): what the block holds after the sender processed layer k (k = 8: nothing yet).
    const S = (k) => ({ data: k <= 7 ? 1 : 0, enc: k <= 6 ? 1 : 0, h4: k <= 4 ? 1 : 0, h3: k <= 3 ? 1 : 0, h2: k <= 2 ? 1 : 0, tr: k <= 2 ? 1 : 0, bits: k <= 1 ? 1 : 0 });
    const apply = (st) => {
      for (const key of ["data", "h4", "h3", "h2", "tr"]) parts[key].p = st[key];
      pBits = st.bits;
      const enc = st.enc > 0.5 ? 1 : 0;
      if (enc !== encrypted) { encrypted = enc; parts.data.mesh.userData.retheme(); }
      layout();
    };
    const mix = (A, B, t) => { const o = {}; for (const k in A) o[k] = A[k] + (B[k] - A[k]) * t; return o; };

    const highlight = (side, n) => {
      for (const s of ["sender", "receiver"]) for (const e of slabs[s].values()) e.goal = s === side && e.n === n ? 1 : 0;
    };
    this.ambient.add(group.userData.tick = (now, dt) => {
      const k = 1 - Math.exp(-dt * 8);
      for (const s of ["sender", "receiver"]) for (const e of slabs[s].values()) {
        e.active += (e.goal - e.active) * k;
        e.mat.opacity = 0.26 + 0.42 * e.active;
        e.mat.emissiveIntensity = 0.05 + 0.4 * e.active;
        e.slab.scale.setScalar(1 + 0.03 * e.active);
      }
    });

    let caption = null;
    const setCaption = (text) => {
      if (caption) { this.#disposeObject(caption); caption.removeFromParent(); }
      caption = this.#caption(text, "note");
      caption.position.set(0, layerY(7) + 0.9, 0);
      group.add(caption);
    };

    const go = async (st, prev, token) => {
      const side = st.side, n = st.layer;
      const reduced = this.reduced;
      highlight(side === "medium" ? null : side, n);
      setCaption(st.caption);
      block.visible = true;
      let from, to;
      if (side === "sender") { from = S(n + 1); to = S(n); }
      else if (side === "medium") { from = S(1); to = S(1); }
      else { from = n === 1 ? S(1) : n === 2 ? S(1) : S(n); to = n === 1 ? S(1) : S(Math.min(7, n + 1)); }
      // where the block starts and ends
      const endPos = new THREE.Vector3(side === "medium" ? blockX.receiver : blockX[side], layerY(n), 0);
      const startPos = side === "medium"
        ? new THREE.Vector3(blockX.sender, layerY(1), 0)
        : prev ? block.position.clone().setZ(0) : endPos.clone().setY(layerY(n) + 0.6);
      const z = SLAB.d / 2 + 0.12;
      const place = (v) => block.position.set(v.x, v.y, z);
      if (reduced) { place(endPos); apply(to); return token === this.token; }
      place(startPos);
      apply(from);
      const dur = (side === "medium" ? 1300 : 900) / this.speed;
      return this.#tween(dur, (t) => {
        const e = easeInOut(t);
        const v = new THREE.Vector3().lerpVectors(startPos, endPos, e);
        if (side === "medium") { v.y = layerY(1) - Math.sin(Math.PI * e) * 0.22; }
        place(v);
        // headers slide in/out after the block reaches the layer
        const tt = side === "sender" ? clamp((t - 0.25) / 0.6, 0, 1) : clamp(t / 0.7, 0, 1);
        apply(mix(from, to, side === "sender" && from.data === 0 ? easeOutBack(clamp(t / 0.6, 0, 1)) : easeOut(tt)));
      }, token).then((ok) => { if (ok) apply(to); return ok; });
    };

    apply(S(8));
    return { group, go };
  }

  // ---------- helpers ----------

  #screenLabel(layout, { anchorY = 0.5, order = 10 } = {}) {
    const painted = new Painted(layout, this.theme);
    const mat = new THREE.SpriteMaterial({ map: painted.texture, transparent: true, depthTest: false, depthWrite: false, toneMapped: false, fog: false });
    const sprite = new THREE.Sprite(mat);
    sprite.center.set(0.5, anchorY);
    sprite.renderOrder = order;
    sprite.userData.painted = painted;
    sprite.userData.screen = true;
    sprite.userData.retheme = () => painted.paint(this.theme);
    sprite.userData.dispose = () => painted.texture.dispose();
    return sprite;
  }

  #meshText(layout) {
    const painted = new Painted(layout, this.theme);
    const mesh = new THREE.Mesh(this.geo.plane, new THREE.MeshBasicMaterial({ map: painted.texture, transparent: true, depthWrite: false, toneMapped: false, fog: false }));
    mesh.scale.set(painted.w / UNIT, painted.h / UNIT, 1);
    mesh.userData.retheme = () => painted.paint(this.theme);
    mesh.userData.dispose = () => painted.texture.dispose();
    return mesh;
  }

  #tween(ms, fn, token) {
    if (token !== this.token) return Promise.resolve(false);
    if (!(ms > 0)) { fn(1); return Promise.resolve(true); }
    return new Promise((resolve) => {
      this.tweens.push({ start: performance.now(), ms, fn, resolve, token });
    });
  }

  #wait(ms, token) {
    if (token !== this.token) return Promise.resolve(false);
    if (!(ms > 0)) return Promise.resolve(true);
    return new Promise((resolve) => {
      const done = (v) => { clearTimeout(id); this.waits.delete(done); resolve(v); };
      const id = setTimeout(() => done(token === this.token), ms);
      this.waits.add(done);
    });
  }

  #enterMode(mode) {
    this.#removeMode();
    this.mode = mode;
    this.net.visible = false;
    this.modeGroup = new THREE.Group();
    this.scene.add(this.modeGroup);
  }

  #removeMode() {
    if (!this.modeGroup) return;
    this.#disposeObject(this.modeGroup);
    this.modeGroup.removeFromParent();
    this.modeGroup = null;
    this.ambient.clear();
    // device updaters live in ambient too: re-add them
    for (const dev of this.devices?.values() || []) this.ambient.add(this.#deviceUpdater(dev));
    return true;
  }

  #clearFx() {
    for (const o of [...this.fx.children]) { this.#disposeObject(o); o.removeFromParent(); }
    this.clickables = [];
    this.currentPacket = null;
    this.renderer.domElement.setAttribute("aria-label", "3D network scene showing the current step");
    this.renderer.domElement.style.cursor = "";
    this.#resetNetwork();
  }

  #disposeObject(root) {
    root.traverse((o) => {
      if (o.userData.tick) this.ambient.delete(o.userData.tick);
      o.userData.dispose?.();
      if (o.geometry && !o.geometry.userData.keep) o.geometry.dispose();
      if (o.material) for (const m of [].concat(o.material)) {
        if (m.map && m.map !== this.glowTex && m.map !== this.gridTex && !o.userData.painted) m.map.dispose?.();
        m.dispose();
      }
    });
  }

  #disposeChildren(group) {
    for (const o of [...group.children]) { this.#disposeObject(o); o.removeFromParent(); }
    // device updaters are rebuilt by load()
    if (group === this.net) {
      this.ambient.clear();
      this.devices = new Map();
    }
  }

  #applyTheme(repaint = true) {
    this.theme = readTheme();
    const t = this.theme;
    const bg = new THREE.Color(t.surface);
    this.scene.background = bg;
    this.scene.fog.color.copy(bg);
    const ground = new THREE.Color(t.bg);
    this.ground.material.color.copy(ground);
    this.hemi.color.set(0xffffff);
    this.hemi.groundColor.copy(ground);
    this.hemi.intensity = t.dark ? 2.0 : 1.75;
    this.sun.intensity = t.dark ? 1.25 : 1.6;
    this.#paintGrid();
    if (repaint) this.scene.traverse((o) => o.userData.retheme?.());
  }

  #paintGrid() {
    const c = this.gridTex.image, ctx = c.getContext("2d");
    ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, c.width, c.height);
    // grid dots darken the ground colour a little
    ctx.fillStyle = this.theme.dark ? "#d8dde2" : "#c9d0d6";
    ctx.beginPath(); ctx.arc(32, 32, 2.4, 0, Math.PI * 2); ctx.fill();
    this.gridTex.needsUpdate = true;
  }

  #gridTexture() {
    const c = document.createElement("canvas");
    c.width = c.height = 64;
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(80 / 0.32, 80 / 0.32);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    return tex;
  }

  #glowTexture() {
    const c = document.createElement("canvas");
    c.width = c.height = 128;
    const ctx = c.getContext("2d");
    const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(0.25, "rgba(255,255,255,0.55)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g; ctx.fillRect(0, 0, 128, 128);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  #dashTexture() {
    const c = document.createElement("canvas");
    c.width = 64; c.height = 8;
    const ctx = c.getContext("2d");
    ctx.fillStyle = "#000"; ctx.fillRect(0, 0, 64, 8);
    ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, 22, 8);
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    return tex;
  }

  #bindEvents() {
    const canvas = this.renderer.domElement;
    this.ro = new ResizeObserver(() => this.#resize());
    this.ro.observe(this.container);
    this.onSchemeChange = () => this.#applyTheme(true);
    this.schemeMq = matchMedia("(prefers-color-scheme: dark)");
    this.schemeMq.addEventListener?.("change", this.onSchemeChange);
    this.mo = new MutationObserver(() => this.#applyTheme(true));
    this.mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "class", "style"] });

    const ray = new THREE.Raycaster();
    const hit = (e) => {
      if (!this.clickables.length) return false;
      const r = canvas.getBoundingClientRect();
      const ndc = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ndc, this.camera);
      return ray.intersectObjects(this.clickables, false).length > 0;
    };
    canvas.addEventListener("click", (e) => { if (this.currentPacket && hit(e)) this.onPacketClick?.(this.currentPacket); });
    canvas.addEventListener("pointermove", (e) => {
      if (e.pointerType !== "mouse") return;
      canvas.style.cursor = this.currentPacket && hit(e) ? "pointer" : "";
    });
    canvas.addEventListener("keydown", (e) => {
      if ((e.key === "Enter" || e.key === " ") && this.currentPacket) { e.preventDefault(); this.onPacketClick?.(this.currentPacket); }
    });
  }

  #resize() {
    const w = Math.max(1, Math.round(this.container.clientWidth));
    let h = Math.round(this.container.clientHeight);
    if (h < 60) h = Math.round(clamp(w * 0.58, 260, 620));
    if (w === this.width && h === this.height) return;
    this.width = w; this.height = h;
    this.renderer.setSize(w, h, true);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    if (this.lastFrame) {
      this.#frameBox(this.lastFrame.box, { ...this.lastFrame, instant: true });
    }
  }

  #loop = (now) => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.#loop);
    const dt = Math.min(0.1, Math.max(0, (now - this.last) / 1000));
    this.last = now;
    if (document.hidden) return;
    try {
      // tweens
      if (this.tweens.length) {
        const active = this.tweens;
        this.tweens = [];
        for (const tw of active) {
          if (tw.token !== this.token) { tw.resolve(false); continue; }
          const t = clamp((now - tw.start) / tw.ms, 0, 1);
          tw.fn(t);
          if (t >= 1) tw.resolve(true); else this.tweens.push(tw);
        }
      }
      for (const fn of this.ambient) fn(now, dt);

      // camera easing
      const k = this.reduced ? 1 : 1 - Math.exp(-dt * 2.6);
      const v = this.view, g = this.goal;
      v.target.lerp(g.target, k);
      v.dist += (g.dist - v.dist) * k;
      v.elev += (g.elev - v.elev) * k;
      v.azim += (g.azim - v.azim) * k;
      this.camera.position.set(
        v.target.x + v.dist * Math.sin(v.azim) * Math.cos(v.elev),
        v.target.y + v.dist * Math.sin(v.elev),
        v.target.z + v.dist * Math.cos(v.azim) * Math.cos(v.elev),
      );
      this.camera.lookAt(v.target);
      this.camera.updateMatrixWorld();
      this.sun.target.position.copy(v.target);
      this.sun.position.copy(v.target).add(new THREE.Vector3(-4, 9, 6));

      // keep screen labels at a constant on-screen size (like the 2D view)
      const ui = clamp(this.width / 820, 0.58, 1.1);
      const unitsPerPx = (2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2))) / this.height;
      const p = new THREE.Vector3();
      this.scene.traverseVisible((o) => {
        if (!o.userData.screen) return;
        o.getWorldPosition(p);
        const depth = p.applyMatrix4(this.camera.matrixWorldInverse).z * -1;
        const s = Math.max(0.01, depth) * unitsPerPx * ui;
        const pt = o.userData.painted;
        const parentScale = o.parent ? o.parent.getWorldScale(new THREE.Vector3()).x || 1 : 1;
        o.scale.set((pt.w * s) / parentScale, (pt.h * s) / parentScale, 1);
        // keep the label inside the canvas horizontally (like the 2D view clamps its pills)
        o.getWorldPosition(p).project(this.camera);
        const px = (p.x + 1) / 2 * this.width, half = (pt.w * ui) / 2, m = 6;
        let shift = 0;
        if (half * 2 < this.width - 2 * m) {
          if (px - half < m) shift = px - half - m;
          else if (px + half > this.width - m) shift = px + half - (this.width - m);
        }
        o.center.x = 0.5 + shift / (pt.w * ui);
      });
      this.renderer.render(this.scene, this.camera);
    } catch (e) {
      console.error("Stage3D frame error", e);
    }
  };
}
