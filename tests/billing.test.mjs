import { test } from "node:test";
import assert from "node:assert/strict";
import {
  PLANS, signPass, verifyPass, createCheckout, issuePass, refreshPass, createPortal,
  memoryStore, checkQuota, recordUsage, usageCostMicros, billingStatus, whoIsCalling,
} from "../api/billing-core.js";
import { handleAiRequest } from "../api/ai-core.js";

const SECRET = "test-secret-0123456789";
const NOW = 1_800_000_000_000;
const env = {
  STRIPE_SECRET_KEY: "sk_test_x",
  STRIPE_PRICE_STUDENT: "price_student",
  STRIPE_PRICE_INSTRUCTOR: "price_instructor",
  VLEARN_PASS_SECRET: SECRET,
  APP_URL: "https://vlearn.example",
  UPSTASH_REDIS_REST_URL: "https://redis.example",
  UPSTASH_REDIS_REST_TOKEN: "t",
};

// A fake Stripe: records calls, answers by path.
function fakeStripe(routes) {
  const calls = [];
  const fn = async (url, init = {}) => {
    calls.push({ url, init });
    const path = url.replace("https://api.stripe.com", "").split("?")[0];
    const handler = routes[`${init.method || "GET"} ${path}`];
    if (!handler) return { ok: false, status: 404, json: async () => ({ error: { message: "no route" } }) };
    const body = handler(url, init);
    return { ok: true, status: 200, json: async () => body };
  };
  fn.calls = calls;
  return fn;
}

// --- Passes ---

test("a signed pass verifies and carries plan, customer and expiry", () => {
  const t = signPass({ sub: "cus_1", plan: "student", exp: NOW + 1000, live: false }, SECRET);
  const p = verifyPass(t, SECRET, NOW);
  assert.deepEqual(p, { sub: "cus_1", plan: "student", exp: NOW + 1000, live: false });
});

test("a pass is rejected if tampered, signed with another secret, expired or malformed", () => {
  const t = signPass({ sub: "cus_1", plan: "student", exp: NOW + 1000 }, SECRET);
  const [payload, sig] = t.split(".");
  const forged = Buffer.from(JSON.stringify({ sub: "cus_1", plan: "instructor", exp: NOW + 1000 })).toString("base64url") + "." + sig;
  assert.equal(verifyPass(forged, SECRET, NOW), null);
  assert.equal(verifyPass(signPass({ sub: "c", plan: "student", exp: NOW + 1000 }, "other-secret-xxxxxxxx"), SECRET, NOW), null);
  assert.equal(verifyPass(t, SECRET, NOW + 2000), null);
  for (const bad of ["", "abc", "a.b.c", payload, null, undefined, 42]) assert.equal(verifyPass(bad, SECRET, NOW), null);
});

test("an expired pass can still be read for refresh within the grace window only", () => {
  const t = signPass({ sub: "cus_1", plan: "student", exp: NOW }, SECRET);
  assert.equal(verifyPass(t, SECRET, NOW + 1000), null);
  assert.equal(verifyPass(t, SECRET, NOW + 1000, { graceMs: 5000 }).sub, "cus_1");
  assert.equal(verifyPass(t, SECRET, NOW + 9000, { graceMs: 5000 }), null);
});

test("signing refuses a missing or short secret", () => {
  assert.throws(() => signPass({ sub: "c", plan: "student", exp: NOW }, ""));
  assert.throws(() => signPass({ sub: "c", plan: "student", exp: NOW }, "short"));
});

// --- Status ---

test("billing is enabled only when Stripe, both prices, the pass secret, the app URL and a shared usage store are set", () => {
  assert.equal(billingStatus(env).enabled, true);
  for (const k of Object.keys(env)) assert.equal(billingStatus({ ...env, [k]: "" }).enabled, false, k);
  assert.deepEqual(Object.keys(billingStatus(env).plans), ["free", "student", "instructor"]);
});

// --- Checkout ---

