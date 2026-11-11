import { BIKES, bikeById } from '../bikes';
import { CIRCUITS, fmtTime } from '../circuits';
import type { Game } from '../game';
import { DIFFICULTIES, MODES, ModeId } from '../modes';
import { Lobby, Multi, PlayerState, StageResult, StageSettings } from '../net/multi';
import { REGION_ORDER, REGIONS, RegionId } from '../world/regions';
import { WEATHER_ICONS, WEATHER_NAMES } from '../weather';
import type { Difficulty } from '../modes';

const $ = (id: string) => document.getElementById(id)!;

export interface MultiHost {
  game: Game;
  show: (s: 'multi' | 'champ' | 'mpwait' | 'title' | 'none') => void;
  pseudo: () => string;
  bike: () => string;
  /** Start a local run for this stage (spec, tyres… from the profile). */
  startStage: (stage: StageSettings, elapsed: number) => void;
  backToTitle: () => void;
  bank: () => void;
}

/**
 * Multiplayer screens and flow: create / join a room, lobby (players, host settings,
 * championship goal), live standings during a stage, waiting screen, results and general
 * standings after every stage.
 */
export class MultiUI {
  multi: Multi | null = null;
  /** A stage of the championship is being played locally. */
  inStage = false;
  private finished = false;
  private sendT = 0;

  constructor(private h: MultiHost) {
    $('mp-create').addEventListener('click', () => this.create());
    $('mp-join').addEventListener('click', () => this.join());
    $('mp-code-input').addEventListener('keydown', (e) => {
      if ((e as KeyboardEvent).key === 'Enter') this.join();
    });
    $('mp-back').addEventListener('click', () => this.leave());
    $('champ-leave').addEventListener('click', () => this.leave());
    $('champ-next').addEventListener('click', () => this.open());
    $('mpwait-end').addEventListener('click', () => this.multi?.forceEnd());
    $('mp-settings').addEventListener('click', (e) => this.onSettingsClick(e));
    // ?salon=CODE in the address joins directly
    const code = new URLSearchParams(location.search).get('salon');
    if (code) ($('mp-code-input') as HTMLInputElement).value = code.toUpperCase();
  }

  get active(): boolean {
    return !!this.multi;
  }

  open(): void {
    this.h.show('multi');
    this.render();
  }

  private msg(t: string): void {
    $('mp-msg').textContent = t;
  }

  private wire(m: Multi): void {
    m.onLobby = () => {
      this.render();
      // somebody joined during the stage and races too: show them on the track
      if (this.inStage) this.syncRemotes();
    };
    m.onStart = (stage, elapsed) => {
      this.inStage = true;
      this.finished = false;
      this.h.startStage(stage, elapsed);
      this.syncRemotes();
    };
    m.onResults = (r, l) => this.results(r, l);
    m.onClose = (why) => {
      this.multi = null;
      this.inStage = false;
      this.h.backToTitle();
      this.open();
      this.msg(why);
    };
  }

  private async create(): Promise<void> {
    this.msg('Création du salon…');
    const m = new Multi(this.h.pseudo(), this.h.bike());
    this.wire(m);
    try {
      await m.host({ mode: 'course', region: 'alpes', circuit: 1, difficulty: 'facile' });
      this.multi = m;
      this.msg('');
      this.render();
    } catch {
      this.msg('Impossible de créer le salon (connexion ?)');
    }
  }

  private async join(): Promise<void> {
    const code = ($('mp-code-input') as HTMLInputElement).value.trim().toUpperCase();
    if (code.length < 4) return this.msg('Entre le code du salon (5 lettres)');
    this.msg('Connexion au salon ' + code + '…');
    const m = new Multi(this.h.pseudo(), this.h.bike());
    this.wire(m);
    try {
      await m.join(code);
      this.multi = m;
      this.msg('');
      this.render();
    } catch (e) {
      this.msg((e as Error).message);
      m.leave();
    }
  }

  leave(): void {
    this.multi?.leave();
    this.multi = null;
    this.inStage = false;
    this.h.backToTitle();
  }

  // ---------------------------------------------------------------- lobby

