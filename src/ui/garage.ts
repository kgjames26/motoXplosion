import * as THREE from 'three';
import { BIKES, BikeModel, BikeSpec } from '../bikes';
import { rockCapacity } from '../climb';
import { Bike3D, disposeObject } from '../gl/bike3d';
import { OUTFITS, outfitById } from '../outfits';
import { Bike } from '../physics/bike';
import type { Profile } from '../profile';
import { BAR_RANGE, MAX_LEVEL, PARTS, partPrice, specNumbers, upgradedSpec } from '../upgrades';
import { TYRES, WEATHER_ICONS } from '../weather';

const $ = (id: string) => document.getElementById(id)!;
type Tab = 'bikes' | 'parts' | 'tyres' | 'outfits';

/**
 * Garage (the shop), four shelves:
 *  - MOTOS: the 7 bikes in a rotating 3D showroom, real numbers (with their upgrades) compared
 *    with the bike you ride, buy / choose.
 *  - PIÈCES: technical upgrades per bike (3 levels each), every stat in numbers with the
 *    gain of the next level shown in green and a marker for the next bike in the garage.
 *  - PNEUS: one set per weather (sec, pluie, neige), mounted automatically.
 *  - TENUES: rider outfits, shown on your bike.
 */
export class Garage {
  private renderer: THREE.WebGLRenderer | null = null;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
  private bike3d: Bike3D | null = null;
  private physics = new Bike();
  private index = 0;
  private oIndex = 0;
  private tab: Tab = 'bikes';
  private preview: string | null = null;
  private raf = 0;
  private angle = 0.6;
  private drag: number | null = null;
  onChange: () => void = () => {};

  constructor(
    private profile: Profile,
    private save: () => void,
  ) {
    $('garage-prev').addEventListener('click', () => (this.tab === 'outfits' ? this.showOutfit(this.oIndex - 1) : this.show(this.index - 1)));
    $('garage-next').addEventListener('click', () => (this.tab === 'outfits' ? this.showOutfit(this.oIndex + 1) : this.show(this.index + 1)));
    for (const b of document.querySelectorAll<HTMLElement>('#garage-tabs .g-tab')) b.addEventListener('click', () => this.setTab(b.dataset.tab as Tab));
    $('g-swatches').addEventListener('click', (e) => {
      const el = (e.target as HTMLElement).closest<HTMLElement>('[data-o]');
      if (el) this.showOutfit(Number(el.dataset.o));
    });
    $('g-parts').addEventListener('click', (e) => {
      const buy = (e.target as HTMLElement).closest<HTMLElement>('[data-buy]');
      const row = (e.target as HTMLElement).closest<HTMLElement>('[data-part]');
      if (buy) this.buyPart(buy.dataset.buy!);
      else if (row) {
        this.preview = row.dataset.part!;
        this.refresh();
      }
    });
    $('g-tyres').addEventListener('click', (e) => {
      const el = (e.target as HTMLElement).closest<HTMLElement>('[data-tyre]');
      if (el) this.buyTyre(el.dataset.tyre!);
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
    if (!this.renderer || this.tab === 'parts') return;
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

  private setTab(t: Tab): void {
    this.tab = t;
    this.preview = null;
    for (const b of document.querySelectorAll<HTMLElement>('#garage-tabs .g-tab')) b.classList.toggle('selected', b.dataset.tab === t);
    $('screen-garage').dataset.tab = t;
    if (t === 'outfits') this.showOutfit(this.oIndex);
    else if (t === 'tyres') {
      this.index = Math.max(0, BIKES.findIndex((b) => b.id === this.profile.bike));
      this.show(this.index);
    } else this.show(this.index);
  }

  private showOutfit(i: number): void {
    this.oIndex = (i + OUTFITS.length) % OUTFITS.length;
    this.build(BIKES.find((b) => b.id === this.profile.bike)!, OUTFITS[this.oIndex].id);
  }

  private show(i: number): void {
    this.index = (i + BIKES.length) % BIKES.length;
    this.preview = null;
    this.build(BIKES[this.index], this.profile.outfit);
  }

  private build(m: BikeModel, outfit: string): void {
    if (this.bike3d) {
      this.scene.remove(this.bike3d.group);
      disposeObject(this.bike3d.group);
    }
    this.bike3d = new Bike3D(m, undefined, outfitById(outfit));
    if (this.renderer) this.bike3d.setEnvironment(this.renderer);
    this.physics.angle = 0;
    this.physics.updateWheelPositions();
    this.bike3d.update(this.physics, 1 / 60);
    this.bike3d.group.position.set(0, 0, 0);
    this.bike3d.group.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).castShadow = true;
    });
    this.scene.add(this.bike3d.group);
    this.refresh();
  }

