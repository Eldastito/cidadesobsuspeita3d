/**
 * Cidade Sob Suspeita 3D - Core Engine Types
 * Clean Architecture & Deterministic State Machine Entities
 */

export enum Role {
  ASSASSINO = 'ASSASSINO',
  MEDICO = 'MEDICO',
  DETETIVE = 'DETETIVE',
  BRUXA = 'BRUXA',
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
  WITCH_KILL = 'WITCH_KILL', // Bruxa poção de morte
  WITCH_PROTECT_ALL = 'WITCH_PROTECT_ALL', // Bruxa poção de salvação coletiva
  PASS = 'PASS', // Não agir
}

export enum VictoryWinner {
  TOWN = 'CIDADE',
  ASSASSINS = 'ASSASSINOS',
  DRAW = 'EMPATE',
}

export interface PlayerWitchCharges {
  hasKillPotion: boolean;
  hasProtectAllPotion: boolean;
}

export interface DetectiveEntry {
  round: number;
  targetId: string;
  targetNickname: string;
  isSuspicious: boolean; // "suspeito" (Assassino) vs "não suspeito" (outros)
}

export interface Player {
  id: string;
  sessionId: string;
  nickname: string;
  avatarId: string;
  isHost: boolean;
  isBot: boolean;
  isReady: boolean;
  isConnected: boolean;
  seatNumber: number; // 0 to 15
  
  // Game runtime state
  isAlive: boolean;
  role: Role;
  hasConfirmedRole: boolean;
  isMayor: boolean;
  
  // Role-specific runtime state
  witchCharges: PlayerWitchCharges;
  doctorSelfHealUsed: boolean;
  lastDoctorTargetId: string | null;
  investigationLog: DetectiveEntry[];
  
  // Voting & Day state
  votedTargetId: string | null;
  hasRaisedHand: boolean;
  
  // Death audit
  deathRound?: number;
  deathReason?: 'ASSASSIN_ATTACK' | 'WITCH_POTION' | 'VOTED_OUT' | 'DISCONNECTED';
}

export interface RoomConfig {
  minPlayers: number;
  maxPlayers: number;
  rolesCount: {
    assassins: number;
    doctor: number;
    detective: number;
    witch: number;
    mayor: number;
  };
  nightDurationSeconds: number;
  discussionDurationSeconds: number;
  votingDurationSeconds: number;
  revealRoleOnDeath: boolean;
  sequentialVoting: boolean;
  enableMayorTiebreak: boolean;
}

export interface NightSubmission {
  playerId: string;
  actionType: NightActionType;
  targetId?: string | null;
  clientActionId: string;
  timestamp: number;
}

export interface VoteSubmission {
  voterId: string;
  targetId: string | null; // null for abstention/skip
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
  eliminatedPlayerId: string | null;
  eliminatedNickname: string | null;
  revealedRole?: Role;
  votes: Record<string, string | null>; // voterId -> targetId
  voteCounts: Record<string, number>; // targetId -> count
  wasTie: boolean;
  tiePlayerIds?: string[];
  mayorDecided?: boolean;
}

export interface TimelineEvent {
  id: string;
  round: number;
  phase: GamePhase;
  timestamp: number;
  type: 'MATCH_START' | 'NIGHT_START' | 'DAWN_ANNOUNCEMENT' | 'DISCUSSION_START' | 'VOTING_START' | 'ELIMINATION' | 'MATCH_END';
  title: string;
  description: string;
  publicPayload?: any;
  secretPayload?: any; // Only revealed at match end
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

/**
 * Public/Stripped Player View visible to clients during gameplay
 */
export interface PublicPlayerView {
  id: string;
  nickname: string;
  avatarId: string;
  isHost: boolean;
  isBot: boolean;
  isReady: boolean;
  isConnected: boolean;
  seatNumber: number;
  isAlive: boolean;
  isMayor: boolean;
  hasRaisedHand: boolean;
  // If match finished OR config.revealRoleOnDeath & player is dead
  revealedRole?: Role;
  // During open voting / post-voting
  votedTargetId?: string | null;
}

/**
 * Private Player Snapshot sent securely over WebSocket to this specific player
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
    witchCharges?: PlayerWitchCharges;
    doctorSelfHealUsed?: boolean;
    lastDoctorTargetId?: string | null;
    investigationLog?: DetectiveEntry[];
    // Fellow assassins if current player is assassin
    fellowAssassinIds?: string[];
    // Pending submission
    currentNightAction?: NightSubmission | null;
    currentVote?: string | null;
  };
  room: {
    roomId: string;
    roomCode: string;
    phase: GamePhase;
    roundNumber: number;
    phaseTimeRemaining: number;
    config: RoomConfig;
    players: PublicPlayerView[];
    aliveCount: number;
    winner: VictoryWinner | null;
    dawnSummary: DawnSummary | null;
    lastVotingSummary: VotingSummary | null;
    timeline: TimelineEvent[];
    allRolesRevealed?: Record<string, Role>; // Provided only when phase is FINISHED
  };
}
