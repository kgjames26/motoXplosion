import { Rng } from '../core/math';
import { INK } from '../render/palette';
import { BRANDS, crown, Ctx, ell, HAIRS, label, line, PANTS, person, poly, rect, rngFor, shade, SHIRTS, sideGrad, SKINS, sprite } from './paint';
import type { AssetDef, AssetGroup, Obstacle, Slot } from './types';

/**
 * Mode assets: 100+ for trial (physical obstacles + section decor), 100+ for enduro (roots,
 * fallen trees, stones + course marking) and 100+ for the race (paddock, banners, crowd).
 * Obstacles are drawn at their exact physical size: the sprite's bottom centre sits on the
 * ground and the heightfield follows `profile`.
 */

const out: AssetDef[] = [];
function add(id: string, name: string, group: AssetGroup, slot: Slot, draw: (r: Rng) => ReturnType<typeof sprite>, weight = 1, obstacle?: Obstacle): void {
  out.push({ id, name, group, slot, draw: () => draw(rngFor(id)), weight, obstacle });
}

// ---- obstacle profiles (u ∈ [0,1] across the width → height fraction)
const box = (bevel: number) => (u: number) => Math.min(1, u / bevel, (1 - u) / bevel);
const round = (u: number) => Math.sqrt(Math.max(0, 1 - (2 * u - 1) ** 2));
const steps = (n: number, bevel = 0.05) => (u: number) => {
  // staircase up then down: n steps up to the middle
  const k = u < 0.5 ? u * 2 : (1 - u) * 2;
  const s = Math.min(n, Math.floor(k * n + bevel * n) + 1);
  return Math.min(1, s / n);
};
const ramp = (u: number) => (u < 0.7 ? u / 0.7 : Math.max(0, (1 - u) / 0.3));

const person0 = (r: Rng, pose: 'stand' | 'cheer' | 'point' | 'flag' | 'camera' | 'sit', shirt?: string, flag?: string) => ({
  shirt: shirt ?? r.pick(SHIRTS),
  pants: r.pick(PANTS),
  skin: r.pick(SKINS),
  hair: r.pick(HAIRS),
  hat: r.chance(0.4) ? r.pick(SHIRTS) : undefined,
  pose,
  flag,
});

// ======================================================================= TRIAL (obstacles)

const PALLET = ['#c8a070', '#a8865a'];
for (let n = 1; n <= 3; n++)
  for (const [ci, col] of PALLET.entries())
    add(`t.pallets.${n}.${ci}`, `Pile de ${n} palette${n > 1 ? 's' : ''} ${ci ? 'foncées' : 'claires'}`, 'trial', 'obstacle', () =>
      sprite(1.2, 0.15 * n, (c) => {
        for (let k = 0; k < n; k++) {
          const y = -0.15 * (k + 1);
          rect(c, -0.6, y, 1.2, 0.04, col, 0.02);
          rect(c, -0.6, y + 0.11, 1.2, 0.04, col, 0.02);
          for (const x of [-0.58, -0.06, 0.46]) rect(c, x, y + 0.04, 0.12, 0.07, shade(col, -0.25), 0.015);
        }
      }), 1, { w: 1.2, h: 0.15 * n, profile: box(0.12), tier: n === 1 ? 1 : n === 2 ? 1 : 2 });
for (let n = 1; n <= 3; n++)
  for (const [ci, col] of ['#b8864e', '#8a6a4a'].entries())
    add(`t.crates.${n}.${ci}`, `${n} caisse${n > 1 ? 's' : ''} en bois ${ci ? 'vieilles' : 'neuves'}`, 'trial', 'obstacle', () =>
      sprite(0.7 * n, 0.6, (c) => {
        for (let k = 0; k < n; k++) {
          const x = -0.35 * n + k * 0.7;
          rect(c, x, -0.6, 0.7, 0.6, sideGrad(c, x, x + 0.7, col), 0.035);
          line(c, [[x + 0.05, -0.55], [x + 0.65, -0.05]], shade(col, -0.3), 0.04, false);
          rect(c, x, -0.6, 0.7, 0.07, shade(col, 0.15), 0.02);
        }
      }), 1, { w: 0.7 * n, h: 0.6, profile: box(0.12 / n), tier: 2 });
for (const [i, col, stripe, nm] of [[0, '#9a9aa2', null, 'gris'], [1, '#b0aaa0', null, 'beige'], [2, '#9a9aa2', '#f2d22a', 'balisé'], [3, '#c8c8cc', '#d8261f', 'rouge et blanc']] as [number, string, string | null, string][])
  for (const h of [0.35, 0.5])
    add(`t.block.${i}.${h}`, `Bloc béton ${nm} ${Math.round(h * 100)} cm`, 'trial', 'obstacle', () =>
      sprite(1.4, h, (c) => {
        rect(c, -0.7, -h, 1.4, h, sideGrad(c, -0.7, 0.7, col), 0.04, 0.06);
        if (stripe) for (let k = 0; k < 4; k++) poly(c, [[-0.6 + k * 0.35, -h + 0.02], [-0.45 + k * 0.35, -h + 0.02], [-0.6 + k * 0.35, -0.02], [-0.75 + k * 0.35, -0.02]], stripe, 0);
      }), 1, { w: 1.4, h, profile: box(0.14), tier: h > 0.4 ? 3 : 2 });
for (const [i, col, R] of [[0, '#8a5a33', 0.35], [1, '#8a5a33', 0.48], [2, '#2a6ad8', 0.35], [3, '#d8261f', 0.45]] as [number, string, number][])
  add(`t.spool.${i}`, `Touret de câble ${['petit', 'grand', 'bleu', 'rouge'][i]}`, 'trial', 'obstacle', () =>
    sprite(R * 2, R * 2, (c) => {
      ell(c, 0, -R, R, R, sideGrad(c, -R, R, col), 0.04);
      ell(c, 0, -R, R * 0.4, R * 0.4, '#3a3a3a', 0.03);
      for (let k = 0; k < 6; k++) line(c, [[0, -R], [Math.cos(k) * R * 0.95, -R + Math.sin(k) * R * 0.95]], shade(col, -0.25), 0.03, false);
    }), 1, { w: R * 2, h: R * 2, profile: round, tier: R > 0.4 ? 3 : 2 });
