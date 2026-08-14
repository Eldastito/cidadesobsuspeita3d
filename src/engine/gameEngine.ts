/**
 * Cidade Sob Suspeita 3D - Deterministic Game Engine
 * Authoritative State Machine & Canonical Rule Resolver
 */

import {
  DawnSummary,
  DetectiveEntry,
  GamePhase,
  NightActionType,
  NightSubmission,
  Player,
  PrivatePlayerSnapshot,
  PublicPlayerView,
  Role,
  RoleAlignment,
  RoomConfig,
  TimelineEvent,
  VictoryWinner,
  VotingSummary,
} from './types.ts';
import { generateRoleDeck, ROLE_METADATA, secureShuffle } from './rules.ts';

export class GameEngine {
  public roomId: string;
  public roomCode: string;
  public config: RoomConfig;
  public phase: GamePhase = GamePhase.LOBBY;
  public roundNumber: number = 0;
  public phaseTimeRemaining: number = 0;
  public players: Map<string, Player> = new Map();
  public winner: VictoryWinner | null = null;
  public dawnSummary: DawnSummary | null = null;
  public lastVotingSummary: VotingSummary | null = null;
  public timeline: TimelineEvent[] = [];
  
  // Pending actions during current phase
  public pendingNightActions: Map<string, NightSubmission> = new Map();
  public pendingVotes: Map<string, string | null> = new Map();
  public tieCandidateIds: string[] = [];

  constructor(roomId: string, roomCode: string, config: RoomConfig) {
    this.roomId = roomId;
    this.roomCode = roomCode;
    this.config = { ...config };
  }

  public addPlayer(
    id: string,
    sessionId: string,
    nickname: string,
    avatarId: string,
    isHost: boolean,
    isBot: boolean = false
  ): Player {
    const existing = this.players.get(id);
    if (existing) {
      existing.sessionId = sessionId;
      existing.nickname = nickname;
      existing.avatarId = avatarId;
      existing.isConnected = true;
      return existing;
    }

    // Find first available seat number from 0 to 15
    const takenSeats = new Set(Array.from(this.players.values()).map(p => p.seatNumber));
    let seatNumber = 0;
    while (takenSeats.has(seatNumber) && seatNumber < 16) {
      seatNumber++;
    }

    const newPlayer: Player = {
      id,
      sessionId,
      nickname,
      avatarId,
      isHost,
      isBot,
      isReady: isBot, // Bots are always ready
      isConnected: true,
      seatNumber,
      isAlive: true,
      role: Role.CIDADAO,
      hasConfirmedRole: false,
      isMayor: false,
      witchCharges: {
        hasKillPotion: true,
        hasProtectAllPotion: true,
      },
      doctorSelfHealUsed: false,
      lastDoctorTargetId: null,
      investigationLog: [],
      votedTargetId: null,
      hasRaisedHand: false,
    };

    this.players.set(id, newPlayer);
    return newPlayer;
  }

  public removePlayer(id: string): void {
    if (this.phase === GamePhase.LOBBY) {
      this.players.delete(id);
    } else {
      const p = this.players.get(id);
      if (p) {
        p.isConnected = false;
      }
    }
  }

  public setPlayerReady(id: string, isReady: boolean): void {
    const p = this.players.get(id);
    if (p) {
      p.isReady = isReady;
    }
  }

  public canStartMatch(): { allowed: boolean; reason?: string } {
    if (this.phase !== GamePhase.LOBBY) {
      return { allowed: false, reason: 'A partida já está em andamento.' };
    }
    const playerList = Array.from(this.players.values());
    if (playerList.length < this.config.minPlayers) {
      return {
        allowed: false,
        reason: `Mínimo de ${this.config.minPlayers} jogadores necessário. (Atualmente: ${playerList.length})`,
      };
    }
    const unready = playerList.filter(p => !p.isReady);
    if (unready.length > 0) {
      return {
        allowed: false,
        reason: `Aguardando jogadores confirmarem "Pronto": ${unready.map(u => u.nickname).join(', ')}`,
      };
    }
    return { allowed: true };
  }

