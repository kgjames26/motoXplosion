import { BIKES, BikeModel } from './bikes';
import { clamp, Rng, wrapAngle } from './core/math';
import type { Difficulty } from './modes';
import { Bike, BikeInput } from './physics/bike';
import type { World } from './world/world';

/**
 * Race opponents. Each one rides a real simulated bike (same physics as the player) driven by
 * a controller whose quality depends on its level (1..10):
 *  - target speed (how hard it pushes),
 *  - throttle discipline before jumps and on landing,
 *  - in-air balance precision (noise) and reaction delay,
 *  - occasional mistakes (hesitations) for the low levels.
 * Crashes cost them ~2.5 s like the player.
 */

export interface Opponent {
  name: string;
  level: number;
  model: BikeModel;
  bike: Bike;
  look: RiderLook;
  /** Lane depth (z) on the track so riders do not overlap exactly. */
  lane: number;
  finished: boolean;
  finishTime: number;
  crashTimer: number;
  ai: AiState;
  /** Multiplayer: a real player whose bike is driven by the network. */
  remote?: boolean;
  netId?: string;
}

export interface RiderLook {
  jersey: string;
  accent: string;
  helmet: string;
  number: string;
}

export interface AiState {
  rng: Rng;
  noise: number;
  delayed: number; // delayed balance command
  hesitate: number;
  stuck: number;
  lastX: number;
}

const NAMES = ['Léo', 'Inès', 'Malik', 'Jade', 'Hugo', 'Zoé', 'Nino', 'Lina', 'Tom', 'Maya', 'Sacha', 'Eva', 'Noah', 'Lou', 'Yanis', 'Chloé'];
const JERSEYS: [string, string, string][] = [
  ['#1f6fd6', '#ffffff', '#1f6fd6'],
  ['#d8261f', '#1a1a1e', '#d8261f'],
  ['#ffd21f', '#1a1a1e', '#ffd21f'],
  ['#2fa84f', '#ffffff', '#2fa84f'],
  ['#7a3fd1', '#ffd21f', '#7a3fd1'],
  ['#ff7a1a', '#1a1a1e', '#ff7a1a'],
  ['#14d1c0', '#1a1a1e', '#14d1c0'],
  ['#e84a8a', '#ffffff', '#e84a8a'],
  ['#f2f2f2', '#d8261f', '#f2f2f2'],
];

/** Mean opponent level for the player's difficulty and championship level. */
export function meanLevel(difficulty: Difficulty, champLevel: number): number {
  // facile stays beatable on every circuit, difficile ends with near-perfect riders
  if (difficulty === 'facile') return clamp(1 + (champLevel - 1) * 0.33, 1, 9.5);
  if (difficulty === 'normal') return clamp(3 + (champLevel - 1) * 0.58, 1, 9.5);
  return clamp(4.2 + (champLevel - 1) * 0.6, 1, 9.5);
}

export function createOpponents(world: World, startX: number, difficulty: Difficulty, champLevel: number, seed: number): Opponent[] {
  const rng = new Rng(seed);
  const mean = meanLevel(difficulty, champLevel);
  const names = [...NAMES];
  const list: Opponent[] = [];
  for (let i = 0; i < 7; i++) {
    // spread around the mean: one or two clearly better, one or two weaker
    const spread = [-2.5, -1.5, -0.7, 0, 0.6, 1.4, 2.4][i] + rng.range(-0.5, 0.5);
    const level = Math.round(clamp(mean + spread, 1, 10));
    // better riders ride better bikes
    const tier = clamp(Math.round((level / 10) * (BIKES.length - 1) + rng.range(-1, 1)), 0, BIKES.length - 1);
    let model = BIKES[tier];
    if (model.style === 'trial') model = BIKES[tier + 1] ?? BIKES[1];
    const bike = new Bike(model.spec);
    const name = names.splice(rng.int(0, names.length - 1), 1)[0];
    const [jersey, accent, helmet] = JERSEYS[i % JERSEYS.length];
    bike.reset(world, startX);
    list.push({
      name,
      level,
      model,
      bike,
      look: { jersey, accent, helmet, number: String(rng.int(2, 99)) },
      lane: [-0.95, -0.7, -0.45, 0.0, 0.2, 0.42, 0.62][i],
      finished: false,
      finishTime: 0,
      crashTimer: 0,
      ai: { rng, noise: 0, delayed: 0, hesitate: 0, stuck: 0, lastX: startX },
    });
  }
  return list;
}

/** One controller tick (called at the frame rate; physics runs in sub-steps). */
export function aiInput(o: Opponent, world: World, dt: number, leaderGap: number): BikeInput {
  const b = o.bike;
  const s = o.ai;
  const L = o.level / 10;
  // target speed: share of the bike's top speed
  let target = b.maxSpeed * (0.55 + L * 0.38);
  // look ahead: ease off before steep ramps (low levels brake too much, high levels carry speed)
  const ahead = world.slopeAt(b.x + 6 + b.vx * 0.4);
  if (ahead > 0.25) target *= 0.85 + L * 0.12;
  // mild rubber band so the pack stays together
  target *= clamp(1 - leaderGap * 0.0012, 0.94, 1.05);
  s.hesitate -= dt;
  if (s.hesitate < -3 && s.rng.chance(dt * (1 - L) * 0.25)) s.hesitate = s.rng.range(0.4, 1.2);
  let throttle = b.grounded ? clamp((target - b.speed) * 0.35 + 0.3, 0, 1) : 0.15;
  if (s.hesitate > 0) throttle *= 0.3;
  // balance: aim for the slope (ground) or the landing slope (air), with skill-based noise
  const look = b.grounded ? world.slopeAt(b.x) : world.slopeAt(b.x + Math.max(1, b.vx * 0.45));
  const err = wrapAngle(b.angle - look);
  s.noise += (s.rng.range(-1, 1) * (1 - L) * 1.2 - s.noise) * Math.min(1, dt * 3);
  const cmd = clamp(err * (2 + L * 1.2) + b.omega * 0.35 + s.noise, -1, 1);
  // reaction delay (low levels react late)
  const lag = 0.05 + (1 - L) * 0.25;
  s.delayed += (cmd - s.delayed) * Math.min(1, dt / lag);
  return { throttle, brake: 0, balance: s.delayed };
}