for (let n = 1; n <= 3; n++)
  for (const lying of [true, false])
    add(`t.tyres.${n}.${lying ? 'l' : 's'}`, `${n} pneu${n > 1 ? 's' : ''} de tracteur ${lying ? 'couchés' : 'debout'}`, 'trial', 'obstacle', () => {
      const w = lying ? 1.3 : 0.5 * n;
      const h = lying ? 0.28 * n : 1.2;
      return sprite(w, h, (c) => {
        if (lying)
          for (let k = 0; k < n; k++) {
            rect(c, -0.65, -0.28 * (k + 1), 1.3, 0.28, sideGrad(c, -0.65, 0.65, '#2a2724'), 0.035, 0.12);
            for (let j = 0; j < 6; j++) line(c, [[-0.55 + j * 0.22, -0.28 * (k + 1) + 0.04], [-0.48 + j * 0.22, -0.28 * k - 0.04]], '#45403a', 0.03, false);
          }
        else
          for (let k = 0; k < n; k++) {
            const x = -0.25 * n + 0.25 + k * 0.5;
            ell(c, x, -0.6, 0.25, 0.6, '#2a2724', 0.035);
            ell(c, x, -0.6, 0.1, 0.32, '#141210', 0);
          }
      });
    }, 1, lying ? { w: 1.3, h: 0.28 * n, profile: box(0.15), tier: n === 1 ? 1 : n === 2 ? 2 : 3 } : { w: 0.5 * n, h: 1.2, profile: (u) => 0.5 * round(u), tier: 3 });
for (const [i, col] of ['#2a6ad8', '#d8261f', '#2f8a3a', '#f2d22a'].entries())
  add(`t.barrel.${i}`, `Fût couché ${['bleu', 'rouge', 'vert', 'jaune'][i]}`, 'trial', 'obstacle', () =>
    sprite(0.9, 0.6, (c) => {
      rect(c, -0.45, -0.6, 0.9, 0.6, sideGrad(c, -0.45, 0.45, col), 0.035, 0.28);
      for (const x of [-0.2, 0.2]) line(c, [[x, -0.58], [x, -0.02]], shade(col, -0.3), 0.03, false);
    }), 1, { w: 0.9, h: 0.6, profile: round, tier: 2 });
for (let i = 0; i < 3; i++)
  add(`t.logpile.${i}`, `Empilement de troncs ${i + 1}`, 'trial', 'obstacle', () => {
    const n = 2 + i;
    return sprite(0.5 * n, 0.25 * 2 + 0.05, (c) => {
      for (let k = 0; k < n; k++) {
        ell(c, -0.25 * n + 0.25 + k * 0.5, -0.25, 0.25, 0.25, '#d6a670', 0.035);
        ell(c, -0.25 * n + 0.25 + k * 0.5, -0.25, 0.1, 0.1, '#b8834e', 0);
      }
      for (let k = 0; k < n - 1; k++) {
        ell(c, -0.25 * n + 0.5 + k * 0.5, -0.66, 0.22, 0.22, '#d6a670', 0.035);
      }
    });
  }, 1, { w: 1 + i * 0.5, h: 0.88, profile: (u) => 0.55 + 0.45 * Math.sqrt(Math.max(0, 1 - (2 * u - 1) ** 2)), tier: i === 0 ? 2 : 3 });
for (const [i, R] of [[0, 0.22], [1, 0.3], [2, 0.38]] as [number, number][])
  add(`t.log.${i}`, `Gros tronc Ø${Math.round(R * 200)} cm`, 'trial', 'obstacle', () =>
    sprite(R * 2, R * 2, (c) => {
      ell(c, 0, -R, R, R, sideGrad(c, -R, R, '#7a4a2a'), 0.04);
      ell(c, -R * 0.15, -R * 1.05, R * 0.75, R * 0.75, '#d6a670', 0.03);
      for (let k = 1; k < 4; k++) ell(c, -R * 0.15, -R * 1.05, R * 0.2 * k, R * 0.2 * k, 'rgba(0,0,0,0)', 0.012, '#a8733e');
    }), 1, { w: R * 2, h: R * 2, profile: round, tier: R > 0.3 ? 2 : 1 });
for (let i = 0; i < 6; i++)
  add(`t.rockstep.${i}`, `Marche rocheuse ${i + 1}`, 'trial', 'obstacle', (r) => {
    const W = 1.6 + (i % 3) * 0.5;
    const H = 0.3 + (i % 3) * 0.12;
    return sprite(W, H, (c) => {
      poly(c, [[-W / 2, 0], [-W / 2 + 0.18, -H], [W / 2 - 0.2, -H - r.range(0, 0.04)], [W / 2, 0]], sideGrad(c, -W / 2, W / 2, i < 3 ? '#9a9aa2' : '#c8784a'), 0.04);
      line(c, [[-W * 0.2, -H * 0.8], [W * 0.1, -H * 0.4]], 'rgba(30,30,40,0.5)', 0.03, false);
    });
  }, 1, { w: 1.6 + (i % 3) * 0.5, h: 0.3 + (i % 3) * 0.12, profile: box(0.11), tier: i % 3 === 2 ? 3 : 2 });
for (let i = 0; i < 3; i++)
  add(`t.pipe.${i}`, `Buse en béton ${i + 1}`, 'trial', 'obstacle', () => {
    const R = 0.3 + i * 0.07;
    return sprite(R * 2, R * 2, (c) => {
      ell(c, 0, -R, R, R, sideGrad(c, -R, R, '#b0b0b4'), 0.04);
      ell(c, 0, -R, R * 0.7, R * 0.7, '#4a4a50', 0.03);
    });
  }, 1, { w: 0.6 + i * 0.14, h: 0.6 + i * 0.14, profile: round, tier: 3 });
for (let i = 0; i < 3; i++)
  add(`t.plank.${i}`, `Rampe en planches ${i + 1}`, 'trial', 'obstacle', () => {
    const W = 2.2 + i * 0.5;
    const H = 0.45 + i * 0.12;
    return sprite(W, H, (c) => {
      poly(c, [[-W / 2, 0], [W * 0.2, -H], [W / 2, -H], [W / 2, 0]], sideGrad(c, -W / 2, W / 2, '#b8864e'), 0.04);
      for (let k = 1; k < 5; k++) line(c, [[-W / 2 + k * W * 0.14, -0.02], [-W / 2 + k * W * 0.14, -k * W * 0.14 * (H / (W * 0.7)) + 0.02]], '#7a4a2a', 0.02, false);
      rect(c, W / 2 - 0.12, -H, 0.12, H, '#7a4a2a', 0.02);
    });
  }, 1, { w: 2.2 + i * 0.5, h: 0.45 + i * 0.12, profile: (u) => (u < 0.7 ? u / 0.7 : 1 - Math.max(0, (u - 0.95) / 0.05)), tier: 1 });
for (let i = 0; i < 3; i++)
  add(`t.brick.${i}`, `Muret de briques ${i + 1}`, 'trial', 'obstacle', () => {
    const H = 0.3 + i * 0.1;
    return sprite(1.2, H, (c) => {
      rect(c, -0.6, -H, 1.2, H, '#b8502e', 0.035);
      for (let row = 0; row * 0.1 < H - 0.01; row++) {
        line(c, [[-0.6, -0.1 * row], [0.6, -0.1 * row]], '#e6d2b0', 0.012, false);
        for (let x = -0.6 + (row % 2) * 0.12; x < 0.6; x += 0.24) line(c, [[x, -0.1 * row], [x, -0.1 * (row + 1)]], '#e6d2b0', 0.012, false);
      }
    });
  }, 1, { w: 1.2, h: 0.3 + i * 0.1, profile: box(0.15), tier: i ? 3 : 2 });
