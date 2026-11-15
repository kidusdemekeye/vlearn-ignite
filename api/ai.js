// Vercel serverless function: POST /api/ai  { messages, tier } -> { text }
// Set ANTHROPIC_API_KEY in the Vercel project's environment variables.
import { handleAiRequest } from "./ai-core.js";

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
  const out = await handleAiRequest(body, { apiKey: process.env.ANTHROPIC_API_KEY });
  res.setHeader("Cache-Control", "no-store");
  return res.status(out.status).json(out.body);
}

function safeParse(s) {
  try { return JSON.parse(s); } catch { return null; }
}
