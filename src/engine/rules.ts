/**
 * Cidade Sob Suspeita 3D — Regras canônicas, metadados de papéis e sorteio seguro
 * Segue o PRD 1.0 (seção 3) e docs/game-rules.md
 */

import { Role, RoleAlignment, RoomConfig, VotingMode } from './types.ts';

export const ROLE_METADATA: Record<
  Role,
  {
    name: string;
    alignment: RoleAlignment;
    description: string;
    abilityDescription: string;
    color: string;
    emoji: string;
  }
> = {
  [Role.ASSASSINO]: {
    name: 'Assassino',
    alignment: RoleAlignment.THREAT,
    description: 'Ameaça à cidade. Conhece seus comparsas e conspira na escuridão.',
    abilityDescription:
      'Escolhe uma vítima toda noite. Com vários assassinos, o alvo mais votado entre eles é atacado. Vence quando os assassinos igualam ou superam os demais vivos.',
    color: '#f43f5e',
    emoji: '🗡️',
  },
  [Role.MEDICO]: {
    name: 'Médico',
    alignment: RoleAlignment.TOWN,
    description: 'Guardião da vida e da esperança dos cidadãos.',
    abilityDescription:
      'Protege uma pessoa por noite contra o ataque dos assassinos. Pode proteger a si mesmo uma única vez na partida e não pode repetir o alvo da noite anterior.',
    color: '#10b981',
    emoji: '🩺',
  },
  [Role.DETETIVE]: {
    name: 'Detetive',
    alignment: RoleAlignment.TOWN,
    description: 'Investigador astuto que descobre a verdade nas sombras.',
    abilityDescription:
      'Investiga um suspeito por noite. Descobre em segredo se a pessoa é "suspeita" ou "não suspeita" e registra tudo no seu caderno privado.',
    color: '#3b82f6',
    emoji: '🔍',
  },
  [Role.BRUXA]: {
    name: 'Bruxa',
    alignment: RoleAlignment.TOWN,
    description: 'Mestra das poções, com poder sobre a vida e a morte.',
    abilityDescription:
      'Possui 1 poção de morte e 1 proteção coletiva por partida. A cada noite escolhe uma opção: matar alguém, proteger a cidade inteira do ataque, ou guardar as poções.',
    color: '#a855f7',
    emoji: '🧪',
  },
  [Role.GUARDA]: {
    name: 'Guarda-costas',
    alignment: RoleAlignment.TOWN,
    description: 'Escudo silencioso da cidade, disposto ao sacrifício final.',
    abilityDescription:
      'Escolhe alguém para escoltar a cada noite. Se os assassinos atacarem essa pessoa, o Guarda-costas morre no lugar dela. Não pode escoltar a si mesmo.',
    color: '#0ea5e9',
    emoji: '🛡️',
  },
  [Role.CIDADAO]: {
    name: 'Cidadão',
    alignment: RoleAlignment.TOWN,
    description: 'Morador da cidade que luta pela justiça e pela sobrevivência.',
    abilityDescription:
      'Não tem poder noturno, mas pode anotar uma suspeita em segredo a cada noite. De dia, observa, debate e vota para desmascarar os assassinos.',
    color: '#f59e0b',
    emoji: '🏠',
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
    bodyguard: 0,
    mayor: 1,
  },
  nightDurationSeconds: 30,
  discussionDurationSeconds: 90,
  votingDurationSeconds: 35,
  votingMode: VotingMode.SECRET,
  revealRoleOnDeath: false,
  enableMayorTiebreak: true,
  roleInheritance: false,
  plazaTheme: 'padrao',
};

