import './style.css';
import { Audio } from './audio/audio';
import { loadAssets } from './assets';
import { Game } from './game';
import { GLRenderer } from './gl/glRenderer';
import { loadSettings, saveSettings, Layout, Quality } from './settings';
import { Controls } from './ui/controls';
import { Hud } from './ui/hud';
import { Garage } from './ui/garage';
import { MultiUI } from './ui/multiplayer';
import { REGION_ORDER, REGIONS, RegionId } from './world/regions';
import { bikeById, BIKES, MULTI_BIKE, rockClimb } from './bikes';
import { Difficulty, DIFFICULTIES, MODES, ModeId } from './modes';
import { bestKey, loadProfile, saveProfile } from './profile';
import { outfitById, OUTFITS } from './outfits';
import { MAX_LEVEL, PARTS, upgradedSpec } from './upgrades';
import { rockCapacity } from './climb';
import { DIFF_ORDER, diffIndex, tyreBonus, Weather, WEATHER_ICONS, WEATHER_NAMES } from './weather';
import {
  CIRCUITS,
  CircuitMode,
  circuitKey,
  circuitLength,
  CircuitRecord,
  circuitRaceLevel,
  trialRockRange,
  fmtTime,
  isCircuitMode,
  MEDAL_BONUS,
  MEDAL_COLORS,
  MEDAL_NAMES,
  parTimes,
  trialZones,
} from './circuits';

/**
 * Entry point: wires the game loop, renderer, HUD, controls, screens, settings, audio and PWA.
 */
const $ = (id: string) => document.getElementById(id)!;

const settings = loadSettings();
if ((settings.layout as string) === 'centre') settings.layout = 'gauche';
const profile = loadProfile();
// v2.21: the game always opens on cruising, first world
profile.mode = 'cruising';
settings.region = 'alpes';
const saveP = () => saveProfile(profile);
const renderer = new GLRenderer($('app'), settings.quality);
/** Circuit currently picked for the selected mode and world. */
const circuitOf = (mode: ModeId = profile.mode) => profile.circuitSel[`${mode}:${settings.region}`] ?? 1;
/** The motocross track is its own world with its own three events. */
const onCross = () => settings.region === 'cross' && profile.mode !== 'cruising';
const MX_EVENTS: { id: 'time' | 'tricks' | 'race'; name: string; icon: string; desc: string }[] = [
  { id: 'time', name: 'Time attack', icon: '<svg viewBox="0 0 48 36" aria-hidden="true"><circle cx="24" cy="20" r="12"/><path d="M24 20v-7M24 20l5 3M20 4h8M24 4v4"/></svg>', desc: 'Un seul tour, départ arrêté : bats ton propre chrono. Or, argent ou bronze selon le temps.' },
  { id: 'tricks', name: 'Figures', icon: '<svg viewBox="0 0 48 36" aria-hidden="true"><path d="M8 26a16 12 0 1 1 30 2"/><path d="M38 28l-7-1M38 28l1-7"/><circle cx="24" cy="18" r="3"/></svg>', desc: 'Un demi-tour pour poser le plus de saltos. Doubles et triples comptent double et triple. Un salto raté en enlève deux.' },
  { id: 'race', name: 'Course', icon: '<svg viewBox="0 0 48 36" aria-hidden="true"><path d="M10 32V4M10 6h26l-5 7 5 7H10"/><path d="M18 6v14M26 6v14M10 13h24"/></svg>', desc: 'Deux tours contre 7 pilotes qui freinent, se penchent et prennent la corde. Monte sur le podium.' },
];
const runOpts = () => ({ mx: onCross() ? profile.mxKind : null, region: profile.mode === 'cruising' ? ('alpes' as RegionId) : settings.region, mode: onCross() ? (profile.mxKind === 'race' ? ('course' as ModeId) : ('enduro' as ModeId)) : profile.mode, model: bikeById(profile.bike), spec: upgradedSpec(bikeById(profile.bike), profile.upgrades[profile.bike]), tyres: profile.tyres, difficulty: onCross() ? ('facile' as Difficulty) : profile.difficulty, circuit: onCross() ? (profile.mxKind === 'tricks' ? 2 : 1) : circuitOf(), cruiseControl: profile.gear.includes('cruise') });
const outfit = () => outfitById(profile.outfit);
const game = new Game({ ...runOpts(), mode: 'cruising', difficulty: 'facile', calm: true });
renderer.setPlayerModel(game.model, outfit());
const garage = new Garage(profile, saveP);
const controls = new Controls();
const hud = new Hud();
const audio = new Audio();
audio.setVolumes(settings.music, settings.sfx);

type ScreenName = 'title' | 'pause' | 'over' | 'settings' | 'garage' | 'circuits' | 'multi' | 'champ' | 'mpwait' | 'stats' | 'sleep' | 'none';
const screens: Record<Exclude<ScreenName, 'none'>, HTMLElement> = {
  title: $('screen-title'),
  circuits: $('screen-circuits'),
  multi: $('screen-multi'),
  champ: $('screen-champ'),
  mpwait: $('screen-mpwait'),
  pause: $('screen-pause'),
  over: $('screen-over'),
  settings: $('screen-settings'),
  garage: $('screen-garage'),
  stats: $('screen-stats'),
  sleep: $('screen-sleep'),
};
let garageReturn: ScreenName = 'title';
const hudEl = $('hud');
const controlsEl = $('controls');
let settingsReturn: ScreenName = 'title';

function show(which: ScreenName): void {
  for (const [k, el] of Object.entries(screens)) el.classList.toggle('hidden', k !== which);
  const inRun = which === 'none' || which === 'pause' || (which === 'settings' && settingsReturn === 'pause');
  hudEl.classList.toggle('hidden', !inRun);
  controlsEl.classList.toggle('hidden', which !== 'none');
  // music: menu track on menus, game track while riding (quieter when paused)
  if (which === 'none') audio.music('game', 1);
  else if (which === 'pause' || (which === 'settings' && settingsReturn === 'pause')) audio.music('game', 0.45);
  else audio.music('menu', 1);
  // pause: every sound stops; any other screen: sound on
  if (which === 'pause' || (which === 'settings' && settingsReturn === 'pause')) audio.pauseAll();
  else audio.resumeAll();
  if (which === 'garage') garage.open();
  else garage.close();
}