for (let i = 0; i < 2; i++)
  add(`t.ibc.${i}`, `Cuve couchée ${i + 1}`, 'trial', 'obstacle', () =>
    sprite(1.2, 0.55, (c) => {
      rect(c, -0.6, -0.55, 1.2, 0.55, 'rgba(240,240,240,0.9)', 0.035, 0.05);
      for (let k = 0; k < 5; k++) line(c, [[-0.6 + k * 0.3, -0.55], [-0.6 + k * 0.3, 0]], '#8a8a92', 0.03, false);
      rect(c, -0.55, -0.35, 1.1, 0.3, i ? 'rgba(80,160,230,0.6)' : 'rgba(240,200,80,0.6)', 0);
    }), 1, { w: 1.2, h: 0.55, profile: box(0.15), tier: 3 });
for (let i = 0; i < 2; i++)
  add(`t.stairs.${i}`, `Escalier béton ${i + 2} marches`, 'trial', 'obstacle', () => {
    const n = i + 2;
    const H = 0.22 * n;
    const W = 0.9 * n * 2;
    return sprite(W, H, (c) => {
      for (let k = 0; k < n; k++) {
        const w = W - k * 0.9 * 2;
        rect(c, -w / 2, -0.22 * (k + 1), w, 0.22, sideGrad(c, -w / 2, w / 2, '#b0b0b4'), 0.035);
      }
    });
  }, 1, { w: 0.9 * (i + 2) * 2, h: 0.22 * (i + 2), profile: steps(i + 2), tier: i ? 3 : 2 });
for (let i = 0; i < 2; i++)
  add(`t.dirtramp.${i}`, `Butte de terre ${i + 1}`, 'trial', 'obstacle', (r) => {
    const W = 3 + i;
    const H = 0.6 + i * 0.25;
    return sprite(W, H, (c) => {
      poly(c, [[-W / 2, 0], [W * 0.2, -H], [W * 0.25, -H], [W / 2, 0]], sideGrad(c, -W / 2, W / 2, '#a8703f'), 0.04);
      for (let k = 0; k < 6; k++) ell(c, r.range(-W * 0.3, W * 0.3), -r.range(0.05, H * 0.5), 0.06, 0.04, '#8a8a92', 0.012);
    });
  }, 1, { w: 3 + i, h: 0.6 + i * 0.25, profile: ramp, tier: i ? 2 : 1 });
add('t.sandbags.0', 'Sacs de sable', 'trial', 'obstacle', (r) =>
  sprite(1.4, 0.4, (c) => {
    for (let row = 0; row < 2; row++) for (let k = 0; k < 4 - row; k++) ell(c, -0.48 + k * 0.32 + row * 0.16, -0.1 - row * 0.18, 0.17, 0.1, shade('#c8b48a', r.range(-0.1, 0.1)), 0.025);
  }), 1, { w: 1.4, h: 0.38, profile: round, tier: 1 });
add('t.carhood.0', 'Épave de voiture (capot)', 'trial', 'obstacle', () =>
  sprite(3, 0.9, (c) => {
    poly(c, [[-1.5, 0], [-1.2, -0.6], [-0.2, -0.9], [1.2, -0.85], [1.5, 0]], sideGrad(c, -1.5, 1.5, '#8a3a2a'), 0.04);
    ell(c, -0.9, -0.15, 0.25, 0.25, '#2a2420', 0.03);
    ell(c, 0.9, -0.15, 0.25, 0.25, '#2a2420', 0.03);
    rect(c, -0.3, -0.8, 1.0, 0.25, 'rgba(160,210,240,0.6)', 0.02);
  }), 1, { w: 3, h: 0.9, profile: (u) => Math.min(1, u * 2.2, (1 - u) * 3), tier: 3 });

// ---- trial decor: gates 6, tape poles 4, tents 3, spectators 12, scoreboards 2, judges 2,
//      container 3, vans 2, toolboxes 2, cones 2
const gate = (c: Ctx, col: string, check = false): void => {
  line(c, [[0, 0], [0, -1.8]], '#e6e6e6', 0.05);
  if (check) for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) rect(c, 0.03 + i * 0.12, -1.8 + j * 0.12, 0.12, 0.12, (i + j) % 2 ? INK : '#ffffff', 0);
  else poly(c, [[0.03, -1.8], [0.6, -1.6], [0.03, -1.4]], col, 0.02);
};
for (const [i, col, nm, chk] of [[0, '#2fa84f', 'Porte de départ', false], [1, '', 'Porte d’arrivée', true], [2, '#d8261f', 'Fanion rouge', false], [3, '#1f6fd6', 'Fanion bleu', false], [4, '#f2d22a', 'Fanion jaune', false], [5, '#ffffff', 'Fanion blanc', false]] as [number, string, string, boolean][])
  add(`t.gate.${i}`, nm, 'trial', 'trackside', () => sprite(0.8, 1.9, (c) => gate(c, col, chk)), i < 2 ? 0 : 1);
for (let i = 0; i < 4; i++)
  add(`t.tape.${i}`, `Piquets et rubalise ${i + 1}`, 'trial', 'trackside', () =>
    sprite(3, 1, (c) => {
      for (const x of [-1.4, 0, 1.4]) line(c, [[x, 0], [x, -0.85]], '#e6e6e6', 0.04);
      for (let k = 0; k < 2; k++) {
        c.beginPath();
        c.moveTo(-1.4 + k * 1.4, -0.8);
        c.quadraticCurveTo(-0.7 + k * 1.4, -0.65, 0 + k * 1.4, -0.8);
        c.strokeStyle = i % 2 ? '#d8261f' : '#f2d22a';
        c.lineWidth = 0.05;
        c.stroke();
      }
    }),
  );
const tent = (c: Ctx, W: number, col: string, text: string | null): void => {
  for (const x of [-W / 2 + 0.05, W / 2 - 0.05]) line(c, [[x, 0], [x, -2.1]], '#d8d8de', 0.05);
  poly(c, [[-W / 2 - 0.1, -2.1], [0, -2.9], [W / 2 + 0.1, -2.1]], sideGrad(c, -W / 2, W / 2, col), 0.04);
  rect(c, -W / 2 - 0.1, -2.2, W + 0.2, 0.3, shade(col, -0.15), 0.03);
  if (text) label(c, text, 0, -2.05, 0.22, '#ffffff');
};
for (const [i, col] of ['#d8261f', '#1f6fd6', '#2fa84f'].entries()) add(`t.tent.${i}`, `Tente des juges ${i + 1}`, 'trial', 'trackside', () => sprite(3.2, 3, (c) => tent(c, 3, col, 'TRIAL')), 0.5);
for (let i = 0; i < 12; i++)
  add(`t.fan.${i}`, `Spectateur trial ${i + 1}`, 'trial', 'trackside', (r) => sprite(1.1, 2.2, (c) => person(c, 0, person0(r, (['stand', 'cheer', 'point', 'camera', 'sit'] as const)[i % 5]))), 1);