  private levels(id: string): Record<string, number> {
    return (this.profile.upgrades[id] ??= {});
  }
  private specOf(m: BikeModel, extra?: string): BikeSpec {
    const lv = { ...this.levels(m.id) };
    if (extra) lv[extra] = Math.min(MAX_LEVEL, (lv[extra] ?? 0) + 1);
    return upgradedSpec(m, lv);
  }

  /** Stat rows: bar for `spec`, green gain up to `preview`, tick at `marker` (next bike). */
  private statsHtml(spec: BikeSpec, preview: BikeSpec | null, marker: BikeSpec | null, markerName: string): string {
    const a = specNumbers(spec);
    const b = preview ? specNumbers(preview) : null;
    const c = marker ? specNumbers(marker) : null;
    const pos = (label: string, v: number) => {
      const [lo, hi] = BAR_RANGE[label];
      return Math.max(0.02, Math.min(1, (v - lo) / (hi - lo))) * 100;
    };
    const rows = a.map((r, i) => {
      const p = pos(r.label, r.value);
      const q = b ? pos(r.label, b[i].value) : p;
      const better = b && (r.higherIsBetter ? b[i].value > r.value + 1e-6 : b[i].value < r.value - 1e-6);
      const delta = better ? ` <em>→ ${Math.round(b![i].value)}</em>` : '';
      const tick = c ? `<u style="left:${pos(r.label, c[i].value)}%" title="${markerName}"></u>` : '';
      return `<span>${r.label}</span><div class="g-bar"><i style="width:${p}%"></i>${better ? `<i class="gain" style="left:${p}%;width:${Math.max(0, q - p)}%"></i>` : ''}${tick}</div><b>${Math.round(r.value)}<small> ${r.unit}</small>${delta}</b>`;
    });
    rows.push(`<span>Rochers</span><div class="g-bar"><i id="g-rock-bar" style="width:2%"></i>${c ? '<u id="g-rock-mark"></u>' : ''}</div><b id="g-rock">…</b>`);
    return rows.join('');
  }

  /** Climbing capacity is measured with the physics: done just after the panel shows. */
  private fillRocks(spec: BikeSpec, marker: BikeSpec | null, preview: BikeSpec | null): void {
    const token = Symbol();
    this.rockToken = token;
    setTimeout(() => {
      if (this.rockToken !== token) return;
      const [lo, hi] = BAR_RANGE.Rochers;
      const pc = (h: number) => Math.max(0.02, Math.min(1, (h - lo) / (hi - lo))) * 100;
      const h = rockCapacity(spec, 0);
      const el = document.getElementById('g-rock');
      if (!el) return;
      let txt = `${h.toFixed(2).replace('.', ',')}<small> m</small>`;
      if (preview) {
        const h2 = rockCapacity(preview, 0);
        if (h2 > h + 0.01) txt += ` <em>→ ${h2.toFixed(2).replace('.', ',')}</em>`;
      }
      el.innerHTML = txt;
      (document.getElementById('g-rock-bar') as HTMLElement).style.width = pc(h) + '%';
      const mk = document.getElementById('g-rock-mark');
      if (mk && marker) mk.style.left = pc(rockCapacity(marker, 0)) + '%';
    }, 30);
  }
  private rockToken: symbol | null = null;
  private justBought: string | null = null;

