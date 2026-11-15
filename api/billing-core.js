// Billing logic (no framework, no database). Stripe is the record of who paid.
//
// Flow: checkout (Stripe-hosted page) → our server checks the finished session
// with Stripe → we sign a short-lived "plan pass" the browser keeps and sends
// with AI requests → /api/ai enforces that plan's monthly AI budget.
// Card details never touch our code. Secrets come from environment variables.
import { createHmac, createHash, timingSafeEqual } from "node:crypto";

export const PLANS = {
  free: { name: "Free", priceLabel: "$0", aiCallsPerMonth: 25 },
  student: { name: "Student", priceLabel: "$12 / month", aiCallsPerMonth: 1500 },
  instructor: { name: "Instructor", priceLabel: "$29 / month", aiCallsPerMonth: 4000 },
};
const PAID = ["student", "instructor"];
const PASS_TTL_MS = 7 * 24 * 3600 * 1000;      // re-checked with Stripe weekly
const REFRESH_GRACE_MS = 30 * 24 * 3600 * 1000; // an expired pass can be renewed for 30 days
const STRIPE = "https://api.stripe.com";
const ACTIVE = new Set(["active", "trialing"]);

const b64 = (s) => Buffer.from(s).toString("base64url");
const hmac = (data, secret) => createHmac("sha256", secret).update(data).digest("base64url");
const isPlan = (p) => typeof p === "string" && Object.prototype.hasOwnProperty.call(PLANS, p);

// ---------- Plan passes ----------

export function signPass({ sub, plan, exp }, secret) {
  if (typeof secret !== "string" || secret.length < 16) throw new Error("VLEARN_PASS_SECRET must be at least 16 characters.");
  const payload = b64(JSON.stringify({ sub, plan, exp }));
  return `${payload}.${hmac(payload, secret)}`;
}