  public startMatch(): boolean {
    const check = this.canStartMatch();
    if (!check.allowed) return false;

    const playerList = Array.from(this.players.values());
    const deck = generateRoleDeck(playerList.length, this.config);
    const shuffledRoles = secureShuffle(deck);

    // Assign roles & reset runtime state
    playerList.forEach((player, idx) => {
      player.role = shuffledRoles[idx] || Role.CIDADAO;
      player.isAlive = true;
      player.hasConfirmedRole = player.isBot; // Auto confirm for bots
      player.witchCharges = { hasKillPotion: true, hasProtectAllPotion: true };
      player.doctorSelfHealUsed = false;
      player.lastDoctorTargetId = null;
      player.investigationLog = [];
      player.votedTargetId = null;
      player.hasRaisedHand = false;
      player.deathReason = undefined;
      player.deathRound = undefined;
      player.isMayor = false;
    });

    // Assign Mayor if enabled
    if (this.config.enableMayorTiebreak) {
      const nonAssassins = playerList.filter(p => p.role !== Role.ASSASSINO);
      const mayorCandidate = nonAssassins[Math.floor(Math.random() * nonAssassins.length)] || playerList[0];
      if (mayorCandidate) {
        mayorCandidate.isMayor = true;
      }
    }

    this.roundNumber = 1;
    this.winner = null;
    this.dawnSummary = null;
    this.lastVotingSummary = null;
    this.pendingNightActions.clear();
    this.pendingVotes.clear();
    this.timeline = [];

    this.addTimelineEvent('MATCH_START', 'Início da Partida', 'A cidade fecha os portões. Os papéis foram distribuídos.');

    this.phase = GamePhase.ROLE_REVEAL;
    this.phaseTimeRemaining = 12; // 12 seconds to read role tutorial

    return true;
  }

  public confirmRole(playerId: string): void {
    const p = this.players.get(playerId);
    if (p) {
      p.hasConfirmedRole = true;
    }
  }

  public areAllRolesConfirmed(): boolean {
    const active = Array.from(this.players.values()).filter(p => p.isConnected);
    return active.every(p => p.hasConfirmedRole);
  }

  public startNight(): void {
    this.phase = GamePhase.NIGHT_ACTIONS;
    this.phaseTimeRemaining = this.config.nightDurationSeconds;
    this.pendingNightActions.clear();

    this.addTimelineEvent(
      'NIGHT_START',
      `Noite ${this.roundNumber}`,
      `A escuridão recai sobre a cidade. Os personagens especiais agem nas sombras.`
    );
  }

  public submitNightAction(submission: NightSubmission): { accepted: boolean; message?: string } {
    if (this.phase !== GamePhase.NIGHT_ACTIONS) {
      return { accepted: false, message: 'Não estamos na fase da noite.' };
    }

    const player = this.players.get(submission.playerId);
    if (!player || !player.isAlive) {
      return { accepted: false, message: 'Jogador inválido ou morto.' };
    }

    // Validation by Role
    if (player.role === Role.CIDADAO) {
      return { accepted: false, message: 'Cidadãos não possuem ação noturna.' };
    }

    const target = submission.targetId ? this.players.get(submission.targetId) : null;

    if (submission.actionType === NightActionType.PASS) {
      this.pendingNightActions.set(player.id, submission);
      return { accepted: true };
    }

    if (player.role === Role.ASSASSINO) {
      if (submission.actionType !== NightActionType.KILL || !target || !target.isAlive) {
        return { accepted: false, message: 'Alvo de eliminação inválido.' };
      }
      if (target.role === Role.ASSASSINO) {
        return { accepted: false, message: 'Assassinos não podem alvejar comparsas.' };
      }
    }

    if (player.role === Role.MEDICO) {
      if (submission.actionType !== NightActionType.HEAL || !target || !target.isAlive) {
        return { accepted: false, message: 'Alvo de cura inválido.' };
      }
      if (target.id === player.id) {
        if (player.doctorSelfHealUsed) {
          return { accepted: false, message: 'Você já usou sua única auto-proteção na partida.' };
        }
      }
      if (player.lastDoctorTargetId === target.id) {
        return { accepted: false, message: 'Você não pode proteger a mesma pessoa em noites consecutivas.' };
      }
    }

    if (player.role === Role.DETETIVE) {
      if (submission.actionType !== NightActionType.INVESTIGATE || !target || !target.isAlive) {
        return { accepted: false, message: 'Alvo de investigação inválido.' };
      }
      if (target.id === player.id) {
        return { accepted: false, message: 'O Detetive não pode investigar a si mesmo.' };
      }
    }

    if (player.role === Role.BRUXA) {
      if (submission.actionType === NightActionType.WITCH_KILL) {
        if (!player.witchCharges.hasKillPotion) {
          return { accepted: false, message: 'Poção de morte já foi utilizada.' };
        }
        if (!target || !target.isAlive || target.id === player.id) {
          return { accepted: false, message: 'Alvo para poção de morte inválido.' };
        }
      } else if (submission.actionType === NightActionType.WITCH_PROTECT_ALL) {
        if (!player.witchCharges.hasProtectAllPotion) {
          return { accepted: false, message: 'Poção de proteção coletiva já foi utilizada.' };
        }
      }
    }

    this.pendingNightActions.set(player.id, submission);
    return { accepted: true };
  }