const MODE_ICONS: Record<ModeId, string> = {
  cruising: '<svg viewBox="0 0 48 36" aria-hidden="true"><path d="M2 32 L15 14 L22 22 L32 8 L46 32Z"/><circle cx="39" cy="8" r="4"/><path d="M16 32 L24 24 L30 32" /></svg>',
  trial: '<svg viewBox="0 0 48 36" aria-hidden="true"><path d="M3 33h11V21h18v12h13"/><circle cx="13" cy="15" r="4.5"/><circle cx="30" cy="9" r="4.5"/><path d="M13 15 L21 8 L30 9"/></svg>',
  enduro: '<svg viewBox="0 0 48 36" aria-hidden="true"><path d="M2 34 C12 12 19 9 24 9 C30 9 37 14 46 34Z"/><path d="M24 9V2 l8 2.6 -8 2.6"/><path d="M10 29 l3 -3 M36 27 l3 3"/></svg>',
  course: '<svg viewBox="0 0 48 36" aria-hidden="true"><path d="M9 35V3"/><path d="M9 4h30v17H9z"/><path d="M9 4h7.5v4.25H9zm15 0h7.5v4.25H24zM16.5 8.25H24v4.25h-7.5zm15 0H39v4.25h-7.5zM9 12.5h7.5v4.25H9zm15 0h7.5v4.25H24zM16.5 16.75H24V21h-7.5zm15 0H39V21h-7.5z" fill="currentColor" stroke="none"/></svg>',
};
const WORLD_ICONS: Record<RegionId, string> = {
  alpes: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 20l7-12 4 6 3-4 6 10z"/><path d="M7.5 10.5L9 8l1.6 2.6"/></svg>',
  foret: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 3l5 8H3zM8 9l6 9H2zM8 18v3M17 7l4 7h-8zM17 14v6"/></svg>',
  canyon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 20V9h6v4h3V6h6v8h5v6z"/></svg>',
  desert: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="17" cy="6" r="2.5"/><path d="M2 19c4-5 8-5 12-1 3-3 5-3 8-1"/><path d="M7 19v-7M5 14v-2h2M9 15v-2H7"/></svg>',
  sf: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 18h20M5 18V8M17 18V8M5 9c3 4 9 4 12 0M2 14l3-5M22 14l-3-5"/></svg>',
  cross: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 19c2 0 3-6 5-6s3 6 5 6 3-9 5-9 3 9 5 9"/><path d="M12 3v5M12 3l4 1.5L12 6"/></svg>',
};

const MODE_SHORT: Record<ModeId, string> = {
  cruising: 'Balade',
  trial: 'Obstacles',
  enduro: 'Collines',
  course: '8 pilotes',
};

const rec = (mode: CircuitMode, n: number, d: Difficulty): CircuitRecord | undefined => profile.circuits[circuitKey(mode, settings.region, n, d)];
const doneAny = (mode: CircuitMode, n: number) => DIFF_ORDER.some((d) => rec(mode, n, d)?.done);
const unlocked = (mode: CircuitMode, n: number) => n === 1 || doneAny(mode, n - 1);
/** Each difficulty (= weather) of a circuit opens once the previous one is finished. */
const diffUnlocked = (mode: CircuitMode, n: number, d: Difficulty) => {
  const i = diffIndex(d);
  return i === 0 || !!rec(mode, n, DIFF_ORDER[i - 1])?.done;
};
const cruiseLevel = () => profile.cruiseUnlock[settings.region] ?? 0;
/** Medal counts for a mode in the current world (every difficulty) and circuits done. */
function medalCounts(mode: CircuitMode): { done: number; gold: number; silver: number; bronze: number } {
  const c = { done: 0, gold: 0, silver: 0, bronze: 0 };
  for (let n = 1; n <= CIRCUITS; n++) {
    if (doneAny(mode, n)) c.done++;
    for (const d of DIFF_ORDER) {
      const r = rec(mode, n, d);
      if (r?.medal === 3) c.gold++;
      else if (r?.medal === 2) c.silver++;
      else if (r?.medal === 1) c.bronze++;
    }
  }
  return c;
}
/** Difficulty buttons with their weather icon (locked ones greyed). */
function diffButtons(isOpen: (d: Difficulty) => boolean): string {
  return DIFF_ORDER.map((d, i) => `<button class="diff wx${i}${profile.difficulty === d ? ' selected' : ''}" data-diff="${d}"${isOpen(d) ? '' : ' disabled'}>${WEATHER_ICONS[i]}<span>${DIFFICULTIES[i].name}</span><small>${WEATHER_NAMES[i]}</small></button>`).join('');
}
const medalIco = (m: number) => `<i class="medal-ico" style="--m:${MEDAL_COLORS[m] || '#666'}"></i>`;

function updateBest(): void {
  const mode = profile.mode;
  if (onCross()) {
    const k = profile.mxKind;
    const r = profile.circuits[circuitKey(k === 'race' ? 'course' : 'enduro', 'cross', k === 'tricks' ? 2 : 1, 'facile')];
    const txt = k === 'time' ? (r?.time !== undefined ? fmtTime(r.time) : '—') : k === 'tricks' ? (profile.best.mxtricks ? `${profile.best.mxtricks} saltos` : '—') : r?.place ? `${r.place}${r.place === 1 ? 're' : 'e'} place` : '—';
    $('best-title').innerHTML = `${r?.medal ? medalIco(r.medal) + ' ' : ''}${txt}`;
    $('best-title').parentElement!.firstChild!.textContent = 'RECORD ';
  } else if (isCircuitMode(mode)) {
    const c = medalCounts(mode);
    $('best-title').innerHTML = `${c.done}/${CIRCUITS} · ${medalIco(3)} ${c.gold}`;
    $('best-title').parentElement!.firstChild!.textContent = 'CIRCUITS ';
  } else {
    const v = Math.max(0, ...REGION_ORDER.map((r) => profile.best[bestKey(mode, r)] ?? 0));
    $('best-title').textContent = v ? `${v.toLocaleString('fr-FR')} m` : '—';
    $('best-title').parentElement!.firstChild!.textContent = 'RECORD ';
  }
  const cd = $('cruise-diffs');
  // cruising: no weather to choose any more (it changes by itself during the ride)
  cd.classList.add('hidden');
  if (false as boolean) {
    if (diffIndex(profile.difficulty) > cruiseLevel()) profile.difficulty = DIFF_ORDER[cruiseLevel()];
    cd.innerHTML = diffButtons((d) => diffIndex(d) <= cruiseLevel());
  }
  $('title-coins').textContent = profile.coins.toLocaleString('fr-FR');
  $('title-pseudo').textContent = settings.pseudo.trim();
  for (const el of $('modes').querySelectorAll<HTMLElement>('.mode-card')) {
    const m = el.dataset.mode as ModeId;
    const box = el.querySelector('.medals')!;
    if (isCircuitMode(m)) {
      const c = medalCounts(m);
      box.innerHTML = `${medalIco(c.gold ? 3 : c.silver ? 2 : c.done ? 1 : 0)}${c.done}/${CIRCUITS}`;
    }
  }
}

function refreshTitle(): void {
  const cross = onCross();
  // the motocross track has its own events instead of the usual modes
  for (const el of $('modes').querySelectorAll<HTMLElement>('.mode-card')) {
    const isMx = !!el.dataset.mx;
    el.classList.toggle('hidden', isMx !== cross);
    el.classList.toggle('selected', isMx ? el.dataset.mx === profile.mxKind : el.dataset.mode === profile.mode);
  }
  const m = MODES.find((x) => x.id === profile.mode)!;
  // cruising crosses every world: no world is picked (a tap on one goes to its circuits)
  for (const el of $('regions').querySelectorAll<HTMLElement>('.world-card')) el.classList.toggle('selected', profile.mode !== 'cruising' && el.dataset.region === settings.region);
  $('world-all').classList.toggle('hidden', m.id !== 'cruising');
  $('mode-desc').textContent = cross ? MX_EVENTS.find((e) => e.id === profile.mxKind)!.desc : m.description;
  updateBest();
}

