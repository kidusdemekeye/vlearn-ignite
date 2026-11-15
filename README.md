# V Learn

**Don't memorise the network. Watch it.**

Ask a networking question and see it happen: devices on screen, packets moving between them, a tutor voice explaining each step, and every step linked to the official standard (RFC) that defines it.

Built solo by **Kidus Demeke** (DSU Cyber Operations) at the **DSU × Wildfire Labs Ignite Hackathon, Nov 13–15 2026**.

**▶ Live app:** https://claude.ai/artifact/4Sr6UyUtVJMvxsC53x54f6

---

## The problem

Networking is invisible. Students studying for CompTIA Network+, Security+ or Cisco CCNA learn DNS, TCP handshakes, TLS and ARP from slides and walls of text. None of it can be seen, so it doesn't stick.

Analogies don't fix it either, because they depend on your background. In a DSU data structures class, arrays were explained with American parking garages. Coming from Ethiopia, that analogy got in the way. **A picture of the real thing doesn't need the right background.**

## What it does

- **Ask anything** about networking ("How does NAT work?") and get an animated, narrated lesson.
- **Hand-checked lessons** ready to play: visiting a website (DNS → TCP → TLS → HTTP), a firewall stopping a port scan, DHCP, and ARP.
- **Packet log** in the style of Wireshark, so the lesson looks like the tools students will use on the job.
- **Every step is cited** to an RFC or NIST guideline.
- **Stuck? Ask "why?"** on any step, typed or spoken.
- Works on laptop and phone, light and dark mode.

## How it stays accurate (no AI slop)

```
Student question
      │
      ▼
 Claude (lesson planner) ──► Lesson script (JSON contract)
      ▲                              │
      │                       Validator checks it
      │  errors sent back            │
      └──────── fails ───────────────┤
                                   passes
                                     ▼
                     Animation engine plays it + voice + citations
```

1. **The AI never draws.** Claude only writes a script in a strict format ([`src/lesson-contract.ts`](src/lesson-contract.ts)). Plain code animates it, so the picture can't hallucinate.
2. **A validator checks every lesson** ([`app/core.js`](app/core.js)): real devices, packets only travel along real cables, every step cited. Packets can't teleport between devices that aren't connected.
3. **Sources come from a vetted library** of 30 RFCs and NIST guidance. Any other URL or altered title is rejected.
4. **Self-repair:** validation errors go back to Claude to fix (up to twice). If it still fails, the student doesn't see a shaky lesson.
5. **Labelled honestly:** hand-checked lessons say "Verified"; AI lessons say "AI-built · passed validation".

## How it was built

Following the AI engineering discipline Mike Vetter presented to the DSU AI Club: **spec → plan → tests first → build in small tasks → independent review → evals → ship.**

| Step | Artifact |
|---|---|
| 1. Spec: personas, goals, non-goals, security decisions | [`docs/01-spec.md`](docs/01-spec.md) |
| 2. Plan: small tasks, each ending in a test | [`docs/02-plan.md`](docs/02-plan.md) |
| 3. Tests written **before** the code | [`tests/`](tests/) — run `npm test` |
| 4. Build | [`app/`](app/) |
| 5. Independent review by a separate agent | [`docs/03-review.md`](docs/03-review.md) |
| 6. Evals on unseen questions | [`evals/`](evals/) |
| 7. Compounded learnings for the next run | [`AGENTS.md`](AGENTS.md) |

The git history shows each step as its own commit.

## Security by design

| Risk | Decision |
|---|---|
| Leaked API keys | None in the code. AI calls run through the viewer's own Claude session. |
| AI output used as code | Treated as untrusted data, validated, rendered with `textContent` only. |
| Prompt injection | The question is passed as delimited data and capped at 300 characters. Whatever comes back must still pass the validator. |
| Fake sources | Citations must exactly match the vetted library. |
| Privacy | Nothing is stored. No accounts, no tracking. Fonts load from Google Fonts. |

## Run it

```bash
npm test                 # 50 unit tests, no dependencies (Node 20+)
cd app && python3 -m http.server 8000
# open http://localhost:8000 — ready-made lessons work anywhere;
# "ask your own question" needs the Claude-hosted version (live link above).
```

## Business

- **First customers:** Network+, Security+ and CCNA candidates, on a monthly subscription (about $10–15).
- **Next:** licences for universities, bootcamps and corporate IT training.
- **Growth:** the same engine (script → validator → animator) extends to security, programming and biology.
- **Positioning:** Genio helps you capture the lecture. V Learn helps you *see* it.

## Tech

Plain HTML, CSS and JavaScript modules, no build step. SVG animation. Claude for lesson planning and follow-ups, Claude voice for narration (falls back to the browser's speech), Claude dictation for spoken questions. Node's built-in test runner.
