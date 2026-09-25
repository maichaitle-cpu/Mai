# Archive Portal v3: Workflow

## 0. Account
- Sign in with a listed account. Role sets limits: Admin 100 pages per upload with no daily limit, Member 50 per upload, Tester 50 per upload and 20 per day.
- The page counter is shown in the top-right corner. Usage is counted per day in the browser.

## 1. Upload and convert to PDF
- Accepts PDF, images (JPG, PNG, WebP, HEIC), DOCX, PPTX, XLSX, TXT and HTML. Every file is turned into PDF pages.
- Each page is rendered to a high-resolution image (canvas).

## 2. Image preprocessing (scans only)
- Straighten, upscale, boost contrast, reduce noise.

## 3. Text reading
- **Digital PDF:** text and exact positions come from the PDF text layer. Exact lines, boxes and table borders are read from the PDF drawing.
- **Scan or photo:** Google Vision (the site key, which admin can change) or the built-in OCR as a fallback.
- Lines are split into cells at wide gaps (used for tables and columns). Runs of "……" and "____" become blanks, not text. Noise is dropped.
- Low-confidence pages fall back to Claude reading the image.

## 4. Question detection (Claude Sonnet)
- Input: numbered text lines, plus page images for scans.
- For each question it returns the label, prompt, kind (box / blank / cell / choice / below), the line where the question ends, the **next** line (where the answer area stops), options with their lines, and a **category**.
- 20 categories: Short text, Long text, Numeric, Formula + working, Multiple choice, True/False, Select all, Matching, Fill blank, Table short / tick / text, Drawing, Label diagram, Graph plot, Ordering, Circle word, Underline, Skip, Other.
- Code passes after Claude:
  - fill in missing question numbers
  - merge questions split across pages
  - **table finder**: header row + empty columns → one cell per empty cell
  - options found by code when Claude misses them, including options on the next page
- Name, class, date and instruction lines are dropped.

## 5. Place and zones (code, free)
- **Choice questions:** each option's position is found in the page text and adjusted to the printed letter.
- **Answer spaces detected:** writing lines, faint or dotted lines, boxes, gaps and table cells. Tiny boxes, boxes with ink in them, and spaces on Name / Section / Date lines are discarded.
- **Column split** for two-column pages.
- **Zone per question:** from its last printed line down to the next printed item (Claude's "next" line or the next text in the same column). The question's own spaces are taken in order.
  1. Spaces inside the zone.
  2. Otherwise an empty gap of at least 2 lines becomes a space.
  3. Otherwise the answer goes on the same line, right of the question.
  4. **Shared space:** a) and b) sitting over one big space split it between them.
- **Number cross-check:** a question placed away from its printed number is moved and flagged.
- Each zone gets an answer length (short / 1 sentence / few sentences / paragraph), a limit box, and the stem text above the question as context.

## 6. Map check (Claude Sonnet, 1 call per page)
- Page image with numbered spaces and a grid. Claude confirms each question's category and marks its start and limit box.
- If the code found a zone, it is used, and a disagreement is flagged. With no code zone, Claude's box is used and flagged.

## 7. Fact sheet (Claude Haiku, multi-page only)
- Short notes of everything printed (passages, values, tables, setups) for use across pages.
- **Dependencies**: which questions need an earlier answer. Found by phrase matching ("use your answer to 3") plus Claude's own reading.

## 8. Solve (Claude Sonnet)
- Up to 15 questions per call, from one page, with that page's image. 2 calls run in parallel.
- Each question carries its category rule, answer length, room, context, the fact sheet and the style settings.
- Claude returns: the answer, the option number, hidden working, confidence, a check of the question label, keywords, and extras by category (pairs, target word, drawing shapes, several options).
- **Dependent questions** are solved afterwards, in order, with the earlier answers included.
- Retries: unanswered questions per page, then one by one. Refusal-looking answers are dropped, unless the question itself asks what can't be known.
- **Double-check / Balanced** (setting): risky answers are solved again, and changes are flagged.

## 9. Assign, write, fit
- Remaining questions without a zone: Claude matches them to free spaces, with position checks.
- Output by category:
  - Text: handwriting written in its slots.
  - Choice: circle / tick / X on the option.
  - Select all: every chosen option is marked.
  - Tick cells: ✓ or ✗.
  - Circle and underline: drawn on the printed word.
  - Matching: a line between the two items.
  - Drawing, graph, label: pen shapes inside the box, flagged for checking.
- **Fit:** too-long answers are shortened, then shrunk to 90, 80 and 70%. If still too long, they're flagged. Question numbers are stripped from the start of answers.

## 10. Final check (Claude, if accuracy isn't Standard)
- Looks at the rendered page and moves answers sitting in the wrong place, but only within their own zone.

## 11. Result editor
- Page view with a Canva-style editor: move, resize and rotate answers; edit text; draw (pen, line, arrow, box, tick, cross); undo and redo; zoom; per-answer colour and font.
- Sidebar: edit the answer, category + **Re-solve**, answer length buttons, Fit to box, flags, review mode for flagged answers.
- Redo a single page. **Show spaces** (blue = found, green = used, orange = Claude's boxes). Debug report download.
- **Admin: Workflow trace**: every question as a stem of steps (Read → Place → Zone → Map → Solve → Assign → Write → Final check), each coloured ok / warning / failed. Also shows stage times and the fact sheet.
- Test mode: score the run against an answer key.

## 12. Download and History
- Save as PDF. Each run is stored in History for downloading later.

## Style settings
- **Voice:** writing level, grammar, math style (answer only / working / symbols), answer language, accuracy, scan reading.
- **Pen:** handwriting fonts (English and Thai) or normal font, ink colour and custom palette, keyword highlight colour, choice mark style.
- **Realism:** imperfection, cross-outs.

## Cost per page (approx.)
- Claude: about $0.05–0.06. Fact sheet: about $0.003–0.005 per multi-page run.
- Google Vision: first 1,000 scanned pages a month free, then about $0.0015 per page. Digital PDFs don't use it.
