# Design: Upload your class module → 3D animated video

Date: 2026-11-15 · Status: draft for approval · Deadline: submission by 12:00 today

## Intent

A student uploads their own networking class module and V Learn turns it into a **3D animated, narrated video** of *their* class: the same topics, in the same order, played hands-free one after another. This is the original V Learn vision ("turn your own slides into understanding") applied to networking. For the hackathon it's also the strongest demo: Kidus uploads his real DSU networking module live.

## Goals

1. Upload a module as **PDF, PowerPoint (.pptx), Word (.docx) or text**. Files are read **in the browser**; the file itself is never uploaded anywhere. Only extracted text goes to the AI.
2. Claude reads the module and makes an **outline**: the module's key concepts in order, each marked as one of:
   - **lesson**: something that moves (DNS lookup, handshake, ARP) → an animated lesson in the existing contract
   - **card**: something that doesn't (cable types, subnet masks, ports) → a narrated 3D concept card
   - **osi**: the OSI / TCP-IP layer model → the built-in, hand-checked 3D layer-stack scene
3. Each lesson is generated **one at a time** with the existing prompt + validator + repair loop. **Playback starts as soon as the first item is ready**; the rest keep generating.
4. A **3D player** (three.js) plays everything: devices on a surface, glowing packets flying along cables, a camera that follows the action, narration, captions. It's **hands-free**: it moves to the next item automatically, like a video.
5. The current **2D view stays** as a toggle ("2D / 3D"). Both read the same validated lesson.
6. A **built-in sample module** (a short intro-to-networking module written by us) can be converted for anyone, so judges can see the feature even without uploading.

## Non-goals

- No downloadable video file (decided: plays in the app).
- No saving or sharing converted modules between sessions.
- No scanned/image-only PDFs (no OCR). The app says so if no text is found.
- No non-networking subjects.

## Anti-goals (would be a failure even if it "works")

- Teaching something false. Every AI lesson still passes the validator; cards cite the vetted library; the OSI scene is fixed code.
- Pretending AI content is hand-checked. Items keep their labels ("AI-built · structure checked" vs "Verified").
- A frozen screen while a 40-page module processes. Progress is always visible and playback starts early.

## Constraints

- Runs as the existing static page (Claude artifact, and Vercel via `/api/ai`). Libraries only from cdnjs: three.js (ES module build), pdf.js, JSZip (for .pptx/.docx, which are zip files of XML).
- AI calls go through `app/ai.js` (Claude session or Anthropic API). Long modules are **truncated to ~25,000 characters** of extracted text for the outline call, keeping headings/slide titles first.
- Outline is capped at **12 items** so a module turns into roughly a 5–10 minute video.
- All text rendered with `textContent` (2D) or drawn to canvas textures (3D); never `innerHTML`.
- Must still work on a phone (3D at lower pixel ratio; 2D fallback if WebGL is unavailable).

## Approaches considered

| Part | Options | Picked | Why |
|---|---|---|---|
| 3D rendering | **three.js**; CSS 3D transforms; pre-rendered video | three.js | Real 3D scene, standard, works on phones. CSS 3D looks like tilted cards; pre-rendered video can't be made live from a module. |
| Module → video | **Two steps (outline, then each lesson)**; one giant call | Two steps | Faster first frame, each lesson validated on its own, one bad item doesn't break the rest. |
| OSI stack | **Built-in, hand-checked scene**; AI-generated each time | Built-in | Layers and encapsulation never change, so code gets them right every time. AI only decides where it appears. |
| File reading | **In the browser**; upload to a server | In the browser | Privacy, no server storage, works in the artifact. |

## Design

### New data: the Course (extends the contract)

```ts
type Course = {
  version: 1;
  title: string;                    // e.g. "CSC 245 Module 3: The Network Layer"
  source: string;                   // file name, shown to the student
  items: CourseItem[];              // 1-12, in module order
};
type CourseItem =
  | { type: "lesson"; topic: string; question: string }          // outline only; lesson generated later
  | { type: "card"; title: string; points: string[];            // 2-5 points, each <= 90 chars
      narration: string; citationIds: string[] }                // narration <= 400 chars
  | { type: "osi"; focus: "encapsulation" | "layers"; narration?: string };
```

- `validateCourse()` in `app/core.js` checks the outline (types, lengths, 1–12 items, card citations from the vetted library). The outline reply includes a `citations` array like lessons do.
- For each `lesson` item, the existing `buildLessonPrompt(question)` is called with extra context: the module title and the relevant excerpt of module text, so lessons match the class. The result must pass `validateLesson`.
- If a lesson still fails after repairs, that item becomes a **card** built from its topic ("This topic couldn't be animated reliably"), so the video never stops.

### Reading files (`app/ingest.js`)

