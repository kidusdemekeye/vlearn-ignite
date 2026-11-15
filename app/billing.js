// Browser side of payments. The server (/api/billing) talks to Stripe; this file
// only starts checkout, keeps the signed plan pass, and shows the current plan.
// Card details are entered on Stripe's own page and never reach V Learn.

const KEY = "vlearn.pass";
const DAY = 24 * 3600 * 1000;

export function getPass() {
  try { return localStorage.getItem(KEY) || null; } catch { return null; }
}
function savePass(pass) {
  try { pass ? localStorage.setItem(KEY, pass) : localStorage.removeItem(KEY); } catch { /* storage blocked */ }
}

// The pass payload is readable (it's signed, not secret); used only for display and refresh timing.
export function readPass(pass = getPass()) {
  if (!pass) return null;
  try {
    const p = JSON.parse(atob(pass.split(".")[0].replace(/-/g, "+").replace(/_/g, "/")));
    return typeof p?.plan === "string" && typeof p?.exp === "number" ? p : null;
  } catch { return null; }
}

async function api(body, fetchFn = fetch) {
  const res = await fetchFn("/api/billing", {
    method: body ? "POST" : "GET",
    headers: body ? { "content-type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, ok: res.ok, data };
}

// Only follow redirects to Stripe (always https) or back to this site.
function safeUrl(u) {
  if (typeof u !== "string") return false;
  try {
    const x = new URL(u, location.href);
    return x.origin === location.origin || (x.protocol === "https:" && /^(checkout|billing)\.stripe\.com$/.test(x.hostname));
  } catch { return false; }
}

const PLAN_NAMES = { free: "Free", student: "Student", instructor: "Instructor" };
const $ = (s) => document.querySelector(s);

const activePlan = () => { const p = readPass(); return p && p.exp > Date.now() ? p.plan : "free"; };

function showPlan(plan) {
  const line = $("#billing-plan");
  if (line) line.textContent = `Your plan: ${PLAN_NAMES[plan] || "Free"}`;
  const manage = $("#manage-billing");
  if (manage) manage.hidden = plan === "free" || !plan;
  const paid = plan === "student" || plan === "instructor";
  for (const b of document.querySelectorAll(".plan-cta[data-plan]")) {
    const current = b.dataset.plan === plan;
    b.disabled = current || b.dataset.enabled !== "true";
    // Paying customers switch plans in Stripe's portal, so they never end up with two subscriptions.
    b.textContent = current ? "Current plan" : paid ? "Switch plan" : b.dataset.label;
  }
}

function say(text, kind = "info") {
  const s = $("#billing-status");
  if (!s) return;
  s.textContent = text;
  s.dataset.kind = kind;
  s.hidden = !text;
}

export async function initBilling() {
  const ctas = [...document.querySelectorAll(".plan-cta[data-plan]")];
  for (const b of ctas) b.dataset.label = b.textContent;

  let status;
  try { status = await api(); } catch { status = null; }
  const enabled = Boolean(status?.ok && status.data?.enabled);
  for (const b of ctas) b.dataset.enabled = String(enabled);
  const restore = $("#restore-purchase");
  if (restore && status?.data?.portalLoginUrl && safeUrl(status.data.portalLoginUrl)) {
    restore.href = status.data.portalLoginUrl;
    restore.hidden = false;
  }
  if (!enabled) {
    for (const b of ctas) b.disabled = true;
    const note = $("#billing-off");
    if (note) note.hidden = false;
    return;
  }

  // Back from Stripe Checkout?
  const params = new URLSearchParams(location.search);
  const sessionId = params.get("session_id");
  let confirmed = true;
  if (params.get("checkout") === "success" && sessionId) {
    say("Confirming your payment…");
    const r = await api({ action: "pass", session_id: sessionId }).catch(() => null);
    if (r?.ok && r.data?.pass) {
      savePass(r.data.pass);
      say(`You're on the ${PLAN_NAMES[r.data.plan]} plan. Thank you!`, "ok");
    } else {
      // Keep the link in the address bar so refreshing the page can try again.
      confirmed = false;
      say(r?.data?.error || "We couldn't confirm the payment yet. Refresh this page in a moment.", "error");
    }
  } else if (params.get("checkout") === "cancelled") {
    say("Checkout cancelled. You're still on your current plan.");
  }
  if (params.has("checkout") && confirmed) {
    try { history.replaceState(null, "", location.pathname + location.hash); } catch { /* ignore */ }
  }

  // Re-check an existing pass with Stripe when it's close to expiring.
  const p = readPass();
  if (p && p.exp - Date.now() < DAY) {
    const r = await api({ action: "refresh", pass: getPass() }).catch(() => null);
    if (r?.ok && r.data?.pass) savePass(r.data.pass);
    else if (r && (r.status === 401 || r.status === 402)) { savePass(null); say(r.data?.error || "You're on the Free plan."); }
  }
  showPlan(activePlan());

  for (const b of ctas) {
    b.addEventListener("click", async () => {
      b.disabled = true;
      const current = activePlan();
      if (current !== "free") { b.disabled = false; return openPortal(); }
      say("Opening secure checkout…");
      const r = await api({ action: "checkout", plan: b.dataset.plan, pass: getPass() }).catch(() => null);
      if (r?.ok && safeUrl(r.data?.url)) {
        location.assign(r.data.url);
      } else {
        say(r?.data?.error || "Couldn't open checkout. Try again.", "error");
        b.disabled = false;
      }
    });
  }

  $("#manage-billing")?.addEventListener("click", openPortal);
}

async function openPortal() {
  say("Opening billing…");
  const r = await api({ action: "portal", pass: getPass() }).catch(() => null);
  if (r?.ok && safeUrl(r.data?.url)) location.assign(r.data.url);
  else say(r?.data?.error || "Couldn't open billing. Try again.", "error");
}
