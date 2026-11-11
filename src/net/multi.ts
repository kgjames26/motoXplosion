import Peer, { DataConnection, PeerOptions } from 'peerjs';
import type { Difficulty, ModeId } from '../modes';
import type { RegionId } from '../world/regions';

/**
 * Multiplayer, peer to peer (WebRTC through PeerJS). Free: the public PeerJS signalling
 * server only introduces the players; then everything goes directly between browsers.
 *
 * Star topology: the host (who created the room) keeps the authoritative lobby and
 * championship, receives every player's state and relays it to all. Up to 4 players.
 * Anyone may join at any time: during a stage they spectate (or join it if it has just
 * started) and race from the next stage on.
 */

export const MAX_PLAYERS = 4;
export const POINTS = [10, 6, 4, 2];
const PREFIX = 'motoxplosion-v1-';

export interface NetPlayer {
  id: string;
  name: string;
  color: string;
  bike: string;
  /** Outfit bought in solo (worn on the multiplayer bike). */
  outfit: string;
  status: 'lobby' | 'racing' | 'finished' | 'spectator';
}

export interface StageSettings {
  mode: ModeId;
  region: RegionId;
  circuit: number;
  difficulty: Difficulty;
}

/** Compact live state of a rider (sent ~12 times a second). */
export interface PlayerState {
  id: string;
  x: number;
  y: number;
  a: number;
  vx: number;
  vy: number;
  rs: number;
  fs: number;
  rc: number;
  fc: number;
  ra: number;
  fa: number;
  ln: number;
  g: boolean;
  cr: boolean;
  /** 0..1 progress to the finish, chrono (s), trial zone, falls, finished. */
  prog: number;
  chrono: number;
  zone: number;
  falls: number;
  dist: number;
  fin: boolean;
}

export interface FinishInfo {
  done: boolean; // reached the finish line (else gave up)
  time: number;
  prog: number;
  falls: number;
  dist: number;
}

export interface StageResult {
  id: string;
  name: string;
  color: string;
  rank: number;
  label: string;
  points: number;
  win: boolean;
}

export interface Standing {
  name: string;
  color: string;
  points: number;
  wins: number;
}

export interface Lobby {
  code: string;
  hostId: string;
  players: NetPlayer[];
  /** Rounds of the championship (chosen before the first one). */
  rounds: number;
  /** Kept for compatibility (old builds). */
  winsNeeded: number;
  next: StageSettings;
  stageNo: number;
  running: { stage: StageSettings; startedAt: number } | null;
  standings: Record<string, Standing>;
  lastResults: StageResult[] | null;
  champion: string | null;
  /** Places gained (+) or lost (−) in the general standings at the last round. */
  moves: Record<string, number>;
  /** The last round has been played: final standings. */
  final: boolean;
}

type Msg =
  | { t: 'hello'; name: string; color: string; bike: string; outfit?: string }
  | { t: 'full' }
  | { t: 'welcome'; id: string }
  | { t: 'lobby'; lobby: Lobby }
  | { t: 'start'; stage: StageSettings; stageNo: number; elapsed: number }
  | { t: 'state'; s: PlayerState }
  | { t: 'states'; s: PlayerState[] }
  | { t: 'finish'; f: FinishInfo }
  | { t: 'results'; results: StageResult[]; lobby: Lobby }
  | { t: 'profile'; name: string; color: string; bike: string; outfit?: string };

const COLORS = ['#ff6a12', '#14b8ff', '#7ad84a', '#e84a8a'];

function peerOptions(): PeerOptions {
  // dev / tests: ?peer=host:port uses a local PeerServer instead of the public one
  const q = new URLSearchParams(location.search).get('peer');
  const ice = { config: { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }] } };
  if (q) {
    const [host, port] = q.split(':');
    return { host, port: Number(port || 9000), path: '/', secure: false, ...ice };
  }
  return { ...ice };
}

function randomCode(): string {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 5; i++) s += A[Math.floor(Math.random() * A.length)];
  return s;
}

export class Multi {
  peer!: Peer;
  isHost = false;
  myId = '';
  lobby!: Lobby;
  /** Latest states of the other riders. */
  states = new Map<string, PlayerState>();
  private conns = new Map<string, DataConnection>();
  private hostConn: DataConnection | null = null;
  private finishes = new Map<string, FinishInfo>();
  private deadline = 0;
  private relayT = 0;
  private closed = false;

