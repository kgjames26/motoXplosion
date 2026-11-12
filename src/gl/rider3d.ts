import * as THREE from 'three';
import { clamp } from '../core/math';
import { darker, fabricBump, GearLook, helmetTexture, jerseyTexture, pantsTexture, sleeveTexture } from './gear';

/**
 * v2.23 rider. A jointed skeleton with a real spine: five vertebrae in the torso and two in
 * the neck. The back curves (lean spread along the spine, plus a hunch that follows the
 * suspension, the landings and the accelerations) instead of tilting like a plank, and a
 * segmented back protector shows it. Arms and legs are solved with two-bone IK (hands on the
 * grips, boots on the pegs); pelvis and chest are mass-spring bodies reacting to the bike.
 *
 * Geometry is about three times denser than the first rider (shaped limbs, gloves with
 * fingers, boots with buckles and soles, MX helmet with chin bar, peak, vents and goggles).
 *
 * Frame: chassis frame of the physics (x forward, y up); +z is the bike's right side (camera).
 */

type V2 = [number, number];

/** Key points of the chassis shared with the bike model. */
export const PEG: V2 = [-0.1, -0.4];
export const GRIP: V2 = [0.36, 0.43];

const SPINE = 5; // torso vertebrae
const SEG = 0.12; // length of one (m)
const NECK = 2;
const NSEG = 0.05;

/** Geometry density: 1 for the player, 0.5 for the other riders (set while building). */
let DETAIL = 1;
const sg = (n: number) => Math.max(5, Math.round(n * DETAIL));

function std(color: number, metalness: number, roughness: number, extra: Partial<THREE.MeshStandardMaterialParameters> = {}): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, metalness, roughness, envMapIntensity: 0.9, ...extra });
}
function shiny(color: number, extra: Partial<THREE.MeshPhysicalMaterialParameters> = {}): THREE.MeshPhysicalMaterial {
  return new THREE.MeshPhysicalMaterial({ color, metalness: 0.1, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.12, envMapIntensity: 1, ...extra });
}

/** Limb segment along +y (0 → 1) with a shaped radius profile; v runs along the limb. */
function limbGeo(radii: number[]): THREE.BufferGeometry {
  const pts = radii.map((r, i) => new THREE.Vector2(r, i / (radii.length - 1)));
  const g = new THREE.LatheGeometry(pts, sg(20));
  // lathe starts at -x; rotate so u = 0 faces +z like the cylinders it replaces
  return g;
}

/** Torso radius (m) along the spine (0 = pelvis … 0.6 = base of the neck). */
function torsoR(y: number): number {
  const P: V2[] = [[0, 0.15], [0.08, 0.155], [0.2, 0.15], [0.34, 0.175], [0.45, 0.19], [0.52, 0.17], [0.575, 0.1], [0.6, 0.06]];
  for (let i = 1; i < P.length; i++) if (y <= P[i][0]) return P[i - 1][1] + ((P[i][1] - P[i - 1][1]) * (y - P[i - 1][0])) / (P[i][0] - P[i - 1][0]);
  return 0.06;
}

/** One vertebra's slice of the torso: a ring overlapping its neighbours, UVs of the whole torso. */
function torsoSlice(i: number): THREE.BufferGeometry {
  const over = 0.045;
  const y0 = i * SEG;
  const pts: THREE.Vector2[] = [];
  if (i === 0) pts.push(new THREE.Vector2(0.001, -0.03));
  const n = 7;
  for (let k = 0; k <= n; k++) {
    const y = -(i ? over : 0.03) + ((SEG + over + (i ? over : 0.03)) * k) / n;
    pts.push(new THREE.Vector2(torsoR(clamp(y0 + y, 0, 0.6)), y));
  }
  if (i === SPINE - 1) pts.push(new THREE.Vector2(0.001, SEG + over + 0.01));
  const g = new THREE.LatheGeometry(pts, sg(32));
  const pos = g.attributes.position;
  const uv = g.attributes.uv;
  for (let k = 0; k < pos.count; k++) {
    uv.setY(k, clamp((y0 + pos.getY(k)) / 0.6, 0, 1));
    pos.setX(k, pos.getX(k) * 0.85);
    pos.setZ(k, pos.getZ(k) * 1.22);
  }
  g.computeVertexNormals();
  return g;
}

