# Draws ground truth (green = answer areas / correct option, gray = other options, red = question text) over page PNGs.
import json, os, sys
from PIL import Image, ImageDraw
EVAL = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
name = sys.argv[1]
gt = json.load(open(os.path.join(EVAL, 'fixtures', 'gt', name + '.json')))
dump = os.path.join(EVAL, 'out', 'dump', name)
pages = sorted(set([q['page'] for q in gt['questions']] + [o.get('page', q['page']) for q in gt['questions'] for o in q.get('options') or []]))
for p in pages:
    im = Image.open(os.path.join(dump, 'p%d.png' % p)).convert('RGB')
    d = ImageDraw.Draw(im)
    for q in gt['questions']:
        if q['page'] == p and q.get('qrect'):
            x, y, w, h = q['qrect']; d.rectangle([x, y, x + w, y + h], outline=(220, 40, 40), width=2)
            d.text((x - 30, y), str(q['label'])[:6], fill=(220, 40, 40))
        for i, o in enumerate(q.get('options') or []):
            if o.get('page', q['page']) != p: continue
            x, y, w, h = o['rect']; d.rectangle([x, y, x + w, y + h], outline=(0, 170, 60) if i == q['correct'] else (150, 150, 150), width=3 if i == q['correct'] else 1)
        if q['page'] == p:
            for k, a in enumerate(q.get('areas') or []):
                x, y, w, h = a; d.rectangle([x, y, x + w, y + h], outline=(0, 170, 60) if k == 0 else (0, 120, 220), width=2)
                d.text((x + 3, y + 2), str(q['label'])[:10], fill=(0, 120, 60))
    im.resize((int(im.width * 0.55), int(im.height * 0.55))).save(os.path.join(dump, 'gt%d.jpg' % p), quality=85)
print('pages', pages)
