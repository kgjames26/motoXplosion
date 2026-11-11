import * as THREE from 'three';
import { hash1 } from '../core/math';
import type { Bridge } from '../world/types';
import type { World } from '../world/world';
import type { TextureBank } from './textures';
import { Z_BACK, Z_FRONT } from './terrain';

/**
 * 3D bridges. Physics only knows the deck line (heightfield); the structures are visual:
 * rope & plank bridge, stone arch bridge (extruded masonry with arch openings), riveted steel
 * truss bridge on stone piers, and tall stone viaducts across valleys.
 */

const ZB = Z_BACK - 0.2; // back side of the deck
const ZF = Z_FRONT + 0.2; // front side of the deck

class Members {
  readonly list: THREE.Matrix4[] = [];
  readonly colors: THREE.Color[] = [];
  private q = new THREE.Quaternion();
  private v = new THREE.Vector3();
  private x = new THREE.Vector3(1, 0, 0);

  /** Box from a to b with a square/rect section. */
  beam(ax: number, ay: number, az: number, bx: number, by: number, bz: number, t: number, t2 = t, color?: THREE.Color): void {
    this.v.set(bx - ax, by - ay, bz - az);
    const len = this.v.length();
    this.q.setFromUnitVectors(this.x, this.v.normalize());
    const m = new THREE.Matrix4().compose(new THREE.Vector3((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2), this.q.clone(), new THREE.Vector3(len, t, t2));
    this.list.push(m);
    this.colors.push(color ?? new THREE.Color(1, 1, 1));
  }

  mesh(geo: THREE.BufferGeometry, mat: THREE.Material): THREE.InstancedMesh {
    const im = new THREE.InstancedMesh(geo, mat, Math.max(1, this.list.length));
    this.list.forEach((m, i) => {
      im.setMatrixAt(i, m);
      im.setColorAt(i, this.colors[i]);
    });
    im.count = this.list.length;
    im.castShadow = true;
    im.receiveShadow = true;
    im.computeBoundingSphere();
    return im;
  }
}

export class BridgeBuilder {
  private box = new THREE.BoxGeometry(1, 1, 1);
  private cyl = new THREE.CylinderGeometry(0.5, 0.5, 1, 8).rotateZ(Math.PI / 2);
  private wood: THREE.MeshLambertMaterial;
  private rope: THREE.MeshLambertMaterial;
  private steel: THREE.MeshStandardMaterial;
  private stone: THREE.MeshLambertMaterial;
  private stoneDark: THREE.MeshLambertMaterial;
  private water: THREE.Material;

