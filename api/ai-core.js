// Server-side AI route logic (no framework). Called by api/ai.js on Vercel.
// The Anthropic API key stays on the server; the browser never sees it.

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

export async function handleAiRequest(body, { apiKey, fetch: fetchFn = globalThis.fetch } = {}) {
  const tier = body?.tier ?? "default";
  if (!body || !checkMessages(body.messages) || !(tier in MODELS)) {
    return { status: 400, body: { error: "Bad request." } };
  }
  if (!apiKey) return { status: 503, body: { error: "AI is not configured on this server." } };

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
  return { status: 200, body: { text } };
}
