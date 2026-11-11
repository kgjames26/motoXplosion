import * as THREE from 'three';
import { BIKES, BikeModel, ratings } from '../bikes';
import { Bike3D, disposeObject } from '../gl/bike3d';
import { Bike } from '../physics/bike';
import { OUTFITS, outfitById } from '../outfits';
import type { Profile } from '../profile';

const $ = (id: string) => document.getElementById(id)!;

/**
 * Garage: two shelves.
 *  - MOTOS: browse the 7 bikes in a rotating 3D showroom, compare specs (bars turn green when
 *    better than the bike you ride), buy with coins, choose the bike to ride.
 *  - TENUES: dress the rider (10 colour outfits + the bike's colours), shown on your bike.
 */
export class Garage {
  private renderer: THREE.WebGLRenderer | null = null;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
  private bike3d: Bike3D | null = null;
  private physics = new Bike();
  private index = 0;
  private oIndex = 0;
  private tab: 'bikes' | 'outfits' = 'bikes';
  private raf = 0;
  private angle = 0.6;
  private drag: number | null = null;
  onChange: () => void = () => {};

  constructor(
    private profile: Profile,
    private save: () => void,
  ) {
    $('garage-prev').addEventListener('click', () => (this.tab === 'bikes' ? this.show(this.index - 1) : this.showOutfit(this.oIndex - 1)));
    $('garage-next').addEventListener('click', () => (this.tab === 'bikes' ? this.show(this.index + 1) : this.showOutfit(this.oIndex + 1)));
    for (const b of document.querySelectorAll<HTMLElement>('#garage-tabs .g-tab'))
      b.addEventListener('click', () => this.setTab(b.dataset.tab as 'bikes' | 'outfits'));
    $('g-swatches').addEventListener('click', (e) => {
      const el = (e.target as HTMLElement).closest<HTMLElement>('[data-o]');
      if (el) this.showOutfit(Number(el.dataset.o));
    });
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
    this.oIndex = Math.max(0, OUTFITS.findIndex((o) => o.id === this.profile.outfit));
    this.setTab(this.tab);
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

  private setTab(t: 'bikes' | 'outfits'): void {
    this.tab = t;
    for (const b of document.querySelectorAll<HTMLElement>('#garage-tabs .g-tab')) b.classList.toggle('selected', b.dataset.tab === t);
    $('screen-garage').dataset.tab = t;
    if (t === 'bikes') this.show(this.index);
    else this.showOutfit(this.oIndex);
  }

  private showOutfit(i: number): void {
    this.oIndex = (i + OUTFITS.length) % OUTFITS.length;
    this.build(BIKES.find((b) => b.id === this.profile.bike)!, OUTFITS[this.oIndex].id);
  }

  private show(i: number): void {
    this.index = (i + BIKES.length) % BIKES.length;
    this.build(BIKES[this.index], this.profile.outfit);
  }

  private build(m: BikeModel, outfit: string): void {
    if (this.bike3d) {
      this.scene.remove(this.bike3d.group);
      disposeObject(this.bike3d.group);
    }
    this.bike3d = new Bike3D(m, undefined, outfitById(outfit));
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
    const p = this.profile;
    $('garage-coins').textContent = p.coins.toLocaleString('fr-FR');
    if (this.tab === 'outfits') {
      this.refreshOutfit();
      return;
    }
    const m = BIKES[this.index];
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

  private refreshOutfit(): void {
    const p = this.profile;
    const o = OUTFITS[this.oIndex];
    $('g-name').textContent = o.name;
    $('g-tag').textContent = o.price ? `Tenue · ${o.price.toLocaleString('fr-FR')} pièces` : 'Tenue · offerte';
    $('g-desc').textContent = o.colors ? 'Maillot, pantalon, gants et casque assortis.' : 'Le pilote porte les couleurs de la moto choisie.';
    $('g-swatches').innerHTML = OUTFITS.map((x, i) => {
      const c = x.colors ?? { jersey: '#6a4127', accent: '#35553a', helmet: '#3d5d3f' };
      const st = `background:linear-gradient(135deg, ${c.helmet} 0 34%, ${c.jersey} 34% 72%, ${c.accent} 72%)`;
      return `<button class="g-sw ${i === this.oIndex ? 'on' : ''} ${p.outfits.includes(x.id) ? 'own' : ''} ${p.outfit === x.id ? 'worn' : ''}" data-o="${i}" style="${st}" aria-label="${x.name}"></button>`;
    }).join('');
    const btn = $('g-action');
    btn.classList.remove('locked', 'owned');
    if (p.outfit === o.id) {
      btn.textContent = 'PORTÉE ✓';
      btn.classList.add('owned');
    } else if (p.outfits.includes(o.id)) btn.textContent = 'PORTER';
    else if (p.coins >= o.price) btn.textContent = `ACHETER · ${o.price.toLocaleString('fr-FR')}`;
    else {
      btn.textContent = `Il manque ${(o.price - p.coins).toLocaleString('fr-FR')}`;
      btn.classList.add('locked');
    }
    $('garage-dots').innerHTML = OUTFITS.map((x, i) => `<i class="${i === this.oIndex ? 'on' : ''} ${p.outfits.includes(x.id) ? 'own' : ''}"></i>`).join('');
  }

  private action(): void {
    const p = this.profile;
    if (this.tab === 'outfits') {
      const o = OUTFITS[this.oIndex];
      if (p.outfit === o.id) return;
      if (!p.outfits.includes(o.id)) {
        if (p.coins < o.price) {
          navigator.vibrate?.(30);
          return;
        }
        p.coins -= o.price;
        p.outfits.push(o.id);
        navigator.vibrate?.([20, 40, 60]);
      }
      p.outfit = o.id;
      this.save();
      this.refresh();
      this.onChange();
      return;
    }
    const m: BikeModel = BIKES[this.index];
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
