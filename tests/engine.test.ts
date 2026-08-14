/**
 * Testes do motor de regras — Cidade Sob Suspeita 3D
 * Cobre papéis, cargas, empates, vitória e invariantes de sigilo (PRD 14.1).
 */

import { describe, expect, it, beforeEach } from 'vitest';
import { GameEngine } from '../src/engine/gameEngine.ts';
import { DEFAULT_ROOM_CONFIG, validateComposition } from '../src/engine/rules.ts';
import {
  GamePhase,
  NightActionType,
  Role,
  RoomConfig,
  VictoryWinner,
  VotingMode,
  VotingOutcome,
} from '../src/engine/types.ts';

let fakeNow = 1_000_000;
const nowFn = () => (fakeNow += 1);

function makeEngine(config: Partial<RoomConfig> = {}): GameEngine {
  const merged: RoomConfig = {
    ...DEFAULT_ROOM_CONFIG,
    ...config,
    rolesCount: { ...DEFAULT_ROOM_CONFIG.rolesCount, ...(config.rolesCount || {}) },
  };
  return new GameEngine('room-test', 'ABCD', merged, nowFn);
}

/** Cria engine com papéis fixos (sem sorteio) para testes determinísticos. */
function makeFixedMatch(roles: Role[], opts: { mayorIndex?: number; config?: Partial<RoomConfig> } = {}) {
  const engine = makeEngine({
    minPlayers: roles.length,
    maxPlayers: 16,
    ...opts.config,
  });
  roles.forEach((role, i) => {
    const p = engine.addPlayer(`p${i}`, `sess-p${i}`, `Jogador ${i}`, 'avatar-1', i === 0, false);
    p.isReady = true;
  });
  // Força papéis conhecidos, sem passar pelo sorteio
  roles.forEach((role, i) => {
    const p = engine.players.get(`p${i}`)!;
    p.role = role;
    p.isAlive = true;
    p.hasConfirmedRole = true;
    p.isMayor = opts.mayorIndex === i;
  });
  engine.roundNumber = 1;
  engine.phase = GamePhase.NIGHT_ACTIONS;
  engine.phaseTimeRemaining = 30;
  return engine;
}

function night(engine: GameEngine, playerId: string, actionType: NightActionType, targetId?: string) {
  return engine.submitNightAction({
    playerId,
    actionType,
    targetId,
    clientActionId: `act-${playerId}-${Math.random()}`,
    timestamp: nowFn(),
  });
}

describe('composição e sorteio', () => {
  it('rejeita composição com assassinos em maioria', () => {
    expect(
      validateComposition(6, { assassins: 3, doctor: 1, detective: 1, witch: 0, bodyguard: 0, mayor: 0 }).valid
    ).toBe(false);
    expect(
      validateComposition(7, { assassins: 3, doctor: 1, detective: 1, witch: 0, bodyguard: 0, mayor: 0 }).valid
    ).toBe(true);
  });

  it('distribui exatamente os papéis configurados', () => {
    const engine = makeEngine({
      minPlayers: 6,
      rolesCount: { assassins: 1, doctor: 1, detective: 1, witch: 1, bodyguard: 0, mayor: 1 },
    });
    for (let i = 0; i < 8; i++) {
      const p = engine.addPlayer(`p${i}`, `s${i}`, `J${i}`, 'avatar-1', i === 0);
      p.isReady = true;
    }
    expect(engine.startMatch()).toBe(true);

    const roles = Array.from(engine.players.values()).map(p => p.role);
    expect(roles.filter(r => r === Role.ASSASSINO)).toHaveLength(1);
    expect(roles.filter(r => r === Role.MEDICO)).toHaveLength(1);
    expect(roles.filter(r => r === Role.DETETIVE)).toHaveLength(1);
    expect(roles.filter(r => r === Role.BRUXA)).toHaveLength(1);
    expect(roles.filter(r => r === Role.CIDADAO)).toHaveLength(4);

    // Prefeito nunca é assassino
    const mayor = Array.from(engine.players.values()).find(p => p.isMayor);
    expect(mayor).toBeDefined();
    expect(mayor!.role).not.toBe(Role.ASSASSINO);
    expect(engine.phase).toBe(GamePhase.ROLE_REVEAL);
  });
});