test("checkout creates a Stripe subscription session for a paid plan, with our own return URLs", async () => {
  const stripe = fakeStripe({ "POST /v1/checkout/sessions": () => ({ id: "cs_1", url: "https://checkout.stripe.com/c/cs_1" }) });
  const r = await createCheckout({ plan: "student" }, env, stripe);
  assert.deepEqual(r, { status: 200, body: { url: "https://checkout.stripe.com/c/cs_1" } });
  const { init } = stripe.calls[0];
  assert.equal(init.headers.authorization, "Bearer sk_test_x");
  const form = new URLSearchParams(init.body);
  assert.equal(form.get("mode"), "subscription");
  assert.equal(form.get("line_items[0][price]"), "price_student");
  assert.equal(form.get("line_items[0][quantity]"), "1");
  assert.equal(form.get("metadata[plan]"), "student");
  assert.equal(form.get("subscription_data[metadata][plan]"), "student");
  assert.ok(form.get("success_url").startsWith("https://vlearn.example/?checkout=success&session_id={CHECKOUT_SESSION_ID}"));
  assert.ok(form.get("cancel_url").startsWith("https://vlearn.example/"));
});

test("checkout rejects free or unknown plans and never calls Stripe", async () => {
  const stripe = fakeStripe({});
  for (const plan of ["free", "schools", "", undefined, "__proto__"]) {
    const r = await createCheckout({ plan }, env, stripe);
    assert.equal(r.status, 400);
  }
  assert.equal(stripe.calls.length, 0);
});

test("checkout reports 503 when billing isn't configured", async () => {
  const r = await createCheckout({ plan: "student" }, { ...env, STRIPE_SECRET_KEY: "" }, fakeStripe({}));
  assert.equal(r.status, 503);
});

test("checkout hides Stripe error details", async () => {
  const stripe = async () => ({ ok: false, status: 401, json: async () => ({ error: { message: "Invalid API Key provided: sk_test_x" } }) });
  const r = await createCheckout({ plan: "student" }, env, stripe);
  assert.equal(r.status, 502);
  assert.ok(!JSON.stringify(r.body).includes("sk_test"));
});

// --- Issuing a pass after checkout ---

const paidSession = (over = {}) => ({
  id: "cs_1", status: "complete", payment_status: "paid", customer: "cus_9", livemode: false, created: Math.floor(NOW / 1000) - 60,
  metadata: { plan: "student" },
  subscription: { id: "sub_1", status: "active", items: { data: [{ price: { id: "price_student" } }] } },
  ...over,
});

test("a completed, paid checkout session issues a pass for the plan Stripe actually charged", async () => {
  const stripe = fakeStripe({ "GET /v1/checkout/sessions/cs_1": () => paidSession() });
  const r = await issuePass({ session_id: "cs_1" }, env, stripe, NOW);
  assert.equal(r.status, 200);
  const p = verifyPass(r.body.pass, SECRET, NOW);
  assert.equal(p.sub, "cus_9");
  assert.equal(p.plan, "student");
  assert.ok(p.exp > NOW);
  assert.equal(r.body.plan, "student");
  assert.match(stripe.calls[0].url, /expand\[\]=subscription/);
});

test("the plan comes from the charged price, not from metadata", async () => {
  const s = paidSession({ metadata: { plan: "instructor" } }); // metadata says instructor, price is student
  const stripe = fakeStripe({ "GET /v1/checkout/sessions/cs_1": () => s });
  const r = await issuePass({ session_id: "cs_1" }, env, stripe, NOW);
  assert.equal(verifyPass(r.body.pass, SECRET, NOW).plan, "student");
});

