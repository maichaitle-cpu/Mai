# Pipeline eval

Runs the real app code (`app/Archive Portal v3.dc.html`, unchanged) headless in Chromium on worksheets with
known answer positions, and scores what the pipeline produced.

```
cd eval && npm install
node lib/eval.cjs                          # every document in fixtures/gt, scripted "perfect Claude"
node lib/eval.cjs --docs physics,polygraph # some documents
node lib/eval.cjs --snap                   # also save rendered pages to out/<tag>/
node lib/eval.cjs --cost                   # per-step call counts and estimated $/page
node lib/eval.cjs --noise 0.3 --seed 2     # corrupt 30% of Claude's layout answers (robustness)
tools/suite.sh TAG                         # clean run + 5 noisy seeds
ANTHROPIC_API_KEY=... node lib/eval.cjs --mode live --docs physics   # real Claude, real cost
```

## Modes

- **oracle** (default): every Claude step is answered from ground truth (`lib/oracle.js`). Any remaining
  miss is the app's own code. It does not measure Claude's answer quality.
- **live**: request bodies go to the Messages API (`lib/live.cjs`). Responses are cached in `.cache/`, so
  re-scoring a run is free; delete the cache to re-bill. Prints real $/page from `usage`.

## Scores

- **found**: printed questions that got an answer. **invented**: answers with no printed question.
- **location**: answer sits inside that question's real answer area (or its mark is on the chosen
  option), does not cover printed text and is not written over a picture.
- **choice**: chosen option equals the answer key (meaningful in live mode).

## Fixtures

- `fixtures/real/`: the uploaded worksheets. Ground truth built by `tools/build_gt.py` from
  `lib/dump.cjs` output, checked visually with `tools/overlay_gt.py`.
- `fixtures/synth/`: generated worksheets (`tools/gen_synth.cjs`), ground truth from the DOM.
- `fixtures/scan/`: pages rendered as skewed, noisy JPEG scans (`tools/make_scans.py`).
