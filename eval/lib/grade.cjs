// Grades answer TEXT against the answer key: are the answers right, not just well placed?
// Objective answers (fill-in, table cells) are graded exactly with tolerant matching; written answers only
// approximately (key points and final values present), and rubric-only answers are left for a human or Claude.

const SUP = { '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9', '⁺': '+', '⁻': '-' };
const SUB = { '₀': '0', '₁': '1', '₂': '2', '₃': '3', '₄': '4', '₅': '5', '₆': '6', '₇': '7', '₈': '8', '₉': '9' };
const STOP = new Set('that this with from have been were will would which their there they them than then when what where while also into each such only more most some very your about after before because between both does done during other over same should these those through under until upon using used uses show shows answer model marks mark strong full credit response correct explains explain student students give given example examples clearly clear notes note'.split(' '));

function clean(s) {
  return String(s || '')
    .replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻]+/g, m => '^' + m.split('').map(c => SUP[c]).join(''))
    .replace(/[₀-₉]/g, c => SUB[c])
    .replace(/[×✕✖]/g, 'x').replace(/[−–—]/g, '-').replace(/[’‘]/g, "'").replace(/°/g, ' degrees')
    .toLowerCase().trim();
}
const compact = s => clean(s).replace(/^(the|a|an)\s+/, '').replace(/[\s_()\[\]{},;:!?"]/g, '').replace(/\.$/, '');
// Plural and singular count as the same word ("kidneys" = "kidney").
const words = s => clean(s).replace(/[^a-z0-9.'^\-+=/ ]+/g, ' ').split(/\s+/).filter(w => w && !/^(the|a|an)$/.test(w)).map(w => (w.length > 3 && /[^s]s$/.test(w) ? w.slice(0, -1) : w));
const numOf = s => { const m = clean(s).replace(/,(?=\d{3}\b)/g, '').match(/-?\d+(\.\d+)?(\s*x\s*10\^?-?\d+)?/); if (!m) return null; let v = parseFloat(m[0]); const e = m[0].match(/x\s*10\^?(-?\d+)/); if (e) v *= Math.pow(10, Number(e[1])); return v; };
const numsOf = s => (clean(s).replace(/,(?=\d{3}\b)/g, '').match(/(?<![\w.])-?\d+(\.\d+)?(\s*\/\s*\d+(\.\d+)?)?/g) || []).map(t => { const f = t.split('/'); return f.length === 2 ? Number(f[0]) / Number(f[1]) : Number(t); });
const near = (a, b) => Math.abs(a - b) <= Math.max(0.006, Math.abs(b) * 0.01);

// "reverse (backward)", "lamp / light bulb", "that / which", "6.02 x 10^23 (Avogadro's number)"
function alternatives(key) {
  const k = String(key || '').trim();
  const out = new Set([k]);
  const noParen = k.replace(/\s*\(([^()]*[a-z][^()]{2,})\)\s*/gi, ' ').trim();
  if (noParen) out.add(noParen);
  (k.match(/\(([^()]*[a-z][^()]{2,})\)/gi) || []).forEach(p => out.add(p.slice(1, -1)));
  [...out].forEach(a => a.split(/\s+\/\s+|\s*;\s*|\s+or\s+/).forEach(x => x.trim() && out.add(x.trim())));
  return [...out].filter(Boolean);
}

function gradeText(key, ans) {
  if (key == null || key === '') return { right: null, why: 'no key' };
  const a = String(ans || '').trim();
  if (!a || a === '—') return { right: false, why: 'blank' };
  for (const alt of alternatives(key)) {
    if (compact(alt) && compact(alt) === compact(a)) return { right: true };
    const aw = words(alt), bw = words(a);
    if (aw.length && aw.every(w => bw.includes(w)) && bw.length <= aw.length + 2) return { right: true };
    const na = numOf(alt), nb = numOf(a);
    // A number with or without its unit ("10 V" vs "10"), or rounded ("0.87" vs "0.866").
    if (na != null && nb != null && /^[-\d.\sx^]+[a-z/ ]{0,8}$/i.test(clean(alt)) && near(nb, na)) return { right: true };
  }
  return { right: false, why: 'expected ' + JSON.stringify(String(key)) };
}

// Approximate: the key's final value must appear, and enough of its key words.
function gradeWritten(key, ans) {
  const k = String(key || '');
  if (!k || /^(graded on a rubric|open response|open-ended)/i.test(k)) return { right: null, approx: true, why: 'rubric: needs a human or Claude grader' };
  const a = String(ans || '');
  if (!a.trim()) return { right: false, approx: true, why: 'blank' };
  const stem0 = w => w.replace(/[^a-z0-9]/g, '').slice(0, 5);
  const anyN = k.match(/^any (two|three|2|3) of:?\s*/i);
  if (anyN) {
    // "Any two of: A, B, C, D": each point counts when most of its words are there.
    const need = { two: 2, three: 3 }[anyN[1].toLowerCase()] || Number(anyN[1]);
    const aw0 = new Set(words(a).map(stem0));
    const pts = k.slice(anyN[0].length).split(/[;,]|\band\b(?=[^,;]*$)/).map(p => words(p).filter(w => w.length >= 4 && !STOP.has(w)).map(stem0)).filter(p => p.length);
    const hit = pts.filter(p => p.filter(w => aw0.has(w)).length >= Math.ceil(p.length / 2)).length;
    return { right: hit >= need, approx: true, why: hit >= need ? '' : hit + ' of ' + need + ' points found' };
  }
  const kn = numsOf(k), an = numsOf(a);
  // A final value only decides calculations (an "=" in the key, or a short key), not long explanations.
  const final = kn.length && (/=/.test(k) || k.length < 120) ? kn[kn.length - 1] : null;
  const finalOk = final == null || an.some(v => near(v, final));
  const stem = w => w.replace(/[^a-z0-9]/g, '').slice(0, 5);
  const kw = [...new Set(words(k).filter(w => /[a-z]/.test(w) && w.length >= 4 && !STOP.has(w)).map(stem))];
  const aw = new Set(words(a).map(stem));
  const recall = kw.length ? kw.filter(w => aw.has(w)).length / kw.length : 1;
  const right = finalOk && (recall >= 0.35 || (final != null && kw.length <= 3));
  return { right, approx: true, recall: +recall.toFixed(2), why: right ? '' : !finalOk ? 'final value ' + final + ' not found' : 'few key points (' + Math.round(recall * 100) + '%)' };
}

module.exports = { gradeText, gradeWritten, alternatives };
