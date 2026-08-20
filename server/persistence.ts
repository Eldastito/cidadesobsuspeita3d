/**
 * Cidade Sob Suspeita 3D — Persistência embutida (SQLite via node:sqlite)
 * Salas em andamento sobrevivem a reinícios do processo; partidas
 * finalizadas viram histórico; perfis de convidados acumulam estatísticas.
 * Decisão e caminho de migração para PostgreSQL: docs/adr/002-persistencia-sqlite.md
 */

import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { Role, VictoryWinner } from '../src/engine/types.ts';

export interface StoredRoom {
  roomId: string;
  roomCode: string;
  stateJson: string;
  chatJson: string;
  updatedAt: number;
}

export interface MatchRecord {
  roomCode: string;
  winner: VictoryWinner;
  playerCount: number;
  rounds: number;
  players: Array<{ nickname: string; role: Role; survived: boolean; isBot: boolean }>;
}

export interface RecentMatch {
  roomCode: string;
  finishedAt: number;
  winner: VictoryWinner;
  playerCount: number;
  rounds: number;
}

export interface GuestProfile {
  guestId: string;
  nickname: string;
  matchesPlayed: number;
  wins: number;
  /** por papel: { ASSASSINO: { played, wins }, ... } */
  roleStats: Partial<Record<Role, { played: number; wins: number }>>;
  /** Moeda cosmética ganha jogando (nunca com dinheiro real). */
  kokolas: number;
  /** Ids de skins/temas comprados. */
  ownedSkins: string[];
}

export interface LeaderboardEntry {
  nickname: string;
  wins: number;
  matchesPlayed: number;
}

export class Persistence {
  private db: DatabaseSync;