describe('resolução da noite (PRD 3.5)', () => {
  it('assassino mata alvo desprotegido', () => {
    const engine = makeFixedMatch([Role.ASSASSINO, Role.MEDICO, Role.CIDADAO, Role.CIDADAO, Role.CIDADAO]);
    night(engine, 'p0', NightActionType.KILL, 'p2');
    night(engine, 'p1', NightActionType.HEAL, 'p3');

    const dawn = engine.resolveNight();
    expect(dawn.killedPlayerIds).toEqual(['p2']);
    expect(engine.players.get('p2')!.isAlive).toBe(false);
    expect(engine.players.get('p2')!.deathReason).toBe('ASSASSIN_ATTACK');
  });

  it('médico bloqueia o ataque dos assassinos', () => {
    const engine = makeFixedMatch([Role.ASSASSINO, Role.MEDICO, Role.CIDADAO, Role.CIDADAO, Role.CIDADAO]);
    night(engine, 'p0', NightActionType.KILL, 'p2');
    night(engine, 'p1', NightActionType.HEAL, 'p2');

    const dawn = engine.resolveNight();
    expect(dawn.killedPlayerIds).toHaveLength(0);
    expect(engine.players.get('p2')!.isAlive).toBe(true);
  });

  it('proteção coletiva da bruxa cancela o ataque e consome a carga', () => {
    const engine = makeFixedMatch([Role.ASSASSINO, Role.BRUXA, Role.CIDADAO, Role.CIDADAO, Role.CIDADAO]);
    night(engine, 'p0', NightActionType.KILL, 'p2');
    night(engine, 'p1', NightActionType.WITCH_PROTECT_ALL);

    const dawn = engine.resolveNight();
    expect(dawn.killedPlayerIds).toHaveLength(0);
    expect(engine.players.get('p1')!.witchCharges.hasProtectAllPotion).toBe(false);
  });

  it('poção da bruxa ignora o médico e permite duas mortes na mesma noite', () => {
    const engine = makeFixedMatch([
      Role.ASSASSINO,
      Role.BRUXA,
      Role.MEDICO,
      Role.CIDADAO,
      Role.CIDADAO,
      Role.CIDADAO,
      Role.CIDADAO,
    ]);
    night(engine, 'p0', NightActionType.KILL, 'p3');
    night(engine, 'p1', NightActionType.WITCH_KILL, 'p4');
    night(engine, 'p2', NightActionType.HEAL, 'p4'); // médico tenta salvar o alvo da bruxa: não bloqueia

    const dawn = engine.resolveNight();
    expect(dawn.killedPlayerIds.sort()).toEqual(['p3', 'p4']);
    expect(engine.players.get('p4')!.deathReason).toBe('WITCH_POTION');
    expect(engine.players.get('p1')!.witchCharges.hasKillPotion).toBe(false);
  });

  it('bruxa matando o mesmo alvo dos assassinos gera uma única morte', () => {
    const engine = makeFixedMatch([Role.ASSASSINO, Role.BRUXA, Role.CIDADAO, Role.CIDADAO, Role.CIDADAO]);
    night(engine, 'p0', NightActionType.KILL, 'p2');
    night(engine, 'p1', NightActionType.WITCH_KILL, 'p2');

    const dawn = engine.resolveNight();
    expect(dawn.killedPlayerIds).toEqual(['p2']);
    expect(dawn.deaths).toHaveLength(1);
  });

  it('detetive recebe suspeito/não suspeito no caderno privado', () => {
    const engine = makeFixedMatch([Role.ASSASSINO, Role.DETETIVE, Role.CIDADAO, Role.CIDADAO, Role.CIDADAO]);
    night(engine, 'p1', NightActionType.INVESTIGATE, 'p0');
    engine.resolveNight();

    const log = engine.players.get('p1')!.investigationLog;
    expect(log).toHaveLength(1);
    expect(log[0].isSuspicious).toBe(true);

    engine.roundNumber = 2;
    engine.startNight();
    night(engine, 'p1', NightActionType.INVESTIGATE, 'p2');
    engine.resolveNight();
    expect(engine.players.get('p1')!.investigationLog[1].isSuspicious).toBe(false);
  });

  it('reenvio da mesma ação não duplica efeito (idempotência)', () => {
    const engine = makeFixedMatch([Role.ASSASSINO, Role.MEDICO, Role.CIDADAO, Role.CIDADAO, Role.CIDADAO]);
    night(engine, 'p0', NightActionType.KILL, 'p2');
    night(engine, 'p0', NightActionType.KILL, 'p2');
    night(engine, 'p0', NightActionType.KILL, 'p3'); // troca de alvo substitui

    const dawn = engine.resolveNight();
    expect(dawn.killedPlayerIds).toEqual(['p3']);
    expect(dawn.deaths).toHaveLength(1);
  });
});

