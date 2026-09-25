// Loads the real app script into headless Chromium with CDN libraries served from node_modules.
const fs = require('fs');
const path = require('path');

const EVAL = path.resolve(__dirname, '..');
const ROOT = path.resolve(EVAL, '..');
const APP_FILE = process.env.APP_FILE || path.join(ROOT, 'app', 'Archive Portal v3.dc.html');

function loadPlaywright() {
  try { return require('playwright'); } catch (e) {}
  const { execSync } = require('child_process');
  const root = execSync('npm root -g').toString().trim();
  return require(path.join(root, 'playwright'));
}

function appScript(file = APP_FILE) {
  const html = fs.readFileSync(file, 'utf8');
  const m = html.match(/<script type="text\/x-dc"[^>]*>([\s\S]*?)<\/script>/);
  if (!m) throw new Error('No x-dc script found in ' + file);
  return m[1];
}

const NM = p => path.join(EVAL, 'node_modules', p);
const CDN = {
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js': NM('pdfjs-dist/build/pdf.min.js'),
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js': NM('pdfjs-dist/build/pdf.worker.min.js'),
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js': NM('jspdf/dist/jspdf.umd.min.js'),
  'https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js': NM('jszip/dist/jszip.min.js'),
  'https://cdn.jsdelivr.net/npm/docx-preview@0.3.2/dist/docx-preview.min.js': NM('docx-preview/dist/docx-preview.min.js'),
  'https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js': NM('html2canvas/dist/html2canvas.min.js'),
  'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js': NM('tesseract.js/dist/tesseract.min.js'),
};

// Tesseract loads its worker, wasm core and language data from CDNs; serve them from node_modules.
function tesseractFile(url) {
  let m;
  if ((m = url.match(/npm\/tesseract\.js@[^/]+\/dist\/([^?]+)/))) return NM('tesseract.js/dist/' + m[1]);
  if ((m = url.match(/npm\/tesseract\.js-core@[^/]+\/([^?]+)/))) return NM('tesseract.js-core/' + m[1]);
  if ((m = url.match(/@tesseract\.js-data\/([^?]+)/))) return NM('@tesseract.js-data/' + m[1]);
  if ((m = url.match(/tessdata[^/]*\/(?:[^/]+\/)*([a-z_]+)\.traineddata(\.gz)?/))) return NM('@tesseract.js-data/' + m[1] + '/4.0.0_best_int/' + m[1] + '.traineddata.gz');
  return null;
}

const TYPES = { '.js': 'application/javascript', '.html': 'text/html', '.pdf': 'application/pdf', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' };

async function openApp({ onClaude, log = () => {} } = {}) {
  const { chromium } = loadPlaywright();
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  page.on('pageerror', e => log('[pageerror] ' + e.message));
  page.on('console', m => { if (m.type() === 'error') log('[console] ' + m.text()); });
  const script = appScript();
  await context.route('**/*', route => {
    const url = route.request().url();
    if (CDN[url]) return route.fulfill({ body: fs.readFileSync(CDN[url]), contentType: 'application/javascript' });
    const tf = tesseractFile(url);
    if (tf && fs.existsSync(tf)) return route.fulfill({ body: fs.readFileSync(tf), contentType: tf.endsWith('.wasm') ? 'application/wasm' : tf.endsWith('.js') ? 'application/javascript' : 'application/octet-stream', headers: { 'access-control-allow-origin': '*' } });
    if (tf) console.error('[tesseract] missing', url);
    if (url.startsWith('http://eval.local/')) {
      const rel = decodeURIComponent(url.slice('http://eval.local/'.length).split('?')[0]);
      if (rel === 'app.js') return route.fulfill({ body: script, contentType: 'application/javascript' });
      const file = rel.startsWith('lib/') ? path.join(EVAL, rel) : path.join(EVAL, 'fixtures', rel);
      if (fs.existsSync(file)) return route.fulfill({ body: fs.readFileSync(file), contentType: TYPES[path.extname(file)] || 'application/octet-stream' });
      return route.fulfill({ status: 404, body: 'missing ' + rel });
    }
    return route.abort();
  });
  if (onClaude) await page.exposeFunction('__claudeNode', async body => JSON.stringify(await onClaude(JSON.parse(body))));
  await page.goto('http://eval.local/lib/harness.html');
  await page.waitForFunction(() => window.__ready === true);
  return { browser, page };
}

module.exports = { openApp, appScript, EVAL, ROOT };