for (let i = 0; i < 2; i++)
  add(`t.board.${i}`, `Tableau des points ${i + 1}`, 'trial', 'trackside', () =>
    sprite(1.8, 2.2, (c) => {
      for (const x of [-0.8, 0.8]) line(c, [[x, 0], [x, -2]], '#6a6a72', 0.05);
      rect(c, -0.9, -2.1, 1.8, 1.0, '#1a1a1e', 0.04);
      for (let k = 0; k < 3; k++) label(c, ['0', '1', '5'][k], -0.5 + k * 0.5, -1.6, 0.35, ['#2fa84f', '#f2d22a', '#d8261f'][k], null, false);
    }), 0.5);
for (let i = 0; i < 2; i++) add(`t.judge.${i}`, `Juge de zone ${i + 1}`, 'trial', 'trackside', (r) => sprite(1.2, 2.2, (c) => person(c, 0, { ...person0(r, i ? 'point' : 'stand', '#f2d22a'), hat: '#1a1a1e' })), 0.6);
for (const [i, col] of ['#2a6ad8', '#d8261f', '#2f8a3a'].entries())
  add(`t.container.${i}`, `Conteneur ${['bleu', 'rouge', 'vert'][i]}`, 'trial', 'trackside', () =>
    sprite(6, 2.6, (c) => {
      rect(c, -3, -2.6, 6, 2.6, sideGrad(c, -3, 3, col), 0.05);
      for (let k = 1; k < 15; k++) line(c, [[-3 + k * 0.4, -2.55], [-3 + k * 0.4, -0.05]], shade(col, -0.2), 0.03, false);
    }), 0.3);
for (let i = 0; i < 2; i++)
  add(`t.van.${i}`, `Fourgon d’équipe ${i + 1}`, 'trial', 'trackside', () =>
    sprite(5, 2.6, (c) => {
      const col = i ? '#f2f2f2' : '#d8261f';
      rect(c, -2.4, -2.3, 4.8, 1.9, sideGrad(c, -2.4, 2.4, col), 0.05, 0.2);
      rect(c, 1.4, -2.1, 0.9, 0.7, 'rgba(160,210,240,0.8)', 0.03, 0.05);
      label(c, i ? 'RIDGE' : 'TRIAL TEAM', -0.4, -1.4, 0.4, i ? '#d8261f' : '#ffffff');
      for (const x of [-1.5, 1.5]) ell(c, x, -0.38, 0.38, 0.38, '#2a2420', 0.04);
    }), 0.3);
for (let i = 0; i < 2; i++) add(`t.toolbox.${i}`, `Caisse à outils ${i + 1}`, 'trial', 'trackside', () => sprite(0.8, 0.5, (c) => rect(c, -0.4, -0.45, 0.8, 0.45, sideGrad(c, -0.4, 0.4, i ? '#d8261f' : '#2a2a2e'), 0.03, 0.04)), 0.5);
for (let i = 0; i < 2; i++) add(`t.cone.${i}`, `Plots ${i + 1}`, 'trial', 'trackside', () => sprite(0.9, 0.5, (c) => { for (let k = 0; k <= i; k++) { const x = -0.2 + k * 0.4; poly(c, [[x - 0.15, 0], [x, -0.45], [x + 0.15, 0]], '#ff7a1a', 0.025); rect(c, x - 0.09, -0.25, 0.18, 0.06, '#ffffff', 0); } }), 0.6);

// ======================================================================= ENDURO

// physical: roots 6, fallen trees 6, river stones 6, mossy logs 4  (low, rideable)
for (let i = 0; i < 6; i++)
  add(`e.roots.${i}`, `Racines ${i + 1}`, 'enduro', 'obstacle', (r) =>
    sprite(2.4, 0.22, (c) => {
      for (let k = 0; k < 3 + (i % 3); k++) {
        const x0 = r.range(-1.1, 0.4);
        c.beginPath();
        c.moveTo(x0, 0);
        c.bezierCurveTo(x0 + 0.3, -0.25, x0 + 0.6, -0.1, x0 + r.range(0.8, 1.2), 0);
        c.strokeStyle = INK;
        c.lineWidth = 0.1;
        c.stroke();
        c.strokeStyle = ['#8a5a33', '#7a4a2a', '#9a6a3a'][k % 3];
        c.lineWidth = 0.07;
        c.stroke();
      }
    }), 1, { w: 2.4, h: 0.12, profile: (u) => 0.5 + 0.5 * Math.sin(u * Math.PI * 4) ** 2, tier: 1 });
for (let i = 0; i < 6; i++)
  add(`e.fallen.${i}`, `Arbre tombé ${i + 1}`, 'enduro', 'obstacle', (r) => {
    const R = 0.16 + (i % 3) * 0.04;
    return sprite(R * 2 + 0.2, R * 2 + 0.1, (c) => {
      ell(c, 0, -R, R, R, sideGrad(c, -R, R, i < 3 ? '#6a4a2a' : '#8a7a6a'), 0.04);
      ell(c, -R * 0.1, -R * 1.02, R * 0.7, R * 0.7, '#d6a670', 0.025);
      if (i % 2) for (let k = 0; k < 3; k++) ell(c, r.range(-R, R), -R * 1.8, 0.07, 0.04, '#5aa83f', 0.012);
    });
  }, 1, { w: 0.4 + (i % 3) * 0.08, h: 0.32 + (i % 3) * 0.08, profile: round, tier: 1 });
for (let i = 0; i < 6; i++)
  add(`e.stones.${i}`, `Pierrier ${i + 1}`, 'enduro', 'obstacle', (r) =>
    sprite(2.6, 0.3, (c) => {
      for (let k = 0; k < 9; k++) ell(c, -1.1 + k * 0.28 + r.range(-0.05, 0.05), -0.08, r.range(0.12, 0.18), r.range(0.07, 0.13), shade(i < 3 ? '#9a9aa2' : '#b88a5a', r.range(-0.15, 0.15)), 0.025);
    }), 1, { w: 2.6, h: 0.18, profile: (u) => 0.4 + 0.6 * Math.abs(Math.sin(u * Math.PI * 4.5)), tier: 1 });
for (let i = 0; i < 4; i++)
  add(`e.mosslog.${i}`, `Tronc moussu ${i + 1}`, 'enduro', 'obstacle', (r) =>
    sprite(0.6, 0.5, (c) => {
      ell(c, 0, -0.22, 0.24, 0.22, '#6a4a2a', 0.04);
      ell(c, -0.05, -0.36, 0.2, 0.08, '#5aa83f', 0);
      for (let k = 0; k < 3; k++) ell(c, r.range(-0.15, 0.15), -0.3, 0.04, 0.03, '#78c84a', 0);
    }), 1, { w: 0.48, h: 0.44, profile: round, tier: 2 });
