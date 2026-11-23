import { VOLUMES, type Card } from './album';

/**
 * v2.83: a sticker shown big. It grows as large as its picture stays sharp (at most 1.35× its own
 * pixels), never past the screen (a margin is always kept). A tap turns it over to read its back
 * (name, volume, description, where it is won); another tap turns it back; tapping outside closes.
 */
const UPSCALE = 1.35;

export function openSticker(card: Card, where: string): void {
  const ov = document.createElement('div');
  ov.className = 'sv-ov';
  ov.innerHTML = `<button class="sv-close" aria-label="Fermer">✕</button>
<div class="sv-card"><div class="sv-inner">
  <div class="sv-face sv-front"><img src="${card.img}" alt="${card.name}" draggable="false"></div>
  <div class="sv-face sv-back"><div class="sv-back-in">
    <small>L’épopée du motocross · Vol. ${card.vol}</small>
    <em>${VOLUMES[card.vol]}</em>
    <b>${card.name}</b>
    <p>${card.bio}</p>
    <i>🏁 ${where}</i>
  </div></div>
</div></div>
<div class="sv-hint">Touche l’autocollant pour le retourner</div>`;
  document.body.appendChild(ov);
  const box = ov.querySelector<HTMLElement>('.sv-card')!;
  const img = ov.querySelector<HTMLImageElement>('.sv-front img')!;

  const fit = (): void => {
    const nw = img.naturalWidth || 360;
    const nh = img.naturalHeight || 340;
    const m = Math.max(22, Math.min(innerWidth, innerHeight) * 0.08);
    const s = Math.min(UPSCALE, (innerWidth - 2 * m) / nw, (innerHeight - 2 * m - 18) / nh);
    box.style.width = `${Math.round(nw * s)}px`;
    box.style.height = `${Math.round(nh * s)}px`;
    box.style.setProperty('--fs', `${Math.max(11, Math.min(nw, nh) * s * 0.055)}px`);
  };
  fit();
  if (!img.complete) img.addEventListener('load', fit, { once: true });
  addEventListener('resize', fit);
  requestAnimationFrame(() => ov.classList.add('in'));

  const close = (): void => {
    removeEventListener('resize', fit);
    ov.classList.remove('in');
    ov.classList.add('out');
    setTimeout(() => ov.remove(), 240);
  };
  ov.addEventListener('click', (e) => {
    e.stopPropagation();
    const t = e.target as HTMLElement;
    if (t.closest('.sv-close') || !t.closest('.sv-card')) close();
    else ov.classList.toggle('flipped');
  });
}