describe('validações de habilidades', () => {
  let engine: GameEngine;
  beforeEach(() => {
    engine = makeFixedMatch([Role.ASSASSINO, Role.MEDICO, Role.DETETIVE, Role.BRUXA, Role.CIDADAO, Role.CIDADAO]);
  });

  it('morto não age nem vota', () => {
    engine.players.get('p4')!.isAlive = false;
    expect(night(engine, 'p4', NightActionType.OBSERVE, 'p0').accepted).toBe(false);

    engine.phase = GamePhase.VOTING;
    expect(engine.submitVote('p4', 'p0').accepted).toBe(false);
  });

  it('assassino não ataca comparsa', () => {
    const e2 = makeFixedMatch([Role.ASSASSINO, Role.ASSASSINO, Role.CIDADAO, Role.CIDADAO, Role.CIDADAO]);
    expect(night(e2, 'p0', NightActionType.KILL, 'p1').accepted).toBe(false);
  });

  it('médico: autoproteção única e sem repetir alvo', () => {
    expect(night(engine, 'p1', NightActionType.HEAL, 'p1').accepted).toBe(true);
    engine.resolveNight();
    expect(engine.players.get('p1')!.doctorSelfHealUsed).toBe(true);

    engine.startNight();
    // repetir o próprio alvo da noite anterior é proibido; e autoproteção já foi usada
    expect(night(engine, 'p1', NightActionType.HEAL, 'p1').accepted).toBe(false);
    expect(night(engine, 'p1', NightActionType.HEAL, 'p2').accepted).toBe(true);
    engine.resolveNight();

    engine.startNight();
    expect(night(engine, 'p1', NightActionType.HEAL, 'p2').accepted).toBe(false); // consecutivo
    expect(night(engine, 'p1', NightActionType.HEAL, 'p4').accepted).toBe(true);
  });

  it('bruxa não usa carga já consumida nem mata a si mesma', () => {
    expect(night(engine, 'p3', NightActionType.WITCH_KILL, 'p3').accepted).toBe(false);
    expect(night(engine, 'p3', NightActionType.WITCH_KILL, 'p4').accepted).toBe(true);
    engine.resolveNight();

    engine.startNight();
    expect(night(engine, 'p3', NightActionType.WITCH_KILL, 'p5').accepted).toBe(false);
    expect(night(engine, 'p3', NightActionType.WITCH_PROTECT_ALL).accepted).toBe(true);
    engine.resolveNight();

    engine.startNight();
    expect(night(engine, 'p3', NightActionType.WITCH_PROTECT_ALL).accepted).toBe(false);
  });

  it('cidadão registra palpite privado sem efeito mecânico', () => {
    expect(night(engine, 'p4', NightActionType.OBSERVE, 'p0').accepted).toBe(true);
    const dawn = engine.resolveNight();
    expect(dawn.killedPlayerIds).toHaveLength(0);
    expect(engine.players.get('p4')!.hunchLog).toHaveLength(1);
    expect(engine.players.get('p4')!.hunchLog[0].targetId).toBe('p0');
  });
});