// decor: arrows 8, checkpoint tents 4, marshal flags 6, stakes 4, timing boards 3, fuel stations 2,
//        spectators 12, camera towers 2, straw bales 3, tyre markers 4, first aid 2, quads 2,
//        banners 6, km markers 6, parked bikes 3, taped trees 3, puddles 3, signs 4
for (let i = 0; i < 8; i++)
  add(`e.arrow.${i}`, `Flèche d’enduro ${i + 1}`, 'enduro', 'trackside', () =>
    sprite(1, 1.6, (c) => {
      const col = ['#ffd21f', '#ff7a1a', '#ffffff', '#2fa84f'][i % 4];
      line(c, [[0, 0], [0, -1.4]], '#8a5a33', 0.06);
      rect(c, -0.45, -1.55, 0.9, 0.55, col, 0.03);
      const dir = i < 4 ? 1 : -1;
      poly(c, [[-0.3 * dir, -1.32], [0.1 * dir, -1.32], [0.1 * dir, -1.45], [0.32 * dir, -1.27], [0.1 * dir, -1.1], [0.1 * dir, -1.22], [-0.3 * dir, -1.22]], INK, 0);
    }), 0.8);
for (const [i, col] of ['#ff7a1a', '#1f6fd6', '#2fa84f', '#d8261f'].entries()) add(`e.cptent.${i}`, `Tente de contrôle ${i + 1}`, 'enduro', 'trackside', () => sprite(3.2, 3, (c) => tent(c, 3, col, 'CP')), 0.4);
for (let i = 0; i < 6; i++)
  add(`e.marshal.${i}`, `Commissaire ${i + 1}`, 'enduro', 'trackside', (r) => sprite(1.4, 2.4, (c) => person(c, 0, { ...person0(r, 'flag', '#ff7a1a'), flag: ['#ffd21f', '#2fa84f', '#1f6fd6', '#d8261f', '#ffffff', '#ff7a1a'][i] })), 0.6);
for (let i = 0; i < 4; i++)
  add(`e.stake.${i}`, `Jalons ${i + 1}`, 'enduro', 'trackside', () =>
    sprite(2, 1, (c) => {
      for (let k = 0; k < 3; k++) {
        line(c, [[-0.8 + k * 0.8, 0], [-0.8 + k * 0.8, -0.9]], '#ffffff', 0.04);
        rect(c, -0.83 + k * 0.8, -0.9, 0.06, 0.15, ['#d8261f', '#1f6fd6', '#ff7a1a', '#ffd21f'][i], 0);
      }
    }),
  );
for (let i = 0; i < 3; i++)
  add(`e.timing.${i}`, `Panneau de chronométrage ${i + 1}`, 'enduro', 'trackside', () =>
    sprite(2, 2.6, (c) => {
      for (const x of [-0.85, 0.85]) line(c, [[x, 0], [x, -2.4]], '#6a6a72', 0.05);
      rect(c, -1, -2.5, 2, 0.8, '#1a1a1e', 0.04);
      label(c, ['00:42', '12:07', '03:58'][i], 0, -2.1, 0.4, '#ff3a2a', null, false);
    }), 0.4);
for (let i = 0; i < 2; i++)
  add(`e.fuel.${i}`, `Zone de ravitaillement ${i + 1}`, 'enduro', 'trackside', () =>
    sprite(3, 2.4, (c) => {
      tent(c, 2.6, i ? '#1f6fd6' : '#d8261f', 'FUEL');
      for (let k = 0; k < 3; k++) rect(c, -0.9 + k * 0.6, -0.5, 0.4, 0.5, '#d8261f', 0.025, 0.04);
    }), 0.3);
for (let i = 0; i < 12; i++) add(`e.fan.${i}`, `Spectateur enduro ${i + 1}`, 'enduro', 'trackside', (r) => sprite(1.1, 2.2, (c) => person(c, 0, person0(r, (['stand', 'cheer', 'camera', 'point'] as const)[i % 4]))), 0.8);
for (let i = 0; i < 2; i++)
  add(`e.camtower.${i}`, `Tour caméra ${i + 1}`, 'enduro', 'trackside', (r) =>
    sprite(2, 5, (c) => {
      for (const x of [-0.7, 0.7]) line(c, [[x, 0], [x * 0.6, -3.5]], '#9a9aa2', 0.06);
      for (let k = 1; k < 4; k++) line(c, [[-0.7 + k * 0.05, -k * 0.85], [0.7 - k * 0.05, -k * 0.85]], '#9a9aa2', 0.04);
      rect(c, -0.6, -3.6, 1.2, 0.12, '#6a6a72', 0.03);
      person(c, 0, { ...person0(r, 'camera'), scale: 0.8 });
      c.translate(0, 0);
    }), 0.2);
for (let i = 0; i < 3; i++) add(`e.straw.${i}`, `Ballots de paille ${i + 1}`, 'enduro', 'trackside', () => sprite(2.2, 1, (c) => { for (let k = 0; k <= i; k++) { rect(c, -1 + k * 0.7, -0.5, 0.65, 0.5, sideGrad(c, -1 + k * 0.7, -0.35 + k * 0.7, '#e6c25a'), 0.03, 0.04); } if (i === 2) rect(c, -0.65, -0.95, 0.65, 0.45, '#e6c25a', 0.03, 0.04); }), 0.6);
for (let i = 0; i < 4; i++) add(`e.tyremark.${i}`, `Pneu peint ${i + 1}`, 'enduro', 'trackside', () => sprite(0.9, 0.35, (c) => { rect(c, -0.42, -0.3, 0.84, 0.3, ['#ffffff', '#ffd21f', '#d8261f', '#1f6fd6'][i], 0.03, 0.12); rect(c, -0.2, -0.3, 0.4, 0.08, '#2a2724', 0); }), 0.6);
for (let i = 0; i < 2; i++) add(`e.aid.${i}`, `Poste de secours ${i + 1}`, 'enduro', 'trackside', () => sprite(3.2, 3, (c) => { tent(c, 3, '#ffffff', null); rect(c, -0.12, -2.5, 0.24, 0.6, '#d8261f', 0); rect(c, -0.3, -2.32, 0.6, 0.24, '#d8261f', 0); }), 0.2);
for (const [i, col] of ['#2f8a3a', '#d8261f'].entries())
  add(`e.quad.${i}`, `Quad de commissaire ${i + 1}`, 'enduro', 'trackside', () =>
    sprite(2.2, 1.4, (c) => {
      rect(c, -0.9, -1.0, 1.8, 0.45, sideGrad(c, -0.9, 0.9, col), 0.035, 0.12);
      rect(c, -0.3, -1.25, 0.6, 0.25, '#1a1a1e', 0.025, 0.06);
      for (const x of [-0.65, 0.65]) ell(c, x, -0.3, 0.3, 0.3, '#2a2420', 0.035);
    }), 0.3);
