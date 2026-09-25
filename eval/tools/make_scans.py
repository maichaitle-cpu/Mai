"""Makes 'scanned' versions of ground-truth worksheets: page images with skew, blur, noise, paper tint
and JPEG artefacts, uploaded as image files. GT keeps original coordinates plus basePage; the harness
scales GT to the app's canvas. Usage: python3 tools/make_scans.py name[:angle] ...  (needs lib/dump.cjs output)"""
import json, os, random, sys
import numpy as np
from PIL import Image, ImageFilter

EVAL = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
rnd = random.Random(11)
for arg in sys.argv[1:]:
    name, _, ang = arg.partition(':')
    gt = json.load(open(os.path.join(EVAL, 'fixtures', 'gt', name + '.json')))
    pages = sorted(set([q['page'] for q in gt['questions']] + [o.get('page', q['page']) for q in gt['questions'] for o in q.get('options') or []]))
    npages = max(pages)
    outdir = os.path.join(EVAL, 'fixtures', 'scan', name)
    os.makedirs(outdir, exist_ok=True)
    files, base, angles = [], None, []
    for p in range(1, npages + 1):
        im = Image.open(os.path.join(EVAL, 'out', 'dump', name, 'p%d.png' % p)).convert('RGB')
        base = base or [im.width, im.height]
        a = float(ang) if ang else rnd.uniform(-1.2, 1.2)
        angles.append(round(a, 2))
        im = im.rotate(a, resample=Image.BICUBIC, fillcolor=(255, 255, 255))
        im = im.filter(ImageFilter.GaussianBlur(rnd.uniform(0.5, 0.9)))
        arr = np.asarray(im).astype(np.float32)
        tint = np.array([rnd.uniform(236, 250), rnd.uniform(232, 246), rnd.uniform(220, 238)]) / 255.0
        arr = arr * tint + np.random.default_rng(p).normal(0, 7, arr.shape)
        shade = np.linspace(rnd.uniform(0.9, 1.0), 1.0, arr.shape[1])[None, :, None]
        arr = np.clip(arr * shade, 0, 255).astype(np.uint8)
        f = 'p%d.jpg' % p
        Image.fromarray(arr).save(os.path.join(outdir, f), quality=62)
        files.append('scan/%s/%s' % (name, f))
    g = dict(gt)
    g['doc'] = files
    g['basePage'] = base
    g['scan'] = True
    g['angles'] = angles
    json.dump(g, open(os.path.join(EVAL, 'fixtures', 'gt', 'scan_' + name + '.json'), 'w'), indent=1, ensure_ascii=False)
    print('scan_' + name, len(files), 'pages', base)
