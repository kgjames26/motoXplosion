import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { clamp, wrapAngle } from '../core/math';
import type { Bike, Wheel } from '../physics/bike';
import { BIKES, BikeModel } from '../bikes';
import type { RiderLook } from '../ai';

/**
 * "Explorer 98" — procedural 3D scrambler modelled after the reference sheets (brass/olive
 * frame and tank with green panels, brown leather seat, "98" plates, spoked knobby wheels,
 * telescopic fork, twin rear shocks with gold springs, high exhaust) and its rider with a
 * jointed skeleton.
 *
 * Every moving part follows the physics: wheels spin and travel on their suspension, the fork
 * lower legs slide on the stanchions, the swing arm pivots on the frame and the two shocks
 * compress between frame and swing arm. The rider's pelvis and torso are mass-spring bodies
 * reacting to the bike's accelerations; arms and legs are solved with two-bone IK so hands stay
 * on the grips and boots on the pegs.
 *
 * Frame: chassis frame of the physics (metres, x forward, y up), origin = bike.pointWorld(0,0).
 * +z is the bike's right side, which faces the camera.
 */

type V2 = [number, number];

const BRASS = 0x8c7442;
const RUBBER = 0x2a2420;

// key points of the chassis (shared by the model and the rider)
const PEG: V2 = [-0.1, -0.4];
const GRIP: V2 = [0.36, 0.43];
const HEAD_TUBE: V2 = [0.47, 0.24];
const PIVOT: V2 = [-0.1, -0.33];
const SHOCK_TOP: V2 = [-0.5, 0.08];

let envTex: THREE.Texture | null = null;

function std(color: number, metalness: number, roughness: number, extra: Partial<THREE.MeshStandardMaterialParameters> = {}): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, metalness, roughness, envMapIntensity: 0.9, ...extra });
}

function plateTexture(text: string, bg: string, fg: string): THREE.Texture {
  const cv = document.createElement('canvas');
  cv.width = 256;
  cv.height = 192;
  const c = cv.getContext('2d')!;
  c.fillStyle = bg;
  c.beginPath();
  c.ellipse(128, 96, 124, 92, 0, 0, Math.PI * 2);
  c.fill();
  c.lineWidth = 10;
  c.strokeStyle = '#3b2c1a';
  c.stroke();
  c.font = 'italic 900 120px system-ui, sans-serif';
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillStyle = fg;
  c.fillText(text, 128, 104);
  c.lineWidth = 4;
  c.strokeStyle = '#d9c9a0';
  c.strokeText(text, 128, 104);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Orient a unit-length (along +y) mesh between two points. */
function between(o: THREE.Object3D, a: THREE.Vector3, b: THREE.Vector3, thickness = 1): void {
  const d = new THREE.Vector3().subVectors(b, a);
  const len = d.length();
  o.position.copy(a).addScaledVector(d, 0.5);
  o.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
  o.scale.set(thickness, len, thickness);
}

function tube(points: [number, number, number][], radius: number, mat: THREE.Material, seg = 24): THREE.Mesh {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)));
  const m = new THREE.Mesh(new THREE.TubeGeometry(curve, seg, radius, 8), mat);
  m.castShadow = true;
  return m;
}

// ---------------------------------------------------------------- wheel

function buildWheel(radius: number, mats: Record<string, THREE.Material>, front: boolean): THREE.Group {
  const g = new THREE.Group();
  const tyreR = 0.075;
  const tyre = new THREE.Mesh(new THREE.TorusGeometry(radius - tyreR, tyreR, 10, 40), mats.rubber);
  tyre.castShadow = true;
  g.add(tyre);
  // knobs: two staggered rows
  const knobGeo = new THREE.BoxGeometry(0.05, 0.035, 0.05);
  const knobs = new THREE.InstancedMesh(knobGeo, mats.rubber, 64);
  const m = new THREE.Matrix4();
  for (let i = 0; i < 64; i++) {
    const a = (i / 32) * Math.PI;
    const z = i % 2 ? 0.035 : -0.035;
    m.makeRotationZ(a);
    m.setPosition(Math.cos(a) * (radius - 0.008), Math.sin(a) * (radius - 0.008), z);
    knobs.setMatrixAt(i, m.clone().multiply(new THREE.Matrix4().makeRotationZ(Math.PI / 2)));
  }
  knobs.castShadow = true;
  g.add(knobs);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(radius - tyreR * 1.9, 0.02, 6, 40), mats.rims);
  g.add(rim);
  // spokes (crossed lacing, both flanges)
  const pts: number[] = [];
  const rimR = radius - tyreR * 1.9;
  for (let i = 0; i < 36; i++) {
    const a = (i / 36) * Math.PI * 2;
    const side = i % 2 ? 1 : -1;
    const off = side * 0.4;
    pts.push(Math.cos(a + off) * 0.06, Math.sin(a + off) * 0.06, side * 0.04, Math.cos(a) * rimR, Math.sin(a) * rimR, 0);
  }
  const sg = new THREE.BufferGeometry();
  sg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  g.add(new THREE.LineSegments(sg, new THREE.LineBasicMaterial({ color: 0xd8dce4 })));
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.14, 12).rotateX(Math.PI / 2), mats.hub);
  g.add(hub);
  if (front) {
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.008, 24).rotateX(Math.PI / 2), mats.chrome);
    disc.position.z = 0.07;
    g.add(disc);
  } else {
    const sprocket = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.01, 20).rotateX(Math.PI / 2), mats.dark);
    sprocket.position.z = -0.07;
    g.add(sprocket);
  }
  return g;
}

// ---------------------------------------------------------------- rider