for (let i = 0; i < 6; i++)
  add(`e.banner.${i}`, `Banderole enduro ${i + 1}`, 'enduro', 'trackside', () =>
    sprite(4, 1.4, (c) => {
      for (const x of [-1.9, 1.9]) line(c, [[x, 0], [x, -1.3]], '#9a9aa2', 0.05);
      rect(c, -1.9, -1.3, 3.8, 0.7, ['#1a1a1e', '#ff7a1a', '#1f6fd6', '#2fa84f', '#ffd21f', '#d8261f'][i], 0.03);
      label(c, BRANDS[i + 2], 0, -0.95, 0.42, i === 4 ? '#1a1a1e' : '#ffffff');
    }), 0.5);
for (let i = 0; i < 6; i++)
  add(`e.km.${i}`, `Borne kilométrique ${i + 1}`, 'enduro', 'trackside', () =>
    sprite(0.7, 1.1, (c) => {
      rect(c, -0.3, -0.9, 0.6, 0.9, '#f2f2f2', 0.03, 0.12);
      rect(c, -0.3, -0.9, 0.6, 0.22, '#d8261f', 0.02, 0.1);
      label(c, String(i + 1), 0, -0.45, 0.32, INK, null, false);
    }), 0.4);
for (const [i, col] of ['#1f6fd6', '#ff6a12', '#2fa84f'].entries())
  add(`e.bike.${i}`, `Moto d’enduro garée ${i + 1}`, 'enduro', 'trackside', () =>
    sprite(2.2, 1.4, (c) => {
      for (const x of [-0.7, 0.7]) {
        ell(c, x, -0.36, 0.36, 0.36, '#2a2420', 0.035);
        ell(c, x, -0.36, 0.14, 0.14, '#9a9aa2', 0.02);
      }
      poly(c, [[-0.8, -0.8], [0.0, -0.9], [0.4, -1.05], [0.6, -0.75], [0.1, -0.55], [-0.5, -0.55]], col, 0.03);
      line(c, [[0.45, -1.0], [0.72, -0.36]], '#c8c8cc', 0.05);
      rect(c, -0.75, -0.95, 0.7, 0.1, '#1a1a1e', 0.02);
    }), 0.3);
for (let i = 0; i < 3; i++)
  add(`e.tapedtree.${i}`, `Arbre balisé ${i + 1}`, 'enduro', 'tree', (r) =>
    sprite(3, 6, (c) => {
      rect(c, -0.2, -6, 0.4, 6, sideGrad(c, -0.2, 0.2, '#6e4326'), 0.04);
      crown(c, r, 0, -5, 1.4, 1.2, '#3f8a3a', 9);
      rect(c, -0.22, -1.3, 0.44, 0.12, ['#ffd21f', '#ff7a1a', '#d8261f'][i], 0.02);
    }), 0.6);
for (let i = 0; i < 3; i++) add(`e.puddle.${i}`, `Flaque de boue ${i + 1}`, 'enduro', 'ground', () => sprite(2 + i * 0.4, 0.2, (c) => { ell(c, 0, -0.06, 1 + i * 0.2, 0.08, '#5a3a22', 0.02); ell(c, -0.3, -0.08, 0.5, 0.03, 'rgba(200,230,255,0.6)', 0); }), 0.8);
for (let i = 0; i < 4; i++)
  add(`e.sign.${i}`, ['Panneau DANGER', 'Panneau RALENTIR', 'Panneau !', 'Panneau CP'][i], 'enduro', 'trackside', () =>
    sprite(1, 1.6, (c) => {
      line(c, [[0, 0], [0, -1.3]], '#9a9aa2', 0.05);
      poly(c, [[0, -1.6], [0.42, -0.95], [-0.42, -0.95]], '#ffd21f', 0.04);
      label(c, ['!', '↓', '!', 'CP'][i], 0, -1.15, 0.3, INK, null, false);
    }), 0.6);

// ======================================================================= COURSE (race)

for (let i = 0; i < 2; i++)
  add(`c.startgate.${i}`, `Grille de départ ${i + 1}`, 'course', 'trackside', () =>
    sprite(4, 1.4, (c) => {
      rect(c, -2, -0.9, 4, 0.9, '#9a9aa2', 0.04);
      for (let k = 0; k < 8; k++) rect(c, -1.9 + k * 0.48, -0.85, 0.4, 0.8, i ? '#ff7a1a' : '#1f6fd6', 0.02);
      label(c, 'START', 0, -1.15, 0.35, '#ffffff', INK);
    }), 0);
for (let i = 0; i < 4; i++)
  add(`c.finish.${i}`, `Arche d’arrivée ${i + 1}`, 'course', 'trackside', () =>
    sprite(6, 5, (c) => {
      for (const x of [-2.8, 2.8]) rect(c, x - 0.15, -4.6, 0.3, 4.6, ['#d8261f', '#1f6fd6', '#ff7a1a', '#1a1a1e'][i], 0.04);
      rect(c, -3, -5, 6, 0.8, '#1a1a1e', 0.04);
      for (let k = 0; k < 20; k++) for (let j = 0; j < 2; j++) rect(c, -3 + k * 0.3, -4.2 + j * 0.15, 0.3, 0.15, (k + j) % 2 ? INK : '#ffffff', 0);
      label(c, ['FINISH', 'ARRIVÉE', BRANDS[0], BRANDS[4]][i], 0, -4.62, 0.48, '#ffffff');
    }), 0);
for (let i = 0; i < 12; i++)
  add(`c.banner.${i}`, `Banderole ${BRANDS[i]}`, 'course', 'trackside', () =>
    sprite(4, 1.2, (c) => {
      const bg = SHIRTS[i];
      for (const x of [-1.9, 1.9]) line(c, [[x, 0], [x, -1.1]], '#9a9aa2', 0.05);
      rect(c, -1.9, -1.1, 3.8, 0.75, bg, 0.03);
      label(c, BRANDS[i], 0, -0.72, 0.45, bg === '#f2f2f2' || bg === '#ffd21f' ? INK : '#ffffff');
    }), 1);
for (let i = 0; i < 16; i++)
  add(`c.fan.${i}`, `Spectateur ${i + 1}`, 'course', 'trackside', (r) => sprite(1.1, 2.3, (c) => person(c, 0, person0(r, (['cheer', 'stand', 'cheer', 'point', 'camera', 'flag', 'sit'] as const)[i % 7], undefined, SHIRTS[i % 12]))), 1.5);