| Format | How |
|---|---|
| .pdf | pdf.js: text per page, joined with page markers |
| .pptx | JSZip: `ppt/slides/slideN.xml` in order, `<a:t>` text runs; slide titles first |
| .docx | JSZip: `word/document.xml`, `<w:t>` runs, paragraph breaks |
| .txt / .md | read as text |

Output: `{ title, text, pages }`. Empty text → "This file has no readable text (it may be scanned images)."

### 3D player (`app/engine3d.js`)

- Same interface as the 2D `Stage`: `load(lesson)`, `play(step)`, `cancel()`, `clear()`, `speed`. The app picks 2D or 3D.
- Scene: a soft-lit surface; devices are extruded rounded blocks with an icon and label (canvas textures); cables are tubes; packets are glowing capsules in the protocol colour with a label sprite, flying along the path with a slight arc. Drops: packet turns red, bounces off the device, "Blocked" label. Highlights: device pulses and lifts, caption above.
- Layout reuses `layoutLesson()` (x → x, y → depth).
- Camera eases to frame the current path each step.
- **Concept card:** a 3D panel floats in, with title and points revealed one at a time as narration plays, plus citation chips.
- **OSI scene:** 7 stacked translucent layers (Application → Physical), labelled. "encapsulation" mode: a data block descends, gaining a header at each layer (segment, packet, frame, bits), crosses to a second stack, then climbs back up. Narration for each layer is fixed text, hand-checked.

### Video mode (`app/course.js`)

- "Upload your module" panel: file picker / drop zone, **"Try the sample module"** button, progress list of outline items (waiting / building / ready / fallback card).
- Player bar: item N of M, title, play/pause, next/prev item, 2D/3D toggle, voice toggle. Auto-advances through steps, then items.
- Each item carries its label: Verified (OSI scene), AI-built · structure checked (lessons), AI summary · cited (cards).

### Errors

- No AI available → upload panel explains it needs an AI connection; the sample module still plays its **pre-converted** version (shipped as JSON, validated in tests).
- Outline invalid after repairs → "Couldn't read the structure of this module. Try a shorter file or a PDF."
- WebGL unavailable → 3D toggle disabled, plays in 2D.

## Testing

- Unit (Node): `validateCourse` (good/bad outlines), outline prompt contains the vetted library and the module excerpt inside a data block, `.pptx`/`.docx` XML text extraction on small fixture files, card fallback when a lesson fails, the pre-converted sample course passes validation, OSI scene text matches the fixed layer list.
- Browser: one Playwright pass that loads the sample course and plays the first item in 3D with no page errors.
- Eval: convert 2 real-style modules (sample + one more), record outline validity and lesson pass rate in `evals/`.

## Left to the builder

Exact visual styling of the 3D scene, camera easing, card animation timing, how many concurrent lesson generations (1–2), the content of the sample module (short intro: OSI, IP addressing, DNS, TCP handshake, ARP).

## Decisions after the builder check

A fresh reviewer read this design and asked six questions. Five were settled by the builder (marked *builder's call*); one went to Kidus.

1. **Cards whose topic isn't in the vetted library** (cable types, topologies, subnetting as taught in class). *Builder's call:* a card may cite **the uploaded module itself** by page or slide ("Your module, slide 7"), as well as library sources. Each card must cite at least one of the two. Label: "From your module · AI summary". This keeps cards grounded in the class the student actually took. Library citations still must match exactly; module citations must point to a page/slide number that exists in the extracted text.
2. **2D for cards and the OSI scene.** *Builder's call:* 2D shows simpler versions (a plain card panel; a flat layer stack that highlights layer by layer as the data block moves). The 2D/3D toggle applies to every lesson, including the ready-made ones, since both views read the same validated lesson.
3. **What gets cut first if time runs short** (cut from the bottom): second eval module → .docx support → 2D OSI animation (static stack instead) → 3D card animation polish. Never cut: PDF + .pptx, outline + validated lessons, 3D lessons, sample module.
4. **Fallback when a lesson fails validation.** *Builder's call:* no extra AI call. A fixed fallback card: title = the topic, points = "Covered in your module on page N" and "V Learn couldn't build an animation that passed its accuracy checks, so it shows this instead of a picture that might be wrong." It cites the module page. `validateCourse` allows this shape via `fallback: true`.
5. **Labels for built-in content.** *Builder's call:* the OSI scene's per-layer text is fixed code, reviewed by the independent reviewer, labelled "Built-in · reviewed". Its optional AI narration is shown only as an intro line labelled "AI". The pre-converted sample course is AI-generated and keeps AI labels. Golden lessons are relabelled "Built-in · reviewed" for the same honesty: they were checked by an independent reviewer, not by an instructor.
6. **The real module for the demo.** *Asked Kidus* (format, length, and whether its text may be committed as a test fixture).