describe('votação, empates e desempates (PRD 3.4)', () => {
  function toVoting(engine: GameEngine) {
    engine.phase = GamePhase.VOTING;
    engine.phaseTimeRemaining = 30;
  }

  it('maioria simples elimina e revela resultado só na apuração', () => {
    const engine = makeFixedMatch([Role.ASSASSINO, Role.CIDADAO, Role.CIDADAO, Role.CIDADAO, Role.CIDADAO]);
    toVoting(engine);
    engine.submitVote('p1', 'p0');
    engine.submitVote('p2', 'p0');
    engine.submitVote('p3', 'p0');
    engine.submitVote('p0', 'p1');
    engine.submitVote('p4', null); // abstenção

    const summary = engine.resolveVoting();
    expect(summary.outcome).toBe(VotingOutcome.ELIMINATED);
    expect(summary.eliminatedPlayerId).toBe('p0');
    expect(engine.players.get('p0')!.isAlive).toBe(false);
    expect(engine.phase).toBe(GamePhase.DAY_RESOLUTION);
  });

  it('empate sem prefeito abre segundo turno restrito aos empatados', () => {
    const engine = makeFixedMatch(
      [Role.ASSASSINO, Role.CIDADAO, Role.CIDADAO, Role.CIDADAO, Role.CIDADAO, Role.CIDADAO],
      { config: { enableMayorTiebreak: false } }
    );
    toVoting(engine);
    engine.submitVote('p0', 'p1');
    engine.submitVote('p2', 'p1');
    engine.submitVote('p1', 'p0');
    engine.submitVote('p3', 'p0');

    const summary = engine.resolveVoting();
    expect(summary.outcome).toBe(VotingOutcome.TIE_RUNOFF);
    expect(engine.phase).toBe(GamePhase.RUNOFF);
    expect(engine.tieCandidateIds.sort()).toEqual(['p0', 'p1']);

    // Voto fora dos empatados é rejeitado
    expect(engine.submitVote('p2', 'p3').accepted).toBe(false);
    expect(engine.submitVote('p2', 'p0').accepted).toBe(true);

    engine.submitVote('p1', 'p0');
    engine.submitVote('p3', 'p0');
    const runoffSummary = engine.resolveVoting();
    expect(runoffSummary.outcome).toBe(VotingOutcome.ELIMINATED);
    expect(runoffSummary.eliminatedPlayerId).toBe('p0');
    expect(runoffSummary.wasRunoff).toBe(true);
  });

  it('empate persistindo no segundo turno ninguém é eliminado', () => {
    const engine = makeFixedMatch(
      [Role.ASSASSINO, Role.CIDADAO, Role.CIDADAO, Role.CIDADAO, Role.CIDADAO, Role.CIDADAO],
      { config: { enableMayorTiebreak: false } }
    );
    toVoting(engine);
    engine.submitVote('p2', 'p0');
    engine.submitVote('p3', 'p1');
    engine.resolveVoting();
    expect(engine.phase).toBe(GamePhase.RUNOFF);

    engine.submitVote('p2', 'p0');
    engine.submitVote('p3', 'p1');
    const summary = engine.resolveVoting();
    expect(summary.outcome).toBe(VotingOutcome.NO_ELIMINATION);
    expect(engine.players.get('p0')!.isAlive).toBe(true);
    expect(engine.players.get('p1')!.isAlive).toBe(true);
  });

  it('empate com prefeito vivo vai para voto de minerva', () => {
    const engine = makeFixedMatch(
      [Role.ASSASSINO, Role.CIDADAO, Role.CIDADAO, Role.CIDADAO, Role.CIDADAO, Role.CIDADAO],
      { mayorIndex: 5 }
    );
    toVoting(engine);
    engine.submitVote('p2', 'p0');
    engine.submitVote('p3', 'p1');

    const summary = engine.resolveVoting();
    expect(summary.outcome).toBe(VotingOutcome.TIE_MAYOR);
    expect(engine.phase).toBe(GamePhase.MAYOR_TIEBREAK);

    // Só o prefeito decide, e apenas entre os empatados
    expect(engine.submitMayorTiebreak('p2', 'p0').accepted).toBe(false);
    expect(engine.submitMayorTiebreak('p5', 'p3').accepted).toBe(false);
    expect(engine.submitMayorTiebreak('p5', 'p0').accepted).toBe(true);

    expect(engine.players.get('p0')!.isAlive).toBe(false);
    expect(engine.lastVotingSummary!.mayorDecided).toBe(true);
    expect(engine.phase).toBe(GamePhase.DAY_RESOLUTION);
  });

  it('prefeito omisso no desempate → segundo turno automático', () => {
    const engine = makeFixedMatch(
      [Role.ASSASSINO, Role.CIDADAO, Role.CIDADAO, Role.CIDADAO, Role.CIDADAO, Role.CIDADAO],
      { mayorIndex: 5 }
    );
    toVoting(engine);
    engine.submitVote('p2', 'p0');
    engine.submitVote('p3', 'p1');
    engine.resolveVoting();
    expect(engine.phase).toBe(GamePhase.MAYOR_TIEBREAK);

    engine.mayorTiebreakTimeout();
    expect(engine.phase).toBe(GamePhase.RUNOFF);
    expect(engine.tieCandidateIds.sort()).toEqual(['p0', 'p1']);
  });
});

