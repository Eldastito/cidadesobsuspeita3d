/**
 * Cidade Sob Suspeita 3D — Gerente autoritativo de salas e conexões
 * Dirige a máquina de estados do motor, roteia WebSocket, isola chat de mortos
 * e retransmite posições cosméticas dos avatares.
 */

import { WebSocket } from 'ws';
import { GameEngine } from '../src/engine/gameEngine.ts';
import { DEFAULT_ROOM_CONFIG } from '../src/engine/rules.ts';
import { ChatMessage, GamePhase, Player, Role, RoomConfig, VictoryWinner } from '../src/engine/types.ts';
import { ClientMessage, PlayerPosition, PlayerPositionMap, ServerMessage } from '../src/engine/protocol.ts';
import { getRandomBotAvatar, getRandomBotName, processBotActions } from './botAI.ts';
import { canSignal, voicePeersFor, voiceSignature, VoiceMember } from './voiceChannels.ts';
import { Persistence } from './persistence.ts';

interface ConnectedClient {
  socket: WebSocket;
  playerId: string;
  roomId: string;
  sessionId: string;
  lastEmoteAt?: number;
}

/** Reações permitidas (lista fechada — nada de texto livre em sprite). */
const ALLOWED_EMOTES = new Set(['👍', '👎', '😂', '😱', '🤔', '😡', '❤️', '🤫']);
const EMOTE_COOLDOWN_MS = 1500;

interface RoomRuntime {
  engine: GameEngine;
  chatHistory: ChatMessage[];
  /** Posições cosméticas dos avatares (não fazem parte do estado de regras). */
  positions: Map<string, PlayerPosition>;
  /** Destinos de passeio dos bots. */
  botWaypoints: Map<string, { x: number; z: number }>;
  positionsDirty: boolean;
  lastActivity: number;
  /** Jogadores com voz ativada (aguardando/na malha WebRTC). */
  voiceReady: Set<string>;
  /** Assinatura do último estado de voz difundido. */
  voiceSig: string;
  /** Estado mudou desde o último flush para o banco. */
  dirty: boolean;
  /** Partida atual já registrada no histórico. */
  matchRecorded: boolean;
}

const PLAZA_RADIUS = 12.5;
const SEAT_RADIUS = 9;
const TICK_MS = 1000;
const POSITION_RELAY_MS = 100;
const ROOM_IDLE_EXPIRE_MS = 10 * 60 * 1000;

/** Fases em que avatares podem circular pela praça. */
const MOVEMENT_PHASES = new Set<GamePhase>([
  GamePhase.LOBBY,
  GamePhase.DAWN,
  GamePhase.DISCUSSION,
  GamePhase.VOTING,
  GamePhase.RUNOFF,
  GamePhase.MAYOR_TIEBREAK,
  GamePhase.DAY_RESOLUTION,
  GamePhase.FINISHED,
]);

export function seatPosition(seatNumber: number, totalSeats: number): { x: number; z: number } {
  const angle = (seatNumber / Math.max(totalSeats, 6)) * Math.PI * 2;
  return { x: Math.sin(angle) * SEAT_RADIUS, z: Math.cos(angle) * SEAT_RADIUS };
}

export class RoomManager {
  private rooms: Map<string, RoomRuntime> = new Map();
  private roomByCode: Map<string, string> = new Map();
  private clients: Map<WebSocket, ConnectedClient> = new Map();
  private persistence: Persistence | null;

  constructor(persistence: Persistence | null = null) {
    this.persistence = persistence;
    this.restoreRooms();

    setInterval(() => this.gameTick(), TICK_MS);
    setInterval(() => this.positionTick(), POSITION_RELAY_MS);
    setInterval(() => this.cleanupIdleRooms(), 60 * 1000);
    setInterval(() => this.persistDirtyRooms(), 2000);
  }

