/**
 * Testes de persistência — serialização do motor (ida e volta) e
 * camada SQLite (salas, histórico, perfis).
 */

import { describe, expect, it } from 'vitest';
import { GameEngine } from '../src/engine/gameEngine.ts';
import { Persistence } from '../server/persistence.ts';
import { DEFAULT_ROOM_CONFIG } from '../src/engine/rules.ts';
import { GamePhase, NightActionType, Role, VictoryWinner } from '../src/engine/types.ts';

function makeRunningMatch(): GameEngine {
  const engine = new GameEngine('room-p', 'PERS', { ...DEFAULT_ROOM_CONFIG, minPlayers: 5 });
  for (let i = 0; i < 6; i++) {
    engine.addPlayer(`p${i}`, `sess-${i}`, `Jogador ${i}`, 'avatar-1', i === 0, i >= 3, i < 3 ? `guest-${i}` : undefined);
    engine.setPlayerReady(`p${i}`, true);
  }
  engine.startMatch();
  // Papéis fixos para determinismo pós-sorteio
  const roles = [Role.ASSASSINO, Role.MEDICO, Role.DETETIVE, Role.CIDADAO, Role.CIDADAO, Role.CIDADAO];
  Array.from(engine.players.values()).forEach((p, i) => {
    p.role = roles[i];
    p.hasConfirmedRole = true;
  });
  engine.startNight();
  engine.submitNightAction({
    playerId: 'p0',
    actionType: NightActionType.KILL,
    targetId: 'p3',
    clientActionId: 'a1',
    timestamp: 1,
  });
  return engine;
}

describe('serialização do motor', () => {
  it('ida e volta preserva o estado e a partida continua', () => {
    const engine = makeRunningMatch();
    const restored = GameEngine.restore(JSON.parse(JSON.stringify(engine.serialize())));

    expect(restored.phase).toBe(GamePhase.NIGHT_ACTIONS);
    expect(restored.roomCode).toBe('PERS');
    expect(restored.players.size).toBe(6);
    expect(restored.players.get('p0')!.role).toBe(Role.ASSASSINO);
    expect(restored.players.get('p0')!.guestId).toBe('guest-0');
    expect(restored.pendingNightActions.get('p0')!.targetId).toBe('p3');
    expect(restored.timeline.length).toBe(engine.timeline.length);

    // Humanos voltam desconectados (sockets antigos morreram); bots ativos
    expect(restored.players.get('p0')!.isConnected).toBe(false);
    expect(restored.players.get('p4')!.isConnected).toBe(true);

    // A partida segue normalmente após a restauração
    const dawn = restored.resolveNight();
    expect(dawn.killedPlayerIds).toEqual(['p3']);
    expect(restored.players.get('p3')!.isAlive).toBe(false);
  });

  it('IDs de eventos da timeline não colidem após restaurar', () => {
    const engine = makeRunningMatch();
    const before = engine.timeline.map(t => t.id);
    const restored = GameEngine.restore(JSON.parse(JSON.stringify(engine.serialize())));
    restored.addTimelineEvent('NIGHT_START', 'Teste', 'Evento pós-restauração');
    const newId = restored.timeline[restored.timeline.length - 1].id;
    expect(before).not.toContain(newId);
  });
});

describe('camada SQLite', () => {
  it('salva, lista e remove salas', () => {
    const db = new Persistence(':memory:');
    db.saveRoom('r1', 'AAAA', '{"x":1}', '[]');
    db.saveRoom('r1', 'AAAA', '{"x":2}', '[]'); // upsert
    db.saveRoom('r2', 'BBBB', '{"y":1}', '[]');

    const rooms = db.loadAllRooms();
    expect(rooms).toHaveLength(2);
    expect(rooms.find(r => r.roomId === 'r1')!.stateJson).toBe('{"x":2}');

    db.deleteRoom('r1');
    expect(db.loadAllRooms()).toHaveLength(1);
    db.close();
  });

  it('registra histórico de partidas em ordem', () => {
    const db = new Persistence(':memory:');
    db.recordMatch({ roomCode: 'AAAA', winner: VictoryWinner.TOWN, playerCount: 6, rounds: 2, players: [] });
    db.recordMatch({ roomCode: 'BBBB', winner: VictoryWinner.ASSASSINS, playerCount: 8, rounds: 3, players: [] });

    const recent = db.recentMatches(5);
    expect(recent).toHaveLength(2);
    expect(recent[0].roomCode).toBe('BBBB'); // mais recente primeiro
    expect(recent[0].winner).toBe(VictoryWinner.ASSASSINS);
    db.close();
  });

  it('acumula estatísticas de perfil por papel', () => {
    const db = new Persistence(':memory:');
    db.recordPlayerResult('g1', 'Aurora', Role.DETETIVE, true);
    db.recordPlayerResult('g1', 'Aurora', Role.ASSASSINO, false);
    db.recordPlayerResult('g1', 'Aurora', Role.DETETIVE, false);

    const profile = db.getProfile('g1')!;
    expect(profile.matchesPlayed).toBe(3);
    expect(profile.wins).toBe(1);
    expect(profile.roleStats[Role.DETETIVE]).toEqual({ played: 2, wins: 1 });
    expect(profile.roleStats[Role.ASSASSINO]).toEqual({ played: 1, wins: 0 });
    expect(db.getProfile('desconhecido')).toBeNull();
    db.close();
  });
});
