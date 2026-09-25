# Archive Portal v3: Rules

## 1. Accounts and limits
1. Only listed accounts can sign in.
2. Per-upload page limits: Admin 100, Member 50, Tester 50. Daily limit: Tester 20 pages. Admin and Member have none.
3. Uploads over the limit are cut at the limit, and the user is told.
4. Only Admin sees: the Google Vision key field, the Workflow trace, and moving the page marks.

## 2. Files
1. Every file is converted to PDF pages first.
2. A digital PDF text layer is always preferred over OCR.
3. Scans use Google Vision when the admin has entered a key; otherwise the built-in OCR (English first, Thai only when needed). If OCR confidence is low, Claude reads the image.

## 3. What counts as a question
1. Anything that expects the student to write, mark or draw, including sub-parts (a, b, c), blanks and table cells.
2. **Never a question:** titles, headings, instructions (Directions, คำชี้แจง, time limits), footers, page numbers.
3. **Always left blank:** Name, Class, Section, Period, Date, Teacher, Student ID, Score, Grade (and ชื่อ, ชั้น, เลขที่, วันที่). Answer spaces on those lines are deleted.
4. A question split across two pages counts as one question. Options on the next page belong to the question above them.
5. A line with N blanks gives N questions, left to right.
6. **Tables:** a header row with 2 to 8 real columns, followed by 2 or more rows with the same fill pattern. A column empty in every row gets one question per cell. Header text that wraps onto several lines counts as one header. The table stops at bullets, numbered questions, ALL-CAPS headings, Name/Date or "label: value" lines, a change in row spacing or a change in the fill pattern. Page headers and footers are never tables.
7. **Blanks** on a line are matched by the label printed before them ("Degree: ___"), not handed out left to right.

## 4. Categories
Each question gets exactly one category. The category decides how it is answered and drawn.

| Category | Answer | Drawn as |
|---|---|---|
| Short text | word or short phrase | handwriting |
| Long text | sentences sized to the space | handwriting |
| Numeric | number + unit only | handwriting |
| Formula + working | formula → substitution → answer, one step per line | handwriting |
| Multiple choice / True-False | option number | circle, tick or X on the option |
| Select all | every correct option number | mark on each option |
| Fill blank | only the missing word(s) | on the blank |
| Table short / text | value or short sentence | inside the cell |
| Table tick | ✓ or ✗ | pen mark in the cell |
| Matching | pairs | line between the two printed items |
| Circle word / Underline | exact printed word | ellipse or underline on that word |
| Ordering | "3, 1, 4, 2" or items with → | handwriting |
| Drawing / Label diagram / Graph plot | pen shapes | lines, arrows, points and labels in the box, always flagged |
| Skip | none | nothing |
| Other | best answer that fits | handwriting, flagged |

- A choice category is only allowed when printed options were located. Otherwise it becomes Fill blank or Table short.
- Users can change the category in the sidebar and press Re-solve.

## 5. Where an answer goes (priority order)
1. **Table cell / blank:** inside that cell or blank.
2. **Zone:** from the question's last printed line down to the next printed item in the same column. Claude's "next" line wins if it is closer.
3. Inside the zone, use its unused spaces top to bottom. A drawn box wins over everything and the answer never leaves it. Writing lines win over plain gaps, except for working/long answers with a single answer line: working goes in the gap above it and the final line goes on the answer line.
4. No space, but a gap of at least 2 lines → a space is made in the gap (at most 8 lines).
5. No gap → same line, right of the question (only if at least 5 characters fit).
6. **Shared space:** consecutive long questions with no room, followed by one big space → the space is split evenly between them, top to bottom.
7. No zone at all → Claude's map box is used and **flagged**.
8. **Never:**
   - on printed text
   - on a Name / Date line
   - across the column divider
   - past the next question
   - in a space already taken
   - on a graph or picture (a box with ink inside, or coloured image pixels)
   - on the edge of a box or card, a footer bar or other decoration
   - in a box smaller than 6 characters

## 6. Position checks
1. **Number cross-check:** if Claude's line is above its printed number, in the other column or below the next number, the question moves to its printed number and is flagged.
2. **Code and Claude disagree** on the space → the code wins, and the answer is flagged.
3. The final check may only move an answer inside its own zone.
4. Text never goes past the limit box: shorten → shrink to 90 / 80 / 70% → flag.

## 7. Solving
1. Always read numbers, fractions and options from the page image, not the extracted text.
2. Work out math first (hidden working). Arithmetic is checked by code.
3. Choice answers are given as the option number. The option text must match exactly one printed option.
4. Echo the question label. A different label means a wrong question → flagged.
5. Use the context (the stem above the question) and the fact sheet (other pages). Never copy them into the answer.
6. Questions that point back ("use your answer to 3") are solved after the question they depend on and receive its answer.
7. Never leave an answer empty. Questions asking what can't be known are answered normally.
8. Never start an answer with the question number. It is stripped anyway.
9. Follow the answer length and the room (maxChars).
10. Answer language: match the worksheet, or always Thai, or always English (setting).

## 8. Retries and checks
1. Unanswered → retried per page, then one by one with context.
2. Refusal-style answers ("Sorry", "I cannot answer") are discarded and retried.
3. **Balanced / Double-check:** risky answers are solved again. Any change is flagged with the old answer and the reason.
4. Low confidence, mismatched labels, drawings and overflow are always flagged for review.

## 9. Editing
1. Every answer and drawing can be moved, resized, rotated, recoloured and deleted. Undo and redo cover all edits.
2. Dragging text keeps its lines and does not snap back.
3. Redoing a page replaces only that page's answers.
4. Edits are saved to History automatically.

## 10. Cost guards
1. At most 15 questions per solve call, 2 calls at a time.
2. Page images are compressed to under the upload size limit.
3. The fact sheet only runs for worksheets with 2 or more pages.
4. Google Vision only runs on pages without a text layer.
5. The map check only runs on pages where code left a question unplaced, and the final check only on pages with flagged answers (both run everywhere on Full check).
6. Thinking is used only for solving and double-checking.