  onLobby: (l: Lobby) => void = () => {};
  onStart: (stage: StageSettings, elapsed: number) => void = () => {};
  onResults: (r: StageResult[], l: Lobby) => void = () => {};
  onClose: (reason: string) => void = () => {};

  constructor(
    public name: string,
    public bike: string,
    public outfit = 'moto',
  ) {}

  get me(): NetPlayer | undefined {
    return this.lobby?.players.find((p) => p.id === this.myId);
  }

  // ---------------------------------------------------------------- set up

  /** Create a room; resolves with its code. */
  host(next: StageSettings): Promise<string> {
    this.isHost = true;
    return new Promise((resolve, reject) => {
      const tryOpen = (attempt: number) => {
        const code = randomCode();
        const peer = new Peer(PREFIX + code, peerOptions());
        peer.on('open', (id) => {
          this.peer = peer;
          this.myId = id;
          this.lobby = {
            code,
            hostId: id,
            players: [{ id, name: this.name, color: COLORS[0], bike: this.bike, outfit: this.outfit, status: 'lobby' }],
            rounds: 3,
            winsNeeded: 99,
            next,
            stageNo: 0,
            running: null,
            standings: {},
            lastResults: null,
            champion: null,
            moves: {},
            final: false,
          };
          peer.on('connection', (c) => this.accept(c));
          this.onLobby(this.lobby);
          resolve(code);
        });
        peer.on('error', (e: { type?: string }) => {
          if (e.type === 'unavailable-id' && attempt < 5) {
            peer.destroy();
            tryOpen(attempt + 1);
          } else if (!this.lobby) reject(new Error(e.type ?? 'réseau'));
        });
      };
      tryOpen(0);
    });
  }

  /** Join a room by its code. */
  join(code: string): Promise<void> {
    this.isHost = false;
    return new Promise((resolve, reject) => {
      const peer = new Peer(peerOptions());
      this.peer = peer;
      let settled = false;
      const fail = (why: string) => {
        if (!settled) {
          settled = true;
          reject(new Error(why));
        }
      };
      peer.on('error', (e: { type?: string }) => fail(e.type === 'peer-unavailable' ? 'Salon introuvable' : 'Connexion impossible'));
      peer.on('open', (id) => {
        this.myId = id;
        const c = peer.connect(PREFIX + code.trim().toUpperCase(), { reliable: true });
        this.hostConn = c;
        c.on('open', () => c.send({ t: 'hello', name: this.name, color: '', bike: this.bike, outfit: this.outfit } satisfies Msg));
        c.on('data', (d) => {
          const m = d as Msg;
          if (m.t === 'full') fail('Salon complet (4 pilotes)');
          if (m.t === 'lobby' && !settled) {
            settled = true;
            resolve();
          }
          this.fromHost(m);
        });
        c.on('close', () => {
          if (!this.closed) this.onClose('L’hôte a quitté le salon');
        });
        setTimeout(() => fail('Pas de réponse du salon'), 12000);
      });
    });
  }

  leave(): void {
    this.closed = true;
    try {
      this.peer?.destroy();
    } catch {
      /* already closed */
    }
  }

  // ---------------------------------------------------------------- host side

  private accept(c: DataConnection): void {
    c.on('data', (d) => this.fromClient(c, d as Msg));
    c.on('close', () => this.drop(c.peer));
    c.on('error', () => this.drop(c.peer));
  }