for (let i = 0; i < 6; i++)
  add(`c.tyrewall.${i}`, `Mur de pneus ${i + 1}`, 'course', 'trackside', () =>
    sprite(3, 1.2, (c) => {
      const rows = 2 + (i % 2);
      for (let row = 0; row < rows; row++)
        for (let k = 0; k < 6 - row; k++) {
          const x = -1.25 + k * 0.5 + row * 0.25;
          ell(c, x, -0.18 - row * 0.32, 0.26, 0.17, i >= 3 && (k + row) % 2 ? ['#ffffff', '#d8261f', '#ffd21f'][i - 3] : '#2a2724', 0.03);
        }
    }), 0.7);
for (let i = 0; i < 4; i++)
  add(`c.haybarrier.${i}`, `Barrière de paille ${i + 1}`, 'course', 'trackside', () =>
    sprite(3, 1, (c) => {
      for (let k = 0; k < 3; k++) rect(c, -1.45 + k * 1, -0.6, 0.95, 0.6, sideGrad(c, -1.45 + k, -0.5 + k, '#e6c25a'), 0.03, 0.05);
      if (i % 2) rect(c, -1.45, -0.45, 2.9, 0.15, i > 1 ? '#d8261f' : '#1f6fd6', 0);
    }), 0.7);
for (let i = 0; i < 6; i++)
  add(`c.marshal.${i}`, `Commissaire au drapeau ${['jaune', 'vert', 'bleu', 'blanc', 'rouge', 'à damier'][i]}`, 'course', 'trackside', (r) =>
    sprite(1.4, 2.4, (c) => person(c, 0, { ...person0(r, 'flag', '#ff7a1a'), flag: ['#ffd21f', '#2fa84f', '#1f6fd6', '#ffffff', '#d8261f', '#1a1a1e'][i] })), 0.6);
for (let i = 0; i < 8; i++)
  add(`c.teamtent.${i}`, `Tente d’équipe ${i + 1}`, 'course', 'trackside', () => sprite(4.2, 3.1, (c) => tent(c, 4, SHIRTS[i], BRANDS[i + 4])), 0.5);
for (let i = 0; i < 4; i++)
  add(`c.truck.${i}`, `Camion d’équipe ${i + 1}`, 'course', 'trackside', () =>
    sprite(8, 3.6, (c) => {
      const col = SHIRTS[(i * 3) % 12];
      rect(c, -3.8, -3.3, 5.8, 2.8, sideGrad(c, -3.8, 2, col), 0.05, 0.1);
      label(c, BRANDS[i + 8], -0.9, -2, 0.7, '#ffffff', INK);
      rect(c, 2.1, -2.7, 1.8, 2.2, sideGrad(c, 2.1, 3.9, '#e6e6ea'), 0.05, 0.2);
      rect(c, 2.6, -2.5, 1.0, 0.8, 'rgba(160,210,240,0.8)', 0.03, 0.05);
      for (const x of [-3, -2, 1.2, 3.1]) ell(c, x, -0.45, 0.45, 0.45, '#2a2420', 0.04);
    }), 0.3);
for (let i = 0; i < 3; i++)
  add(`c.stand.${i}`, `Tribune ${i + 1}`, 'course', 'trackside', (r) =>
    sprite(7, 4, (c) => {
      for (let k = 0; k < 4; k++) rect(c, -3.3 + k * 0.25, -1 - k * 0.8, 6.6 - k * 0.5, 0.25, '#9a9aa2', 0.03);
      for (let k = 0; k < 4; k++) for (let j = 0; j < 9 - k; j++) {
        const x = -3 + k * 0.25 + j * 0.7;
        const y = -1.25 - k * 0.8;
        ell(c, x, y - 0.3, 0.12, 0.13, r.pick(SKINS), 0.02);
        rect(c, x - 0.18, y - 0.18, 0.36, 0.2, r.pick(SHIRTS), 0.02, 0.05);
      }
      poly(c, [[-3.6, -4], [3.6, -4], [3.3, -3.6], [-3.3, -3.6]], i ? '#1f6fd6' : '#d8261f', 0.04);
    }), 0.3);
for (let i = 0; i < 2; i++)
  add(`c.tvtower.${i}`, `Tour TV ${i + 1}`, 'course', 'trackside', (r) =>
    sprite(2.2, 6, (c) => {
      for (const x of [-0.8, 0.8]) line(c, [[x, 0], [x * 0.7, -4.5]], '#9a9aa2', 0.07);
      for (let k = 1; k < 5; k++) line(c, [[-0.8 + k * 0.05, -k * 0.9], [0.8 - k * 0.05, -k * 0.9]], '#9a9aa2', 0.04);
      rect(c, -0.9, -4.7, 1.8, 0.2, '#6a6a72', 0.03);
      c.save();
      c.translate(0, -4.5);
      person(c, 0, { ...person0(r, 'camera'), scale: 0.75 });
      c.restore();
    }), 0.2);
for (let i = 0; i < 3; i++)
  add(`c.light.${i}`, `Mât d’éclairage ${i + 1}`, 'course', 'trackside', () =>
    sprite(1.6, 8, (c) => {
      line(c, [[0, 0], [0, -7.2]], '#9a9aa2', 0.12);
      rect(c, -0.7, -7.9, 1.4, 0.7, '#3a3a40', 0.04);
      for (let k = 0; k < 3; k++) ell(c, -0.45 + k * 0.45, -7.55, 0.15, 0.15, '#fff6c8', 0.02);
    }), 0.2);
for (let i = 0; i < 8; i++)
  add(`c.number.${i}`, `Panneau ${['1', '2', '3', '4', '5', 'JUMP', 'S1', 'S2'][i]}`, 'course', 'trackside', () =>
    sprite(1, 1.6, (c) => {
      line(c, [[0, 0], [0, -1.2]], '#9a9aa2', 0.05);
      rect(c, -0.45, -1.6, 0.9, 0.6, '#ffffff', 0.035, 0.05);
      label(c, ['1', '2', '3', '4', '5', 'JUMP', 'S1', 'S2'][i], 0, -1.3, i === 5 ? 0.22 : 0.4, '#d8261f', null, false);
    }), 0.4);
for (let i = 0; i < 4; i++)
  add(`c.fence.${i}`, `Barrière ${['Vauban', 'en filet', 'publicitaire', 'en bois'][i]}`, 'course', 'trackside', () =>
    sprite(3, 1.2, (c) => {
      if (i === 0) {
        rect(c, -1.45, -1.05, 2.9, 1.0, 'rgba(0,0,0,0)', 0.05, 0, '#b8b8c0');
        for (let k = 0; k < 13; k++) line(c, [[-1.4 + k * 0.23, -1.0], [-1.4 + k * 0.23, -0.1]], '#b8b8c0', 0.025, false);
      } else if (i === 1) {
        rect(c, -1.45, -1.0, 2.9, 0.9, 'rgba(255,122,26,0.75)', 0.03);
        for (let k = 0; k < 10; k++) line(c, [[-1.4 + k * 0.3, -1.0], [-1.4 + k * 0.3, -0.1]], '#ffffff', 0.015, false);
      } else if (i === 2) {
        rect(c, -1.45, -0.9, 2.9, 0.8, '#1f6fd6', 0.03);
        label(c, BRANDS[13], 0, -0.5, 0.4, '#ffffff');
      } else {
        for (const x of [-1.4, 0, 1.4]) rect(c, x - 0.05, -1.0, 0.1, 1.0, '#8a5a33', 0.02);
        rect(c, -1.45, -0.9, 2.9, 0.1, '#a8733e', 0.02);
        rect(c, -1.45, -0.5, 2.9, 0.1, '#a8733e', 0.02);
      }
    }), 1);
