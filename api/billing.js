// Vercel serverless function: /api/billing
//   GET                                   -> { enabled, plans }
//   POST { action: "checkout", plan }     -> { url }   (Stripe Checkout)
//   POST { action: "pass", session_id }   -> { pass, plan, exp }  (after checkout)
//   POST { action: "refresh", pass }      -> { pass, plan, exp }  (weekly re-check with Stripe)
//   POST { action: "portal", pass }       -> { url }   (Stripe customer portal)
// Env: STRIPE_SECRET_KEY, STRIPE_PRICE_STUDENT, STRIPE_PRICE_INSTRUCTOR, VLEARN_PASS_SECRET, APP_URL
import { billingStatus, createCheckout, issuePass, refreshPass, createPortal } from "./billing-core.js";

const ACTIONS = { checkout: createCheckout, pass: issuePass, refresh: refreshPass, portal: createPortal };

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method === "GET") return res.status(200).json(billingStatus(process.env));
  if (req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Use GET or POST." });
  }
  const body = typeof req.body === "string" ? safeParse(req.body) : req.body;
  const action = body && Object.prototype.hasOwnProperty.call(ACTIONS, body.action) ? ACTIONS[body.action] : null;
  if (!action) return res.status(400).json({ error: "Unknown action." });
  const out = await action(body, process.env);
  return res.status(out.status).json(out.body);
}

function safeParse(s) {
  try { return JSON.parse(s); } catch { return null; }
}