/** Canvas texture helper. */
function canvasTex(w: number, h: number, draw: (c: CanvasRenderingContext2D) => void): THREE.Texture {
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  draw(cv.getContext('2d')!);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/**
 * Jersey wrapped around the lathe torso: u goes around the body starting on the right side
 * (u = 0, facing the camera), front at u = 0.25, left side 0.5, back 0.75. v = bottom → top.
 */
function jerseyTexture(L: GearLook): THREE.Texture {
  return canvasTex(512, 256, (c) => {
    c.fillStyle = L.jersey;
    c.fillRect(0, 0, 512, 256);
    // side panels and yoke
    c.fillStyle = L.accent;
    for (const u of [0, 0.5, 1]) c.fillRect(u * 512 - 40, 0, 80, 256);
    c.fillRect(0, 0, 512, 46);
    // piping
    c.fillStyle = L.trim;
    for (const u of [0, 0.5, 1]) {
      c.fillRect(u * 512 - 42, 0, 5, 256);
      c.fillRect(u * 512 + 37, 0, 5, 256);
    }
    c.fillRect(0, 46, 512, 5);
    // waist band
    c.fillStyle = '#2a2420';
    c.fillRect(0, 232, 512, 24);
    // back number and name plate
    c.font = 'italic 900 92px Arial Black, system-ui, sans-serif';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.lineWidth = 8;
    c.strokeStyle = '#1f2f22';
    c.strokeText(L.number, 384, 140);
    c.fillStyle = L.text;
    c.fillText(L.number, 384, 140);
    c.font = 'italic 800 26px Arial, system-ui, sans-serif';
    c.fillStyle = L.text;
    c.fillText(L.name, 384, 78);
    // front logo
    c.fillStyle = L.text;
    c.font = 'italic 900 30px Arial Black, system-ui, sans-serif';
    c.fillText('X', 128, 110);
    // fabric shading
    const g = c.createLinearGradient(0, 0, 0, 256);
    g.addColorStop(0, 'rgba(255,255,255,0.08)');
    g.addColorStop(1, 'rgba(0,0,0,0.18)');
    c.fillStyle = g;
    c.fillRect(0, 0, 512, 256);
  });
}

function pantsTexture(L: GearLook): THREE.Texture {
  return canvasTex(256, 256, (c) => {
    c.fillStyle = L.pants;
    c.fillRect(0, 0, 256, 256);
    c.fillStyle = L.accent;
    c.fillRect(0, 0, 64, 256); // side panel (u = 0 faces the camera)
    c.fillRect(224, 0, 32, 256);
    c.fillStyle = L.trim;
    c.fillRect(62, 0, 4, 256);
    c.fillRect(222, 0, 4, 256);
    c.fillStyle = 'rgba(0,0,0,0.25)';
    for (let y = 30; y < 256; y += 60) c.fillRect(0, y, 256, 3); // stitching
  });
}

function helmetTexture(L: GearLook): THREE.Texture {
  return canvasTex(512, 256, (c) => {
    c.fillStyle = L.helmet;
    c.fillRect(0, 0, 512, 256);
    // racing stripes over the top, front to back
    c.fillStyle = L.jersey;
    c.fillRect(0, 96, 512, 26);
    c.fillStyle = L.trim;
    c.fillRect(0, 90, 512, 5);
    c.fillRect(0, 123, 512, 5);
    c.font = 'italic 900 60px Arial Black, system-ui, sans-serif';
    c.textAlign = 'center';
    c.fillStyle = L.text;
    c.fillText(L.number, 128, 210);
    c.fillText(L.number, 384, 210);
  });
}

/** Rider gear colours. */
export interface GearLook {
  jersey: string;
  accent: string;
  trim: string;
  pants: string;
  helmet: string;
  text: string;
  number: string;
  name: string;
}

const hexs = (n: number) => '#' + n.toString(16).padStart(6, '0');
const darker = (c: string, k: number) => {
  const v = parseInt(c.slice(1), 16);
  const f = (x: number) => Math.round(x * (1 - k));
  return '#' + ((1 << 24) | (f((v >> 16) & 255) << 16) | (f((v >> 8) & 255) << 8) | f(v & 255)).toString(16).slice(1);
};

/** Gear matching a bike (the player) or an opponent's team colours. */
export function gearFor(model: BikeModel, rival?: RiderLook): GearLook {
  if (rival) return { jersey: rival.jersey, accent: rival.accent, trim: '#ffffff', pants: darker(rival.jersey, 0.45), helmet: rival.helmet, text: '#ffffff', number: rival.number, name: 'RACING' };
  if (model.id === 'explorer') return { jersey: '#6a4127', accent: '#35553a', trim: '#d99a3a', pants: '#4d3322', helmet: '#3d5d3f', text: '#e6d8b0', number: '98', name: 'EXPLORER' };
  const p = hexs(model.colors.primary);
  const sec = hexs(model.colors.secondary);
  return { jersey: p, accent: sec, trim: model.colors.plateText, pants: darker(sec === '#ffffff' || sec === '#f2f4f8' ? p : sec, 0.25), helmet: p, text: model.colors.plate, number: model.number, name: model.name.split(' ')[0].toUpperCase() };
}

/** Tapered limb segment: unit height along +y from 0 to 1, radius rA at the base, rB at the top. */
function limbGeo(rA: number, rB: number): THREE.CylinderGeometry {
  const g = new THREE.CylinderGeometry(rB, rA, 1, 14, 1);
  g.translate(0, 0.5, 0);
  return g;
}

class Rider {
  readonly group = new THREE.Group();
  private limbs: Record<string, THREE.Object3D> = {};
  private joints: Record<string, THREE.Object3D> = {};
  private torso: THREE.Group;
  private head: THREE.Group;
  private hips: THREE.Mesh;
  // mass-spring state of the pelvis and chest (chassis frame)
  private pelvis: V2 = [-0.2, 0.3];
  private pelvisV: V2 = [0, 0];
  private lean = 0.35; // torso pitch (rad from vertical, forward positive)
  private leanV = 0;

  constructor(mats: Record<string, THREE.Material>, L: GearLook) {
    const col = (c: string) => parseInt(c.slice(1), 16);
    const jersey = std(0xffffff, 0.02, 0.85, { map: jerseyTexture(L) });
    const pants = std(0xffffff, 0.02, 0.85, { map: pantsTexture(L) });
    const sleeve = std(col(L.jersey), 0.02, 0.85);
    const plastic = std(col(darker(L.accent, 0.35)), 0.1, 0.45); // knee guards, protector shells
    const plasticHi = std(col(L.accent), 0.15, 0.4);
    const boot = std(col(darker(L.pants, 0.1)), 0.05, 0.6);
    const bootPlate = std(col(L.helmet), 0.2, 0.4);
    const metal = mats.chrome;
    const glove = std(col(L.accent), 0.02, 0.8);
    const helmet = std(0xffffff, 0.25, 0.32, { map: helmetTexture(L) });
    const helmetPlain = std(col(L.helmet), 0.25, 0.32);
    const lens = std(0xff8a2a, 0.6, 0.15, { emissive: 0x3a1a00 });
    const strap = std(0x2a2420, 0.05, 0.8);

    const add = (o: THREE.Object3D, name?: string) => {
      o.traverse((m) => ((m as THREE.Mesh).isMesh ? ((m as THREE.Mesh).castShadow = true) : null));
      this.group.add(o);
      if (name) this.limbs[name] = o;
      return o;
    };
    const joint = (r: number, mat: THREE.Material, name: string) => {
      const m = new THREE.Mesh(new THREE.SphereGeometry(r, 14, 10), mat);
      add(m);
      this.joints[name] = m;
    };

    for (const side of ['L', 'R']) {
      // thigh (baggy MX pants), shin with tall boot
      add(new THREE.Mesh(limbGeo(0.105, 0.082), pants), 'thigh' + side);
      const shin = new THREE.Group();
      const leg = new THREE.Mesh(limbGeo(0.07, 0.074), pants);
      shin.add(leg);
      // boot shaft over the lower 70 % with three buckles and a front plate
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.084, 0.09, 0.33, 14).translate(0, 0.165, 0), boot);
      shin.add(shaft);
      for (const y of [0.07, 0.17, 0.27]) {
        const buckle = new THREE.Mesh(new THREE.TorusGeometry(0.088, 0.011, 6, 18).rotateX(Math.PI / 2), strap);
        buckle.position.y = y;
        shin.add(buckle);
        const clip = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.025, 0.02), metal);
        clip.position.set(0, y, 0.09);
        shin.add(clip);
      }
      const plate = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.3, 0.1).translate(0, 0.16, 0), bootPlate);
      plate.position.x = 0.075;
      shin.add(plate);
      add(shin, 'shin' + side);
      // knee guard
      const knee = new THREE.Group();
      const cup = new THREE.Mesh(new THREE.SphereGeometry(0.085, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2), plastic);
      cup.rotation.z = -Math.PI / 2;
      cup.scale.set(1, 0.8, 1);
      const hi = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), plasticHi);
      hi.position.x = 0.05;
      hi.scale.set(0.5, 1, 1);
      knee.add(cup, hi);
      add(knee, 'knee' + side);
      joint(0.082, pants, 'kneeJ' + side);
      // foot: boot toe and heel with sole
      const foot = new THREE.Group();
      const toe = new THREE.Mesh(new THREE.CapsuleGeometry(0.06, 0.16, 4, 10).rotateZ(Math.PI / 2), boot);
      toe.position.set(0.06, 0, 0);
      toe.scale.set(1, 0.85, 1.1);
      const sole = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.03, 0.12), strap);
      sole.position.set(0.05, -0.05, 0);
      const toeCap = new THREE.Mesh(new THREE.SphereGeometry(0.055, 10, 8), bootPlate);
      toeCap.position.set(0.16, 0.0, 0);
      toeCap.scale.set(1, 0.8, 1.05);
      foot.add(toe, sole, toeCap);
      add(foot, 'foot' + side);
      // arms: jersey sleeves, elbow guards, gloves with cuffs
      add(new THREE.Mesh(limbGeo(0.074, 0.064), sleeve), 'upper' + side);
      add(new THREE.Mesh(limbGeo(0.063, 0.05), sleeve), 'fore' + side);
      joint(0.066, sleeve, 'elbowJ' + side);
      const pad = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2), plastic);
      add(pad, 'elbowPad' + side);
      const hand = new THREE.Group();
      const palm = new THREE.Mesh(new THREE.SphereGeometry(0.055, 12, 10), glove);
      palm.scale.set(1.25, 0.9, 1);
      const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.058, 0.054, 0.07, 12), glove);
      cuff.rotation.z = Math.PI / 2;
      cuff.position.x = -0.06;
      const knuckle = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.03, 0.08), plasticHi);
      knuckle.position.set(0.02, 0.04, 0);
      hand.add(palm, cuff, knuckle);
      add(hand, 'hand' + side);
      joint(0.07, sleeve, 'shoulderJ' + side);
    }

    // hips (pants) with belt
    this.hips = new THREE.Mesh(new THREE.SphereGeometry(0.16, 16, 12), pants);
    this.hips.scale.set(1.05, 0.8, 1.15);
    add(this.hips);
    // torso group (origin = pelvis, +y = spine)
    this.torso = new THREE.Group();
    const profile = [
      new THREE.Vector2(0.0, 0.0),
      new THREE.Vector2(0.15, 0.0),
      new THREE.Vector2(0.155, 0.08),
      new THREE.Vector2(0.15, 0.2),
      new THREE.Vector2(0.175, 0.34),
      new THREE.Vector2(0.19, 0.45),
      new THREE.Vector2(0.17, 0.52),
      new THREE.Vector2(0.09, 0.58),
      new THREE.Vector2(0.0, 0.59),
    ];
    const body = new THREE.Mesh(new THREE.LatheGeometry(profile, 28), jersey);
    body.scale.set(0.85, 1, 1.22);
    this.torso.add(body);
    // chest protector (roost guard) worn under the jersey on the front: shell + shoulder cups
    const chest = new THREE.Mesh(new THREE.SphereGeometry(0.2, 16, 12, -Math.PI / 2, Math.PI, 0, Math.PI * 0.6), plastic);
    chest.position.set(0.02, 0.27, 0);
    chest.scale.set(0.62, 0.9, 1.15);
    chest.rotation.z = 0.1;
    this.torso.add(chest);
    for (const z of [-0.2, 0.2]) {
      const cap = new THREE.Mesh(new THREE.SphereGeometry(0.095, 14, 10), plasticHi);
      cap.position.set(0, 0.47, z);
      cap.scale.set(1, 0.75, 0.9);
      this.torso.add(cap);
    }
    // neck brace
    const brace = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.035, 8, 22).rotateX(Math.PI / 2), plastic);
    brace.position.y = 0.58;
    brace.scale.set(1.1, 1, 1.2);
    this.torso.add(brace);
    const belt = new THREE.Mesh(new THREE.TorusGeometry(0.155, 0.018, 6, 24).rotateX(Math.PI / 2), strap);
    belt.scale.set(0.85, 1, 1.22);
    belt.position.y = 0.03;
    this.torso.add(belt);
    add(this.torso);

    // helmet: textured shell, peak, chin bar, goggles with orange lens and strap
    this.head = new THREE.Group();
    const shell = new THREE.Mesh(new THREE.SphereGeometry(0.155, 24, 18), helmet);
    shell.scale.set(1.12, 1.02, 0.98);
    shell.rotation.y = Math.PI / 2; // stripes front→back
    const chinBar = new THREE.Mesh(new THREE.CapsuleGeometry(0.06, 0.12, 4, 10).rotateX(Math.PI / 2), helmetPlain);
    chinBar.position.set(0.15, -0.085, 0);
    chinBar.scale.set(1.2, 1, 1);
    const vent = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.04, 0.08), strap);
    vent.position.set(0.22, -0.085, 0);
    const peakShape = new THREE.Shape();
    peakShape.moveTo(-0.02, 0);
    peakShape.lineTo(0.2, -0.03);
    peakShape.quadraticCurveTo(0.24, 0.0, 0.2, 0.025);
    peakShape.lineTo(-0.02, 0.04);
    const peak = new THREE.Mesh(new THREE.ExtrudeGeometry(peakShape, { depth: 0.22, bevelEnabled: false }), helmetPlain);
    peak.position.set(0.07, 0.1, -0.11);
    peak.rotation.z = -0.15;
    const goggleFrame = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.07, 0.22), strap);
    goggleFrame.position.set(0.15, 0.015, 0);
    const lensM = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.05, 0.19), lens);
    lensM.position.set(0.176, 0.015, 0);
    const gStrap = new THREE.Mesh(new THREE.TorusGeometry(0.155, 0.014, 6, 28).rotateY(Math.PI / 2).rotateX(Math.PI / 2), strap);
    gStrap.rotation.set(0, 0, 0);
    gStrap.scale.set(1.08, 1, 1);
    gStrap.position.y = 0.015;
    const gStrapRing = new THREE.Mesh(new THREE.TorusGeometry(0.152, 0.016, 6, 28).rotateX(Math.PI / 2), strap);
    gStrapRing.position.y = 0.015;
    gStrapRing.scale.set(1.12, 1, 1.0);
    this.head.add(shell, chinBar, vent, peak, goggleFrame, lensM, gStrapRing);
    void gStrap;
    add(this.head);
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
      this.lean = 1.1;
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
    }
    const P = this.pelvis;
    const pelvis = new THREE.Vector3(P[0], P[1], 0);
    this.hips.position.copy(pelvis);
    this.hips.rotation.z = -this.lean * 0.5;
    this.torso.position.copy(pelvis);
    this.torso.rotation.z = -this.lean;
    const up = new THREE.Vector3(Math.sin(this.lean), Math.cos(this.lean), 0);
    const neck = pelvis.clone().addScaledVector(up, 0.6);
    // head keeps the gaze towards the horizon (counters part of the bike's pitch)
    this.head.position.copy(neck).addScaledVector(up, 0.1).add(new THREE.Vector3(0.03, 0, 0));
    this.head.rotation.z = clamp(-pitch * 0.6, -0.5, 0.5) - this.lean * 0.25 + 0.1;
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
      const shoulder = pelvis.clone().addScaledVector(up, 0.47).add(new THREE.Vector3(0, 0, side * 0.2));
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