describe('votação sequencial (modo do vídeo)', () => {
  function makeSequentialMatch() {
    // p0..p4 em assentos 0..4; p0 assassino
    return makeFixedMatch(
      [Role.ASSASSINO, Role.CIDADAO, Role.CIDADAO, Role.CIDADAO, Role.CIDADAO],
      { config: { votingMode: VotingMode.SEQUENTIAL, enableMayorTiebreak: false } }
    );
  }

  it('vota em ordem de assentos, um por vez, com voto público e definitivo', () => {
    const engine = makeSequentialMatch();
    engine.startVoting();

    expect(engine.isSequentialVoting()).toBe(true);
    expect(engine.currentVoterId).toBe('p0');

    // Fora da vez é rejeitado
    expect(engine.submitVote('p1', 'p0').accepted).toBe(false);

    // p0 vota; o voto fica público no snapshot e a vez avança
    expect(engine.submitVote('p0', 'p1').accepted).toBe(true);
    expect(engine.currentVoterId).toBe('p1');
    const snap = engine.getPrivateSnapshot('p2')!;
    expect(snap.room.players.find(p => p.id === 'p0')!.votedTargetId).toBe('p1');
    expect(snap.room.currentVoterId).toBe('p1');

    // Voto declarado não pode ser mudado
    expect(engine.submitVote('p0', 'p2').accepted).toBe(false);
  });

  it('timeout do turno vira abstenção pública e a fila termina na apuração', () => {
    const engine = makeSequentialMatch();
    engine.startVoting();

    engine.submitVote('p0', 'p1');
    engine.voteTurnTimeout(); // p1 dormiu no ponto
    expect(engine.pendingVotes.get('p1')).toBeNull();
    expect(engine.currentVoterId).toBe('p2');

    engine.submitVote('p2', 'p0');
    engine.submitVote('p3', 'p0');
    engine.submitVote('p4', 'p0');
    expect(engine.allVotesSubmitted()).toBe(true);

    const summary = engine.resolveVoting();
    expect(summary.outcome).toBe(VotingOutcome.ELIMINATED);
    expect(summary.eliminatedPlayerId).toBe('p0');
  });

  it('segundo turno também é sequencial e restrito aos empatados', () => {
    const engine = makeSequentialMatch();
    engine.startVoting();
    engine.submitVote('p0', 'p1');
    engine.submitVote('p1', 'p0');
    engine.submitVote('p2', 'p0');
    engine.submitVote('p3', 'p1');
    engine.voteTurnTimeout(); // p4 abstém

    const summary = engine.resolveVoting();
    expect(summary.outcome).toBe(VotingOutcome.TIE_RUNOFF);
    expect(engine.phase).toBe(GamePhase.RUNOFF);
    expect(engine.isSequentialVoting()).toBe(true);
    expect(engine.currentVoterId).toBe('p0');

    expect(engine.submitVote('p0', 'p2').accepted).toBe(false); // fora dos empatados
    expect(engine.submitVote('p0', 'p1').accepted).toBe(true);
  });

  it('votos alheios continuam ocultos no modo secreto', () => {
    const engine = makeFixedMatch([Role.ASSASSINO, Role.CIDADAO, Role.CIDADAO, Role.CIDADAO, Role.CIDADAO]);
    engine.startVoting();
    engine.submitVote('p0', 'p1');
    const snap = engine.getPrivateSnapshot('p2')!;
    expect(snap.room.players.find(p => p.id === 'p0')!.votedTargetId).toBeUndefined();
    expect(snap.room.currentVoterId).toBeNull();
  });
});

