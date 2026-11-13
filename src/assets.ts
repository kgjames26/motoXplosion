/**
 * Asset loading (images + metadata). Everything lives in /public/res and is cached by the
 * service worker after the first visit.
 */

export interface BackdropMeta {
  w: number;
  h: number;
  horizon: number;
  skyTop: string;
  ground: string;
}

export interface Assets {
  backdrops: Record<string, { img: HTMLImageElement; meta: BackdropMeta }>;
  textures: Record<'dirt' | 'grass' | 'rock' | 'rockWarm' | 'stone' | 'sand', HTMLImageElement>;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('image ' + src));
    img.src = src;
  });
}

let cached: Promise<Assets> | null = null;

/** `onProgress(done, total)` is called as each file arrives (the loading screen's bar). */
export function loadAssets(onProgress?: (done: number, total: number) => void): Promise<Assets> {
  if (cached) return cached;
  cached = (async () => {
    const base = '/res/';
    const bdMeta = await fetch(base + 'backdrops.json').then((r) => r.json() as Promise<Record<string, BackdropMeta>>);
    const names = Object.keys(bdMeta);
    const total = 6 + names.length;
    let done = 0;
    const img = (src: string) =>
      loadImage(src).then((i) => {
        onProgress?.(++done, total);
        return i;
      });
    const [dirt, grass, rock, rockWarm, stone, sand, ...bds] = await Promise.all([
      img(base + 'tex-dirt.webp'),
      img(base + 'tex-grass.webp'),
      img(base + 'tex-rock.webp'),
      img(base + 'tex-rock-warm.webp'),
      img(base + 'tex-stone.webp'),
      img(base + 'tex-sand.webp'),
      ...names.map((n) => img(`${base}backdrop-${n}.webp`)),
    ]);
    const backdrops: Assets['backdrops'] = {};
    names.forEach((n, i) => (backdrops[n] = { img: bds[i], meta: bdMeta[n] }));
    return { backdrops, textures: { dirt, grass, rock, rockWarm, stone, sand } };
  })();
  return cached;
}