function buildModes(): void {
  $('modes').innerHTML =
    MODES.map((m) => `<button class="mode-card" data-mode="${m.id}">${MODE_ICONS[m.id]}<b>${m.name}</b><small>${MODE_SHORT[m.id]}</small><span class="medals"></span></button>`).join('') +
    MX_EVENTS.map((e) => `<button class="mode-card mx hidden" data-mx="${e.id}">${e.icon}<b>${e.name}</b><span class="medals"></span></button>`).join('') +
    `<button class="mode-card multi" id="mode-multi"><svg viewBox="0 0 48 36" aria-hidden="true"><circle cx="15" cy="11" r="5"/><circle cx="33" cy="11" r="5"/><path d="M5 31c1-7 5-11 10-11s9 4 10 11M23 31c1-7 5-11 10-11s9 4 10 11"/></svg><b>Multijoueur</b><small>2 à 4 pilotes</small></button>`;
  $('mode-multi').addEventListener('click', () => {
    closePickers();
    mp.open();
  });
  for (const el of $('modes').querySelectorAll<HTMLElement>('.mode-card[data-mx]'))
    el.addEventListener('click', () => {
      profile.mxKind = el.dataset.mx as 'time' | 'tricks' | 'race';
      saveP();
      refreshTitle();
    });
  for (const el of $('modes').querySelectorAll('.mode-card[data-mode]'))
    el.addEventListener('click', () => {
      profile.mode = (el as HTMLElement).dataset.mode as ModeId;
      saveP();
      refreshTitle();
      closePickers();
    });
  for (const id of ['circ-diffs', 'cruise-diffs'])
    $(id).addEventListener('click', (e) => {
      const el = (e.target as HTMLElement).closest<HTMLButtonElement>('.diff');
      if (!el || el.disabled) return;
      profile.difficulty = el.dataset.diff as Difficulty;
      saveP();
      if (id === 'circ-diffs') renderCircuits();
      else updateBest();
    });
}

// ---------------------------------------------------------------- mode / world pickers

/** The home screen only shows the chosen mode and world as words; a tap opens the choice. */
function closePickers(): void {
  /* v2.25: modes and worlds are always on the home screen, nothing to close */
}

// ---------------------------------------------------------------- circuits screen

function openCircuits(): void {
  const mode = profile.mode as CircuitMode;
  // pick the selected circuit, or the first one not finished yet
  let n = circuitOf();
  if (!unlocked(mode, n)) n = 1;
  profile.circuitSel[`${mode}:${settings.region}`] = n;
  renderCircuits();
  show('circuits');
}

function renderCircuits(): void {
  const mode = profile.mode as CircuitMode;
  const sel = circuitOf();
  // keep the chosen difficulty only if it is open on this circuit
  while (!diffUnlocked(mode, sel, profile.difficulty)) profile.difficulty = DIFF_ORDER[diffIndex(profile.difficulty) - 1];
  const dsel = profile.difficulty;
  const di = diffIndex(dsel);
  $('circ-mode').textContent = MODES.find((m) => m.id === mode)!.name;
  $('circ-world').textContent = REGIONS[settings.region].name;
  const c = medalCounts(mode);
  $('circ-medals').innerHTML = `<span>${medalIco(3)} ${c.gold}</span><span>${medalIco(2)} ${c.silver}</span><span>${medalIco(1)} ${c.bronze}</span>`;
  let next = 0;
  for (let n = 1; n <= CIRCUITS && !next; n++) if (!doneAny(mode, n)) next = n;
  const tiles: string[] = [];
  for (let n = 1; n <= CIRCUITS; n++) {
    const open = unlocked(mode, n);
    const r = rec(mode, n, dsel);
    const best = Math.max(0, ...DIFF_ORDER.map((d) => rec(mode, n, d)?.medal ?? 0));
    const sub = r?.done ? (mode === 'course' ? `${r.place}${r.place === 1 ? 'er' : 'e'}` : fmtTime(r.time ?? 0)) : '';
    const pips = DIFF_ORDER.map((d, i) => `<i class="pip wx${i}${rec(mode, n, d)?.done ? ' on' : ''}"></i>`).join('');
    const cls = ['circ-tile', open ? '' : 'locked', n === sel ? 'selected' : '', n === next && open ? 'next' : ''].join(' ');
    tiles.push(`<button class="${cls}" data-n="${n}"${open ? '' : ' disabled'}>${best ? medalIco(best) : ''}<b>${n}</b>${sub ? `<small>${sub}</small>` : ''}<span class="pips">${pips}</span></button>`);
  }
  $('circ-grid').innerHTML = tiles.join('');
  // details of the selected circuit
  $('circ-num').textContent = `Circuit ${sel}`;
  const km = (circuitLength(mode, sel) / 1000).toFixed(1).replace('.', ',');
  let meta = '';
  if (mode === 'trial') {
    const hi = trialRockRange(sel, di)[1];
    const spec = upgradedSpec(bikeById(profile.bike), profile.upgrades[profile.bike]);
    const cap = rockCapacity({ ...spec, grip: spec.grip * tyreBonus(profile.tyres, di as Weather) }, di as Weather);
    const need = BIKES.find((b) => rockClimb(b.id, di) >= hi - 0.05);
    meta = `${trialZones(sel)} zones · rochers jusqu’à ${hi.toFixed(1).replace('.', ',')} m · chute = +15 s`;
    if (cap < hi - 0.05) meta += ` <b class="warn">⚠ ${bikeById(profile.bike).name} trop faible : il faut ${need ? need.name : 'une meilleure moto'}</b>`;
  } else if (mode === 'enduro') meta = `${km} km · grosses collines`;
  else meta = `${km} km · pilotes niveau ${circuitRaceLevel(sel)}`;
  $('circ-meta').innerHTML = meta;
  $('circ-diffs').classList.remove('hidden');
  $('circ-diffs').innerHTML = diffButtons((d) => diffUnlocked(mode, sel, d));
  const r = rec(mode, sel, dsel);
  const got = r?.medal ?? 0;
  if (mode === 'course') {
    $('circ-goals').innerHTML = [3, 2, 1].map((m) => `<li class="${got >= m ? 'got' : ''}">${medalIco(m)} ${m === 3 ? '1re place' : m === 2 ? '2e place' : '3e place'}</li>`).join('');
    $('circ-best').textContent = r?.place ? `Meilleure place : ${r.place}${r.place === 1 ? 're' : 'e'}` : '';
  } else {
    const p = parTimes(mode, sel, di);
    $('circ-goals').innerHTML = [
      `<li class="${got >= 3 ? 'got' : ''}">${medalIco(3)} moins de ${fmtTime(p.gold)}</li>`,
      `<li class="${got >= 2 ? 'got' : ''}">${medalIco(2)} moins de ${fmtTime(p.silver)}</li>`,
      `<li class="${got >= 1 ? 'got' : ''}">${medalIco(1)} arriver au bout</li>`,
    ].join('');
    $('circ-best').textContent = r?.time ? `Record : ${fmtTime(r.time)}` : '';
  }
  ($('btn-circ-go') as HTMLButtonElement).disabled = !unlocked(mode, sel);
}

