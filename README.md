# V Learn

**Don't memorise the network. Watch it.**

Ask a networking question, or **upload your own class module**, and watch it happen: a 3D network with packets flying between devices, a tutor voice explaining each step, and every step linked to the official standard (or the page of your module) that backs it.

Built solo by **Kidus Demeke** (DSU Cyber Operations) at the **DSU × Wildfire Labs Ignite Hackathon, Nov 13–15 2026**.

**▶ Live app:** https://claude.ai/artifact/4Sr6UyUtVJMvxsC53x54f6

---

## The problem

Networking is invisible. Students studying for CompTIA Network+, Security+ or Cisco CCNA learn DNS, TCP handshakes, TLS and ARP from slides and walls of text. None of it can be seen, so it doesn't stick.

Analogies don't fix it either, because they depend on your background. In a DSU data structures class, arrays were explained with American parking garages. Coming from Ethiopia, that analogy got in the way. **A picture of the real thing doesn't need the right background.**

## What it does

- **Turn your class module into a video.** Upload a PDF, PowerPoint, Word or text file. Claude outlines it, builds an animated lesson for each topic that moves (Wi-Fi joining, DHCP, DNS, TCP…), narrated summary cards for topics that don't, and the built-in OSI layer scene. It starts playing while the rest is still being built. Your file is read in your browser; only its text goes to the AI.
- **3D or 2D.** Devices, cables and glowing packets in 3D (three.js), or a clean 2D diagram. One toggle, same lesson.
- **Ask anything** about networking ("How does NAT work?") and get an animated, narrated lesson.
- **Built-in lessons** ready to play: visiting a website (DNS → TCP → TLS → HTTP), a firewall stopping a port scan, DHCP, ARP, and a sample module ("Intro to Networking") that plays without any AI connection.
- **Packet log** in the style of Wireshark, so the lesson looks like the tools students will use on the job.
- **Every step is cited** to an RFC, IEEE or NIST standard, or to a page of your own module.
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
3. **Sources come from a vetted library** of RFCs, IEEE and NIST standards, or from your module's own pages (checked against its real page count). Any other URL or altered title is rejected.
4. **Self-repair:** validation errors go back to Claude to fix (up to twice). If it still fails, the student doesn't see a shaky lesson.
5. **Labelled honestly:** built-in content says "Built-in · reviewed"; AI lessons say "AI-built · structure checked, not hand-verified"; module summaries say "From your module · AI summary". A topic that can't be animated reliably shows a card pointing to the right page instead of a picture that might be wrong.

## How it was built

Following the AI engineering discipline Mike Vetter presented to the DSU AI Club: **spec → plan → tests first → build in small tasks → independent review → evals → ship.**

| Step | Artifact |
|---|---|
| 1. Spec: personas, goals, non-goals, security decisions | [`docs/01-spec.md`](docs/01-spec.md) |
| 2. Plan: small tasks, each ending in a test | [`docs/02-plan.md`](docs/02-plan.md) |
| 3. Tests written **before** the code | [`tests/`](tests/) — run `npm test` |
| 4. Build | [`app/`](app/) |
| 5. Independent review by a separate agent | [`docs/03-review.md`](docs/03-review.md) |
| 6. Evals on unseen questions | [`evals/report.md`](evals/report.md) |
| 7. Compounded learnings for the next run | [`AGENTS.md`](AGENTS.md) |

The **module → 3D video** feature then went through the full [Superpowers](https://github.com/obra/superpowers) workflow: brainstorm → [design](docs/superpowers/specs/2026-11-15-module-to-3d-design.md) (checked by a fresh "builder" agent) → [7-task plan](docs/superpowers/plans/2026-11-15-module-to-3d.md) → **subagent-driven build**: a fresh agent built each task test-first, a separate agent reviewed it, fixes were re-reviewed → whole-branch review by the most capable model → one fix wave → [summary](docs/04-review-3d.md).

**Results:** 138 automated tests · 15/15 AI lessons valid on the first try · independent accuracy rating 11 correct, 4 minor imprecisions, 0 wrong ([eval report](evals/report.md)).

The git history shows each step as its own commit.

## Security by design

| Risk | Decision |
|---|---|
| Leaked API keys | None in the code. AI calls run through the viewer's own Claude session. |
| AI output used as code | Treated as untrusted data, validated, rendered with `textContent` only. |
| Prompt injection | The question is passed as delimited data and capped at 300 characters. Whatever comes back must still pass the validator. |
| Fake sources | Citations must exactly match the vetted library, or point to a page/slide that exists in the uploaded module. |
| Uploaded files | Read in the browser (pdf.js, JSZip); never uploaded. Extracted text is stripped of hidden control/bidi characters and passed as delimited data. |
| Privacy | Nothing is stored. No accounts, no tracking. Fonts load from Google Fonts. |

## Run it

```bash
npm install && npm test # 138 unit tests (Node 20+; dev deps only for tests)
cd app && python3 -m http.server 8000
# open http://localhost:8000 — ready-made lessons work anywhere;
# AI features turn on when an AI connection is available (see below).
```

## Connecting the AI

V Learn talks to AI through one small adapter ([`app/ai.js`](app/ai.js)), so the same app runs anywhere:

| Where it runs | How it reaches the AI | Keys |
|---|---|---|
| Inside Claude (live link above) | The viewer's own Claude session | None needed |
| Published on Vercel (or any Node host) | `POST /api/ai` → [`api/ai.js`](api/ai.js) → **Anthropic Messages API** | `ANTHROPIC_API_KEY`, server-side only |
| Plain static hosting | No AI: ready-made lessons only, AI controls hidden | None |

**Deploy with the Anthropic API**

1. Import the repo into Vercel (it reads [`vercel.json`](vercel.json)).
2. In the project's Environment Variables, add `ANTHROPIC_API_KEY` (from console.anthropic.com). Optional: `VLEARN_MODEL`, `VLEARN_QUICK_MODEL` (see [`.env.example`](.env.example)).
3. Deploy. The page checks `GET /api/ai` and turns on "ask your own question" and follow-ups.

The server route validates every request (roles, size, number of repair rounds), keeps the key in a header the browser never sees, and hides upstream error details. AI output still has to pass the lesson validator before anything is shown.

## Business

- **First customers:** Network+, Security+ and CCNA candidates, on a monthly subscription (about $10–15).
- **Next:** licences for universities, bootcamps and corporate IT training.
- **Growth:** the same engine (script → validator → animator) extends to security, programming and biology.
- **Positioning:** Genio helps you capture the lecture. V Learn helps you *see* it.

## Tech

Plain HTML, CSS and JavaScript modules, no build step. SVG (2D) and three.js (3D) animation. pdf.js and JSZip for reading modules. Claude (via the Anthropic API or a Claude session) for lesson planning and follow-ups, Claude voice for narration (falls back to the browser's speech), Claude dictation for spoken questions. One Vercel serverless function. Node's built-in test runner.
