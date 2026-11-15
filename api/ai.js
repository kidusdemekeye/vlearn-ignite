// Vercel serverless function: POST /api/ai  { messages, tier } -> { text }
// Env: ANTHROPIC_API_KEY (required). Plan budgets: VLEARN_PASS_SECRET, and for a
// shared counter across serverless instances UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN.
import { handleAiRequest } from "./ai-core.js";
import { memoryStore, upstashStore } from "./billing-core.js";

const store = process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
  ? upstashStore(process.env.UPSTASH_REDIS_REST_URL, process.env.UPSTASH_REDIS_REST_TOKEN)
  : memoryStore();

export default async function handler(req, res) {
  if (req.method === "GET") {
    // Lets the page know whether AI features can be shown. Never reveals the key.
    return res.status(200).json({ configured: Boolean(process.env.ANTHROPIC_API_KEY) });
  }
  if (req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Use POST." });
  }
  const body = typeof req.body === "string" ? safeParse(req.body) : req.body;
  const auth = String(req.headers.authorization || "");
  const out = await handleAiRequest(body, {
    apiKey: process.env.ANTHROPIC_API_KEY,
    quota: {
      store,
      passSecret: process.env.VLEARN_PASS_SECRET,
      pass: auth.startsWith("Bearer ") ? auth.slice(7) : undefined,
      ip: String(req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "").split(",")[0].trim(),
    },
  });
  res.setHeader("Cache-Control", "no-store");
  return res.status(out.status).json(out.body);
}

function safeParse(s) {
  try { return JSON.parse(s); } catch { return null; }
}