$('circ-grid').addEventListener('click', (e) => {
  const el = (e.target as HTMLElement).closest<HTMLElement>('.circ-tile');
  if (!el || el.classList.contains('locked')) return;
  const n = Number(el.dataset.n);
  const key = `${profile.mode}:${settings.region}`;
  if (profile.circuitSel[key] === n) {
    start();
    return;
  }
  profile.circuitSel[key] = n;
  saveP();
  renderCircuits();
});

// ---------------------------------------------------------------- regions (levels)

function buildRegions(): void {
  const box = $('regions');
  box.innerHTML = '';
  for (const id of REGION_ORDER) {
    const r = REGIONS[id];
    const b = document.createElement('button');
    b.className = 'world-card' + (id === settings.region ? ' selected' : '');
    b.dataset.region = id;
    const thumb =
      id === 'sf'
        ? 'linear-gradient(180deg,#3a7ad8 0%,#ffd2a8 42%,#8a96aa 43%,#6a7488 58%,#3a6a9a 59%,#2a4a6a 100%)'
        : id === 'desert'
        ? 'linear-gradient(180deg,#5d9be6 0%,#fbe3b8 48%,#f6d39a 49%,#e8b676 70%,#cf9152 100%)'
        : id === 'canyon'
          ? 'linear-gradient(180deg,#5aa2f0 0%,#ffd9a8 45%,#d9824a 46%,#a8552f 75%,#7a3b22 100%)'
          : `url(/res/backdrop-alps-forest.webp)`;
    const photo = id === 'alpes' || id === 'foret';
    void thumb;
    void photo;
    b.innerHTML = `<i class="w-ico">${WORLD_ICONS[id]}</i><span>${r.name}</span>`;
    b.title = r.subtitle;
    b.addEventListener('click', () => {
      settings.region = id as RegionId;
      // worlds are for the circuits: leaving cruising when one is picked
      if (profile.mode === 'cruising') profile.mode = 'enduro';
      saveP();
      refreshTitle();
      saveSettings(settings);
      for (const el of box.querySelectorAll('.world-card')) el.classList.toggle('selected', (el as HTMLElement).dataset.region === id);
      updateBest();
    });
    box.appendChild(b);
  }
}

// ---------------------------------------------------------------- settings screen

function applyQuality(q: Quality): void {
  for (const b of $('set-quality').querySelectorAll('.layout-opt')) b.classList.toggle('selected', (b as HTMLElement).dataset.quality === q);
}

function applyLayout(l: Layout): void {
  controlsEl.classList.remove('layout-gauche', 'layout-centre', 'layout-inverse');
  controlsEl.classList.add('layout-' + l);
  for (const b of $('set-layouts').querySelectorAll('.layout-opt')) b.classList.toggle('selected', (b as HTMLElement).dataset.layout === l);
}

function openSettings(from: ScreenName): void {
  settingsReturn = from;
  const m = $('set-music') as HTMLInputElement;
  const s = $('set-sfx') as HTMLInputElement;
  m.value = String(Math.round(settings.music * 100));
  s.value = String(Math.round(settings.sfx * 100));
  $('set-music-v').textContent = m.value;
  $('set-sfx-v').textContent = s.value;
  ($('set-vibration') as HTMLInputElement).checked = settings.vibration;
  ($('set-pseudo') as HTMLInputElement).value = settings.pseudo;
  applyLayout(settings.layout);
  applyQuality(settings.quality);
  syncTimerUI();
  show('settings');
}

function bindSettings(): void {
  const m = $('set-music') as HTMLInputElement;
  const s = $('set-sfx') as HTMLInputElement;
  const onVol = () => {
    settings.music = Number(m.value) / 100;
    settings.sfx = Number(s.value) / 100;
    $('set-music-v').textContent = m.value;
    $('set-sfx-v').textContent = s.value;
    audio.setVolumes(settings.music, settings.sfx);
    saveSettings(settings);
  };
  m.addEventListener('input', onVol);
  s.addEventListener('input', onVol);
  for (const b of $('set-layouts').querySelectorAll('.layout-opt')) {
    b.addEventListener('click', () => {
      settings.layout = (b as HTMLElement).dataset.layout as Layout;
      applyLayout(settings.layout);
      saveSettings(settings);
    });
  }
  for (const b of $('set-quality').querySelectorAll('.layout-opt')) {
    b.addEventListener('click', () => {
      settings.quality = (b as HTMLElement).dataset.quality as Quality;
      applyQuality(settings.quality);
      renderer.setQuality(settings.quality);
      saveSettings(settings);
    });
  }
  ($('set-pseudo') as HTMLInputElement).addEventListener('input', (e) => {
    settings.pseudo = (e.target as HTMLInputElement).value.slice(0, 14);
    saveSettings(settings);
    mp.multi?.updateProfile(settings.pseudo.trim() || 'Pilote', MULTI_BIKE.id, profile.outfit);
    updateBest();
  });
  ($('set-vibration') as HTMLInputElement).addEventListener('change', (e) => {
    settings.vibration = (e.target as HTMLInputElement).checked;
    saveSettings(settings);
  });
  $('btn-settings-back').addEventListener('click', () => show(settingsReturn === 'sleep' && !asleep() ? 'title' : settingsReturn));
  $('btn-settings-title').addEventListener('click', () => {
    audio.unlock();
    openSettings('title');
  });
  $('btn-settings-pause').addEventListener('click', () => openSettings('pause'));
}

// ---------------------------------------------------------------- flow

/** Fullscreen + landscape lock where the platform allows it (Android, installed PWA). */
type FsDoc = Document & { webkitFullscreenElement?: Element; webkitExitFullscreen?: () => Promise<void> };
type FsEl = HTMLElement & { webkitRequestFullscreen?: () => Promise<void> };
const fsSupported = () => !!(document.documentElement.requestFullscreen || (document.documentElement as FsEl).webkitRequestFullscreen);
const isFullscreen = () => !!(document.fullscreenElement || (document as FsDoc).webkitFullscreenElement);

async function enterFullscreen(): Promise<void> {
  const el = document.documentElement as FsEl;
  if (isFullscreen()) return;
  try {
    if (el.requestFullscreen) await el.requestFullscreen({ navigationUI: 'hide' });
    else await el.webkitRequestFullscreen?.();
  } catch {
    /* refused (no user gesture, or not allowed) */
  }
}

async function toggleFullscreen(): Promise<void> {
  if (isFullscreen()) {
    const d = document as FsDoc;
    try {
      if (document.exitFullscreen) await document.exitFullscreen();
      else await d.webkitExitFullscreen?.();
    } catch {
      /* ignore */
    }
  } else await immersive();
}

/** Fullscreen class on <html>: out of fullscreen the buttons keep a small margin from the edges. */
function syncFullscreen(): void {
  const fs = isFullscreen();
  document.documentElement.classList.toggle('fs', fs);
  document.documentElement.classList.toggle('no-fs-api', !fsSupported());
  for (const b of document.querySelectorAll('.fs-btn, .fs-toggle')) b.classList.toggle('active', fs);
  const l = document.getElementById('fs-label');
  if (l) l.textContent = fs ? 'QUITTER' : 'ACTIVER';
  renderer.resize();
}
document.addEventListener('fullscreenchange', syncFullscreen);
document.addEventListener('webkitfullscreenchange', syncFullscreen);