export function verifyPass(token, secret, now = Date.now(), { graceMs = 0 } = {}) {
  if (typeof token !== "string" || typeof secret !== "string" || secret.length < 16) return null;
  const parts = token.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  const expected = Buffer.from(hmac(parts[0], secret));
  const given = Buffer.from(parts[1]);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  let p;
  try { p = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8")); } catch { return null; }
  if (!p || typeof p.sub !== "string" || !PAID.includes(p.plan) || typeof p.exp !== "number") return null;
  if (now > p.exp + graceMs) return null;
  return { sub: p.sub, plan: p.plan, exp: p.exp };
}

// ---------- Configuration ----------

export function billingStatus(env) {
  const enabled = Boolean(env.STRIPE_SECRET_KEY && env.STRIPE_PRICE_STUDENT && env.STRIPE_PRICE_INSTRUCTOR
    && env.VLEARN_PASS_SECRET && env.VLEARN_PASS_SECRET.length >= 16 && env.APP_URL);
  const plans = Object.fromEntries(Object.entries(PLANS).map(([k, v]) => [k, { name: v.name, price: v.priceLabel, aiCallsPerMonth: v.aiCallsPerMonth }]));
  return { enabled, plans };
}

const priceFor = (plan, env) => ({ student: env.STRIPE_PRICE_STUDENT, instructor: env.STRIPE_PRICE_INSTRUCTOR })[plan];
const planForPrice = (priceId, env) =>
  priceId && priceId === env.STRIPE_PRICE_STUDENT ? "student"
  : priceId && priceId === env.STRIPE_PRICE_INSTRUCTOR ? "instructor" : null;
const appUrl = (env) => String(env.APP_URL).replace(/\/+$/, "");

// ---------- Stripe REST (form-encoded, no SDK) ----------

async function stripe(env, fetchFn, method, path, params) {
  const init = { method, headers: { authorization: `Bearer ${env.STRIPE_SECRET_KEY}` } };
  if (params) {
    init.headers["content-type"] = "application/x-www-form-urlencoded";
    init.body = new URLSearchParams(params).toString();
  }
  let res;
  try { res = await fetchFn(STRIPE + path, init); } catch { return { ok: false }; }
  if (!res.ok) return { ok: false };
  try { return { ok: true, data: await res.json() }; } catch { return { ok: false }; }
}

const notConfigured = { status: 503, body: { error: "Subscriptions aren't available on this server yet." } };
const stripeDown = { status: 502, body: { error: "Couldn't reach the payment service. Try again in a moment." } };

// ---------- Checkout ----------

export async function createCheckout(body, env, fetchFn = globalThis.fetch) {
  const plan = body?.plan;
  if (!PAID.includes(plan)) return { status: 400, body: { error: "Choose the Student or Instructor plan." } };
  if (!billingStatus(env).enabled) return notConfigured;
  const base = appUrl(env);
  const r = await stripe(env, fetchFn, "POST", "/v1/checkout/sessions", {
    mode: "subscription",
    "line_items[0][price]": priceFor(plan, env),
    "line_items[0][quantity]": "1",
    success_url: `${base}/?checkout=success&session_id={CHECKOUT_SESSION_ID}#pricing`,
    cancel_url: `${base}/?checkout=cancelled#pricing`,
    allow_promotion_codes: "true",
    "metadata[plan]": plan,
    "subscription_data[metadata][plan]": plan,
  });
  if (!r.ok || typeof r.data?.url !== "string") return stripeDown;
  return { status: 200, body: { url: r.data.url } };
}

// ---------- Passes from Stripe ----------

function passResponse(customer, plan, env, now) {
  const exp = now + PASS_TTL_MS;
  return { status: 200, body: { pass: signPass({ sub: customer, plan, exp }, env.VLEARN_PASS_SECRET), plan, exp } };
}

export async function issuePass(body, env, fetchFn = globalThis.fetch, now = Date.now()) {
  const id = body?.session_id;
  if (typeof id !== "string" || !/^cs_[A-Za-z0-9_]{1,200}$/.test(id)) return { status: 400, body: { error: "Unknown checkout." } };
  if (!billingStatus(env).enabled) return notConfigured;
  const r = await stripe(env, fetchFn, "GET", `/v1/checkout/sessions/${id}?expand[]=subscription`);
  if (!r.ok) return stripeDown;
  const s = r.data;
  const sub = s?.subscription;
  const plan = planForPrice(sub?.items?.data?.[0]?.price?.id, env);
  const paid = s?.status === "complete" && ["paid", "no_payment_required"].includes(s?.payment_status);
  if (!paid || !sub || !ACTIVE.has(sub.status) || !plan || typeof s.customer !== "string") {
    return { status: 402, body: { error: "This checkout isn't complete.", plan: "free" } };
  }
  return passResponse(s.customer, plan, env, now);
}

export async function refreshPass(body, env, fetchFn = globalThis.fetch, now = Date.now()) {
  if (!billingStatus(env).enabled) return notConfigured;
  const old = verifyPass(body?.pass, env.VLEARN_PASS_SECRET, now, { graceMs: REFRESH_GRACE_MS });
  if (!old) return { status: 401, body: { error: "Please sign in again.", plan: "free" } };
  const r = await stripe(env, fetchFn, "GET", `/v1/subscriptions?customer=${encodeURIComponent(old.sub)}&status=all&limit=10`);
  if (!r.ok) return stripeDown;
  for (const sub of r.data?.data || []) {
    const plan = planForPrice(sub?.items?.data?.[0]?.price?.id, env);
    if (ACTIVE.has(sub?.status) && plan) return passResponse(old.sub, plan, env, now);
  }
  return { status: 402, body: { error: "Your subscription has ended. You're on the Free plan.", plan: "free" } };
}

export async function createPortal(body, env, fetchFn = globalThis.fetch, now = Date.now()) {
  if (!billingStatus(env).enabled) return notConfigured;
  const p = verifyPass(body?.pass, env.VLEARN_PASS_SECRET, now, { graceMs: REFRESH_GRACE_MS });
  if (!p) return { status: 401, body: { error: "Please sign in again." } };
  const r = await stripe(env, fetchFn, "POST", "/v1/billing_portal/sessions", { customer: p.sub, return_url: `${appUrl(env)}/#pricing` });
  if (!r.ok || typeof r.data?.url !== "string") return stripeDown;
  return { status: 200, body: { url: r.data.url } };
}

// ---------- Monthly AI budgets ----------

// In-memory counter: fine for one server and for tests. Serverless instances don't
// share memory, so production should set Upstash Redis (see upstashStore).
export function memoryStore() {
  const m = new Map();
  return {
    async incr(key, ttlMs, now = Date.now()) {
      const e = m.get(key);
      if (!e || e.until <= now) { m.set(key, { n: 1, until: now + ttlMs }); return 1; }
      e.n += 1;
      return e.n;
    },
  };
}

// Shared counter via Upstash Redis REST (UPSTASH_REDIS_REST_URL / _TOKEN).
export function upstashStore(url, token, fetchFn = globalThis.fetch) {
  return {
    async incr(key, ttlMs) {
      const res = await fetchFn(`${url.replace(/\/+$/, "")}/pipeline`, {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify([["INCR", key], ["PEXPIRE", key, String(ttlMs), "NX"]]),
      });
      if (!res.ok) throw new Error("quota store unavailable");
      const out = await res.json();
      return Number(out?.[0]?.result);
    },
  };
}

const monthKey = (now) => new Date(now).toISOString().slice(0, 7); // YYYY-MM (UTC)

export async function checkQuota(store, identity, plan, now = Date.now()) {
  const limit = PLANS[isPlan(plan) ? plan : "free"].aiCallsPerMonth;
  const count = await store.incr(`vlearn:ai:${monthKey(now)}:${identity}`, 35 * 24 * 3600 * 1000, now);
  return { ok: count <= limit, count, limit };
}

// Who is calling: a paid customer (from a valid pass) or an anonymous free user (hashed IP).
export function whoIsCalling({ pass, passSecret, ip, now = Date.now() }) {
  const p = verifyPass(pass, passSecret, now);
  if (p) return { identity: `cus:${p.sub}`, plan: p.plan };
  const h = createHash("sha256").update(String(ip || "unknown")).digest("hex").slice(0, 32);
  return { identity: `ip:${h}`, plan: "free" };
}
