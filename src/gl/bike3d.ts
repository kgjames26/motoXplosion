import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { clamp, wrapAngle } from '../core/math';
import type { Bike, Wheel } from '../physics/bike';

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
const OLIVE = 0x6f6236;
const GREEN = 0x2f4d33;
const LEATHER = 0x6b3a22;
const RUBBER = 0x2a2420;
const JACKET = 0x5c3a24;
const PANTS = 0x4d3322;

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
  const rim = new THREE.Mesh(new THREE.TorusGeometry(radius - tyreR * 1.9, 0.02, 6, 40), mats.chrome);
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
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.14, 12).rotateX(Math.PI / 2), mats.brass);
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

interface Segment {
  mesh: THREE.Mesh;
  thick: number;
}

class Rider {
  readonly group = new THREE.Group();
  private segs: Record<string, Segment> = {};
  private torso: THREE.Group;
  private head: THREE.Group;
  private pelvisMesh: THREE.Mesh;
  // mass-spring state of the pelvis and chest (chassis frame)
  private pelvis: V2 = [-0.2, 0.3];
  private pelvisV: V2 = [0, 0];
  private lean = 0.35; // torso pitch (rad from vertical, forward positive)
  private leanV = 0;

  constructor(mats: Record<string, THREE.Material>) {
    const cap = (r: number, mat: THREE.Material, name: string) => {
      const m = new THREE.Mesh(new THREE.CapsuleGeometry(1, 1, 4, 10), mat);
      m.castShadow = true;
      this.group.add(m);
      this.segs[name] = { mesh: m, thick: r };
    };
    for (const side of ['L', 'R']) {
      cap(0.095, mats.pants, 'thigh' + side);
      cap(0.075, mats.pants, 'shin' + side);
      cap(0.07, mats.jacket, 'upper' + side);
      cap(0.06, mats.jacket, 'fore' + side);
    }
    // boots and gloves
    for (const side of ['L', 'R']) {
      const boot = new THREE.Mesh(new THREE.BoxGeometry(0.27, 0.12, 0.12), mats.boot);
      boot.castShadow = true;
      boot.name = 'boot' + side;
      this.group.add(boot);
      const glove = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), mats.glove);
      glove.name = 'glove' + side;
      this.group.add(glove);
    }
    this.pelvisMesh = new THREE.Mesh(new THREE.SphereGeometry(0.15, 14, 10), mats.pants);
    this.pelvisMesh.scale.set(1, 0.75, 1.05);
    this.pelvisMesh.castShadow = true;
    this.group.add(this.pelvisMesh);
    // torso: jacket + green chest protector with "98" on the back
    this.torso = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.18, 0.26, 4, 12), mats.jacket);
    body.scale.set(0.9, 1, 1.15);
    body.position.y = 0.24;
    body.castShadow = true;
    const protector = new THREE.Mesh(new THREE.CapsuleGeometry(0.17, 0.16, 4, 10), mats.protector);
    protector.scale.set(1.05, 1, 1.25);
    protector.position.set(0.01, 0.32, 0);
    protector.castShadow = true;
    const back = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.15), new THREE.MeshStandardMaterial({ map: plateTexture('98', '#2f4d33', '#c9b98a'), transparent: true, roughness: 0.7 }));
    back.position.set(-0.185, 0.33, 0);
    back.rotation.y = -Math.PI / 2;
    const shoulders = new THREE.Mesh(new THREE.CapsuleGeometry(0.1, 0.32, 4, 8).rotateX(Math.PI / 2), mats.protector);
    shoulders.position.set(0, 0.46, 0);
    this.torso.add(body, protector, back, shoulders);
    this.group.add(this.torso);
    // helmet: green shell, peak, goggles, chin guard
    this.head = new THREE.Group();
    const shell = new THREE.Mesh(new THREE.SphereGeometry(0.16, 18, 14), mats.helmet);
    shell.scale.set(1.08, 1, 0.95);
    shell.castShadow = true;
    const peak = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.02, 0.2), mats.helmet);
    peak.position.set(0.12, 0.08, 0);
    peak.rotation.z = -0.25;
    const goggles = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.2), mats.goggles);
    goggles.position.set(0.13, 0.01, 0);
    const strap = new THREE.Mesh(new THREE.TorusGeometry(0.145, 0.015, 6, 20).rotateY(Math.PI / 2), mats.leather);
    strap.position.set(0.0, 0.01, 0);
    strap.scale.set(1, 1, 1);
    const chin = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.08, 0.16), mats.helmet);
    chin.position.set(0.12, -0.09, 0);
    chin.rotation.z = 0.35;
    this.head.add(shell, peak, goggles, strap, chin);
    this.group.add(this.head);
  }

  private place(name: string, a: THREE.Vector3, b: THREE.Vector3): void {
    const s = this.segs[name];
    const d = new THREE.Vector3().subVectors(b, a);
    const len = d.length();
    s.mesh.position.copy(a).addScaledVector(d, 0.5);
    s.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
    // unit capsule (radius 1, length 1) is 3 units tall
    s.mesh.scale.set(s.thick, len / 3, s.thick);
  }

  /**
   * Update the skeleton. `acc` = chassis acceleration in the chassis frame (m/s²),
   * `lean` = balance input, `comp` = mean suspension compression, `air` = airborne.
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
    this.pelvisMesh.position.copy(pelvis);
    // spine
    this.torso.position.copy(pelvis);
    this.torso.rotation.z = -this.lean;
    const up = new THREE.Vector3(Math.sin(this.lean), Math.cos(this.lean), 0);
    const neck = pelvis.clone().addScaledVector(up, 0.6);
    // head keeps the gaze towards the horizon (counters part of the bike's pitch)
    this.head.position.copy(neck).addScaledVector(up, 0.12).add(new THREE.Vector3(0.03, 0, 0));
    this.head.rotation.z = clamp(-pitch * 0.6, -0.5, 0.5) - this.lean * 0.15;
    // legs: hip → knee → ankle on the pegs, knees forward and slightly out
    for (const side of [-1, 1]) {
      const sname = side < 0 ? 'L' : 'R';
      const hip = new THREE.Vector3(P[0], P[1] - 0.04, side * 0.12);
      const ankle = new THREE.Vector3(PEG[0] - 0.02, PEG[1] + 0.08, side * 0.19);
      const knee = ik(hip, ankle, 0.46, 0.46, new THREE.Vector3(1, 0.2, side * 0.25));
      this.place('thigh' + sname, hip, knee);
      this.place('shin' + sname, knee, ankle);
      const boot = this.group.getObjectByName('boot' + sname)!;
      boot.position.set(PEG[0] + 0.04, PEG[1] + 0.03, side * 0.19);
      // arms: shoulder → elbow → grip, elbows up and out ("attack position")
      const shoulder = pelvis.clone().addScaledVector(up, 0.5).add(new THREE.Vector3(0, 0, side * 0.21));
      const hand = new THREE.Vector3(GRIP[0], GRIP[1], side * 0.3);
      const elbow = ik(shoulder, hand, 0.33, 0.32, new THREE.Vector3(-0.3, 0.2, side * 1));
      this.place('upper' + sname, shoulder, elbow);
      this.place('fore' + sname, elbow, hand);
      this.group.getObjectByName('glove' + sname)!.position.copy(hand);
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

  constructor() {
    const mats = (this.mats = {
      brass: std(BRASS, 0.75, 0.38),
      olive: std(OLIVE, 0.55, 0.45),
      green: std(GREEN, 0.35, 0.4),
      leather: std(LEATHER, 0.05, 0.75),
      rubber: std(RUBBER, 0, 0.92),
      chrome: std(0xe6e9ef, 1, 0.18),
      dark: std(0x2b2722, 0.6, 0.5),
      gold: std(0xe0a332, 0.9, 0.3),
      jacket: std(JACKET, 0.05, 0.8),
      pants: std(PANTS, 0.05, 0.85),
      protector: std(GREEN, 0.15, 0.55),
      helmet: std(0x3a5a3c, 0.25, 0.35),
      goggles: std(0x6a4a2a, 0.4, 0.3),
      boot: std(0x5a3a22, 0.1, 0.7),
      glove: std(0x3d5c3e, 0.05, 0.8),
    });
    this.group.add(this.chassis);
    this.buildFrame();
    this.rearWheel = buildWheel(0.43, mats, false);
    this.frontWheel = buildWheel(0.43, mats, true);
    this.chassis.add(this.rearWheel, this.frontWheel, this.swingArm, this.forkLowers);
    this.buildSwingArm();
    this.buildForkLowers();
    this.buildShocks();
    this.rider = new Rider(mats);
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
      c.add(tube([[0.47, 0.22, z * 0.6], [0.36, -0.05, z], [0.26, -0.42, z], [0.0, -0.5, z], [-0.14, -0.44, z], [-0.12, -0.2, z], [-0.2, 0.08, z * 0.9]], 0.022, m.olive));
      c.add(tube([[-0.2, 0.1, z * 0.9], [-0.5, 0.11, z], [-0.86, 0.13, z * 0.9]], 0.018, m.olive));
      c.add(tube([[-0.13, -0.28, z], [-0.5, 0.07, z]], 0.016, m.olive, 6));
    }
    c.add(tube([[0.48, 0.25, 0], [0.2, 0.17, 0], [-0.2, 0.1, 0]], 0.026, m.olive)); // backbone
    // steering head + triple clamps
    const head = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.2, 10), m.olive);
    head.position.set(HEAD_TUBE[0], HEAD_TUBE[1], 0);
    head.rotation.z = (27 * Math.PI) / 180;
    c.add(head);
    // engine: crankcase, finned cylinder, head, covers
    const crank = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.26, 20).rotateX(Math.PI / 2), m.brass);
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
    const cylHead = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.08, 0.22), m.brass);
    cylHead.position.set(0.2, 0.08, 0);
    cylHead.rotation.z = -0.25;
    c.add(cylHead);
    // tank with green side panels
    const tank = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), m.brass);
    tank.scale.set(0.25, 0.11, 0.15);
    tank.position.set(0.2, 0.25, 0);
    tank.rotation.z = -0.08;
    c.add(tank);
    for (const z of [-0.075, 0.075]) {
      const panel = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 12), m.green);
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
    const seat = new THREE.Mesh(new THREE.ExtrudeGeometry(seatShape, { depth: 0.2, bevelEnabled: true, bevelSize: 0.03, bevelThickness: 0.03, bevelSegments: 3 }), m.leather);
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
    const rf = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.025, 6, 16, 1.4), m.olive);
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
    const heat = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.065, 0.2, 14, 1, false, -0.6, 2.2).rotateZ(Math.PI / 2 - 0.08), m.brass);
    heat.position.set(-0.72, 0.05, 0.19);
    c.add(heat);
    // footpegs
    for (const z of [-0.19, 0.19]) {
      const peg = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.025, 0.1), m.dark);
      peg.position.set(PEG[0], PEG[1], z);
      c.add(peg);
    }
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
      const clamp3 = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.04, 0.28), m.olive);
      clamp3.position.copy(mount.clone().addScaledVector(axis, t));
      clamp3.rotation.z = rake;
      c.add(clamp3);
    }
    const barBase = mount.clone().addScaledVector(axis, -0.55);
    c.add(tube([[barBase.x, barBase.y, -0.32], [barBase.x - 0.03, barBase.y + 0.05, -0.2], [barBase.x, barBase.y + 0.02, 0], [barBase.x - 0.03, barBase.y + 0.05, 0.2], [GRIP[0], GRIP[1], 0.32]], 0.013, m.chrome));
    for (const z of [-0.3, 0.3]) {
      const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.1, 8).rotateX(Math.PI / 2), m.leather);
      grip.position.set(GRIP[0], GRIP[1], z);
      c.add(grip);
    }
    const fplate = new THREE.Mesh(new THREE.PlaneGeometry(0.26, 0.2), new THREE.MeshStandardMaterial({ map: plateTexture('98', '#e2d6b2', '#22402a'), transparent: true, roughness: 0.6, side: THREE.DoubleSide }));
    fplate.position.copy(mount.clone().addScaledVector(axis, -0.42)).add(new THREE.Vector3(0.09, 0, 0.0));
    fplate.rotation.set(0, Math.PI / 2 - 0.9, rake * 0.6);
    c.add(fplate);
  }

  private buildSwingArm(): void {
    // built along +x (length 1), scaled/rotated each frame from the pivot to the rear axle
    const m = this.mats;
    for (const z of [-0.1, 0.1]) {
      const arm = new THREE.Mesh(new THREE.BoxGeometry(1, 0.05, 0.035), m.olive);
      arm.position.set(0.5, 0, z);
      this.swingArm.add(arm);
    }
    const brace = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.04, 0.22), m.olive);
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
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.036, 0.42, 12), m.brass);
      leg.position.set(0, 0.21, z);
      this.forkLowers.add(leg);
      const seal = new THREE.Mesh(new THREE.CylinderGeometry(0.037, 0.037, 0.025, 12), m.dark);
      seal.position.set(0, 0.42, z);
      this.forkLowers.add(seal);
    }
    // front fender rides with the wheel (fixed to the lower legs)
    const fender = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.025, 6, 18, 1.3), m.olive);
    fender.scale.set(1, 1, 3.2);
    fender.rotation.z = 0.03; // arc over the top-front of the tyre
    fender.position.set(0, -0.0, 0);
    this.forkLowers.add(fender);
  }

  private buildShocks(): void {
    const m = this.mats;
    for (const z of [-0.13, 0.13]) {
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
    this.group.position.set(ox, oy, -0.25);
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
      this.riderHolder.position.set(x, y - 0.3, -0.25);
      this.riderHolder.rotation.z = angle;
    } else if (!detached && this.riderHolder.parent !== this.chassis) {
      this.chassis.add(this.riderHolder);
      this.riderHolder.position.set(0, 0, 0);
      this.riderHolder.rotation.z = 0;
    }
  }
}
