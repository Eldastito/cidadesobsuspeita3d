/**
 * Cidade Sob Suspeita 3D — Tipos do motor de regras
 * Entidades puras, sem dependência de DOM, rede ou relógio global.
 */

export enum Role {
  ASSASSINO = 'ASSASSINO',
  MEDICO = 'MEDICO',
  DETETIVE = 'DETETIVE',
  BRUXA = 'BRUXA',
  /** Expansão (Fase 5): protege alguém e morre no lugar da vítima. */
  GUARDA = 'GUARDA',
  CIDADAO = 'CIDADAO',
}

export enum RoleAlignment {
  TOWN = 'CIDADE',
  THREAT = 'AMEACA',
}

export enum GamePhase {
  LOBBY = 'LOBBY',
  ROLE_REVEAL = 'ROLE_REVEAL',
  NIGHT_ACTIONS = 'NIGHT_ACTIONS',
  NIGHT_RESOLUTION = 'NIGHT_RESOLUTION',
  DAWN = 'DAWN',
  DISCUSSION = 'DISCUSSION',
  VOTING = 'VOTING',
  RUNOFF = 'RUNOFF',
  MAYOR_TIEBREAK = 'MAYOR_TIEBREAK',
  DAY_RESOLUTION = 'DAY_RESOLUTION',
  FINISHED = 'FINISHED',
  PAUSED = 'PAUSED',
}

export enum NightActionType {
  KILL = 'KILL', // Assassino
  HEAL = 'HEAL', // Médico
  INVESTIGATE = 'INVESTIGATE', // Detetive
  WITCH_KILL = 'WITCH_KILL', // Bruxa: poção de morte
  WITCH_PROTECT_ALL = 'WITCH_PROTECT_ALL', // Bruxa: proteção coletiva
  BODYGUARD = 'BODYGUARD', // Guarda-costas: intercepta o ataque
  OBSERVE = 'OBSERVE', // Cidadão: registra uma suspeita privada (sem efeito mecânico)
  PASS = 'PASS', // Não agir
}

export enum VictoryWinner {
  TOWN = 'CIDADE',
  ASSASSINS = 'ASSASSINOS',
  DRAW = 'EMPATE',
}

/** Resultado determinístico de uma rodada de votação. */
export enum VotingOutcome {
  ELIMINATED = 'ELIMINATED',
  NO_ELIMINATION = 'NO_ELIMINATION',
  TIE_MAYOR = 'TIE_MAYOR', // empate → Prefeito decide
  TIE_RUNOFF = 'TIE_RUNOFF', // empate → segundo turno
}

export interface PlayerWitchCharges {
  hasKillPotion: boolean;
  hasProtectAllPotion: boolean;
}

export interface DetectiveEntry {
  round: number;
  targetId: string;
  targetNickname: string;
  isSuspicious: boolean; // "suspeito" (Assassino) vs "não suspeito" (demais)
}

export interface HunchEntry {
  round: number;
  targetId: string;
  targetNickname: string;
}

export type DeathReason =
  | 'ASSASSIN_ATTACK'
  | 'WITCH_POTION'
  | 'VOTED_OUT'
  | 'BODYGUARD_SACRIFICE'
  | 'DISCONNECTED';

export interface Player {
  id: string;
  sessionId: string;
  /** Identidade persistente do navegador (estatísticas entre partidas). */
  guestId?: string;
  nickname: string;
  avatarId: string;
  /** Cor cosmética escolhida pelo jogador (índice da paleta; sem vantagem). */
  avatarColor?: number;
  isHost: boolean;
  isBot: boolean;
  isReady: boolean;
  isConnected: boolean;
  seatNumber: number; // 0 a 15

  // Estado de partida
  isAlive: boolean;
  role: Role;
  hasConfirmedRole: boolean;
  isMayor: boolean;

  // Estado específico por papel
  witchCharges: PlayerWitchCharges;
  doctorSelfHealUsed: boolean;
  lastDoctorTargetId: string | null;
  investigationLog: DetectiveEntry[];
  hunchLog: HunchEntry[];

  // Dia e votação
  votedTargetId: string | null;
  hasRaisedHand: boolean;

  // Auditoria de morte
  deathRound?: number;
  deathReason?: DeathReason;

  /** Rodada em que herdou o papel atual (modo herança). */
  inheritedRoleRound?: number;
}

/** Modo de votação diurna (PRD 6.7). */
export enum VotingMode {
  /** Padrão: todos votam ao mesmo tempo, em segredo; resultado só na apuração. */
  SECRET = 'SECRET',
  /** Como no vídeo original: em ordem de assentos, um por vez, voto público e definitivo. */
  SEQUENTIAL = 'SEQUENTIAL',
}