async function immersive(): Promise<void> {
  try {
    await enterFullscreen();
    const o = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> };
    await o.lock?.('landscape');
  } catch {
    /* not supported: the "turn your phone" screen covers portrait */
  }
}

/** Haptic feedback (Android; iOS browsers do not expose vibration). */
let lastBuzz = 0;
function vibrate(p: number | number[], minGap = 0): void {
  if (!settings.vibration || !navigator.vibrate) return;
  const now = performance.now();
  if (now - lastBuzz < minGap) return;
  lastBuzz = now;
  navigator.vibrate(p);
}

function start(): void {
  if (asleep()) return show('sleep');
  audio.unlock();
  void immersive();
  controls.reset();
  const model = bikeById(profile.bike);
  renderer.setPlayerModel(model, outfit());
  audio.setElectric(!!model.electric);
  game.pseudo = settings.pseudo.trim();
  game.newRun(runOpts());
  renderer.render(game, 0, true);
  show('none');
}

/** JOUER: cruising starts at once, circuit modes open the circuit picker. */
// ---------------------------------------------------------------- statistics (v2.25)

function fmtDuration(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return h ? `${h} h ${String(m).padStart(2, '0')}` : `${m} min`;
}

/** "Mon parcours": time played, coins, and a clear view of what is left to do. */
function renderStats(): void {
  const card = (v: string, label: string) => `<div class="st-card panel"><b>${v}</b><span>${label}</span></div>`;
  const best = Math.max(0, ...REGION_ORDER.map((r) => profile.best[bestKey('cruising', r)] ?? 0));
  $('stats-cards').innerHTML =
    card(fmtDuration(profile.playTime), 'de jeu') +
    card(`<i class="coin-ico"></i>${profile.totalEarned.toLocaleString('fr-FR')}`, 'pièces récoltées') +
    card(`${(profile.totalDist / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} km`, 'parcourus') +
    card(best ? `${best.toLocaleString('fr-FR')} m` : '—', 'record en cruising');
  const row = (label: string, done: number, total: number, extra = '') =>
    `<div class="st-row${done >= total ? ' full' : ''}"><span>${label}</span><i><u style="width:${Math.min(100, (done / total) * 100)}%"></u></i><b>${done}/${total}</b>${extra}</div>`;
  let html = '<h3>Ce qu’il reste à accomplir</h3>';
  for (const mode of ['trial', 'enduro', 'course'] as CircuitMode[]) {
    let done = 0;
    let gold = 0;
    const per: string[] = [];
    for (const r of REGION_ORDER) {
      let d = 0;
      for (let n = 1; n <= CIRCUITS; n++) {
        const recs = DIFF_ORDER.map((df) => profile.circuits[circuitKey(mode, r, n, df)]);
        if (recs.some((x) => x?.done)) d++;
        if (recs.some((x) => x?.medal === 3)) gold++;
      }
      done += d;
      per.push(`<em class="${d >= CIRCUITS ? 'ok' : ''}">${REGIONS[r].name} ${d}/${CIRCUITS}</em>`);
    }
    const total = CIRCUITS * REGION_ORDER.length;
    html += row(MODES.find((m) => m.id === mode)!.name, done, total, `<small>${medalIco(3)} ${gold}/${total} en or</small>`) + `<div class="st-worlds">${per.join('')}</div>`;
  }
  html += row('Motos', profile.owned.length, BIKES.length);
  html += row('Tenues', profile.outfits.length, OUTFITS.length);
  const parts = Object.values(profile.upgrades).reduce((a, lv) => a + Object.values(lv).reduce((x, y) => x + y, 0), 0);
  html += row('Pièces montées', parts, BIKES.length * PARTS.length * MAX_LEVEL);
  html += row('Pneus et régulateur', profile.tyres.length + profile.gear.length, 4);
  $('stats-todo').innerHTML = html;
}
$('title-wallet').addEventListener('click', () => {
  renderStats();
  show('stats');
});
$('stats-back').addEventListener('click', () => show('title'));

// ---------------------------------------------------------------- parental timer (v2.25)

/** Time is up: the current run may be finished, then the rider sleeps. */
const asleep = () => settings.timerMin > 0 && settings.timerUsed >= settings.timerMin * 60;
let timerSave = 0;
let timerClock = performance.now();
let timerWarned = false;
function tickTimers(dt: number): void {
  if (game.state === 'playing') {
    profile.playTime += dt;
    if (game.mode !== 'cruising' || true) profile.totalDist += Math.max(0, game.bike.vx) * dt;
  }
  const el = $('kid-timer');
  if (settings.timerMin <= 0) {
    el.classList.add('hidden');
    return;
  }
  // real time (the game step is capped when the frame rate drops)
  const nowT = performance.now();
  const real = Math.min(1, Math.max(0, (nowT - timerClock) / 1000));
  timerClock = nowT;
  if (document.visibilityState === 'visible' && !asleep()) settings.timerUsed += real;
  timerSave += real;
  if (timerSave > 10) {
    timerSave = 0;
    saveSettings(settings);
    saveP();
  }
  const left = Math.max(0, settings.timerMin * 60 - settings.timerUsed);
  el.classList.remove('hidden');
  el.classList.toggle('soon', left < 120);
  el.classList.toggle('done', left <= 0);
  $('kid-timer-v').textContent = left <= 0 ? 'zzz' : String(Math.ceil(left / 60));
  if (left <= 0 && !timerWarned) {
    timerWarned = true;
    saveSettings(settings);
    // not in a run: straight to bed; in a run: it may be finished first
    if (game.state !== 'playing' && game.state !== 'paused' && !mp.active) show('sleep');
  }
  if (left > 0) timerWarned = false;
}
function syncTimerUI(): void {
  for (const b of $('set-timer').querySelectorAll<HTMLButtonElement>('.layout-opt')) {
    b.classList.toggle('selected', Number(b.dataset.min) === settings.timerMin);
    // once a timer runs, only the long press below can change it
    b.disabled = settings.timerMin > 0;
  }
  $('timer-reset').classList.toggle('hidden', settings.timerMin <= 0);
}
for (const b of $('set-timer').querySelectorAll<HTMLButtonElement>('.layout-opt'))
  b.addEventListener('click', () => {
    if (settings.timerMin > 0) return;
    settings.timerMin = Number(b.dataset.min);
    settings.timerUsed = 0;
    saveSettings(settings);
    syncTimerUI();
  });
{
  // parents: keep the button pressed 3 s to switch the timer off (then set a new one)
  const btn = $('timer-reset');
  let t0 = 0;
  let raf = 0;
  const stop = () => {
    cancelAnimationFrame(raf);
    t0 = 0;
    $('timer-reset-fill').style.width = '0%';
  };
  const step = () => {
    const k = (performance.now() - t0) / 3000;
    $('timer-reset-fill').style.width = `${Math.min(100, k * 100)}%`;
    if (k >= 1) {
      stop();
      settings.timerMin = 0;
      settings.timerUsed = 0;
      saveSettings(settings);
      syncTimerUI();
      return;
    }
    raf = requestAnimationFrame(step);
  };
  btn.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    t0 = performance.now();
    raf = requestAnimationFrame(step);
  });
  for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) btn.addEventListener(ev, stop);
}
$('sleep-settings').addEventListener('click', () => openSettings('sleep'));

