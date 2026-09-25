// Scores one pipeline run against ground truth.
// detection: every printed question answered once, nothing invented.
// location: the answer sits in that question's real answer area (or on the chosen option).

const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9฀-๿]+/g, ' ').trim();
const words = s => norm(s).split(' ').filter(w => w.length > 1);
const sim = (a, b) => {
  const A = new Set(words(a)), B = words(b);
  if (!A.size || !B.length) return 0;
  return B.filter(w => A.has(w)).length / Math.max(A.size, B.length);
};
const dice = (a, b) => { const g = t => { t = norm(t).replace(/ /g, ''); const o = []; for (let i = 0; i < t.length - 1; i++) o.push(t.slice(i, i + 2)); return o; }; const A = g(a), B = g(b); if (!A.length || !B.length) return 0; const m = new Map(); A.forEach(x => m.set(x, (m.get(x) || 0) + 1)); let n = 0; B.forEach(x => { if (m.get(x) > 0) { n++; m.set(x, m.get(x) - 1); } }); return 2 * n / (A.length + B.length); };
const labelKey = s => String(s || '').replace(/[^0-9A-Za-z฀-๿]/g, '').toLowerCase();
const inter = (a, b) => Math.max(0, Math.min(a[0] + a[2], b[0] + b[2]) - Math.max(a[0], b[0])) * Math.max(0, Math.min(a[1] + a[3], b[1] + b[3]) - Math.max(a[1], b[1]));
const areaOf = r => Math.max(0, r[2]) * Math.max(0, r[3]);
const grow = (r, p) => [r[0] - p, r[1] - p, r[2] + 2 * p, r[3] + 2 * p];
const isRule = t => /^[\s_.\-–—…·]*$/.test(String(t || ''));

function matchAnswers(gt, answers) {
  // Global best-first pairing: repeated labels ("1." in Part A and Part B) must not steal each other's answers.
  const pool = answers.filter(a => !/-d\d+$/.test(String(a.id)));
  const cands = [];
  gt.questions.forEach((q, qi) => {
    const pages = [q.page, q.optionsPage].concat((q.options || []).map(o => o.page)).filter(Boolean);
    const areas = q.areas || (q.area ? [q.area] : []);
    pool.forEach((a, ai) => {
      if (pages.indexOf(a.page) < 0) return;
      const lab = labelKey(a.num) === labelKey(q.label) || (q.kind === 'cell' && dice(String(a.num).split('·')[0], q.label) > 0.75 && q.cell && dice(q.cell.col, String(a.num).split('·').pop()) > 0.5);
      const ps = sim(q.prompt, a.question);
      const geo = a.bbox && a.bbox.every(v => v != null) && areas.some(ar => inter(a.bbox, grow(ar, 14)) > 0) ? 0.5 : 0;
      const s = (lab ? 2 : 0) + ps * 3 + geo;
      if (!lab && s < 1.2) return;
      cands.push({ qi, ai, s });
    });
  });
  cands.sort((x, y) => y.s - x.s);
  const pairs = new Map(), usedQ = new Set(), usedA = new Set();
  cands.forEach(c => {
    if (usedQ.has(c.qi) || usedA.has(c.ai)) return;
    usedQ.add(c.qi); usedA.add(c.ai);
    pairs.set(gt.questions[c.qi], pool[c.ai]);
  });
  return { pairs, extra: pool.filter((a, i) => !usedA.has(i)) };
}

function coversText(bbox, page, area) {
  if (!page) return null;
  // printed ink = text cells minus underscore/dot blank runs
  for (const l of page.lines || []) {
    if (isRule(l.text)) continue;
    const segs = [];
    (l.cells && l.cells.length ? l.cells : [[l.text, l.x0, l.x1]]).forEach(([t, x0, x1]) => {
      const per = (x1 - x0) / Math.max(1, t.length);
      const re = /[^_.…·\s][^_…]*?(?=[_…]{2,}|\.{3,}|$)/g;
      let m;
      while ((m = re.exec(t))) { if (!m[0].trim()) { re.lastIndex++; continue; } segs.push([x0 + m.index * per, x0 + (m.index + m[0].length) * per]); }
    });
    for (const [a, b] of segs) {
      const sr = [a, l.top, b - a, l.bottom - l.top];
      if (area && inter(sr, area) > areaOf(sr) * 0.6) continue;
      if (inter(sr, bbox) > Math.min(areaOf(sr), areaOf(bbox)) * 0.25) return l.text;
    }
  }
  return null;
}