export interface RoomConfig {
  minPlayers: number;
  maxPlayers: number;
  rolesCount: {
    assassins: number;
    doctor: number;
    detective: number;
    witch: number;
    /** Expansão: Guarda-costas (0 = desligado). */
    bodyguard: number;
    mayor: number;
  };
  nightDurationSeconds: number;
  discussionDurationSeconds: number;
  votingDurationSeconds: number;
  votingMode: VotingMode;
  revealRoleOnDeath: boolean;
  enableMayorTiebreak: boolean;
  /**
   * Modo herança (Fase 5, desligado por padrão): quando um papel especial
   * da cidade morre, um Cidadão vivo sorteado o herda em segredo.
   */
  roleInheritance: boolean;
}

/** Durações fixas de fases curtas (segundos). */
export const PHASE_DURATIONS = {
  roleReveal: 15,
  dawn: 8,
  runoff: 25,
  mayorTiebreak: 20,
  dayResolution: 8,
  /** Janela de cada votante no modo sequencial. */
  sequentialVoteTurn: 15,
} as const;

export interface NightSubmission {
  playerId: string;
  actionType: NightActionType;
  targetId?: string | null;
  clientActionId: string;
  timestamp: number;
}

export interface VoteSubmission {
  voterId: string;
  targetId: string | null; // null = abstenção
  clientActionId: string;
  timestamp: number;
}

export interface DawnSummary {
  round: number;
  killedPlayerIds: string[];
  deaths: Array<{
    playerId: string;
    nickname: string;
    revealedRole?: Role;
  }>;
  narrativeText: string;
}

export interface VotingSummary {
  round: number;
  outcome: VotingOutcome;
  wasRunoff: boolean;
  eliminatedPlayerId: string | null;
  eliminatedNickname: string | null;
  revealedRole?: Role;
  votes: Record<string, string | null>; // eleitor → alvo
  voteCounts: Record<string, number>; // alvo → contagem
  tiePlayerIds?: string[];
  mayorDecided?: boolean;
}

export interface TimelineEvent {
  id: string;
  round: number;
  phase: GamePhase;
  timestamp: number;
  type:
    | 'MATCH_START'
    | 'NIGHT_START'
    | 'DAWN_ANNOUNCEMENT'
    | 'DISCUSSION_START'
    | 'VOTING_START'
    | 'RUNOFF_START'
    | 'MAYOR_TIEBREAK'
    | 'ELIMINATION'
    | 'ROLE_INHERITED'
    | 'MATCH_END';
  title: string;
  description: string;
  publicPayload?: any;
  secretPayload?: any; // revelado apenas ao final da partida
}

export interface ChatMessage {
  id: string;
  senderId: string;
  senderNickname: string;
  senderAvatar: string;
  text: string;
  timestamp: number;
  isDeadChat: boolean;
  isSystem?: boolean;
}

/** Visão pública de um jogador — o que qualquer cliente pode saber. */
export interface PublicPlayerView {
  id: string;
  nickname: string;
  avatarId: string;
  avatarColor?: number;
  isHost: boolean;
  isBot: boolean;
  isReady: boolean;
  isConnected: boolean;
  seatNumber: number;
  isAlive: boolean;
  isMayor: boolean;
  hasRaisedHand: boolean;
  /** Preenchido só quando a partida termina ou a sala revela papel de mortos. */
  revealedRole?: Role;
  /** Visível apenas na resolução do dia / fim de partida. */
  votedTargetId?: string | null;
}

/**
 * Snapshot privado enviado a um único jogador.
 * Nunca contém papéis ou ações secretas de terceiros.
 */
export interface PrivatePlayerSnapshot {
  player: {
    id: string;
    nickname: string;
    avatarId: string;
    seatNumber: number;
    isHost: boolean;
    isAlive: boolean;
    isMayor: boolean;
    role: Role;
    hasConfirmedRole: boolean;
    /** Rodada em que herdou o papel (modo herança) — exibe o aviso secreto. */
    inheritedRoleRound?: number;
    witchCharges?: PlayerWitchCharges;
    doctorSelfHealUsed?: boolean;
    lastDoctorTargetId?: string | null;
    investigationLog?: DetectiveEntry[];
    hunchLog?: HunchEntry[];
    /** Comparsas, apenas se o jogador for Assassino. */
    fellowAssassinIds?: string[];
    currentNightAction?: NightSubmission | null;
    currentVote?: string | null;
    hasVoted?: boolean;
  };
  room: {
    roomId: string;
    roomCode: string;
    phase: GamePhase;
    roundNumber: number;
    phaseTimeRemaining: number;
    phaseDuration: number;
    config: RoomConfig;
    players: PublicPlayerView[];
    aliveCount: number;
    winner: VictoryWinner | null;
    dawnSummary: DawnSummary | null;
    lastVotingSummary: VotingSummary | null;
    /** Candidatos do desempate, público durante RUNOFF/MAYOR_TIEBREAK. */
    tieCandidateIds: string[];
    /** Votante da vez no modo sequencial (null fora dele). */
    currentVoterId: string | null;
    timeline: TimelineEvent[];
    allRolesRevealed?: Record<string, Role>; // apenas em FINISHED
  };
}