  private fromClient(c: DataConnection, m: Msg): void {
    const L = this.lobby;
    switch (m.t) {
      case 'hello': {
        if (L.players.length >= MAX_PLAYERS) {
          c.send({ t: 'full' } satisfies Msg);
          setTimeout(() => c.close(), 300);
          return;
        }
        this.conns.set(c.peer, c);
        const used = new Set(L.players.map((p) => p.color));
        const color = COLORS.find((x) => !used.has(x)) ?? COLORS[L.players.length % 4];
        // joining during a stage: in it if it has just started, otherwise spectator
        let status: NetPlayer['status'] = 'lobby';
        const fresh = L.running && Date.now() - L.running.startedAt < 8000;
        if (L.running) status = fresh ? 'racing' : 'spectator';
        L.players.push({ id: c.peer, name: (m.name || 'Pilote').slice(0, 14), color, bike: m.bike, outfit: m.outfit ?? 'moto', status });
        c.send({ t: 'welcome', id: c.peer } satisfies Msg);
        this.broadcastLobby();
        if (L.running && fresh) c.send({ t: 'start', stage: L.running.stage, stageNo: L.stageNo, elapsed: Date.now() - L.running.startedAt } satisfies Msg);
        return;
      }
      case 'profile': {
        const p = L.players.find((q) => q.id === c.peer);
        if (p) {
          p.name = m.name.slice(0, 14);
          p.bike = m.bike;
          p.outfit = m.outfit ?? p.outfit;
          this.broadcastLobby();
        }
        return;
      }
      case 'state':
        this.states.set(c.peer, m.s);
        return;
      case 'finish':
        this.recordFinish(c.peer, m.f);
        return;
    }
  }

  private drop(id: string): void {
    const L = this.lobby;
    this.conns.delete(id);
    this.states.delete(id);
    const i = L.players.findIndex((p) => p.id === id);
    if (i >= 0) L.players.splice(i, 1);
    this.broadcastLobby();
    this.checkStageEnd();
  }

  private send(m: Msg): void {
    for (const c of this.conns.values()) if (c.open) c.send(m);
  }

  private broadcastLobby(): void {
    this.send({ t: 'lobby', lobby: this.lobby });
    this.onLobby(this.lobby);
  }

  /** Host: program the next round; the number of rounds is set before the first one. */
  setNext(next: Partial<StageSettings>, rounds?: number): void {
    if (!this.isHost) return;
    Object.assign(this.lobby.next, next);
    if (rounds && (this.lobby.stageNo === 0 || this.lobby.final)) this.lobby.rounds = rounds;
    if (this.lobby.next.mode === 'cruising') this.lobby.next.mode = 'course'; // no cruising in multiplayer
    this.broadcastLobby();
  }

  /** Host: start the stage with everybody in the room. */
  startStage(): void {
    if (!this.isHost || this.lobby.running) return;
    const L = this.lobby;
    if (L.final) this.resetChampionship();
    L.stageNo++;
    L.running = { stage: { ...L.next }, startedAt: Date.now() };
    L.lastResults = null;
    for (const p of L.players) p.status = 'racing';
    this.finishes.clear();
    this.deadline = 0;
    this.broadcastLobby();
    this.send({ t: 'start', stage: L.running.stage, stageNo: L.stageNo, elapsed: 0 });
    this.onStart(L.running.stage, 0);
  }

  resetChampionship(): void {
    const L = this.lobby;
    L.standings = {};
    L.champion = null;
    L.stageNo = 0;
    L.lastResults = null;
    L.moves = {};
    L.final = false;
  }

  /** Host: end the stage now (cruising, or a rider who never finishes). */
  forceEnd(): void {
    if (this.isHost && this.lobby.running) this.finishStage();
  }

  private recordFinish(id: string, f: FinishInfo): void {
    const L = this.lobby;
    if (!L.running) return;
    this.finishes.set(id, f);
    const p = L.players.find((q) => q.id === id);
    if (p) p.status = 'finished';
    // the others get a little time once someone has crossed the line (not in trial: wait all)
    const mode = L.running.stage.mode;
    if (f.done && !this.deadline && (mode === 'course' || mode === 'enduro')) this.deadline = Date.now() + (mode === 'course' ? 45000 : 60000);
    this.broadcastLobby();
    this.checkStageEnd();
  }

  private checkStageEnd(): void {
    const L = this.lobby;
    if (!L || !L.running || !this.isHost) return;
    const racers = L.players.filter((p) => p.status === 'racing' || p.status === 'finished');
    if (racers.length && racers.every((p) => this.finishes.has(p.id))) this.finishStage();
  }

