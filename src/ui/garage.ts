import * as THREE from 'three';
import { BIKES, BikeModel, ratings } from '../bikes';
import { Bike3D, disposeObject } from '../gl/bike3d';
import { Bike } from '../physics/bike';
import type { Profile } from '../profile';

const $ = (id: string) => document.getElementById(id)!;

/**
 * Garage: browse the 7 bikes in a rotating 3D showroom, compare specs (bars turn green when
 * better than the bike you ride), buy with coins, choose the bike to ride.
 */
export class Garage {
  private renderer: THREE.WebGLRenderer | null = null;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
  private bike3d: Bike3D | null = null;
  private physics = new Bike();
  private index = 0;
  private raf = 0;
  private angle = 0.6;
  private drag: number | null = null;
  onChange: () => void = () => {};

  constructor(
    private profile: Profile,
    private save: () => void,
  ) {
    $('garage-prev').addEventListener('click', () => this.show(this.index - 1));
    $('garage-next').addEventListener('click', () => this.show(this.index + 1));
    $('g-action').addEventListener('click', () => this.action());
    const view = $('garage-view');
    view.addEventListener('pointerdown', (e) => {
      this.drag = e.clientX;
      view.setPointerCapture(e.pointerId);
    });
    view.addEventListener('pointermove', (e) => {
      if (this.drag === null) return;
      this.angle += (e.clientX - this.drag) * 0.01;
      this.drag = e.clientX;
    });
    view.addEventListener('pointerup', () => (this.drag = null));
    // showroom
    this.scene.background = new THREE.Color(0x1a120e);
    const floor = new THREE.Mesh(new THREE.CircleGeometry(2.4, 48), new THREE.MeshStandardMaterial({ color: 0x3a2a22, roughness: 0.8 }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.92;
    floor.receiveShadow = true;
    this.scene.add(floor);
    const ring = new THREE.Mesh(new THREE.RingGeometry(2.3, 2.42, 64), new THREE.MeshBasicMaterial({ color: 0xff8a2a }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = -0.915;
    this.scene.add(ring);
    this.scene.add(new THREE.HemisphereLight(0xfff0e0, 0x302018, 1.4));
    const key = new THREE.DirectionalLight(0xffffff, 2.4);
    key.position.set(3, 5, 4);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    this.scene.add(key);
    const rim = new THREE.DirectionalLight(0xffa060, 1.2);
    rim.position.set(-4, 2, -3);
    this.scene.add(rim);
    this.camera.position.set(0, 0.6, 5.2);
    this.camera.lookAt(0, -0.1, 0);
    // a resting bike pose for the model: physics bike sitting at static sag
    this.physics.x = 0;
    this.physics.y = 0;
    for (const w of [this.physics.rear, this.physics.front]) w.s = w.travel * 0.78;
  }

  open(): void {
    const view = $('garage-view');
    if (!this.renderer) {
      this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      this.renderer.outputColorSpace = THREE.SRGBColorSpace;
      this.renderer.shadowMap.enabled = true;
      view.appendChild(this.renderer.domElement);
    }
    this.index = Math.max(0, BIKES.findIndex((b) => b.id === this.profile.bike));
    this.show(this.index);
    const loop = () => {
      this.raf = requestAnimationFrame(loop);
      this.frame();
    };
    cancelAnimationFrame(this.raf);
    loop();
  }

  close(): void {
    cancelAnimationFrame(this.raf);
  }

  private frame(): void {
    if (!this.renderer) return;
    const view = $('garage-view');
    const w = view.clientWidth;
    const h = view.clientHeight;
    if (w && h && (this.renderer.domElement.width !== Math.round(w * this.renderer.getPixelRatio()) || this.renderer.domElement.height !== Math.round(h * this.renderer.getPixelRatio()))) {
      this.renderer.setSize(w, h, false);
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
    }
    if (this.drag === null) this.angle += 0.006;
    if (this.bike3d) {
      this.bike3d.group.rotation.set(0, this.angle, 0);
      this.bike3d.group.position.set(0, 0, 0);
    }
    this.renderer.render(this.scene, this.camera);
  }

  private show(i: number): void {
    this.index = (i + BIKES.length) % BIKES.length;
    const m = BIKES[this.index];
    if (this.bike3d) {
      this.scene.remove(this.bike3d.group);
      disposeObject(this.bike3d.group);
    }
    this.bike3d = new Bike3D(m);
    if (this.renderer) this.bike3d.setEnvironment(this.renderer);
    // place parts at rest: run the model update once with the resting physics bike
    this.physics.angle = 0;
    this.physics.updateWheelPositions();
    this.bike3d.update(this.physics, 1 / 60);
    // centre: update() puts the group at the chassis origin; wrap it so we can spin it
    const holder = new THREE.Group();
    this.bike3d.group.position.set(0, 0, 0);
    holder.add(this.bike3d.group);
    this.bike3d.group.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).castShadow = true;
    });
    this.scene.add(this.bike3d.group);
    this.refresh();
  }

  refresh(): void {
    const m = BIKES[this.index];
    const p = this.profile;
    $('garage-coins').textContent = p.coins.toLocaleString('fr-FR');
    $('g-name').textContent = m.name;
    $('g-tag').textContent = m.tagline + (m.price ? ` · ${m.price.toLocaleString('fr-FR')} pièces` : ' · offerte');
    $('g-desc').textContent = m.description;
    const current = BIKES.find((b) => b.id === p.bike)!;
    const cur = ratings(current);
    $('g-stats').innerHTML = ratings(m)
      .map((r, i) => `<span>${r.label}</span><div class="g-bar"><i class="${r.value > cur[i].value ? 'up' : ''}" style="width:${r.value * 10}%"></i></div>`)
      .join('');
    const btn = $('g-action');
    const owned = p.owned.includes(m.id);
    btn.classList.remove('locked', 'owned');
    if (p.bike === m.id) {
      btn.textContent = 'ÉQUIPÉE ✓';
      btn.classList.add('owned');
    } else if (owned) btn.textContent = 'CHOISIR';
    else if (p.coins >= m.price) btn.textContent = `ACHETER · ${m.price.toLocaleString('fr-FR')}`;
    else {
      btn.textContent = `Il manque ${(m.price - p.coins).toLocaleString('fr-FR')}`;
      btn.classList.add('locked');
    }
    $('garage-dots').innerHTML = BIKES.map((b, i) => `<i class="${i === this.index ? 'on' : ''} ${p.owned.includes(b.id) ? 'own' : ''}"></i>`).join('');
  }

  private action(): void {
    const m: BikeModel = BIKES[this.index];
    const p = this.profile;
    if (p.bike === m.id) return;
    if (!p.owned.includes(m.id)) {
      if (p.coins < m.price) {
        navigator.vibrate?.(30);
        return;
      }
      p.coins -= m.price;
      p.owned.push(m.id);
      navigator.vibrate?.([20, 40, 60]);
    }
    p.bike = m.id;
    this.save();
    this.refresh();
    this.onChange();
  }
}
