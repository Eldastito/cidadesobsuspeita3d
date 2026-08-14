/**
 * Cidade Sob Suspeita 3D - Bot AI Behavior
 * Autonomous playtesting agents that follow canonical rules
 */

import { GameEngine } from '../src/engine/gameEngine.ts';
import { GamePhase, NightActionType, Player, Role } from '../src/engine/types.ts';

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
  return `Convidado ${Math.floor(100 + Math.random() * 900)}`;
}

export function getRandomBotAvatar(): string {
  return BOT_AVATARS[Math.floor(Math.random() * BOT_AVATARS.length)];
}

export function processBotActions(engine: GameEngine): void {
  const bots = Array.from(engine.players.values()).filter(p => p.isBot && p.isAlive);
  const alivePlayers = Array.from(engine.players.values()).filter(p => p.isAlive);

  if (engine.phase === GamePhase.ROLE_REVEAL) {
    bots.forEach(b => engine.confirmRole(b.id));
  } else if (engine.phase === GamePhase.NIGHT_ACTIONS) {
    bots.forEach(bot => {
      if (engine.pendingNightActions.has(bot.id)) return;

      if (bot.role === Role.ASSASSINO) {
        const potentialTargets = alivePlayers.filter(p => p.role !== Role.ASSASSINO);
        if (potentialTargets.length > 0) {
          const target = potentialTargets[Math.floor(Math.random() * potentialTargets.length)];
          engine.submitNightAction({
            playerId: bot.id,
            actionType: NightActionType.KILL,
            targetId: target.id,
            clientActionId: `bot-kill-${Date.now()}-${bot.id}`,
            timestamp: Date.now(),
          });
        }
      } else if (bot.role === Role.MEDICO) {
        const potentialTargets = alivePlayers.filter(p => {
          if (p.id === bot.id && bot.doctorSelfHealUsed) return false;
          if (p.id === bot.lastDoctorTargetId) return false;
          return true;
        });
        if (potentialTargets.length > 0) {
          const target = potentialTargets[Math.floor(Math.random() * potentialTargets.length)];
          engine.submitNightAction({
            playerId: bot.id,
            actionType: NightActionType.HEAL,
            targetId: target.id,
            clientActionId: `bot-heal-${Date.now()}-${bot.id}`,
            timestamp: Date.now(),
          });
        }
      } else if (bot.role === Role.DETETIVE) {
        const investigatedIds = new Set(bot.investigationLog.map(e => e.targetId));
        const potentialTargets = alivePlayers.filter(p => p.id !== bot.id && !investigatedIds.has(p.id));
        const targetList = potentialTargets.length > 0 ? potentialTargets : alivePlayers.filter(p => p.id !== bot.id);
        if (targetList.length > 0) {
          const target = targetList[Math.floor(Math.random() * targetList.length)];
          engine.submitNightAction({
            playerId: bot.id,
            actionType: NightActionType.INVESTIGATE,
            targetId: target.id,
            clientActionId: `bot-inv-${Date.now()}-${bot.id}`,
            timestamp: Date.now(),
          });
        }
      } else if (bot.role === Role.BRUXA) {
        // Witch decision heuristic: 20% protect all if round >= 2, 20% kill if suspicious, else pass
        if (bot.witchCharges.hasProtectAllPotion && Math.random() < 0.25) {
          engine.submitNightAction({
            playerId: bot.id,
            actionType: NightActionType.WITCH_PROTECT_ALL,
            clientActionId: `bot-witch-prot-${Date.now()}-${bot.id}`,
            timestamp: Date.now(),
          });
        } else if (bot.witchCharges.hasKillPotion && Math.random() < 0.2) {
          const potentialTargets = alivePlayers.filter(p => p.id !== bot.id);
          const target = potentialTargets[Math.floor(Math.random() * potentialTargets.length)];
          if (target) {
            engine.submitNightAction({
              playerId: bot.id,
              actionType: NightActionType.WITCH_KILL,
              targetId: target.id,
              clientActionId: `bot-witch-kill-${Date.now()}-${bot.id}`,
              timestamp: Date.now(),
            });
          }
        } else {
          engine.submitNightAction({
            playerId: bot.id,
            actionType: NightActionType.PASS,
            clientActionId: `bot-witch-pass-${Date.now()}-${bot.id}`,
            timestamp: Date.now(),
          });
        }
      }
    });
  } else if (engine.phase === GamePhase.VOTING || engine.phase === GamePhase.RUNOFF || engine.phase === GamePhase.MAYOR_TIEBREAK) {
    bots.forEach(bot => {
      if (engine.pendingVotes.has(bot.id)) return;

      if (engine.phase === GamePhase.MAYOR_TIEBREAK) {
        if (bot.isMayor && engine.tieCandidateIds.length > 0) {
          const targetId = engine.tieCandidateIds[Math.floor(Math.random() * engine.tieCandidateIds.length)];
          engine.submitVote(bot.id, targetId);
        }
        return;
      }

      let eligibleTargets = alivePlayers.filter(p => p.id !== bot.id);
      if (engine.phase === GamePhase.RUNOFF) {
        eligibleTargets = eligibleTargets.filter(p => engine.tieCandidateIds.includes(p.id));
      }

      // If detective found a suspicious assassin, vote for them!
      if (bot.role === Role.DETETIVE) {
        const knownSuspect = bot.investigationLog.find(e => e.isSuspicious && alivePlayers.some(p => p.id === e.targetId));
        if (knownSuspect && (engine.phase !== GamePhase.RUNOFF || engine.tieCandidateIds.includes(knownSuspect.targetId))) {
          engine.submitVote(bot.id, knownSuspect.targetId);
          return;
        }
      }

      if (eligibleTargets.length > 0 && Math.random() > 0.1) {
        const target = eligibleTargets[Math.floor(Math.random() * eligibleTargets.length)];
        engine.submitVote(bot.id, target.id);
      } else {
        // Abstain
        engine.submitVote(bot.id, null);
      }
    });
  }
}
