# V Learn — Business model

**One line:** V Learn turns any networking course into narrated, animated lessons a student can watch, so concepts that are invisible on a slide become something you can see.

## Who it's for

| Customer | Their problem | Why they pay |
|---|---|---|
| **Certification candidates** (Network+, Security+, CCNA) | Memorising protocols from slides and videos that don't match their material | Already pay for prep courses and practice exams; V Learn turns *their* study material into something they can watch |
| **University and college students** | A networking module that's all text and diagrams | Upload the module from class, watch it before the quiz |
| **Instructors** | Making good visuals for every topic takes hours | Upload a module once, share the videos with the whole class |
| **Schools, bootcamps, company IT training** | Hard-to-teach, high-dropout technical courses | Per-seat licence, LMS integration, usage reports |

**First market:** certification candidates and university students. They feel the pain directly, decide alone, and can pay by card. Schools come next, using instructors who already like it as the way in.

## Pricing

| Plan | Price | What's included |
|---|---|---|
| **Free** | $0 | All built-in lessons, 5 AI lessons a month, 1 module upload a month |
| **Student** | $12 a month, or $99 a year | Unlimited AI lessons (fair use), 20 module uploads a month, voice follow-ups, saved library |
| **Instructor** | $29 a month | Everything in Student, share module videos with a class, review and approve AI lessons, up to 60 students |
| **Schools & teams** | $8 per student per term | Everything in Instructor, LMS integration (Canvas, D2L), admin dashboard, volume pricing from 200 seats |

The free plan is how people find V Learn: the built-in lessons cost nothing to serve, and one module a month shows the magic.

## The AI is included

Students never need a Claude account or an API key.

1. V Learn runs as a normal website.
2. When a student asks a question or uploads a module, **our server** calls the Anthropic API with **our** key ([`api/ai.js`](../api/ai.js), already built). The key never reaches the browser.
3. The subscription pays for those calls.

## What it costs us (unit economics)

Prices: Claude Sonnet 5.5 at $2 per million input tokens and $10 per million output tokens; Claude Haiku 5.5 (follow-up answers) at $0.10 / $0.50. Token counts below are measured from V Learn's real prompts.

| Action | Model | Tokens (in / out) | Cost |
|---|---|---|---|
| One AI lesson | Sonnet | ~5,000 / ~3,000 | **~$0.04** |
| Module outline | Sonnet | ~9,000 / ~1,500 | ~$0.03 |
| Whole module (outline + ~5 lessons) | Sonnet | | **~$0.25** typical, ~$0.70 worst case with repairs |
| Follow-up question | Haiku | ~1,500 / ~200 | ~$0.0003 |
| Built-in lessons, cached modules | none | 0 | $0 |

| Plan | Typical monthly AI cost | Payment fees | Gross margin |
|---|---|---|---|
| Free | ~$0.45 | — | marketing cost |
| Student ($12) | ~$2–3 (4 modules, 30 lessons) | ~$0.65 | **~75–80%** |
| Instructor ($29) | ~$5 (15 modules, shared videos replay free) | ~$1.15 | **~80%** |
| Schools ($8 / student / term) | ~$1 per student per term | invoiced | **~85%** |

**Keeping costs down:**
- **Convert once, replay forever.** A module's video is stored after it's built, so a class of 60 watching it costs nothing extra. Popular lessons ("What happens when you visit a website") are cached and served to everyone.
- **Prompt caching.** The source library and lesson format are the same in every prompt and are cached, cutting their input cost by up to 95%.
- **Fair-use limits** per plan stop one heavy user from running up the bill.

## How people get it

1. **Website** on laptop and phone: sign up, start free, upgrade in one click.
2. **Built for the student's real course:** upload the module from class, which no generic video course can match.
3. **Instructor sharing:** one instructor brings a whole class onto the free or student plan.
4. **LMS plug-in** (Canvas, D2L): the video shows up right inside the course page, which is how schools buy.

## Growth

1. **Now:** networking (Network+, CCNA, university networking modules).
2. **Next:** cybersecurity (attacks and defences as animated traffic), then programming (data structures, memory). The same engine works for anything that moves: script → validator → animator.
3. **Later:** biology and other "invisible" sciences, built-in 3D models.

**Why we can win:** the AI never draws. It writes a script, a validator checks it against official sources and the student's own module, and plain code animates it. That makes V Learn more trustworthy than AI video generators, and cheaper to run.

## Roadmap to launch

| Step | What | Status |
|---|---|---|
| 1 | Lesson engine, 2D and 3D views, validator, built-in lessons | Done |
| 2 | Module upload → narrated video | Done |
| 3 | AI through our server (Anthropic API, key server-side) | Done ([`api/ai.js`](../api/ai.js)) |
| 4 | Stripe subscriptions (Checkout, signed plan passes, customer portal) and per-plan AI budgets on `/api/ai` | Done ([`api/billing-core.js`](../api/billing-core.js)) |
| 5 | Accounts and sign-in (restore a plan on a new device by email) | Next |
| 6 | Store converted modules; share links for instructors | Next |
| 7 | Instructor review mode (approve AI lessons) | Planned |
| 8 | Canvas and D2L plug-ins | Planned |

## Risks

- **AI accuracy.** Mitigated by the validator, vetted sources, honest labels and instructor review mode. Measured in [`evals/report.md`](../evals/report.md).
- **AI cost spikes.** Mitigated by fair-use limits, caching and convert-once storage.
- **Course material copyright.** Files are read in the student's browser and only their text is sent for conversion; videos are shared only within the uploader's class.