  /**
   * Deterministic Canonical Night Resolution (PRD Section 3.5)
   */
  public resolveNight(): DawnSummary {
    this.phase = GamePhase.NIGHT_RESOLUTION;

    const alivePlayers = Array.from(this.players.values()).filter(p => p.isAlive);
    const assassins = alivePlayers.filter(p => p.role === Role.ASSASSINO);
    const doctor = alivePlayers.find(p => p.role === Role.MEDICO);
    const detective = alivePlayers.find(p => p.role === Role.DETETIVE);
    const witch = alivePlayers.find(p => p.role === Role.BRUXA);

    // 1. Determine Assassin Target
    let assassinTargetId: string | null = null;
    const assassinVotes: Record<string, number> = {};
    for (const a of assassins) {
      const act = this.pendingNightActions.get(a.id);
      if (act && act.actionType === NightActionType.KILL && act.targetId) {
        assassinVotes[act.targetId] = (assassinVotes[act.targetId] || 0) + 1;
      }
    }
    const sortedTargets = Object.entries(assassinVotes).sort((a, b) => b[1] - a[1]);
    if (sortedTargets.length > 0) {
      assassinTargetId = sortedTargets[0][0];
    }

    // 2. Witch Collective Protection
    let witchUsedProtectAll = false;
    if (witch && witch.witchCharges.hasProtectAllPotion) {
      const witchAct = this.pendingNightActions.get(witch.id);
      if (witchAct && witchAct.actionType === NightActionType.WITCH_PROTECT_ALL) {
        witchUsedProtectAll = true;
        witch.witchCharges.hasProtectAllPotion = false; // Consume charge
      }
    }

    // 3. Doctor Protection
    let doctorTargetId: string | null = null;
    if (doctor) {
      const docAct = this.pendingNightActions.get(doctor.id);
      if (docAct && docAct.actionType === NightActionType.HEAL && docAct.targetId) {
        doctorTargetId = docAct.targetId;
        if (doctorTargetId === doctor.id) {
          doctor.doctorSelfHealUsed = true;
        }
        doctor.lastDoctorTargetId = doctorTargetId;
      } else {
        doctor.lastDoctorTargetId = null;
      }
    }

    // 4. Witch Death Potion
    let witchKillTargetId: string | null = null;
    if (witch && witch.witchCharges.hasKillPotion) {
      const witchAct = this.pendingNightActions.get(witch.id);
      if (witchAct && witchAct.actionType === NightActionType.WITCH_KILL && witchAct.targetId) {
        witchKillTargetId = witchAct.targetId;
        witch.witchCharges.hasKillPotion = false; // Consume charge
      }
    }

    // 5. Detective Investigation
    if (detective) {
      const detAct = this.pendingNightActions.get(detective.id);
      if (detAct && detAct.actionType === NightActionType.INVESTIGATE && detAct.targetId) {
        const target = this.players.get(detAct.targetId);
        if (target) {
          const isSuspicious = target.role === Role.ASSASSINO;
          const entry: DetectiveEntry = {
            round: this.roundNumber,
            targetId: target.id,
            targetNickname: target.nickname,
            isSuspicious,
          };
          detective.investigationLog.push(entry);
        }
      }
    }

    // 6. Consolidate Deaths
    const deadSet = new Set<string>();

    // Assassin strike resolution
    if (assassinTargetId) {
      const isProtectedByWitch = witchUsedProtectAll;
      const isProtectedByDoctor = doctorTargetId === assassinTargetId;
      if (!isProtectedByWitch && !isProtectedByDoctor) {
        deadSet.add(assassinTargetId);
        const p = this.players.get(assassinTargetId);
        if (p) {
          p.deathReason = 'ASSASSIN_ATTACK';
          p.deathRound = this.roundNumber;
        }
      }
    }

    // Witch kill resolution (ignores doctor in canonical rules)
    if (witchKillTargetId) {
      deadSet.add(witchKillTargetId);
      const p = this.players.get(witchKillTargetId);
      if (p) {
        p.deathReason = 'WITCH_POTION';
        p.deathRound = this.roundNumber;
      }
    }

    // Apply deaths to player states
    const killedList: Array<{ playerId: string; nickname: string; revealedRole?: Role }> = [];
    deadSet.forEach(killedId => {
      const victim = this.players.get(killedId);
      if (victim) {
        victim.isAlive = false;
        killedList.push({
          playerId: victim.id,
          nickname: victim.nickname,
          revealedRole: this.config.revealRoleOnDeath ? victim.role : undefined,
        });
      }
    });

    let narrativeText = '';
    if (killedList.length === 0) {
      narrativeText = 'A cidade acorda em paz. Ninguém morreu nesta noite sombria!';
    } else if (killedList.length === 1) {
      narrativeText = `O sino da igreja toca tristemente. ${killedList[0].nickname} foi encontrado sem vida.`;
    } else {
      narrativeText = `Uma terrível tragédia assolou a cidade! Morreram: ${killedList.map(k => k.nickname).join(' e ')}.`;
    }

    this.dawnSummary = {
      round: this.roundNumber,
      killedPlayerIds: Array.from(deadSet),
      deaths: killedList,
      narrativeText,
    };

    this.addTimelineEvent(
      'DAWN_ANNOUNCEMENT',
      `Amanhecer do Dia ${this.roundNumber}`,
      narrativeText,
      { killedPlayerIds: Array.from(deadSet) },
      {
        assassinTargetId,
        doctorTargetId,
        witchUsedProtectAll,
        witchKillTargetId,
      }
    );

    this.checkVictoryCondition();

    return this.dawnSummary;
  }

