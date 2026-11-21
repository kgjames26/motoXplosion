/**
 * v2.76 Fuite: procedural boulder textures (granite grain, veins, cracks, a little lichen) and the
 * matching bump map, drawn once on canvases. Pure canvas code: no asset to download.
 */
function hash(x: number, y: number, s: number): number {
  let h = (x * 374761393 + y * 668265263 + s * 1442695041) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
/** Tileable value noise (period p cells). */
function vnoise(x: number, y: number, p: number, s: number): number {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const w = (a: number) => ((a % p) + p) % p;
  const a = hash(w(xi), w(yi), s), b = hash(w(xi + 1), w(yi), s), c = hash(w(xi), w(yi + 1), s), d = hash(w(xi + 1), w(yi + 1), s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm(x: number, y: number, p: number, s: number, oct = 5): number {
  let t = 0, amp = 0.5, f = 1, n = 0;
  for (let i = 0; i < oct; i++) {
    t += vnoise(x * f, y * f, p * f, s + i * 17) * amp;
    n += amp;
    amp *= 0.5;
    f *= 2;
  }
  return t / n;
}

export interface RockCanvases {
  map: HTMLCanvasElement;
  bump: HTMLCanvasElement;
}

/** W×H texture (2:1, wraps around the stone). */
export function rockCanvases(seed = 1, W = 512, H = 256): RockCanvases {
  const map = document.createElement('canvas');
  const bump = document.createElement('canvas');
  map.width = bump.width = W;
  map.height = bump.height = H;
  const cm = map.getContext('2d')!, cb = bump.getContext('2d')!;
  const im = cm.createImageData(W, H), ib = cb.createImageData(W, H);
  const P = 8; // noise period in cells across the width
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const u = (x / W) * P, v = (y / H) * (P / 2);
      // mottled colour, salt-and-pepper granite grain, a few faint veins and cracks, lichen
      const broad = fbm(u * 0.6, v * 0.6, P * 0.6, seed, 5);
      const mid = fbm(u * 2.2, v * 2.2, P * 2.2, seed + 2, 4);
      const grain = fbm(u * 9, v * 9, P * 9, seed + 3, 2);
      const warp = fbm(u * 0.8, v * 0.8, P * 0.8, seed + 7, 3);
      const vein = Math.pow(Math.abs(Math.sin((u * 0.9 + v * 0.4 + warp * 4) * Math.PI)), 60);
      const crackN = fbm(u * 0.9 + 9, v * 0.9, P * 0.9, seed + 11, 4);
      const crackMask = fbm(u * 0.7, v * 0.7 + 5, P * 0.7, seed + 19, 3) > 0.55 ? 1 : 0;
      const crack = crackMask * Math.max(0, 1 - Math.abs(crackN - 0.5) * 70);
      const sp = hash(x, y, seed + 5);
      const dark = sp > 0.965 ? 1 : 0;
      const light = sp < 0.025 ? 1 : 0;
      const lichen = Math.max(0, fbm(u * 1.4, v * 1.4, P * 1.4, seed + 13, 4) - 0.64) * 5;
      // base: warm grey granite, mottled
      const m = (broad - 0.5) * 90 + (mid - 0.5) * 40 + (grain - 0.5) * 30;
      let r = 128 + m, g = 122 + m * 0.96, b = 113 + m * 0.9;
      const vl = vein * 18;
      r += vl; g += vl; b += vl;
      if (dark) { r -= 50; g -= 50; b -= 46; }
      if (light) { r += 40; g += 40; b += 38; }
      const l = Math.min(1, lichen);
      r = r * (1 - l * 0.5) + 132 * l * 0.5;
      g = g * (1 - l * 0.5) + 142 * l * 0.5;
      b = b * (1 - l * 0.5) + 80 * l * 0.5;
      const k = 1 - crack * 0.5;
      const o = (y * W + x) * 4;
      im.data[o] = Math.max(0, Math.min(255, r * k));
      im.data[o + 1] = Math.max(0, Math.min(255, g * k));
      im.data[o + 2] = Math.max(0, Math.min(255, b * k));
      im.data[o + 3] = 255;
      // bump: grain and broad lumps up, cracks deep
      const hgt = 0.3 + broad * 0.35 + mid * 0.25 + grain * 0.15 - crack * 0.45 - dark * 0.08;
      const hb = Math.max(0, Math.min(255, hgt * 255));
      ib.data[o] = ib.data[o + 1] = ib.data[o + 2] = hb;
      ib.data[o + 3] = 255;
    }
  cm.putImageData(im, 0, 0);
  cb.putImageData(ib, 0, 0);
  return { map, bump };
}

/** Smooth 3D value noise 0..1 (shape of the stones). */
export function noise3(x: number, y: number, z: number, s: number): number {
  const h = (i: number, j: number, k: number) => {
    let q = (i * 374761393 + j * 668265263 + k * 2147483647 + s * 1442695041) | 0;
    q = Math.imul(q ^ (q >>> 13), 1274126177);
    return ((q ^ (q >>> 16)) >>> 0) / 4294967295;
  };
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const f = (t: number) => t * t * (3 - 2 * t);
  const u = f(x - xi), v = f(y - yi), w = f(z - zi);
  const l = (a: number, b: number, t: number) => a + (b - a) * t;
  return l(
    l(l(h(xi, yi, zi), h(xi + 1, yi, zi), u), l(h(xi, yi + 1, zi), h(xi + 1, yi + 1, zi), u), v),
    l(l(h(xi, yi, zi + 1), h(xi + 1, yi, zi + 1), u), l(h(xi, yi + 1, zi + 1), h(xi + 1, yi + 1, zi + 1), u), v),
    w,
  );
}