  constructor(dbPath: string = process.env.CSS3D_DB_PATH || path.join(process.cwd(), 'data', 'cidade.db')) {
    if (dbPath !== ':memory:') {
      mkdirSync(path.dirname(dbPath), { recursive: true });
    }
    this.db = new DatabaseSync(dbPath);
    this.db.exec('PRAGMA journal_mode = WAL');
    this.migrate();
  }

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS rooms (
        room_id TEXT PRIMARY KEY,
        room_code TEXT NOT NULL,
        state_json TEXT NOT NULL,
        chat_json TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS matches (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        room_code TEXT NOT NULL,
        finished_at INTEGER NOT NULL,
        winner TEXT NOT NULL,
        player_count INTEGER NOT NULL,
        rounds INTEGER NOT NULL,
        players_json TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS profiles (
        guest_id TEXT PRIMARY KEY,
        nickname TEXT NOT NULL,
        matches_played INTEGER NOT NULL DEFAULT 0,
        wins INTEGER NOT NULL DEFAULT 0,
        role_stats_json TEXT NOT NULL DEFAULT '{}',
        updated_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_matches_finished ON matches (finished_at DESC);
    `);

    // Migração aditiva: economia Kokola (colunas novas em bancos antigos)
    const columns = (this.db.prepare(`PRAGMA table_info(profiles)`).all() as Array<Record<string, unknown>>).map(
      c => String(c.name)
    );
    if (!columns.includes('kokolas')) {
      this.db.exec(`ALTER TABLE profiles ADD COLUMN kokolas INTEGER NOT NULL DEFAULT 0`);
    }
    if (!columns.includes('owned_skins_json')) {
      this.db.exec(`ALTER TABLE profiles ADD COLUMN owned_skins_json TEXT NOT NULL DEFAULT '[]'`);
    }
  }

  // ── Salas ────────────────────────────────────────────────────────────────

  public saveRoom(roomId: string, roomCode: string, stateJson: string, chatJson: string): void {
    this.db
      .prepare(
        `INSERT INTO rooms (room_id, room_code, state_json, chat_json, updated_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(room_id) DO UPDATE SET
           room_code = excluded.room_code,
           state_json = excluded.state_json,
           chat_json = excluded.chat_json,
           updated_at = excluded.updated_at`
      )
      .run(roomId, roomCode, stateJson, chatJson, Date.now());
  }

  public deleteRoom(roomId: string): void {
    this.db.prepare('DELETE FROM rooms WHERE room_id = ?').run(roomId);
  }

  public loadAllRooms(): StoredRoom[] {
    const rows = this.db
      .prepare('SELECT room_id, room_code, state_json, chat_json, updated_at FROM rooms')
      .all() as Array<Record<string, unknown>>;
    return rows.map(r => ({
      roomId: String(r.room_id),
      roomCode: String(r.room_code),
      stateJson: String(r.state_json),
      chatJson: String(r.chat_json),
      updatedAt: Number(r.updated_at),
    }));
  }

  // ── Histórico de partidas ────────────────────────────────────────────────

  public recordMatch(record: MatchRecord): void {
    this.db
      .prepare(
        `INSERT INTO matches (room_code, finished_at, winner, player_count, rounds, players_json)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(
        record.roomCode,
        Date.now(),
        record.winner,
        record.playerCount,
        record.rounds,
        JSON.stringify(record.players)
      );
  }

  public recentMatches(limit: number = 5): RecentMatch[] {
    const rows = this.db
      .prepare(
        `SELECT room_code, finished_at, winner, player_count, rounds
         FROM matches ORDER BY finished_at DESC, id DESC LIMIT ?`
      )
      .all(limit) as Array<Record<string, unknown>>;
    return rows.map(r => ({
      roomCode: String(r.room_code),
      finishedAt: Number(r.finished_at),
      winner: String(r.winner) as VictoryWinner,
      playerCount: Number(r.player_count),
      rounds: Number(r.rounds),
    }));
  }

  // ── Perfis de convidados ─────────────────────────────────────────────────

  public recordPlayerResult(guestId: string, nickname: string, role: Role, won: boolean): void {
    const existing = this.getProfile(guestId);
    const roleStats = existing?.roleStats ?? {};
    const entry = roleStats[role] ?? { played: 0, wins: 0 };
    entry.played += 1;
    if (won) entry.wins += 1;
    roleStats[role] = entry;

    this.db
      .prepare(
        `INSERT INTO profiles (guest_id, nickname, matches_played, wins, role_stats_json, updated_at)
         VALUES (?, ?, 1, ?, ?, ?)
         ON CONFLICT(guest_id) DO UPDATE SET
           nickname = excluded.nickname,
           matches_played = profiles.matches_played + 1,
           wins = profiles.wins + ?,
           role_stats_json = excluded.role_stats_json,
           updated_at = excluded.updated_at`
      )
      .run(guestId, nickname, won ? 1 : 0, JSON.stringify(roleStats), Date.now(), won ? 1 : 0);
  }

  public getProfile(guestId: string): GuestProfile | null {
    const row = this.db
      .prepare(
        'SELECT nickname, matches_played, wins, role_stats_json, kokolas, owned_skins_json FROM profiles WHERE guest_id = ?'
      )
      .get(guestId) as Record<string, unknown> | undefined;
    if (!row) return null;
    let roleStats: GuestProfile['roleStats'] = {};
    let ownedSkins: string[] = [];
    try {
      roleStats = JSON.parse(String(row.role_stats_json));
    } catch {
      roleStats = {};
    }
    try {
      ownedSkins = JSON.parse(String(row.owned_skins_json));
    } catch {
      ownedSkins = [];
    }
    return {
      guestId,
      nickname: String(row.nickname),
      matchesPlayed: Number(row.matches_played),
      wins: Number(row.wins),
      roleStats,
      kokolas: Number(row.kokolas ?? 0),
      ownedSkins,
    };
  }

  // ── Economia Kokola (cosmética, ganha jogando) ───────────────────────────

  /** Credita Kokolas — cria o perfil se ainda não existir. */
  public awardKokolas(guestId: string, nickname: string, amount: number): void {
    if (amount <= 0) return;
    this.db
      .prepare(
        `INSERT INTO profiles (guest_id, nickname, matches_played, wins, role_stats_json, kokolas, updated_at)
         VALUES (?, ?, 0, 0, '{}', ?, ?)
         ON CONFLICT(guest_id) DO UPDATE SET
           kokolas = profiles.kokolas + ?,
           updated_at = excluded.updated_at`
      )
      .run(guestId, nickname, amount, Date.now(), amount);
  }

  /**
   * Compra atômica: debita o preço e adiciona o item, apenas se o saldo
   * bastar e o item ainda não for possuído. Retorna o resultado.
   */
  public buySkin(
    guestId: string,
    itemId: string,
    price: number
  ): { ok: boolean; reason?: string; kokolas: number; ownedSkins: string[] } {
    const profile = this.getProfile(guestId);
    if (!profile) {
      return { ok: false, reason: 'Jogue uma partida antes de visitar a loja.', kokolas: 0, ownedSkins: [] };
    }
    if (profile.ownedSkins.includes(itemId)) {
      return { ok: false, reason: 'Você já possui este item.', kokolas: profile.kokolas, ownedSkins: profile.ownedSkins };
    }
    if (profile.kokolas < price) {
      return {
        ok: false,
        reason: `Kokolas insuficientes (faltam ${price - profile.kokolas}). Jogue partidas para ganhar mais!`,
        kokolas: profile.kokolas,
        ownedSkins: profile.ownedSkins,
      };
    }

    const newOwned = [...profile.ownedSkins, itemId];
    // Débito condicionado ao saldo no próprio UPDATE (atômico no SQLite)
    const result = this.db
      .prepare(
        `UPDATE profiles SET kokolas = kokolas - ?, owned_skins_json = ?, updated_at = ?
         WHERE guest_id = ? AND kokolas >= ?`
      )
      .run(price, JSON.stringify(newOwned), Date.now(), guestId, price);
    if (Number(result.changes) === 0) {
      return { ok: false, reason: 'Saldo mudou durante a compra — tente de novo.', kokolas: profile.kokolas, ownedSkins: profile.ownedSkins };
    }
    return { ok: true, kokolas: profile.kokolas - price, ownedSkins: newOwned };
  }

  /** Ranking da vila: mais vitórias primeiro; desempate por menos partidas. */
  public leaderboard(limit: number = 10): LeaderboardEntry[] {
    const rows = this.db
      .prepare(
        `SELECT nickname, wins, matches_played FROM profiles
         WHERE matches_played > 0
         ORDER BY wins DESC, matches_played ASC, updated_at DESC LIMIT ?`
      )
      .all(limit) as Array<Record<string, unknown>>;
    return rows.map(r => ({
      nickname: String(r.nickname),
      wins: Number(r.wins),
      matchesPlayed: Number(r.matches_played),
    }));
  }

  public close(): void {
    this.db.close();
  }
}