function play(): void {
  if (asleep()) return show('sleep');
  if (onCross()) return start();
  if (isCircuitMode(profile.mode)) openCircuits();
  else start();
}

function pause(): void {
  if (game.state !== 'playing') return;
  game.state = 'paused';
  controls.reset();
  // a championship stage cannot be restarted alone
  $('btn-restart').classList.toggle('hidden', mp.inStage);
  // cruising: stop the ride and see what it brought in
  $('btn-stop').classList.toggle('hidden', game.mode !== 'cruising' || mp.inStage);
  show('pause');
}

function resume(): void {
  if (game.state !== 'paused') return;
  audio.unlock();
  game.state = 'playing';
  show('none');
}

function home(): void {
  // multiplayer stage: leaving the run ends it for me (the others go on)
  if (mp.inStage) {
    if (game.state === 'paused' || game.state === 'playing') {
      game.state = 'playing';
      game.quit();
    }
    return;
  }
  // quitting a run from the pause menu keeps its record and its coins
  if (game.state === 'paused' || game.state === 'playing') {
    game.quit();
    finishRun(false);
  }
  game.newRun({ ...runOpts(), mode: 'cruising', difficulty: 'facile', calm: true });
  game.state = 'title';
  audio.setElectric(!!game.model.electric);
  refreshTitle();
  renderer.render(game, 0, true);
  show('title');
  flashSplash();
}

const OVER_TITLES: Record<string, string> = {
  fuel: "PANNE D'ESSENCE !",
  stamina: 'PILOTE ÉPUISÉ !',
  time: 'TEMPS ÉCOULÉ !',
  quit: 'PARTIE ARRÊTÉE',
  stop: 'BELLE BALADE !',
};

/** Bank the run: coins, records, circuit medals. Shows the results when asked. */
function finishRun(display: boolean): void {
  const r = game.result;
  if (!r) return;
  const mode = game.mode;
  let bestText = '';
  let unlockMsg = '';
  if (isCircuitMode(mode) && r.circuit) {
    const key = circuitKey(mode, game.region, r.circuit, game.difficulty);
    const old = profile.circuits[key] ?? { medal: 0, done: false };
    if (r.reason === 'finish') {
      const di = diffIndex(game.difficulty);
      if (!old.done && di < 2 && !r.mx) unlockMsg = `${WEATHER_ICONS[di + 1]} ${DIFFICULTIES[di + 1].name} débloqué sur ce circuit : météo ${WEATHER_NAMES[di + 1].toLowerCase()} !`;
      const nr: CircuitRecord = { ...old, done: true };
      if (r.mx === 'tricks') {
        r.time = undefined;
        if ((r.tricks ?? 0) > (profile.best.mxtricks ?? 0)) {
          r.newRecord = (profile.best.mxtricks ?? 0) > 0;
          profile.best.mxtricks = r.tricks ?? 0;
        }
      }
      if (r.time !== undefined && (old.time === undefined || r.time < old.time)) {
        r.newRecord = old.time !== undefined;
        nr.time = r.time;
      }
      if (r.place !== undefined && (old.place === undefined || r.place < old.place)) nr.place = r.place;
      const medal = r.medal ?? 0;
      if (medal > old.medal) {
        const bonus = MEDAL_BONUS[medal] - MEDAL_BONUS[old.medal];
        r.lines.push({ label: `Médaille ${MEDAL_NAMES[medal]} (nouvelle)`, coins: bonus });
        r.total += bonus;
        nr.medal = medal;
      }
      profile.circuits[key] = nr;
      // the next circuit becomes the selection
      if (r.circuit < CIRCUITS && !r.mx) profile.circuitSel[`${mode}:${game.region}`] = r.circuit + 1;
    }
    const cur = profile.circuits[key];
    bestText = r.mx === 'tricks' ? `Record : ${profile.best.mxtricks ?? 0} saltos` : cur?.time !== undefined ? `Record : ${fmtTime(cur.time)}` : cur?.place ? `Meilleure place : ${cur.place}${cur.place === 1 ? 're' : 'e'}` : '';
  } else {
    const key = bestKey(mode, game.region);
    const di = diffIndex(game.difficulty);
    if (false as boolean) {
      profile.cruiseUnlock[game.region] = di + 1;
      unlockMsg = `${WEATHER_ICONS[di + 1]} ${DIFFICULTIES[di + 1].name} débloqué : météo ${WEATHER_NAMES[di + 1].toLowerCase()} !`;
    }
    if (r.score > (profile.best[key] ?? 0)) {
      r.newRecord = (profile.best[key] ?? 0) > 0;
      profile.best[key] = r.score;
    }
    bestText = 'Record : ' + (profile.best[key] ?? 0).toLocaleString('fr-FR') + ' m';
  }
  profile.coins += r.total;
  profile.totalEarned += r.total;
  saveP();
  if (!display) return;
  let title = OVER_TITLES[mode === 'cruising' && r.reason === 'quit' ? 'stop' : r.reason] ?? 'FIN';
  if (r.reason === 'finish') {
    if (mode === 'course') title = r.place === 1 ? 'VICTOIRE !' : r.place! <= 3 ? 'PODIUM !' : `${r.place}e PLACE`;
    else title = r.medal === 3 ? "MÉDAILLE D'OR !" : r.medal === 2 ? "MÉDAILLE D'ARGENT !" : 'ARRIVÉE !';
  }
  $('over-title').textContent = title;
  $('over-score-label').textContent = r.mx ? `Circuit de cross · ${MX_EVENTS.find((e) => e.id === r.mx)!.name}` : mode === 'course' ? 'Classement' : isCircuitMode(mode) ? (r.circuit ? `Circuit ${r.circuit} · Temps` : 'Temps') : 'Distance';
  $('over-score').textContent = r.scoreLabel;
  $('over-best').textContent = bestText;
  $('over-record').classList.toggle('hidden', !r.newRecord);
  const om = $('over-medal');
  om.classList.toggle('hidden', !r.medal && !unlockMsg);
  om.innerHTML = (r.medal ? `<span>${medalIco(r.medal)} Médaille ${MEDAL_NAMES[r.medal]}</span>` : '') + (unlockMsg ? `<span class="unlock">${unlockMsg}</span>` : '');
  const st = $('over-standings');
  st.classList.toggle('hidden', !r.standings);
  st.innerHTML = (r.standings ?? []).map((s) => `<li class="${s.you ? 'you' : ''}">${s.name}${s.you ? '' : `<small>Niv.${s.level}</small>`}</li>`).join('');
  $('over-lines').innerHTML = r.lines.map((l) => `<li><span>${l.label}</span><b>+${l.coins}</b></li>`).join('') || '<li><span>Rien cette fois</span><b>0</b></li>';
  $('over-total').textContent = `+${r.total}`;
  $('over-wallet').textContent = profile.coins.toLocaleString('fr-FR');
  const canNext = !r.mx && isCircuitMode(mode) && r.reason === 'finish' && !!r.circuit && r.circuit < CIRCUITS;
  // same level again, under another weather (the ones already open)
  const ow = $('over-weather');
  const others = !r.mx && isCircuitMode(mode) && r.reason === 'finish' && r.circuit ? DIFF_ORDER.filter((d) => d !== game.difficulty && diffUnlocked(mode, r.circuit!, d)) : [];
  ow.classList.toggle('hidden', !others.length);
  ow.innerHTML = others.map((d) => `<button class="btn-secondary wx-retry" data-d="${d}">${WEATHER_ICONS[diffIndex(d)]} REJOUER · ${WEATHER_NAMES[diffIndex(d)].toUpperCase()}</button>`).join('');
  $('btn-next').classList.toggle('hidden', !canNext);
  show('over');
}