describe('condições de vitória', () => {
  it('cidade vence se e somente se não houver assassino vivo', () => {
    const engine = makeFixedMatch([Role.ASSASSINO, Role.CIDADAO, Role.CIDADAO, Role.CIDADAO, Role.CIDADAO]);
    expect(engine.checkVictoryCondition()).toBe(false);

    engine.players.get('p0')!.isAlive = false;
    expect(engine.checkVictoryCondition()).toBe(true);
    expect(engine.winner).toBe(VictoryWinner.TOWN);
    expect(engine.phase).toBe(GamePhase.FINISHED);
  });

  it('assassinos vencem ao igualar a cidade viva', () => {
    const engine = makeFixedMatch([Role.ASSASSINO, Role.CIDADAO, Role.CIDADAO, Role.CIDADAO, Role.CIDADAO]);
    engine.players.get('p1')!.isAlive = false;
    engine.players.get('p2')!.isAlive = false;
    engine.players.get('p3')!.isAlive = false;
    expect(engine.checkVictoryCondition()).toBe(true);
    expect(engine.winner).toBe(VictoryWinner.ASSASSINS);
  });

  it('checagem de vitória é idempotente e registra MATCH_END uma única vez', () => {
    const engine = makeFixedMatch([Role.ASSASSINO, Role.CIDADAO, Role.CIDADAO, Role.CIDADAO, Role.CIDADAO]);
    engine.players.get('p0')!.isAlive = false;
    engine.checkVictoryCondition();
    engine.checkVictoryCondition();
    engine.checkVictoryCondition();

    const ends = engine.timeline.filter(t => t.type === 'MATCH_END');
    expect(ends).toHaveLength(1);
  });
});

describe('sigilo dos snapshots (PRD 9.3)', () => {
  it('nenhum snapshot contém papel ou ação secreta de terceiros', () => {
    const engine = makeFixedMatch([
      Role.ASSASSINO,
      Role.MEDICO,
      Role.DETETIVE,
      Role.BRUXA,
      Role.CIDADAO,
      Role.CIDADAO,
    ]);
    night(engine, 'p0', NightActionType.KILL, 'p4');
    night(engine, 'p1', NightActionType.HEAL, 'p4');

    for (const viewerId of ['p1', 'p2', 'p3', 'p4', 'p5']) {
      const snap = engine.getPrivateSnapshot(viewerId)!;
      const serialized = JSON.stringify(snap);

      // Papéis alheios nunca aparecem na visão pública
      snap.room.players.forEach(pub => {
        expect((pub as any).role).toBeUndefined();
        expect(pub.revealedRole).toBeUndefined(); // ninguém morto/config off
      });

      // A ação pendente do assassino não vaza para outros
      if (viewerId !== 'p0') {
        expect(serialized).not.toContain('"KILL"');
      }
      // Eventos secretos da timeline não vazam antes do fim
      snap.room.timeline.forEach(evt => expect(evt.secretPayload).toBeUndefined());
    }
  });

  it('assassinos conhecem os comparsas, e apenas eles', () => {
    const engine = makeFixedMatch([Role.ASSASSINO, Role.ASSASSINO, Role.CIDADAO, Role.CIDADAO, Role.CIDADAO]);
    expect(engine.getPrivateSnapshot('p0')!.player.fellowAssassinIds).toEqual(['p1']);
    expect(engine.getPrivateSnapshot('p2')!.player.fellowAssassinIds).toBeUndefined();
  });

  it('todos os papéis são revelados apenas em FINISHED', () => {
    const engine = makeFixedMatch([Role.ASSASSINO, Role.CIDADAO, Role.CIDADAO, Role.CIDADAO, Role.CIDADAO]);
    expect(engine.getPrivateSnapshot('p1')!.room.allRolesRevealed).toBeUndefined();

    engine.players.get('p0')!.isAlive = false;
    engine.checkVictoryCondition();
    const finalSnap = engine.getPrivateSnapshot('p1')!;
    expect(finalSnap.room.allRolesRevealed).toBeDefined();
    expect(finalSnap.room.allRolesRevealed!['p0']).toBe(Role.ASSASSINO);
  });
});

