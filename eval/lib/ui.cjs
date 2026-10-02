#!/usr/bin/env node
// Opens the REAL app page (the .dc.html with its dc-runtime and React), runs one worksheet with the
// scripted Claude, and saves screenshots of the result screen. For checking UI changes by eye.
// Usage: node lib/ui.cjs <gtName> [outDir]
const fs = require('fs');
const path = require('path');
const { EVAL, ROOT, tesseractFile } = require('./browser.cjs');

const NM = p => path.join(EVAL, 'node_modules', p);
const ROUTES = {
  'https://unpkg.com/react@18.3.1/umd/react.production.min.js': NM('react/umd/react.production.min.js'),
  'https://unpkg.com/react-dom@18.3.1/umd/react-dom.production.min.js': NM('react-dom/umd/react-dom.production.min.js'),
  'https://unpkg.com/@babel/standalone@7.29.0/babel.min.js': NM('@babel/standalone/babel.min.js'),
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js': NM('pdfjs-dist/build/pdf.min.js'),
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js': NM('pdfjs-dist/build/pdf.worker.min.js'),
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js': NM('jspdf/dist/jspdf.umd.min.js'),
  'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js': NM('tesseract.js/dist/tesseract.min.js'),
  'https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js': NM('jszip/dist/jszip.min.js'),
  'https://cdn.jsdelivr.net/npm/docx-preview@0.3.2/dist/docx-preview.min.js': NM('docx-preview/dist/docx-preview.min.js'),
  'https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js': NM('html2canvas/dist/html2canvas.min.js'),
};

async function main() {
  const name = process.argv[2] || 'scan_polygraph';
  const outDir = process.argv[3] || path.join(EVAL, 'out', 'ui');
  fs.mkdirSync(outDir, { recursive: true });
  const gt = JSON.parse(fs.readFileSync(path.join(EVAL, 'fixtures', 'gt', name + '.json'), 'utf8'));
  // Expose the component instance so the test can drive it (class field runs in the constructor).
  const html = fs.readFileSync(path.join(ROOT, 'app', 'Archive Portal v4.dc.html'), 'utf8')
    .replace(/class Component extends DCLogic \{/, 'class Component extends DCLogic {\n  __uiExpose = (window.__comp = this, window.__C = this.constructor, 0);')
    .replace('<script src="./support.js"></script>', '<script src="./support.js"></script><script src="/lib/oracle.js"></script>');
  const { chromium } = require(path.join(require('child_process').execSync('npm root -g').toString().trim(), 'playwright'));
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.route('**/*', route => {
    const url = route.request().url();
    if (ROUTES[url]) return route.fulfill({ body: fs.readFileSync(ROUTES[url]), contentType: 'application/javascript' });
    const tf = tesseractFile(url);
    if (tf && fs.existsSync(tf)) return route.fulfill({ body: fs.readFileSync(tf), contentType: tf.endsWith('.wasm') ? 'application/wasm' : tf.endsWith('.js') ? 'application/javascript' : 'application/octet-stream', headers: { 'access-control-allow-origin': '*' } });
    if (url.startsWith('http://eval.local/')) {
      const rel = decodeURIComponent(url.slice('http://eval.local/'.length).split('?')[0]);
      if (rel === 'app/index.html') return route.fulfill({ body: html, contentType: 'text/html' });
      if (rel === 'app/support.js') return route.fulfill({ body: fs.readFileSync(path.join(ROOT, 'app', 'support.js')), contentType: 'application/javascript' });
      if (rel.startsWith('app/assets/') && fs.existsSync(path.join(ROOT, rel))) return route.fulfill({ body: fs.readFileSync(path.join(ROOT, rel)) });
      const file = rel.startsWith('lib/') ? path.join(EVAL, rel) : path.join(EVAL, 'fixtures', rel);
      if (fs.existsSync(file)) return route.fulfill({ body: fs.readFileSync(file) });
      return route.fulfill({ status: 404, body: 'missing' });
    }
    return route.abort();
  });
  // UI_SET='{"choicemark":"Cross"}' applies settings; UI_PAGES=2,5,6 saves those result pages as images.
  if (process.env.UI_SET) await page.addInitScript(v => { window.__uiSet = JSON.parse(v); }, process.env.UI_SET);
  await page.goto('http://eval.local/app/index.html');
  await page.waitForFunction(() => !!window.__comp, null, { timeout: 60000 });
  await page.evaluate(async ({ gt }) => {
    const comp = window.__comp;
    const oracle = __makeOracle(gt, {}, comp);
    window.claude = { complete: body => oracle.complete(body, __stageOf(body.system)) };
    comp.toast = () => {};
    const docs = Array.isArray(gt.doc) ? gt.doc : [gt.doc];
    const files = [];
    for (const [i, d] of docs.entries()) {
      const blob = await (await fetch('/' + d)).blob();
      const file = new File([blob], d.split('/').pop(), { type: blob.type });
      files.push({ id: String(i + 1), name: file.name, size: file.size, type: file.type, raw: file, pct: 100, state: 'done' });
    }
    comp.setState({ email: 'eval@local', screen: 'vault', ocr: 'Built-in', files, ...(window.__uiSet || {}) });
    await new Promise(r => setTimeout(r, 300));
    await comp.runPipeline();
  }, { gt });
  await page.waitForFunction(() => window.__comp.state.screen === 'result', null, { timeout: 300000 });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(outDir, name + '-top.png') });
  for (const pn of String(process.env.UI_PAGES || '').split(',').filter(Boolean)) {
    const el = await page.$('[data-page="' + pn + '"]');
    if (!el) continue;
    await el.scrollIntoViewIfNeeded();
    await page.waitForTimeout(600);
    await el.screenshot({ path: path.join(outDir, name + '-p' + pn + '.png') });
  }
  const flagged = await page.evaluate(() => (window.__comp.auditNow ? window.__comp.auditNow() : []).map(f => f.page));
  if (flagged.length) {
    await page.evaluate(p => { const el = document.querySelector('[data-page="' + p + '"]'); if (el) el.scrollIntoView({ block: 'center' }); }, flagged[0]);
    await page.waitForTimeout(800);
    await page.screenshot({ path: path.join(outDir, name + '-flag.png') });
  }
  console.log(name, '| flags', flagged.length, '| page errors', errors.length ? errors.slice(0, 3) : 'none', '| shots in', path.relative(EVAL, outDir));
  await browser.close();
}
main().catch(e => { console.error(e); process.exit(1); });
