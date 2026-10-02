#!/usr/bin/env node
// Positioned text items of a PDF (for ground truth: glyph positions, answer keys).
// Usage: node tools/pdf_items.cjs fixtures/real/allsubj.pdf out/dump/allsubj/items.json
//        node tools/pdf_items.cjs fixtures/real/allsubj_key.pdf out/dump/allsubj/key_items.json
const pdfjs = require(require('path').join(__dirname, '..', 'node_modules', 'pdfjs-dist', 'legacy', 'build', 'pdf.js'));
(async () => {
  const doc = await pdfjs.getDocument({ data: new Uint8Array(require('fs').readFileSync(process.argv[2])), verbosity: 0 }).promise;
  const out = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const pg = await doc.getPage(p); const vp = pg.getViewport({ scale: 1 });
    const tc = await pg.getTextContent();
    out.push({ w: vp.width, h: vp.height, items: tc.items.filter(i => i.str.trim()).map(i => [i.str, +i.transform[4].toFixed(1), +(vp.height - i.transform[5]).toFixed(1), +i.width.toFixed(1), +i.height.toFixed(1), i.fontName]) });
  }
  require('fs').writeFileSync(process.argv[3], JSON.stringify(out));
})();
