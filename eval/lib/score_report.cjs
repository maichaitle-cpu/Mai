#!/usr/bin/env node
// Scores a debug report downloaded from the app (e.g. a Claude Design run on your own plan) against ground truth.
// Usage: node lib/score_report.cjs debug-report.json [gtName] [--answers]
const fs = require('fs');
const path = require('path');
const { score, norm } = require('./score.cjs');

const EVAL = path.resolve(__dirname, '..');
const args = process.argv.slice(2).filter(a => !a.startsWith('--'));
const showAnswers = process.argv.includes('--answers');
const rep = JSON.parse(fs.readFileSync(args[0], 'utf8'));

const ALIASES = [
  [/physics/i, 'physics'], [/polygraph|polynomial/i, 'polygraph'], [/exam.?topics|revision/i, 'exam_revision'],
  [/phe|2610602/i, 'phe'], [/ice.?cream/i, 'icecream'], [/synth(\d+)/i, m => 'synth' + m[1].padStart(2, '0')],
];
function gtName() {
  if (args[1]) return args[1];
  const f = String((rep.files || [])[0] || '');
  const img = /\.(jpe?g|png|webp|heic)$/i.test(f);
  for (const [re, name] of ALIASES) { const m = f.match(re); if (m) { const n = typeof name === 'function' ? name(m) : name; return img && fs.existsSync(path.join(EVAL, 'fixtures', 'gt', 'scan_' + n + '.json')) ? 'scan_' + n : n; } }
  throw new Error('Cannot tell which worksheet "' + f + '" is. Pass the ground-truth name as the 2nd argument.');
}

const name = gtName();
const gt = JSON.parse(fs.readFileSync(path.join(EVAL, 'fixtures', 'gt', name + '.json'), 'utf8'));
const run = {
  pages: (rep.pages || []).map(p => ({ page: p.page, w: p.w, h: p.h, lines: p.geo || (p.lines || []).map(l => ({ id: l[0], top: l[1], bottom: l[2] + 4, x0: 0, x1: 0, text: l[3] })) })),
  answers: (rep.answers || []).map(a => ({ id: a.id, num: a.num, page: a.page, kind: a.kind, question: a.question || '', text: a.fullText || a.text || '', bbox: a.bbox, mark: a.mark || null, choice: a.choice || null, flag: a.flag })),
};
if (!(rep.pages || []).some(p => p.geo)) console.log('Note: this report is from an older app version (no line geometry); "covers printed text" checks are skipped.');
const s = score(gt, run);
const pc = v => (v == null ? '-' : (v * 100).toFixed(1) + '%');
console.log(name, '| questions', s.questions, '| found', pc(s.detectRecall), '| invented', s.extra.length, '| location', pc(s.location), '| choice correct', pc(s.choiceCorrect));
console.log('run mode:', rep.mode || '?', '| model asked:', rep.model || '?', '| pages:', run.pages.length);

const calls = rep.calls || [];
if (calls.length) {
  const PRICES = { 'claude-sonnet-5': [2, 10], 'claude-sonnet-4-5': [3, 15], 'claude-haiku-4-5': [1, 5] };
  const by = {};
  let total = 0;
  calls.forEach(c => {
    const inTok = c.usage ? (c.usage.input_tokens || 0) : Math.round(c.inChars / 3.6) + c.images * 1500;
    const outTok = c.usage ? (c.usage.output_tokens || 0) : Math.round(String(c.response || '').length / 3.4);
    const pr = PRICES[c.model] || PRICES['claude-sonnet-4-5'];
    const cost = (inTok * pr[0] + outTok * pr[1]) / 1e6;
    total += cost;
    const k = c.stage.replace(/_PROMPT$/, '').toLowerCase();
    by[k] = by[k] || { n: 0, cost: 0 }; by[k].n++; by[k].cost += cost;
  });
  console.log('Claude calls:', calls.length, '| estimated API-equivalent cost $' + total.toFixed(3), '($' + (total / Math.max(1, run.pages.length)).toFixed(4) + '/page, before thinking tokens)');
  Object.entries(by).sort((a, b) => b[1].cost - a[1].cost).forEach(([k, v]) => console.log('   ' + k.padEnd(12), String(v.n).padStart(3), 'calls  $' + v.cost.toFixed(4)));
}

s.failures.forEach(f => console.log('  MISS p' + f.page, String(f.q).slice(0, 30).padEnd(30), f.why));
s.extra.forEach(e => console.log('  INVENTED p' + e.page, String(e.num).slice(0, 30), JSON.stringify(e.text)));
if (showAnswers) {
  console.log('\n--- answers vs key (text answers need a human or Claude to judge) ---');
  s.rows.forEach(r => {
    const q = gt.questions.find(g => g.label === r.q && g.page === r.page);
    const a = run.answers.find(x => x.id === r.answerId);
    const key = q && q.options ? q.options[q.correct].text : q && q.answer;
    console.log('p' + r.page, String(r.q).slice(0, 20).padEnd(20), r.correct === false ? 'WRONG' : r.correct ? 'ok   ' : '     ', '|', JSON.stringify(a ? a.text.slice(0, 90) : null), '| key:', JSON.stringify(key || ''));
  });
}
fs.writeFileSync(path.join(path.dirname(path.resolve(args[0])), path.basename(args[0], '.json') + '.score.json'), JSON.stringify({ gt: name, ...s }, null, 1));
