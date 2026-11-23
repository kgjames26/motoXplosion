"""Cut the 60 album stickers out of the three posters (art/source/stickers-vol{1,2,3}.jpg).

Each poster is a 4 x 5 grid; only the picture is kept (the name is drawn by the game).
Output: public/res/stickers/00.webp .. 59.webp (vol 1 = 0-19, vol 2 = 20-39, vol 3 = 40-59).
"""
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'public/res/stickers'
OUT.mkdir(parents=True, exist_ok=True)
# grid measured on a 1568 px wide copy of the 1696 x 2528 posters
X = [65, 435, 805, 1175]
Y = [262, 675, 1088, 1500, 1913]
W, H, INSET, SIZE = 328, 318, 7, 240

k = 0
for v in (1, 2, 3):
    im = Image.open(ROOT / f'art/source/stickers-vol{v}.jpg').convert('RGB')
    s = im.width / 1568
    for r in range(5):
        for c in range(4):
            box = (int(X[c] * s) + INSET, int(Y[r] * s) + INSET, int((X[c] + W) * s) - INSET, int((Y[r] + H) * s) - INSET)
            im.crop(box).resize((SIZE, SIZE), Image.LANCZOS).save(OUT / f'{k:02d}.webp', quality=80, method=6)
            k += 1
print(k, 'stickers ->', OUT)
