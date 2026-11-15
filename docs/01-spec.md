# V Learn — Product Spec

> Step 1 of our process: **spec → plan → tests first → build with subagents → independent review → evals → ship.**
> This spec says *what* we're building and *why*. The plan (`02-plan.md`) says *how*.

## 1. The problem

Networking is invisible. A student studying for CompTIA Network+ or Cisco CCNA has to learn what happens when a laptop loads a website: a DNS lookup, a TCP handshake, TLS, an HTTP request. They learn it from slides, walls of text and analogies. None of it can be *seen*, so it doesn't stick.

Analogies also depend on your background. In a DSU data structures class, arrays were explained with American parking garages. Coming from Ethiopia, that analogy added a barrier instead of removing one. **A picture of the real thing doesn't need the right background.**

## 2. The idea

Ask a networking question. **Watch it happen**: devices on screen, packets moving between them, a tutor voice explaining each step, and every step linked to the official standard (RFC) that defines it. Stuck? Ask "why?" on any step.

## 3. Who it's for (personas)

| Persona | Situation | What they need |
|---|---|---|
| **Cert candidate** (primary) | Studying for Network+ / Security+ / CCNA, often self-taught, paying for prep | See how protocols really behave, at their own pace, with trustworthy sources |
| **University student** | Intro networking or cyber course (e.g. DSU) | Understand the lecture topic visually after class |
| **Instructor** (later) | Teaches networking | Show accurate animations in class without building them by hand |

## 4. Goals

1. A student types a networking question and gets an **animated, narrated, step-by-step lesson**.
2. **Every step is accurate and cited** to a real source.
3. Ready-made, hand-checked lessons for the core topics: visiting a website (DNS, TCP, TLS, HTTP), firewall rules, DHCP, ARP.
4. Follow-up questions on any step, typed or spoken.
5. Works on a laptop and a phone, from one link.

## 5. Non-goals (this weekend)

- No accounts, payments or saved progress.
- No live packet capture from the student's real network.
- No 3D mode (the engine is built so 3D can be added later).
- No subjects outside networking. Biology, programming and history are the long-term vision, not this build.
- We do **not** train or fine-tune a model.

## 6. How it works

```
Student question
      │
      ▼
 Claude (lesson planner) ──► Lesson JSON (the contract)
      │                            │
      │                     Validator checks it
      │                      │            │
      │                   fails         passes
      │◄── errors sent back ┘            │
                                         ▼
                           Animation engine plays it
                           + narration voice + citations
```

- **The contract** (`src/lesson-contract.ts`) is the one format every part agrees on: devices, links, packets and ordered steps. Each step has narration and at least one citation.
- **The AI never draws.** It only writes the script. Plain code animates it, so the animation can't "hallucinate" visually.
- **The validator** rejects anything impossible: a packet jumping between devices that aren't connected, an unknown device, a made-up source. Errors go back to Claude to fix, up to two retries.
- **Sources come from a vetted library** of RFCs, IEEE and NIST standards (and, for uploaded modules, the module's own pages). Claude can only cite from that list; any other URL is rejected.
- **Hand-checked "golden" lessons** play instantly and double as test fixtures.

## 7. Trust and security (by design)

Most security holes start in the design, not the code, so these are decided here:

| Risk | Design decision |
|---|---|
| Leaked API keys | No keys in the app at all. AI calls run through the viewer's own Claude session (artifact `sample` capability). |
| AI output treated as code | Lesson JSON is untrusted data. It is validated, and all text is rendered with `textContent`, never `innerHTML`. |
| Prompt injection via the question | The question is passed as data inside a fixed instruction. Output must still pass the validator, so injected instructions can't produce anything outside the contract. Question length is capped. |
| Fake or misleading sources | Citations must match the vetted library exactly. |
| Inaccurate teaching | Golden lessons are hand-checked. AI lessons are labelled "AI-built, validated" so students know the difference. Evals measure accuracy. |
| Student privacy | Nothing is stored. No accounts, no tracking. |

## 8. Assumptions (to confirm)

- Cert candidates will pay for a better way to *see* the material (prep courses and practice exams already sell at this price point).
- Validated structure + vetted sources is enough to keep AI lessons accurate for core topics. **The evals test this.**
- Judges and students will open it in a modern browser, signed in to Claude for the AI features. Ready-made lessons work for everyone.

## 9. Success criteria

- All golden lessons pass the validator (automated test).
- The validator catches every deliberately broken lesson in the test suite.
- Eval: of 10 unseen networking questions, at least 8 produce a lesson that passes validation and a reviewer rates as accurate.
- The live link works on desktop and phone.

## 10. Business

- **Start:** Network+ / Security+ / CCNA candidates on a monthly subscription (around $10–15).
- **Next:** licences for universities, bootcamps and corporate IT training.
- **Grow:** the same engine extends to security, programming and biology.
- **Positioning:** Genio helps you capture the lecture. V Learn helps you *see* it.
