# V Learn — Build Plan

> Step 2 of the process. The spec (`01-spec.md`) says *what*; this says *how*, in small tasks that each end in a passing test and a commit.
> Deadline: submission by 12:00, Sunday Nov 15, 2026.

## Architecture

A single web page with no build step, published as a hosted Claude artifact so judges get one link that works on laptop and phone.

```
app/
  index.html   page shell, styles, layout
  core.js      PURE logic: contract validator, source library, layout, prompt builder
  lessons.js   hand-checked "golden" lessons (also the test fixtures)
  engine.js    SVG stage: draws devices/links, animates packets, drops, highlights
  app.js       player, narration, AI lesson generation, follow-ups, mic
src/
  lesson-contract.ts   the typed contract (reference for the JS validator)
tests/         node:test unit tests (run: npm test)
evals/         unseen questions + scored results
docs/          spec, plan, review, eval report
AGENTS.md      how agents work in this repo + compounded learnings
```

**Why this shape**
- `core.js` and `lessons.js` have no DOM, so they're unit-tested in Node. Everything that decides *correctness* lives there.
- `engine.js` only renders a lesson that already passed validation. It never sees raw AI output.
- AI runs through the viewer's own Claude session (`sample` capability): no API keys in the code. Voice uses the `tts` capability, falling back to the browser's built-in speech. The mic uses `dictation`.

## Tasks

Each task: write the test first (red), build (green), commit.

| # | Task | Test that proves it |
|---|---|---|
| 1 | `core.js` validator mirroring the TS contract | Valid lesson passes; 12+ broken lessons each fail with a precise message |
| 2 | Vetted source library (RFCs + NIST) and citation allowlist | A citation with an unknown or altered URL fails |
| 3 | Golden lessons: website visit, firewall, DHCP, ARP | Every golden lesson passes the validator; facts reviewed against the cited RFC |
| 4 | Auto-layout (devices into columns by hop distance) | Every device gets a unique, in-bounds position; deterministic |
| 5 | Prompt builder + response parser for AI lessons (incl. `{"error"}` for off-topic) | Prompt contains the library and contract; parser handles fences, bad JSON, error replies |
| 6 | `engine.js` stage: devices, links, packet animation, drop, highlight | Manual check in browser + visual preview |
| 7 | `app.js` player: play/pause/next/back/speed, step list, step card, citations | Manual check |
| 8 | AI lesson flow: generate → validate → retry with errors (max 2) → play | Manual check; logic covered by tasks 1, 5 |
| 9 | Follow-up questions + mic + narration voice | Manual check |
| 10 | Independent code + security review by a separate agent | `docs/03-review.md`; all critical findings fixed |
| 11 | Evals: 10 unseen questions through the same prompt, validated + rated | `evals/report.md` with pass rate |
| 12 | README, AGENTS.md learnings, publish live link | Link opens on desktop and phone |

## Definition of done
- `npm test` passes.
- Review has no open critical issues.
- Eval report committed with honest numbers.
- Live link in README.
