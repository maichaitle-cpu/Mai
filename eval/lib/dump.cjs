#!/usr/bin/env node
// Renders a fixture through the app's own prepareSource() and writes page PNGs + text lines,
// for building and reviewing ground truth. Usage: node lib/dump.cjs real/physics.pdf [outDir]
const fs = require('fs');
const path = require('path');
const { openApp, EVAL } = require('./browser.cjs');

async function main() {
  const doc = process.argv[2];
  const outDir = process.argv[3] || path.join(EVAL, 'out', 'dump', path.basename(doc).replace(/\.\w+$/, ''));
  fs.mkdirSync(outDir, { recursive: true });
  const logs = [];
  const { browser, page } = await openApp({ log: m => logs.push(m) });
  const res = await page.evaluate(async doc => {
    const comp = new __C();
    comp.toast = () => {};
    comp.state.email = 'eval@local';
    const blob = await (await fetch('/' + doc)).blob();
    const src = await comp.prepareSource(new File([blob], doc.split('/').pop(), { type: blob.type }));
    const r = v => Math.round(v);
    return src.pages.map((p, i) => ({
      page: i + 1, w: p.canvas.width, h: p.canvas.height,
      png: p.canvas.toDataURL('image/png'),
      vec: p.vec ? { hl: p.vec.hl.map(l => [r(l.x0), r(l.x1), r(l.y)]), vl: p.vec.vl.map(l => [r(l.y0), r(l.y1), r(l.x)]) } : null,
      lines: (p.lines || []).map(l => ({ id: l.id, top: r(l.top), bottom: r(l.bottom), x0: r(l.x0), x1: r(l.x1), h: r(l.h), blanks: (l.blanks || []).map(b => [r(b.x0), r(b.x1)]), cells: (l.cells || []).map(c => [c.text, r(c.x0), r(c.x1)]), text: l.text })),
    }));
  }, doc);
  res.forEach(p => { fs.writeFileSync(path.join(outDir, 'p' + p.page + '.png'), Buffer.from(p.png.split(',')[1], 'base64')); delete p.png; });
  fs.writeFileSync(path.join(outDir, 'lines.json'), JSON.stringify(res, null, 1));
  res.forEach(p => {
    console.log('PAGE', p.page, p.w + 'x' + p.h, 'vec', p.vec ? p.vec.hl.length + 'h/' + p.vec.vl.length + 'v' : '-', 'lines', p.lines.length);
    p.lines.forEach(l => console.log('  ' + String(l.id).padStart(2), 'y' + String(l.top).padStart(4) + '-' + String(l.bottom).padEnd(4), 'x' + String(l.x0).padStart(4) + '-' + String(l.x1).padEnd(4), l.blanks.length ? 'b' + l.blanks.length : '  ', l.cells.length > 1 ? 'c' + l.cells.length : '  ', '|', l.text.slice(0, 100)));
  });
  if (logs.length) console.log(logs.join('\n'));
  await browser.close();
}
main().catch(e => { console.error(e); process.exit(1); });
