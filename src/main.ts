import './style.css';
import { Audio } from './audio/audio';
import { loadAssets } from './assets';
import { Game } from './game';
import { Renderer } from './render/renderer';
import { loadSettings, saveSettings, Layout } from './settings';
import { Controls } from './ui/controls';
import { formatTime, Hud } from './ui/hud';
import { REGION_ORDER, REGIONS, RegionId } from './world/regions';

/**
 * Entry point: wires the game loop, renderer, HUD, controls, screens, settings, audio and PWA.
 */
const $ = (id: string) => document.getElementById(id)!;

const settings = loadSettings();
const canvas = $('game') as HTMLCanvasElement;
const renderer = new Renderer(canvas);
const game = new Game(settings.region);
const controls = new Controls();
const hud = new Hud();
const audio = new Audio();
audio.setVolumes(settings.music, settings.sfx);

type ScreenName = 'title' | 'pause' | 'over' | 'settings' | 'none';
const screens: Record<Exclude<ScreenName, 'none'>, HTMLElement> = {
  title: $('screen-title'),
  pause: $('screen-pause'),
  over: $('screen-over'),
  settings: $('screen-settings'),
};
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
}

function updateBest(): void {
  $('best-title').textContent = game.best.toLocaleString('fr-FR');
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
      id === 'canyon'
        ? 'linear-gradient(180deg,#5aa2f0 0%,#ffd9a8 45%,#d9824a 46%,#a8552f 75%,#7a3b22 100%)'
        : `url(/res/backdrop-alps-forest.webp)`;
    b.innerHTML = `<i class="thumb" style="background-image:${thumb};${id === 'foret' ? 'filter:hue-rotate(-12deg) saturate(1.2) brightness(0.9)' : ''}"></i>${r.name}<small>${r.subtitle}</small>`;
    b.addEventListener('click', () => {
      settings.region = id as RegionId;
      saveSettings(settings);
      for (const el of box.querySelectorAll('.region-card')) el.classList.toggle('selected', (el as HTMLElement).dataset.region === id);
      game.region = id;
      game.newRun(id);
      game.state = 'title';
      updateBest();
      renderer.render(game, 0, true);
    });
    box.appendChild(b);
  }
}

// ---------------------------------------------------------------- settings screen

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

/** Fullscreen + landscape lock where the platform allows it (Android Chrome, installed PWA). */
async function immersive(): Promise<void> {
  try {
    if (!document.fullscreenElement && document.documentElement.requestFullscreen && matchMedia('(pointer: coarse)').matches) {
      await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
    }
    const o = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> };
    await o.lock?.('landscape');
  } catch {
    /* not supported: the CSS rotate screen covers portrait */
  }
}

function vibrate(ms: number): void {
  if (settings.vibration) navigator.vibrate?.(ms);
}

function start(): void {
  audio.unlock();
  void immersive();
  controls.reset();
  game.newRun(settings.region);
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
  game.newRun(settings.region);
  game.state = 'title';
  updateBest();
  renderer.render(game, 0, true);
  show('title');
}

$('btn-play').addEventListener('click', start);
$('btn-again').addEventListener('click', start);
$('btn-restart').addEventListener('click', start);
$('btn-resume').addEventListener('click', resume);
$('btn-home').addEventListener('click', home);
$('btn-home2').addEventListener('click', home);
$('btn-pause').addEventListener('click', pause);
controls.onPause = () => (game.state === 'paused' ? resume() : pause());
document.addEventListener('visibilitychange', () => {
  if (document.hidden) pause();
});
window.addEventListener('resize', () => renderer.resize());
// Pause automatically when the phone is turned to portrait (the rotate screen covers the game).
matchMedia('(orientation: portrait)').addEventListener('change', (e) => {
  if (e.matches && matchMedia('(pointer: coarse)').matches) pause();
});
window.addEventListener('orientationchange', () => setTimeout(() => renderer.resize(), 200));
// Block the iOS context menu / double-tap zoom on long presses.
document.addEventListener('contextmenu', (e) => e.preventDefault());
// First touch anywhere unlocks audio so the menu music can start.
window.addEventListener('pointerdown', () => audio.unlock(), { once: true });

buildRegions();
bindSettings();
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
updateBest();
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
  if (ev.pickup) audio.pickup(ev.pickup);
  if (ev.landing) {
    audio.landing(ev.landing);
    if (ev.landing > 6) vibrate(40);
  }
  if (ev.crash) {
    audio.crash();
    vibrate(140);
  }
  if (ev.checkpoint) audio.checkpoint();
  if (ev.over) {
    audio.over();
    $('over-title').textContent = game.overReason === 'fuel' ? "PANNE D'ESSENCE !" : 'PILOTE ÉPUISÉ !';
    $('over-distance').textContent = `${Math.round(game.distance).toLocaleString('fr-FR')} m`;
    $('over-time').textContent = formatTime(game.time);
    $('over-best').textContent = `${game.best.toLocaleString('fr-FR')} m`;
    $('over-record').classList.toggle('hidden', !game.newRecord);
    show('over');
  }
  const running = (game.state === 'playing' && game.fuel > 0) || game.state === 'title' || game.state === 'paused';
  audio.engine(game.bike.rpm, game.state === 'playing' ? game.input.throttle : 0, game.bike.speed, running && game.state !== 'paused');
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
if (import.meta.env.DEV) (window as unknown as { __mx: unknown }).__mx = { game, renderer, audio };
