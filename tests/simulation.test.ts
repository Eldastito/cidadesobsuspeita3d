/**
 * Simulador de partidas completas — gate da Fase 1 do PRD:
 * partidas automatizadas do início ao fim, sem divergência nem travamento.
 */

import { describe, expect, it } from 'vitest';
import { GameEngine } from '../src/engine/gameEngine.ts';
import { DEFAULT_ROOM_CONFIG, getRecommendedRoles } from '../src/engine/rules.ts';
import { GamePhase, Role, VictoryWinner } from '../src/engine/types.ts';
import { processBotActions } from '../server/botAI.ts';

/** Reproduz as transições do RoomManager, um "tick" por chamada. */
function tick(engine: GameEngine): void {
  processBotActions(engine);

  if (engine.phaseTimeRemaining > 0) {
    engine.phaseTimeRemaining -= 1;
  }

  const shouldAdvance =
    engine.phaseTimeRemaining <= 0 ||
    (engine.phase === GamePhase.ROLE_REVEAL && engine.areAllRolesConfirmed()) ||
    (engine.phase === GamePhase.NIGHT_ACTIONS && engine.allNightActionsSubmitted()) ||
    ((engine.phase === GamePhase.VOTING || engine.phase === GamePhase.RUNOFF) &&
      engine.allVotesSubmitted());

  if (!shouldAdvance) return;

  switch (engine.phase) {
    case GamePhase.ROLE_REVEAL:
      engine.startNight();
      break;
    case GamePhase.NIGHT_ACTIONS:
      engine.resolveNight();
      engine.startDawn();
      break;
    case GamePhase.DAWN:
      if (!engine.checkVictoryCondition()) engine.startDiscussion();
      break;
    case GamePhase.DISCUSSION:
      engine.startVoting();
      break;
    case GamePhase.VOTING:
    case GamePhase.RUNOFF:
      engine.resolveVoting();
      break;
    case GamePhase.MAYOR_TIEBREAK:
      engine.mayorTiebreakTimeout();
      break;
    case GamePhase.DAY_RESOLUTION:
      if (!engine.checkVictoryCondition()) engine.nextRound();
      break;
  }
}

function runFullMatch(playerCount: number, matchIndex: number): GameEngine {
  const engine = new GameEngine(`sim-${matchIndex}`, 'SIMU', {
    ...DEFAULT_ROOM_CONFIG,
    minPlayers: 5,
    maxPlayers: 16,
    rolesCount: getRecommendedRoles(playerCount),
    // Fases curtas para a simulação terminar rápido
    nightDurationSeconds: 6,
    discussionDurationSeconds: 2,
    votingDurationSeconds: 6,
  });

  for (let i = 0; i < playerCount; i++) {
    engine.addPlayer(`bot-${i}`, `sess-${i}`, `Bot ${i}`, 'avatar-1', i === 0, true);
  }

  expect(engine.startMatch()).toBe(true);

  const MAX_TICKS = 5000;
  let ticks = 0;
  while (engine.phase !== GamePhase.FINISHED && ticks < MAX_TICKS) {
    tick(engine);
    ticks++;

    // Invariantes por tick
    const alive = Array.from(engine.players.values()).filter(p => p.isAlive);
    const aliveAssassins = alive.filter(p => p.role === Role.ASSASSINO);
    const phaseNow = engine.phase as GamePhase;
    if (phaseNow !== GamePhase.FINISHED && phaseNow !== GamePhase.DAWN && phaseNow !== GamePhase.DAY_RESOLUTION) {
      // Partida em andamento nunca deveria estar num estado já vencido
      if (engine.winner === null) {
        expect(aliveAssassins.length).toBeGreaterThan(0);
        expect(aliveAssassins.length).toBeLessThan(alive.length);
      }
    }
  }

  expect(ticks).toBeLessThan(MAX_TICKS); // nenhuma partida trava sem transição possível
  expect(engine.phase).toBe(GamePhase.FINISHED);
  expect(engine.winner).not.toBeNull();

  // Coerência do vencedor com o estado final
  const alive = Array.from(engine.players.values()).filter(p => p.isAlive);
  const aliveAssassins = alive.filter(p => p.role === Role.ASSASSINO);
  if (engine.winner === VictoryWinner.TOWN) {
    expect(aliveAssassins).toHaveLength(0);
  } else if (engine.winner === VictoryWinner.ASSASSINS) {
    expect(aliveAssassins.length).toBeGreaterThanOrEqual(alive.length - aliveAssassins.length);
  }

  // Exatamente um MATCH_END na linha do tempo
  expect(engine.timeline.filter(t => t.type === 'MATCH_END')).toHaveLength(1);

  return engine;
}

describe('simulação de partidas completas', () => {
  it('50 partidas com 5 a 12 bots terminam corretamente', () => {
    for (let i = 0; i < 50; i++) {
      const playerCount = 5 + (i % 8); // 5..12
      runFullMatch(playerCount, i);
    }
  }, 60_000);

  it('mortos nunca votam nem agem ao longo da partida', () => {
    const engine = runFullMatch(9, 999);
    // Auditoria pós-jogo: nenhum voto registrado de jogador já morto naquela rodada
    engine.timeline
      .filter(t => t.type === 'ELIMINATION' && t.publicPayload?.votes)
      .forEach(evt => {
        Object.keys(evt.publicPayload.votes).forEach(voterId => {
          const voter = engine.players.get(voterId)!;
          if (voter.deathRound !== undefined) {
            // Quem morreu em rodada anterior não pode ter voto registrado nesta
            expect(voter.deathRound).toBeGreaterThanOrEqual(evt.round);
          }
        });
      });
  });
});