  constructor(bank: TextureBank, water: THREE.Material) {
    this.wood = new THREE.MeshLambertMaterial({ color: 0xffffff });
    this.rope = new THREE.MeshLambertMaterial({ color: 0xd9b27a });
    this.steel = new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.4, roughness: 0.55 });
    this.stone = new THREE.MeshLambertMaterial({ map: bank.groundTex('stone', 4) });
    this.stoneDark = new THREE.MeshLambertMaterial({ map: bank.groundTex('stone', 4), color: 0xb8b0a6 });
    this.water = water;
  }

  build(w: World, br: Bridge): THREE.Group {
    const g = new THREE.Group();
    switch (br.kind) {
      case 'wood':
        this.woodBridge(g, w, br);
        break;
      case 'stone':
        this.arched(g, w, br, { pier: 1.6, crownDrop: 1.1, ext: 1.4, bottom: (x) => Math.min(w.visualAt(x), br.floorY + 0.5) - 1.5 });
        break;
      case 'iron':
        this.ironBridge(g, w, br);
        break;
      case 'urban':
        this.urbanBridge(g, w, br);
        break;
      case 'viaduct':
        this.arched(g, w, br, { pier: 2.2, crownDrop: 1.3, ext: 3, bottom: (x) => w.visualAt(x) - 2 });
        break;
    }
    if (br.water) {
      const L = br.x1 - br.x0 + 6;
      const plane = new THREE.Mesh(new THREE.PlaneGeometry(L, 24), this.water);
      plane.rotation.x = -Math.PI / 2;
      plane.position.set((br.x0 + br.x1) / 2, br.floorY + 0.8, -2);
      g.add(plane);
    }
    return g;
  }

  dispose(): void {
    this.box.dispose();
    this.cyl.dispose();
    this.wood.dispose();
    this.rope.dispose();
    this.steel.dispose();
    this.stone.dispose();
    this.stoneDark.dispose();
  }

  // ---------------------------------------------------------------- urban (San Francisco)

  /** Concrete overpass: slab deck, round piers, steel railings, street lamps. */
  private urbanBridge(g: THREE.Group, w: World, br: Bridge): void {
    const deck = (x: number) => w.heightAt(x);
    const slab = new Members();
    const steel = new Members();
    const concrete = new THREE.Color(0.86, 0.85, 0.82);
    for (let x = br.x0 - 1; x < br.x1 + 1; x += 1) slab.beam(x, deck(x) - 0.35, (ZB + ZF) / 2, x + 1.02, deck(x + 1) - 0.35, (ZB + ZF) / 2, 0.7, ZF - ZB + 0.6, concrete);
    const n = Math.max(1, br.spans);
    for (let i = 1; i < n; i++) {
      const x = br.x0 + ((br.x1 - br.x0) * i) / n;
      const bottom = Math.min(w.visualAt(x), br.floorY) - 1;
      for (const z of [ZB + 0.3, ZF - 0.3]) slab.beam(x, bottom, z, x, deck(x) - 0.6, z, 1.1, 1.1, concrete);
      slab.beam(x, deck(x) - 1.1, ZB, x, deck(x) - 1.1, ZF, 0.6, 1.4, concrete);
    }
    const rail = new THREE.Color(0.35, 0.4, 0.48);
    for (const z of [ZB - 0.25, ZF + 0.25]) {
      for (let x = br.x0; x <= br.x1; x += 1.5) steel.beam(x, deck(x), z, x, deck(x) + 1.05, z, 0.06, 0.06, rail);
      for (const h of [0.55, 1.05]) for (let x = br.x0; x < br.x1; x += 1.5) steel.beam(x, deck(x) + h, z, x + 1.5, deck(x + 1.5) + h, z, 0.05, 0.05, rail);
    }
    // street lamps on the back side
    for (let x = br.x0 + 3; x < br.x1 - 2; x += 9) {
      steel.beam(x, deck(x), ZB - 0.45, x, deck(x) + 4.2, ZB - 0.45, 0.1, 0.1, rail);
      steel.beam(x, deck(x) + 4.2, ZB - 0.45, x + 0.9, deck(x) + 4.1, ZB - 0.45, 0.08, 0.08, rail);
      steel.beam(x + 0.75, deck(x) + 4.0, ZB - 0.45, x + 1.05, deck(x) + 4.0, ZB - 0.45, 0.12, 0.2, new THREE.Color(1, 0.95, 0.75));
    }
    g.add(slab.mesh(this.box, this.stone), steel.mesh(this.box, this.steel));
  }

  // ---------------------------------------------------------------- wood

  private woodBridge(g: THREE.Group, w: World, br: Bridge): void {
    const deck = (x: number) => w.heightAt(x);
    const planks = new Members();
    const beams = new Members();
    for (let x = br.x0; x < br.x1; x += 0.5) {
      const xa = x + 0.03;
      const xb = x + 0.47;
      const c = 0.8 + hash1(Math.round(x * 10), 3) * 0.35;
      const col = new THREE.Color(0.72 * c, 0.5 * c, 0.3 * c);
      planks.beam(xa, deck(xa) - 0.04, ZB, xa, deck(xa) - 0.04, ZF, 0.07, xb - xa, col);
    }
    const brown = new THREE.Color(0.48, 0.3, 0.17);
    for (const z of [ZB + 0.1, ZF - 0.1]) {
      for (let x = br.x0; x < br.x1; x += 1) beams.beam(x, deck(x) - 0.16, z, x + 1, deck(x + 1) - 0.16, z, 0.18, 0.14, brown);
      // end struts into the cliffs
      beams.beam(br.x0 - 1.5, deck(br.x0) - 3.4, z, br.x0 + 3, deck(br.x0 + 3) - 0.2, z, 0.22, 0.22, brown);
      beams.beam(br.x1 + 1.5, deck(br.x1) - 3.4, z, br.x1 - 3, deck(br.x1 - 3) - 0.2, z, 0.22, 0.22, brown);
    }
    // posts
    const n = Math.max(2, Math.round((br.x1 - br.x0) / 3));
    for (let i = 0; i <= n; i++) {
      const x = br.x0 + ((br.x1 - br.x0) * i) / n;
      const big = i === 0 || i === n;
      for (const z of [ZB, ZF]) beams.beam(x, deck(x) - 0.3, z, x, deck(x) + (big ? 1.9 : 1.35), z, big ? 0.24 : 0.1, big ? 0.24 : 0.1, big ? brown : new THREE.Color(0.78, 0.6, 0.42));
    }
    g.add(planks.mesh(this.box, this.wood), beams.mesh(this.box, this.wood));
    // ropes (catenary)
    for (const z of [ZB, ZF])
      for (const h of [0.75, 1.32]) {
        const pts: THREE.Vector3[] = [];
        for (let x = br.x0; x <= br.x1 + 0.01; x += (br.x1 - br.x0) / 24) {
          const u = (x - br.x0) / (br.x1 - br.x0);
          pts.push(new THREE.Vector3(x, deck(x) + h - Math.sin(Math.PI * u) * 0.3, z));
        }
        const tube = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 48, 0.035, 5), this.rope);
        tube.castShadow = true;
        g.add(tube);
      }
  }

  // ---------------------------------------------------------------- stone & viaduct

  private arched(g: THREE.Group, w: World, br: Bridge, o: { pier: number; crownDrop: number; ext: number; bottom: (x: number) => number }): void {
    const L = br.x1 - br.x0;
    const span = L / br.spans;
    const shape = new THREE.Shape();
    const xa = br.x0 - o.ext;
    const xb = br.x1 + o.ext;
    shape.moveTo(xa, w.heightAt(xa));
    for (let x = xa; x <= xb + 0.01; x += 0.5) shape.lineTo(x, w.heightAt(x));
    for (let x = xb; x >= xa - 0.01; x -= 1) shape.lineTo(x, o.bottom(x));
    shape.closePath();
    const crown = Math.min(w.heightAt(br.x0), w.heightAt(br.x1)) - o.crownDrop;
    for (let i = 0; i < br.spans; i++) {
      const cx = br.x0 + span * (i + 0.5);
      const r = (span - o.pier) / 2;
      const spring = crown - r;
      // the opening must stay strictly inside the outer outline (a thin sill at the bottom)
      const low = Math.max(o.bottom(cx - r), o.bottom(cx), o.bottom(cx + r)) + 0.35;
      if (spring <= low + 0.5) continue;
      const hole = new THREE.Path();
      hole.moveTo(cx - r, low);
      hole.lineTo(cx - r, spring);
      hole.absarc(cx, spring, r, Math.PI, 0, true);
      hole.lineTo(cx + r, low);
      hole.closePath();
      shape.holes.push(hole);
    }
    const depth = ZF - ZB + 0.2;
    const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 10, steps: 1 });
    geo.translate(0, 0, ZB - 0.1);
    const body = new THREE.Mesh(geo, this.stone);
    body.castShadow = true;
    body.receiveShadow = true;
    g.add(body);
    // parapets on both sides (the back one frames the road, the front one stays low)
    const par = new Members();
    for (let x = br.x0 - o.ext; x < br.x1 + o.ext; x += 1) {
      const y0 = w.heightAt(x);
      const y1 = w.heightAt(x + 1);
      par.beam(x, y0 + 0.28, ZB - 0.05, x + 1, y1 + 0.28, ZB - 0.05, 0.6, 0.32);
      par.beam(x, y0 + 0.12, ZF + 0.05, x + 1, y1 + 0.12, ZF + 0.05, 0.3, 0.3);
    }
    g.add(par.mesh(this.box, this.stoneDark));
  }

  // ---------------------------------------------------------------- iron

  private ironBridge(g: THREE.Group, w: World, br: Bridge): void {
    const deck = (x: number) => w.heightAt(x);
    const L = br.x1 - br.x0;
    const spanLen = L / br.spans;
    // stone piers and abutments
    const piers = new Members();
    for (let s = 0; s <= br.spans; s++) {
      const x = br.x0 + s * spanLen;
      const top = deck(x) - 0.55;
      const bottom = Math.min(w.visualAt(x), br.floorY + 0.5) - 2;
      const wdt = s === 0 || s === br.spans ? 2.6 : 1.9;
      piers.beam(x, bottom, (ZB + ZF) / 2, x, top, (ZB + ZF) / 2, wdt, ZF - ZB + 0.8);
    }
    g.add(piers.mesh(this.box, this.stone));
    const red = new THREE.Color(0.7, 0.27, 0.18);
    const dark = new THREE.Color(0.45, 0.17, 0.12);
    const steel = new Members();
    const planks = new Members();
    for (let x = br.x0; x < br.x1; x += 0.6) {
      const c = 0.75 + hash1(Math.round(x * 10), 4) * 0.25;
      planks.beam(x + 0.03, deck(x) - 0.04, ZB, x + 0.03, deck(x) - 0.04, ZF, 0.07, 0.54, new THREE.Color(0.5 * c, 0.4 * c, 0.3 * c));
    }
    const H = 3.4;
    for (let s = 0; s < br.spans; s++) {
      const sx0 = br.x0 + s * spanLen;
      const panels = Math.max(4, Math.round(spanLen / 3));
      const pw = spanLen / panels;
      const top = (x: number) => deck(x) + H * (0.78 + 0.22 * Math.sin((Math.PI * (x - sx0)) / spanLen));
      for (const z of [ZB - 0.1, ZF + 0.1]) {
        const col = z < 0 ? dark : red;
        for (let p = 0; p < panels; p++) {
          const xa = sx0 + p * pw;
          const xb = xa + pw;
          steel.beam(xa, top(xa), z, xb, top(xb), z, 0.24, 0.24, col); // top chord
          steel.beam(xa, deck(xa) - 0.3, z, xb, deck(xb) - 0.3, z, 0.5, 0.2, col); // bottom girder
          steel.beam(xa, deck(xa) - 0.3, z, xa, top(xa), z, 0.14, 0.14, col); // vertical
          if (p < panels / 2) steel.beam(xa, top(xa), z, xb, deck(xb) - 0.2, z, 0.1, 0.1, col);
          else steel.beam(xa, deck(xa) - 0.2, z, xb, top(xb), z, 0.1, 0.1, col);
        }
        steel.beam(sx0 + spanLen, deck(sx0 + spanLen) - 0.3, z, sx0 + spanLen, top(sx0 + spanLen), z, 0.14, 0.14, col);
      }
      // top bracing between the two trusses
      for (let p = 0; p <= panels; p += 2) {
        const x = sx0 + p * pw;
        steel.beam(x, top(x), ZB - 0.1, x, top(x), ZF + 0.1, 0.1, 0.1, dark);
      }
    }
    g.add(planks.mesh(this.box, this.wood), steel.mesh(this.box, this.steel));
  }
}