function openGarage(from: ScreenName): void {
  garageReturn = from;
  audio.unlock();
  show('garage');
}
garage.onChange = () => {
  updateBest();
  mp.multi?.updateProfile(settings.pseudo.trim() || 'Pilote', MULTI_BIKE.id, profile.outfit);
  if (game.state === 'title') {
    renderer.setPlayerModel(bikeById(profile.bike), outfit());
    game.newRun({ ...runOpts(), mode: 'cruising', difficulty: 'facile', calm: true });
    game.state = 'title';
    audio.setElectric(!!game.model.electric);
  }
};

$('btn-play').addEventListener('click', play);
$('btn-fs-title').addEventListener('click', () => void toggleFullscreen());
$('btn-fs-settings').addEventListener('click', () => void toggleFullscreen());
$('btn-fs-pause').addEventListener('click', () => void toggleFullscreen());
syncFullscreen();
$('btn-circ-go').addEventListener('click', start);
$('btn-circuits-back').addEventListener('click', () => {
  refreshTitle();
  show('title');
});
$('btn-again').addEventListener('click', () => {
  // replay the same circuit (finishing moved the selection to the next one)
  if (game.circuit) profile.circuitSel[`${game.mode}:${game.region}`] = game.circuit;
  start();
});
$('over-weather').addEventListener('click', (e) => {
  const b = (e.target as HTMLElement).closest<HTMLElement>('[data-d]');
  if (!b) return;
  profile.difficulty = b.dataset.d as Difficulty;
  if (game.circuit) profile.circuitSel[`${game.mode}:${game.region}`] = game.circuit;
  saveP();
  start();
});
$('btn-next').addEventListener('click', () => {
  profile.circuitSel[`${game.mode}:${game.region}`] = Math.min(CIRCUITS, game.circuit + 1);
  start();
});
$('btn-restart').addEventListener('click', () => {
  if (game.circuit) profile.circuitSel[`${game.mode}:${game.region}`] = game.circuit;
  start();
});
$('btn-resume').addEventListener('click', resume);
$('btn-stop').addEventListener('click', () => {
  // ends the ride: the usual results screen with distance, bonus and coins
  if (game.state !== 'paused') return;
  game.state = 'playing';
  game.quit();
});
$('btn-home').addEventListener('click', home);
$('btn-home2').addEventListener('click', home);
$('btn-pause').addEventListener('click', pause);
$('btn-garage').addEventListener('click', () => openGarage('title'));
$('btn-garage2').addEventListener('click', () => {
  home();
  openGarage('title');
});
$('btn-garage-back').addEventListener('click', () => {
  refreshTitle();
  show(garageReturn);
});
controls.onPause = () => (game.state === 'paused' ? resume() : pause());
controls.onCruise = () => game.toggleCruise();
$('ctl-cruise').addEventListener('pointerdown', (e) => {
  e.preventDefault();
  e.stopPropagation();
  game.toggleCruise();
});
let cruiseShown = '';
/** Cruise control button: only in cruising when bought; shows the speed it holds. */
function syncCruise(): void {
  const b = $('ctl-cruise');
  const k = game.hasCruise ? (game.cruiseTarget > 0 ? 'on' + Math.round(game.cruiseTarget * 3.6) : 'off') : 'none';
  if (k === cruiseShown) return;
  cruiseShown = k;
  b.classList.toggle('hidden', k === 'none');
  b.classList.toggle('on', game.cruiseTarget > 0);
  $('ctl-cruise-v').textContent = game.cruiseTarget > 0 ? `${Math.round(game.cruiseTarget * 3.6)}` : 'CRUISE';
}
document.addEventListener('visibilitychange', () => {
  if (document.hidden) pause();
});
window.addEventListener('resize', () => renderer.resize());
window.addEventListener('orientationchange', () => setTimeout(() => renderer.resize(), 200));
// Landscape only: turning the phone to portrait pauses the run (the rotate screen covers it).
matchMedia('(orientation: portrait)').addEventListener('change', (e) => {
  if (e.matches && matchMedia('(pointer: coarse)').matches) pause();
});
// Block the iOS context menu / double-tap zoom on long presses.
document.addEventListener('contextmenu', (e) => e.preventDefault());
// Music starts as soon as the game opens; browsers that block autoplay start it on the first
// touch or key press anywhere.
audio.unlock();
for (const ev of ['pointerdown', 'keydown', 'touchend']) window.addEventListener(ev, () => audio.unlock(), { passive: true });
$('version').textContent = 'v' + __APP_VERSION__;

buildModes();
buildRegions();
bindSettings();
refreshTitle();
applyLayout(settings.layout);
const loadingEl = $('loading');
loadAssets()
  .then((a) => {
    renderer.setAssets(a);
    loadingEl.classList.add('hidden');
  })
  .catch((e) => {
    console.error(e);
    loadingEl.textContent = 'Erreur de chargement';
  });
show('title');
renderer.render(game, 0, true);

// ---------------------------------------------------------------- multiplayer

const mp = new MultiUI({
  game,
  show: (s) => show(s),
  pseudo: () => settings.pseudo.trim() || 'Pilote ' + (1 + Math.floor(Math.random() * 99)),
  bike: () => MULTI_BIKE.id,
  outfit: () => profile.outfit,
  startStage: (stage, elapsed) => {
    audio.unlock();
    controls.reset();
    // everybody rides the same multiplayer bike (no upgrades, no tyres), in his own outfit
    const model = MULTI_BIKE;
    renderer.setPlayerModel(model, outfit());
    audio.setElectric(false);
    game.pseudo = settings.pseudo.trim();
    game.newRun({ region: stage.region, mode: stage.mode, model, spec: model.spec, tyres: [], difficulty: stage.difficulty, circuit: stage.circuit, multi: true });
    if (elapsed > 0) game.countdown = Math.max(0, game.countdown - elapsed / 1000);
    renderer.render(game, 0, true);
    show('none');
  },
  backToTitle: () => {
    game.newRun({ ...runOpts(), mode: 'cruising', difficulty: 'facile', calm: true });
    game.state = 'title';
    refreshTitle();
    renderer.render(game, 0, true);
    show('title');
  },
  bank: () => finishRun(false),
});