export class Rider {
  readonly group = new THREE.Group();
  /** Every material of the rider (for the environment map). */
  readonly materials: THREE.Material[] = [];
  private limbs: Record<string, THREE.Object3D> = {};
  private joints: Record<string, THREE.Object3D> = {};
  private vertebrae: THREE.Group[] = [];
  private neck: THREE.Group[] = [];
  private head: THREE.Group;
  private hips: THREE.Mesh;
  // mass-spring state of the pelvis and chest (chassis frame)
  private pelvis: V2 = [-0.2, 0.3];
  private pelvisV: V2 = [0, 0];
  private lean = 0.35; // mean torso pitch (rad from vertical, forward positive)
  private leanV = 0;
  private curl = 0.1; // extra rounding of the back
  private curlV = 0;

  constructor(mats: Record<string, THREE.Material>, L: GearLook, lite = false) {
    DETAIL = lite ? 0.5 : 1;
    const col = (c: string) => parseInt(c.slice(1), 16);
    const keep = <T extends THREE.Material>(m: T): T => {
      this.materials.push(m);
      return m;
    };
    const bump = fabricBump();
    const cloth = { bumpMap: bump, bumpScale: 0.6 };
    const jersey = keep(std(0xffffff, 0.0, 0.88, { map: jerseyTexture(L), ...cloth }));
    const sleeveTex = sleeveTexture(L);
    const part = (t: THREE.Texture, rep: number, off: number) => {
      const c = t.clone();
      c.wrapS = THREE.RepeatWrapping;
      c.repeat.set(-1, rep); // the lathe runs the other way round: keep the lettering readable
      c.offset.set(0, off);
      c.needsUpdate = true;
      return c;
    };
    const upperM = keep(std(0xffffff, 0.0, 0.88, { map: part(sleeveTex, -0.5, 1), ...cloth }));
    const foreM = keep(std(0xffffff, 0.0, 0.88, { map: part(sleeveTex, -0.5, 0.5), ...cloth }));
    const pantsTex = pantsTexture(L);
    const thighM = keep(std(0xffffff, 0.0, 0.86, { map: part(pantsTex, -0.72, 1), ...cloth }));
    const shinM = keep(std(0xffffff, 0.0, 0.86, { map: part(pantsTex, 0.28, 0), ...cloth }));
    const pantsPlain = keep(std(col(L.pants), 0.0, 0.86, cloth));
    const sleevePlain = keep(std(col(L.jersey), 0.0, 0.88, cloth));
    const plastic = keep(shiny(col(darker(L.accent, 0.35)), { roughness: 0.4, clearcoat: 0.6 })); // guards, protector shells
    const plasticHi = keep(shiny(col(L.accent), { roughness: 0.35, clearcoat: 0.8 }));
    const boot = keep(std(col(darker(L.pants, 0.25)), 0.05, 0.55));
    const bootPlate = keep(shiny(col(L.helmet), { roughness: 0.35 }));
    const metal = mats.chrome;
    const glove = keep(std(col(L.accent), 0.0, 0.8, cloth));
    const gloveDark = keep(std(0x1c1c20, 0.0, 0.75));
    const helmet = keep(shiny(0xffffff, { map: helmetTexture(L) }));
    const helmetPlain = keep(shiny(col(L.helmet)));
    const lens = keep(new THREE.MeshPhysicalMaterial({ color: 0xff9a2a, metalness: 0.9, roughness: 0.08, clearcoat: 1, clearcoatRoughness: 0.05, emissive: 0x301400, envMapIntensity: 1.6 }));
    const strap = keep(std(0x1e1c1c, 0.05, 0.8));

    const add = (o: THREE.Object3D, name?: string) => {
      this.group.add(o);
      if (name) this.limbs[name] = o;
      return o;
    };
    const joint = (r: number, mat: THREE.Material, name: string) => {
      const m = new THREE.Mesh(new THREE.SphereGeometry(r, sg(20), sg(14)), mat);
      add(m);
      this.joints[name] = m;
    };

    for (const side of ['L', 'R']) {
      // ---- leg: baggy MX pants, tall boot
      add(new THREE.Mesh(limbGeo([0.1, 0.112, 0.108, 0.098, 0.088, 0.082]), thighM), 'thigh' + side);
      const shin = new THREE.Group();
      shin.add(new THREE.Mesh(limbGeo([0.072, 0.074, 0.078, 0.08, 0.076]), shinM));
      // boot shaft (modelled in metres, ankle at 0): shaped, with four buckles and a shin plate
      const shaftPts = [[0.082, 0], [0.09, 0.03], [0.086, 0.1], [0.09, 0.2], [0.096, 0.3], [0.098, 0.35], [0.09, 0.365]].map(([r, y]) => new THREE.Vector2(r, y));
      shin.add(new THREE.Mesh(new THREE.LatheGeometry(shaftPts, sg(22)), boot));
      for (const y of [0.06, 0.14, 0.22, 0.3]) {
        const band = new THREE.Mesh(new THREE.TorusGeometry(0.093, 0.01, sg(8), sg(26)).rotateX(Math.PI / 2), strap);
        band.position.y = y;
        band.scale.set(1, 1.6, 1);
        shin.add(band);
        const clip = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.028, 0.02), metal);
        clip.position.set(0.02, y, 0.094);
        shin.add(clip);
      }
      const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.094, 0.3, sg(14), sg(1), true, Math.PI / 2 - 0.7, 1.4), bootPlate);
      plate.position.y = 0.19;
      (plate.material as THREE.Material).side = THREE.DoubleSide;
      shin.add(plate);
      add(shin, 'shin' + side);
      // knee guard: cup with ribs
      const knee = new THREE.Group();
      const cup = new THREE.Mesh(new THREE.SphereGeometry(0.09, sg(20), sg(14), 0, Math.PI * 2, 0, Math.PI / 2), plastic);
      cup.rotation.z = -Math.PI / 2;
      cup.scale.set(1, 0.8, 1);
      knee.add(cup);
      for (const dy of [-0.03, 0, 0.03]) {
        const rib = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.014, 0.11), plasticHi);
        rib.position.set(0.062, dy, 0);
        knee.add(rib);
      }
      add(knee, 'knee' + side);
      joint(0.084, pantsPlain, 'kneeJ' + side);
      // foot: boot with toe cap, heel and a treaded sole
      const foot = new THREE.Group();
      const upper = new THREE.Mesh(new THREE.CapsuleGeometry(0.062, 0.17, sg(6), sg(16)).rotateZ(Math.PI / 2), boot);
      upper.position.set(0.06, 0.005, 0);
      upper.scale.set(1, 0.9, 1.12);
      const sole = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.028, 0.125), strap);
      sole.position.set(0.055, -0.055, 0);
      foot.add(upper, sole);
      for (let k = 0; k < 7; k++) {
        const lug = new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.016, 0.125), strap);
        lug.position.set(-0.085 + k * 0.047, -0.073, 0);
        foot.add(lug);
      }
      const heel = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.03, 0.12), strap);
      heel.position.set(-0.07, -0.078, 0);
      const toeCap = new THREE.Mesh(new THREE.SphereGeometry(0.058, sg(16), sg(12)), bootPlate);
      toeCap.position.set(0.165, 0.0, 0);
      toeCap.scale.set(1.05, 0.8, 1.1);
      foot.add(heel, toeCap);
      add(foot, 'foot' + side);
      // ---- arm: jersey sleeve, elbow guard, glove with fingers
      add(new THREE.Mesh(limbGeo([0.078, 0.08, 0.074, 0.068, 0.064]), upperM), 'upper' + side);
      add(new THREE.Mesh(limbGeo([0.064, 0.068, 0.062, 0.054, 0.05]), foreM), 'fore' + side);
      joint(0.067, sleevePlain, 'elbowJ' + side);
      const pad = new THREE.Group();
      const shell = new THREE.Mesh(new THREE.SphereGeometry(0.066, sg(16), sg(12), 0, Math.PI * 2, 0, Math.PI / 2), plastic);
      const ridge = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.02, 0.09), plasticHi);
      ridge.position.y = 0.06;
      pad.add(shell, ridge);
      add(pad, 'elbowPad' + side);
      const hand = new THREE.Group();
      const palm = new THREE.Mesh(new THREE.SphereGeometry(0.05, sg(16), sg(12)), glove);
      palm.scale.set(1.2, 0.8, 1.15);
      const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.056, 0.052, 0.075, sg(18)).rotateZ(Math.PI / 2), gloveDark);
      cuff.position.x = -0.065;
      const cuffBand = new THREE.Mesh(new THREE.TorusGeometry(0.057, 0.008, sg(6), sg(20)).rotateY(Math.PI / 2), plasticHi);
      cuffBand.position.x = -0.035;
      hand.add(palm, cuff, cuffBand);
      // four fingers curled round the grip, thumb underneath
      for (let k = 0; k < 4; k++) {
        const z = -0.036 + k * 0.024;
        const f1 = new THREE.Mesh(new THREE.CapsuleGeometry(0.0125, 0.035, sg(4), sg(8)).rotateZ(Math.PI / 2), glove);
        f1.position.set(0.058, 0.012, z);
        f1.rotation.z = -0.5;
        const f2 = new THREE.Mesh(new THREE.CapsuleGeometry(0.0115, 0.03, sg(4), sg(8)), gloveDark);
        f2.position.set(0.082, -0.018, z);
        f2.rotation.z = 0.25;
        hand.add(f1, f2);
      }
      const thumb = new THREE.Mesh(new THREE.CapsuleGeometry(0.014, 0.04, sg(4), sg(8)).rotateZ(Math.PI / 2), gloveDark);
      thumb.position.set(0.04, -0.035, 0.03);
      thumb.rotation.z = 0.4;
      const knuckle = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.022, 0.095), plasticHi);
      knuckle.position.set(0.03, 0.04, 0);
      knuckle.rotation.z = -0.25;
      hand.add(thumb, knuckle);
      add(hand, 'hand' + side);
      joint(0.076, sleevePlain, 'shoulderJ' + side);
    }

    // hips
    this.hips = new THREE.Mesh(new THREE.SphereGeometry(0.16, sg(24), sg(18)), pantsPlain);
    this.hips.scale.set(1.05, 0.8, 1.15);
    add(this.hips);

    // ---- spine: one group per vertebra (origin at its base, +y along the spine)
    for (let i = 0; i < SPINE; i++) {
      const v = new THREE.Group();
      v.add(new THREE.Mesh(torsoSlice(i), jersey));
      // the spine shows through the jersey: a small bump per vertebra (and a kidney plate low down,
      // under the number)
      const r = torsoR(i * SEG + SEG / 2) * 0.85;
      const bumpV = new THREE.Mesh(new THREE.SphereGeometry(0.03, sg(10), sg(8)), sleevePlain);
      bumpV.scale.set(0.5, 1.25, 0.8);
      bumpV.position.set(-r + 0.004, SEG / 2, 0);
      v.add(bumpV);
      if (i === 0) {
        const kidney = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.2, r * 1.2, SEG * 0.9, sg(20), sg(1), true, Math.PI * 1.5 - 0.8, 1.6), plastic);
        kidney.scale.set(0.85 / 1.0, 1, 1.22 / 1.0);
        kidney.position.y = SEG * 0.55;
        v.add(kidney);
      }
      this.vertebrae.push(v);
      add(v);
    }
    // belt on the first vertebra
    const belt = new THREE.Mesh(new THREE.TorusGeometry(0.156, 0.02, sg(8), sg(32)).rotateX(Math.PI / 2), strap);
    belt.scale.set(0.85, 1, 1.22);
    belt.position.y = 0.035;
    const buckle = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.05, 0.07), metal);
    buckle.position.set(0.135, 0.035, 0);
    this.vertebrae[0].add(belt, buckle);
    // chest protector (roost guard) on the third and fourth vertebrae: shell with ribs
    const chest = new THREE.Mesh(new THREE.SphereGeometry(0.2, sg(24), sg(16), -Math.PI / 2, Math.PI, 0, Math.PI * 0.62), plastic);
    chest.position.set(0.025, 0.03, 0);
    chest.scale.set(0.62, 0.9, 1.15);
    chest.rotation.z = 0.1;
    this.vertebrae[2].add(chest);
    for (const dy of [0.0, 0.05, 0.1]) {
      const rib = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.016, 0.26), plasticHi);
      rib.position.set(0.14, dy + 0.02, 0);
      this.vertebrae[3].add(rib);
    }
    // shoulder cups and neck brace on the last vertebra
    for (const z of [-0.2, 0.2]) {
      const cap = new THREE.Mesh(new THREE.SphereGeometry(0.098, sg(20), sg(14)), plasticHi);
      cap.position.set(0, 0.0, z);
      cap.scale.set(1, 0.72, 0.9);
      const capRim = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.012, sg(6), sg(20)).rotateX(Math.PI / 2), plastic);
      capRim.position.set(0, -0.025, z);
      capRim.scale.set(1, 1, 0.9);
      this.vertebrae[SPINE - 1].add(cap, capRim);
    }
    const brace = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.036, sg(12), sg(30)).rotateX(Math.PI / 2), plastic);
    brace.position.y = SEG - 0.015;
    brace.scale.set(1.1, 1, 1.2);
    const braceBack = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.1, 0.07), plasticHi);
    braceBack.position.set(-0.12, SEG - 0.05, 0);
    this.vertebrae[SPINE - 1].add(brace, braceBack);

    // neck: two cervical vertebrae (balaclava)
    for (let i = 0; i < NECK; i++) {
      const v = new THREE.Group();
      v.add(new THREE.Mesh(new THREE.CylinderGeometry(0.058, 0.064, NSEG + 0.03, sg(18)).translate(0, NSEG / 2, 0), strap));
      this.neck.push(v);
      add(v);
    }

    // ---- helmet: shell, chin bar, peak, vents, goggles
    this.head = new THREE.Group();
    const shellG = new THREE.SphereGeometry(0.158, sg(40), sg(28));
    const shell = new THREE.Mesh(shellG, helmet);
    shell.scale.set(1.14, 1.03, 0.98);
    shell.rotation.y = Math.PI / 2; // bands front → back
    // chin bar: a horizontal arc in front of the mouth, joined to the shell on both sides
    const chin = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.046, sg(14), sg(30), Math.PI * 1.02), helmetPlain);
    chin.rotation.set(Math.PI / 2, 0, -Math.PI * 0.51 + Math.PI / 2);
    chin.position.set(0.03, -0.085, 0);
    chin.scale.set(1.22, 0.95, 1.25);
    const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.045, 0.11), strap);
    mouth.position.set(0.215, -0.085, 0);
    for (const z of [-0.075, 0.075]) {
      const sideVent = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.02, 0.02), strap);
      sideVent.position.set(0.17, -0.08, z * 1.6);
      this.head.add(sideVent);
    }
    // peak with a central ridge
    const peakShape = new THREE.Shape();
    peakShape.moveTo(-0.03, 0);
    peakShape.lineTo(0.2, -0.034);
    peakShape.quadraticCurveTo(0.25, -0.004, 0.2, 0.022);
    peakShape.lineTo(-0.03, 0.04);
    const peak = new THREE.Mesh(new THREE.ExtrudeGeometry(peakShape, { depth: 0.24, bevelEnabled: true, bevelSize: 0.006, bevelThickness: 0.006, bevelSegments: 2, curveSegments: 10 }), helmetPlain);
    peak.position.set(0.07, 0.1, -0.12);
    peak.rotation.z = -0.15;
    const peakRidge = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.014, 0.05), plasticHi);
    peakRidge.position.set(0.17, 0.118, 0);
    peakRidge.rotation.z = -0.2;
    // top vents and rear spoiler
    for (const z of [-0.05, 0.05]) {
      const tv = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.012, 0.022), strap);
      tv.position.set(0.03, 0.158, z);
      this.head.add(tv);
    }
    const spoiler = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.02, 0.15), helmetPlain);
    spoiler.position.set(-0.155, 0.06, 0);
    spoiler.rotation.z = 0.9;
    // goggles: frame arc, curved mirrored lens, strap round the shell
    const frame = new THREE.Mesh(new THREE.TorusGeometry(0.163, 0.03, sg(10), sg(28), Math.PI * 0.62), strap);
    frame.rotation.set(Math.PI / 2, 0, -Math.PI * 0.31 + Math.PI / 2);
    frame.position.set(0.012, 0.015, 0);
    frame.scale.set(1.1, 1, 1);
    const lensM = new THREE.Mesh(new THREE.SphereGeometry(0.172, sg(24), sg(10), Math.PI / 2 - 0.62, 1.24, Math.PI / 2 - 0.2, 0.36), lens);
    lensM.position.set(0.02, 0.012, 0);
    const gStrap = new THREE.Mesh(new THREE.TorusGeometry(0.156, 0.017, sg(6), sg(36)).rotateX(Math.PI / 2), strap);
    gStrap.position.y = 0.015;
    gStrap.scale.set(1.13, 1.3, 1.0);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.135, 0.014, sg(6), sg(30)).rotateX(Math.PI / 2), strap);
    rim.position.y = -0.125;
    rim.scale.set(1.1, 1, 0.95);
    this.head.add(shell, chin, mouth, peak, peakRidge, spoiler, frame, lensM, gStrap, rim);
    add(this.head);

    // one mesh per material inside each rigid part (far fewer draw calls)
    for (const o of [...this.vertebrae, ...this.neck, this.head, ...Object.values(this.limbs)]) {
      if (o === this.limbs.shinL || o === this.limbs.shinR) mergeByMaterial(o, 1);
      else mergeByMaterial(o);
    }
    this.group.traverse((m) => {
      if ((m as THREE.Mesh).isMesh) (m as THREE.Mesh).castShadow = true;
    });
    DETAIL = 1;
  }

  /** Orient a unit (+y, height 1) object between a and b. */
  private span(name: string, a: THREE.Vector3, b: THREE.Vector3): void {
    const o = this.limbs[name];
    const d = new THREE.Vector3().subVectors(b, a);
    const len = d.length();
    o.position.copy(a);
    o.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
    o.scale.set(1, len, 1);
  }

  /** Same, keeping the object's own proportions (boot shafts are modelled in metres). */
  private spanRigid(name: string, a: THREE.Vector3, b: THREE.Vector3): void {
    const o = this.limbs[name];
    const d = new THREE.Vector3().subVectors(b, a);
    const len = d.length();
    o.position.copy(a);
    o.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
    // the leg tube is unit length, the boot parts are absolute: scale only the first child
    o.children[0].scale.set(1, len, 1);
    o.scale.set(1, 1, 1);
  }

  /**
   * Update the skeleton. `acc` = chassis acceleration in the chassis frame (m/s²),
   * `balance` = balance input, `comp` = mean suspension compression, `air` = airborne.
   */
  update(dt: number, acc: V2, balance: number, comp: number, air: boolean, pitch: number, tuck = false): void {
    if (tuck) {
      this.pelvis = [-0.05, 0.25];
      this.lean = 1.0;
      this.curl = 0.5;
    } else {
      // target posture from the balance: back = seated far back, centre = seated cruising,
      // front = standing on the pegs over the bars (attack position)
      const fwd = Math.max(0, balance);
      const tx = -0.3 + balance * 0.18;
      const ty = 0.36 + fwd * 0.16 + (air ? 0.05 : 0) - comp * 0.09;
      const k = 160;
      const c = 22;
      // inertia: the body lags behind the bike's accelerations (pushed back when accelerating)
      const ax = k * (tx - this.pelvis[0]) - c * this.pelvisV[0] - acc[0] * 0.55;
      const ay = k * (ty - this.pelvis[1]) - c * this.pelvisV[1] - acc[1] * 0.35;
      this.pelvisV[0] += ax * dt;
      this.pelvisV[1] += ay * dt;
      this.pelvis[0] = clamp(this.pelvis[0] + this.pelvisV[0] * dt, -0.48, 0.1);
      this.pelvis[1] = clamp(this.pelvis[1] + this.pelvisV[1] * dt, 0.26, 0.58);
      const tl = 0.28 + balance * 0.42 + comp * 0.18 - acc[0] * 0.012;
      const la = 90 * (tl - this.lean) - 12 * this.leanV;
      this.leanV += la * dt;
      this.lean = clamp(this.lean + this.leanV * dt, -0.1, 1.15);
      // the back rounds when the suspension packs down and on hard hits, straightens in the air
      const tc = 0.12 + comp * 0.5 + Math.max(0, acc[1]) * 0.012 + Math.max(0, balance) * 0.12 - (air ? 0.08 : 0);
      const ca = 70 * (tc - this.curl) - 11 * this.curlV;
      this.curlV += ca * dt;
      this.curl = clamp(this.curl + this.curlV * dt, -0.15, 0.7);
    }
    const P = this.pelvis;
    const pelvis = new THREE.Vector3(P[0], P[1], 0);
    this.hips.position.copy(pelvis);
    this.hips.rotation.z = -this.lean * 0.5;
    // spine: the lean is spread along the vertebrae, the curl bends the upper back forward
    const W = [0.62, 0.84, 1.0, 1.1, 1.16];
    const C = [-0.5, -0.15, 0.25, 0.6, 0.9];
    const p = pelvis.clone();
    let ang = 0;
    for (let i = 0; i < SPINE; i++) {
      ang = this.lean * W[i] + this.curl * C[i];
      const v = this.vertebrae[i];
      v.position.copy(p);
      v.rotation.z = -ang;
      p.x += Math.sin(ang) * SEG;
      p.y += Math.cos(ang) * SEG;
    }
    const chestAng = ang;
    const chestBase = this.vertebrae[SPINE - 1].position;
    const up = new THREE.Vector3(Math.sin(chestAng), Math.cos(chestAng), 0);
    // head keeps the gaze towards the horizon (counters part of the bike's pitch)
    const headAng = clamp(pitch * 0.6, -0.5, 0.5) + chestAng * 0.3 - 0.1;
    for (let i = 0; i < NECK; i++) {
      const a = chestAng + ((headAng - chestAng) * (i + 1)) / (NECK + 1);
      const v = this.neck[i];
      v.position.copy(p);
      v.rotation.z = -a;
      p.x += Math.sin(a) * NSEG;
      p.y += Math.cos(a) * NSEG;
    }
    this.head.position.set(p.x + Math.sin(headAng) * 0.05 + 0.02, p.y + Math.cos(headAng) * 0.05, 0);
    this.head.rotation.z = -headAng + 0.1;
    for (const side of [-1, 1]) {
      const n = side < 0 ? 'L' : 'R';
      // legs: hip → knee → ankle on the pegs, knees forward and slightly out (gripping the bike)
      const hip = new THREE.Vector3(P[0], P[1] - 0.04, side * 0.12);
      const ankle = new THREE.Vector3(PEG[0] - 0.03, PEG[1] + 0.08, side * 0.19);
      const knee = ik(hip, ankle, 0.46, 0.46, new THREE.Vector3(1, 0.2, side * 0.25));
      this.span('thigh' + n, hip, knee);
      this.spanRigid('shin' + n, ankle, knee);
      this.joints['kneeJ' + n].position.copy(knee);
      // knee guard on the front of the knee, facing along the shin's forward normal
      const shinDir = new THREE.Vector3().subVectors(knee, ankle).normalize();
      const thighDir = new THREE.Vector3().subVectors(knee, hip).normalize();
      const front = thighDir.clone().sub(shinDir).normalize();
      const kg = this.limbs['knee' + n];
      kg.position.copy(knee).addScaledVector(front, 0.035);
      kg.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), front);
      const foot = this.limbs['foot' + n];
      foot.position.set(PEG[0] - 0.02, PEG[1] + 0.05, side * 0.19);
      // arms: shoulder → elbow → grip, elbows up and out ("attack position")
      const shoulder = chestBase.clone().addScaledVector(up, 0.0).add(new THREE.Vector3(0, 0, side * 0.2));
      const hand = new THREE.Vector3(GRIP[0], GRIP[1], side * 0.3);
      const elbow = ik(shoulder, hand, 0.33, 0.32, new THREE.Vector3(-0.3, 0.2, side * 1));
      this.span('upper' + n, shoulder, elbow);
      this.span('fore' + n, elbow, hand);
      this.joints['shoulderJ' + n].position.copy(shoulder);
      this.joints['elbowJ' + n].position.copy(elbow);
      const out = new THREE.Vector3().subVectors(elbow, shoulder).normalize().add(new THREE.Vector3().subVectors(elbow, hand).normalize()).normalize();
      const pad = this.limbs['elbowPad' + n];
      pad.position.copy(elbow);
      pad.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), out);
      const hg = this.limbs['hand' + n];
      hg.position.copy(hand);
      const fdir = new THREE.Vector3().subVectors(hand, elbow).normalize();
      hg.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), fdir);
    }
  }
}

