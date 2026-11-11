import {
  ell,
  line,
  poly,
  rect,
  rngFor,
  shade,
  sideGrad,
  sprite,
  type Ctx,
} from "./paint";
import type { AssetDef } from "./types";

/**
 * v2.18: 45 big trial modules (1.05 → 1.8 m) — giant crates, big concrete blocks and tractor
 * tyre stacks — for the bigger steps of the later circuits and the large structures. Same
 * chamfered faces as the other modules, so they chain with them.
 */
export const BIG_HEIGHTS = [1.05, 1.2, 1.35, 1.5, 1.8];
const out: AssetDef[] = [];
const run = (w: number, h: number) => Math.min(w / 3, h * 0.52);
function face(
  c: Ctx,
  w: number,
  h: number,
  fill: string | CanvasGradient,
): void {
  const r = run(w, h);
  poly(
    c,
    [
      [-w / 2, 0],
      [-w / 2 + r, -h],
      [w / 2 - r, -h],
      [w / 2, 0],
    ],
    fill,
    0.05,
  );
}
const LOOKS: {
  id: string;
  name: string;
  draw: (c: Ctx, w: number, h: number, k: number) => void;
}[] = [
  {
    id: "caisse",
    name: "Caisse géante",
    draw: (c, w, h, k) => {
      const col = ["#c8955a", "#a8733e", "#b8864e"][k];
      face(c, w, h, sideGrad(c, -w / 2, w / 2, col));
      for (let y = -0.2; y > -h + 0.08; y -= 0.2)
        line(
          c,
          [
            [-w / 2 + run(w, h) * (-y / h) + 0.06, y],
            [w / 2 - run(w, h) * (-y / h) - 0.06, y],
          ],
          shade(col, -0.3),
          0.022,
          false,
        );
      line(
        c,
        [
          [-w / 2 + 0.4, -0.06],
          [w / 2 - 0.4, -h + 0.08],
        ],
        shade(col, -0.25),
        0.04,
        false,
      );
      line(
        c,
        [
          [w / 2 - 0.4, -0.06],
          [-w / 2 + 0.4, -h + 0.08],
        ],
        shade(col, -0.25),
        0.04,
        false,
      );
      rect(
        c,
        -w / 2 + run(w, h) - 0.02,
        -h,
        w - 2 * run(w, h) + 0.04,
        0.07,
        "#e6e2d8",
        0.015,
      );
    },
  },
  {
    id: "bloc",
    name: "Gros bloc béton",
    draw: (c, w, h, k) => {
      const col = ["#b0aca4", "#9a9aa2", "#a8a090"][k];
      face(c, w, h, sideGrad(c, -w / 2, w / 2, col));
      const r = rngFor(`tg.bloc.${w}.${h}.${k}`);
      for (let q = 0; q < 8; q++)
        ell(
          c,
          r.range(-w / 2.6, w / 2.6),
          -r.range(0.08, h - 0.08),
          0.035,
          0.035,
          shade(col, -0.2),
          0,
          null,
        );
      for (
        let x = -w / 2 + run(w, h) + 0.05;
        x < w / 2 - run(w, h) - 0.25;
        x += 0.5
      )
        rect(c, x, -h, 0.25, 0.07, "#ffd21f", 0.008);
    },
  },
  {
    id: "pneus",
    name: "Pile de pneus de tracteur",
    draw: (c, w, h, k) => {
      const n = Math.max(2, Math.round(h / 0.45));
      for (let j = 0; j < n; j++) {
        const inset = run(w, h) * ((j + 1) / n) * 0.9;
        rect(
          c,
          -w / 2 + inset,
          -((j + 1) * h) / n,
          w - 2 * inset,
          h / n,
          sideGrad(c, -w / 2, w / 2, "#2a2724"),
          0.04,
          (h / n) * 0.45,
        );
        if (k)
          line(
            c,
            [
              [-w / 2 + inset + 0.15, -((j + 0.5) * h) / n],
              [w / 2 - inset - 0.15, -((j + 0.5) * h) / n],
            ],
            j % 2 ? "#ffd21f" : "#f2f2f2",
            0.05,
            false,
          );
      }
    },
  },
];
let idx = 0;
for (const look of LOOKS)
  for (const h of BIG_HEIGHTS)
    for (const w of [2, 2.8, 3.6]) {
      const k = idx++ % (look.id === "pneus" ? 2 : 3);
      out.push({
        id: `tg.${look.id}.${h}.${w}.${k}`,
        name: `${look.name} ${Math.round(h * 100)}×${Math.round(w * 100)}`,
        group: "trial",
        slot: "obstacle",
        weight: 1,
        obstacle: {
          w,
          h,
          profile: (u) =>
            Math.min(1, (u * w) / run(w, h), ((1 - u) * w) / run(w, h)),
          tier: 3,
          module: "gros",
        },
        draw: () => sprite(w + 0.3, h + 0.2, (c) => look.draw(c, w, h, k)),
      });
    }
if (out.length !== 45) console.warn("big modules", out.length);
export const BIG_MODULE_ASSETS = out;
