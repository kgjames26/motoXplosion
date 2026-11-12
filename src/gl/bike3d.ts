import type { Outfit } from '../outfits';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { clamp, wrapAngle } from '../core/math';
import type { Bike, Wheel } from '../physics/bike';
import { BIKES, BikeModel } from '../bikes';
import type { RiderLook } from '../ai';
import { gearFor } from './gear';
import { GRIP, mergeByMaterial, PEG, Rider } from './rider3d';

export { gearFor } from './gear';
export type { GearLook } from './gear';

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
const HEAD_TUBE: V2 = [0.47, 0.24];
const PIVOT: V2 = [-0.1, -0.33];
const SHOCK_TOP: V2 = [-0.5, 0.08];

let envTex: THREE.Texture | null = null;
/** True while a lighter model (other riders) is being built. */
let LITE = false;

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
  const m = new THREE.Mesh(new THREE.TubeGeometry(curve, LITE ? Math.max(4, seg >> 1) : seg * 2, radius, LITE ? 6 : 14), mat);
  m.castShadow = true;
  return m;
}

// ---------------------------------------------------------------- wheel

function buildWheel(radius: number, mats: Record<string, THREE.Material>, front: boolean, lite = false): THREE.Group {
  const g = new THREE.Group();
  const tyreR = 0.075;
  // carcass: flatter tread and upright sidewalls than a plain torus
  const tyre = new THREE.Mesh(new THREE.TorusGeometry(radius - tyreR, tyreR, lite ? 10 : 18, lite ? 40 : 72), mats.rubber);
  tyre.scale.z = 0.92;
  g.add(tyre);
  // knobs: a centre row and two shoulder rows, staggered (motocross pattern)
  const m = new THREE.Matrix4();
  const rz = new THREE.Matrix4();
  const tilt = new THREE.Matrix4();
  const centre = new THREE.InstancedMesh(new THREE.BoxGeometry(0.042, 0.03, 0.05), mats.rubber, 44);
  for (let i = 0; i < 44; i++) {
    const a = (i / 44) * Math.PI * 2;
    rz.makeRotationZ(a - Math.PI / 2);
    m.makeTranslation(Math.cos(a) * (radius - 0.004), Math.sin(a) * (radius - 0.004), i % 2 ? 0.014 : -0.014).multiply(rz);
    centre.setMatrixAt(i, m);
  }
  g.add(centre);
  const shoulder = new THREE.InstancedMesh(new THREE.BoxGeometry(0.05, 0.034, 0.034), mats.rubber, 88);
  for (let i = 0; i < 88; i++) {
    const side = i % 2 ? 1 : -1;
    const a = ((i >> 1) / 44) * Math.PI * 2 + (side > 0 ? 0.07 : 0);
    rz.makeRotationZ(a - Math.PI / 2);
    tilt.makeRotationX(side * 0.75);
    m.makeTranslation(Math.cos(a) * (radius - 0.03), Math.sin(a) * (radius - 0.03), side * 0.058).multiply(rz).multiply(tilt);
    shoulder.setMatrixAt(i, m);
  }
  g.add(shoulder);
  // rim: box-section profile
  const rimR = radius - tyreR * 1.9;
  const rimPts = [[rimR - 0.012, -0.038], [rimR + 0.016, -0.046], [rimR + 0.02, -0.036], [rimR + 0.006, -0.02], [rimR + 0.006, 0.02], [rimR + 0.02, 0.036], [rimR + 0.016, 0.046], [rimR - 0.012, 0.038], [rimR - 0.012, -0.038]].map(([r, z]) => new THREE.Vector2(r, z));
  const rim = new THREE.Mesh(new THREE.LatheGeometry(rimPts, lite ? 32 : 64).rotateX(Math.PI / 2), mats.rims);
  g.add(rim);
  // spokes: real rods, crossed lacing on both flanges, with nipples at the rim
  const spokes = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.0032, 0.0032, 1, 5), mats.chrome, 36);
  const nipples = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.006, 0.006, 0.02, 6), mats.chrome, 36);
  const q = new THREE.Quaternion();
  const yAxis = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i < 36; i++) {
    const a = (i / 36) * Math.PI * 2;
    const side = i % 2 ? 1 : -1;
    const off = side * (i % 4 < 2 ? 0.45 : -0.45);
    const p0 = new THREE.Vector3(Math.cos(a + off) * 0.062, Math.sin(a + off) * 0.062, side * 0.05);
    const p1 = new THREE.Vector3(Math.cos(a) * (rimR - 0.01), Math.sin(a) * (rimR - 0.01), side * 0.008);
    const d = new THREE.Vector3().subVectors(p1, p0);
    const len = d.length();
    q.setFromUnitVectors(yAxis, d.clone().normalize());
    m.compose(p0.clone().addScaledVector(d, 0.5), q, new THREE.Vector3(1, len, 1));
    spokes.setMatrixAt(i, m);
    m.compose(p1, q, new THREE.Vector3(1, 1, 1));
    nipples.setMatrixAt(i, m);
  }
  g.add(spokes);
  if (!lite) g.add(nipples);
  // hub with two flanges and the axle nut
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.15, 20).rotateX(Math.PI / 2), mats.hub);
  g.add(hub);
  for (const z of [-0.05, 0.05]) {
    const flange = new THREE.Mesh(new THREE.CylinderGeometry(0.068, 0.068, 0.012, 24).rotateX(Math.PI / 2), mats.hub);
    flange.position.z = z;
    g.add(flange);
  }
  const nut = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.2, 6).rotateX(Math.PI / 2), mats.chrome);
  g.add(nut);
  // brake disc: wave ring with drilled holes, on its carrier (front: right side, rear: left)
  const discZ = 0.074; // camera side on both wheels (the chain runs on the other side)
  const discShape = new THREE.Shape();
  const R1 = front ? 0.135 : 0.115;
  for (let i = 0; i <= 48; i++) {
    const a = (i / 48) * Math.PI * 2;
    const r = R1 + Math.sin(a * 12) * 0.006;
    if (i === 0) discShape.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    else discShape.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  const inner = new THREE.Path();
  inner.absarc(0, 0, R1 - 0.04, 0, Math.PI * 2, true);
  discShape.holes.push(inner);
  for (let i = 0; i < (lite ? 0 : 18); i++) {
    const a = (i / 18) * Math.PI * 2;
    const h = new THREE.Path();
    h.absarc(Math.cos(a) * (R1 - 0.02), Math.sin(a) * (R1 - 0.02), 0.006, 0, Math.PI * 2, true);
    discShape.holes.push(h);
  }
  const disc = new THREE.Mesh(new THREE.ExtrudeGeometry(discShape, { depth: 0.006, bevelEnabled: false, curveSegments: 8 }), mats.chrome);
  disc.position.z = discZ - 0.003;
  g.add(disc);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const arm = new THREE.Mesh(new THREE.BoxGeometry(R1 - 0.07, 0.016, 0.005), mats.dark);
    arm.position.set(Math.cos(a) * (R1 - 0.03) * 0.62, Math.sin(a) * (R1 - 0.03) * 0.62, discZ);
    arm.rotation.z = a;
    g.add(arm);
  }
  if (!front) {
    // rear sprocket with teeth (right side: the chain faces the camera)
    const sp = new THREE.Shape();
    const teeth = 42;
    for (let i = 0; i <= teeth * 2; i++) {
      const a = (i / (teeth * 2)) * Math.PI * 2;
      const r = i % 2 ? 0.118 : 0.108;
      if (i === 0) sp.moveTo(Math.cos(a) * r, Math.sin(a) * r);
      else sp.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    const hole = new THREE.Path();
    hole.absarc(0, 0, 0.05, 0, Math.PI * 2, true);
    sp.holes.push(hole);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + 0.3;
      const h = new THREE.Path();
      h.absarc(Math.cos(a) * 0.08, Math.sin(a) * 0.08, 0.014, 0, Math.PI * 2, true);
      sp.holes.push(h);
    }
    const sprocket = new THREE.Mesh(new THREE.ExtrudeGeometry(sp, { depth: 0.008, bevelEnabled: false, curveSegments: 6 }), mats.gold);
    sprocket.position.z = -0.082;
    g.add(sprocket);
  }
  return g;
}

