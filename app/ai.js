// Picks how V Learn talks to an AI model, so the same app runs anywhere:
//   1. Inside Claude: the viewer's own Claude session (no keys needed).
//   2. Published elsewhere (e.g. Vercel): our /api/ai route, which calls the
//      Anthropic API with a key kept on the server.
// Both return an async function: ai(input, { modelTier, signal, onText }) -> { text }.

export function httpProvider(url = "/api/ai", fetchFn = (...a) => fetch(...a)) {
  return async function ai(input, opts = {}) {
    const messages = typeof input === "string" ? [{ role: "user", content: input }] : input;
    const res = await fetchFn(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ messages, tier: opts.modelTier === "quick" ? "quick" : "default" }),
      signal: opts.signal,
    });
    if (res.status === 429) throw Object.assign(new Error("rate limited"), { code: "rate_limited" });
    if (!res.ok) throw Object.assign(new Error("AI request failed"), { code: "unavailable" });
    const data = await res.json();
    const text = String(data?.text ?? "");
    opts.onText?.({ text, delta: text });
    return { text };
  };
}

// Resolves to an ai() function, or null if no AI is available here.
export async function connectAi() {
  const use = globalThis.claude?.use?.bind(globalThis.claude);
  if (use) {
    try {
      const sample = await use("sample");
      if (sample) return sample;
    } catch { /* fall through */ }
  }
  // Published elsewhere: use our server route if it has an API key configured.
  try {
    const res = await fetch("/api/ai", { method: "GET" });
    if (res.ok && (await res.json())?.configured === true) return httpProvider("/api/ai");
  } catch { /* not deployed with a server */ }
  return null;
}
