# AGENTS.md

Instructions for any coding agent working in this repo (Claude Code, OpenCode, Codex…).

## Process
Spec → plan → tests first → build in small tasks → independent review → evals → ship.
Read `docs/01-spec.md` and `docs/02-plan.md` before changing anything.

## Rules
- The lesson contract (`src/lesson-contract.ts`, mirrored in `app/core.js`) is the source of truth. Change it only with a test.
- AI output is untrusted data: it must pass `validateLesson` before it reaches the engine.
- Render text with `textContent`, never `innerHTML`.
- No API keys or secrets anywhere in the repo. The Anthropic key lives only in the host's environment (`ANTHROPIC_API_KEY`).
- All AI calls go through `app/ai.js`; never call a provider directly from other files.
- Citations come only from the vetted library in `app/core.js`.
- Write the failing test first, then the code. Run `npm test` before every commit.

## Compounded learnings
Add a line here whenever something went wrong or took longer than it should, so the next run is faster.

- `node --test tests/` fails on Node 22+ (treats it as a module path). Use `node --test tests/*.test.mjs`.
- An AI-supplied flag must never relax validation (`fallback`): app-created content gets an explicit option, and must equal the app's own output.
- Regexes reused with `.replace` need the `g` flag (`BAD_CHARS_G`), or only the first match is removed.
- Truncation that "keeps every heading" must budget by part count, or long single-line pages (PDFs) silently drop later pages.
- Any narration/animation `await` needs both a timeout and a minimum hold, or the player stalls or rushes.
- `renderer.setSize(w, h, true)` fixes the canvas pixel size and fights CSS aspect-ratio; use `false` with an absolutely positioned canvas.
- Hand-written teaching content needs a domain-expert review pass: reviews caught "Wi-Fi uses the same frames as Ethernet".
