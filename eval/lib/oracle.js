// In-page "perfect Claude": answers each pipeline prompt from ground truth, so any
// remaining error in a run is caused by the app's own code, not by the model.
(function () {
  const STAGES = {
    TEXT_LAYOUT_PROMPT: 'layout_text', LAYOUT_PROMPT: 'layout_vision', MAP_PROMPT: 'map', SOLVE_PROMPT: 'solve',
    CHECK_PROMPT: 'check', FINAL_PROMPT: 'final', FACTS_PROMPT: 'facts', ASSIGN_PROMPT: 'assign', FIT_PROMPT: 'fit',
    PIN_PROMPT: 'pin', VERIFY_PROMPT: 'verify', KEY_PROMPT: 'key',
  };
  window.__stageOf = sys => {
    for (const k in STAGES) if (__C[k] && sys === __C[k]) return STAGES[k];
    for (const k in STAGES) if (__C[k] && String(sys || '').slice(0, 60) === String(__C[k]).slice(0, 60)) return STAGES[k];
    return 'other';
  };

  const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9฀-๿]+/g, ' ').trim();
  const words = s => norm(s).split(' ').filter(w => w.length > 1);
  const sim = (a, b) => {
    const A = new Set(words(a)), B = words(b);
    if (!A.size || !B.length) return 0;
    return B.filter(w => A.has(w)).length / Math.max(A.size, B.length);
  };
  const labelKey = s => String(s || '').replace(/[^0-9A-Za-z฀-๿]/g, '').toLowerCase();

  function textOf(content) {
    if (typeof content === 'string') return content;
    return (content || []).filter(b => b.type === 'text').map(b => b.text).join('\n');
  }
  function jsonIn(text) {
    const a = text.indexOf('{'), b = text.lastIndexOf('}');
    return JSON.parse(text.slice(a, b + 1));
  }

  window.__scaleGT = function (gt, widths) {
    if (!gt.basePage) return gt;
    const sc = p => (widths[(p || 1) - 1] || gt.basePage[0]) / gt.basePage[0];
    const R = (r, p) => (r ? r.map((v, i) => (i < 4 ? Math.round(v * sc(p)) : v)) : r);
    return { ...gt, questions: gt.questions.map(q => ({
      ...q,
      qrect: R(q.qrect, q.page), area: R(q.area, q.page), areas: q.areas && q.areas.map(a => R(a, q.page)), avoid: q.avoid && q.avoid.map(a => R(a, q.page)),
      options: q.options && q.options.map(o => ({ ...o, rect: R(o.rect, o.page || q.page) })),
      cell: q.cell && { ...q.cell, row: R(q.cell.row, q.page), header: R(q.cell.header, q.page) },
    })) };
  };

  window.__makeOracle = function (gt, cfg, comp) {
    cfg = cfg || {};
    let Q0 = gt.questions.map(q => (q.area || !q.areas ? q : { ...q, area: q.areas[0] }));
    let scaled = !gt.basePage;
    const Qs = () => {
      if (!scaled && comp.state.pages && comp.state.pages.length) { Q0 = __scaleGT({ ...gt, questions: Q0 }, comp.state.pages.map(p => p.canvas.width)).questions; scaled = true; }
      return Q0;
    };
    const pages = () => comp.state.pages || [];

    function matchQ(label, prompt, page) {
      const cm = /Row: (.+?) — Column: (.+)$/.exec(String(prompt || ''));
      if (cm) {
        const cells = Qs().filter(q => q.kind === 'cell' && norm(q.label) === norm(cm[1]));
        if (cells.length) return cells.reduce((b, q) => (sim(q.cell.col, cm[2]) + sim(cm[2], q.cell.col) > sim(b.cell.col, cm[2]) + sim(cm[2], b.cell.col) ? q : b));
      }
      let best = null, bs = -1;
      Qs().forEach(q => {
        if (page && q.page !== page && !(q.optionsPage && q.optionsPage === page)) return;
        const lab = labelKey(label) && labelKey(label) === labelKey(q.label) ? 1 : 0;
        const s = lab * 2 + sim(q.prompt, prompt) * 3;
        if (s > bs) { bs = s; best = q; }
      });
      return best;
    }

    const cy = l => (l.top + l.bottom) / 2;
    const inRect = (l, r, pad) => { pad = pad || 0; return cy(l) >= r[1] - pad && cy(l) <= r[1] + r[3] + pad && l.x1 > r[0] && l.x0 < r[0] + r[2]; };
    const isRule = t => /^[\s_.\-–—…·]*$/.test(String(t || ''));
    const lineRef = (pg, l) => 'p' + pg + '-l' + l.id;

    function nextLine(q) {
      const P = pages()[q.page - 1];
      if (!P) return null;
      const end = q.options && q.options.length ? q.options[q.options.length - 1] : null;
      const endPage = end ? (end.page || q.page) : q.page;
      if (endPage !== q.page) return null;
      const r = end ? end.rect : (q.area || q.qrect);
      const bottom = r[1] + r[3];
      const colX0 = Math.min(q.qrect ? q.qrect[0] : r[0], r[0]), colX1 = Math.max(q.qrect ? q.qrect[0] + q.qrect[2] : r[0] + r[2], r[0] + r[2]);
      const cands = P.lines.filter(l => cy(l) > bottom - 2 && !isRule(l.text) && l.x1 > colX0 && l.x0 < colX1).sort((a, b) => a.top - b.top);
      return cands.length ? lineRef(q.page, cands[0]) : null;
    }

    let seed = (cfg.seed || 1) * 2654435761 % 4294967296;
    const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
    const NOISE = ['firstLine', 'noNext', 'kindSwap', 'labelFmt', 'drop', 'optText', 'noOpts', 'catWrong', 'shortPrompt'];
    const noisy = [];
    window.__noiseLog = noisy;

    function perturb(e, q, P, focused) {
      if (!cfg.noise || rnd() >= cfg.noise) return e;
      const kinds = NOISE.filter(k => ((k !== 'optText' && k !== 'noOpts') || e.options) && !(focused && k === 'drop'));
      const k = kinds[Math.floor(rnd() * kinds.length)];
      noisy.push(q.label + '@' + q.page + ':' + k);
      if (k === 'drop') return null;
      if (k === 'firstLine' && q.qrect) { const f = P.lines.find(l => inRect(l, q.qrect, 2) && !isRule(l.text)); if (f) e.line = lineRef(q.page, f); }
      if (k === 'noNext') e.next = null;
      if (k === 'kindSwap') e.kind = e.kind === 'blank' ? 'box' : e.kind === 'box' ? 'blank' : e.kind;
      if (k === 'labelFmt') e.label = String(e.label).replace(/[.)]$/, '').replace(/^(\d+)$/, m => (rnd() < 0.5 ? 'Q' + m : m + ')'));
      if (k === 'optText') e.options = e.options.map(o => ({ ...o, text: o.text.replace(/^\(?[A-Da-dก-ง][).]\s*/, '') }));
      if (k === 'noOpts') { delete e.options; e.kind = 'blank'; e.cat = 'SHORT_TEXT'; }
      if (k === 'catWrong') e.cat = ['SHORT_TEXT', 'LONG_TEXT', 'FILL_BLANK', 'OTHER'][Math.floor(rnd() * 4)];
      if (k === 'shortPrompt') e.prompt = String(e.prompt).split(' ').slice(0, 4).join(' ');
      return e;
    }

    function fakes() {
      if (!cfg.noise) return [];
      const out = [];
      pages().forEach((P, i) => P.lines.forEach(l => {
        if (/^(student\s*)?name|^instructions?\b|^directions?\b|^ชื่อ/i.test(l.text) && rnd() < cfg.noise * 2) {
          out.push({ line: lineRef(i + 1, l), next: null, label: '', prompt: l.text.slice(0, 60), kind: 'blank', cat: 'SHORT_TEXT' });
          noisy.push('fake@' + (i + 1) + ':' + l.text.slice(0, 20));
        }
      }));
      return out;
    }

    function layoutText(body) {
      const txt = textOf(body.messages[0].content);
      const fm = /FOCUS: ([^\n]*?) look like/.exec(txt);
      const focus = fm ? fm[1].split(',').map(x => x.trim()) : null;
      const out = focus ? [] : fakes();
      const shown = new Set((txt.match(/=== PAGE (\d+) ===/g) || []).map(m => Number(m.match(/\d+/)[0])));
      Qs().forEach(q => {
        const P = pages()[q.page - 1];
        if (!P) return;
        if (shown.size && !shown.has(q.page)) return;
        if (focus) {
          // a question "owns" the lines from the end of the previous question on its page down to its own answer area
          const prev = Qs().filter(o => o.page === q.page && o !== q && o.qrect && q.qrect && o.qrect[1] < q.qrect[1]).map(o => { const r = o.area || o.qrect; return r[1] + r[3]; });
          const from = prev.length ? Math.max.apply(null, prev) : 0;
          const r = q.area || q.qrect;
          const to = r ? r[1] + r[3] : (q.qrect ? q.qrect[1] + q.qrect[3] : 0);
          const refs = P.lines.filter(l => ((q.qrect && inRect(l, q.qrect, 2)) || (q.area && inRect(l, q.area, 2)) || (cy(l) > from && cy(l) < to && q.qrect && cy(l) < q.qrect[1] + q.qrect[3] + 2))).map(l => lineRef(q.page, l));
          if (!refs.some(x => focus.indexOf(x) >= 0)) return;
        }
        const qls = q.qrect ? P.lines.filter(l => inRect(l, q.qrect, 2) && !isRule(l.text)) : [];
        let L = qls[qls.length - 1];
        if (q.kind === 'blank' || q.kind === 'cell') {
          const r = q.cell ? q.cell.row : q.area;
          const on = P.lines.filter(l => cy(l) >= r[1] - 4 && cy(l) <= r[1] + r[3] + 4 && l.x1 > r[0] - 40 && l.x0 < r[0] + r[2] + 40).sort((a, b) => Math.abs(cy(a) - (r[1] + r[3] / 2)) - Math.abs(cy(b) - (r[1] + r[3] / 2)));
          if (on.length) L = on[0];
        }
        if (!L) return;
        const e = { line: lineRef(q.page, L), next: nextLine(q), label: q.label, prompt: q.prompt, kind: q.kind === 'write' ? 'box' : q.kind, cat: q.cat };
        if (q.kind === 'cell' && q.cell) {
          const H = P.lines.filter(l => inRect(l, q.cell.header, 2))[0];
          if (H) { e.header = lineRef(q.page, H); e.col = q.cell.col; }
        }
        if (q.options) {
          e.options = q.options.map(o => {
            const OP = pages()[(o.page || q.page) - 1];
            const ol = OP ? OP.lines.find(l => inRect(l, o.rect, 2)) : null;
            return ol ? { line: lineRef(o.page || q.page, ol), text: o.text } : null;
          }).filter(Boolean);
        }
        const pe = perturb(e, q, P, !!focus);
        if (pe) out.push(pe);
      });
      return { questions: out };
    }

    const pct = (r, P) => ({ x: +(r[0] / P.canvas.width * 100).toFixed(2), y: +(r[1] / P.canvas.height * 100).toFixed(2), w: +(r[2] / P.canvas.width * 100).toFixed(2), h: +(r[3] / P.canvas.height * 100).toFixed(2) });

    function imagePages(body) {
      const imgs = [];
      (body.messages || []).forEach(m => (Array.isArray(m.content) ? m.content : []).forEach(b => { if (b.type === 'image') imgs.push(b.source.data); }));
      return imgs.map(d => pages().findIndex(p => p.apiUrl && p.apiUrl.split(',')[1] === d) + 1);
    }

    function layoutVision(body) {
      const set = imagePages(body);
      const focus = /FOCUS: questions numbered ([\d, ]+)/.exec(textOf(body.messages[0].content));
      const want = focus ? focus[1].split(',').map(s => Number(s.trim())) : null;
      const out = [];
      Qs().forEach(q => {
        const k = set.indexOf(q.page);
        if (k < 0) return;
        if (want && want.indexOf(parseInt(q.label, 10)) < 0) return;
        const P = pages()[q.page - 1];
        const e = { label: q.label, prompt: q.prompt, page: k + 1, kind: q.kind === 'write' || q.kind === 'cell' ? (q.kind === 'cell' ? 'box' : 'box') : q.kind, cat: q.cat, box: pct(q.area || q.options[q.correct].rect, P) };
        if (q.options) e.options = q.options.map(o => ({ label: o.text, box: pct(o.rect, pages()[(o.page || q.page) - 1]), page: set.indexOf(o.page || q.page) + 1 }));
        out.push(e);
      });
      return { questions: out };
    }

    function filler(n, q) {
      if (q && q.answer) return q.answer;
      const base = 'Because the force acts over a longer distance the result becomes larger and this matches the data in the table above';
      let s = '';
      while (s.length < n) s += (s ? ' ' : '') + base;
      return s.slice(0, Math.max(3, n)).replace(/\s+\S*$/, '') || 'yes';
    }

    function solve(body) {
      const req = jsonIn(textOf(body.messages[0].content));
      const answers = (req.questions || []).map(x => {
        const q = matchQ(x.label, x.prompt);
        const a = { id: x.id, label: x.label, confidence: 'high', keywords: ['key idea', 'term'] };
        if (/FORMULA|NUMERIC/.test(String(x.cat || ''))) { a.work = 'v = d / t = 120 / 2 = 60, check units km/h, then multiply by time'; a.calc = '120/2'; }
        if (Array.isArray(x.options)) {
          let k = 0;
          if (q && q.options) {
            const want = q.options[q.correct].text;
            let bs = -1;
            x.options.forEach((o, i) => { const s = sim(String(o).replace(/^\d+\)\s*/, ''), want) + (norm(o).indexOf(norm(want)) >= 0 ? 1 : 0); if (s > bs) { bs = s; k = i; } });
          }
          a.option = k + 1;
          a.answer = String(x.options[k]).replace(/^\d+\)\s*/, '');
        } else {
          const room = x.targetChars || Math.min(x.maxChars || 40, (q && q.answerChars) || 40);
          a.answer = filler(q && q.answer ? q.answer.length : room, q);
          if (x.cat === 'DRAWING' || x.cat === 'GRAPH_PLOT' || x.cat === 'LABEL_DIAGRAM') a.shapes = [{ t: 'rect', p: [[20, 20], [80, 80]] }];
          if (x.cat === 'TABLE_TICK') a.answer = '✓';
        }
        return a;
      });
      return { answers };
    }

    function map(body) {
      const req = jsonIn(textOf(body.messages[0].content));
      const img = imagePages(body);
      return {
        map: (req.questions || []).map(x => {
          const q = matchQ(x.label, x.question);
          const m = { id: x.id, cat: (q && q.cat) || x.cat, spaces: [] };
          if (cfg.mapBoxes && q && q.area) {
            const P = pages()[q.page - 1];
            if (P) m.box = pct(q.area, P);
          }
          return m;
        }),
      };
    }

    function fit(body) {
      const req = jsonIn(textOf(body.messages[0].content));
      return { answers: (req.answers || []).map(a => ({ id: a.id, answer: String(a.answer).length > a.maxChars ? String(a.answer).slice(0, a.maxChars).replace(/\s+\S*$/, '') : String(a.answer) })) };
    }

    return {
      complete: async (body, stage) => {
        let r;
        if (stage === 'layout_text') r = layoutText(body);
        else if (stage === 'layout_vision') r = layoutVision(body);
        else if (stage === 'solve') r = solve(body);
        else if (stage === 'map') r = map(body);
        else if (stage === 'fit') r = fit(body);
        else if (stage === 'facts') r = { facts: [], deps: [] };
        else if (stage === 'assign') r = { assign: [] };
        else if (stage === 'pin') r = { question_box: 0, answer_box: 0 };
        else r = { fixes: [] };
        return JSON.stringify(r);
      },
    };
  };
})();
