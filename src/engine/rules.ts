/**
 * Cidade Sob Suspeita 3D — Regras canônicas, metadados de papéis e sorteio seguro
 * Segue o PRD 1.0 (seção 3) e docs/game-rules.md
 */

import { NightTurn, Role, RoleAlignment, RoomConfig, VotingMode } from './types.ts';

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
      'Quando o narrador chamar, toca em alguém e a vítima está marcada. Com vários assassinos, a última marcação da equipe vale para todos. Vence quando os assassinos igualam ou superam os demais vivos.',
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
      'Investiga um suspeito por noite e o narrador responde NA HORA: 👍 inocente ou 👎 suspeito. Tudo fica registrado no seu caderno privado.',
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
      'À noite dorme tranquilo — nada a fazer. De dia, observa, debate e vota: o voto da cidade é a arma que desmascara os assassinos.',
    color: '#f59e0b',
    emoji: '🏠',
  },
};

export const DEFAULT_ROOM_CONFIG: RoomConfig = {
  minPlayers: 5,
  maxPlayers: 12,
  // Composição clássica e legível: Assassino, Médico ("anjo"), Detetive e
  // Cidadãos. Bruxa e Guarda-costas são opcionais (o anfitrião liga na sala).
  rolesCount: {
    assassins: 1,
    doctor: 1,
    detective: 1,
    witch: 0,
    bodyguard: 0,
    mayor: 1,
  },
  nightDurationSeconds: 30,
  discussionDurationSeconds: 90,
  votingDurationSeconds: 35,
  votingMode: VotingMode.SECRET,
  // Revelar o papel de quem morre dá causa e efeito visíveis à partida
  // (configurável — desligue para o modo "ninguém sabe nada").
  revealRoleOnDeath: true,
  enableMayorTiebreak: true,
  roleInheritance: false,
  plazaTheme: 'padrao',
};

/**
 * Roteiro do narrador na noite: papel chamado em cada turno e as falas
 * públicas ("todos ouvem o narrador") + a instrução privada de quem age.
 */
export const NIGHT_TURN_ROLE: Record<NightTurn, Role> = {
  [NightTurn.ASSASSINS]: Role.ASSASSINO,
  [NightTurn.DOCTOR]: Role.MEDICO,
  [NightTurn.WITCH]: Role.BRUXA,
  [NightTurn.GUARD]: Role.GUARDA,
  [NightTurn.DETECTIVE]: Role.DETETIVE,
};

export const NIGHT_TURN_CALLS: Record<
  NightTurn,
  { call: string; sleepLabel: string; prompt: string }
> = {
  [NightTurn.ASSASSINS]: {
    call: 'Assassinos, acordem… escolham a vítima desta noite.',
    sleepLabel: 'Os assassinos agem…',
    prompt: 'Toque no morador que será atacado — a última marcação da equipe vale.',
  },
  [NightTurn.DOCTOR]: {
    call: 'Médico, acorde… escolha alguém para proteger.',
    sleepLabel: 'O Médico faz sua ronda…',
    prompt: 'Toque em quem você quer proteger do ataque desta noite.',
  },
  [NightTurn.WITCH]: {
    call: 'Bruxa, acorde… o caldeirão espera sua decisão.',
    sleepLabel: 'A Bruxa mexe o caldeirão…',
    prompt: 'Escolha uma poção — ou guarde as duas para outra noite.',
  },
  [NightTurn.GUARD]: {
    call: 'Guarda-costas, acorde… escolha quem escoltar.',
    sleepLabel: 'O Guarda-costas ronda as ruas…',
    prompt: 'Toque em quem você protege com a própria vida.',
  },
  [NightTurn.DETECTIVE]: {
    call: 'Detetive, acorde… aponte um suspeito.',
    sleepLabel: 'O Detetive investiga…',
    prompt: 'Toque em alguém e o narrador responde na hora: inocente ou suspeito.',
  },
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
