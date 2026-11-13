/**
 * Loading screen. Its markup and CSS live in index.html (inline), so it is on screen before any
 * script or stylesheet has arrived; this module only moves the bar and takes the screen away.
 */
const el = document.getElementById('boot');
let shown = 0.08;

function say(text: string): void {
  const t = el?.querySelector('.boot-msg-t');
  if (t) t.textContent = text;
}

/** Progress 0..1 (never goes back) and, optionally, the line shown under the bar. */
export function bootProgress(p: number, text?: string): void {
  if (!el) return;
  shown = Math.max(shown, Math.min(1, p));
  el.style.setProperty('--p', String(shown));
  if (text) say(text);
}

/** Something went wrong: say so and offer to try again. */
export function bootFail(text: string): void {
  if (!el) return;
  el.classList.add('fail');
  say(text);
}

/** Fill the bar, fade the screen out and remove it. Resolves as the fade starts. */
export function bootDone(): Promise<void> {
  return new Promise((resolve) => {
    if (!el) return resolve();
    bootProgress(1, 'C’est parti !');
    window.setTimeout(() => {
      el.classList.add('out');
      window.setTimeout(() => el.remove(), 800);
      resolve();
    }, 320);
  });
}

/** Best effort: the image is fetched and decoded; never rejects (a missing poster must not block the game). */
export function preloadImage(src: string): Promise<void> {
  return new Promise((resolve) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => (img.decode ? img.decode().catch(() => {}).then(() => resolve()) : resolve());
    img.onerror = () => resolve();
    img.src = src;
  });
}
