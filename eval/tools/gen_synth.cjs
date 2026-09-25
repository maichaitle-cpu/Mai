#!/usr/bin/env node
// Generates synthetic worksheets (HTML -> PDF in Chromium) with exact ground truth read from the DOM.
// Layout coverage the real set lacks: two columns, inline / grid / Thai options, True-False, dotted lines,
// fill-in sentences, CSS-drawn blanks, borderless tables, questions split across pages.
// Usage: node tools/gen_synth.cjs [count=12] [seed=7]
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { chromium } = require(path.join(execSync('npm root -g').toString().trim(), 'playwright'));

const EVAL = path.resolve(__dirname, '..');
const OUT_PDF = path.join(EVAL, 'fixtures', 'synth');
const OUT_GT = path.join(EVAL, 'fixtures', 'gt');
const count = Number(process.argv[2] || 12), seed0 = Number(process.argv[3] || 7);

let S = seed0;
const rnd = () => { S = (S * 1664525 + 1013904223) % 4294967296; return S / 4294967296; };
const pick = a => a[Math.floor(rnd() * a.length)];
const shuffle = a => a.map(v => [rnd(), v]).sort((x, y) => x[0] - y[0]).map(x => x[1]);
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');

const MC = [
  ['What is the SI unit of force?', ['newton', 'joule', 'watt', 'pascal'], 0],
  ['Which gas do plants absorb during photosynthesis?', ['oxygen', 'nitrogen', 'carbon dioxide', 'hydrogen'], 2],
  ['What is 12 × 8?', ['96', '86', '108', '92'], 0],
  ['Which planet is closest to the Sun?', ['Venus', 'Earth', 'Mercury', 'Mars'], 2],
  ['The chemical symbol for sodium is:', ['S', 'Na', 'So', 'Sd'], 1],
  ['Which of these is a prime number?', ['21', '27', '29', '33'], 2],
  ['What is the boiling point of water at sea level?', ['90 °C', '100 °C', '110 °C', '120 °C'], 1],
  ['Which organ pumps blood around the body?', ['lungs', 'liver', 'kidney', 'heart'], 3],
  ['Solve for x: 2x + 6 = 14', ['x = 3', 'x = 4', 'x = 5', 'x = 10'], 1],
  ['Which word is a synonym of "rapid"?', ['slow', 'quick', 'late', 'heavy'], 1],
  ['A triangle has angles 50° and 60°. The third angle is:', ['60°', '70°', '80°', '90°'], 1],
  ['Which layer of the atmosphere contains the ozone layer?', ['troposphere', 'stratosphere', 'mesosphere', 'thermosphere'], 1],
];
const MC_TH = [
  ['หน่วย SI ของแรงคืออะไร', ['นิวตัน', 'จูล', 'วัตต์', 'ปาสคาล'], 0],
  ['ข้อใดเป็นจำนวนเฉพาะ', ['21', '27', '29', '33'], 2],
  ['ดาวเคราะห์ดวงใดอยู่ใกล้ดวงอาทิตย์ที่สุด', ['ดาวศุกร์', 'โลก', 'ดาวพุธ', 'ดาวอังคาร'], 2],
  ['12 × 8 มีค่าเท่าใด', ['96', '86', '108', '92'], 0],
  ['อวัยวะใดทำหน้าที่สูบฉีดเลือด', ['ปอด', 'ตับ', 'ไต', 'หัวใจ'], 3],
];
const SHORT = [
  ['Name the process by which water vapour turns into liquid water.', 'Condensation'],
  ['State the formula for the area of a circle.', 'A = πr²'],
  ['What is the capital city of Japan?', 'Tokyo'],
  ['Write the chemical formula of water.', 'H₂O'],
  ['Convert 2.5 km into metres.', '2500 m'],
  ['Who wrote "Romeo and Juliet"?', 'William Shakespeare'],
  ['What is the value of 3² + 4²?', '25'],
  ['Give one example of a renewable energy source.', 'Solar power'],
];
const LONG = [
  ['Explain why metals are good conductors of electricity.', 'Metals have free electrons that can move through the structure and carry charge from one end to the other.'],
  ['Describe two ways to reduce plastic waste at school.', 'Bring reusable bottles and containers, and set up recycling bins in every classroom.'],
  ['Explain how the seasons are caused on Earth.', 'The Earth is tilted, so each hemisphere gets more direct sunlight during part of the year, which makes it summer there.'],
  ['Why is it important to control variables in an experiment?', 'Keeping other variables the same makes sure that only the variable being tested causes the change, so the result is fair.'],
  ['Describe what happens to particles when a solid melts.', 'The particles gain energy, vibrate more and break out of their fixed positions so they can slide past each other.'],
];
const BLANK = [
  ['The capital of France is', 'Paris', '.'],
  ['Water boils at', '100', '°C at sea level.'],
  ['The powerhouse of the cell is the', 'mitochondria', '.'],
  ['A triangle with three equal sides is called an', 'equilateral', 'triangle.'],
  ['The opposite of "ancient" is', 'modern', '.'],
  ['Light travels faster than', 'sound', '.'],
];
const TF = [
  ['The Sun is a star.', 0], ['Sound travels faster than light.', 1], ['Ice is less dense than liquid water.', 0], ['All metals are magnetic.', 1], ['A square is a type of rectangle.', 0],
];

