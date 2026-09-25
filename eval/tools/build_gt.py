"""Builds ground-truth JSON for the real worksheets from the app's own page dumps.

Coordinates are app canvas pixels (the page image the app works on).
Each question: label, page, kind (choice|blank|write|cell), cat, prompt,
qrect (printed question text), and either options+correct or areas (acceptable answer regions).
Run `node lib/dump.cjs <doc>` first. Usage: python3 tools/build_gt.py [doc ...]
"""
import json, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
EVAL = os.path.dirname(HERE)
DUMP = os.path.join(EVAL, 'out', 'dump')
OUT = os.path.join(EVAL, 'fixtures', 'gt')


class Doc:
    def __init__(self, name):
        self.name = name
        self.pages = json.load(open(os.path.join(DUMP, name, 'lines.json')))
        self.qs = []

    def P(self, p):
        return self.pages[p - 1]

    def L(self, p, i):
        return next(l for l in self.P(p)['lines'] if l['id'] == i)

    def rect(self, p, *ids):
        ls = [self.L(p, i) for i in ids]
        x0 = min(l['x0'] for l in ls); x1 = max(l['x1'] for l in ls)
        y0 = min(l['top'] for l in ls); y1 = max(l['bottom'] for l in ls)
        return [x0, y0, x1 - x0, y1 - y0]

    def below(self, p, last, until=None, x0=None, x1=None, y1=None, pad=6):
        l = self.L(p, last)
        top = l['bottom'] + pad
        bot = y1 if y1 is not None else (self.L(p, until)['top'] - pad if until is not None else None)
        return [x0, top, x1 - x0, bot - top]

    def right(self, p, i, x1, pad=10):
        l = self.L(p, i)
        return [l['x1'] + pad, l['top'] - 6, x1 - l['x1'] - pad, l['bottom'] - l['top'] + 12]

    def blank(self, p, i, k, padx=4):
        l = self.L(p, i)
        b = l['blanks'][k]
        return [b[0] - padx, l['top'] - 10, b[1] - b[0] + 2 * padx, l['bottom'] - l['top'] + 16]

    def add(self, **q):
        self.qs.append(q)

    def save(self, doc, settings=None):
        os.makedirs(OUT, exist_ok=True)
        g = {'doc': doc, 'settings': settings or {}, 'questions': self.qs}
        json.dump(g, open(os.path.join(OUT, self.name + '.json'), 'w'), indent=1, ensure_ascii=False)
        print(self.name, len(self.qs), 'questions')


def physics():
    d = Doc('physics')
    key = 'DCCCBCBBCC' 'BBBCBBBBAD' 'CBBBBABBAB' 'AABBBCBCBA'
    seq = [(p['page'], l) for p in d.pages for l in p['lines']]
    qs = []
    cur = None
    for pg, l in seq:
        t = l['text']
        m = re.match(r'^(\d{1,2})\.\s', t)
        if m:
            cur = {'n': int(m.group(1)), 'page': pg, 'qlines': [l], 'opts': []}
            qs.append(cur)
            continue
        if cur is None:
            continue
        if re.match(r'^\([A-D]\)\s', t):
            cur['opts'].append({'page': pg, 'lines': [l], 'text': t})
        elif cur['opts'] and l['x0'] >= 150:
            cur['opts'][-1]['lines'].append(l)
            cur['opts'][-1]['text'] += ' ' + t
        elif not cur['opts'] and l['x0'] < 150 and pg == cur['page']:
            cur['qlines'].append(l)
        else:
            cur = None
    assert len(qs) == 40, len(qs)
    for q in qs:
        ql = q['qlines']
        qr = [min(l['x0'] for l in ql), ql[0]['top'], max(l['x1'] for l in ql) - min(l['x0'] for l in ql), ql[-1]['bottom'] - ql[0]['top']]
        opts = []
        for o in q['opts']:
            ls = o['lines']
            x0 = min(l['x0'] for l in ls); x1 = max(l['x1'] for l in ls)
            opts.append({'text': o['text'], 'page': o['page'], 'rect': [x0, ls[0]['top'], x1 - x0, ls[-1]['bottom'] - ls[0]['top']]})
        assert len(opts) == 4, q['n']
        k = 'ABCD'.index(key[q['n'] - 1])
        d.add(label=str(q['n']) + '.', page=q['page'], kind='choice', cat='MULTIPLE_CHOICE',
              prompt=' '.join(l['text'] for l in ql), qrect=qr, options=opts, correct=k,
              optionsPage=opts[0]['page'] if opts[0]['page'] != q['page'] else None)
    d.save('real/physics.pdf')