test("no pass for unfinished, unpaid, inactive or unknown-price sessions, or bad ids", async () => {
  const cases = [
    paidSession({ status: "open" }),
    paidSession({ payment_status: "unpaid" }),
    paidSession({ subscription: { id: "s", status: "canceled", items: { data: [{ price: { id: "price_student" } }] } } }),
    paidSession({ subscription: { id: "s", status: "active", items: { data: [{ price: { id: "price_other" } }] } } }),
  ];
  for (const s of cases) {
    const stripe = fakeStripe({ "GET /v1/checkout/sessions/cs_1": () => s });
    const r = await issuePass({ session_id: "cs_1" }, env, stripe, NOW);
    assert.equal(r.status, 402, JSON.stringify(s).slice(0, 80));
  }
  for (const id of ["", "x", "cs_../../v1/customers", "cs_1?x=1", null]) {
    const stripe = fakeStripe({});
    const r = await issuePass({ session_id: id }, env, stripe, NOW);
    assert.equal(r.status, 400, String(id));
    assert.equal(stripe.calls.length, 0);
  }
});

// --- Refresh ---

test("refresh re-checks Stripe and renews a pass for an active subscription", async () => {
  const old = signPass({ sub: "cus_9", plan: "student", exp: NOW - 1000 }, SECRET);
  const stripe = fakeStripe({
    "GET /v1/subscriptions": () => ({ data: [{ status: "active", items: { data: [{ price: { id: "price_instructor" } }] } }] }),
  });
  const r = await refreshPass({ pass: old }, env, stripe, NOW);
  assert.equal(r.status, 200);
  assert.equal(verifyPass(r.body.pass, SECRET, NOW).plan, "instructor");
  assert.match(stripe.calls[0].url, /customer=cus_9/);
});

test("refresh ends the paid plan when the subscription was cancelled", async () => {
  const old = signPass({ sub: "cus_9", plan: "student", exp: NOW + 1000 }, SECRET);
  const stripe = fakeStripe({ "GET /v1/subscriptions": () => ({ data: [{ status: "canceled", items: { data: [{ price: { id: "price_student" } }] } }] }) });
  const r = await refreshPass({ pass: old }, env, stripe, NOW);
  assert.equal(r.status, 402);
  assert.equal(r.body.plan, "free");
});

test("refresh rejects forged passes without calling Stripe", async () => {
  const stripe = fakeStripe({});
  const r = await refreshPass({ pass: signPass({ sub: "cus_9", plan: "student", exp: NOW }, "another-secret-xxxxx") }, env, stripe, NOW);
  assert.equal(r.status, 401);
  assert.equal(stripe.calls.length, 0);
});

// --- Portal ---

test("billing portal opens for a valid pass and returns to our app", async () => {
  const pass = signPass({ sub: "cus_9", plan: "student", exp: NOW + 1000 }, SECRET);
  const stripe = fakeStripe({ "POST /v1/billing_portal/sessions": () => ({ url: "https://billing.stripe.com/p/1" }) });
  const r = await createPortal({ pass }, env, stripe, NOW);
  assert.deepEqual(r, { status: 200, body: { url: "https://billing.stripe.com/p/1" } });
  const form = new URLSearchParams(stripe.calls[0].init.body);
  assert.equal(form.get("customer"), "cus_9");
  assert.ok(form.get("return_url").startsWith("https://vlearn.example/"));
});

test("billing portal refuses forged passes", async () => {
  const stripe = fakeStripe({});
  const r = await createPortal({ pass: "x.y" }, env, stripe, NOW);
  assert.equal(r.status, 401);
  assert.equal(stripe.calls.length, 0);
});

// --- Quotas (budgeted by AI cost, not by number of calls) ---

test("plans have increasing monthly AI budgets", () => {
  assert.ok(PLANS.free.aiBudgetCents < PLANS.student.aiBudgetCents);
  assert.ok(PLANS.student.aiBudgetCents < PLANS.instructor.aiBudgetCents);
  // Paid budgets stay well under the price, so a plan can't cost more than it earns.
  assert.ok(PLANS.student.aiBudgetCents <= 600 && PLANS.instructor.aiBudgetCents <= 1500);
});

