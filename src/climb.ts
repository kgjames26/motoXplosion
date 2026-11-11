import type { BikeSpec } from './bikes';
import { ROCK_ASSETS, rockHeight, ROCK_STEPS } from './catalog/rocks';
import { Bike } from './physics/bike';
import { Biome, DX, Surface } from './world/types';
import { World } from './world/world';
import type { Weather } from './weather';

/**
 * Highest trial rock a bike climbs, found with the real physics: a test track with one rock,
 * a short run-up, a simple rider (full throttle on the face, body kept aligned with the slope),
 * a few approach speeds. Results are cached per spec and weather.
 */
const cache = new Map<string, number>();
const rocks = ROCK_ASSETS.filter((a) => a.id.startsWith('tr.rock.granite.bloc.'));

function attempt(spec: BikeSpec, k: number, weather: Weather, v0: number): boolean {
  const o = rocks[k].obstacle!;
  const w = new World(1, 'alpes', 'cruising', 1, 0, weather);
  const x0 = 24.5;
  for (let i = 0; i < 160; i++) {
    const x = i * DX;
    const u = (x - x0) / o.w;
    const h = u > 0 && u < 1 ? o.h * o.profile(u) : 0;
    w.writeSample(i, h, h, u > -0.02 && u < 1.02 ? Surface.Rock : Surface.Dirt, Biome.Meadow);
  }
  for (let i = 160; i < 512; i++) w.writeSample(i, 0, 0, Surface.Dirt, Biome.Meadow);
  const b = new Bike(spec);
  b.reset(w, 20);
  const dt = 1 / 300;
  for (let t = 0; t < 9; t += dt) {
    const ahead = w.heightAt(b.x + 1.2) - w.heightAt(b.x) > 0.3;
    const err = b.angle - (b.grounded ? w.slopeAt(b.x) : w.slopeAt(b.x + 1));
    b.step(w, { throttle: ahead || b.speed < v0 ? 1 : 0.15, brake: b.speed > v0 + 3 && !ahead ? 0.3 : 0, balance: Math.max(-1, Math.min(1, err * 2.5 + b.omega * 0.35)) }, dt);
    if (b.consumeEvents().crashed || b.crashed) return false;
    if (b.x > x0 + o.w + 2) return true;
  }
  return false;
}

const passes = (spec: BikeSpec, k: number, weather: Weather) => [2, 3.5, 5].some((v) => attempt(spec, k, weather, v));

/** Highest rock (m) this spec climbs in this weather (0.5 → 2.5 m). */
export function rockCapacity(spec: BikeSpec, weather: Weather = 0): number {
  const key = JSON.stringify(spec) + weather;
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  // binary search on the rock index (climbing ability is monotonic in height)
  let lo = -1;
  let hi = ROCK_STEPS;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (passes(spec, mid, weather)) lo = mid;
    else hi = mid;
  }
  const h = lo < 0 ? 0.4 : rockHeight(lo);
  cache.set(key, h);
  return h;
}
