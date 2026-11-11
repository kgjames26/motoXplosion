import './style.css';
import { Audio } from './audio/audio';
import { Game } from './game';
import { Renderer } from './render/renderer';
import { Controls } from './ui/controls';
import { formatTime, Hud } from './ui/hud';

/**
 * Entry point: wires the game loop, renderer, HUD, controls, screens, audio and PWA.
 */
const $ = (id: string) => document.getElementById(id)!;

const canvas = $('game') as HTMLCanvasElement;
const renderer = new Renderer(canvas);
const game = new Game();
const controls = new Controls();
const hud = new Hud();
const audio = new Audio();

const screens = {
  title: $('screen-title'),
  pause: $('screen-pause'),
  over: $('screen-over'),
};
const hudEl = $('hud');
const controlsEl = $('controls');

function show(which: 'title' | 'pause' | 'over' | 'none'): void {
  for (const [k, el] of Object.entries(screens)) el.classList.toggle('hidden', k !== which);
  const playing = which === 'none' || which === 'pause';
  hudEl.classList.toggle('hidden', !playing);
  controlsEl.classList.toggle('hidden', which !== 'none');
}

function updateBest(): void {
  $('best-title').textContent = game.best.toLocaleString('fr-FR');
}

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

function start(): void {
  audio.unlock();
  void immersive();
  controls.reset();
  game.newRun();
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
  game.newRun();
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
const soundBtn = $('btn-sound');
const refreshSound = () => (soundBtn.textContent = `SON : ${audio.enabled ? 'OUI' : 'NON'}`);
refreshSound();
soundBtn.addEventListener('click', () => {
  audio.setEnabled(!audio.enabled);
  refreshSound();
});
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

updateBest();
show('title');
renderer.render(game, 0, true);

// ---------------------------------------------------------------- loop
let last = performance.now();
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
  if (ev.landing) audio.landing(ev.landing);
  if (ev.crash) {
    audio.crash();
    navigator.vibrate?.(120);
  }
  if (ev.checkpoint) audio.checkpoint();
  if (ev.over) {
    audio.over();
    $('over-title').textContent = game.overReason === 'fuel' ? "PANNE D'ESSENCE !" : 'PILOTE ÉPUISÉ !';
    $('over-distance').textContent = `${Math.round(game.distance).toLocaleString('fr-FR')} m`;
    $('over-time').textContent = formatTime(game.time);
    $('over-best').textContent = `${game.best.toLocaleString('fr-FR')} m`;
    $('over-record').classList.toggle('hidden', Math.round(game.distance) < game.best || game.best === 0);
    show('over');
  }
  const running = game.state === 'playing' && game.fuel > 0;
  audio.engine(game.bike.rpm, game.input.throttle, game.bike.speed, running || game.state === 'title');
  if (game.state !== 'paused') renderer.render(game, dt);
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
if (import.meta.env.DEV) (window as unknown as { __mx: unknown }).__mx = { game, renderer };