for (let i = 0; i < 6; i++)
  add(`c.inflatable.${i}`, `Arche gonflable ${BRANDS[i + 6]}`, 'course', 'trackside', () =>
    sprite(6, 4.6, (c) => {
      const col = SHIRTS[(i + 2) % 12];
      c.beginPath();
      c.moveTo(-2.9, 0);
      c.quadraticCurveTo(-2.9, -4.4, 0, -4.4);
      c.quadraticCurveTo(2.9, -4.4, 2.9, 0);
      c.lineTo(2.2, 0);
      c.quadraticCurveTo(2.2, -3.6, 0, -3.6);
      c.quadraticCurveTo(-2.2, -3.6, -2.2, 0);
      c.closePath();
      c.fillStyle = sideGrad(c, -2.9, 2.9, col);
      c.fill();
      c.strokeStyle = INK;
      c.lineWidth = 0.05;
      c.stroke();
      label(c, BRANDS[i + 6], 0, -4.0, 0.42, '#ffffff', INK);
    }), 0.3);
for (let i = 0; i < 2; i++) add(`c.photo.${i}`, `Photographe ${i + 1}`, 'course', 'trackside', (r) => sprite(1.2, 2.2, (c) => person(c, 0, { ...person0(r, 'camera', '#2a2a2e'), hat: i ? '#ff7a1a' : undefined })), 0.6);
add('c.podium.0', 'Podium', 'course', 'trackside', () =>
  sprite(4, 2.2, (c) => {
    rect(c, -0.7, -1.6, 1.4, 1.6, '#f2c23a', 0.04);
    rect(c, -2, -1.1, 1.3, 1.1, '#c8ccd4', 0.04);
    rect(c, 0.7, -0.8, 1.3, 0.8, '#c88a4a', 0.04);
    label(c, '1', 0, -0.8, 0.6, '#ffffff', INK, false);
    label(c, '2', -1.35, -0.55, 0.5, '#ffffff', INK, false);
    label(c, '3', 1.35, -0.4, 0.45, '#ffffff', INK, false);
  }), 0.2);
for (let i = 0; i < 2; i++) add(`c.mechanic.${i}`, `Mécanicien ${i + 1}`, 'course', 'trackside', (r) => sprite(1.2, 2.2, (c) => person(c, 0, { ...person0(r, i ? 'point' : 'stand', i ? '#d8261f' : '#1f6fd6'), pants: i ? '#d8261f' : '#1f6fd6' })), 0.5);
for (let i = 0; i < 4; i++)
  add(`c.camper.${i}`, `Camping-car ${i + 1}`, 'course', 'trackside', () =>
    sprite(6, 3, (c) => {
      rect(c, -2.9, -2.8, 5.8, 2.3, sideGrad(c, -2.9, 2.9, '#f2f2f2'), 0.05, 0.3);
      rect(c, -2.9, -1.7, 5.8, 0.3, SHIRTS[i * 2], 0);
      for (let k = 0; k < 3; k++) rect(c, -2.2 + k * 1.2, -2.5, 0.8, 0.55, 'rgba(160,210,240,0.8)', 0.025, 0.05);
      for (const x of [-1.8, 1.8]) ell(c, x, -0.42, 0.42, 0.42, '#2a2420', 0.04);
    }), 0.3);
for (let i = 0; i < 3; i++)
  add(`c.flagpole.${i}`, `Mât à drapeau ${i + 1}`, 'course', 'trackside', () =>
    sprite(1.6, 5, (c) => {
      line(c, [[0, 0], [0, -4.8]], '#d8d8de', 0.06);
      c.beginPath();
      c.moveTo(0.03, -4.8);
      c.quadraticCurveTo(0.6, -5.0, 1.3, -4.7);
      c.lineTo(1.2, -3.6);
      c.quadraticCurveTo(0.6, -3.9, 0.03, -3.7);
      c.closePath();
      c.fillStyle = SHIRTS[i * 4];
      c.fill();
      c.strokeStyle = INK;
      c.lineWidth = 0.03;
      c.stroke();
    }), 0.5);
// little extras so the paddock feels alive
for (let i = 0; i < 4; i++) add(`c.cooler.${i}`, `Glacière et chaises ${i + 1}`, 'course', 'trackside', () => sprite(1.8, 1, (c) => { rect(c, -0.8, -0.4, 0.6, 0.4, SHIRTS[i + 4], 0.03, 0.05); line(c, [[0.1, 0], [0.3, -0.45], [0.7, -0.45], [0.8, 0]], '#4a4a52', 0.04); rect(c, 0.25, -0.85, 0.5, 0.4, SHIRTS[i], 0.025); }), 0.4);
for (let i = 0; i < 3; i++) add(`c.dog.${i}`, `Chien de paddock ${i + 1}`, 'course', 'trackside', () => sprite(1, 0.7, (c) => { const col = ['#8a5a33', '#2a2420', '#e6d2b0'][i]; for (const x of [-0.25, 0.25]) rect(c, x - 0.04, -0.3, 0.08, 0.3, col, 0.02); ell(c, 0, -0.38, 0.35, 0.13, col, 0.03); ell(c, 0.36, -0.5, 0.12, 0.1, col, 0.03); line(c, [[-0.35, -0.4], [-0.45, -0.6]], col, 0.04); }), 0.3);

// make the crowd feel varied: a few groups of three
for (let i = 0; i < 4; i++)
  add(`c.crowd.${i}`, `Groupe de supporters ${i + 1}`, 'course', 'trackside', (r) =>
    sprite(2.6, 2.4, (c) => {
      for (let k = 0; k < 3; k++) person(c, -0.8 + k * 0.8, { ...person0(r, k === 1 ? 'cheer' : (['stand', 'point', 'camera'] as const)[(i + k) % 3]), scale: r.range(0.85, 1.05) });
    }), 1);
// forest dressing for enduro (reuses the painting toolkit)
for (let i = 0; i < 4; i++) add(`e.bush.${i}`, `Taillis ${i + 1}`, 'enduro', 'bush', (r) => sprite(1.8, 1.3, (c) => crown(c, r, 0, -0.6, 0.9, 0.6, ['#3f8a3a', '#5aa83f', '#2f6e3a', '#6a9a3a'][i], 9)), 0.8);
void ell;

export const MODE_ASSETS = out;