function sheet(no) {
  const th = rnd() < 0.2;
  const font = pick(['Georgia, serif', 'Arial, sans-serif', '"Times New Roman", serif', 'Verdana, sans-serif']);
  const fs0 = pick([13, 14, 15, 16]);
  const numFmt = pick([n => n + '.', n => n + ')', n => 'Q' + n + '.', n => (th ? 'ข้อ ' + n + '.' : n + '.')]);
  const twoCol = !th && rnd() < 0.3;
  const blocks = [];
  let n = 0;
  const gt = [];
  const Q = (spec) => { const id = 'q' + gt.length; gt.push({ id, ...spec }); return id; };
  const add = h => blocks.push(h);
  add(`<div class="hdr"><b>${th ? 'แบบฝึกหัด' : 'Worksheet'} ${no}</b><span>${th ? 'วิทยาศาสตร์ ม.4' : 'Grade 9 Science'}</span></div>`);
  add(`<div class="info">${th ? 'ชื่อ' : 'Name'}: ______________________ ${th ? 'ชั้น' : 'Class'}: ________ ${th ? 'เลขที่' : 'Date'}: ________</div>`);
  add(`<p class="ins">${th ? 'คำชี้แจง: ตอบคำถามทุกข้อ' : 'Instructions: Answer all questions. Write your answers in the spaces provided.'}</p>`);
  const kinds = shuffle(th ? ['mc_th', 'mc_th', 'mc_th', 'short', 'long'] : ['mc_lines', 'mc_inline', 'mc_grid', 'short', 'long', 'blank', 'tf', 'table', 'dotted', 'subparts', 'blank_css']).slice(0, th ? 5 : 7 + Math.floor(rnd() * 3));
  const lead = [];
  kinds.forEach(kind => {
    if (kind.startsWith('mc')) {
      const bank = kind === 'mc_th' ? MC_TH : MC;
      const cnt = 2 + Math.floor(rnd() * 2);
      for (let i = 0; i < cnt; i++) {
        const [qt, opts, c] = pick(bank);
        const lab = numFmt(++n);
        const letters = kind === 'mc_th' ? ['ก.', 'ข.', 'ค.', 'ง.'] : pick([['A.', 'B.', 'C.', 'D.'], ['(A)', '(B)', '(C)', '(D)'], ['a)', 'b)', 'c)', 'd)']]);
        const id = Q({ label: lab, kind: 'choice', cat: 'MULTIPLE_CHOICE', prompt: qt, options: opts.map((o, k) => letters[k] + ' ' + o), correct: c });
        const o = opts.map((t, k) => `<span class="opt" data-opt="${id}:${k}">${letters[k]} ${esc(t)}</span>`);
        const body = kind === 'mc_inline' ? `<div class="optrow">${o.join('')}</div>` : kind === 'mc_grid' ? `<div class="optgrid">${o.join('')}</div>` : `<div class="optcol">${o.join('')}</div>`;
        add(`<div class="q"><div data-q="${id}">${esc(lab)} ${esc(qt)}</div>${body}</div>`);
      }
    } else if (kind === 'short') {
      const [qt, a] = pick(SHORT);
      const lab = numFmt(++n);
      const id = Q({ label: lab, kind: 'write', cat: 'SHORT_TEXT', prompt: qt, answer: a });
      add(`<div class="q"><div data-q="${id}">${esc(lab)} ${esc(qt)}</div><div class="rule" data-area="${id}"></div></div>`);
    } else if (kind === 'long') {
      const [qt, a] = pick(LONG);
      const lab = numFmt(++n);
      const id = Q({ label: lab, kind: 'write', cat: 'LONG_TEXT', prompt: qt, answer: a });
      const boxed = rnd() < 0.5;
      add(`<div class="q"><div data-q="${id}">${esc(lab)} ${esc(qt)}</div>${boxed ? `<div class="box" data-area="${id}"></div>` : `<div data-area="${id}"><div class="rule"></div><div class="rule"></div><div class="rule"></div></div>`}</div>`);
    } else if (kind === 'dotted') {
      const [qt, a] = pick(LONG);
      const lab = numFmt(++n);
      const id = Q({ label: lab, kind: 'write', cat: 'LONG_TEXT', prompt: qt, answer: a });
      add(`<div class="q"><div data-q="${id}">${esc(lab)} ${esc(qt)}</div><div data-area="${id}"><div class="dots">${'.'.repeat(120)}</div><div class="dots">${'.'.repeat(120)}</div></div></div>`);
    } else if (kind === 'blank' || kind === 'blank_css') {
      const lab = numFmt(++n);
      const items = shuffle(BLANK).slice(0, 3);
      const head = Q.bind(null);
      add(`<div class="q"><div>${esc(lab)} ${'Complete each sentence.'}</div>` + items.map(([pre, a, post], i) => {
        const id = head({ label: lab, kind: 'blank', cat: 'FILL_BLANK', prompt: pre + ' ___ ' + post, answer: a, sub: i });
        const blank = kind === 'blank' ? `<span data-area="${id}">______________</span>` : `<span class="cssblank" data-area="${id}"></span>`;
        return `<div class="sent" data-q="${id}">(${'abc'[i]}) ${esc(pre)} ${blank} ${esc(post)}</div>`;
      }).join('') + `</div>`);
    } else if (kind === 'tf') {
      const lab = numFmt(++n);
      const items = shuffle(TF).slice(0, 3);
      add(`<div class="q"><div>${esc(lab)} Circle True or False.</div>` + items.map(([st, c], i) => {
        const id = Q({ label: '(' + 'abc'[i] + ')', kind: 'choice', cat: 'TRUE_FALSE', prompt: st, options: ['True', 'False'], correct: c });
        return `<div class="tf"><span data-q="${id}">(${'abc'[i]}) ${esc(st)}</span><span class="tfo"><span data-opt="${id}:0">True</span> / <span data-opt="${id}:1">False</span></span></div>`;
      }).join('') + `</div>`);
    } else if (kind === 'table') {
      const lab = numFmt(++n);
      const rows = shuffle(['Iron', 'Oxygen', 'Copper', 'Helium', 'Sulfur']).slice(0, 3);
      const cols = ['Symbol', 'Metal or non-metal'];
      const ans = { Iron: ['Fe', 'Metal'], Oxygen: ['O', 'Non-metal'], Copper: ['Cu', 'Metal'], Helium: ['He', 'Non-metal'], Sulfur: ['S', 'Non-metal'] };
      const border = rnd() < 0.6;
      add(`<div class="q"><div>${esc(lab)} Complete the table.</div><table class="${border ? 'tb' : 'tn'}"><tr><th>Element</th>${cols.map(c => `<th data-hdr="1">${c}</th>`).join('')}</tr>` + rows.map(r => `<tr><td data-row="1">${r}</td>` + cols.map((c, k) => { const id = Q({ label: r, kind: 'cell', cat: 'TABLE_SHORT', prompt: r + ' — ' + c, answer: ans[r][k], col: c }); return `<td data-area="${id}" data-cellrow="${id}"></td>`; }).join('') + `</tr>`).join('') + `</table></div>`);
    } else if (kind === 'subparts') {
      const lab = numFmt(++n);
      add(`<div class="q"><div>${esc(lab)} A car travels 120 km in 2 hours.</div>` + ['Calculate its average speed.', 'How far would it travel in 5 hours at the same speed?'].map((t, i) => {
        const id = Q({ label: '(' + 'ab'[i] + ')', kind: 'write', cat: 'FORMULA_WORKING', prompt: 'A car travels 120 km in 2 hours. ' + t, answer: i ? '300 km' : '60 km/h' });
        return `<div class="sub" data-q="${id}">(${'ab'[i]}) ${esc(t)}</div><div class="gap" data-area="${id}"></div>`;
      }).join('') + `</div>`);
    }
  });
  const css = `
    @page { size: A4; margin: 0 }
    * { box-sizing: border-box }
    body { margin: 0; font-family: ${font}; font-size: ${fs0}px; color: #111 }
    .page { width: 794px; height: 1123px; padding: 56px 60px 70px; position: relative; page-break-after: always; overflow: hidden }
    .page .foot { position: absolute; bottom: 30px; left: 60px; right: 60px; font-size: 11px; color: #555; display: flex; justify-content: space-between }
    .cols { column-count: ${twoCol ? 2 : 1}; column-gap: 36px; column-fill: auto; height: 900px }
    .hdr { display: flex; justify-content: space-between; border-bottom: 2px solid #333; padding-bottom: 6px; margin-bottom: 10px; column-span: all }
    .info { margin: 8px 0; column-span: all } .ins { font-style: italic; margin: 6px 0 14px; column-span: all }
    .q { margin: 0 0 18px; break-inside: avoid }
    .optcol span { display: block; margin: 5px 0 0 26px } .optrow { margin: 6px 0 0 26px } .optrow span { margin-right: 40px }
    .optgrid { display: grid; grid-template-columns: 1fr 1fr; margin: 6px 0 0 26px; row-gap: 5px }
    .rule { border-bottom: 1px solid #333; height: 30px; margin: 0 0 0 20px }
    .box { border: 1.5px solid #333; height: 110px; margin: 8px 0 0 20px; border-radius: 4px }
    .dots { overflow: hidden; white-space: nowrap; letter-spacing: 3px; margin: 14px 0 0 20px; color: #333 }
    .sent { margin: 9px 0 0 20px } .cssblank { display: inline-block; width: 150px; border-bottom: 1px solid #222; height: 1em }
    .tf { display: flex; justify-content: space-between; margin: 8px 0 0 20px } .tfo { white-space: nowrap; margin-left: 20px }
    table { border-collapse: collapse; margin: 8px 0 0 20px; width: 88% } th, td { padding: 6px 10px; height: 38px; text-align: left }
    .tb th, .tb td { border: 1px solid #333 } .tn th { border-bottom: 1px solid #333 }
    .sub { margin: 8px 0 0 20px } .gap { height: 90px }`;
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${css}</style></head><body><div class="page"><div class="cols">${blocks.join('')}</div><div class="foot"><span>${th ? 'แบบฝึกหัด' : 'Worksheet'} ${no}</span><span>Page 1</span></div></div></body></html>`;
  return { html, gt, th, twoCol };
}

(async () => {
  fs.mkdirSync(OUT_PDF, { recursive: true });
  fs.mkdirSync(OUT_GT, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 794, height: 1123 } });
  for (let i = 1; i <= count; i++) {
    const { html, gt, th, twoCol } = sheet(i);
    await page.setContent(html, { waitUntil: 'load' });
    const K = 1.5; // CSS px -> app canvas px (PDF scale 2 at 72pt/in)
    const geo = await page.evaluate(() => {
      const r = el => { const b = el.getBoundingClientRect(); return [b.left, b.top, b.width, b.height]; };
      const o = { q: {}, area: {}, opt: {}, row: {}, hdr: [] };
      document.querySelectorAll('[data-q]').forEach(el => { o.q[el.dataset.q] = r(el); });
      document.querySelectorAll('[data-area]').forEach(el => { o.area[el.dataset.area] = r(el); });
      document.querySelectorAll('[data-opt]').forEach(el => { o.opt[el.dataset.opt] = r(el); });
      document.querySelectorAll('[data-cellrow]').forEach(el => { const tr = el.parentElement; o.row[el.dataset.cellrow] = { row: r(tr.children[0]), cell: r(el), text: tr.children[0].textContent, hdr: r(tr.parentElement.children[0]) }; });
      return o;
    });
    const k = v => v.map(x => Math.round(x * K));
    const questions = [];
    gt.forEach(g => {
      const q = { label: g.label, page: 1, kind: g.kind, cat: g.cat, prompt: g.prompt, answer: g.answer };
      if (geo.q[g.id]) q.qrect = k(geo.q[g.id]);
      if (g.kind === 'choice') {
        q.options = g.options.map((t, j) => ({ text: t, page: 1, rect: k(geo.opt[g.id + ':' + j]) }));
        q.correct = g.correct;
      } else if (g.kind === 'cell') {
        const R = geo.row[g.id];
        q.qrect = k(R.row);
        q.areas = [k(R.cell)];
        q.cell = { row: k(R.cell), header: k(R.hdr), col: g.col };
      } else {
        const a = geo.area[g.id];
        if (g.kind === 'blank') q.areas = [k([a[0] - 2, a[1] - 8, a[2] + 4, a[3] + 12])];
        else q.areas = [k(a)];
        if (!q.qrect) q.qrect = k(a);
      }
      questions.push(q);
    });
    const name = 'synth' + String(i).padStart(2, '0');
    await page.pdf({ path: path.join(OUT_PDF, name + '.pdf'), preferCSSPageSize: true, printBackground: true });
    fs.writeFileSync(path.join(OUT_GT, name + '.json'), JSON.stringify({ doc: 'synth/' + name + '.pdf', synthetic: true, thai: th, twoCol, questions }, null, 1));
    console.log(name, questions.length, 'questions', th ? 'thai' : '', twoCol ? 'two-column' : '');
  }
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