  private render(): void {
    const m = this.multi;
    $('mp-home').classList.toggle('hidden', !!m);
    $('mp-lobby').classList.toggle('hidden', !m);
    $('mp-code').classList.toggle('hidden', !m);
    if (!m || !m.lobby) return;
    const L = m.lobby;
    $('mp-code').innerHTML = `SALON <b>${L.code}</b>`;
    const me = m.myId;
    $('mp-players').innerHTML =
      `<h3>Pilotes ${L.players.length}/4</h3>` +
      L.players
        .map((p) => {
          const st = L.standings[p.id];
          const status = p.status === 'spectator' ? 'spectateur · entre à l’épreuve suivante' : p.status === 'racing' ? 'en course' : p.status === 'finished' ? 'arrivé' : 'prêt';
          return `<div class="mp-p${p.id === me ? ' me' : ''}"><i style="background:${p.color}"></i><b>${esc(p.name)}${p.id === L.hostId ? ' <span class="crown">♛</span>' : ''}</b><small>${bikeById(p.bike).name} · ${status}</small>${st ? `<em>${'🏆'.repeat(st.wins)} ${st.points} pts</em>` : ''}</div>`;
        })
        .join('') +
      (L.running ? `<p class="mp-running">Épreuve ${L.stageNo} en cours…</p>${this.liveHtml()}` : '');
    const S = L.next;
    const host = m.isHost;
    const opt = (key: string, val: string | number, label: string, on: boolean) => `<button class="mp-opt${on ? ' on' : ''}" data-k="${key}" data-v="${val}"${host ? '' : ' disabled'}>${label}</button>`;
    $('mp-settings').innerHTML = `
      <h3>${host ? 'Prochaine épreuve (tu choisis)' : 'Prochaine épreuve (choisie par l’hôte)'}</h3>
      <div class="mp-row"><span>Mode</span>${MODES.map((x) => opt('mode', x.id, x.name, S.mode === x.id)).join('')}</div>
      <div class="mp-row"><span>Monde</span>${REGION_ORDER.map((r) => opt('region', r, REGIONS[r].name, S.region === r)).join('')}</div>
      ${S.mode === 'cruising' ? '' : `<div class="mp-row"><span>Circuit</span>${opt('circuit', Math.max(1, S.circuit - 1), '−', false)}<b class="mp-num">${S.circuit}</b>${opt('circuit', Math.min(CIRCUITS, S.circuit + 1), '+', false)}</div>`}
      <div class="mp-row"><span>Difficulté</span>${DIFFICULTIES.map((d, i) => opt('difficulty', d.id, `${WEATHER_ICONS[i]}${d.name} <small>${WEATHER_NAMES[i]}</small>`, S.difficulty === d.id)).join('')}</div>
      <div class="mp-row"><span>Victoires pour gagner</span>${[1, 2, 3, 4, 5].map((n) => opt('wins', n, String(n), L.winsNeeded === n)).join('')}</div>
      ${host ? `<button class="neon-play" id="mp-start"${L.running ? ' disabled' : ''}>${L.champion ? 'NOUVEAU CHAMPIONNAT' : L.stageNo ? `ÉPREUVE ${L.stageNo + 1}` : 'LANCER LE CHAMPIONNAT'}</button>` : '<p class="mp-wait-host">L’hôte lance l’épreuve…</p>'}
      <p class="mp-share">Donne le code <b>${L.code}</b> à tes amis : Multijoueur → Rejoindre.</p>`;
  }

  private onSettingsClick(e: Event): void {
    const m = this.multi;
    if (!m?.isHost) return;
    const t = e.target as HTMLElement;
    if (t.closest('#mp-start')) {
      m.startStage();
      return;
    }
    const b = t.closest<HTMLElement>('.mp-opt');
    if (!b) return;
    const k = b.dataset.k!;
    const v = b.dataset.v!;
    if (k === 'wins') m.setNext({}, Number(v));
    else if (k === 'circuit') m.setNext({ circuit: Number(v) });
    else if (k === 'mode') m.setNext({ mode: v as ModeId });
    else if (k === 'region') m.setNext({ region: v as RegionId });
    else if (k === 'difficulty') m.setNext({ difficulty: v as Difficulty });
  }

  // ---------------------------------------------------------------- in stage

  private syncRemotes(): void {
    const m = this.multi;
    if (!m) return;
    this.h.game.setRemotes(m.lobby.players.filter((p) => p.id !== m.myId && p.status !== 'spectator'));
  }

  /** Called every frame. */
  frame(dt: number): void {
    const m = this.multi;
    if (!m) return;
    m.tick();
    if (!this.inStage) {
      if (!$('screen-multi').classList.contains('hidden') && m.lobby?.running) {
        const el = document.querySelector('.mp-live-lobby');
        if (el) el.outerHTML = this.liveHtml();
      }
      return;
    }
    const g = this.h.game;
    if (g.state === 'playing' && !this.finished) {
      this.sendT += dt;
      if (this.sendT > 1 / 12) {
        m.sendState(g.netState(m.myId), this.sendT);
        this.sendT = 0;
      }
    }
    for (const s of m.states.values()) if (s.id !== m.myId) g.applyRemote(s, dt);
    const panel = $('mp-panel');
    panel.classList.toggle('hidden', g.state !== 'playing');
    if (g.state === 'playing') panel.innerHTML = this.rows().map((r) => `<li class="${r.me ? 'me' : ''}"><i style="background:${r.color}"></i><b>${esc(r.name)}</b><span>${r.info}</span></li>`).join('');
    if (this.finished) $('mpwait-list').innerHTML = this.rows().map((r) => `<li class="${r.me ? 'me' : ''}"><i style="background:${r.color}"></i><b>${esc(r.name)}</b><span>${r.info}</span></li>`).join('');
  }