// ---------------------------------------------------------------- printed graphics

function canvasTex(w: number, h: number, draw: (c: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  draw(cv.getContext('2d')!);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}
const hex6 = (n: number) => '#' + n.toString(16).padStart(6, '0');

/** Graphics kit of a bike's shrouds: slashes in the second colour, brand name, pinstripes. */
function decalTexture(model: BikeModel): THREE.Texture {
  const k = model.colors;
  const p = hex6(k.primary);
  const sec = hex6(k.secondary);
  return canvasTex(512, 256, (c) => {
    const g = c.createLinearGradient(0, 0, 0, 256);
    g.addColorStop(0, p);
    g.addColorStop(1, p);
    c.fillStyle = g;
    c.fillRect(0, 0, 512, 256);
    // sweeping slashes
    c.fillStyle = sec;
    c.beginPath();
    c.moveTo(0, 256);
    c.lineTo(150, 256);
    c.lineTo(420, 60);
    c.lineTo(512, 40);
    c.lineTo(512, 0);
    c.lineTo(330, 60);
    c.fill();
    c.fillStyle = '#14161c';
    c.beginPath();
    c.moveTo(170, 256);
    c.lineTo(215, 256);
    c.lineTo(470, 78);
    c.lineTo(440, 74);
    c.fill();
    c.fillStyle = k.plate;
    c.beginPath();
    c.moveTo(232, 256);
    c.lineTo(252, 256);
    c.lineTo(500, 86);
    c.lineTo(484, 84);
    c.fill();
    // brand
    c.font = 'italic 900 58px Arial Black, system-ui, sans-serif';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.lineJoin = 'round';
    c.lineWidth = 7;
    c.strokeStyle = '#14161c';
    const name = model.name.split(' ')[0].toUpperCase();
    c.save();
    c.translate(250, 150);
    c.rotate(-0.12);
    c.strokeText(name, 0, 0);
    c.fillStyle = '#ffffff';
    c.fillText(name, 0, 0);
    c.restore();
    c.font = 'italic 800 22px Arial, system-ui, sans-serif';
    c.fillStyle = '#ffffff';
    c.fillText('MOTOXPLOSION', 380, 226);
  });
}

let finTex: THREE.Texture | null = null;
/** Radiator core: fine horizontal fins. */
function finTexture(): THREE.Texture {
  if (finTex) return finTex;
  finTex = canvasTex(64, 64, (c) => {
    c.fillStyle = '#2a2d33';
    c.fillRect(0, 0, 64, 64);
    c.fillStyle = '#9aa2ae';
    for (let y = 0; y < 64; y += 4) c.fillRect(0, y, 64, 2);
    c.fillStyle = 'rgba(0,0,0,0.35)';
    for (let x = 0; x < 64; x += 16) c.fillRect(x, 0, 2, 64);
  });
  finTex.wrapS = finTex.wrapT = THREE.RepeatWrapping;
  finTex.repeat.set(2, 4);
  return finTex;
}

let seatTex: THREE.Texture | null = null;
/** Seat cover: gripper ribs across the seat. */
function seatBump(): THREE.Texture {
  if (seatTex) return seatTex;
  seatTex = canvasTex(64, 64, (c) => {
    c.fillStyle = '#808080';
    c.fillRect(0, 0, 64, 64);
    c.fillStyle = '#d0d0d0';
    for (let x = 0; x < 64; x += 8) c.fillRect(x, 0, 4, 64);
  });
  seatTex.colorSpace = THREE.NoColorSpace;
  seatTex.wrapS = seatTex.wrapT = THREE.RepeatWrapping;
  seatTex.repeat.set(14, 1);
  return seatTex;
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

  readonly outfit: string;

  /** `lite`: lighter model for the other riders (half the geometry, no small parts). */
  constructor(model: BikeModel = BIKES[0], rival?: RiderLook, outfit?: Outfit, lite = false) {
    this.model = model;
    LITE = lite;
    this.outfit = outfit?.id ?? 'moto';
    const k = model.colors;
    const scrambler = model.style === 'scrambler';
    const plastic = (c: number, extra: Partial<THREE.MeshPhysicalMaterialParameters> = {}) =>
      new THREE.MeshPhysicalMaterial({ color: c, metalness: 0.05, roughness: 0.34, clearcoat: 0.7, clearcoatRoughness: 0.18, envMapIntensity: 1, ...extra });
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
      // v2.23: shrouds / tanks with printed graphics, ribbed seat, radiator cores
      shroud: scrambler ? std(k.primary, 0.75, 0.38) : plastic(0xffffff, { map: decalTexture(model) }),
      radiator: std(0xffffff, 0.7, 0.45, { map: finTexture() }),
    });
    (mats.seat as THREE.MeshStandardMaterial).bumpMap = seatBump();
    (mats.seat as THREE.MeshStandardMaterial).bumpScale = 1.2;
    this.group.add(this.chassis);
    if (scrambler) this.buildFrame();
    else this.buildModern(model);
    this.buildFront(model);
    if (!lite) this.buildDetails(model);
    this.rearWheel = buildWheel(0.43, mats, false, lite);
    this.frontWheel = buildWheel(0.43, mats, true, lite);
    this.chassis.add(this.rearWheel, this.frontWheel, this.swingArm, this.forkLowers);
    this.buildSwingArm();
    this.buildForkLowers();
    this.buildShocks(scrambler ? [-0.13, 0.13] : [0]);
    this.rider = new Rider(mats, gearFor(model, rival, outfit), lite);
    this.riderHolder.add(this.rider.group);
    this.chassis.add(this.riderHolder);
    // one mesh per material for the fixed parts of the chassis and of each moving assembly
    const moving = [this.rearWheel, this.frontWheel, this.swingArm, this.forkLowers, this.riderHolder, ...this.shocks.map((sh) => sh.group)];
    for (const o of moving) this.chassis.remove(o);
    mergeByMaterial(this.chassis);
    for (const o of moving) this.chassis.add(o);
    for (const o of [this.rearWheel, this.frontWheel, this.swingArm, this.forkLowers]) mergeByMaterial(o);
    this.group.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).castShadow = true;
    });
    LITE = false;
  }

  /** Image-based lighting for the metal parts (call once a renderer exists). */
  setEnvironment(renderer: THREE.WebGLRenderer, rebuild = false): void {
    if (!envTex || rebuild) {
      const pm = new THREE.PMREMGenerator(renderer);
      envTex = pm.fromScene(new RoomEnvironment(), 0.04).texture;
      pm.dispose();
    }
    for (const m of [...Object.values(this.mats), ...this.rider.materials]) (m as THREE.MeshStandardMaterial).envMap = envTex;
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
    const crank = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.26, 36).rotateX(Math.PI / 2), m.engine);
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
    const tank = new THREE.Mesh(new THREE.SphereGeometry(1, 40, 28), m.primary);
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
    const rf = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.025, 10, 32, 1.4), m.frame);
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
      const st = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 1, 18), m.chrome);
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

  /**
   * v2.23 small parts that make the bike read as a machine: levers and cables, bar pad,
   * serrated pegs, brake pedal and gear lever, kick-starter, engine fins and bolts, radiators,
   * front sprocket, exhaust clamps.
   */
  private buildDetails(model: BikeModel): void {
    const m = this.mats;
    const c = this.chassis;
    const st = model.style;
    const add = (o: THREE.Object3D) => (c.add(o), o);
    const box = (w: number, h: number, d: number, mat: THREE.Material, x: number, y: number, z: number, rz = 0) => {
      const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      o.position.set(x, y, z);
      o.rotation.z = rz;
      return add(o);
    };
    const cyl = (r: number, len: number, mat: THREE.Material, x: number, y: number, z: number, seg = 16) => {
      const o = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, seg).rotateX(Math.PI / 2), mat);
      o.position.set(x, y, z);
      return add(o);
    };
    // ---- cockpit: levers, perches, throttle housing, cables, bar clamps and pad
    for (const side of [-1, 1]) {
      const z = side * 0.25;
      box(0.03, 0.03, 0.04, m.dark, GRIP[0] + 0.005, GRIP[1], z); // perch
      const lever = new THREE.Mesh(new THREE.CapsuleGeometry(0.007, 0.13, 4, 8).rotateX(Math.PI / 2), m.chrome);
      lever.position.set(GRIP[0] + 0.045, GRIP[1] - 0.005, side * 0.31);
      lever.rotation.y = side * 0.18;
      add(lever);
      const ball = new THREE.Mesh(new THREE.SphereGeometry(0.011, 10, 8), m.chrome);
      ball.position.set(GRIP[0] + 0.058, GRIP[1] - 0.005, side * 0.385);
      add(ball);
      // grip flange and end cap
      cyl(0.027, 0.012, m.dark, GRIP[0], GRIP[1], side * 0.245, 14);
      cyl(0.024, 0.014, m.chrome, GRIP[0], GRIP[1], side * 0.357, 14);
      // cable from the perch down to the frame
      c.add(tube([[GRIP[0] + 0.02, GRIP[1], z], [GRIP[0] + 0.1, GRIP[1] - 0.06, z * 0.8], [0.5, 0.2, side * 0.07], [0.36, 0.08, side * 0.06]], 0.006, m.dark, 12));
    }
    cyl(0.03, 0.06, m.dark, GRIP[0], GRIP[1], 0.215, 14); // throttle housing
    for (const z of [-0.05, 0.05]) box(0.05, 0.045, 0.035, m.frame, 0.415, 0.36, z, 0.45); // bar clamps
    if (st === 'mx' || st === 'enduro' || st === 'electric') {
      // crossbar with its pad
      c.add(tube([[GRIP[0] - 0.035, GRIP[1] + 0.035, -0.16], [GRIP[0] - 0.04, GRIP[1] + 0.045, 0], [GRIP[0] - 0.035, GRIP[1] + 0.035, 0.16]], 0.009, m.chrome, 6));
      const pad = new THREE.Mesh(new THREE.CapsuleGeometry(0.028, 0.2, 6, 14).rotateX(Math.PI / 2), m.secondary);
      pad.position.set(GRIP[0] - 0.04, GRIP[1] + 0.045, 0);
      add(pad);
    }
    // ---- pegs: serrated, with brake pedal (right) and gear lever (left)
    for (const side of [-1, 1]) {
      for (let k = 0; k < 5; k++) box(0.008, 0.012, 0.1, m.chrome, PEG[0] - 0.028 + k * 0.014, PEG[1] + 0.017, side * 0.19);
      box(0.02, 0.05, 0.02, m.frame, PEG[0], PEG[1] - 0.02, side * 0.14);
    }
    c.add(tube([[PEG[0] - 0.02, PEG[1] - 0.02, 0.15], [0.02, PEG[1] - 0.03, 0.16], [0.1, PEG[1] + 0.005, 0.17]], 0.009, m.chrome, 8));
    box(0.045, 0.012, 0.035, m.chrome, 0.115, PEG[1] + 0.008, 0.17);
    c.add(tube([[-0.02, -0.3, -0.15], [0.07, -0.34, -0.17], [0.14, PEG[1] + 0.05, -0.17]], 0.008, m.chrome, 8));
    cyl(0.014, 0.04, m.dark, 0.14, PEG[1] + 0.05, -0.185, 10);
    if (st === 'electric') return;
    // ---- engine: finned cylinder, head cover, bolts on the clutch cover, kick-starter, carb
    const ang = st === 'scrambler' ? -0.25 : -0.3;
    const ex = Math.sin(-ang);
    const ey = Math.cos(-ang);
    const bx = st === 'scrambler' ? 0.1 : 0.11;
    const by = st === 'scrambler' ? -0.2 : -0.22;
    if (st !== 'scrambler')
      for (let i = 0; i < 9; i++) {
        const t = 0.02 + i * 0.024;
        box(0.19 - i * 0.004, 0.009, 0.2 - i * 0.003, m.engine, bx + ex * t, by + ey * t, 0, ang);
      }
    const top = st === 'scrambler' ? 0.3 : 0.25;
    box(0.15, 0.05, 0.16, st === 'scrambler' ? m.dark : m.primary, bx + ex * top, by + ey * top, 0, ang); // head cover
    cyl(0.012, 0.03, m.chrome, bx + ex * (top + 0.035), by + ey * (top + 0.035), 0.0, 8); // spark plug
    const cx = st === 'scrambler' ? 0.0 : 0.0;
    const coverR = st === 'scrambler' ? 0.1 : 0.08;
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      cyl(0.008, 0.012, m.chrome, cx + Math.cos(a) * coverR * 0.82, -0.32 + Math.sin(a) * coverR * 0.82, st === 'scrambler' ? 0.158 : 0.138, 6);
    }
    cyl(0.03, 0.02, m.dark, cx, -0.32, st === 'scrambler' ? 0.16 : 0.14, 12);
    // carburettor / throttle body behind the cylinder with its intake boot
    cyl(0.04, 0.09, m.engine, 0.0, -0.1, 0.0, 14).rotation.y = Math.PI / 2;
    c.add(tube([[-0.02, -0.1, 0], [-0.1, -0.06, 0], [-0.18, -0.04, 0]], 0.036, m.dark, 8));
    if (st !== 'rally') {
      // kick-starter folded along the engine (right side)
      c.add(tube([[-0.06, -0.3, 0.15], [-0.04, -0.2, 0.17], [-0.08, -0.06, 0.175]], 0.011, m.chrome, 10));
      box(0.07, 0.02, 0.03, m.dark, -0.1, -0.05, 0.19, 0.3);
    }
    // front sprocket cover (left side)
    cyl(0.06, 0.03, m.dark, PIVOT[0] + 0.07, PIVOT[1] + 0.02, -0.11, 16);
    // ---- radiators under the shrouds (liquid-cooled bikes)
    if (st === 'mx' || st === 'enduro' || st === 'rally') {
      for (const z of [-0.105, 0.105]) {
        box(0.035, 0.2, 0.085, m.radiator, 0.34, 0.07, z, -0.42);
        box(0.04, 0.012, 0.09, m.dark, 0.38, 0.165, z, -0.42);
        c.add(tube([[0.33, -0.03, z], [0.26, -0.1, z * 0.6], [0.2, -0.06, z * 0.3]], 0.012, m.dark, 8));
      }
    }
    // exhaust clamps / springs at the head
    box(0.03, 0.03, 0.03, m.chrome, 0.245, st === 'scrambler' ? 0.0 : -0.04, 0.055);
  }

  /** UVs = position inside the bounding box of the side profile (printed graphics, seat ribs). */
  private decalUV(g: THREE.BufferGeometry, pts: [number, number][]): void {
    const xs = pts.map((p) => p[0]);
    const ys = pts.map((p) => p[1]);
    const x0 = Math.min(...xs);
    const y0 = Math.min(...ys);
    const w = Math.max(...xs) - x0 || 1;
    const h = Math.max(...ys) - y0 || 1;
    const pos = g.attributes.position;
    const uv = g.attributes.uv;
    for (let i = 0; i < pos.count; i++) uv.setXY(i, (pos.getX(i) - x0) / w, (pos.getY(i) - y0) / h);
  }

  /** Side-profile shape extruded across the bike (plastics, seat, tanks, panels). */
  private prof(pts: [number, number][], width: number, mat: THREE.Material, z = 0, bevel = 0.015): THREE.Mesh {
    const sh = new THREE.Shape();
    sh.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) sh.lineTo(pts[i][0], pts[i][1]);
    sh.closePath();
    const g = new THREE.ExtrudeGeometry(sh, { depth: width, bevelEnabled: bevel > 0, bevelSize: bevel, bevelThickness: bevel, bevelSegments: LITE ? 1 : 4, curveSegments: LITE ? 4 : 12 });
    g.translate(0, 0, z - width / 2);
    this.decalUV(g, pts);
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
      const crank = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.22, 36).rotateX(Math.PI / 2), m.engine);
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
    if (st === 'trial') this.prof([[0.02, 0.18], [0.36, 0.2], [0.4, 0.12], [0.05, 0.1]], 0.18, m.shroud, 0, 0.03);
    else if (st === 'rally') {
      // big front tanks + tall fairing with windscreen and navigation tower
      for (const z of [-0.14, 0.14]) this.prof([[-0.05, 0.25], [0.42, 0.33], [0.5, 0.1], [0.35, -0.12], [-0.05, -0.05]], 0.1, m.shroud, z, 0.03);
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
      this.prof([[0.02, 0.22], [0.36, 0.26], [0.5, 0.18], [0.46, 0.0], [0.28, -0.12], [0.05, 0.02]], 0.26, m.shroud, 0, 0.025);
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
    // chain: upper and lower runs on the left side, slider on the arm, guide near the sprocket
    for (const y of [0.075, -0.075]) {
      const chain = new THREE.Mesh(new THREE.BoxGeometry(0.98, 0.016, 0.014), m.dark);
      chain.position.set(0.52, y, -0.082);
      chain.rotation.z = y > 0 ? 0.04 : -0.04;
      this.swingArm.add(chain);
      const pins = new THREE.Mesh(new THREE.BoxGeometry(0.98, 0.006, 0.02), m.chrome);
      pins.position.copy(chain.position);
      pins.rotation.z = chain.rotation.z;
      this.swingArm.add(pins);
    }
    const guide = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.07, 0.03), m.secondary);
    guide.position.set(0.72, -0.07, -0.082);
    this.swingArm.add(guide);
    // rear brake caliper on the camera side, axle adjuster blocks
    const cal = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.06, 0.035), m.gold);
    cal.position.set(0.9, 0.085, 0.085);
    this.swingArm.add(cal);
    for (const z of [-0.1, 0.1]) {
      const blk = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.065, 0.04), m.chrome);
      blk.position.set(0.985, 0, z);
      this.swingArm.add(blk);
    }
  }

  private buildForkLowers(): void {
    // positioned at the front axle, aligned with the fork axis (local -y = towards the axle)
    const m = this.mats;
    for (const z of [-0.1, 0.1]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.036, 0.42, 20), m.forks);
      leg.position.set(0, 0.21, z);
      this.forkLowers.add(leg);
      const seal = new THREE.Mesh(new THREE.CylinderGeometry(0.037, 0.037, 0.025, 12), m.dark);
      seal.position.set(0, 0.42, z);
      this.forkLowers.add(seal);
    }
    for (const z of [-0.1, 0.1]) {
      const foot = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.07, 0.05), m.forks);
      foot.position.set(0, 0.0, z);
      this.forkLowers.add(foot);
    }
    // front brake caliper (camera side) and its hose
    const cal = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.085, 0.035), m.gold);
    cal.position.set(-0.07, 0.1, 0.085);
    this.forkLowers.add(cal);
    const hose = tube([[-0.07, 0.14, 0.085], [-0.05, 0.3, 0.12], [-0.03, 0.44, 0.12]], 0.006, m.dark, 8);
    this.forkLowers.add(hose);
    // plastic fork guards on modern bikes
    if (this.model.style !== 'scrambler') {
      for (const z of [-0.1, 0.1]) {
        const guard = new THREE.Mesh(new THREE.CylinderGeometry(0.046, 0.05, 0.36, 14, 1, true, Math.PI / 2 - 1.1, 2.2), m.fender);
        guard.position.set(0, 0.2, z);
        (guard.material as THREE.Material).side = THREE.DoubleSide;
        this.forkLowers.add(guard);
      }
    }
    // front fender rides with the wheel (fixed to the lower legs) on scramblers and trials
    if (this.model.style !== 'scrambler' && this.model.style !== 'trial') return;
    const fender = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.025, 10, 32, 1.3), m.fender);
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
      const coil = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), LITE ? 70 : 160, 0.008, LITE ? 4 : 6), m.gold);
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