  /** Host: rank the stage, give points and wins, check for a champion. */
  private finishStage(): void {
    const L = this.lobby;
    if (!L.running) return;
    const mode = L.running.stage.mode;
    const racers = L.players.filter((p) => p.status === 'racing' || p.status === 'finished');
    const info = (p: NetPlayer): FinishInfo => this.finishes.get(p.id) ?? { done: false, time: 0, prog: this.states.get(p.id)?.prog ?? 0, falls: 0, dist: this.states.get(p.id)?.dist ?? 0 };
    const sorted = racers
      .map((p) => ({ p, f: info(p) }))
      .sort((a, b) => {
        if (mode === 'cruising') return b.f.dist - a.f.dist;
        if (a.f.done !== b.f.done) return a.f.done ? -1 : 1;
        if (a.f.done) return a.f.time - b.f.time;
        return b.f.prog - a.f.prog;
      });
    const order = () => Object.entries(L.standings).sort((a, b) => b[1].points - a[1].points || b[1].wins - a[1].wins).map(([id]) => id);
    const before = order();
    const results: StageResult[] = sorted.map(({ p, f }, i) => {
      const scored = mode !== 'cruising' && f.done;
      const points = scored ? POINTS[i] ?? 0 : 0;
      const win = scored && i === 0;
      const s = (L.standings[p.id] ??= { name: p.name, color: p.color, points: 0, wins: 0 });
      s.name = p.name;
      s.points += points;
      if (win) s.wins++;
      const label = mode === 'cruising' ? `${Math.round(f.dist).toLocaleString('fr-FR')} m` : f.done ? fmt(f.time) + (f.falls ? ` · ${f.falls} chute${f.falls > 1 ? 's' : ''}` : '') : 'Abandon';
      return { id: p.id, name: p.name, color: p.color, rank: i + 1, label, points, win };
    });
    // standings movement and, after the last round, the champion
    const after = order();
    L.moves = {};
    after.forEach((id, i) => {
      const was = before.indexOf(id);
      L.moves[id] = was < 0 ? 0 : was - i;
    });
    L.final = L.stageNo >= L.rounds;
    L.champion = L.final ? after[0] ?? null : null;
    L.running = null;
    L.lastResults = results;
    for (const p of L.players) p.status = 'lobby';
    this.send({ t: 'results', results, lobby: L });
    this.onResults(results, L);
    this.onLobby(L);
  }

  // ---------------------------------------------------------------- client side

  private fromHost(m: Msg): void {
    switch (m.t) {
      case 'welcome':
        this.myId = m.id;
        return;
      case 'lobby':
        this.lobby = m.lobby;
        this.onLobby(m.lobby);
        return;
      case 'start':
        this.onStart(m.stage, m.elapsed);
        return;
      case 'states':
        for (const s of m.s) if (s.id !== this.myId) this.states.set(s.id, s);
        return;
      case 'results':
        this.lobby = m.lobby;
        this.onResults(m.results, m.lobby);
        return;
    }
  }

  // ---------------------------------------------------------------- both

  /** My live state (throttled by the caller); the host relays everyone's at ~12 Hz. */
  sendState(s: PlayerState, dt: number): void {
    if (this.isHost) {
      this.states.set(this.myId, s);
      this.relayT += dt;
      if (this.relayT > 1 / 12) {
        this.relayT = 0;
        this.send({ t: 'states', s: [...this.states.values()] });
      }
    } else if (this.hostConn?.open) this.hostConn.send({ t: 'state', s } satisfies Msg);
  }

  finish(f: FinishInfo): void {
    if (this.isHost) this.recordFinish(this.myId, f);
    else this.hostConn?.send({ t: 'finish', f } satisfies Msg);
  }

  updateProfile(name: string, bike: string, outfit = this.outfit): void {
    this.name = name;
    this.bike = bike;
    this.outfit = outfit;
    if (this.isHost) {
      const p = this.me;
      if (p) {
        p.name = name;
        p.bike = bike;
        p.outfit = outfit;
        this.broadcastLobby();
      }
    } else this.hostConn?.send({ t: 'profile', name, color: '', bike, outfit } satisfies Msg);
  }

  /** Host only: when a deadline after the first finisher passes, close the stage. */
  tick(): void {
    if (this.isHost && this.deadline && Date.now() > this.deadline && this.lobby.running) this.finishStage();
  }
}

function fmt(s: number): string {
  const m = Math.floor(s / 60);
  const r = s - m * 60;
  return `${m}:${r.toFixed(1).padStart(4, '0')}`;
}
