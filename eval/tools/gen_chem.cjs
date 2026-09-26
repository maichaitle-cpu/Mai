#!/usr/bin/env node
// Rebuilds the IGCSE-style chemistry page from a user's Claude Design screenshot (header bar with marks,
// table with an empty "Inference" column, parts (a)-(e) each followed by one answer rule).
// Usage: node tools/gen_chem.cjs  ->  fixtures/synth/chem01.pdf + fixtures/gt/chem01.json
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { chromium } = require(path.join(execSync('npm root -g').toString().trim(), 'playwright'));

const EVAL = path.resolve(__dirname, '..');
const K = 1.5; // CSS px -> app canvas px

const rows = [
  ['A', 'Flame test', 'lilac flame', 'potassium ion (K⁺) present'],
  ['A', 'Acidify, then add aqueous silver nitrate', 'white precipitate', 'chloride ion (Cl⁻) present'],
  ['B', 'Add aqueous sodium hydroxide', 'green precipitate; surface slowly turns brown', 'iron(II) ion (Fe²⁺) present'],
  ['B', 'Acidify, then add aqueous barium nitrate', 'white precipitate', 'sulfate ion (SO₄²⁻) present'],
];
const parts = [
  ['(a)', 'Identify the positive ion and negative ion present in solution A.', 2, 'Potassium ion, K⁺ (lilac flame), and chloride ion, Cl⁻ (white precipitate with acidified silver nitrate).', 2],
  ['(b)', 'Give the formula of the dissolved salt in solution A.', 1, 'KCl', 1],
  ['(c)', 'Identify the positive ion and negative ion present in solution B.', 2, 'Iron(II) ion, Fe²⁺, and sulfate ion, SO₄²⁻.', 2],
  ['(d)', 'Give the formula of the dissolved salt in solution B.', 1, 'FeSO₄', 1],
  ['(e)', 'Write the ionic equation, including state symbols, for the sulfate precipitation test.', 2, 'Ba²⁺(aq) + SO₄²⁻(aq) → BaSO₄(s)', 1],
];

const css = `
  @page { size: 794px 1123px; margin: 0 }
  * { box-sizing: border-box }
  body { margin: 0; font-family: Arial, sans-serif; font-size: 13px; color: #111 }
  .page { width: 794px; height: 1123px; position: relative; padding: 50px 60px 0 60px }
  .bar { display: flex; border: 1.5px solid #2f5f9e; background: #dde8f5; font-weight: bold; font-size: 15px }
  .bar div { padding: 7px 10px } .bar .t { flex: 1; border-right: 1.5px solid #2f5f9e } .bar .m { width: 70px; text-align: right }
  .intro { margin: 12px 0 10px 0 }
  table { border-collapse: collapse; width: 100% } th, td { border: 1px solid #aab; padding: 6px 8px; text-align: left; vertical-align: top; font-size: 12.5px }
  th { background: #dde8f5; color: #1c3d6b } td:first-child { font-weight: bold; width: 70px } td.inf { width: 200px }
  .part { margin: 18px 0 0 12px } .part b { font-weight: bold }
  .rule { border-bottom: 1px solid #999; height: 44px; margin: 0 0 0 12px }
  .rule2 { height: 26px }
  .foot { position: absolute; bottom: 30px; left: 60px; right: 60px; font-size: 11px; color: #555 }`;

const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${css}</style></head><body><div class="page">
  <div class="bar"><div class="t">12&nbsp; Identifying two unknown solutions</div><div class="m">[10]</div></div>
  <div class="intro">A student carries out tests on two unknown solutions, A and B. The results are shown in the table.</div>
  <table><tr><th>Solution</th><th>Test</th><th>Observation</th><th>Inference to be completed</th></tr>
  ${rows.map((r, i) => `<tr><td data-row="${i}">${r[0]}</td><td>${r[1]}</td><td>${r[2]}</td><td class="inf" data-area="c${i}"></td></tr>`).join('')}</table>
  ${parts.map((p, i) => `<div class="part" data-q="p${i}">${p[0]} ${p[1]} <b>[${p[2]}]</b></div>` + `<div data-area="p${i}">${p[4] > 1 ? '<div class="rule"></div><div class="rule rule2"></div>' : '<div class="rule"></div>'}</div>`).join('')}
  <div class="foot">Chemistry practice · page 1</div>
</div></body></html>`;

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 794, height: 1123 } });
  await page.setContent(html, { waitUntil: 'load' });
  const geo = await page.evaluate(() => {
    const r = el => { const b = el.getBoundingClientRect(); return [b.left, b.top, b.width, b.height]; };
    const o = { q: {}, area: {}, row: {}, hdr: null };
    document.querySelectorAll('[data-q]').forEach(el => { o.q[el.dataset.q] = r(el); });
    document.querySelectorAll('[data-area]').forEach(el => { o.area[el.dataset.area] = r(el); });
    document.querySelectorAll('[data-row]').forEach(el => { o.row[el.dataset.row] = r(el); });
    o.hdr = r(document.querySelectorAll('th')[3]);
    return o;
  });
  const k = v => v.slice(0, 4).map(x => Math.round(x * K));
  const questions = [];
  rows.forEach((r, i) => questions.push({ label: r[0], page: 1, kind: 'cell', cat: 'TABLE_TEXT', prompt: r[0] + ' — ' + r[1] + ' — ' + r[2] + ' — Inference', answer: r[3], qrect: k(geo.row[i]), areas: [k(geo.area['c' + i])], cell: { row: k(geo.area['c' + i]), header: k(geo.hdr), col: 'Inference to be completed' } }));
  parts.forEach((p, i) => {
    const q = geo.q['p' + i], a = geo.area['p' + i];
    questions.push({ label: p[0], page: 1, kind: 'write', cat: p[2] > 1 ? 'LONG_TEXT' : 'SHORT_TEXT', prompt: p[1], answer: p[3], qrect: k(q), areas: [k([a[0], a[1], a[2], a[3]])] });
  });
  await page.pdf({ path: path.join(EVAL, 'fixtures', 'synth', 'chem01.pdf'), width: '794px', height: '1123px', printBackground: true });
  fs.writeFileSync(path.join(EVAL, 'fixtures', 'gt', 'chem01.json'), JSON.stringify({ doc: 'synth/chem01.pdf', synthetic: true, questions }, null, 1));
  console.log('chem01', questions.length, 'questions');
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
