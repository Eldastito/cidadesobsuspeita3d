/**
 * Cidade Sob Suspeita 3D — Motor de regras determinístico
 * Máquina de estados autoritativa. Puro: sem rede, DOM ou timers próprios.
 * A cadência (tick/fases) é dirigida de fora (RoomManager ou testes).
 */

import {
  DawnSummary,
  DetectiveEntry,
  GamePhase,
  NightActionType,
  NightSubmission,
  PHASE_DURATIONS,
  Player,
  PrivatePlayerSnapshot,
  PublicPlayerView,
  Role,
  RoomConfig,
  TimelineEvent,
  VictoryWinner,
  VotingOutcome,
  VotingSummary,
} from './types.ts';
import { generateRoleDeck, securePick, secureShuffle, validateComposition } from './rules.ts';

const MAX_SEATS = 16;

export class GameEngine {
  public roomId: string;
  public roomCode: string;
  public config: RoomConfig;
  public phase: GamePhase = GamePhase.LOBBY;
  public roundNumber: number = 0;
  public phaseTimeRemaining: number = 0;
  public phaseDuration: number = 0;
  public players: Map<string, Player> = new Map();
  public winner: VictoryWinner | null = null;
  public dawnSummary: DawnSummary | null = null;
  public lastVotingSummary: VotingSummary | null = null;
  public timeline: TimelineEvent[] = [];

  // Ações pendentes na fase atual
  public pendingNightActions: Map<string, NightSubmission> = new Map();
  public pendingVotes: Map<string, string | null> = new Map();
  public tieCandidateIds: string[] = [];

  private now: () => number;
  private eventSeq = 0;

  constructor(roomId: string, roomCode: string, config: RoomConfig, nowFn: () => number = () => Date.now()) {
    this.roomId = roomId;
    this.roomCode = roomCode;
    this.config = { ...config, rolesCount: { ...config.rolesCount } };
    this.now = nowFn;
  }

  // ── Lobby ────────────────────────────────────────────────────────────────

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

    const takenSeats = new Set(Array.from(this.players.values()).map(p => p.seatNumber));
    let seatNumber = 0;
    while (takenSeats.has(seatNumber) && seatNumber < MAX_SEATS) {
      seatNumber++;
    }

    const newPlayer: Player = {
      id,
      sessionId,
      nickname,
      avatarId,
      isHost,
      isBot,
      isReady: isBot,
      isConnected: true,
      seatNumber,
      isAlive: true,
      role: Role.CIDADAO,
      hasConfirmedRole: false,
      isMayor: false,
      witchCharges: { hasKillPotion: true, hasProtectAllPotion: true },
      doctorSelfHealUsed: false,
      lastDoctorTargetId: null,
      investigationLog: [],
      hunchLog: [],
      votedTargetId: null,
      hasRaisedHand: false,
    };