  /** Live standings rows (positions and gaps, or trial zone / falls / chrono). */
  private rows(): { name: string; color: string; info: string; me: boolean }[] {
    const m = this.multi!;
    const g = this.h.game;
    const mine = g.netState(m.myId);
    const mode = m.lobby.running?.stage.mode ?? g.mode;
    const players = m.lobby.players.filter((p) => p.status !== 'spectator');
    const st = players.map((p) => ({ p, s: p.id === m.myId ? mine : m.states.get(p.id) }));
    if (mode === 'trial')
      return st.map(({ p, s }) => ({ name: p.name, color: p.color, me: p.id === m.myId, info: s ? `${s.fin ? '✓' : `zone ${Math.max(1, s.zone)}`} · ${s.falls} chute${s.falls > 1 ? 's' : ''} · ${fmtTime(s.chrono)}` : '…' }));
    if (mode === 'cruising') return st.sort((a, b) => (b.s?.dist ?? 0) - (a.s?.dist ?? 0)).map(({ p, s }) => ({ name: p.name, color: p.color, me: p.id === m.myId, info: `${Math.round(s?.dist ?? 0).toLocaleString('fr-FR')} m` }));
    const sorted = st.sort((a, b) => (b.s?.x ?? 0) - (a.s?.x ?? 0));
    const lead = sorted[0]?.s;
    return sorted.map(({ p, s }, i) => {
      let info = 'en tête';
      if (s?.fin) info = `arrivé ${fmtTime(s.chrono)}`;
      else if (i > 0 && s && lead) {
        const gap = (lead.x - s.x) / Math.max(6, Math.hypot(lead.vx, lead.vy));
        info = `+${gap.toFixed(1).replace('.', ',')} s`;
      }
      return { name: `${i + 1}. ${p.name}`, color: p.color, me: p.id === m.myId, info };
    });
  }

  private liveHtml(): string {
    const m = this.multi;
    if (!m?.lobby.running) return '<ol class="mp-live mp-live-lobby"></ol>';
    const rows = [...m.states.values()]
      .map((s) => ({ s, p: m.lobby.players.find((q) => q.id === s.id) }))
      .filter((r) => r.p)
      .sort((a, b) => b.s.prog - a.s.prog || b.s.dist - a.s.dist);
    return `<ol class="mp-live mp-live-lobby">${rows.map((r) => `<li><i style="background:${r.p!.color}"></i><b>${esc(r.p!.name)}</b><span>${r.s.fin ? 'arrivé' : Math.round(r.s.prog * 100) + ' %'}</span></li>`).join('')}</ol>`;
  }

  /** The local run ended (finish line, gave up, out of the run). */
  localOver(): void {
    const m = this.multi;
    if (!m || !this.inStage || this.finished) return;
    this.finished = true;
    const g = this.h.game;
    const r = g.result;
    this.h.bank();
    m.finish({ done: r?.reason === 'finish', time: g.chrono, prog: g.circuit ? g.progress : 0, falls: g.falls, dist: g.distance });
    m.sendState(g.netState(m.myId), 1);
    $('mp-panel').classList.add('hidden');
    $('mpwait-end').classList.toggle('hidden', !m.isHost);
    this.h.show('mpwait');
  }

  // ---------------------------------------------------------------- results

  private results(r: StageResult[], L: Lobby): void {
    this.inStage = false;
    this.finished = false;
    this.h.backToTitle();
    const m = this.multi!;
    $('champ-title').textContent = `ÉPREUVE ${L.stageNo} TERMINÉE`;
    $('champ-stage').innerHTML = r.map((x) => `<li class="${x.id === m.myId ? 'me' : ''}"><i style="background:${x.color}"></i><b>${esc(x.name)}</b><span>${x.label}</span><em>${x.points ? '+' + x.points + ' pts' : ''}${x.win ? ' 🏆' : ''}</em></li>`).join('');
    const gen = Object.entries(L.standings).sort((a, b) => b[1].wins - a[1].wins || b[1].points - a[1].points);
    $('champ-general').innerHTML = gen.map(([id, s]) => `<li class="${id === m.myId ? 'me' : ''}"><i style="background:${s.color}"></i><b>${esc(s.name)}</b><span>${'🏆'.repeat(s.wins) || '—'}</span><em>${s.points} pts</em></li>`).join('');
    $('champ-goal').textContent = `Premier à ${L.winsNeeded} victoire${L.winsNeeded > 1 ? 's' : ''} : champion !`;
    const champ = L.champion ? L.standings[L.champion] : null;
    $('champ-banner').classList.toggle('hidden', !champ);
    if (champ) $('champ-banner').innerHTML = `🏆 <b>${esc(champ.name)}</b> remporte le championnat !`;
    $('champ-next').classList.toggle('hidden', !m.isHost);
    $('champ-next').textContent = L.champion ? 'NOUVEAU CHAMPIONNAT' : 'ÉPREUVE SUIVANTE';
    $('champ-wait').classList.toggle('hidden', m.isHost);
    this.h.show('champ');
  }
}

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
}

void BIKES;
void PlayerStateGuard;
function PlayerStateGuard(_: PlayerState): void {}