describe('Guarda-costas (expansão da Fase 5)', () => {
  it('morre no lugar da vítima escoltada', () => {
    const engine = makeFixedMatch([Role.ASSASSINO, Role.GUARDA, Role.CIDADAO, Role.CIDADAO, Role.CIDADAO]);
    night(engine, 'p0', NightActionType.KILL, 'p2');
    night(engine, 'p1', NightActionType.BODYGUARD, 'p2');

    const dawn = engine.resolveNight();
    expect(dawn.killedPlayerIds).toEqual(['p1']);
    expect(engine.players.get('p1')!.deathReason).toBe('BODYGUARD_SACRIFICE');
    expect(engine.players.get('p2')!.isAlive).toBe(true);
  });

  it('não intercepta quando o médico já bloqueou o ataque', () => {
    const engine = makeFixedMatch([
      Role.ASSASSINO,
      Role.GUARDA,
      Role.MEDICO,
      Role.CIDADAO,
      Role.CIDADAO,
    ]);
    night(engine, 'p0', NightActionType.KILL, 'p3');
    night(engine, 'p2', NightActionType.HEAL, 'p3');
    night(engine, 'p1', NightActionType.BODYGUARD, 'p3');

    const dawn = engine.resolveNight();
    expect(dawn.killedPlayerIds).toHaveLength(0);
    expect(engine.players.get('p1')!.isAlive).toBe(true);
  });

  it('não escolta a si mesmo e morre normalmente se for o alvo direto', () => {
    const engine = makeFixedMatch([Role.ASSASSINO, Role.GUARDA, Role.CIDADAO, Role.CIDADAO, Role.CIDADAO]);
    expect(night(engine, 'p1', NightActionType.BODYGUARD, 'p1').accepted).toBe(false);

    night(engine, 'p1', NightActionType.BODYGUARD, 'p2');
    night(engine, 'p0', NightActionType.KILL, 'p1'); // atacam o próprio guarda
    const dawn = engine.resolveNight();
    expect(dawn.killedPlayerIds).toEqual(['p1']);
    expect(engine.players.get('p1')!.deathReason).toBe('ASSASSIN_ATTACK');
  });
});