function locate(q, a, run) {
  const page = run.pages[(a.page || 1) - 1];
  if (q.options) {
    if (!a.mark) return { ok: false, why: 'no mark drawn (option not located)' };
    const mp = a.mark[4] || a.page;
    const picked = a.choice && a.choice.pick >= 0 ? a.choice.options[a.choice.pick] : a.text;
    let gi = -1, bs = -1;
    q.options.forEach((o, i) => { const s = sim(o.text, picked) + (norm(picked) === norm(o.text) ? 1 : 0); if (s > bs) { bs = s; gi = i; } });
    const o = q.options[gi];
    const on = o && (o.page || q.page) === mp && inter(a.mark.slice(0, 4), o.rect) > Math.min(areaOf(a.mark.slice(0, 4)), areaOf(o.rect)) * 0.4;
    return { ok: !!on, why: on ? '' : 'mark not on the picked option', correct: gi === q.correct };
  }
  if (!a.bbox || a.bbox.some(v => v == null)) return { ok: false, why: 'no position' };
  const areas = q.areas || (q.area ? [q.area] : []);
  if (!areas.length) return { ok: false, why: 'ground truth has no area' };
  const pad = q.pad != null ? q.pad : 14;
  if (a.page !== q.page) return { ok: false, why: 'written on page ' + a.page + ' instead of ' + q.page };
  let best = 0, bestArea = areas[0];
  areas.forEach(ar => { const f = inter(a.bbox, grow(ar, pad)) / Math.max(1, areaOf(a.bbox)); if (f > best) { best = f; bestArea = ar; } });
  if (best < 0.85) return { ok: false, why: 'outside its answer area (' + Math.round(best * 100) + '% inside)' };
  const pic = (q.avoid || []).find(r => inter(a.bbox, r) > Math.min(areaOf(a.bbox), areaOf(r)) * 0.1);
  if (pic) return { ok: false, why: 'written over a picture' };
  const cover = coversText(a.bbox, page, grow(bestArea, pad));
  if (cover) return { ok: false, why: 'covers printed text: "' + cover.slice(0, 40) + '"' };
  return { ok: true, why: '' };
}

function scaleGT(gt, widths) {
  if (!gt.basePage) return gt;
  const sc = p => (widths[(p || 1) - 1] || gt.basePage[0]) / gt.basePage[0];
  const R = (r, p) => (r ? r.map((v, i) => (i < 4 ? Math.round(v * sc(p)) : v)) : r);
  return { ...gt, questions: gt.questions.map(q => ({
    ...q,
    qrect: R(q.qrect, q.page), area: R(q.area, q.page), areas: q.areas && q.areas.map(a => R(a, q.page)), avoid: q.avoid && q.avoid.map(a => R(a, q.page)),
    options: q.options && q.options.map(o => ({ ...o, rect: R(o.rect, o.page || q.page) })),
    cell: q.cell && { ...q.cell, row: R(q.cell.row, q.page), header: R(q.cell.header, q.page) },
    pad: gt.scan ? 22 : q.pad,
  })) };
}

function score(gt0, run) {
  const gt = scaleGT(gt0, (run.pages || []).map(p => p.w));
  const { pairs, extra } = matchAnswers(gt, run.answers);
  const rows = gt.questions.map(q => {
    const a = pairs.get(q);
    if (!a) return { q: q.label, page: q.page, found: false, located: false, why: 'not detected' };
    const L = locate(q, a, run);
    const empty = !String(a.text || '').trim() && a.kind !== 'draw';
    return { q: q.label, page: q.page, found: true, located: L.ok && !empty, correct: L.correct, why: empty ? 'empty answer' : L.why, answerId: a.id, flag: a.flag };
  });
  const n = rows.length;
  const found = rows.filter(r => r.found).length;
  const located = rows.filter(r => r.located).length;
  const choiceRows = rows.filter(r => r.correct !== undefined);
  return {
    doc: gt.doc,
    questions: n,
    detectRecall: n ? found / n : 1,
    detectPrecision: found + extra.length ? found / (found + extra.length) : 1,
    location: n ? located / n : 1,
    choiceCorrect: choiceRows.length ? choiceRows.filter(r => r.correct).length / choiceRows.length : null,
    extra: extra.map(a => ({ id: a.id, num: a.num, page: a.page, text: String(a.text).slice(0, 40), bbox: a.bbox })),
    failures: rows.filter(r => !r.located),
    rows,
  };
}

module.exports = { score, sim, norm };