test("usage cost is computed from tokens and the model's price", () => {
  assert.equal(usageCostMicros("default", { input_tokens: 1_000_000, output_tokens: 0 }), 2_000_000);
  assert.equal(usageCostMicros("default", { input_tokens: 0, output_tokens: 1_000_000 }), 10_000_000);
  assert.equal(usageCostMicros("quick", { input_tokens: 1_000_000, output_tokens: 1_000_000 }), 600_000);
  assert.equal(usageCostMicros("default", null), 0);
});

test("quota allows spending up to the plan budget, then refuses; identities are separate", async () => {
  const store = memoryStore();
  const budget = PLANS.free.aiBudgetCents * 10_000; // micro-dollars
  assert.equal((await checkQuota(store, "ip:1", "free", NOW)).ok, true);
  await recordUsage(store, "ip:1", budget, NOW);
  const over = await checkQuota(store, "ip:1", "free", NOW);
  assert.equal(over.ok, false);
  assert.equal((await checkQuota(store, "ip:2", "free", NOW)).ok, true);
});

test("quota resets in a new month", async () => {
  const store = memoryStore();
  await recordUsage(store, "ip:1", 10 ** 9, NOW);
  assert.equal((await checkQuota(store, "ip:1", "free", NOW)).ok, false);
  const nextMonth = NOW + 32 * 24 * 3600 * 1000;
  assert.equal((await checkQuota(store, "ip:1", "free", nextMonth)).ok, true);
});

test("free users on IPv6 are grouped by their /64 network", () => {
  const a = whoIsCalling({ ip: "2001:db8:1:2:aaaa::1" });
  const b = whoIsCalling({ ip: "2001:db8:1:2:bbbb::9" });
  const c = whoIsCalling({ ip: "2001:db8:1:3::1" });
  assert.equal(a.identity, b.identity);
  assert.notEqual(a.identity, c.identity);
});

// --- AI route enforces the plan ---

// One Sonnet call that costs 1 cent (input 2,500 tokens = 0.5c, output 500 tokens = 0.5c).
const okAnthropic = async () => ({ ok: true, status: 200, json: async () => ({ content: [{ type: "text", text: "hi" }], usage: { input_tokens: 2500, output_tokens: 500 } }) });
const msgs = [{ role: "user", content: "How does DNS work?" }];
const callsFor = (plan) => PLANS[plan].aiBudgetCents; // 1 cent per call

test("AI route: free users are limited by IP by cost, and get a 402 with an upgrade hint when out", async () => {
  const store = memoryStore();
  const opts = { apiKey: "k", fetch: okAnthropic, quota: { store, passSecret: SECRET, now: NOW, ip: "203.0.113.5" } };
  for (let i = 0; i < callsFor("free"); i++) assert.equal((await handleAiRequest({ messages: msgs }, opts)).status, 200);
  const r = await handleAiRequest({ messages: msgs }, opts);
  assert.equal(r.status, 402);
  assert.equal(r.body.code, "quota");
  assert.equal(r.body.plan, "free");
});

test("AI route: a valid paid pass uses the paid budget; a forged one falls back to free", async () => {
  const store = memoryStore();
  const good = signPass({ sub: "cus_9", plan: "student", exp: NOW + 1000, live: false }, SECRET);
  const base = { apiKey: "k", fetch: okAnthropic };
  for (let i = 0; i < callsFor("free") + 3; i++) {
    const r = await handleAiRequest({ messages: msgs }, { ...base, quota: { store, passSecret: SECRET, now: NOW, ip: "1.1.1.1", pass: good, live: false } });
    assert.equal(r.status, 200);
  }
  const forged = good.split(".")[0] + ".AAAA";
  const store2 = memoryStore();
  for (let i = 0; i < callsFor("free"); i++) await handleAiRequest({ messages: msgs }, { ...base, quota: { store: store2, passSecret: SECRET, now: NOW, ip: "2.2.2.2", pass: forged } });
  const r = await handleAiRequest({ messages: msgs }, { ...base, quota: { store: store2, passSecret: SECRET, now: NOW, ip: "2.2.2.2", pass: forged } });
  assert.equal(r.status, 402);
});