/** Two-bone IK in 3D with a pole direction for the middle joint. */
function ik(a: THREE.Vector3, b: THREE.Vector3, l1: number, l2: number, pole: THREE.Vector3): THREE.Vector3 {
  const ab = new THREE.Vector3().subVectors(b, a);
  let d = ab.length();
  d = clamp(d, Math.abs(l1 - l2) + 1e-3, l1 + l2 - 1e-3);
  const dir = ab.normalize();
  const x = (l1 * l1 - l2 * l2 + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, l1 * l1 - x * x));
  const p = pole.clone().addScaledVector(dir, -pole.dot(dir)).normalize();
  return a.clone().addScaledVector(dir, x).addScaledVector(p, h);
}

/**
 * Merge the meshes of a rigid part that share a material into one mesh (their transforms are
 * baked in). `keep` leaves the first children alone (parts scaled on their own each frame).
 */
export function mergeByMaterial(root: THREE.Object3D, keep = 0): void {
  if ((root as THREE.Mesh).isMesh) return;
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const kept = root.children.slice(0, keep);
  const byMat = new Map<THREE.Material, THREE.BufferGeometry[]>();
  const others: THREE.Object3D[] = [];
  for (const child of root.children.slice(keep)) {
    let ok = true;
    child.traverse((o) => {
      const m = o as THREE.Mesh;
      if ((o as THREE.InstancedMesh).isInstancedMesh || (o as THREE.Line).isLine || (m.isMesh && Array.isArray(m.material))) ok = false;
    });
    if (!ok) {
      others.push(child);
      continue;
    }
    child.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      let g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
      g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld));
      for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'normal' && name !== 'uv') g.deleteAttribute(name);
      if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
      if (!g.attributes.normal) g.computeVertexNormals();
      const list = byMat.get(m.material as THREE.Material) ?? [];
      list.push(g);
      byMat.set(m.material as THREE.Material, list);
      m.geometry.dispose();
    });
  }
  root.clear();
  for (const k of kept) root.add(k);
  for (const o of others) root.add(o);
  for (const [mat, list] of byMat) {
    const total = list.reduce((a, g) => a + g.attributes.position.count, 0);
    const pos = new Float32Array(total * 3);
    const nor = new Float32Array(total * 3);
    const uv = new Float32Array(total * 2);
    let off = 0;
    for (const g of list) {
      pos.set(g.attributes.position.array as Float32Array, off * 3);
      nor.set(g.attributes.normal.array as Float32Array, off * 3);
      uv.set(g.attributes.uv.array as Float32Array, off * 2);
      off += g.attributes.position.count;
      g.dispose();
    }
    const merged = new THREE.BufferGeometry();
    merged.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    merged.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    merged.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    const mesh = new THREE.Mesh(merged, mat);
    mesh.castShadow = true;
    root.add(mesh);
  }
}
