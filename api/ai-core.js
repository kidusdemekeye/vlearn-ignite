// Server-side AI route logic (no framework). Called by api/ai.js on Vercel.
// The Anthropic API key stays on the server; the browser never sees it.
import { checkQuota, recordUsage, usageCostMicros, whoIsCalling } from "./billing-core.js";

export const MODELS = {
  default: process.env.VLEARN_MODEL || "claude-sonnet-5-5",
  quick: process.env.VLEARN_QUICK_MODEL || "claude-haiku-5-5",
};

const MAX_MESSAGES = 7; // first prompt + up to 3 repair rounds
const MAX_CHARS = 60000;

function checkMessages(messages) {
  if (!Array.isArray(messages) || messages.length < 1 || messages.length > MAX_MESSAGES) return false;
  let total = 0;
  for (let i = 0; i < messages.length; i++) {
    const m = messages[i];
    if (!m || typeof m.content !== "string" || !m.content) return false;
    if (m.role !== (i % 2 === 0 ? "user" : "assistant")) return false;
    total += m.content.length;
  }
  return total <= MAX_CHARS && messages[messages.length - 1].role === "user";
}

export async function handleAiRequest(body, { apiKey, fetch: fetchFn = globalThis.fetch, quota } = {}) {
  const tier = body?.tier ?? "default";
  if (!body || !checkMessages(body.messages) || !(tier in MODELS)) {
    return { status: 400, body: { error: "Bad request." } };
  }
  if (!apiKey) return { status: 503, body: { error: "AI is not configured on this server." } };

  // Plan budgets: a valid paid pass gets that plan's monthly AI budget; everyone else is Free (by IP).
  let who = null;
  if (quota?.store) {
    who = whoIsCalling({ pass: quota.pass, passSecret: quota.passSecret, ip: quota.ip, now: quota.now, live: quota.live });
    let q;
    try { q = await checkQuota(quota.store, who.identity, who.plan, quota.now); }
    catch { return { status: 503, body: { error: "Usage tracking is unavailable. Try again shortly." } }; }
    if (!q.ok) {
      return { status: 402, body: { error: `You've used this month's AI on the ${who.plan === "free" ? "Free" : who.plan === "student" ? "Student" : "Instructor"} plan.`, code: "quota", plan: who.plan, limit: q.limit } };
    }
  }

  let res;
  try {
    res = await fetchFn("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODELS[tier],
        max_tokens: tier === "quick" ? 600 : 8000,
        messages: body.messages.map((m) => ({ role: m.role, content: m.content })),
      }),
    });
  } catch {
    return { status: 502, body: { error: "Could not reach the AI service." } };
  }
  if (res.status === 429) return { status: 429, body: { error: "Busy. Try again shortly." } };
  if (!res.ok) return { status: 502, body: { error: "The AI service returned an error." } };

  const data = await res.json().catch(() => null);
  const text = (data?.content || []).filter((c) => c.type === "text").map((c) => c.text).join("");
  if (who) {
    try { await recordUsage(quota.store, who.identity, usageCostMicros(tier, data?.usage), quota.now); }
    catch { /* the answer is already paid for; don't lose it over a counter hiccup */ }
  }
  return { status: 200, body: { text } };
}
