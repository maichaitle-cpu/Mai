#!/usr/bin/env node
// Usage: node lib/eval.cjs [--docs physics,polygraph] [--mode oracle|live] [--map-boxes] [--snap] [--tag name]
const fs = require('fs');
const path = require('path');
const { openApp, EVAL } = require('./browser.cjs');
const { score } = require('./score.cjs');

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf('--' + k); return i < 0 ? d : (args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : true); };

async function main() {
  const gtDir = path.join(EVAL, 'fixtures', 'gt');
  const all = fs.readdirSync(gtDir).filter(f => f.endsWith('.json')).map(f => f.replace(/\.json$/, ''));
  const docs = opt('docs') ? String(opt('docs')).split(',') : all;
  const mode = opt('mode', 'oracle');
  const tag = opt('tag', new Date().toISOString().replace(/[:.]/g, '-'));
  const outDir = path.join(EVAL, 'out', tag);
  fs.mkdirSync(outDir, { recursive: true });
  let onClaude = null;
  if (mode === 'live') onClaude = require('./live.cjs').makeLive({ cacheDir: path.join(EVAL, '.cache') });
  const logs = [];
  const { browser, page } = await openApp({ onClaude, log: m => logs.push(m) });
  const results = [];
  for (const name of docs) {
    const gt = JSON.parse(fs.readFileSync(path.join(gtDir, name + '.json'), 'utf8'));
    const t0 = Date.now();
    let run;
    try {
      run = await page.evaluate(o => window.__runDoc(o), {
        doc: gt.doc, gt, claude: mode, snapshots: !!opt('snap'),
        oracleCfg: { mapBoxes: !!opt('map-boxes'), noise: Number(opt('noise', 0)), seed: Number(opt('seed', 1)), verbose: !!opt('verbose') }, settings: gt.settings || {},
      });
    } catch (e) {
      run = { apiError: 'harness: ' + e.message, answers: [], pages: [], calls: [] };
    }
    const s = score(gt, run);
    s.apiError = run.apiError; s.mode = run.mode; s.ms = Date.now() - t0;
    s.calls = run.calls.reduce((m, c) => { m[c.stage] = (m[c.stage] || 0) + 1; return m; }, {});
    s.cost = run.calls.reduce((m, c) => m + (c.cost || 0), 0);
    s.est = run.calls.reduce((m, c) => m + (c.est || 0), 0);
    s.byStage = run.calls.reduce((m, c) => { const k = c.stage; m[k] = m[k] || { n: 0, est: 0, img: 0 }; m[k].n++; m[k].est += c.est || 0; m[k].img += c.images || 0; return m; }, {});
    s.pages = run.pages.length;
    s.noise = run.noise || [];
    if (run.shots) run.shots.forEach((d, i) => fs.writeFileSync(path.join(outDir, name + '-p' + (i + 1) + '.jpg'), Buffer.from(d.split(',')[1], 'base64')));
    delete run.shots;
    fs.writeFileSync(path.join(outDir, name + '.run.json'), JSON.stringify(run, null, 1));
    fs.writeFileSync(path.join(outDir, name + '.score.json'), JSON.stringify(s, null, 1));
    results.push(s);
    const pc = v => (v == null ? '  -  ' : (v * 100).toFixed(1).padStart(5) + '%');
    console.log(name.padEnd(22), 'Q', String(s.questions).padStart(3), '| found', pc(s.detectRecall), '| precision', pc(s.detectPrecision), '| location', pc(s.location), '| choice', pc(s.choiceCorrect), s.apiError ? '| ERROR ' + s.apiError.slice(0, 80) : '', mode === 'live' ? '| $' + s.cost.toFixed(4) + ' (' + (s.cost / Math.max(1, s.pages)).toFixed(4) + '/page)' : '| est $' + (s.est / Math.max(1, s.pages)).toFixed(4) + '/page');
  }
  const tot = k => { const n = results.reduce((m, s) => m + s.questions, 0); return results.reduce((m, s) => m + (s[k] == null ? 0 : s[k] * s.questions), 0) / Math.max(1, n); };
  const extra = results.reduce((m, s) => m + s.extra.length, 0);
  console.log('-'.repeat(100));
  const pagesAll = results.reduce((m, s) => m + (s.pages || 0), 0), estAll = results.reduce((m, s) => m + (s.est || 0), 0);
  const stages = {};
  results.forEach(s => Object.entries(s.byStage || {}).forEach(([k, v]) => { stages[k] = stages[k] || { n: 0, est: 0, img: 0 }; stages[k].n += v.n; stages[k].est += v.est; stages[k].img += v.img; }));
  console.log('ALL'.padEnd(22), 'Q', String(results.reduce((m, s) => m + s.questions, 0)).padStart(3), '| found', (tot('detectRecall') * 100).toFixed(1) + '%', '| invented', extra, '| location', (tot('location') * 100).toFixed(1) + '%', '| est $' + (estAll / Math.max(1, pagesAll)).toFixed(4) + '/page over ' + pagesAll + ' pages');
  if (opt('cost')) Object.entries(stages).sort((a, b) => b[1].est - a[1].est).forEach(([k, v]) => console.log('   ' + k.padEnd(14), 'calls/page', (v.n / pagesAll).toFixed(2), 'images/page', (v.img / pagesAll).toFixed(2), '$/page', (v.est / pagesAll).toFixed(4)));
  fs.writeFileSync(path.join(outDir, 'summary.json'), JSON.stringify({ mode, results: results.map(s => ({ ...s, rows: undefined })) }, null, 1));
  if (logs.length) fs.writeFileSync(path.join(outDir, 'browser.log'), logs.join('\n'));
  console.log('out:', path.relative(process.cwd(), outDir), logs.length ? '(' + logs.length + ' browser log lines)' : '');
  await browser.close();
}

main().catch(e => { console.error(e); process.exit(1); });
