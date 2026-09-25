// In-page driver: runs the app's real runPipeline() on one document and returns what it produced.
window.__runDoc = async function (opts) {
  const { doc, settings, gt, claude, oracleCfg, snapshots } = opts;
  const calls = [];
  const comp = new __C();
  comp.toast = () => {};
  const oracle = gt ? __makeOracle(gt, oracleCfg || {}, comp) : null;
  const PRICE = { 'claude-sonnet-4-5': [3, 15], 'claude-sonnet-4-6': [3, 15], 'claude-sonnet-5': [2, 10], 'claude-haiku-4-5': [1, 5], 'claude-opus-5': [5, 25] };
  const imgTokens = b64 => new Promise(res => { const im = new Image(); im.onload = () => res(Math.min(1600, Math.ceil(im.naturalWidth * im.naturalHeight / 750))); im.onerror = () => res(1500); im.src = 'data:image/jpeg;base64,' + b64; });
  const estimate = async (body, out) => {
    let txt = String(body.system || '').length, img = 0;
    for (const m of body.messages || []) {
      if (typeof m.content === 'string') { txt += m.content.length; continue; }
      for (const b of m.content || []) { if (b.type === 'text') txt += b.text.length; else if (b.type === 'image') img += await imgTokens(b.source.data); }
    }
    const inTok = Math.round(txt / 3.6) + img, outTok = Math.round(String(out || '').length / 3.4);
    const pr = PRICE[body.model] || PRICE['claude-sonnet-4-5'];
    return { inTok, outTok, imgTok: img, est: (inTok * pr[0] + outTok * pr[1]) / 1e6 };
  };
  window.claude = {
    complete: async body => {
      const stage = __stageOf(body.system);
      const t0 = performance.now();
      const rec = { stage, model: body.model || null, images: 0 };
      (body.messages || []).forEach(m => (Array.isArray(m.content) ? m.content : []).forEach(b => { if (b.type === 'image') rec.images++; }));
      calls.push(rec);
      const wrapOut = async out => { Object.assign(rec, await estimate(body, out)); return out; };
      try {
        if (claude === 'live') {
          const r = JSON.parse(await window.__claudeNode(JSON.stringify(body)));
          rec.usage = r.usage || null; rec.cost = r.cost || 0; rec.servedModel = r.model || null;
          if (r.error) throw new Error(r.error);
          return r.text;
        }
        if (!oracle) throw new Error('No ground truth for oracle mode');
        return await wrapOut(await oracle.complete(body, stage));
      } catch (e) {
        rec.error = String((e && e.message) || e);
        throw e;
      } finally {
        rec.ms = Math.round(performance.now() - t0);
      }
    },
  };
  Object.assign(comp.state, { email: 'eval@local', ocr: 'Built-in', gkey: '' }, settings || {});
  const docs = Array.isArray(doc) ? doc : [doc];
  comp.state.files = [];
  for (const [i, d] of docs.entries()) {
    const blob = await (await fetch('/' + d)).blob();
    const file = new File([blob], d.split('/').pop(), { type: blob.type });
    comp.state.files.push({ id: String(i + 1), name: file.name, size: file.size, type: file.type, raw: file, pct: 100, state: 'done' });
  }
  const t0 = performance.now();
  await comp.runPipeline();
  const st = comp.state;
  const r = v => (v == null || isNaN(v) ? null : Math.round(v));
  const rect = b => (b ? [r(b.x), r(b.y), r(b.w), r(b.h)] : null);
  const out = {
    ms: Math.round(performance.now() - t0),
    apiError: st.apiError || '',
    mode: comp._traceRaw ? comp._traceRaw.mode : null,
    times: comp._traceRaw ? comp._traceRaw.times : null,
    layoutCount: comp._traceRaw && comp._traceRaw.layout ? comp._traceRaw.layout.length : null,
    layout: comp._traceRaw && comp._traceRaw.layout ? comp._traceRaw.layout.map(q => ({ id: q.id, label: q.label, page: q.page, lineId: q.lineId, kind: q.kind, cat: q.cat, recovered: !!q.recovered, fromTable: !!q.fromTable, col: q.col || '', prompt: String(q.prompt || '').slice(0, 60) })) : null,
    calls,
    zoned: comp._traceRaw && comp._traceRaw.zoned ? comp._traceRaw.zoned.map(q => ({ id: q.id, label: q.label, page: q.page, lineId: q.lineId, kind: q.kind, zone: q.zone, how: q.placeHow || null, untilLineId: q.untilLineId })) : null,
    assigned: comp._traceRaw && comp._traceRaw.assigned ? comp._traceRaw.assigned.map(q => ({ id: q.id, zone: q.zone, spaceIds: q.spaceIds || null, placedBy: q.placedBy || null })) : null,
    pages: (st.pages || []).map((p, i) => ({
      page: i + 1, w: p.canvas.width, h: p.canvas.height, ocr: !!p.ocr, ocrConf: p.ocrConf || null, ocrFailed: !!p.ocrFailed, prep: p.prep || null,
      lines: (p.lines || []).map(l => ({ id: l.id, top: r(l.top), bottom: r(l.bottom), x0: r(l.x0), x1: r(l.x1), text: l.text, cells: (l.cells || []).map(c => [c.text, r(c.x0), r(c.x1)]) })),
      spaces: (p.spaces || []).map((s, k) => ({ n: k + 1, type: s.type, rect: [r(s.x), r(s.y), r(s.w), r(s.h)] })),
    })),
    answers: (st.answers || []).map(a => ({
      id: a.id, num: a.num, page: a.page, kind: a.kind, question: String(a.question || '').slice(0, 300), text: a.text || '',
      bbox: rect(a.bbox), mark: a.mark ? [r(a.mark.x), r(a.mark.y), r(a.mark.w), r(a.mark.h), a.mark.page || a.page] : null,
      choice: a.choiceRects ? { rects: a.choiceRects.map(c => [r(c.x), r(c.y), r(c.w), r(c.h), c.page || a.page]), options: (a.options || []).map(o => o.label), pick: comp.pickOption(a) } : null,
      slots: (a.slots || []).length, strokes: (a.strokes || []).length, overflow: !!a.overflow, placedBy: a.placedBy || null, flag: a.flag || '',
    })),
    shots: null,
    noise: window.__noiseLog ? window.__noiseLog.slice() : [],
  };
  if (snapshots) {
    out.shots = (st.pages || []).map((p, i) => {
      const c = comp.composite(p, (st.answers || []).filter(a => (a.page || 1) === i + 1));
      const s = document.createElement('canvas');
      const k = Math.min(1, 1100 / c.width);
      s.width = Math.round(c.width * k); s.height = Math.round(c.height * k);
      s.getContext('2d').drawImage(c, 0, 0, s.width, s.height);
      return s.toDataURL('image/jpeg', 0.82);
    });
  }
  return out;
};