  public startDawn(): void {
    this.phase = GamePhase.DAWN;
    this.phaseTimeRemaining = 7; // 7 seconds for dramatic dawn announcement
  }

  public startDiscussion(): void {
    if (this.checkVictoryCondition()) return;

    this.phase = GamePhase.DISCUSSION;
    this.phaseTimeRemaining = this.config.discussionDurationSeconds;
    this.pendingVotes.clear();

    // Reset hand raises
    this.players.forEach(p => (p.hasRaisedHand = false));

    this.addTimelineEvent(
      'DISCUSSION_START',
      `Debate do Dia ${this.roundNumber}`,
      'Os cidadãos se reúnem na praça central para discutir as suspeitas.'
    );
  }

  public toggleHandRaise(playerId: string): void {
    const p = this.players.get(playerId);
    if (p && p.isAlive) {
      p.hasRaisedHand = !p.hasRaisedHand;
    }
  }

  public startVoting(): void {
    if (this.checkVictoryCondition()) return;

    this.phase = GamePhase.VOTING;
    this.phaseTimeRemaining = this.config.votingDurationSeconds;
    this.pendingVotes.clear();
    this.players.forEach(p => (p.votedTargetId = null));

    this.addTimelineEvent(
      'VOTING_START',
      `Votação do Dia ${this.roundNumber}`,
      'Chegou a hora de decidir quem deve ser levado a julgamento.'
    );
  }

  public submitVote(voterId: string, targetId: string | null): { accepted: boolean; message?: string } {
    if (this.phase !== GamePhase.VOTING && this.phase !== GamePhase.RUNOFF && this.phase !== GamePhase.MAYOR_TIEBREAK) {
      return { accepted: false, message: 'A votação não está aberta.' };
    }

    const voter = this.players.get(voterId);
    if (!voter || !voter.isAlive) {
      return { accepted: false, message: 'Apenas jogadores vivos podem votar.' };
    }

    if (this.phase === GamePhase.MAYOR_TIEBREAK) {
      if (!voter.isMayor) {
        return { accepted: false, message: 'Apenas o Prefeito pode decidir o voto de desempate.' };
      }
      if (!targetId || !this.tieCandidateIds.includes(targetId)) {
        return { accepted: false, message: 'O Prefeito deve escolher um dos candidatos empatados.' };
      }
    }

    if (targetId) {
      const target = this.players.get(targetId);
      if (!target || !target.isAlive) {
        return { accepted: false, message: 'Alvo de voto inválido.' };
      }
      if (this.phase === GamePhase.RUNOFF && !this.tieCandidateIds.includes(targetId)) {
        return { accepted: false, message: 'No segundo turno, vote apenas em um dos empatados.' };
      }
    }

    voter.votedTargetId = targetId;
    this.pendingVotes.set(voterId, targetId);
    return { accepted: true };
  }

