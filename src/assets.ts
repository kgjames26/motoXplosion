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
  textures: Record<'dirt' | 'grass' | 'rock' | 'rockWarm' | 'stone', HTMLImageElement>;
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

export function loadAssets(): Promise<Assets> {
  if (cached) return cached;
  cached = (async () => {
    const base = '/res/';
    const bdMeta = await fetch(base + 'backdrops.json').then((r) => r.json() as Promise<Record<string, BackdropMeta>>);
    const names = Object.keys(bdMeta);
    const [dirt, grass, rock, rockWarm, stone, ...bds] = await Promise.all([
      loadImage(base + 'tex-dirt.webp'),
      loadImage(base + 'tex-grass.webp'),
      loadImage(base + 'tex-rock.webp'),
      loadImage(base + 'tex-rock-warm.webp'),
      loadImage(base + 'tex-stone.webp'),
      ...names.map((n) => loadImage(`${base}backdrop-${n}.webp`)),
    ]);
    const backdrops: Assets['backdrops'] = {};
    names.forEach((n, i) => (backdrops[n] = { img: bds[i], meta: bdMeta[n] }));
    return { backdrops, textures: { dirt, grass, rock, rockWarm, stone } };
  })();
  return cached;
}