    this.players.set(id, newPlayer);
    return newPlayer;
  }

  public removePlayer(id: string): void {
    if (this.phase === GamePhase.LOBBY) {
      this.players.delete(id);
      this.ensureHost();
    } else {
      const p = this.players.get(id);
      if (p) p.isConnected = false;
    }
  }

  /** Garante que sempre exista um anfitrião (transferência automática no lobby). */
  public ensureHost(): void {
    const list = Array.from(this.players.values());
    if (list.length === 0) return;
    if (list.some(p => p.isHost && !p.isBot)) return;
    list.forEach(p => (p.isHost = false));
    const nextHost = list.find(p => !p.isBot) || list[0];
    nextHost.isHost = true;
  }

  public setPlayerReady(id: string, isReady: boolean): void {
    const p = this.players.get(id);
    if (p) p.isReady = isReady;
  }

  public canStartMatch(): { allowed: boolean; reason?: string } {
    if (this.phase !== GamePhase.LOBBY) {
      return { allowed: false, reason: 'A partida já está em andamento.' };
    }
    const playerList = Array.from(this.players.values());
    if (playerList.length < this.config.minPlayers) {
      return {
        allowed: false,
        reason: `Mínimo de ${this.config.minPlayers} jogadores. (Atualmente: ${playerList.length})`,
      };
    }
    const composition = validateComposition(playerList.length, this.config.rolesCount);
    if (!composition.valid) {
      return { allowed: false, reason: composition.reason };
    }
    const unready = playerList.filter(p => !p.isReady);
    if (unready.length > 0) {
      return {
        allowed: false,
        reason: `Aguardando "pronto" de: ${unready.map(u => u.nickname).join(', ')}`,
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

    playerList.forEach((player, idx) => {
      player.role = shuffledRoles[idx] || Role.CIDADAO;
      player.isAlive = true;
      player.hasConfirmedRole = player.isBot;
      player.witchCharges = { hasKillPotion: true, hasProtectAllPotion: true };
      player.doctorSelfHealUsed = false;
      player.lastDoctorTargetId = null;
      player.investigationLog = [];
      player.hunchLog = [];
      player.votedTargetId = null;
      player.hasRaisedHand = false;
      player.deathReason = undefined;
      player.deathRound = undefined;
      player.isMayor = false;
    });

    // Prefeito público sorteado entre não-assassinos (CSPRNG)
    if (this.config.enableMayorTiebreak && this.config.rolesCount.mayor > 0) {
      const nonAssassins = playerList.filter(p => p.role !== Role.ASSASSINO);
      const mayorCandidate = securePick(nonAssassins) || playerList[0];
      if (mayorCandidate) mayorCandidate.isMayor = true;
    }

    this.roundNumber = 1;
    this.winner = null;
    this.dawnSummary = null;
    this.lastVotingSummary = null;
    this.pendingNightActions.clear();
    this.pendingVotes.clear();
    this.tieCandidateIds = [];
    this.timeline = [];
    this.eventSeq = 0;

    this.addTimelineEvent('MATCH_START', 'Início da partida', 'Os portões se fecham e os papéis são distribuídos em segredo.');

    this.phase = GamePhase.ROLE_REVEAL;
    this.setTimer(PHASE_DURATIONS.roleReveal);
    return true;
  }

  /** Rearma a sala para uma revanche, mantendo jogadores e assentos. */
  public resetForRematch(): void {
    this.phase = GamePhase.LOBBY;
    this.roundNumber = 0;
    this.winner = null;
    this.dawnSummary = null;
    this.lastVotingSummary = null;
    this.tieCandidateIds = [];
    this.pendingNightActions.clear();
    this.pendingVotes.clear();
    this.timeline = [];
    this.phaseTimeRemaining = 0;
    this.phaseDuration = 0;
    this.players.forEach(p => {
      p.isAlive = true;
      p.isReady = p.isBot;
      p.hasConfirmedRole = false;
      p.isMayor = false;
      p.votedTargetId = null;
      p.hasRaisedHand = false;
      p.deathReason = undefined;
      p.deathRound = undefined;
    });
    // Remove jogadores que abandonaram durante a partida
    Array.from(this.players.values())
      .filter(p => !p.isConnected && !p.isBot)
      .forEach(p => this.players.delete(p.id));
    this.ensureHost();
  }

  public confirmRole(playerId: string): void {
    const p = this.players.get(playerId);
    if (p) p.hasConfirmedRole = true;
  }

  public areAllRolesConfirmed(): boolean {
    const active = Array.from(this.players.values()).filter(p => p.isConnected);
    return active.length > 0 && active.every(p => p.hasConfirmedRole);
  }

  // ── Noite ────────────────────────────────────────────────────────────────

  public startNight(): void {
    this.phase = GamePhase.NIGHT_ACTIONS;
    this.setTimer(this.config.nightDurationSeconds);
    this.pendingNightActions.clear();

    this.addTimelineEvent(
      'NIGHT_START',
      `Noite ${this.roundNumber}`,
      'A escuridão cobre a cidade e cada um se recolhe com seus segredos.'
    );
  }

  public submitNightAction(submission: NightSubmission): { accepted: boolean; message?: string } {
    if (this.phase !== GamePhase.NIGHT_ACTIONS) {
      return { accepted: false, message: 'Não estamos na fase da noite.' };
    }

    const player = this.players.get(submission.playerId);
    if (!player || !player.isAlive) {
      return { accepted: false, message: 'Jogador inválido ou eliminado.' };
    }

    const target = submission.targetId ? this.players.get(submission.targetId) : null;

    // "Não agir" é sempre válido; reenvio substitui a ação anterior (idempotente).
    if (submission.actionType === NightActionType.PASS) {
      this.pendingNightActions.set(player.id, submission);
      return { accepted: true };
    }

    switch (player.role) {
      case Role.CIDADAO: {
        if (submission.actionType !== NightActionType.OBSERVE || !target || !target.isAlive || target.id === player.id) {
          return { accepted: false, message: 'Escolha outro morador vivo para observar.' };
        }
        break;
      }
      case Role.ASSASSINO: {
        if (submission.actionType !== NightActionType.KILL || !target || !target.isAlive) {
          return { accepted: false, message: 'Alvo de ataque inválido.' };
        }
        if (target.role === Role.ASSASSINO) {
          return { accepted: false, message: 'Assassinos não podem atacar comparsas.' };
        }
        break;
      }
      case Role.MEDICO: {
        if (submission.actionType !== NightActionType.HEAL || !target || !target.isAlive) {
          return { accepted: false, message: 'Alvo de proteção inválido.' };
        }
        if (target.id === player.id && player.doctorSelfHealUsed) {
          return { accepted: false, message: 'Você já usou sua única autoproteção nesta partida.' };
        }
        if (player.lastDoctorTargetId === target.id) {
          return { accepted: false, message: 'Não é permitido proteger a mesma pessoa em noites seguidas.' };
        }
        break;
      }
      case Role.DETETIVE: {
        if (submission.actionType !== NightActionType.INVESTIGATE || !target || !target.isAlive) {
          return { accepted: false, message: 'Alvo de investigação inválido.' };
        }
        if (target.id === player.id) {
          return { accepted: false, message: 'O Detetive não investiga a si mesmo.' };
        }
        break;
      }
      case Role.BRUXA: {
        if (submission.actionType === NightActionType.WITCH_KILL) {
          if (!player.witchCharges.hasKillPotion) {
            return { accepted: false, message: 'A poção de morte já foi usada.' };
          }
          if (!target || !target.isAlive || target.id === player.id) {
            return { accepted: false, message: 'Alvo inválido para a poção de morte.' };
          }
        } else if (submission.actionType === NightActionType.WITCH_PROTECT_ALL) {
          if (!player.witchCharges.hasProtectAllPotion) {
            return { accepted: false, message: 'A proteção coletiva já foi usada.' };
          }
        } else {
          return { accepted: false, message: 'Ação inválida para a Bruxa.' };
        }
        break;
      }
    }

    this.pendingNightActions.set(player.id, submission);
    return { accepted: true };
  }

  /** Todos os vivos conectados já enviaram algo? (evita vazar timing por fase encurtada) */
  public allNightActionsSubmitted(): boolean {
    const alive = Array.from(this.players.values()).filter(p => p.isAlive && (p.isConnected || p.isBot));
    return alive.length > 0 && alive.every(p => this.pendingNightActions.has(p.id));
  }

  /**
   * Resolução canônica e determinística da noite (PRD 3.5).
   * Não verifica vitória — quem dirige as fases decide quando checar,
   * para que o amanhecer seja exibido antes do fim da partida.
   */
  public resolveNight(): DawnSummary {
    this.phase = GamePhase.NIGHT_RESOLUTION;

    const alivePlayers = Array.from(this.players.values()).filter(p => p.isAlive);
    const assassins = alivePlayers.filter(p => p.role === Role.ASSASSINO);
    const doctor = alivePlayers.find(p => p.role === Role.MEDICO);
    const detective = alivePlayers.find(p => p.role === Role.DETETIVE);
    const witch = alivePlayers.find(p => p.role === Role.BRUXA);

    // 1. Alvo dos assassinos: maioria simples; empate interno é sorteado (CSPRNG)
    let assassinTargetId: string | null = null;
    const assassinVotes: Record<string, number> = {};
    for (const a of assassins) {
      const act = this.pendingNightActions.get(a.id);
      if (act && act.actionType === NightActionType.KILL && act.targetId) {
        assassinVotes[act.targetId] = (assassinVotes[act.targetId] || 0) + 1;
      }
    }
    const targetEntries = Object.entries(assassinVotes);
    if (targetEntries.length > 0) {
      const topCount = Math.max(...targetEntries.map(([, n]) => n));
      const topTargets = targetEntries.filter(([, n]) => n === topCount).map(([id]) => id);
      assassinTargetId = securePick(topTargets) || null;
    }

    // 2. Proteção coletiva da Bruxa
    let witchUsedProtectAll = false;
    if (witch && witch.witchCharges.hasProtectAllPotion) {
      const witchAct = this.pendingNightActions.get(witch.id);
      if (witchAct && witchAct.actionType === NightActionType.WITCH_PROTECT_ALL) {
        witchUsedProtectAll = true;
        witch.witchCharges.hasProtectAllPotion = false;
      }
    }

    // 3. Proteção do Médico
    let doctorTargetId: string | null = null;
    if (doctor) {
      const docAct = this.pendingNightActions.get(doctor.id);
      if (docAct && docAct.actionType === NightActionType.HEAL && docAct.targetId) {
        doctorTargetId = docAct.targetId;
        if (doctorTargetId === doctor.id) doctor.doctorSelfHealUsed = true;
        doctor.lastDoctorTargetId = doctorTargetId;
      } else {
        doctor.lastDoctorTargetId = null;
      }
    }

    // 4. Poção de morte da Bruxa (não é bloqueada pelo Médico no modo padrão)
    let witchKillTargetId: string | null = null;
    if (witch && witch.witchCharges.hasKillPotion) {
      const witchAct = this.pendingNightActions.get(witch.id);
      if (witchAct && witchAct.actionType === NightActionType.WITCH_KILL && witchAct.targetId) {
        witchKillTargetId = witchAct.targetId;
        witch.witchCharges.hasKillPotion = false;
      }
    }

    // 5. Investigação do Detetive
    if (detective) {
      const detAct = this.pendingNightActions.get(detective.id);
      if (detAct && detAct.actionType === NightActionType.INVESTIGATE && detAct.targetId) {
        const target = this.players.get(detAct.targetId);
        if (target) {
          const entry: DetectiveEntry = {
            round: this.roundNumber,
            targetId: target.id,
            targetNickname: target.nickname,
            isSuspicious: target.role === Role.ASSASSINO,
          };
          detective.investigationLog.push(entry);
        }
      }
    }

    // 5b. Palpites dos cidadãos (sem efeito mecânico, só memória privada)
    for (const p of alivePlayers) {
      if (p.role !== Role.CIDADAO) continue;
      const act = this.pendingNightActions.get(p.id);
      if (act && act.actionType === NightActionType.OBSERVE && act.targetId) {
        const target = this.players.get(act.targetId);
        if (target) {
          p.hunchLog.push({ round: this.roundNumber, targetId: target.id, targetNickname: target.nickname });
        }
      }
    }

    // 6. Consolidação das mortes (idempotente via Set)
    const deadSet = new Set<string>();

    if (assassinTargetId) {
      const isProtected = witchUsedProtectAll || doctorTargetId === assassinTargetId;
      if (!isProtected) {
        deadSet.add(assassinTargetId);
        const p = this.players.get(assassinTargetId);
        if (p) {
          p.deathReason = 'ASSASSIN_ATTACK';
          p.deathRound = this.roundNumber;
        }
      }
    }

    if (witchKillTargetId) {
      const p = this.players.get(witchKillTargetId);
      if (p && !deadSet.has(witchKillTargetId)) {
        p.deathReason = 'WITCH_POTION';
        p.deathRound = this.roundNumber;
      }
      deadSet.add(witchKillTargetId);
    }

    const killedList: DawnSummary['deaths'] = [];
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
      narrativeText = 'A cidade acorda aliviada: ninguém morreu esta noite.';
    } else if (killedList.length === 1) {
      narrativeText = `O sino da capela toca devagar. ${killedList[0].nickname} foi encontrado sem vida ao amanhecer.`;
    } else {
      narrativeText = `Uma noite terrível se abateu sobre a cidade. Perdemos ${killedList.map(k => k.nickname).join(' e ')}.`;
    }

    this.dawnSummary = {
      round: this.roundNumber,
      killedPlayerIds: Array.from(deadSet),
      deaths: killedList,
      narrativeText,
    };

    this.addTimelineEvent(
      'DAWN_ANNOUNCEMENT',
      `Amanhecer do dia ${this.roundNumber}`,
      narrativeText,
      { killedPlayerIds: Array.from(deadSet) },
      { assassinTargetId, doctorTargetId, witchUsedProtectAll, witchKillTargetId }
    );

    return this.dawnSummary;
  }

  public startDawn(): void {
    this.phase = GamePhase.DAWN;
    this.setTimer(PHASE_DURATIONS.dawn);
  }

  // ── Dia ──────────────────────────────────────────────────────────────────

  public startDiscussion(): void {
    this.phase = GamePhase.DISCUSSION;
    this.setTimer(this.config.discussionDurationSeconds);
    this.pendingVotes.clear();
    this.players.forEach(p => (p.hasRaisedHand = false));

    this.addTimelineEvent(
      'DISCUSSION_START',
      `Debate do dia ${this.roundNumber}`,
      'Os vivos se reúnem na praça para trocar acusações e suspeitas.'
    );
  }

  public toggleHandRaise(playerId: string): void {
    const p = this.players.get(playerId);
    if (p && p.isAlive) p.hasRaisedHand = !p.hasRaisedHand;
  }

  public startVoting(): void {
    this.phase = GamePhase.VOTING;
    this.setTimer(this.config.votingDurationSeconds);
    this.tieCandidateIds = [];
    this.clearVotes();

    this.addTimelineEvent(
      'VOTING_START',
      `Votação do dia ${this.roundNumber}`,
      'Chegou a hora do julgamento. Cada voto é secreto até o fim da apuração.'
    );
  }

  public startRunoff(tiedIds: string[]): void {
    this.phase = GamePhase.RUNOFF;
    this.tieCandidateIds = [...tiedIds];
    this.setTimer(PHASE_DURATIONS.runoff);
    this.clearVotes();

    const names = tiedIds
      .map(id => this.players.get(id)?.nickname)
      .filter(Boolean)
      .join(' e ');
    this.addTimelineEvent(
      'RUNOFF_START',
      `Segundo turno do dia ${this.roundNumber}`,
      `Empate entre ${names}. A cidade vota novamente apenas entre os empatados.`
    );
  }

  public startMayorTiebreak(tiedIds: string[]): void {
    this.phase = GamePhase.MAYOR_TIEBREAK;
    this.tieCandidateIds = [...tiedIds];
    this.setTimer(PHASE_DURATIONS.mayorTiebreak);
    this.clearVotes();

    this.addTimelineEvent(
      'MAYOR_TIEBREAK',
      `Voto de minerva — dia ${this.roundNumber}`,
      'A votação empatou. A palavra final é do Prefeito.'
    );
  }

  private clearVotes(): void {
    this.pendingVotes.clear();
    this.players.forEach(p => (p.votedTargetId = null));
  }

  public submitVote(voterId: string, targetId: string | null): { accepted: boolean; message?: string } {
    if (this.phase !== GamePhase.VOTING && this.phase !== GamePhase.RUNOFF) {
      return { accepted: false, message: 'A votação não está aberta.' };
    }

    const voter = this.players.get(voterId);
    if (!voter || !voter.isAlive) {
      return { accepted: false, message: 'Apenas jogadores vivos podem votar.' };
    }

    if (targetId) {
      const target = this.players.get(targetId);
      if (!target || !target.isAlive) {
        return { accepted: false, message: 'Alvo de voto inválido.' };
      }
      if (this.phase === GamePhase.RUNOFF && !this.tieCandidateIds.includes(targetId)) {
        return { accepted: false, message: 'No segundo turno, vote apenas entre os empatados.' };
      }
    }

    voter.votedTargetId = targetId;
    this.pendingVotes.set(voterId, targetId);
    return { accepted: true };
  }

  /** Decisão do Prefeito no desempate. */
  public submitMayorTiebreak(playerId: string, targetId: string): { accepted: boolean; message?: string } {
    if (this.phase !== GamePhase.MAYOR_TIEBREAK) {
      return { accepted: false, message: 'Não há desempate em andamento.' };
    }
    const mayor = this.players.get(playerId);
    if (!mayor || !mayor.isAlive || !mayor.isMayor) {
      return { accepted: false, message: 'Apenas o Prefeito vivo decide o desempate.' };
    }
    if (!this.tieCandidateIds.includes(targetId)) {
      return { accepted: false, message: 'Escolha um dos jogadores empatados.' };
    }

    this.eliminateByVote(targetId, {}, {}, true);
    return { accepted: true };
  }

  public allVotesSubmitted(): boolean {
    const alive = Array.from(this.players.values()).filter(p => p.isAlive && (p.isConnected || p.isBot));
    return alive.length > 0 && alive.every(p => this.pendingVotes.has(p.id));
  }

  /**
   * Apuração determinística da votação (ou do segundo turno).
   * Empate no 1º turno → Prefeito (se habilitado e disponível) ou segundo turno.
   * Empate no 2º turno → ninguém é eliminado.
   */
  public resolveVoting(): VotingSummary {
    const wasRunoff = this.phase === GamePhase.RUNOFF;

    const aliveVoters = Array.from(this.players.values()).filter(p => p.isAlive);
    const voteCounts: Record<string, number> = {};
    const votesRecord: Record<string, string | null> = {};

    aliveVoters.forEach(voter => {
      const targetId = this.pendingVotes.get(voter.id) ?? null;
      votesRecord[voter.id] = targetId;
      if (targetId) voteCounts[targetId] = (voteCounts[targetId] || 0) + 1;
    });

    const entries = Object.entries(voteCounts);
    let topCandidates: string[] = [];
    if (entries.length > 0) {
      const topCount = Math.max(...entries.map(([, n]) => n));
      topCandidates = entries.filter(([, n]) => n === topCount).map(([id]) => id);
    }

    // Sem votos válidos → ninguém eliminado
    if (topCandidates.length === 0) {
      return this.recordNoElimination(votesRecord, voteCounts, wasRunoff);
    }

    if (topCandidates.length === 1) {
      return this.eliminateByVote(topCandidates[0], votesRecord, voteCounts, false, wasRunoff);
    }

    // Empate
    if (wasRunoff) {
      return this.recordNoElimination(votesRecord, voteCounts, true, topCandidates);
    }

    const mayor = aliveVoters.find(p => p.isMayor && (p.isConnected || p.isBot));
    if (this.config.enableMayorTiebreak && mayor) {
      this.lastVotingSummary = {
        round: this.roundNumber,
        outcome: VotingOutcome.TIE_MAYOR,
        wasRunoff: false,
        eliminatedPlayerId: null,
        eliminatedNickname: null,
        votes: votesRecord,
        voteCounts,
        tiePlayerIds: topCandidates,
      };
      this.startMayorTiebreak(topCandidates);
      return this.lastVotingSummary;
    }

    this.lastVotingSummary = {
      round: this.roundNumber,
      outcome: VotingOutcome.TIE_RUNOFF,
      wasRunoff: false,
      eliminatedPlayerId: null,
      eliminatedNickname: null,
      votes: votesRecord,
      voteCounts,
      tiePlayerIds: topCandidates,
    };
    this.startRunoff(topCandidates);
    return this.lastVotingSummary;
  }

  private eliminateByVote(
    targetId: string,
    votesRecord: Record<string, string | null>,
    voteCounts: Record<string, number>,
    mayorDecided: boolean,
    wasRunoff: boolean = false
  ): VotingSummary {
    this.phase = GamePhase.DAY_RESOLUTION;
    this.setTimer(PHASE_DURATIONS.dayResolution);

    const victim = this.players.get(targetId);
    let revealedRole: Role | undefined;
    if (victim) {
      victim.isAlive = false;
      victim.deathReason = 'VOTED_OUT';
      victim.deathRound = this.roundNumber;
      if (this.config.revealRoleOnDeath) revealedRole = victim.role;

      this.addTimelineEvent(
        'ELIMINATION',
        `Julgamento do dia ${this.roundNumber}`,
        mayorDecided
          ? `Com o voto de minerva do Prefeito, ${victim.nickname} foi eliminado pela cidade.`
          : `Por decisão da maioria, ${victim.nickname} foi eliminado pela cidade.`,
        { eliminatedPlayerId: victim.id, votes: votesRecord, mayorDecided }
      );
    }

    this.lastVotingSummary = {
      round: this.roundNumber,
      outcome: VotingOutcome.ELIMINATED,
      wasRunoff,
      eliminatedPlayerId: targetId,
      eliminatedNickname: victim?.nickname ?? null,
      revealedRole,
      votes: votesRecord,
      voteCounts,
      mayorDecided,
    };
    return this.lastVotingSummary;
  }

  private recordNoElimination(
    votesRecord: Record<string, string | null>,
    voteCounts: Record<string, number>,
    wasRunoff: boolean,
    tiedIds?: string[]
  ): VotingSummary {
    this.phase = GamePhase.DAY_RESOLUTION;
    this.setTimer(PHASE_DURATIONS.dayResolution);

    this.addTimelineEvent(
      'ELIMINATION',
      `Julgamento do dia ${this.roundNumber}`,
      wasRunoff && tiedIds
        ? 'O segundo turno também terminou empatado. Ninguém foi eliminado hoje.'
        : 'Sem consenso ou votos suficientes, ninguém foi eliminado hoje.',
      { votes: votesRecord }
    );

    this.lastVotingSummary = {
      round: this.roundNumber,
      outcome: VotingOutcome.NO_ELIMINATION,
      wasRunoff,
      eliminatedPlayerId: null,
      eliminatedNickname: null,
      votes: votesRecord,
      voteCounts,
      tiePlayerIds: tiedIds,
    };
    return this.lastVotingSummary;
  }

  /** Timeout do desempate do Prefeito → cai para o segundo turno (PRD 3.4). */
  public mayorTiebreakTimeout(): void {
    if (this.phase !== GamePhase.MAYOR_TIEBREAK) return;
    this.startRunoff(this.tieCandidateIds);
  }

  // ── Vitória e rodadas ────────────────────────────────────────────────────

  /**
   * Verifica e aplica condição de vitória. Idempotente: nunca registra
   * o fim da partida duas vezes.
   */
  public checkVictoryCondition(): boolean {
    if (this.winner !== null) {
      this.phase = GamePhase.FINISHED;
      return true;
    }

    const alivePlayers = Array.from(this.players.values()).filter(p => p.isAlive);
    const aliveAssassins = alivePlayers.filter(p => p.role === Role.ASSASSINO);
    const aliveTown = alivePlayers.filter(p => p.role !== Role.ASSASSINO);

    if (alivePlayers.length === 0) {
      this.winner = VictoryWinner.DRAW;
      this.phase = GamePhase.FINISHED;
      this.addTimelineEvent('MATCH_END', 'Empate trágico', 'Ninguém sobreviveu para contar a história.');
      return true;
    }

    if (aliveAssassins.length === 0) {
      this.winner = VictoryWinner.TOWN;
      this.phase = GamePhase.FINISHED;
      this.addTimelineEvent(
        'MATCH_END',
        'A cidade venceu!',
        'O último assassino caiu. A paz volta a reinar nas ruas.'
      );
      return true;
    }

    if (aliveAssassins.length >= aliveTown.length) {
      this.winner = VictoryWinner.ASSASSINS;
      this.phase = GamePhase.FINISHED;
      this.addTimelineEvent(
        'MATCH_END',
        'Os assassinos venceram!',
        'A cidade perdeu a maioria e caiu sob o domínio das sombras.'
      );
      return true;
    }

    return false;
  }

  public nextRound(): void {
    if (this.winner) return;
    this.roundNumber += 1;
    this.startNight();
  }

  // ── Utilidades ───────────────────────────────────────────────────────────

  private setTimer(seconds: number): void {
    this.phaseTimeRemaining = seconds;
    this.phaseDuration = seconds;
  }

  public addTimelineEvent(
    type: TimelineEvent['type'],
    title: string,
    description: string,
    publicPayload?: any,
    secretPayload?: any
  ): void {
    this.eventSeq += 1;
    this.timeline.push({
      id: `evt-${this.roomId}-${this.eventSeq}`,
      round: this.roundNumber,
      phase: this.phase,
      timestamp: this.now(),
      type,
      title,
      description,
      publicPayload,
      secretPayload,
    });
  }

  /**
   * Projeta o snapshot privado de um jogador.
   * Nenhum papel ou ação secreta de terceiros é serializado.
   */
  public getPrivateSnapshot(playerId: string): PrivatePlayerSnapshot | null {
    const player = this.players.get(playerId);
    if (!player) return null;

    const isFinished = this.phase === GamePhase.FINISHED;

    const publicPlayers: PublicPlayerView[] = Array.from(this.players.values())
      .sort((a, b) => a.seatNumber - b.seatNumber)
      .map(p => ({
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
        revealedRole: isFinished
          ? p.role
          : this.config.revealRoleOnDeath && !p.isAlive
          ? p.role
          : undefined,
        votedTargetId:
          this.phase === GamePhase.DAY_RESOLUTION || isFinished ? p.votedTargetId : undefined,
      }));

    let fellowAssassinIds: string[] | undefined;
    if (player.role === Role.ASSASSINO) {
      fellowAssassinIds = Array.from(this.players.values())
        .filter(p => p.role === Role.ASSASSINO && p.id !== player.id)
        .map(p => p.id);
    }

    const allRolesRevealed: Record<string, Role> | undefined = isFinished
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
        hunchLog: player.role === Role.CIDADAO ? player.hunchLog : undefined,
        fellowAssassinIds,
        currentNightAction: this.pendingNightActions.get(player.id) || null,
        currentVote: this.pendingVotes.get(player.id) ?? null,
        hasVoted: this.pendingVotes.has(player.id),
      },
      room: {
        roomId: this.roomId,
        roomCode: this.roomCode,
        phase: this.phase,
        roundNumber: this.roundNumber,
        phaseTimeRemaining: this.phaseTimeRemaining,
        phaseDuration: this.phaseDuration,
        config: this.config,
        players: publicPlayers,
        aliveCount: Array.from(this.players.values()).filter(p => p.isAlive).length,
        winner: this.winner,
        dawnSummary: this.dawnSummary,
        lastVotingSummary: this.lastVotingSummary,
        tieCandidateIds:
          this.phase === GamePhase.RUNOFF || this.phase === GamePhase.MAYOR_TIEBREAK
            ? this.tieCandidateIds
            : [],
        timeline: this.timeline.map(t => ({
          ...t,
          secretPayload: isFinished ? t.secretPayload : undefined,
        })),
        allRolesRevealed,
      },
    };
  }
}