  /**
   * Deterministic Day & Voting Resolution
   */
  public resolveVoting(): VotingSummary {
    const previousPhase = this.phase;
    this.phase = GamePhase.DAY_RESOLUTION;

    const aliveVoters = Array.from(this.players.values()).filter(p => p.isAlive);
    const voteCounts: Record<string, number> = {};
    const votesRecord: Record<string, string | null> = {};

    aliveVoters.forEach(voter => {
      const targetId = this.pendingVotes.get(voter.id) ?? null;
      votesRecord[voter.id] = targetId;
      if (targetId) {
        voteCounts[targetId] = (voteCounts[targetId] || 0) + 1;
      }
    });

    // Find highest vote count
    const sortedCandidates = Object.entries(voteCounts).sort((a, b) => b[1] - a[1]);
    let eliminatedId: string | null = null;
    let wasTie = false;
    let tiedIds: string[] = [];

    if (sortedCandidates.length > 0) {
      const topCount = sortedCandidates[0][1];
      const topCandidates = sortedCandidates.filter(c => c[1] === topCount).map(c => c[0]);

      if (topCandidates.length === 1) {
        eliminatedId = topCandidates[0];
      } else {
        wasTie = true;
        tiedIds = topCandidates;
      }
    }

    // Handle Mayor tiebreak trigger if needed
    const mayor = aliveVoters.find(p => p.isMayor);
    if (wasTie && mayor && this.config.enableMayorTiebreak && previousPhase !== GamePhase.MAYOR_TIEBREAK) {
      this.tieCandidateIds = tiedIds;
      this.phase = GamePhase.MAYOR_TIEBREAK;
      this.phaseTimeRemaining = 20; // 20s for Mayor decision
      // Return temporary summary without eliminating yet
      return {
        round: this.roundNumber,
        eliminatedPlayerId: null,
        eliminatedNickname: null,
        votes: votesRecord,
        voteCounts,
        wasTie: true,
        tiePlayerIds: tiedIds,
      };
    }

    let eliminatedNickname: string | null = null;
    let revealedRole: Role | undefined;

    if (eliminatedId) {
      const victim = this.players.get(eliminatedId);
      if (victim) {
        victim.isAlive = false;
        victim.deathReason = 'VOTED_OUT';
        victim.deathRound = this.roundNumber;
        eliminatedNickname = victim.nickname;
        if (this.config.revealRoleOnDeath) {
          revealedRole = victim.role;
        }

        this.addTimelineEvent(
          'ELIMINATION',
          `Julgamento do Dia ${this.roundNumber}`,
          `Por decisão da maioria, ${victim.nickname} foi eliminado pela cidade.`,
          { eliminatedPlayerId: victim.id, votes: votesRecord }
        );
      }
    } else {
      this.addTimelineEvent(
        'ELIMINATION',
        `Julgamento do Dia ${this.roundNumber}`,
        'Não houve consenso ou votos suficientes. Ninguém foi eliminado hoje.',
        { votes: votesRecord }
      );
    }

    this.lastVotingSummary = {
      round: this.roundNumber,
      eliminatedPlayerId: eliminatedId,
      eliminatedNickname,
      revealedRole,
      votes: votesRecord,
      voteCounts,
      wasTie,
      tiePlayerIds: tiedIds,
    };

    this.checkVictoryCondition();

    return this.lastVotingSummary;
  }

  public checkVictoryCondition(): boolean {
    const alivePlayers = Array.from(this.players.values()).filter(p => p.isAlive);
    const aliveAssassins = alivePlayers.filter(p => p.role === Role.ASSASSINO);
    const aliveTown = alivePlayers.filter(p => p.role !== Role.ASSASSINO);

    if (aliveAssassins.length === 0) {
      this.winner = VictoryWinner.TOWN;
      this.phase = GamePhase.FINISHED;
      this.addTimelineEvent(
        'MATCH_END',
        'Vitória da Cidade!',
        'Todos os assassinos foram desmascarados e eliminados. A paz retorna à cidade!'
      );
      return true;
    }

    if (aliveAssassins.length >= aliveTown.length) {
      this.winner = VictoryWinner.ASSASSINS;
      this.phase = GamePhase.FINISHED;
      this.addTimelineEvent(
        'MATCH_END',
        'Vitória dos Assassinos!',
        'Os assassinos assumiram o controle da cidade. Ninguém mais está a salvo!'
      );
      return true;
    }

    if (alivePlayers.length === 0) {
      this.winner = VictoryWinner.DRAW;
      this.phase = GamePhase.FINISHED;
      this.addTimelineEvent('MATCH_END', 'Empate Trágico', 'Todos pereceram nesta sangrenta disputa.');
      return true;
    }

    return false;
  }

