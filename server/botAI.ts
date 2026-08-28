/**
 * Cidade Sob Suspeita 3D — Comportamento dos bots
 * Agentes neutros de preenchimento: seguem as regras canônicas,
 * nunca inventam fala nem acusação social (PRD 11.3).
 */

import { GameEngine } from '../src/engine/gameEngine.ts';
import { NIGHT_TURN_ROLE } from '../src/engine/rules.ts';
import { GamePhase, NightActionType, Role } from '../src/engine/types.ts';

const BOT_NAMES = [
  'Carlos Silva',
  'Beatriz Lima',
  'Eduardo Rocha',
  'Fernanda Dias',
  'Gabriel Santos',
  'Helena Costa',
  'Igor Almeida',
  'Juliana Castro',
  'Lucas Mendes',
  'Mariana Freitas',
  'Rodrigo Nunes',
  'Sofia Ribeiro',
];

const BOT_AVATARS = ['avatar-1', 'avatar-2', 'avatar-3', 'avatar-4', 'avatar-5', 'avatar-6'];

export function getRandomBotName(usedNames: Set<string>): string {
  const available = BOT_NAMES.filter(n => !usedNames.has(n));
  if (available.length > 0) {
    return available[Math.floor(Math.random() * available.length)];
  }
  return `Morador ${Math.floor(100 + Math.random() * 900)}`;
}

export function getRandomBotAvatar(): string {
  return BOT_AVATARS[Math.floor(Math.random() * BOT_AVATARS.length)];
}

/** Probabilidade de agir por tick — espalha as ações dos bots pela fase. */
const BOT_ACT_CHANCE = 0.3;