  refresh(): void {
    const p = this.profile;
    $('garage-coins').textContent = p.coins.toLocaleString('fr-FR');
    if (this.tab === 'outfits') return this.refreshOutfit();
    if (this.tab === 'tyres') return this.refreshTyres();
    const m = BIKES[this.index];
    const owned = p.owned.includes(m.id);
    const lv = this.levels(m.id);
    const nUp = PARTS.reduce((a, x) => a + (lv[x.id] ?? 0), 0);
    $('g-name').textContent = m.name;
    const next = BIKES[this.index + 1];
    if (this.tab === 'parts') {
      $('g-tag').textContent = owned ? `Améliorations ${nUp}/${PARTS.length * MAX_LEVEL}` : 'Achète cette moto pour l’améliorer';
      $('g-desc').innerHTML = next ? `Repère <u class="mk"></u> : ${next.name} d’origine` : 'La meilleure moto du garage';
      const spec = this.specOf(m);
      const prev = this.preview ? this.specOf(m, this.preview) : null;
      $('g-stats').innerHTML = this.statsHtml(spec, prev, next ? next.spec : null, next?.name ?? '');
      this.fillRocks(spec, next ? next.spec : null, prev);
      $('g-parts').innerHTML = PARTS.map((x) => {
        const l = lv[x.id] ?? 0;
        const pips = [1, 2, 3].map((k) => `<i class="${k <= l ? 'on' : ''}">★</i>`).join('');
        const price = l < MAX_LEVEL ? partPrice(m, l + 1) : 0;
        const btn = !owned
          ? '<button class="p-buy" disabled>—</button>'
          : l >= MAX_LEVEL
            ? '<button class="p-buy max" disabled>MAX</button>'
            : `<button class="p-buy${p.coins < price ? ' poor' : ''}" data-buy="${x.id}"><i class="coin-ico"></i>${price.toLocaleString('fr-FR')}</button>`;
        return `<div class="p-row${this.preview === x.id ? ' sel' : ''}${this.justBought === x.id ? ' bought' : ''}" data-part="${x.id}" style="--pc:${x.color}"><i class="p-bub">${x.icon}</i><div class="p-txt"><b>${x.name}</b><em>${x.chip}</em></div><span class="p-pips">${pips}</span>${btn}</div>`;
      }).join('');
      $('g-action').classList.add('hidden');
    } else {
      $('g-action').classList.remove('hidden');
      $('g-tag').textContent = m.tagline + (m.price ? ` · ${m.price.toLocaleString('fr-FR')} pièces` : ' · offerte') + (nUp ? ` · ${nUp} amélioration${nUp > 1 ? 's' : ''}` : '');
      $('g-desc').textContent = m.description;
      const current = BIKES.find((b) => b.id === p.bike)!;
      const spec = this.specOf(m);
      const curSpec = this.specOf(current);
      // bars of this bike; tick = the bike you ride (with its upgrades)
      $('g-stats').innerHTML = this.statsHtml(spec, null, current.id !== m.id ? curSpec : null, current.name);
      $('g-desc').innerHTML = m.description + (current.id !== m.id ? ` <span class="mk-l">Repère <u class="mk"></u> : ta ${current.name}</span>` : '');
      this.fillRocks(spec, current.id !== m.id ? curSpec : null, null);
      $('g-parts').innerHTML = '';
      const btn = $('g-action');
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
    }
    $('garage-dots').innerHTML = BIKES.map((b, i) => `<i class="${i === this.index ? 'on' : ''} ${p.owned.includes(b.id) ? 'own' : ''}"></i>`).join('');
  }

  private refreshTyres(): void {
    const p = this.profile;
    $('g-name').textContent = 'Pneus';
    $('g-tag').textContent = 'Pour toutes tes motos';
    $('g-desc').textContent = 'Chaque train de pneus est monté tout seul quand sa météo arrive.';
    $('g-tyres').innerHTML = TYRES.map((t, i) => {
      const own = p.tyres.includes(t.id);
      return `<div class="t-card${own ? ' own' : ''}">${WEATHER_ICONS[i]}<div class="p-txt"><b>${t.name}</b><small>${t.desc}</small></div>${
        own ? '<button class="p-buy max" disabled>✓</button>' : `<button class="p-buy${p.coins < t.price ? ' poor' : ''}" data-tyre="${t.id}"><i class="coin-ico"></i>${t.price.toLocaleString('fr-FR')}</button>`
      }</div>`;
    }).join('');
    $('g-action').classList.add('hidden');
    $('garage-dots').innerHTML = '';
  }

  private refreshOutfit(): void {
    const p = this.profile;
    const o = OUTFITS[this.oIndex];
    $('g-action').classList.remove('hidden');
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

  private pay(price: number): boolean {
    if (this.profile.coins < price) {
      navigator.vibrate?.(30);
      return false;
    }
    this.profile.coins -= price;
    navigator.vibrate?.([20, 40, 60]);
    return true;
  }

  private buyPart(id: string): void {
    const m = BIKES[this.index];
    if (!this.profile.owned.includes(m.id)) return;
    const lv = this.levels(m.id);
    const l = lv[id] ?? 0;
    if (l >= MAX_LEVEL || !this.pay(partPrice(m, l + 1))) return;
    lv[id] = l + 1;
    this.preview = l + 1 < MAX_LEVEL ? id : null;
    this.justBought = id;
    setTimeout(() => (this.justBought = null), 900);
    this.save();
    this.refresh();
    this.onChange();
  }

  private buyTyre(id: string): void {
    const t = TYRES.find((x) => x.id === id)!;
    if (this.profile.tyres.includes(id) || !this.pay(t.price)) return;
    this.profile.tyres.push(id);
    this.save();
    this.refresh();
    this.onChange();
  }

  private action(): void {
    const p = this.profile;
    if (this.tab === 'outfits') {
      const o = OUTFITS[this.oIndex];
      if (p.outfit === o.id) return;
      if (!p.outfits.includes(o.id)) {
        if (!this.pay(o.price)) return;
        p.outfits.push(o.id);
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
      if (!this.pay(m.price)) return;
      p.owned.push(m.id);
    }
    p.bike = m.id;
    this.save();
    this.refresh();
    this.onChange();
  }
}