describe('herança de papel (modo personalizado da Fase 5)', () => {
  function makeInheritanceMatch(roles: Role[]) {
    return makeFixedMatch(roles, { config: { roleInheritance: true } });
  }

  it('cidadão sorteado herda o papel do médico morto e age na noite seguinte', () => {
    const engine = makeInheritanceMatch([
      Role.ASSASSINO,
      Role.MEDICO,
      Role.CIDADAO,
      Role.CIDADAO,
      Role.CIDADAO,
    ]);
    night(engine, 'p0', NightActionType.KILL, 'p1'); // mata o médico
    engine.resolveNight();

    expect(engine.players.get('p1')!.isAlive).toBe(false);
    const heirs = ['p2', 'p3', 'p4'].filter(id => engine.players.get(id)!.role === Role.MEDICO);
    expect(heirs).toHaveLength(1);
    const heir = engine.players.get(heirs[0])!;
    expect(heir.inheritedRoleRound).toBe(1);
    expect(heir.hasConfirmedRole).toBe(false); // humano verá o aviso secreto

    // O herdeiro pode agir como médico na noite seguinte
    engine.roundNumber = 2;
    engine.startNight();
    expect(night(engine, heir.id, NightActionType.HEAL, 'p0').accepted).toBe(true);
  });

  it('cargas restantes da bruxa acompanham a herança', () => {
    const engine = makeInheritanceMatch([
      Role.ASSASSINO,
      Role.BRUXA,
      Role.CIDADAO,
      Role.CIDADAO,
      Role.CIDADAO,
    ]);
    // Bruxa gasta a poção de morte antes de morrer
    night(engine, 'p1', NightActionType.WITCH_KILL, 'p4');
    night(engine, 'p0', NightActionType.KILL, 'p1');
    engine.resolveNight();

    const heir = ['p2', 'p3'].map(id => engine.players.get(id)!).find(p => p.role === Role.BRUXA);
    expect(heir).toBeDefined();
    expect(heir!.witchCharges.hasKillPotion).toBe(false); // já consumida pela antecessora
    expect(heir!.witchCharges.hasProtectAllPotion).toBe(true);
  });

  it('herança também acontece no julgamento diurno', () => {
    const engine = makeInheritanceMatch([
      Role.ASSASSINO,
      Role.DETETIVE,
      Role.CIDADAO,
      Role.CIDADAO,
      Role.CIDADAO,
    ]);
    engine.phase = GamePhase.VOTING;
    engine.submitVote('p0', 'p1');
    engine.submitVote('p2', 'p1');
    engine.submitVote('p3', 'p1');
    engine.resolveVoting();

    expect(engine.players.get('p1')!.isAlive).toBe(false);
    const heir = ['p2', 'p3', 'p4'].map(id => engine.players.get(id)!).find(p => p.role === Role.DETETIVE);
    expect(heir).toBeDefined();
    expect(heir!.investigationLog).toHaveLength(0); // caderno começa vazio
  });

  it('assassino nunca é herdado e o modo desligado não transfere nada', () => {
    // Assassino morto com herança ligada → ninguém vira assassino
    const engine = makeInheritanceMatch([
      Role.ASSASSINO,
      Role.ASSASSINO,
      Role.CIDADAO,
      Role.CIDADAO,
      Role.CIDADAO,
      Role.CIDADAO,
    ]);
    engine.phase = GamePhase.VOTING;
    engine.submitVote('p2', 'p0');
    engine.submitVote('p3', 'p0');
    engine.submitVote('p4', 'p0');
    engine.resolveVoting();
    const assassins = Array.from(engine.players.values()).filter(
      p => p.isAlive && p.role === Role.ASSASSINO
    );
    expect(assassins.map(a => a.id)).toEqual(['p1']);

    // Modo desligado: médico morre e ninguém herda
    const engine2 = makeFixedMatch([Role.ASSASSINO, Role.MEDICO, Role.CIDADAO, Role.CIDADAO, Role.CIDADAO]);
    night(engine2, 'p0', NightActionType.KILL, 'p1');
    engine2.resolveNight();
    const doctors = Array.from(engine2.players.values()).filter(p => p.role === Role.MEDICO);
    expect(doctors).toHaveLength(1); // só o morto
    expect(doctors[0].isAlive).toBe(false);
  });

  it('o aviso público de herança não vaza papel nem herdeiro antes do fim', () => {
    const engine = makeInheritanceMatch([
      Role.ASSASSINO,
      Role.MEDICO,
      Role.CIDADAO,
      Role.CIDADAO,
      Role.CIDADAO,
    ]);
    night(engine, 'p0', NightActionType.KILL, 'p1');
    engine.resolveNight();

    const snap = engine.getPrivateSnapshot('p0')!; // visão do assassino
    const inheritEvt = snap.room.timeline.find(t => t.type === 'ROLE_INHERITED')!;
    expect(inheritEvt).toBeDefined();
    expect(inheritEvt.secretPayload).toBeUndefined();
    expect(inheritEvt.description).not.toContain('Médico');
    expect(JSON.stringify(snap.room.players)).not.toContain('MEDICO');
  });
});

describe('revanche', () => {
  it('reseta estado e mantém assentos', () => {
    const engine = makeFixedMatch([Role.ASSASSINO, Role.CIDADAO, Role.CIDADAO, Role.CIDADAO, Role.CIDADAO]);
    engine.players.get('p0')!.isAlive = false;
    engine.checkVictoryCondition();
    expect(engine.phase).toBe(GamePhase.FINISHED);

    engine.resetForRematch();
    expect(engine.phase).toBe(GamePhase.LOBBY);
    expect(engine.winner).toBeNull();
    expect(engine.timeline).toHaveLength(0);
    Array.from(engine.players.values()).forEach(p => {
      expect(p.isAlive).toBe(true);
      expect(p.isMayor).toBe(false);
    });
  });
});
