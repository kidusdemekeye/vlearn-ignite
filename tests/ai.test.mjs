import { test } from "node:test";
import assert from "node:assert/strict";
import { handleAiRequest, MODELS } from "../api/ai-core.js";
import { httpProvider } from "../app/ai.js";

const okFetch = (text = "hello") => {
  const calls = [];
  const fn = async (url, init) => {
    calls.push({ url, init });
    return { ok: true, status: 200, json: async () => ({ content: [{ type: "text", text }] }) };
  };
  fn.calls = calls;
  return fn;
};
const msgs = [{ role: "user", content: "How does DNS work?" }];

// --- Server route ---

test("server calls the Anthropic Messages API with the key in a header, never in the body", async () => {
  const f = okFetch("lesson json");
  const r = await handleAiRequest({ messages: msgs, tier: "default" }, { apiKey: "sk-test", fetch: f });
  assert.equal(r.status, 200);
  assert.deepEqual(r.body, { text: "lesson json" });
  const { url, init } = f.calls[0];
  assert.equal(url, "https://api.anthropic.com/v1/messages");
  assert.equal(init.headers["x-api-key"], "sk-test");
  assert.ok(init.headers["anthropic-version"]);
  assert.ok(!init.body.includes("sk-test"));
  const body = JSON.parse(init.body);
  assert.equal(body.model, MODELS.default);
  assert.deepEqual(body.messages, msgs);
});

test("server maps the quick tier to the quick model", async () => {
  const f = okFetch();
  await handleAiRequest({ messages: msgs, tier: "quick" }, { apiKey: "k", fetch: f });
  assert.equal(JSON.parse(f.calls[0].init.body).model, MODELS.quick);
});

test("server refuses when no API key is configured, without calling out", async () => {
  const f = okFetch();
  const r = await handleAiRequest({ messages: msgs }, { apiKey: "", fetch: f });
  assert.equal(r.status, 503);
  assert.equal(f.calls.length, 0);
});

test("server rejects malformed or oversized requests", async () => {
  const f = okFetch();
  const bad = [
    null,
    {},
    { messages: [] },
    { messages: [{ role: "system", content: "x" }] },
    { messages: [{ role: "assistant", content: "x" }] },
    { messages: [{ role: "user", content: 5 }] },
    { messages: [{ role: "user", content: "a" }, { role: "user", content: "b" }] },
    { messages: [{ role: "user", content: "x".repeat(60001) }] },
    { messages: Array.from({ length: 9 }, (_, i) => ({ role: i % 2 ? "assistant" : "user", content: "x" })) },
    { messages: msgs, tier: "expensive" },
  ];
  for (const b of bad) {
    const r = await handleAiRequest(b, { apiKey: "k", fetch: f });
    assert.equal(r.status, 400, JSON.stringify(b)?.slice(0, 80));
  }
  assert.equal(f.calls.length, 0);
});

test("server hides upstream error details", async () => {
  const f = async () => ({ ok: false, status: 401, json: async () => ({ error: { message: "invalid x-api-key sk-secret" } }) });
  const r = await handleAiRequest({ messages: msgs }, { apiKey: "k", fetch: f });
  assert.equal(r.status, 502);
  assert.ok(!JSON.stringify(r.body).includes("sk-secret"));
});

test("server passes rate limits through as 429", async () => {
  const f = async () => ({ ok: false, status: 429, json: async () => ({}) });
  const r = await handleAiRequest({ messages: msgs }, { apiKey: "k", fetch: f });
  assert.equal(r.status, 429);
});

// --- Browser provider ---

test("http provider posts to the route and returns {text}", async () => {
  const calls = [];
  const fetchFn = async (url, init) => { calls.push({ url, init }); return { ok: true, status: 200, json: async () => ({ text: "hi" }) }; };
  const ai = httpProvider("/api/ai", fetchFn);
  const r = await ai(msgs, { modelTier: "quick" });
  assert.equal(r.text, "hi");
  assert.equal(calls[0].url, "/api/ai");
  assert.equal(JSON.parse(calls[0].init.body).tier, "quick");
});

test("http provider accepts a plain string prompt", async () => {
  let sent;
  const ai = httpProvider("/api/ai", async (u, init) => { sent = JSON.parse(init.body); return { ok: true, status: 200, json: async () => ({ text: "x" }) }; });
  await ai("hello");
  assert.deepEqual(sent.messages, [{ role: "user", content: "hello" }]);
});

test("http provider turns 429 into a rate_limited error", async () => {
  const ai = httpProvider("/api/ai", async () => ({ ok: false, status: 429, json: async () => ({}) }));
  await assert.rejects(ai(msgs), (e) => e.code === "rate_limited");
});
