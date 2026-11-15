# Review record: upload a module → 3D video

How the feature was checked, task by task. Every review was done by an agent that did not write the code.

| Task | First review | Fix rounds | Notable catches |
|---|---|---|---|
| 1. Course contract, module citations, 802.11 | Needs fixes | 1 | Hidden-character stripping only removed the first character; an AI-supplied `fallback` flag could skip citation rules |
| 2. Reading PDF / PowerPoint / Word / text | Needs fixes | 3 | Long PDFs could silently drop later pages before reaching the AI (fixed for any size, down to range labels for 2,000+ pages) |
| 3. Built-in OSI scene | Approved | 0 | Wording refinements, applied in the final wave |
| 4. Module → course pipeline | Needs fixes | 1 | A "couldn't animate" card could cite the wrong page; slide decks now cite slides |
| 5. 3D stage (three.js) | Needs fixes | 1 | OSI steps didn't wait for narration; a failing animation frame could hang playback |
| 6. Upload, video player, 2D/3D, sample module | Needs fixes | 1 | Sample said Wi-Fi uses "the same frames" as Ethernet (false); DHCP/DNS inconsistency; 2D/3D race at load |
| Whole branch (most capable model) | With fixes | 1 wave | Pause restarted the item; narration could stall or rush; 3D view stuck tall after resizing; OSI wording |

All Critical and Important findings were fixed and re-reviewed. Remaining minor items (performance polish, extra tests, rare edge cases) are listed in the build ledger and left for after the hackathon.

## Accepted risks (stated honestly)

- An AI summary card can still say something imprecise, or cite a real page that doesn't fully support it: module citations are checked for range, not meaning. Mitigation: honest labels ("From your module · AI summary", "structure checked, not hand-verified").
- three.js loads from jsDelivr rather than cdnjs (cdnjs lacks the add-ons used); both are on the artifact allowlist.
- The sample module's course was written by a model following the same rules as the live prompts and validated by tests, and keeps AI labels.
