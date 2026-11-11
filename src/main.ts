import './style.css';
import { Audio } from './audio/audio';
import { loadAssets } from './assets';
import { Game } from './game';
import { GLRenderer } from './gl/glRenderer';
import { loadSettings, saveSettings, Layout, Quality } from './settings';
import { Controls } from './ui/controls';
import { Hud } from './ui/hud';
import { Garage } from './ui/garage';
import { REGION_ORDER, REGIONS, RegionId } from './world/regions';
import { bikeById } from './bikes';
import { DIFFICULTIES, MODES, ModeId } from './modes';
import { bestKey, loadProfile, saveProfile } from './profile';
import { outfitById } from './outfits';
import {
  CIRCUITS,
  CircuitMode,
  circuitKey,
  circuitLength,
  CircuitRecord,
  circuitRaceLevel,
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
const profile = loadProfile();
const saveP = () => saveProfile(profile);
const renderer = new GLRenderer($('app'), settings.quality);
/** Circuit currently picked for the selected mode and world. */
const circuitOf = (mode: ModeId = profile.mode) => profile.circuitSel[`${mode}:${settings.region}`] ?? 1;
const runOpts = () => ({ region: settings.region, mode: profile.mode, model: bikeById(profile.bike), difficulty: profile.difficulty, circuit: circuitOf() });
const outfit = () => outfitById(profile.outfit);
const game = new Game({ ...runOpts(), mode: 'cruising' });
renderer.setPlayerModel(game.model, outfit());
const garage = new Garage(profile, saveP);
const controls = new Controls();
const hud = new Hud();
const audio = new Audio();
audio.setVolumes(settings.music, settings.sfx);

type ScreenName = 'title' | 'pause' | 'over' | 'settings' | 'garage' | 'circuits' | 'none';
const screens: Record<Exclude<ScreenName, 'none'>, HTMLElement> = {
  title: $('screen-title'),
  circuits: $('screen-circuits'),
  pause: $('screen-pause'),
  over: $('screen-over'),
  settings: $('screen-settings'),
  garage: $('screen-garage'),
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
const MODE_SHORT: Record<ModeId, string> = {
  cruising: 'Balade',
  trial: 'Obstacles',
  enduro: 'Collines',
  course: '8 pilotes',
};

const rec = (mode: CircuitMode, n: number): CircuitRecord | undefined => profile.circuits[circuitKey(mode, settings.region, n)];
const unlocked = (mode: CircuitMode, n: number) => n === 1 || !!rec(mode, n - 1)?.done;
/** Medal counts for a mode in the current world: [bronze+, silver+, gold] and circuits done. */
function medalCounts(mode: CircuitMode): { done: number; gold: number; silver: number; bronze: number } {
  const c = { done: 0, gold: 0, silver: 0, bronze: 0 };
  for (let n = 1; n <= CIRCUITS; n++) {
    const r = rec(mode, n);
    if (!r?.done) continue;
    c.done++;
    if (r.medal === 3) c.gold++;
    else if (r.medal === 2) c.silver++;
    else if (r.medal === 1) c.bronze++;
  }
  return c;
}
const medalIco = (m: number) => `<i class="medal-ico" style="--m:${MEDAL_COLORS[m] || '#666'}"></i>`;

function updateBest(): void {
  const mode = profile.mode;
  if (isCircuitMode(mode)) {
    const c = medalCounts(mode);
    $('best-title').innerHTML = `${c.done}/${CIRCUITS} · ${medalIco(3)} ${c.gold}`;
    $('best-title').parentElement!.firstChild!.textContent = 'CIRCUITS ';
  } else {
    const v = profile.best[bestKey(mode, settings.region)] ?? 0;
    $('best-title').textContent = v ? `${v.toLocaleString('fr-FR')} m` : '—';
    $('best-title').parentElement!.firstChild!.textContent = 'RECORD ';
  }
  $('title-coins').textContent = profile.coins.toLocaleString('fr-FR');
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
  for (const el of $('modes').querySelectorAll('.mode-card')) el.classList.toggle('selected', (el as HTMLElement).dataset.mode === profile.mode);
  const m = MODES.find((x) => x.id === profile.mode)!;
  $('mode-desc').textContent = m.description;
  updateBest();
}

function buildModes(): void {
  $('modes').innerHTML = MODES.map((m) => `<button class="mode-card" data-mode="${m.id}">${MODE_ICONS[m.id]}<b>${m.name}</b><small>${MODE_SHORT[m.id]}</small><span class="medals"></span></button>`).join('');
  for (const el of $('modes').querySelectorAll('.mode-card'))
    el.addEventListener('click', () => {
      profile.mode = (el as HTMLElement).dataset.mode as ModeId;
      saveP();
      refreshTitle();
    });
  $('circ-diffs').innerHTML = DIFFICULTIES.map((d) => `<button class="diff" data-diff="${d.id}">${d.name}</button>`).join('');
  for (const el of $('circ-diffs').querySelectorAll('.diff'))
    el.addEventListener('click', () => {
      profile.difficulty = (el as HTMLElement).dataset.diff as typeof profile.difficulty;
      saveP();
      renderCircuits();
    });
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
  $('circ-mode').textContent = MODES.find((m) => m.id === mode)!.name;
  $('circ-world').textContent = REGIONS[settings.region].name;
  const c = medalCounts(mode);
  $('circ-medals').innerHTML = `<span>${medalIco(3)} ${c.gold}</span><span>${medalIco(2)} ${c.silver}</span><span>${medalIco(1)} ${c.bronze}</span>`;
  let next = 0;
  for (let n = 1; n <= CIRCUITS && !next; n++) if (!rec(mode, n)?.done) next = n;
  const tiles: string[] = [];
  for (let n = 1; n <= CIRCUITS; n++) {
    const r = rec(mode, n);
    const open = unlocked(mode, n);
    const sub = r?.done ? (mode === 'course' ? `${r.place}${r.place === 1 ? 'er' : 'e'}` : fmtTime(r.time ?? 0)) : '';
    const cls = ['circ-tile', open ? '' : 'locked', n === sel ? 'selected' : '', n === next && open ? 'next' : ''].join(' ');
    tiles.push(`<button class="${cls}" data-n="${n}"${open ? '' : ' disabled'}>${r?.medal ? medalIco(r.medal) : ''}<b>${n}</b>${sub ? `<small>${sub}</small>` : ''}</button>`);
  }
  $('circ-grid').innerHTML = tiles.join('');
  // details of the selected circuit
  $('circ-num').textContent = `Circuit ${sel}`;
  const meta =
    mode === 'trial'
      ? `${trialZones(sel)} zones d’obstacles · chute = +15 s`
      : mode === 'enduro'
        ? `${(circuitLength(mode, sel) / 1000).toFixed(1).replace('.', ',')} km · grosses collines`
        : `${(circuitLength(mode, sel) / 1000).toFixed(1).replace('.', ',')} km · pilotes niveau ${circuitRaceLevel(sel)}`;
  $('circ-meta').textContent = meta;
  $('circ-diffs').classList.toggle('hidden', mode !== 'course');
  for (const el of $('circ-diffs').querySelectorAll('.diff')) el.classList.toggle('selected', (el as HTMLElement).dataset.diff === profile.difficulty);
  const r = rec(mode, sel);
  const got = r?.medal ?? 0;
  if (mode === 'course') {
    $('circ-goals').innerHTML = [3, 2, 1].map((m) => `<li class="${got >= m ? 'got' : ''}">${medalIco(m)} ${m === 3 ? '1re place' : m === 2 ? '2e place' : '3e place'}</li>`).join('');
    $('circ-best').textContent = r?.place ? `Meilleure place : ${r.place}${r.place === 1 ? 're' : 'e'}` : '';
  } else {
    const p = parTimes(mode, sel);
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
      id === 'desert'
        ? 'linear-gradient(180deg,#5d9be6 0%,#fbe3b8 48%,#f6d39a 49%,#e8b676 70%,#cf9152 100%)'
        : id === 'canyon'
          ? 'linear-gradient(180deg,#5aa2f0 0%,#ffd9a8 45%,#d9824a 46%,#a8552f 75%,#7a3b22 100%)'
          : `url(/res/backdrop-alps-forest.webp)`;
    const photo = id === 'alpes' || id === 'foret';
    b.innerHTML = `<i class="thumb${photo ? ' photo' : ''}" style="background-image:${thumb};${id === 'foret' ? 'filter:hue-rotate(-12deg) saturate(1.2) brightness(0.9);background-position:78% 96%' : ''}"></i><span>${r.name}</span>`;
    b.title = r.subtitle;
    b.addEventListener('click', () => {
      settings.region = id as RegionId;
      saveSettings(settings);
      for (const el of box.querySelectorAll('.world-card')) el.classList.toggle('selected', (el as HTMLElement).dataset.region === id);
      game.newRun({ ...runOpts(), mode: 'cruising' });
      game.state = 'title';
      updateBest();
      renderer.render(game, 0, true);
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
  applyLayout(settings.layout);
  applyQuality(settings.quality);
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
  ($('set-vibration') as HTMLInputElement).addEventListener('change', (e) => {
    settings.vibration = (e.target as HTMLInputElement).checked;
    saveSettings(settings);
  });
  $('btn-settings-back').addEventListener('click', () => show(settingsReturn));
  $('btn-settings-title').addEventListener('click', () => {
    audio.unlock();
    openSettings('title');
  });
  $('btn-settings-pause').addEventListener('click', () => openSettings('pause'));
}

// ---------------------------------------------------------------- flow

/** Fullscreen + landscape lock where the platform allows it (Android, installed PWA). */
async function immersive(): Promise<void> {
  try {
    if (!document.fullscreenElement && document.documentElement.requestFullscreen && matchMedia('(pointer: coarse)').matches) {
      await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
    }
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
  audio.unlock();
  void immersive();
  controls.reset();
  const model = bikeById(profile.bike);
  renderer.setPlayerModel(model, outfit());
  audio.setElectric(!!model.electric);
  game.newRun(runOpts());
  renderer.render(game, 0, true);
  show('none');
}

/** JOUER: cruising starts at once, circuit modes open the circuit picker. */
function play(): void {
  if (isCircuitMode(profile.mode)) openCircuits();
  else start();
}

function pause(): void {
  if (game.state !== 'playing') return;
  game.state = 'paused';
  controls.reset();
  show('pause');
}

function resume(): void {
  if (game.state !== 'paused') return;
  audio.unlock();
  game.state = 'playing';
  show('none');
}

function home(): void {
  // quitting a run from the pause menu keeps its record and its coins
  if (game.state === 'paused' || game.state === 'playing') {
    game.quit();
    finishRun(false);
  }
  game.newRun({ ...runOpts(), mode: 'cruising' });
  game.state = 'title';
  audio.setElectric(!!game.model.electric);
  refreshTitle();
  renderer.render(game, 0, true);
  show('title');
}

const OVER_TITLES: Record<string, string> = {
  fuel: "PANNE D'ESSENCE !",
  stamina: 'PILOTE ÉPUISÉ !',
  time: 'TEMPS ÉCOULÉ !',
  quit: 'PARTIE ARRÊTÉE',
};

/** Bank the run: coins, records, circuit medals. Shows the results when asked. */
function finishRun(display: boolean): void {
  const r = game.result;
  if (!r) return;
  const mode = game.mode;
  let bestText = '';
  if (isCircuitMode(mode) && r.circuit) {
    const key = circuitKey(mode, game.region, r.circuit);
    const old = profile.circuits[key] ?? { medal: 0, done: false };
    if (r.reason === 'finish') {
      const nr: CircuitRecord = { ...old, done: true };
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
      if (r.circuit < CIRCUITS) profile.circuitSel[`${mode}:${game.region}`] = r.circuit + 1;
    }
    const cur = profile.circuits[key];
    bestText = cur?.time !== undefined ? `Record : ${fmtTime(cur.time)}` : cur?.place ? `Meilleure place : ${cur.place}${cur.place === 1 ? 're' : 'e'}` : '';
  } else {
    const key = bestKey(mode, game.region);
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
  let title = OVER_TITLES[r.reason] ?? 'FIN';
  if (r.reason === 'finish') {
    if (mode === 'course') title = r.place === 1 ? 'VICTOIRE !' : r.place! <= 3 ? 'PODIUM !' : `${r.place}e PLACE`;
    else title = r.medal === 3 ? "MÉDAILLE D'OR !" : r.medal === 2 ? "MÉDAILLE D'ARGENT !" : 'ARRIVÉE !';
  }
  $('over-title').textContent = title;
  $('over-score-label').textContent = mode === 'course' ? 'Classement' : isCircuitMode(mode) ? (r.circuit ? `Circuit ${r.circuit} · Temps` : 'Temps') : 'Distance';
  $('over-score').textContent = r.scoreLabel;
  $('over-best').textContent = bestText;
  $('over-record').classList.toggle('hidden', !r.newRecord);
  const om = $('over-medal');
  om.classList.toggle('hidden', !r.medal);
  om.innerHTML = r.medal ? `${medalIco(r.medal)} Médaille ${MEDAL_NAMES[r.medal]}` : '';
  const st = $('over-standings');
  st.classList.toggle('hidden', !r.standings);
  st.innerHTML = (r.standings ?? []).map((s) => `<li class="${s.you ? 'you' : ''}">${s.name}${s.you ? '' : `<small>Niv.${s.level}</small>`}</li>`).join('');
  $('over-lines').innerHTML = r.lines.map((l) => `<li><span>${l.label}</span><b>+${l.coins}</b></li>`).join('') || '<li><span>Rien cette fois</span><b>0</b></li>';
  $('over-total').textContent = `+${r.total}`;
  $('over-wallet').textContent = profile.coins.toLocaleString('fr-FR');
  const canNext = isCircuitMode(mode) && r.reason === 'finish' && !!r.circuit && r.circuit < CIRCUITS;
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
  if (game.state === 'title') {
    renderer.setPlayerModel(bikeById(profile.bike), outfit());
    game.newRun({ ...runOpts(), mode: 'cruising' });
    game.state = 'title';
    audio.setElectric(!!game.model.electric);
  }
};

$('btn-play').addEventListener('click', play);
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
$('btn-next').addEventListener('click', () => {
  profile.circuitSel[`${game.mode}:${game.region}`] = Math.min(CIRCUITS, game.circuit + 1);
  start();
});
$('btn-restart').addEventListener('click', () => {
  if (game.circuit) profile.circuitSel[`${game.mode}:${game.region}`] = game.circuit;
  start();
});
$('btn-resume').addEventListener('click', resume);
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
  game.update(dt);
  const ev = game.consumeEvents();
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
    finishRun(true);
  }
  // engine: the demo bike behind the home screen is heard too (a bit quieter than in a run)
  const demo = game.state === 'title';
  const running = (game.state === 'playing' && (!game.usesEnergy || game.fuel > 0)) || demo;
  audio.engine(game.bike.rpm, game.state === 'playing' || demo ? game.input.throttle * (demo ? 0.7 : 1) : 0, game.bike.speed, running);
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
if (import.meta.env.DEV) (window as unknown as { __mx: unknown }).__mx = { game, renderer, audio, profile };
