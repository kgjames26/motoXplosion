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
import { bestKey, levelTier, loadProfile, saveProfile } from './profile';

/**
 * Entry point: wires the game loop, renderer, HUD, controls, screens, settings, audio and PWA.
 */
const $ = (id: string) => document.getElementById(id)!;

const settings = loadSettings();
const profile = loadProfile();
const saveP = () => saveProfile(profile);
const renderer = new GLRenderer($('app'), settings.quality);
const runOpts = () => ({ region: settings.region, mode: profile.mode, model: bikeById(profile.bike), difficulty: profile.difficulty, raceLevel: profile.raceLevel });
const game = new Game(runOpts());
renderer.setPlayerModel(game.model);
const garage = new Garage(profile, saveP);
const controls = new Controls();
const hud = new Hud();
const audio = new Audio();
audio.setVolumes(settings.music, settings.sfx);

type ScreenName = 'title' | 'pause' | 'over' | 'settings' | 'garage' | 'none';
const screens: Record<Exclude<ScreenName, 'none'>, HTMLElement> = {
  title: $('screen-title'),
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

function fmtBest(mode: ModeId, v: number): string {
  if (!v) return '—';
  if (mode === 'trial') return `${v} zone${v > 1 ? 's' : ''}`;
  if (mode === 'course') return `${9 - v}e place`;
  return `${v.toLocaleString('fr-FR')} m`;
}

function updateBest(): void {
  $('best-title').textContent = fmtBest(profile.mode, profile.best[bestKey(profile.mode, settings.region)] ?? 0);
  $('title-coins').textContent = profile.coins.toLocaleString('fr-FR');
}

/** Championship badge: medal colour by tier, level number, podium progress (3 pips). */
function badgeHtml(): string {
  const t = levelTier(profile.raceLevel);
  const pips = [0, 1, 2].map((i) => `<i class="${i < profile.racePoints ? 'on' : ''}"></i>`).join('');
  return `<span class="medal">${profile.raceLevel}</span>Niveau ${profile.raceLevel} · ${t.name}<span class="pips">${pips}</span>`;
}

function refreshTitle(): void {
  for (const el of $('modes').querySelectorAll('.mode-tab')) el.classList.toggle('selected', (el as HTMLElement).dataset.mode === profile.mode);
  const m = MODES.find((x) => x.id === profile.mode)!;
  $('mode-desc').textContent = m.description;
  const course = profile.mode === 'course';
  $('course-opts').classList.toggle('hidden', !course);
  const badge = $('level-badge');
  badge.style.setProperty('--tier', levelTier(profile.raceLevel).color);
  badge.innerHTML = badgeHtml();
  for (const el of $('diffs').querySelectorAll('.diff')) el.classList.toggle('selected', (el as HTMLElement).dataset.diff === profile.difficulty);
  const hl = $('hud-level');
  hl.className = 'hud-level level-badge';
  hl.style.setProperty('--tier', levelTier(profile.raceLevel).color);
  hl.innerHTML = badgeHtml();
  updateBest();
}

function buildModes(): void {
  $('modes').innerHTML = MODES.map((m) => `<button class="mode-tab" data-mode="${m.id}">${m.name}<small>${m.short}</small></button>`).join('');
  for (const el of $('modes').querySelectorAll('.mode-tab'))
    el.addEventListener('click', () => {
      profile.mode = (el as HTMLElement).dataset.mode as ModeId;
      saveP();
      refreshTitle();
    });
  $('diffs').innerHTML = DIFFICULTIES.map((d) => `<button class="diff" data-diff="${d.id}">${d.name}</button>`).join('');
  for (const el of $('diffs').querySelectorAll('.diff'))
    el.addEventListener('click', () => {
      profile.difficulty = (el as HTMLElement).dataset.diff as typeof profile.difficulty;
      saveP();
      refreshTitle();
    });
}

// ---------------------------------------------------------------- regions (levels)

function buildRegions(): void {
  const box = $('regions');
  box.innerHTML = '';
  for (const id of REGION_ORDER) {
    const r = REGIONS[id];
    const b = document.createElement('button');
    b.className = 'region-card' + (id === settings.region ? ' selected' : '');
    b.dataset.region = id;
    const thumb =
      id === 'desert'
        ? 'linear-gradient(180deg,#5d9be6 0%,#fbe3b8 48%,#f6d39a 49%,#e8b676 70%,#cf9152 100%)'
        : id === 'canyon'
        ? 'linear-gradient(180deg,#5aa2f0 0%,#ffd9a8 45%,#d9824a 46%,#a8552f 75%,#7a3b22 100%)'
        : `url(/res/backdrop-alps-forest.webp)`;
    // (cards are compact on the home screen: name only, subtitle as tooltip)
    b.innerHTML = `<i class="thumb" style="background-image:${thumb};${id === 'foret' ? 'filter:hue-rotate(-12deg) saturate(1.2) brightness(0.9)' : ''}"></i>${r.name}`;
    b.title = r.subtitle;
    b.addEventListener('click', () => {
      settings.region = id as RegionId;
      saveSettings(settings);
      for (const el of box.querySelectorAll('.region-card')) el.classList.toggle('selected', (el as HTMLElement).dataset.region === id);
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
  renderer.setPlayerModel(model);
  audio.setElectric(!!model.electric);
  game.newRun(runOpts());
  renderer.render(game, 0, true);
  show('none');
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
  lives: 'PLUS DE CASQUES !',
  quit: 'PARTIE ARRÊTÉE',
};

/** Bank the run: coins, record, championship progress. Shows the results when asked. */
function finishRun(display: boolean): void {
  const r = game.result;
  if (!r) return;
  profile.coins += r.total;
  profile.totalEarned += r.total;
  const key = bestKey(game.mode, game.region);
  if (r.score > (profile.best[key] ?? 0)) {
    r.newRecord = (profile.best[key] ?? 0) > 0 || game.mode !== 'course';
    profile.best[key] = r.score;
  }
  if (game.mode === 'course' && r.place) {
    if (r.place <= 3) {
      profile.racePoints++;
      if (profile.racePoints >= 3) {
        profile.raceLevel++;
        profile.racePoints = 0;
        r.levelUp = true;
      }
    } else if (r.place >= 7 && profile.racePoints > 0) profile.racePoints--;
  }
  saveP();
  if (!display) return;
  let title = OVER_TITLES[r.reason] ?? 'FIN';
  if (r.reason === 'finish') title = game.mode === 'trial' ? 'ÉPREUVE TERMINÉE !' : r.place === 1 ? 'VICTOIRE !' : r.place! <= 3 ? 'PODIUM !' : `${r.place}e PLACE`;
  $('over-title').textContent = title;
  $('over-score-label').textContent = game.mode === 'trial' ? 'Zones' : game.mode === 'course' ? 'Classement' : 'Distance';
  $('over-score').textContent = r.scoreLabel;
  $('over-best').textContent = 'Record : ' + fmtBest(game.mode, profile.best[key] ?? 0);
  $('over-record').classList.toggle('hidden', !r.newRecord);
  const lu = $('over-levelup');
  lu.classList.toggle('hidden', game.mode !== 'course' || !r.place);
  lu.innerHTML = r.levelUp ? `NIVEAU ${profile.raceLevel} ATTEINT ! (${levelTier(profile.raceLevel).name})` : game.mode === 'course' ? `Niveau ${profile.raceLevel} · podiums ${profile.racePoints}/3` : '';
  const st = $('over-standings');
  st.classList.toggle('hidden', !r.standings);
  st.innerHTML = (r.standings ?? []).map((s) => `<li class="${s.you ? 'you' : ''}">${s.name}${s.you ? '' : `<small>Niv.${s.level}</small>`}</li>`).join('');
  $('over-lines').innerHTML = r.lines.map((l) => `<li><span>${l.label}</span><b>+${l.coins}</b></li>`).join('') || '<li><span>Rien cette fois</span><b>0</b></li>';
  $('over-total').textContent = `+${r.total}`;
  $('over-wallet').textContent = profile.coins.toLocaleString('fr-FR');
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
    renderer.setPlayerModel(bikeById(profile.bike));
    game.newRun({ ...runOpts(), mode: 'cruising' });
    game.state = 'title';
    audio.setElectric(!!game.model.electric);
  }
};

$('btn-play').addEventListener('click', start);
$('btn-again').addEventListener('click', start);
$('btn-restart').addEventListener('click', start);
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