  /** Reergue as salas gravadas no banco após um reinício do processo. */
  private restoreRooms(): void {
    if (!this.persistence) return;
    for (const stored of this.persistence.loadAllRooms()) {
      try {
        // Salas finalizadas há muito tempo não voltam — só viram histórico
        if (Date.now() - stored.updatedAt > ROOM_IDLE_EXPIRE_MS) {
          this.persistence.deleteRoom(stored.roomId);
          continue;
        }
        const engine = GameEngine.restore(JSON.parse(stored.stateJson));
        const chatHistory: ChatMessage[] = JSON.parse(stored.chatJson);
        this.rooms.set(stored.roomId, {
          engine,
          chatHistory,
          positions: new Map(),
          botWaypoints: new Map(),
          positionsDirty: false,
          lastActivity: stored.updatedAt,
          voiceReady: new Set(),
          voiceSig: '',
          dirty: false,
          matchRecorded: engine.phase === GamePhase.FINISHED,
        });
        this.roomByCode.set(engine.roomCode, stored.roomId);
      } catch (err) {
        console.error(`Falha ao restaurar sala ${stored.roomId}:`, err);
        this.persistence.deleteRoom(stored.roomId);
      }
    }
    if (this.rooms.size > 0) {
      console.log(`💾 ${this.rooms.size} sala(s) restaurada(s) do banco.`);
    }
  }

  /** Grava no banco as salas alteradas desde o último flush. */
  private persistDirtyRooms(): void {
    if (!this.persistence) return;
    for (const room of this.rooms.values()) {
      if (!room.dirty) continue;
      room.dirty = false;
      try {
        this.persistence.saveRoom(
          room.engine.roomId,
          room.engine.roomCode,
          JSON.stringify(room.engine.serialize()),
          JSON.stringify(room.chatHistory.slice(-200))
        );
      } catch (err) {
        console.error('Falha ao persistir sala:', err);
      }
    }
  }

  /** Registra partida finalizada no histórico e atualiza perfis (uma vez). */
  private recordFinishedMatch(room: RoomRuntime): void {
    if (!this.persistence || room.matchRecorded) return;
    const engine = room.engine;
    if (engine.phase !== GamePhase.FINISHED || !engine.winner) return;
    room.matchRecorded = true;

    const players = Array.from(engine.players.values());
    try {
      this.persistence.recordMatch({
        roomCode: engine.roomCode,
        winner: engine.winner,
        playerCount: players.length,
        rounds: engine.roundNumber,
        players: players.map(p => ({
          nickname: p.nickname,
          role: p.role,
          survived: p.isAlive,
          isBot: p.isBot,
        })),
      });

      for (const p of players) {
        if (p.isBot || !p.guestId) continue;
        const won =
          engine.winner === VictoryWinner.TOWN
            ? p.role !== Role.ASSASSINO
            : engine.winner === VictoryWinner.ASSASSINS
            ? p.role === Role.ASSASSINO
            : false;
        this.persistence.recordPlayerResult(p.guestId, p.nickname, p.role, won);
      }
    } catch (err) {
      console.error('Falha ao registrar partida no histórico:', err);
    }
  }

  public handleConnection(socket: WebSocket): void {
    socket.on('message', (data: string | Buffer) => {
      try {
        const msg: ClientMessage = JSON.parse(data.toString());
        this.routeMessage(socket, msg);
      } catch (err) {
        console.error('Falha ao interpretar mensagem WebSocket:', err);
      }
    });

    socket.on('close', () => this.handleDisconnect(socket));
    socket.on('error', err => console.error('Erro em cliente WebSocket:', err));
  }

  private handleDisconnect(socket: WebSocket): void {
    const client = this.clients.get(socket);
    if (!client) return;
    this.clients.delete(socket);

    // Se outro socket já retomou este jogador (reconexão rápida),
    // o fechamento do socket antigo não deve derrubá-lo.
    const takenOver = Array.from(this.clients.values()).some(
      c => c.playerId === client.playerId && c.roomId === client.roomId
    );
    if (takenOver) return;

    const room = this.rooms.get(client.roomId);
    if (room) {
      room.engine.removePlayer(client.playerId);
      room.positions.delete(client.playerId);
      room.positionsDirty = true;
      room.voiceReady.delete(client.playerId);
      this.syncVoicePeers(room);
      this.broadcastRoom(client.roomId);
    }
  }

