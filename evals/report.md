# Eval report

Measured on 2026-11-15 with the exact prompts the app sends, before any repair round. "Valid" means the reply passed the same validator the app uses (devices, cables, step order, citations from the vetted library or the module's own pages). "Accurate" was rated separately by an independent reviewer acting as a networking instructor, who did not write the lessons.

## Results

| Run | What | Result |
|---|---|---|
| Single questions | 10 unseen questions (9 networking, 1 off-topic) → lesson | **9/9 valid** first try; off-topic question **correctly declined** |
| Modules → course | 2 modules (sample intro module, an original routing module) → outline | **2/2 outlines valid** first try |
| Modules → course | Lessons the outlines asked for | **6/6 lessons valid** first try |
| Accuracy (independent rater) | All 15 generated lessons | **11 correct, 4 minor imprecision, 0 wrong** |
| Citation fit | Do the cited sources define what each step shows? | 11 good, 3 partial, 1 poor |

Details: [`results.json`](results.json), [`course/results.json`](course/results.json), per-lesson notes in [`accuracy.md`](accuracy.md).

## What we learned

- **Structure is the easy part; accuracy is the real test.** Every lesson passed validation, but the rater still found four small imprecisions. That's why AI lessons are labelled "structure checked, not hand-verified" in the app.
- **The weakest citation (switch MAC learning)** comes from a gap in the source library: switch behaviour is defined in IEEE 802.1D/802.1Q, which isn't in the library yet. Next step: add it, and map each protocol to the sources it may cite.
- **No lesson was rated wrong**, and the off-topic question was refused instead of invented.

## Method

- `evals/make-prompts.mjs` and `evals/course/make-prompts.mjs` write the exact prompts the app builds.
- A model answered each prompt once, with no tools and no retries (first-attempt quality).
- `evals/score.mjs` and `evals/course/score.mjs` parse and validate replies with the app's own code.
- A separate reviewer rated accuracy and citation fit read-only, writing `accuracy.md`.

Limits: small sample (15 lessons); one model; module citations are checked for range, not for whether the page supports the claim.
