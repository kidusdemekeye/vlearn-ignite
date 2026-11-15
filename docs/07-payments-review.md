# Payments: independent security review

The Stripe payment system was reviewed by a separate agent that didn't write it. It confirmed the core was sound: passes can't be forged (HMAC, constant-time check), the plan comes from the price Stripe actually charged, Stripe errors and keys never reach the browser, session ids can't inject paths, and there are no open redirects.

## Findings and what we did

| Severity | Finding | Status |
|---|---|---|
| High | A Stripe **test-mode** purchase could mint a pass the live site accepts (e.g. a Preview deploy sharing the secret) | **Fixed.** Passes record test/live mode and must match the server's key; docs require a separate pass secret per environment |
| High | A paying customer could **lose access**: the checkout link was cleared even when confirmation failed; long absences deleted the pass | **Fixed.** The link stays until the plan is confirmed; refresh always re-checks Stripe (no expiry cliff); "Restore or manage a purchase" uses Stripe's emailed portal login. Restoring paid AI on a new device arrives with accounts (roadmap step 5) |
| High | Budgets counted **calls**, so a heavy user could cost more than they pay | **Fixed.** Budgets are measured in real AI cost (tokens × price): Free $0.50, Student $6, Instructor $15 per month. Failed calls cost nothing. Docs add an Anthropic spend limit as a backstop |
| Medium | Budgets not enforced across serverless instances without a shared store | **Fixed.** Billing stays off unless Upstash Redis is configured |
| Medium | IPv6 users could rotate addresses for more free budget | **Fixed.** Free users on IPv6 are grouped by their /64 network |
| Medium | A completed checkout link worked as a credential indefinitely | **Fixed.** Links mint passes for 24 hours only |
| Medium | Upgrading Student → Instructor created a second subscription | **Fixed.** Paying customers switch plans in Stripe's portal; checkout reuses their Stripe customer |
| Low | Plan badge could show a paid plan after the pass expired | **Fixed.** Shown only while the pass is valid |
| Low | Client followed any https redirect | **Fixed.** Only Stripe checkout/billing hosts or this site |
| Low | Pricing said "$99 a year" with no annual price | **Fixed.** Removed |
| Low | No rate limit on `/api/billing` | Accepted for now; Stripe's own rate limits apply |
| Medium | Shared college networks (one IP) share one Free budget | Accepted for launch; signed device tokens planned with accounts |

## Accepted trade-offs

- A leaked pass works until it expires (7 days). Cancellations and failed renewals take effect at the next weekly re-check (no webhook yet).
- Budgets reset on calendar months (UTC), not billing cycles.

Verified with 31 billing tests (stand-in Stripe) and an end-to-end browser run: upgrade → pay → confirmed → AI calls carry the pass → "Switch plan" opens the customer's own portal → a tampered pass falls back to Free.