test("AI route: a test-mode pass doesn't unlock a live deployment", async () => {
  const store = memoryStore();
  const testPass = signPass({ sub: "cus_t", plan: "student", exp: NOW + 1000, live: false }, SECRET);
  const opts = { apiKey: "k", fetch: okAnthropic, quota: { store, passSecret: SECRET, now: NOW, ip: "3.3.3.3", pass: testPass, live: true } };
  for (let i = 0; i < callsFor("free"); i++) await handleAiRequest({ messages: msgs }, opts);
  assert.equal((await handleAiRequest({ messages: msgs }, opts)).status, 402);
});

test("AI route: bad requests and failed upstream calls don't use up budget", async () => {
  const store = memoryStore();
  const opts = { apiKey: "k", fetch: okAnthropic, quota: { store, passSecret: SECRET, now: NOW, ip: "9.9.9.9" } };
  for (let i = 0; i < 50; i++) await handleAiRequest({ messages: [] }, opts);
  const failing = async () => ({ ok: false, status: 500, json: async () => ({}) });
  for (let i = 0; i < 50; i++) await handleAiRequest({ messages: msgs }, { ...opts, fetch: failing });
  assert.equal((await handleAiRequest({ messages: msgs }, opts)).status, 200);
});

test("AI route without quota options behaves as before", async () => {
  const r = await handleAiRequest({ messages: msgs }, { apiKey: "k", fetch: okAnthropic });
  assert.equal(r.status, 200);
});

// --- Review fixes: live mode, stale sessions, upgrades ---

test("a test-mode session can't mint a pass on a live key, and vice versa", async () => {
  const liveEnv = { ...env, STRIPE_SECRET_KEY: "sk_live_x" };
  const stripe = fakeStripe({ "GET /v1/checkout/sessions/cs_1": () => paidSession({ livemode: false }) });
  assert.equal((await issuePass({ session_id: "cs_1" }, liveEnv, stripe, NOW)).status, 402);
  const stripe2 = fakeStripe({ "GET /v1/checkout/sessions/cs_1": () => paidSession({ livemode: true }) });
  assert.equal((await issuePass({ session_id: "cs_1" }, env, stripe2, NOW)).status, 402);
  const stripe3 = fakeStripe({ "GET /v1/checkout/sessions/cs_1": () => paidSession({ livemode: true }) });
  const ok = await issuePass({ session_id: "cs_1" }, liveEnv, stripe3, NOW);
  assert.equal(verifyPass(ok.body.pass, SECRET, NOW).live, true);
});

test("checkout sessions older than a day can't mint passes", async () => {
  const old = paidSession({ created: Math.floor(NOW / 1000) - 2 * 24 * 3600 });
  const stripe = fakeStripe({ "GET /v1/checkout/sessions/cs_1": () => old });
  assert.equal((await issuePass({ session_id: "cs_1" }, env, stripe, NOW)).status, 410);
});

test("refresh keeps a long-absent subscriber: an old pass is renewed if Stripe says active", async () => {
  const ancient = signPass({ sub: "cus_9", plan: "student", exp: NOW - 200 * 24 * 3600 * 1000, live: false }, SECRET);
  const stripe = fakeStripe({ "GET /v1/subscriptions": () => ({ data: [{ status: "active", items: { data: [{ price: { id: "price_student" } }] } }] }) });
  assert.equal((await refreshPass({ pass: ancient }, env, stripe, NOW)).status, 200);
});

test("checkout for an existing customer reuses their Stripe customer", async () => {
  const pass = signPass({ sub: "cus_9", plan: "student", exp: NOW + 1000, live: false }, SECRET);
  const stripe = fakeStripe({ "POST /v1/checkout/sessions": () => ({ url: "https://checkout.stripe.com/c/x" }) });
  await createCheckout({ plan: "instructor", pass }, env, stripe, NOW);
  assert.equal(new URLSearchParams(stripe.calls[0].init.body).get("customer"), "cus_9");
});