  private routeMessage(socket: WebSocket, msg: ClientMessage): void {
    switch (msg.type) {
      case 'room.create':
        return this.onRoomCreate(socket, msg.payload);
      case 'room.join':
        return this.onRoomJoin(socket, msg.payload);
      case 'room.leave':
        return this.onRoomLeave(socket);
      case 'room.updateConfig':
        return this.withHost(socket, GamePhase.LOBBY, (room, player) => {
          room.engine.config = {
            ...room.engine.config,
            ...msg.payload.config,
            rolesCount: {
              ...room.engine.config.rolesCount,
              ...(msg.payload.config.rolesCount || {}),
            },
          };
          this.broadcastRoom(room.engine.roomId);
        });
      case 'player.ready':
        return this.withRoom(socket, (room, client) => {
          if (room.engine.phase !== GamePhase.LOBBY) return;
          room.engine.setPlayerReady(client.playerId, msg.payload.isReady);
          this.broadcastRoom(room.engine.roomId);
        });
      case 'bot.fill':
        return this.withHost(socket, GamePhase.LOBBY, room => {
          const usedNames = new Set(Array.from(room.engine.players.values()).map(p => p.nickname));
          for (
            let i = 0;
            i < msg.payload.count && room.engine.players.size < room.engine.config.maxPlayers;
            i++
          ) {
            const botName = getRandomBotName(usedNames);
            usedNames.add(botName);
            const botId = `bot-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
            room.engine.addPlayer(botId, `bot-sess-${botId}`, botName, getRandomBotAvatar(), false, true);
          }
          this.broadcastRoom(room.engine.roomId);
        });
      case 'bot.remove':
        return this.withHost(socket, GamePhase.LOBBY, room => {
          Array.from(room.engine.players.values())
            .filter(p => p.isBot)
            .forEach(b => {
              room.engine.players.delete(b.id);
              room.positions.delete(b.id);
            });
          room.positionsDirty = true;
          this.broadcastRoom(room.engine.roomId);
        });
      case 'match.start':
        return this.withHost(socket, null, (room, player) => {
          const canStart = room.engine.canStartMatch();
          if (!canStart.allowed) {
            this.sendError(socket, 'CANNOT_START', canStart.reason || 'Condições não atendidas.');
            return;
          }
          room.engine.startMatch();
          room.matchRecorded = false;
          this.broadcastRoom(room.engine.roomId);
        });
      case 'profile.get': {
        const guestId = (msg.payload.guestId || '').slice(0, 64);
        if (!this.persistence || !guestId) return;
        const profile = this.persistence.getProfile(guestId);
        this.sendSocket(socket, {
          type: 'profile.data',
          payload: {
            profile: profile
              ? {
                  nickname: profile.nickname,
                  matchesPlayed: profile.matchesPlayed,
                  wins: profile.wins,
                  roleStats: profile.roleStats as Record<string, { played: number; wins: number }>,
                }
              : null,
            recentMatches: this.persistence.recentMatches(5),
          },
        });
        return;
      }
      case 'role.confirm':
        return this.withRoom(socket, (room, client) => {
          if (room.engine.phase !== GamePhase.ROLE_REVEAL) return;
          room.engine.confirmRole(client.playerId);
          if (room.engine.areAllRolesConfirmed()) {
            room.engine.startNight();
          }
          this.broadcastRoom(room.engine.roomId);
        });
      case 'night.action':
        return this.withRoom(socket, (room, client) => {
          const res = room.engine.submitNightAction({ ...msg.payload, playerId: client.playerId });
          this.sendActionAck(socket, msg.payload.clientActionId, res.accepted, res.message);
          if (res.accepted) {
            this.sendPrivateSnapshot(socket, room.engine, client.playerId);
          }
        });
      case 'vote.submit':
        return this.withRoom(socket, (room, client) => {
          const res = room.engine.submitVote(client.playerId, msg.payload.targetId);
          this.sendActionAck(socket, msg.payload.clientActionId, res.accepted, res.message);
          if (res.accepted) this.broadcastRoom(room.engine.roomId);
        });
      case 'mayor.tiebreak.submit':
        return this.withRoom(socket, (room, client) => {
          const res = room.engine.submitMayorTiebreak(client.playerId, msg.payload.targetId);
          this.sendActionAck(socket, msg.payload.clientActionId, res.accepted, res.message);
          if (res.accepted) this.broadcastRoom(room.engine.roomId);
        });
      case 'player.handRaise':
        return this.withRoom(socket, (room, client) => {
          room.engine.toggleHandRaise(client.playerId);
          this.broadcastRoom(room.engine.roomId);
        });
      case 'player.move':
        return this.withRoom(socket, (room, client) => {
          if (!MOVEMENT_PHASES.has(room.engine.phase)) return;
          const player = room.engine.players.get(client.playerId);
          if (!player || !player.isAlive) return;

          const { x, z, ry } = msg.payload;
          if (typeof x !== 'number' || typeof z !== 'number' || typeof ry !== 'number') return;
          if (!isFinite(x) || !isFinite(z) || !isFinite(ry)) return;

          // Confina ao raio da praça
          const dist = Math.hypot(x, z);
          const scale = dist > PLAZA_RADIUS ? PLAZA_RADIUS / dist : 1;
          room.positions.set(client.playerId, [x * scale, z * scale, ry]);
          room.positionsDirty = true;
        });
      case 'voice.join':
        return this.withRoom(socket, (room, client) => {
          const player = room.engine.players.get(client.playerId);
          if (!player) return;
          room.voiceReady.add(client.playerId);
          this.syncVoicePeers(room, true);
        });
      case 'voice.leave':
        return this.withRoom(socket, (room, client) => {
          room.voiceReady.delete(client.playerId);
          this.syncVoicePeers(room, true);
        });
      case 'voice.signal':
        return this.withRoom(socket, (room, client) => {
          const members = this.voiceMembers(room);
          if (!canSignal(members, room.voiceReady, client.playerId, msg.payload.targetId)) return;
          for (const [peerSocket, peerClient] of this.clients.entries()) {
            if (peerClient.roomId === room.engine.roomId && peerClient.playerId === msg.payload.targetId) {
              this.sendSocket(peerSocket, {
                type: 'voice.signal',
                payload: { fromId: client.playerId, data: msg.payload.data },
              });
              return;
            }
          }
        });
      case 'player.emote':
        return this.withRoom(socket, (room, client) => {
          const player = room.engine.players.get(client.playerId);
          // Mortos não emitem reações visíveis aos vivos (PRD: canais isolados)
          if (!player || !player.isAlive) return;
          if (!ALLOWED_EMOTES.has(msg.payload.emoji)) return;

          const now = Date.now();
          if (client.lastEmoteAt && now - client.lastEmoteAt < EMOTE_COOLDOWN_MS) return;
          client.lastEmoteAt = now;

          this.broadcastEmote(room.engine.roomId, client.playerId, msg.payload.emoji);
        });
      case 'chat.send':
        return this.onChatSend(socket, msg.payload.text);
      case 'match.restart':
        return this.withHost(socket, GamePhase.FINISHED, room => {
          room.engine.resetForRematch();
          room.chatHistory = [];
          room.matchRecorded = false;
          this.broadcastChatHistory(room);
          this.broadcastRoom(room.engine.roomId);
        });
    }
  }

  // ── Entrada e saída de salas ─────────────────────────────────────────────

  private sanitizeAvatarColor(value: unknown): number | undefined {
    if (typeof value !== 'number' || !Number.isInteger(value)) return undefined;
    return Math.max(0, Math.min(11, value));
  }

  private onRoomCreate(
    socket: WebSocket,
    payload: {
      nickname: string;
      avatarId: string;
      avatarColor?: number;
      config?: Partial<RoomConfig>;
      guestId?: string;
    }
  ): void {
    const roomId = `room-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const roomCode = this.generateRoomCode();
    const mergedConfig: RoomConfig = {
      ...DEFAULT_ROOM_CONFIG,
      ...(payload.config || {}),
      rolesCount: { ...DEFAULT_ROOM_CONFIG.rolesCount, ...(payload.config?.rolesCount || {}) },
    };

    const engine = new GameEngine(roomId, roomCode, mergedConfig);
    const playerId = `player-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const sessionId = `sess-${Date.now()}-${Math.random().toString(36).substring(2, 10)}`;

    engine.addPlayer(
      playerId,
      sessionId,
      payload.nickname.trim() || 'Anfitrião',
      payload.avatarId || 'avatar-1',
      true,
      false,
      payload.guestId,
      this.sanitizeAvatarColor(payload.avatarColor)
    );
    engine.setPlayerReady(playerId, true);

    const room: RoomRuntime = {
      engine,
      chatHistory: [],
      positions: new Map(),
      botWaypoints: new Map(),
      positionsDirty: false,
      lastActivity: Date.now(),
      voiceReady: new Set(),
      voiceSig: '',
      dirty: true,
      matchRecorded: false,
    };
    this.rooms.set(roomId, room);
    this.roomByCode.set(roomCode, roomId);
    this.clients.set(socket, { socket, playerId, roomId, sessionId });

    this.sendSocket(socket, { type: 'session.info', payload: { sessionId, playerId, roomCode } });
    this.sendPrivateSnapshot(socket, engine, playerId);
  }

  private onRoomJoin(
    socket: WebSocket,
    payload: {
      roomCode: string;
      nickname: string;
      avatarId: string;
      avatarColor?: number;
      sessionId?: string;
      guestId?: string;
    }
  ): void {
    const normalizedCode = (payload.roomCode || '').trim().toUpperCase();
    const roomId = this.roomByCode.get(normalizedCode);
    const room = roomId ? this.rooms.get(roomId) : undefined;

    if (!roomId || !room) {
      this.sendError(socket, 'ROOM_NOT_FOUND', 'Sala não encontrada com esse código.');
      return;
    }
    const engine = room.engine;

    // Retomada de sessão (reconexão preserva identidade, posição e papel)
    let player: Player | undefined;
    if (payload.sessionId) {
      player = Array.from(engine.players.values()).find(p => p.sessionId === payload.sessionId);
    }

    if (!player) {
      if (engine.phase !== GamePhase.LOBBY) {
        this.sendError(socket, 'MATCH_IN_PROGRESS', 'A partida já começou nesta sala.');
        return;
      }
      if (engine.players.size >= engine.config.maxPlayers) {
        this.sendError(socket, 'ROOM_FULL', 'A sala atingiu a capacidade máxima.');
        return;
      }

      const newPlayerId = `player-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
      const newSessionId = `sess-${Date.now()}-${Math.random().toString(36).substring(2, 10)}`;
      player = engine.addPlayer(
        newPlayerId,
        newSessionId,
        payload.nickname.trim() || `Morador ${engine.players.size + 1}`,
        payload.avatarId || 'avatar-1',
        false,
        false,
        payload.guestId,
        this.sanitizeAvatarColor(payload.avatarColor)
      );
    } else {
      player.isConnected = true;
      if (payload.guestId) player.guestId = payload.guestId;
      // Remove entradas de sockets antigos deste mesmo jogador
      for (const [oldSocket, oldClient] of this.clients.entries()) {
        if (oldClient.playerId === player.id && oldSocket !== socket) {
          this.clients.delete(oldSocket);
        }
      }
    }

    this.clients.set(socket, { socket, playerId: player.id, roomId, sessionId: player.sessionId });
    room.lastActivity = Date.now();

    this.sendSocket(socket, {
      type: 'session.info',
      payload: { sessionId: player.sessionId, playerId: player.id, roomCode: engine.roomCode },
    });
    this.broadcastRoom(roomId);
    this.sendChatHistory(socket, room, player.isAlive);
  }

  private onRoomLeave(socket: WebSocket): void {
    const client = this.clients.get(socket);
    if (!client) return;
    const room = this.rooms.get(client.roomId);
    if (room) {
      if (room.engine.phase === GamePhase.LOBBY || room.engine.phase === GamePhase.FINISHED) {
        room.engine.players.delete(client.playerId);
        room.engine.ensureHost();
      } else {
        room.engine.removePlayer(client.playerId);
      }
      room.positions.delete(client.playerId);
      room.positionsDirty = true;
      room.voiceReady.delete(client.playerId);
      this.syncVoicePeers(room);
      this.broadcastRoom(client.roomId);
    }
    this.clients.delete(socket);
    this.sendSocket(socket, { type: 'room.left' });
  }

  private onChatSend(socket: WebSocket, rawText: string): void {
    const client = this.clients.get(socket);
    if (!client) return;
    const room = this.rooms.get(client.roomId);
    if (!room) return;

    const player = room.engine.players.get(client.playerId);
    if (!player) return;

    const text = (rawText || '').trim().slice(0, 280);
    if (!text) return;

    const isDead = !player.isAlive;
    const chatMsg: ChatMessage = {
      id: `msg-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      senderId: player.id,
      senderNickname: player.nickname,
      senderAvatar: player.avatarId,
      text,
      timestamp: Date.now(),
      isDeadChat: isDead,
    };

    room.chatHistory.push(chatMsg);
    room.lastActivity = Date.now();
    room.dirty = true;

    // Vivos nunca recebem o canal dos mortos
    for (const [cliSocket, cliData] of this.clients.entries()) {
      if (cliData.roomId !== client.roomId) continue;
      const recipient = room.engine.players.get(cliData.playerId);
      if (!recipient) continue;
      if (!isDead || !recipient.isAlive) {
        this.sendSocket(cliSocket, { type: 'chat.message', payload: chatMsg });
      }
    }
  }

  // ── Loop autoritativo de 1 s ─────────────────────────────────────────────

  private gameTick(): void {
    for (const [roomId, room] of this.rooms.entries()) {
      const engine = room.engine;
      if (
        engine.phase === GamePhase.LOBBY ||
        engine.phase === GamePhase.FINISHED ||
        engine.phase === GamePhase.PAUSED
      ) {
        continue;
      }

      processBotActions(engine);

      // Bots reagem de vez em quando no debate para a praça não ficar muda
      if (engine.phase === GamePhase.DISCUSSION) {
        const emotes = Array.from(ALLOWED_EMOTES);
        for (const p of engine.players.values()) {
          if (p.isBot && p.isAlive && Math.random() < 0.02) {
            this.broadcastEmote(roomId, p.id, emotes[Math.floor(Math.random() * emotes.length)]);
          }
        }
      }

      if (engine.phaseTimeRemaining > 0) {
        engine.phaseTimeRemaining -= 1;
      }

      const shouldAdvance =
        engine.phaseTimeRemaining <= 0 ||
        (engine.phase === GamePhase.ROLE_REVEAL && engine.areAllRolesConfirmed()) ||
        (engine.phase === GamePhase.NIGHT_ACTIONS && engine.allNightActionsSubmitted()) ||
        ((engine.phase === GamePhase.VOTING || engine.phase === GamePhase.RUNOFF) &&
          engine.allVotesSubmitted());

      if (shouldAdvance) {
        this.advancePhase(engine);
      }

      // Mortes mudam o canal de voz (vivos ↔ cemitério)
      this.syncVoicePeers(room);

      // Fim de partida vira histórico + estatísticas (uma única vez)
      this.recordFinishedMatch(room);

      this.broadcastRoom(roomId);
    }
  }

  /**
   * Transições da máquina de estados (PRD 3.6).
   * O amanhecer sempre é exibido antes da checagem de vitória,
   * e a checagem nunca é sobrescrita por outra fase.
   */
  private advancePhase(engine: GameEngine): void {
    switch (engine.phase) {
      case GamePhase.ROLE_REVEAL:
        engine.startNight();
        break;

      case GamePhase.NIGHT_ACTIONS:
        engine.resolveNight();
        engine.startDawn();
        break;

      case GamePhase.DAWN:
        if (!engine.checkVictoryCondition()) {
          engine.startDiscussion();
        }
        break;

      case GamePhase.DISCUSSION:
        engine.startVoting();
        break;

      case GamePhase.VOTING:
      case GamePhase.RUNOFF:
        // No modo sequencial, o estouro do tempo consome apenas o turno do
        // votante da vez (abstenção pública) — a fase segue até a fila acabar.
        if (engine.isSequentialVoting() && !engine.allVotesSubmitted()) {
          engine.voteTurnTimeout();
          if (!engine.allVotesSubmitted()) break;
        }
        // O motor decide o próximo estado: DAY_RESOLUTION, RUNOFF ou MAYOR_TIEBREAK
        engine.resolveVoting();
        break;

      case GamePhase.MAYOR_TIEBREAK:
        // Prefeito não decidiu a tempo → segundo turno
        engine.mayorTiebreakTimeout();
        break;

      case GamePhase.DAY_RESOLUTION:
        if (!engine.checkVictoryCondition()) {
          engine.nextRound();
        }
        break;
    }
  }

  // ── Relay de posições (10 Hz) ────────────────────────────────────────────

  private positionTick(): void {
    for (const [roomId, room] of this.rooms.entries()) {
      const engine = room.engine;
      const movementAllowed = MOVEMENT_PHASES.has(engine.phase);

      if (!movementAllowed) {
        // À noite todos voltam aos assentos; limpa posições livres uma única vez
        if (room.positions.size > 0) {
          room.positions.clear();
          room.botWaypoints.clear();
          room.positionsDirty = true;
        }
      } else {
        this.wanderBots(room);
      }

      if (!room.positionsDirty) continue;
      room.positionsDirty = false;

      const positions: PlayerPositionMap = {};
      room.positions.forEach((pos, id) => {
        positions[id] = pos;
      });

      const msg: ServerMessage = { type: 'player.positions', payload: { positions } };
      for (const [socket, client] of this.clients.entries()) {
        if (client.roomId === roomId) this.sendSocket(socket, msg);
      }
    }
  }

  /** Passeio suave dos bots pela praça para a cena não ficar parada. */
  private wanderBots(room: RoomRuntime): void {
    const engine = room.engine;
    const totalSeats = Math.max(engine.players.size, 6);
    const stepPerTick = 1.4 * (POSITION_RELAY_MS / 1000); // ~1,4 m/s

    for (const player of engine.players.values()) {
      if (!player.isBot || !player.isAlive) {
        continue;
      }

      const home = seatPosition(player.seatNumber, totalSeats);
      const current = room.positions.get(player.id) || ([home.x, home.z, 0] as PlayerPosition);
      let waypoint = room.botWaypoints.get(player.id);

      const arrived = waypoint && Math.hypot(waypoint.x - current[0], waypoint.z - current[2]) < 0.3;
      if (!waypoint || arrived) {
        // Pausa em ~2% dos ticks escolhe um novo destino perto do assento ou do centro
        if (Math.random() > 0.02) {
          if (arrived) continue;
        }
        const nearCenter = Math.random() < 0.3;
        const cx = nearCenter ? 0 : home.x;
        const cz = nearCenter ? 0 : home.z;
        const spread = nearCenter ? 5.5 : 2.5;
        waypoint = {
          x: cx + (Math.random() - 0.5) * spread * 2,
          z: cz + (Math.random() - 0.5) * spread * 2,
        };
        const dist = Math.hypot(waypoint.x, waypoint.z);
        if (dist > PLAZA_RADIUS - 1 || dist < 3.6) continue; // evita fonte e borda
        room.botWaypoints.set(player.id, waypoint);
      }

      const dx = waypoint.x - current[0];
      const dz = waypoint.z - current[2];
      const dist = Math.hypot(dx, dz);
      if (dist < 0.05) continue;

      const step = Math.min(stepPerTick, dist);
      const nx = current[0] + (dx / dist) * step;
      const nz = current[2] + (dz / dist) * step;
      const ry = Math.atan2(dx, dz);
      room.positions.set(player.id, [nx, nz, ry]);
      room.positionsDirty = true;
    }
  }

  // ── Utilidades ───────────────────────────────────────────────────────────

  private withRoom(
    socket: WebSocket,
    fn: (room: RoomRuntime, client: ConnectedClient) => void
  ): void {
    const client = this.clients.get(socket);
    if (!client) return;
    const room = this.rooms.get(client.roomId);
    if (!room) return;
    room.lastActivity = Date.now();
    fn(room, client);
  }

  private withHost(
    socket: WebSocket,
    requiredPhase: GamePhase | null,
    fn: (room: RoomRuntime, player: Player) => void
  ): void {
    this.withRoom(socket, (room, client) => {
      if (requiredPhase && room.engine.phase !== requiredPhase) return;
      const player = room.engine.players.get(client.playerId);
      if (!player || !player.isHost) {
        this.sendError(socket, 'NOT_HOST', 'Apenas o anfitrião pode fazer isso.');
        return;
      }
      fn(room, player);
    });
  }

  private generateRoomCode(): string {
    // Sem caracteres ambíguos (0/O, 1/I)
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    for (let attempt = 0; attempt < 50; attempt++) {
      let code = '';
      for (let i = 0; i < 4; i++) {
        code += alphabet[Math.floor(Math.random() * alphabet.length)];
      }
      if (!this.roomByCode.has(code)) return code;
    }
    return Math.random().toString(36).substring(2, 8).toUpperCase();
  }

  private cleanupIdleRooms(): void {
    const now = Date.now();
    for (const [roomId, room] of this.rooms.entries()) {
      const hasConnectedHuman = Array.from(this.clients.values()).some(c => c.roomId === roomId);
      if (!hasConnectedHuman && now - room.lastActivity > ROOM_IDLE_EXPIRE_MS) {
        this.roomByCode.delete(room.engine.roomCode);
        this.rooms.delete(roomId);
        this.persistence?.deleteRoom(roomId);
      }
    }
  }

  private voiceMembers(room: RoomRuntime): VoiceMember[] {
    return Array.from(room.engine.players.values()).map(p => ({ id: p.id, isAlive: p.isAlive }));
  }

  /**
   * Reenvia as listas de pares de voz quando a composição dos canais muda
   * (entrada/saída de voz, morte, desconexão). `force` ignora a assinatura.
   */
  private syncVoicePeers(room: RoomRuntime, force = false): void {
    const members = this.voiceMembers(room);
    const sig = voiceSignature(members, room.voiceReady);
    if (!force && sig === room.voiceSig) return;
    room.voiceSig = sig;

    for (const [socket, client] of this.clients.entries()) {
      if (client.roomId !== room.engine.roomId) continue;
      if (!room.voiceReady.has(client.playerId)) continue;
      const { channel, peerIds } = voicePeersFor(members, room.voiceReady, client.playerId);
      this.sendSocket(socket, { type: 'voice.peers', payload: { channel, peerIds } });
    }
  }

  private broadcastEmote(roomId: string, playerId: string, emoji: string): void {
    const msg: ServerMessage = { type: 'player.emote.shown', payload: { playerId, emoji } };
    for (const [socket, client] of this.clients.entries()) {
      if (client.roomId === roomId) this.sendSocket(socket, msg);
    }
  }

  private broadcastRoom(roomId: string): void {
    const room = this.rooms.get(roomId);
    if (!room) return;
    room.dirty = true;
    for (const [socket, client] of this.clients.entries()) {
      if (client.roomId === roomId) {
        this.sendPrivateSnapshot(socket, room.engine, client.playerId);
      }
    }
  }

  private broadcastChatHistory(room: RoomRuntime): void {
    for (const [socket, client] of this.clients.entries()) {
      if (client.roomId === room.engine.roomId) {
        const player = room.engine.players.get(client.playerId);
        this.sendChatHistory(socket, room, player?.isAlive ?? true);
      }
    }
  }

  private sendPrivateSnapshot(socket: WebSocket, engine: GameEngine, playerId: string): void {
    const snapshot = engine.getPrivateSnapshot(playerId);
    if (snapshot) {
      this.sendSocket(socket, { type: 'snapshot.private', payload: snapshot });
    }
  }

  private sendChatHistory(socket: WebSocket, room: RoomRuntime, isAlive: boolean): void {
    const filtered = isAlive ? room.chatHistory.filter(m => !m.isDeadChat) : room.chatHistory;
    this.sendSocket(socket, { type: 'chat.history', payload: { messages: filtered } });
  }

  private sendActionAck(socket: WebSocket, clientActionId: string, accepted: boolean, message?: string): void {
    this.sendSocket(socket, { type: 'action.ack', payload: { clientActionId, accepted, message } });
  }

  private sendError(socket: WebSocket, code: string, message: string): void {
    this.sendSocket(socket, { type: 'error.safe', payload: { code, message } });
  }

  private sendSocket(socket: WebSocket, msg: ServerMessage): void {
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(msg));
    }
  }
}
