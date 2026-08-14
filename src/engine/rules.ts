/**
 * Cidade Sob Suspeita 3D - Canonical Rules & Validation
 * Follows PRD 1.0 Specifications
 */

import { Role, RoleAlignment, RoomConfig } from './types.ts';

export const ROLE_METADATA: Record<
  Role,
  {
    name: string;
    alignment: RoleAlignment;
    description: string;
    abilityDescription: string;
    color: string;
    icon: string;
  }
> = {
  [Role.ASSASSINO]: {
    name: 'Assassino',
    alignment: RoleAlignment.THREAT,
    description: 'Ameaça à cidade. Conhece seus comparsas e conspira na escuridão.',
    abilityDescription: 'Escolhe uma vítima toda noite para ser eliminada silenciosamente.',
    color: '#ef4444', // Red
    icon: 'Skull',
  },
  [Role.MEDICO]: {
    name: 'Médico',
    alignment: RoleAlignment.TOWN,
    description: 'Guardião da vida e da esperança dos cidadãos.',
    abilityDescription: 'Protege uma pessoa por noite contra o ataque dos assassinos. Pode proteger a si mesmo uma única vez e não pode repetir o alvo da noite anterior.',
    color: '#10b981', // Emerald
    icon: 'HeartHandshake',
  },
  [Role.DETETIVE]: {
    name: 'Detetive',
    alignment: RoleAlignment.TOWN,
    description: 'Investigador astuto que descobre a verdade nas sombras.',
    abilityDescription: 'Investiga um suspeito por noite. Descobre privadamente se a pessoa é "Suspeito" ou "Não suspeito", registrando as pistas em seu caderno.',
    color: '#3b82f6', // Blue
    icon: 'Search',
  },
  [Role.BRUXA]: {
    name: 'Bruxa',
    alignment: RoleAlignment.TOWN,
    description: 'Mestre das poções místicas com poderes de vida e morte.',
    abilityDescription: 'Possui 1 poção de morte e 1 proteção coletiva para toda a partida. A cada noite escolhe uma das opções ou não agir.',
    color: '#a855f7', // Purple
    icon: 'Sparkles',
  },
  [Role.CIDADAO]: {
    name: 'Cidadão',
    alignment: RoleAlignment.TOWN,
    description: 'Morador inocente que luta pela justiça e sobrevivência da cidade.',
    abilityDescription: 'Não age durante a noite. Usa a observação, lógica e o voto diurno para desmascarar os assassinos.',
    color: '#f59e0b', // Amber
    icon: 'Users',
  },
};

export const DEFAULT_ROOM_CONFIG: RoomConfig = {
  minPlayers: 5,
  maxPlayers: 12,
  rolesCount: {
    assassins: 1,
    doctor: 1,
    detective: 1,
    witch: 1,
    mayor: 0,
  },
  nightDurationSeconds: 25,
  discussionDurationSeconds: 90,
  votingDurationSeconds: 30,
  revealRoleOnDeath: false,
  sequentialVoting: false,
  enableMayorTiebreak: true,
};

/**
 * Calculates recommended role distribution based on player count according to PRD section 3.1
 */
export function getRecommendedRoles(playerCount: number): RoomConfig['rolesCount'] {
  if (playerCount <= 6) {
    return { assassins: 1, doctor: 1, detective: 1, witch: 0, mayor: 0 };
  } else if (playerCount <= 9) {
    return { assassins: 1, doctor: 1, detective: 1, witch: 1, mayor: 0 };
  } else if (playerCount <= 12) {
    return { assassins: 2, doctor: 1, detective: 1, witch: 1, mayor: 1 };
  } else {
    return { assassins: 3, doctor: 1, detective: 1, witch: 1, mayor: 1 };
  }
}

/**
 * Generates role list for a match with deterministic validation
 */
export function generateRoleDeck(playerCount: number, config: RoomConfig): Role[] {
  const { assassins, doctor, detective, witch } = config.rolesCount;
  
  const deck: Role[] = [];
  
  for (let i = 0; i < assassins; i++) deck.push(Role.ASSASSINO);
  for (let i = 0; i < doctor; i++) deck.push(Role.MEDICO);
  for (let i = 0; i < detective; i++) deck.push(Role.DETETIVE);
  for (let i = 0; i < witch; i++) deck.push(Role.BRUXA);
  
  // Fill remaining slots with Citizens
  while (deck.length < playerCount) {
    deck.push(Role.CIDADAO);
  }
  
  // Truncate if customized roles exceed player count
  return deck.slice(0, playerCount);
}

/**
 * Fisher-Yates cryptographically-safe array shuffler
 */
export function secureShuffle<T>(array: T[]): T[] {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    let rand = Math.random();
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
      const buffer = new Uint32Array(1);
      crypto.getRandomValues(buffer);
      rand = buffer[0] / (0xffffffff + 1);
    }
    const j = Math.floor(rand * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