export function processBotActions(engine: GameEngine): void {
  const bots = Array.from(engine.players.values()).filter(p => p.isBot && p.isAlive);
  const alivePlayers = Array.from(engine.players.values()).filter(p => p.isAlive);

  if (engine.phase === GamePhase.ROLE_REVEAL) {
    bots.forEach(b => engine.confirmRole(b.id));
    return;
  }

  if (engine.phase === GamePhase.NIGHT_ACTIONS) {
    // Cada bot só age quando o narrador chama o SEU papel (roteiro em turnos).
    const turn = engine.currentNightTurn;
    if (!turn) return;
    const turnRole = NIGHT_TURN_ROLE[turn];

    bots.forEach(bot => {
      if (bot.role !== turnRole) return;
      if (engine.pendingNightActions.has(bot.id)) return;
      // Age imediatamente quando o turno está acabando
      if (engine.phaseTimeRemaining > 4 && Math.random() > BOT_ACT_CHANCE) return;

      const submit = (actionType: NightActionType, targetId?: string | null) =>
        engine.submitNightAction({
          playerId: bot.id,
          actionType,
          targetId,
          clientActionId: `bot-${actionType}-${Date.now()}-${bot.id}`,
          timestamp: Date.now(),
        });

      if (bot.role === Role.ASSASSINO) {
        // Um comparsa (humano ou bot) já marcou o alvo? A equipe segue junto —
        // o bot nunca "vota contra" a marcação de um humano.
        if (engine.assassinTeamTargetId) {
          submit(NightActionType.KILL, engine.assassinTeamTargetId);
          return;
        }
        const targets = alivePlayers.filter(p => p.role !== Role.ASSASSINO);
        const target = targets[Math.floor(Math.random() * targets.length)];
        if (target) submit(NightActionType.KILL, target.id);
        else submit(NightActionType.PASS);
      } else if (bot.role === Role.MEDICO) {
        // Plausível: protege a si mesmo na 1ª noite; depois, varia de alvo.
        if (engine.roundNumber === 1 && !bot.doctorSelfHealUsed) {
          submit(NightActionType.HEAL, bot.id);
          return;
        }
        const targets = alivePlayers.filter(
          p => p.id !== bot.id && p.id !== bot.lastDoctorTargetId
        );
        const target = targets[Math.floor(Math.random() * targets.length)];
        if (target) submit(NightActionType.HEAL, target.id);
        else submit(NightActionType.PASS);
      } else if (bot.role === Role.DETETIVE) {
        const investigated = new Set(bot.investigationLog.map(e => e.targetId));
        const fresh = alivePlayers.filter(p => p.id !== bot.id && !investigated.has(p.id));
        const pool = fresh.length > 0 ? fresh : alivePlayers.filter(p => p.id !== bot.id);
        const target = pool[Math.floor(Math.random() * pool.length)];
        if (target) submit(NightActionType.INVESTIGATE, target.id);
        else submit(NightActionType.PASS);
      } else if (bot.role === Role.GUARDA) {
        const targets = alivePlayers.filter(p => p.id !== bot.id);
        const target = targets[Math.floor(Math.random() * targets.length)];
        if (target) submit(NightActionType.BODYGUARD, target.id);
        else submit(NightActionType.PASS);
      } else if (bot.role === Role.BRUXA) {
        // Reage ao jogo: o escudo entra quando a noite anterior teve morte.
        const lastNightHadDeath =
          engine.dawnSummary !== null &&
          engine.dawnSummary.round === engine.roundNumber - 1 &&
          engine.dawnSummary.deaths.length > 0;
        if (bot.witchCharges.hasProtectAllPotion && lastNightHadDeath && Math.random() < 0.5) {
          submit(NightActionType.WITCH_PROTECT_ALL);
        } else if (bot.witchCharges.hasKillPotion && engine.roundNumber >= 3 && Math.random() < 0.2) {
          const targets = alivePlayers.filter(p => p.id !== bot.id);
          const target = targets[Math.floor(Math.random() * targets.length)];
          if (target) submit(NightActionType.WITCH_KILL, target.id);
          else submit(NightActionType.PASS);
        } else {
          submit(NightActionType.PASS);
        }
      }
    });
    return;
  }

  if (engine.phase === GamePhase.MAYOR_TIEBREAK) {
    const mayorBot = bots.find(b => b.isMayor);
    if (mayorBot && engine.tieCandidateIds.length > 0) {
      if (engine.phaseTimeRemaining <= 4 || Math.random() < BOT_ACT_CHANCE) {
        const targetId =
          engine.tieCandidateIds[Math.floor(Math.random() * engine.tieCandidateIds.length)];
        engine.submitMayorTiebreak(mayorBot.id, targetId);
      }
    }
    return;
  }

  if (engine.phase === GamePhase.VOTING || engine.phase === GamePhase.RUNOFF) {
    const sequential = engine.isSequentialVoting();

    // Suspeitas PÚBLICAS da mesa (nada de espiar segredos): no modo
    // sequencial, os votos já declarados em voz alta; no secreto, o
    // resultado aberto do julgamento anterior.
    const publicSuspicion: Record<string, number> = {};
    if (sequential) {
      engine.pendingVotes.forEach(targetId => {
        if (targetId) publicSuspicion[targetId] = (publicSuspicion[targetId] || 0) + 1;
      });
    } else if (engine.lastVotingSummary && engine.lastVotingSummary.round === engine.roundNumber - 1) {
      Object.assign(publicSuspicion, engine.lastVotingSummary.voteCounts);
    }

    bots.forEach(bot => {
      if (engine.pendingVotes.has(bot.id)) return;
      // No modo sequencial, só o votante da vez declara (com uma pausa dramática)
      if (sequential && engine.currentVoterId !== bot.id) return;
      if (engine.phaseTimeRemaining > 4 && Math.random() > BOT_ACT_CHANCE) return;

      let eligible = alivePlayers.filter(p => p.id !== bot.id);
      if (engine.phase === GamePhase.RUNOFF) {
        eligible = alivePlayers.filter(p => engine.tieCandidateIds.includes(p.id) && p.id !== bot.id);
        if (eligible.length === 0) {
          engine.submitVote(bot.id, null);
          return;
        }
      }

      // Detetive vota em suspeito confirmado quando possível
      if (bot.role === Role.DETETIVE) {
        const suspect = bot.investigationLog.find(
          e => e.isSuspicious && alivePlayers.some(p => p.id === e.targetId)
        );
        if (
          suspect &&
          (engine.phase !== GamePhase.RUNOFF || engine.tieCandidateIds.includes(suspect.targetId))
        ) {
          engine.submitVote(bot.id, suspect.targetId);
          return;
        }
      }

      // Assassino nunca vota em comparsa
      if (bot.role === Role.ASSASSINO) {
        eligible = eligible.filter(p => p.role !== Role.ASSASSINO);
      }

      if (eligible.length === 0) {
        engine.submitVote(bot.id, null);
        return;
      }

      // Acompanha a suspeita da mesa (em vez de sortear): 60% de chance de
      // votar no mais acusado publicamente entre os elegíveis.
      const accused = eligible
        .filter(p => (publicSuspicion[p.id] || 0) > 0)
        .sort((a, b) => (publicSuspicion[b.id] || 0) - (publicSuspicion[a.id] || 0))[0];
      if (accused && Math.random() < 0.6) {
        engine.submitVote(bot.id, accused.id);
        return;
      }

      if (Math.random() > 0.1) {
        const target = eligible[Math.floor(Math.random() * eligible.length)];
        engine.submitVote(bot.id, target.id);
      } else {
        engine.submitVote(bot.id, null);
      }
    });
  }
}