def polygraph():
    d = Doc('polygraph')
    X0, X1, YB = 108, 1116, 1500
    # Page 2 Part A: four blanks per polynomial
    for n, (fl, l1, l2) in enumerate([(3, 4, 5), (6, 7, 8), (9, 10, 11), (12, 13, 14)], 1):
        f = d.L(2, fl)['text'][3:]
        for li, k, what, ans in [(l1, 0, 'Degree', None), (l1, 1, 'Leading coefficient sign', None), (l2, 0, 'Left end', None), (l2, 1, 'Right end', None)]:
            d.add(label=f'{n}.', page=2, kind='blank', cat='FILL_BLANK', prompt=f'{f} — {what}', qrect=d.rect(2, fl, li), areas=[d.blank(2, li, k)])
    answersA = ['5', 'positive', 'down', 'up', '8', 'negative', 'down', 'down', '7', 'negative', 'up', 'down', '4', 'positive', 'up', 'up']
    for q, a in zip(d.qs, answersA):
        q['answer'] = a
    # Part B: letter to the right of each polynomial
    for n, li, a in [(1, 17, 'C'), (2, 18, 'B'), (3, 19, 'A'), (4, 20, 'D')]:
        d.add(label=f'{n}.', page=2, kind='write', cat='SHORT_TEXT', prompt=d.L(2, li)['text'][3:] + ' Match to a type A-D.', qrect=d.rect(2, li), areas=[d.right(2, li, X1)], answer=a)
    # Part C a-c: short lines stacked, shared space below
    shared = [X0, d.L(2, 30)['bottom'] + 6, X1 - X0, YB - d.L(2, 30)['bottom'] - 6]
    for lab, li, a in [('a)', 28, 'The degree is even and at least 4.'), ('b)', 29, '4, 6, 8 or any larger even number.'), ('c)', 30, 'Both ends up means even degree, and three turning points need degree at least 4.')]:
        d.add(label=lab, page=2, kind='write', cat='SHORT_TEXT' if lab != 'c)' else 'LONG_TEXT', prompt='A polynomial has both ends rising and exactly three turning points. ' + d.L(2, li)['text'][3:], qrect=d.rect(2, li), areas=[d.right(2, li, X1), shared], answer=a)
    # Page 3 Part D
    ids = [3, 4, 5, 6]
    for n, li in enumerate(ids, 1):
        nxt = ids[n] if n < 4 else None
        d.add(label=f'{n}.', page=3, kind='write', cat='LONG_TEXT', prompt=d.L(3, li)['text'][3:], qrect=d.rect(3, li),
              areas=[d.below(3, li, until=nxt, x0=X0, x1=X1, y1=None if nxt else YB)], answer='Possible. For example f(x) = x^4 - x^2 has that shape.')
    # Page 4 Part E
    sharedE = [X0, d.L(4, 5)['bottom'] + 6, X1 - X0, d.L(4, 6)['top'] - d.L(4, 5)['bottom'] - 12]
    for lab, li, a in [('a)', 3, 'Odd'), ('b)', 4, '1, 3 or 5'), ('c)', 5, 'Opposite ends mean odd degree, and at most four turning points means degree 5 or less.')]:
        d.add(label=lab, page=4, kind='write', cat='SHORT_TEXT' if lab != 'c)' else 'LONG_TEXT', prompt='A polynomial has opposite end behaviors and at most four turning points. ' + d.L(4, li)['text'][3:], qrect=d.rect(4, li), areas=[d.right(4, li, X1), sharedE], answer=a)
    # Part F
    ids = [11, 12, 13, 14, 15]
    for n, li in enumerate(ids, 1):
        nxt = ids[n] if n < 5 else None
        d.add(label=f'{n}.', page=4, kind='write', cat='SHORT_TEXT', prompt=d.L(4, li)['text'][3:], qrect=d.rect(4, li),
              areas=[d.below(4, li, until=nxt, x0=X0, x1=X1, y1=None if nxt else YB), d.right(4, li, X1)], answer='Graph A and Graph D')
    # Page 5
    d.add(label='G', page=5, kind='write', cat='LONG_TEXT', prompt='A student says this graph has three turning points so the polynomial must be degree 4. Is the student correct? Explain carefully.', qrect=d.rect(5, 3, 4),
          areas=[d.below(5, 4, until=5, x0=X0, x1=X1)], answer='No. Three turning points only means the degree is at least 4; it could be 6 or 8 as well.')
    d.add(label='1.', page=5, kind='write', cat='SHORT_TEXT', prompt=d.L(5, 7)['text'][3:], qrect=d.rect(5, 7), areas=[d.below(5, 7, until=8, x0=X0, x1=X1)], answer='f(x) = x^4 - 2x^2')
    d.add(label='2.', page=5, kind='write', cat='SHORT_TEXT', prompt=d.L(5, 8)['text'][3:], qrect=d.rect(5, 8), areas=[d.below(5, 8, until=9, x0=X0, x1=X1)], answer='f(x) = -x^5 + 5x^3 - 4x')
    d.add(label='I', page=5, kind='write', cat='LONG_TEXT', prompt='Can a polynomial have both ends up and cross the x-axis exactly once? Explain. If possible, give an example.', qrect=d.rect(5, 10, 11),
          areas=[d.below(5, 11, until=12, x0=X0, x1=X1)], answer='Yes. f(x) = x^2 touches instead, but (x-1)^2(x^2+1) style examples can cross once at a double root; a simple example is f(x)=x^4.')
    # Page 6: sketch + equation
    ids = [1, 2, 3, 4]
    for n, li in enumerate(ids, 1):
        nxt = ids[n] if n < 4 else None
        d.add(label=f'{n}.', page=6, kind='write', cat='DRAWING', prompt=d.L(6, li)['text'][3:], qrect=d.rect(6, li),
              areas=[d.below(6, li, until=nxt, x0=X0, x1=X1, y1=None if nxt else YB)], answer='f(x) = x^5 - 5x^3 + 4x')
    # Page 7 table: Minimum Possible Degree / Reason columns
    v = d.P(7)['vec']
    xs = sorted(set(x for y0, y1, x in v['vl']))
    ys = sorted(set(y for x0, x1, y in v['hl'] if x1 - x0 > 600))
    cols = {'Minimum Possible Degree': (xs[1], xs[2]), 'Reason': (xs[2], xs[3])}
    rows = [4, 5, 6, 7, 8, 9]
    for li in rows:
        L = d.L(7, li)
        cyc = (L['top'] + L['bottom']) / 2
        top = max(y for y in ys if y < cyc); bot = min(y for y in ys if y > cyc)
        for col, (a, b) in cols.items():
            d.add(label=L['text'], page=7, kind='cell', cat='TABLE_SHORT' if col != 'Reason' else 'TABLE_TEXT',
                  prompt=L['text'] + ' — ' + col, qrect=d.rect(7, li), areas=[[a + 2, top - 4, b - a - 4, bot - top + 8]],
                  cell={'row': [a, top, b - a, bot - top], 'header': d.rect(7, 3), 'col': col}, answer='4' if col != 'Reason' else 'even, 3+ turns')
    # Final reflection
    sharedR = [X0, d.L(7, 13)['bottom'] + 6, X1 - X0, YB - d.L(7, 13)['bottom'] - 6]
    for lab, li, a in [('a)', 12, 'It has even degree, so both ends point the same way, and it has at most 19 turning points.'), ('b)', 13, 'Whether the ends go up or down and how many turning points it really has.')]:
        d.add(label=lab, page=7, kind='write', cat='LONG_TEXT', prompt='A polynomial has degree 20. ' + d.L(7, li)['text'][3:], qrect=d.rect(7, li), areas=[d.right(7, li, X1), sharedR], answer=a)
    d.save('real/polygraph.pdf')


BUILDERS = {'physics': physics, 'polygraph': polygraph}

if __name__ == '__main__':
    for n in (sys.argv[1:] or BUILDERS.keys()):
        BUILDERS[n]()
