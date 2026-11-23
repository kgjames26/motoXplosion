"""Cut the album stickers out of the posters art/source/stickers-vol{1..7}.jpg (4 x 5 grids).

The selection and album order come from src/stickers.json ({vol, cell, name, bio}; cell = 0..19,
left to right, top to bottom). Only the picture is kept: the name is drawn by the game.
Output, per album slot NN:
  public/res/stickers/NN.webp   full crop at the poster's resolution (zoom, gift reveal)
  public/res/stickers/tNN.webp  220 px square thumbnail, centred (album, level list)
"""
import json
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'public/res/stickers'
OUT.mkdir(parents=True, exist_ok=True)
for f in OUT.glob('*.webp'):
    f.unlink()

# frame grids measured on the posters (x0 per column, y0 per row, cell w/h), in poster pixels
GRIDS = {
    1: ([72, 472, 872, 1272], [285, 731, 1177, 1624, 2070], 352, 342),
    4: ([78, 501, 923, 1343], [302, 720, 1137, 1554, 1970], 370, 317),
    5: ([113, 516, 921, 1325], [396, 784, 1171, 1559, 1946], 354, 285),
}
GRIDS[2] = GRIDS[3] = GRIDS[1]
GRIDS[6] = GRIDS[7] = GRIDS[5]
INSET, THUMB = 5, 220

posters = {}
sel = json.loads((ROOT / 'src/stickers.json').read_text())
for i, s in enumerate(sel):
    v, cell = s['vol'], s['cell']
    im = posters.get(v) or posters.setdefault(v, Image.open(ROOT / f'art/source/stickers-vol{v}.jpg').convert('RGB'))
    X, Y, W, H = GRIDS[v]
    x, y = X[cell % 4], Y[cell // 4]
    crop = im.crop((x + INSET, y + INSET, x + W - INSET, y + H - INSET))
    crop.save(OUT / f'{i:02d}.webp', quality=84, method=6)
    w, h = crop.size
    m = min(w, h)
    sq = crop.crop(((w - m) // 2, (h - m) // 2, (w - m) // 2 + m, (h - m) // 2 + m))
    sq.resize((THUMB, THUMB), Image.LANCZOS).save(OUT / f't{i:02d}.webp', quality=80, method=6)
print(len(sel), 'stickers ->', OUT)