// ---------------------------------------------------------------- bike

export class Bike3D {
  readonly group = new THREE.Group();
  private chassis = new THREE.Group();
  private rearWheel: THREE.Group;
  private frontWheel: THREE.Group;
  private swingArm = new THREE.Group();
  private forkLowers = new THREE.Group();
  private shocks: { group: THREE.Group; coil: THREE.Mesh; body: THREE.Mesh; z: number }[] = [];
  private rider: Rider;
  private riderHolder = new THREE.Group();
  private prevV: V2 = [0, 0];
  private accF: V2 = [0, 0];
  private mats: Record<string, THREE.Material>;

  readonly model: BikeModel;
  /** Depth of the bike on the track (opponents ride on their own lane). */
  lane = -0.25;

  constructor(model: BikeModel = BIKES[0], rival?: RiderLook) {
    this.model = model;
    const k = model.colors;
    const scrambler = model.style === 'scrambler';
    const plastic = (c: number) => std(c, 0.05, 0.38);
    const mats = (this.mats = {
      frame: scrambler ? std(k.frame, 0.55, 0.45) : std(k.frame, 0.65, 0.35),
      primary: scrambler ? std(k.primary, 0.75, 0.38) : plastic(k.primary),
      secondary: scrambler ? std(k.secondary, 0.35, 0.4) : plastic(k.secondary),
      seat: std(k.seat, 0.05, 0.75),
      fender: scrambler ? std(k.frame, 0.55, 0.45) : plastic(k.primary),
      rims: std(k.rims, 0.9, 0.25),
      hub: scrambler ? std(BRASS, 0.75, 0.38) : std(k.primary, 0.5, 0.35),
      forks: std(k.forks, 0.8, 0.3),
      engine: scrambler ? std(BRASS, 0.75, 0.38) : std(0x9aa0aa, 0.85, 0.35),
      rubber: std(RUBBER, 0, 0.92),
      chrome: std(0xe6e9ef, 1, 0.18),
      dark: std(0x2b2722, 0.6, 0.5),
      gold: std(model.electric ? 0x14d1c0 : 0xe0a332, 0.9, 0.3),
    });
    this.group.add(this.chassis);
    if (scrambler) this.buildFrame();
    else this.buildModern(model);
    this.buildFront(model);
    this.rearWheel = buildWheel(0.43, mats, false);
    this.frontWheel = buildWheel(0.43, mats, true);
    this.chassis.add(this.rearWheel, this.frontWheel, this.swingArm, this.forkLowers);
    this.buildSwingArm();
    this.buildForkLowers();
    this.buildShocks(scrambler ? [-0.13, 0.13] : [0]);
    this.rider = new Rider(mats, gearFor(model, rival));
    this.riderHolder.add(this.rider.group);
    this.chassis.add(this.riderHolder);
    this.group.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).castShadow = true;
    });
  }

  /** Image-based lighting for the metal parts (call once a renderer exists). */
  setEnvironment(renderer: THREE.WebGLRenderer, rebuild = false): void {
    if (!envTex || rebuild) {
      const pm = new THREE.PMREMGenerator(renderer);
      envTex = pm.fromScene(new RoomEnvironment(), 0.04).texture;
      pm.dispose();
    }
    for (const m of Object.values(this.mats)) (m as THREE.MeshStandardMaterial).envMap = envTex;
  }

  private buildFrame(): void {
    const m = this.mats;
    const c = this.chassis;
    // twin cradle frame
    for (const z of [-0.11, 0.11]) {
      c.add(tube([[0.47, 0.22, z * 0.6], [0.36, -0.05, z], [0.26, -0.42, z], [0.0, -0.5, z], [-0.14, -0.44, z], [-0.12, -0.2, z], [-0.2, 0.08, z * 0.9]], 0.022, m.frame));
      c.add(tube([[-0.2, 0.1, z * 0.9], [-0.5, 0.11, z], [-0.86, 0.13, z * 0.9]], 0.018, m.frame));
      c.add(tube([[-0.13, -0.28, z], [-0.5, 0.07, z]], 0.016, m.frame, 6));
    }
    c.add(tube([[0.48, 0.25, 0], [0.2, 0.17, 0], [-0.2, 0.1, 0]], 0.026, m.frame)); // backbone
    // steering head + triple clamps
    const head = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.2, 10), m.frame);
    head.position.set(HEAD_TUBE[0], HEAD_TUBE[1], 0);
    head.rotation.z = (27 * Math.PI) / 180;
    c.add(head);
    // engine: crankcase, finned cylinder, head, covers
    const crank = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.26, 20).rotateX(Math.PI / 2), m.engine);
    crank.position.set(0.04, -0.32, 0);
    crank.scale.set(1.15, 0.9, 1);
    c.add(crank);
    const cover = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.03, 20).rotateX(Math.PI / 2), m.chrome);
    cover.position.set(0.0, -0.32, 0.14);
    c.add(cover);
    for (let i = 0; i < 8; i++) {
      const fin = new THREE.Mesh(new THREE.BoxGeometry(0.2 - i * 0.006, 0.012, 0.24 - i * 0.004), m.dark);
      fin.position.set(0.12 + i * 0.008, -0.16 + i * 0.03, 0);
      fin.rotation.z = -0.25;
      c.add(fin);
    }
    const cylHead = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.08, 0.22), m.engine);
    cylHead.position.set(0.2, 0.08, 0);
    cylHead.rotation.z = -0.25;
    c.add(cylHead);
    // tank with green side panels
    const tank = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), m.primary);
    tank.scale.set(0.25, 0.11, 0.15);
    tank.position.set(0.2, 0.25, 0);
    tank.rotation.z = -0.08;
    c.add(tank);
    for (const z of [-0.075, 0.075]) {
      const panel = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 12), m.secondary);
      panel.scale.set(0.18, 0.075, 0.09);
      panel.position.set(0.23, 0.24, z);
      panel.rotation.z = -0.08;
      c.add(panel);
    }
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.02, 12), m.chrome);
    cap.position.set(0.24, 0.36, 0);
    c.add(cap);
    // seat (brown leather) on a rounded profile
    const seatShape = new THREE.Shape();
    seatShape.moveTo(-0.82, 0.13);
    seatShape.lineTo(0.05, 0.16);
    seatShape.quadraticCurveTo(0.1, 0.2, 0.0, 0.24);
    seatShape.lineTo(-0.7, 0.22);
    seatShape.quadraticCurveTo(-0.85, 0.2, -0.82, 0.13);
    const seat = new THREE.Mesh(new THREE.ExtrudeGeometry(seatShape, { depth: 0.2, bevelEnabled: true, bevelSize: 0.03, bevelThickness: 0.03, bevelSegments: 3 }), m.seat);
    seat.position.z = -0.1;
    c.add(seat);
    // side box + "98" plates
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.18, 0.24), m.dark);
    box.position.set(-0.38, -0.02, 0);
    c.add(box);
    const plateMat = new THREE.MeshStandardMaterial({ map: plateTexture('98', '#cdbf96', '#22402a'), roughness: 0.6, metalness: 0.2, transparent: true });
    for (const z of [-1, 1]) {
      const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.23), plateMat);
      plate.position.set(-0.4, 0.0, z * 0.13);
      if (z < 0) plate.rotation.y = Math.PI;
      c.add(plate);
    }
    // rear fender (short scrambler tail) & tail light
    const rf = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.025, 6, 16, 1.4), m.frame);
    rf.scale.set(1, 1, 3.5);
    rf.position.set(-0.7, -0.27, 0);
    rf.rotation.z = 1.05;
    c.add(rf);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.04, 0.08), std(0xc0301e, 0.2, 0.4, { emissive: 0x501008 }));
    tail.position.set(-0.9, 0.14, 0);
    c.add(tail);
    // high exhaust on the right side (facing the camera)
    c.add(tube([[0.24, 0.02, 0.06], [0.33, -0.12, 0.13], [0.24, -0.26, 0.19], [-0.05, -0.12, 0.2], [-0.35, 0.0, 0.2], [-0.55, 0.04, 0.19]], 0.032, m.chrome, 32));
    const muffler = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.055, 0.42, 14).rotateZ(Math.PI / 2 - 0.08), m.dark);
    muffler.position.set(-0.72, 0.05, 0.19);
    c.add(muffler);
    const heat = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.065, 0.2, 14, 1, false, -0.6, 2.2).rotateZ(Math.PI / 2 - 0.08), m.engine);
    heat.position.set(-0.72, 0.05, 0.19);
    c.add(heat);
    // footpegs
    for (const z of [-0.19, 0.19]) {
      const peg = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.025, 0.1), m.dark);
      peg.position.set(PEG[0], PEG[1], z);
      c.add(peg);
    }
  }

  /** Fork stanchions, triple clamps, bars and grips (all styles), front plate (scrambler). */
  private buildFront(model: BikeModel): void {
    const m = this.mats;
    const c = this.chassis;
    // fork stanchions + clamps + bars + front plate
    const rake = (27 * Math.PI) / 180;
    const axis = new THREE.Vector3(Math.sin(rake), -Math.cos(rake), 0);
    const mount = new THREE.Vector3(0.7, -0.235, 0);
    for (const z of [-0.1, 0.1]) {
      const st = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 1, 10), m.chrome);
      const a = mount.clone().addScaledVector(axis, -0.52).setZ(z);
      const b = mount.clone().addScaledVector(axis, 0.02).setZ(z);
      between(st, a, b);
      st.scale.x = st.scale.z = 1;
      c.add(st);
    }
    for (const t of [-0.52, -0.34]) {
      const clamp3 = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.04, 0.28), m.frame);
      clamp3.position.copy(mount.clone().addScaledVector(axis, t));
      clamp3.rotation.z = rake;
      c.add(clamp3);
    }
    const barBase = mount.clone().addScaledVector(axis, -0.55);
    c.add(tube([[barBase.x, barBase.y, -0.32], [barBase.x - 0.03, barBase.y + 0.05, -0.2], [barBase.x, barBase.y + 0.02, 0], [barBase.x - 0.03, barBase.y + 0.05, 0.2], [GRIP[0], GRIP[1], 0.32]], 0.013, m.chrome));
    for (const z of [-0.3, 0.3]) {
      const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.1, 8).rotateX(Math.PI / 2), m.dark);
      grip.position.set(GRIP[0], GRIP[1], z);
      c.add(grip);
    }
    if (model.style !== 'scrambler') return;
    const fplate = new THREE.Mesh(new THREE.PlaneGeometry(0.26, 0.2), new THREE.MeshStandardMaterial({ map: plateTexture('98', '#e2d6b2', '#22402a'), transparent: true, roughness: 0.6, side: THREE.DoubleSide }));
    fplate.position.copy(mount.clone().addScaledVector(axis, -0.42)).add(new THREE.Vector3(0.09, 0, 0.0));
    fplate.rotation.set(0, Math.PI / 2 - 0.9, rake * 0.6);
    c.add(fplate);
  }

  /** Side-profile shape extruded across the bike (plastics, seat, tanks, panels). */
  private prof(pts: [number, number][], width: number, mat: THREE.Material, z = 0, bevel = 0.015): THREE.Mesh {
    const sh = new THREE.Shape();
    sh.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) sh.lineTo(pts[i][0], pts[i][1]);
    sh.closePath();
    const g = new THREE.ExtrudeGeometry(sh, { depth: width, bevelEnabled: bevel > 0, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 2, curveSegments: 6 });
    g.translate(0, 0, z - width / 2);
    const m = new THREE.Mesh(g, mat);
    this.chassis.add(m);
    return m;
  }

  /**
   * Modern bikes (MX, trial, enduro, electric, rally): perimeter frame, engine or battery,
   * plastics shaped per style, mono-shock rear suspension.
   */
  private buildModern(model: BikeModel): void {
    const m = this.mats;
    const c = this.chassis;
    const st = model.style;
    const plateMat = new THREE.MeshStandardMaterial({ map: plateTexture(model.number, model.colors.plate, model.colors.plateText), roughness: 0.5, transparent: true });
    // perimeter (twin spar) frame + steering head
    for (const z of [-0.1, 0.1]) {
      c.add(tube([[0.48, 0.24, z * 0.5], [0.25, 0.12, z], [-0.05, 0.02, z], [-0.12, -0.25, z], [-0.1, -0.36, z]], st === 'trial' ? 0.02 : 0.026, m.frame));
      c.add(tube([[-0.05, 0.05, z * 0.9], [-0.45, 0.12, z * 0.8], [-0.86, 0.17, z * 0.6]], 0.015, m.frame));
      if (st !== 'electric') c.add(tube([[0.46, 0.18, z * 0.5], [0.3, -0.15, z], [0.2, -0.42, z], [-0.05, -0.46, z]], 0.017, m.frame));
    }
    const head = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.042, 0.22, 12), m.frame);
    head.position.set(HEAD_TUBE[0], HEAD_TUBE[1], 0);
    head.rotation.z = (27 * Math.PI) / 180;
    c.add(head);
    // footpegs
    for (const z of [-0.19, 0.19]) {
      const peg = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.025, 0.1), m.dark);
      peg.position.set(PEG[0], PEG[1], z);
      c.add(peg);
    }
    if (st === 'electric') {
      // battery pack + motor, glowing accent strips, no exhaust
      this.prof([[-0.12, 0.08], [0.42, 0.18], [0.36, -0.3], [0.05, -0.4], [-0.12, -0.25]], 0.24, m.secondary, 0, 0.03);
      for (const z of [-0.125, 0.125]) {
        const strip = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.018, 0.01), std(model.colors.primary, 0.2, 0.3, { emissive: model.colors.primary, emissiveIntensity: 0.8 }));
        strip.position.set(0.15, -0.08, z);
        strip.rotation.z = -0.25;
        c.add(strip);
      }
      const motor = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.2, 18).rotateX(Math.PI / 2), m.engine);
      motor.position.set(-0.02, -0.35, 0);
      c.add(motor);
      const logo = new THREE.Mesh(new THREE.CircleGeometry(0.06, 16), std(model.colors.primary, 0.3, 0.3, { emissive: model.colors.primary, emissiveIntensity: 0.6 }));
      logo.position.set(-0.02, -0.35, 0.105);
      c.add(logo);
    } else {
      // engine: crankcase, cylinder, head; 2-strokes get a fat expansion chamber
      const crank = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.22, 18).rotateX(Math.PI / 2), m.engine);
      crank.position.set(0.03, -0.32, 0);
      crank.scale.set(1.1, 0.85, 1);
      c.add(crank);
      const cyl = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.2, 0.17), m.dark);
      cyl.position.set(0.15, -0.12, 0);
      cyl.rotation.z = -0.3;
      c.add(cyl);
      const cover = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.03, 16).rotateX(Math.PI / 2), m.primary);
      cover.position.set(0.0, -0.32, 0.12);
      c.add(cover);
    }
    // skid plate / bash plate
    if (st !== 'trial') this.prof([[-0.12, -0.44], [0.3, -0.44], [0.36, -0.36], [-0.08, -0.5]], 0.2, st === 'rally' || st === 'enduro' ? m.engine : m.dark, 0, 0.005);
    // exhaust
    if (st === 'mx' || st === 'enduro') {
      const two = model.id === 'sprint';
      if (two) {
        const pipe = tube([[0.24, -0.08, 0.04], [0.36, -0.26, 0.12], [0.22, -0.4, 0.17], [-0.05, -0.32, 0.2], [-0.3, -0.12, 0.19]], 0.055, m.dark, 28);
        c.add(pipe);
        const sil = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.035, 0.35, 12).rotateZ(Math.PI / 2 - 0.25), m.engine);
        sil.position.set(-0.48, 0.0, 0.17);
        c.add(sil);
      } else {
        c.add(tube([[0.24, -0.02, 0.05], [0.34, -0.2, 0.13], [0.2, -0.32, 0.17], [-0.1, -0.15, 0.19], [-0.32, 0.02, 0.17]], 0.028, m.chrome, 28));
        const sil = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.05, 0.45, 14).rotateZ(Math.PI / 2 - 0.32), m.engine);
        sil.position.set(-0.55, 0.08, 0.16);
        c.add(sil);
        const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.056, 0.056, 0.03, 14).rotateZ(Math.PI / 2 - 0.32), m.primary);
        cap.position.set(-0.76, 0.15, 0.16);
        c.add(cap);
      }
    } else if (st === 'trial') {
      c.add(tube([[0.24, -0.06, 0.05], [0.3, -0.3, 0.12], [0.05, -0.42, 0.16], [-0.35, -0.3, 0.17]], 0.024, m.chrome, 20));
      const sil = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.28, 12).rotateZ(Math.PI / 2 - 0.15), m.dark);
      sil.position.set(-0.48, -0.25, 0.16);
      c.add(sil);
    } else if (st === 'rally') {
      for (const z of [0.15, -0.15]) {
        const sil = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.055, 0.42, 14).rotateZ(Math.PI / 2 - 0.25), m.engine);
        sil.position.set(-0.6, 0.06, z);
        c.add(sil);
      }
      c.add(tube([[0.24, -0.02, 0.05], [0.34, -0.22, 0.12], [0.1, -0.3, 0.16], [-0.4, 0.0, 0.15]], 0.03, m.chrome, 24));
    }
    // seat
    if (st === 'trial') this.prof([[-0.55, 0.13], [-0.25, 0.14], [-0.25, 0.1], [-0.55, 0.09]], 0.16, m.seat, 0, 0.02);
    else if (st === 'rally') this.prof([[-0.85, 0.2], [-0.4, 0.2], [-0.1, 0.24], [0.05, 0.27], [0.05, 0.2], [-0.85, 0.13]], 0.22, m.seat, 0, 0.025);
    else this.prof([[-0.85, 0.2], [-0.2, 0.2], [0.18, 0.3], [0.22, 0.25], [-0.2, 0.15], [-0.85, 0.15]], 0.18, m.seat, 0, 0.022);
    // rear fender
    if (st === 'trial') this.prof([[-0.5, 0.1], [-0.95, 0.04], [-0.95, 0.01], [-0.5, 0.06]], 0.14, m.fender, 0, 0.008);
    else if (st === 'rally') {
      this.prof([[-0.6, 0.14], [-1.05, 0.2], [-1.05, 0.16], [-0.6, 0.1]], 0.18, m.fender, 0, 0.008);
      this.prof([[-0.95, 0.3], [-0.55, 0.3], [-0.55, 0.22], [-0.95, 0.22]], 0.26, m.dark, 0, 0.005); // rack
      const tail = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.04, 0.1), std(0xc0301e, 0.2, 0.4, { emissive: 0x801808 }));
      tail.position.set(-1.07, 0.18, 0);
      c.add(tail);
    } else {
      this.prof([[-0.55, 0.16], [-1.12, 0.28], [-1.14, 0.25], [-0.6, 0.11]], 0.18, m.fender, 0, 0.008);
      if (st === 'enduro') {
        const tail = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.04, 0.09), std(0xc0301e, 0.2, 0.4, { emissive: 0x801808 }));
        tail.position.set(-1.0, 0.24, 0);
        c.add(tail);
      }
    }
    // side panels with number plates (MX, enduro, electric)
    if (st === 'mx' || st === 'enduro' || st === 'electric') {
      for (const z of [-0.105, 0.105]) {
        this.prof([[-0.25, 0.14], [-0.68, 0.18], [-0.62, -0.02], [-0.25, -0.08]], 0.01, m.secondary, z, 0.004);
        const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.2), plateMat);
        plate.position.set(-0.45, 0.06, z * 1.12);
        if (z < 0) plate.rotation.y = Math.PI;
        c.add(plate);
      }
    }
    // tank & radiator shrouds
    if (st === 'trial') this.prof([[0.02, 0.18], [0.36, 0.2], [0.4, 0.12], [0.05, 0.1]], 0.18, m.primary, 0, 0.03);
    else if (st === 'rally') {
      // big front tanks + tall fairing with windscreen and navigation tower
      for (const z of [-0.14, 0.14]) this.prof([[-0.05, 0.25], [0.42, 0.33], [0.5, 0.1], [0.35, -0.12], [-0.05, -0.05]], 0.1, m.primary, z, 0.03);
      this.prof([[0.0, 0.27], [0.4, 0.32], [0.38, 0.22], [0.0, 0.2]], 0.2, m.secondary, 0, 0.02);
      this.prof([[0.5, 0.25], [0.78, 0.38], [0.86, 0.7], [0.62, 0.72], [0.5, 0.45]], 0.3, m.primary, 0, 0.03);
      this.prof([[0.62, 0.72], [0.86, 0.7], [0.82, 0.92], [0.66, 0.9]], 0.26, new THREE.MeshStandardMaterial({ color: 0x9fc8e8, transparent: true, opacity: 0.55, roughness: 0.1, metalness: 0.2 }), 0, 0.005);
      for (const z of [-0.06, 0.06]) {
        const lamp = new THREE.Mesh(new THREE.CircleGeometry(0.045, 14), std(0xffffff, 0.2, 0.2, { emissive: 0xfff4c0, emissiveIntensity: 0.9 }));
        lamp.position.set(0.865, 0.5, z);
        lamp.rotation.y = Math.PI / 2;
        c.add(lamp);
      }
      const stripe = this.prof([[0.52, 0.3], [0.8, 0.42], [0.82, 0.5], [0.52, 0.38]], 0.32, m.secondary, 0, 0.004);
      void stripe;
    } else {
      this.prof([[0.02, 0.22], [0.36, 0.26], [0.5, 0.18], [0.46, 0.0], [0.28, -0.12], [0.05, 0.02]], 0.26, m.primary, 0, 0.025);
      this.prof([[0.28, 0.2], [0.48, 0.17], [0.44, 0.02], [0.3, -0.06]], 0.3, m.secondary, 0, 0.006);
    }
    // front: number plate (MX / trial / electric) or headlight mask (enduro)
    const rake = (27 * Math.PI) / 180;
    if (st === 'mx' || st === 'trial' || st === 'electric') {
      this.prof([[0.5, 0.42], [0.6, 0.36], [0.64, 0.1], [0.56, 0.12], [0.48, 0.3]], 0.22, m.fender, 0, 0.01);
      const fp = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.18), new THREE.MeshStandardMaterial({ map: plateTexture(model.number, model.colors.plate, model.colors.plateText), transparent: true, side: THREE.DoubleSide }));
      fp.position.set(0.63, 0.26, 0);
      fp.rotation.set(0, Math.PI / 2, -rake * 0.6);
      c.add(fp);
    } else if (st === 'enduro') {
      this.prof([[0.5, 0.44], [0.62, 0.38], [0.66, 0.1], [0.56, 0.1], [0.48, 0.3]], 0.24, m.secondary, 0, 0.012);
      const lamp = new THREE.Mesh(new THREE.CircleGeometry(0.06, 16), std(0xffffff, 0.2, 0.2, { emissive: 0xfff4c0, emissiveIntensity: 0.9 }));
      lamp.position.set(0.667, 0.25, 0);
      lamp.rotation.y = Math.PI / 2;
      c.add(lamp);
    }
    // high front fender on the lower clamp (all modern styles except trial)
    if (st !== 'trial') {
      const ff = this.prof([[0.55, -0.05], [0.8, 0.02], [1.15, -0.02], [1.2, -0.07], [0.82, -0.04], [0.58, -0.1]], 0.16, m.fender, 0, 0.008);
      void ff;
    }
    // hand guards (enduro, rally)
    if (st === 'enduro' || st === 'rally') {
      for (const z of [-0.3, 0.3]) {
        const g = new THREE.Mesh(new THREE.SphereGeometry(0.07, 12, 8, 0, Math.PI), m.fender);
        g.position.set(GRIP[0] + 0.05, GRIP[1] + 0.01, z);
        g.rotation.y = Math.PI / 2;
        g.scale.set(1, 0.8, 0.6);
        c.add(g);
      }
    }
  }

  private buildSwingArm(): void {
    // built along +x (length 1), scaled/rotated each frame from the pivot to the rear axle
    const m = this.mats;
    for (const z of [-0.1, 0.1]) {
      const arm = new THREE.Mesh(new THREE.BoxGeometry(1, 0.05, 0.035), m.frame);
      arm.position.set(0.5, 0, z);
      this.swingArm.add(arm);
    }
    const brace = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.04, 0.22), m.frame);
    brace.position.set(0.1, 0, 0);
    this.swingArm.add(brace);
    const chain = new THREE.Mesh(new THREE.BoxGeometry(1, 0.01, 0.012), m.dark);
    chain.position.set(0.5, 0.06, -0.12);
    this.swingArm.add(chain);
  }

  private buildForkLowers(): void {
    // positioned at the front axle, aligned with the fork axis (local -y = towards the axle)
    const m = this.mats;
    for (const z of [-0.1, 0.1]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.036, 0.42, 12), m.forks);
      leg.position.set(0, 0.21, z);
      this.forkLowers.add(leg);
      const seal = new THREE.Mesh(new THREE.CylinderGeometry(0.037, 0.037, 0.025, 12), m.dark);
      seal.position.set(0, 0.42, z);
      this.forkLowers.add(seal);
    }
    // front fender rides with the wheel (fixed to the lower legs) on scramblers and trials
    if (this.model.style !== 'scrambler' && this.model.style !== 'trial') return;
    const fender = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.025, 6, 18, 1.3), m.fender);
    fender.scale.set(1, 1, 3.2);
    fender.rotation.z = 0.03; // arc over the top-front of the tyre
    fender.position.set(0, -0.0, 0);
    this.forkLowers.add(fender);
  }

  private buildShocks(zs: number[]): void {
    const m = this.mats;
    for (const z of zs) {
      const group = new THREE.Group();
      // unit length along +y (bottom at 0, top at 1), scaled to the current length
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1, 8), m.dark);
      body.position.y = 0.5;
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i <= 80; i++) {
        const a = (i / 80) * Math.PI * 2 * 9;
        pts.push(new THREE.Vector3(Math.cos(a) * 0.035, 0.12 + (i / 80) * 0.76, Math.sin(a) * 0.035));
      }
      const coil = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 160, 0.008, 5), m.gold);
      const capT = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.06, 10), m.chrome);
      capT.position.y = 0.95;
      const capB = capT.clone();
      capB.position.y = 0.05;
      group.add(body, coil, capT, capB);
      this.chassis.add(group);
      this.shocks.push({ group, coil, body, z });
    }
  }

  update(b: Bike, dt: number, crashed = false): void {
    const [ox, oy] = b.pointWorld(0, 0);
    this.group.position.set(ox, oy, this.lane);
    this.group.rotation.z = b.angle;
    const local = (w: Wheel): V2 => [w.mountX + w.axisX * w.s, w.mountY + w.axisY * w.s];
    const R = local(b.rear);
    const F = local(b.front);
    this.rearWheel.position.set(R[0], R[1], 0);
    this.rearWheel.rotation.z = b.rear.angle;
    this.frontWheel.position.set(F[0], F[1], 0);
    this.frontWheel.rotation.z = b.front.angle;
    // swing arm from the pivot to the rear axle
    const dx = R[0] - PIVOT[0];
    const dy = R[1] - PIVOT[1];
    this.swingArm.position.set(PIVOT[0], PIVOT[1], 0);
    this.swingArm.rotation.z = Math.atan2(dy, dx);
    this.swingArm.scale.set(Math.hypot(dx, dy), 1, 1);
    // shocks: from the swing arm (75 % towards the axle) to the frame
    const sb = new THREE.Vector3(PIVOT[0] + dx * 0.78, PIVOT[1] + dy * 0.78 + 0.03, 0);
    for (const s of this.shocks) {
      const bottom = sb.clone().setZ(s.z);
      const top = new THREE.Vector3(SHOCK_TOP[0], SHOCK_TOP[1], s.z);
      const d = new THREE.Vector3().subVectors(top, bottom);
      s.group.position.copy(bottom);
      s.group.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize());
      s.group.scale.set(1, d.length(), 1);
    }
    // fork lower legs + fender follow the front axle along the fork axis
    const rake = (27 * Math.PI) / 180;
    this.forkLowers.position.set(F[0], F[1], 0);
    this.forkLowers.rotation.z = rake;

    // rider: chassis-frame acceleration (smoothed) drives the body's inertia
    const ax = (b.vx - this.prevV[0]) / Math.max(dt, 1e-3);
    const ay = (b.vy - this.prevV[1]) / Math.max(dt, 1e-3);
    this.prevV = [b.vx, b.vy];
    const cs = Math.cos(-b.angle);
    const sn = Math.sin(-b.angle);
    const lx = clamp(ax * cs - ay * sn, -40, 40);
    const ly = clamp(ax * sn + ay * cs, -60, 60);
    this.accF[0] += (lx - this.accF[0]) * Math.min(1, dt * 12);
    this.accF[1] += (ly - this.accF[1]) * Math.min(1, dt * 12);
    const comp = (b.rear.compression + b.front.compression) / 2;
    this.rider.update(Math.min(dt, 1 / 30), this.accF, b.lean, comp, !b.grounded, wrapAngle(b.angle), crashed);
  }

  /** During a crash the rider is thrown: detach him to the ragdoll transform. */
  setRiderDetached(detached: boolean, x = 0, y = 0, angle = 0, parent?: THREE.Object3D): void {
    if (detached && parent) {
      if (this.riderHolder.parent !== parent) parent.add(this.riderHolder);
      this.riderHolder.position.set(x, y - 0.3, this.lane);
      this.riderHolder.rotation.z = angle;
    } else if (!detached && this.riderHolder.parent !== this.chassis) {
      this.chassis.add(this.riderHolder);
      this.riderHolder.position.set(0, 0, 0);
      this.riderHolder.rotation.z = 0;
    }
  }
}

/** Release GPU resources of a bike model (geometries, materials, textures). */
export function disposeObject(o: THREE.Object3D): void {
  o.traverse((n) => {
    const m = n as THREE.Mesh;
    if (m.geometry) m.geometry.dispose();
    const mats = m.material ? (Array.isArray(m.material) ? m.material : [m.material]) : [];
    for (const mat of mats) {
      const sm = mat as THREE.MeshStandardMaterial;
      sm.map?.dispose();
      sm.dispose();
    }
  });
}