  public nextRound(): void {
    if (this.winner) return;
    this.roundNumber += 1;
    this.startNight();
  }

  public addTimelineEvent(
    type: TimelineEvent['type'],
    title: string,
    description: string,
    publicPayload?: any,
    secretPayload?: any
  ): void {
    this.timeline.push({
      id: `evt-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
      round: this.roundNumber,
      phase: this.phase,
      timestamp: Date.now(),
      type,
      title,
      description,
      publicPayload,
      secretPayload,
    });
  }

  /**
   * Generates a safe, stripped private snapshot tailored strictly for one player
   * NO secret roles or actions of others are leaked!
   */
  public getPrivateSnapshot(playerId: string): PrivatePlayerSnapshot | null {
    const player = this.players.get(playerId);
    if (!player) return null;

    const publicPlayers: PublicPlayerView[] = Array.from(this.players.values()).map(p => ({
      id: p.id,
      nickname: p.nickname,
      avatarId: p.avatarId,
      isHost: p.isHost,
      isBot: p.isBot,
      isReady: p.isReady,
      isConnected: p.isConnected,
      seatNumber: p.seatNumber,
      isAlive: p.isAlive,
      isMayor: p.isMayor,
      hasRaisedHand: p.hasRaisedHand,
      revealedRole:
        this.phase === GamePhase.FINISHED
          ? p.role
          : this.config.revealRoleOnDeath && !p.isAlive
          ? p.role
          : undefined,
      votedTargetId:
        this.phase === GamePhase.DAY_RESOLUTION || this.phase === GamePhase.FINISHED
          ? p.votedTargetId
          : undefined,
    }));

    // Fellow assassins known only if player is Assassin
    let fellowAssassinIds: string[] | undefined;
    if (player.role === Role.ASSASSINO) {
      fellowAssassinIds = Array.from(this.players.values())
        .filter(p => p.role === Role.ASSASSINO && p.id !== player.id)
        .map(p => p.id);
    }

    // In FINISHED phase, reveal all roles for full audit
    const allRolesRevealed: Record<string, Role> | undefined =
      this.phase === GamePhase.FINISHED
        ? Array.from(this.players.values()).reduce((acc, p) => {
            acc[p.id] = p.role;
            return acc;
          }, {} as Record<string, Role>)
        : undefined;

    return {
      player: {
        id: player.id,
        nickname: player.nickname,
        avatarId: player.avatarId,
        seatNumber: player.seatNumber,
        isHost: player.isHost,
        isAlive: player.isAlive,
        isMayor: player.isMayor,
        role: player.role,
        hasConfirmedRole: player.hasConfirmedRole,
        witchCharges: player.role === Role.BRUXA ? player.witchCharges : undefined,
        doctorSelfHealUsed: player.role === Role.MEDICO ? player.doctorSelfHealUsed : undefined,
        lastDoctorTargetId: player.role === Role.MEDICO ? player.lastDoctorTargetId : undefined,
        investigationLog: player.role === Role.DETETIVE ? player.investigationLog : undefined,
        fellowAssassinIds,
        currentNightAction: this.pendingNightActions.get(player.id) || null,
        currentVote: this.pendingVotes.get(player.id) || null,
      },
      room: {
        roomId: this.roomId,
        roomCode: this.roomCode,
        phase: this.phase,
        roundNumber: this.roundNumber,
        phaseTimeRemaining: this.phaseTimeRemaining,
        config: this.config,
        players: publicPlayers,
        aliveCount: Array.from(this.players.values()).filter(p => p.isAlive).length,
        winner: this.winner,
        dawnSummary: this.dawnSummary,
        lastVotingSummary: this.lastVotingSummary,
        timeline: this.timeline.map(t => ({
          ...t,
          // Only show secret payload in finished replay
          secretPayload: this.phase === GamePhase.FINISHED ? t.secretPayload : undefined,
        })),
        allRolesRevealed,
      },
    };
  }
}