/** Presets de sala (editor de regras da Fase 5). */
export const ROOM_PRESETS: Array<{
  id: string;
  name: string;
  description: string;
  apply: (playerCount: number) => Partial<RoomConfig>;
}> = [
  {
    id: 'classica',
    name: 'Clássica',
    description: 'A composição recomendada para o número de jogadores, sem expansões.',
    apply: playerCount => ({
      rolesCount: { ...getRecommendedRoles(playerCount), bodyguard: 0 },
      roleInheritance: false,
      votingMode: VotingMode.SECRET,
    }),
  },
  {
    id: 'completa',
    name: 'Completa',
    description: 'Todos os papéis em jogo, incluindo o Guarda-costas.',
    apply: playerCount => ({
      rolesCount: { ...getRecommendedRoles(Math.max(playerCount, 7)), bodyguard: 1 },
      roleInheritance: false,
    }),
  },
  {
    id: 'heranca',
    name: 'Caos com Herança',
    description: 'Papéis não morrem com seus donos: um Cidadão sorteado herda cada poder perdido.',
    apply: playerCount => ({
      rolesCount: { ...getRecommendedRoles(Math.max(playerCount, 7)), bodyguard: 1 },
      roleInheritance: true,
      votingMode: VotingMode.SEQUENTIAL,
    }),
  },
];

/** Composição recomendada por quantidade de jogadores (PRD 3.1). */
export function getRecommendedRoles(playerCount: number): RoomConfig['rolesCount'] {
  if (playerCount <= 6) {
    return { assassins: 1, doctor: 1, detective: 1, witch: 0, bodyguard: 0, mayor: 0 };
  } else if (playerCount <= 9) {
    return { assassins: 1, doctor: 1, detective: 1, witch: 1, bodyguard: 0, mayor: 0 };
  } else if (playerCount <= 12) {
    return { assassins: 2, doctor: 1, detective: 1, witch: 1, bodyguard: 0, mayor: 1 };
  }
  return { assassins: 3, doctor: 1, detective: 1, witch: 1, bodyguard: 0, mayor: 1 };
}

/** Valida se a composição é jogável (a cidade precisa começar em maioria). */
export function validateComposition(
  playerCount: number,
  roles: RoomConfig['rolesCount']
): { valid: boolean; reason?: string } {
  const specials = roles.assassins + roles.doctor + roles.detective + roles.witch + (roles.bodyguard || 0);
  if (roles.assassins < 1) {
    return { valid: false, reason: 'A partida precisa de pelo menos 1 assassino.' };
  }
  if (specials > playerCount) {
    return { valid: false, reason: 'Há mais papéis especiais do que jogadores na sala.' };
  }
  if (roles.assassins * 2 >= playerCount) {
    return { valid: false, reason: 'Assassinos demais: a cidade precisa começar em maioria.' };
  }
  return { valid: true };
}

export function generateRoleDeck(playerCount: number, config: RoomConfig): Role[] {
  const { assassins, doctor, detective, witch, bodyguard } = config.rolesCount;

  const deck: Role[] = [];
  for (let i = 0; i < assassins; i++) deck.push(Role.ASSASSINO);
  for (let i = 0; i < doctor; i++) deck.push(Role.MEDICO);
  for (let i = 0; i < detective; i++) deck.push(Role.DETETIVE);
  for (let i = 0; i < witch; i++) deck.push(Role.BRUXA);
  for (let i = 0; i < (bodyguard || 0); i++) deck.push(Role.GUARDA);
  while (deck.length < playerCount) deck.push(Role.CIDADAO);

  return deck.slice(0, playerCount);
}

/** Inteiro uniforme em [0, maxExclusive) usando CSPRNG quando disponível. */
export function secureRandomInt(maxExclusive: number): number {
  if (maxExclusive <= 0) return 0;
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const buffer = new Uint32Array(1);
    crypto.getRandomValues(buffer);
    return buffer[0] % maxExclusive;
  }
  return Math.floor(Math.random() * maxExclusive);
}

/** Fisher–Yates com CSPRNG. */
export function secureShuffle<T>(array: T[]): T[] {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = secureRandomInt(i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/** Sorteia um elemento com CSPRNG. */
export function securePick<T>(array: T[]): T | undefined {
  if (array.length === 0) return undefined;
  return array[secureRandomInt(array.length)];
}