// ---------------------------------------------------------------- launch screen

/**
 * Launch screen: the poster fades in from black with a slow zoom, the rider rumbles, dust
 * flies off the rear wheel and a light sweeps the logo; JOUER / options. Returning to the menu
 * from a run shows it again for 1.5 s, without buttons, with a fade from and to black.
 */
const splash = $('splash');
const splashBlack = $('splash-black');
const fxCanvas = $('splash-fx') as HTMLCanvasElement;
let fxRunning = false;
let splashTimer = 0;

function black(on: boolean, ms: number): void {
  splashBlack.style.transition = `opacity ${ms}ms ease`;
  splashBlack.classList.toggle('out', !on);
}

function runDust(): void {
  if (fxRunning) return;
  fxRunning = true;
  const g = fxCanvas.getContext('2d')!;
  const parts: { x: number; y: number; vx: number; vy: number; r: number; life: number }[] = [];
  let last = performance.now();
  const tick = (now: number) => {
    if (splash.classList.contains('hidden')) {
      fxRunning = false;
      return;
    }
    const dt = Math.max(0, Math.min(0.05, (now - last) / 1000));
    last = now;
    const W = (fxCanvas.width = fxCanvas.clientWidth);
    const H = (fxCanvas.height = fxCanvas.clientHeight);
    // rear wheel of the painted bike
    for (let k = 0; k < 3; k++)
      parts.push({ x: 0.11 * W, y: 0.86 * H, vx: -(0.05 + Math.random() * 0.12) * W, vy: -(0.02 + Math.random() * 0.08) * H, r: 0.006 * W, life: 1 });
    g.clearRect(0, 0, W, H);
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.life -= dt * 0.8;
      if (p.life <= 0) {
        parts.splice(i, 1);
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 0.01 * H * dt;
      p.r += 0.012 * W * dt;
      g.fillStyle = `rgba(214,170,120,${0.32 * p.life})`;
      g.beginPath();
      g.arc(p.x, p.y, Math.max(0.5, p.r), 0, Math.PI * 2);
      g.fill();
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

function startSplash(): void {
  splash.classList.remove('hidden', 'flash');
  black(true, 0);
  requestAnimationFrame(() => requestAnimationFrame(() => black(false, 900)));
  runDust();
}

/** Fade to black, hide the poster, fade the menu in. */
function leaveSplash(then?: () => void): void {
  clearTimeout(splashTimer);
  black(true, 380);
  splashTimer = window.setTimeout(() => {
    splash.classList.add('gone');
    then?.();
    black(false, 380);
    splashTimer = window.setTimeout(() => splash.classList.add('hidden'), 400);
  }, 400);
}

/** Back from a run: the poster for 1.5 s, no buttons, black in and out. */
function flashSplash(): void {
  clearTimeout(splashTimer);
  splash.classList.remove('hidden', 'gone');
  splash.classList.add('flash');
  // restart the zoom so it moves while shown
  const art = splash.querySelector('.splash-art') as HTMLElement;
  art.style.animation = 'none';
  void art.offsetWidth;
  art.style.animation = '';
  black(true, 0);
  runDust();
  requestAnimationFrame(() => requestAnimationFrame(() => black(false, 300)));
  splashTimer = window.setTimeout(() => leaveSplash(), 1200);
}

// fullscreen as soon as possible: browsers only allow it on a touch, so the first touch on the
// launch screen (anywhere) switches it on
splash.addEventListener('pointerdown', () => void immersive(), { once: true });
// v2.25: a tap anywhere on the poster is the JOUER button
splash.addEventListener('click', (e) => {
  if ((e.target as HTMLElement).closest('#splash-settings')) return;
  audio.unlock();
  void immersive();
  leaveSplash();
});
$('splash-settings').addEventListener('click', () => {
  audio.unlock();
  leaveSplash(() => openSettings('title'));
});
startSplash();

// ---------------------------------------------------------------- loop
let last = performance.now();
let prevNow = last;
function frame(now: number): void {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  controls.update(dt);
  game.input.throttle = controls.throttle;
  game.input.brake = controls.brake;
  game.input.balance = controls.balance;
  game.steer = controls.steer;
  controls.setStickMode(game.mxT >= 0.5 && game.state !== 'title');
  game.update(dt);
  tickTimers(dt);
  const ev = game.consumeEvents();
  syncCruise();
  if (ev.cruise !== undefined) vibrate(ev.cruise ? [20, 30, 40] : 30);
  const inGame = game.state === 'playing' || game.state === 'over';
  if (ev.pickup) {
    audio.pickup(ev.pickup);
    vibrate(18);
  }
  if (ev.coin) {
    audio.coin();
    vibrate(8, 60);
  }
  if (ev.stunt) vibrate([12, 30, 12]);
  if (ev.landing) {
    audio.landing(ev.landing);
    // landing thump proportional to the impact (only while really playing)
    if (inGame && ev.landing > 2.5) vibrate(Math.round(Math.min(70, 8 + ev.landing * 5)));
  }
  if (ev.bottom && inGame) vibrate(25, 150);
  if (ev.bump && game.state === 'playing') {
    audio.landing(Math.min(4, ev.bump * 1.6));
    vibrate(Math.round(Math.min(45, 12 + ev.bump * 12)), 90);
  }
  if (ev.weak) vibrate([40, 60, 40]);
  if (ev.crash) {
    audio.crash();
    vibrate([90, 40, 140]);
  }
  if (ev.fault) vibrate([30, 30, 30]);
  if (ev.section === 'clean') {
    audio.checkpoint();
    vibrate([15, 25, 15, 25, 40]);
  }
  if (ev.countdown !== undefined) {
    audio.countdown(ev.countdown);
    vibrate(ev.countdown > 0 ? 25 : 80);
  }
  if (ev.finish) {
    audio.checkpoint();
    vibrate(ev.finish <= 3 ? [40, 40, 40, 40, 120] : 60);
  }
  if (ev.checkpoint) {
    audio.checkpoint();
    vibrate([20, 30, 20]);
  }
  if (ev.over) {
    audio.over();
    if (mp.inStage) mp.localOver();
    else finishRun(true);
  }
  mp.frame(dt);
  if (game.state === 'playing') {
    const sky = game.world.weatherAt(game.bike.x);
    audio.rain(sky.rain + sky.snow * 0.12);
  } else audio.rain(0);
  // engine: heard only while riding (silent on the home screen and every menu)
  const running = game.state === 'playing' && (!game.usesEnergy || game.fuel > 0);
  audio.engine(game.bike.rpm, running ? game.input.throttle : 0, game.state === 'playing' ? game.bike.speed : 0, running);
  if (game.state !== 'paused') renderer.render(game, dt);
  if (game.state === 'playing') renderer.adapt((now - prevNow) / 1000);
  prevNow = now;
  if (game.state === 'playing') hud.update(game);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// ---------------------------------------------------------------- PWA
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}

// Debug handle (dev server only) for automated visual checks.
if (import.meta.env.DEV) (window as unknown as { __mx: unknown }).__mx = { game, renderer, audio, profile, mp };
