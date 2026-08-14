/**
 * Cidade Sob Suspeita 3D - Server Room & Connection Manager
 * Handles authoritative room loops, WebSocket event routing, and chat isolation
 */

import { WebSocket } from 'ws';
import { GameEngine } from '../src/engine/gameEngine.ts';
import { DEFAULT_ROOM_CONFIG } from '../src/engine/rules.ts';
import { ChatMessage, GamePhase, Player, RoomConfig } from '../src/engine/types.ts';
import { ClientMessage, ServerMessage } from '../src/engine/protocol.ts';
import { getRandomBotAvatar, getRandomBotName, processBotActions } from './botAI.ts';

interface ConnectedClient {
  socket: WebSocket;
  playerId: string;
  roomId: string;
  sessionId: string;
  lastHeartbeat: number;
}

export class RoomManager {
  private rooms: Map<string, GameEngine> = new Map();
  private roomByCode: Map<string, string> = new Map(); // roomCode -> roomId
  private clients: Map<WebSocket, ConnectedClient> = new Map();
  private chatHistory: Map<string, ChatMessage[]> = new Map(); // roomId -> ChatMessage[]
  private timerHandles: Map<string, NodeJS.Timeout> = new Map();

  constructor() {
    // Start global tick loop
    setInterval(() => this.globalTick(), 1000);
  }

  public handleConnection(socket: WebSocket): void {
    socket.on('message', (data: string | Buffer) => {
      try {
        const msg: ClientMessage = JSON.parse(data.toString());
        this.routeMessage(socket, msg);
      } catch (err) {
        console.error('Failed to parse websocket message:', err);
      }
    });

    socket.on('close', () => {
      this.handleDisconnect(socket);
    });

    socket.on('error', (err) => {
      console.error('WebSocket client error:', err);
    });
  }

  private handleDisconnect(socket: WebSocket): void {
    const client = this.clients.get(socket);
    if (!client) return;

    const engine = this.rooms.get(client.roomId);
    if (engine) {
      engine.removePlayer(client.playerId);
      this.broadcastRoom(client.roomId);
    }

    this.clients.delete(socket);
  }

  private routeMessage(socket: WebSocket, msg: ClientMessage): void {
    switch (msg.type) {
      case 'room.create': {
        const { nickname, avatarId, config } = msg.payload;
        const roomId = `room-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
        const roomCode = Math.random().toString(36).substring(2, 6).toUpperCase();
        const mergedConfig: RoomConfig = { ...DEFAULT_ROOM_CONFIG, ...(config || {}) };

        const engine = new GameEngine(roomId, roomCode, mergedConfig);
        const playerId = `player-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
        const sessionId = `sess-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;

        engine.addPlayer(playerId, sessionId, nickname.trim() || 'Anfitrião', avatarId || 'avatar-1', true, false);
        engine.setPlayerReady(playerId, true);

        this.rooms.set(roomId, engine);
        this.roomByCode.set(roomCode, roomId);
        this.chatHistory.set(roomId, []);

        this.clients.set(socket, {
          socket,
          playerId,
          roomId,
          sessionId,
          lastHeartbeat: Date.now(),
        });

        this.sendPrivateSnapshot(socket, engine, playerId);
        break;
      }

      case 'room.join': {
        const { roomCode, nickname, avatarId, sessionId } = msg.payload;
        const normalizedCode = (roomCode || '').trim().toUpperCase();
        const roomId = this.roomByCode.get(normalizedCode);

        if (!roomId || !this.rooms.has(roomId)) {
          this.sendError(socket, 'ROOM_NOT_FOUND', 'Sala não encontrada com o código fornecido.');
          return;
        }

        const engine = this.rooms.get(roomId)!;

        // Check if reconnecting by sessionId
        let player: Player | undefined;
        if (sessionId) {
          player = Array.from(engine.players.values()).find(p => p.sessionId === sessionId);
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
          const newSessionId = `sess-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
          player = engine.addPlayer(
            newPlayerId,
            newSessionId,
            nickname.trim() || `Jogador ${engine.players.size + 1}`,
            avatarId || 'avatar-1',
            false,
            false
          );
        } else {
          player.isConnected = true;
        }

        this.clients.set(socket, {
          socket,
          playerId: player.id,
          roomId,
          sessionId: player.sessionId,
          lastHeartbeat: Date.now(),
        });

        this.broadcastRoom(roomId);
        this.sendChatHistory(socket, roomId, player.isAlive);
        break;
      }

      case 'room.updateConfig': {
        const client = this.clients.get(socket);
        if (!client) return;
        const engine = this.rooms.get(client.roomId);
        if (!engine || engine.phase !== GamePhase.LOBBY) return;

        const player = engine.players.get(client.playerId);
        if (player && player.isHost) {
          engine.config = { ...engine.config, ...msg.payload.config };
          this.broadcastRoom(client.roomId);
        }
        break;
      }

      case 'player.ready': {
        const client = this.clients.get(socket);
        if (!client) return;
        const engine = this.rooms.get(client.roomId);
        if (!engine || engine.phase !== GamePhase.LOBBY) return;

        engine.setPlayerReady(client.playerId, msg.payload.isReady);
        this.broadcastRoom(client.roomId);
        break;
      }

      case 'bot.fill': {
        const client = this.clients.get(socket);
        if (!client) return;
        const engine = this.rooms.get(client.roomId);
        if (!engine || engine.phase !== GamePhase.LOBBY) return;

        const player = engine.players.get(client.playerId);
        if (!player || !player.isHost) return;

        const needed = msg.payload.count;
        const usedNames = new Set(Array.from(engine.players.values()).map(p => p.nickname));

        for (let i = 0; i < needed && engine.players.size < engine.config.maxPlayers; i++) {
          const botName = getRandomBotName(usedNames);
          usedNames.add(botName);
          const botId = `bot-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
          const botSession = `bot-sess-${Math.random()}`;
          engine.addPlayer(botId, botSession, botName, getRandomBotAvatar(), false, true);
        }

        this.broadcastRoom(client.roomId);
        break;
      }

      case 'bot.remove': {
        const client = this.clients.get(socket);
        if (!client) return;
        const engine = this.rooms.get(client.roomId);
        if (!engine || engine.phase !== GamePhase.LOBBY) return;

        const player = engine.players.get(client.playerId);
        if (!player || !player.isHost) return;

        const bots = Array.from(engine.players.values()).filter(p => p.isBot);
        bots.forEach(b => engine.players.delete(b.id));

        this.broadcastRoom(client.roomId);
        break;
      }

      case 'match.start': {
        const client = this.clients.get(socket);
        if (!client) return;
        const engine = this.rooms.get(client.roomId);
        if (!engine) return;

        const player = engine.players.get(client.playerId);
        if (!player || !player.isHost) {
          this.sendError(socket, 'NOT_HOST', 'Apenas o anfitrião pode iniciar a partida.');
          return;
        }

        const canStart = engine.canStartMatch();
        if (!canStart.allowed) {
          this.sendError(socket, 'CANNOT_START', canStart.reason || 'Condições não atendidas.');
          return;
        }

        engine.startMatch();
        this.broadcastRoom(client.roomId);
        break;
      }

      case 'role.confirm': {
        const client = this.clients.get(socket);
        if (!client) return;
        const engine = this.rooms.get(client.roomId);
        if (!engine || engine.phase !== GamePhase.ROLE_REVEAL) return;

        engine.confirmRole(client.playerId);

        // If everyone confirmed, jump immediately to Night
        if (engine.areAllRolesConfirmed()) {
          engine.startNight();
        }

        this.broadcastRoom(client.roomId);
        break;
      }

      case 'night.action': {
        const client = this.clients.get(socket);
        if (!client) return;
        const engine = this.rooms.get(client.roomId);
        if (!engine || engine.phase !== GamePhase.NIGHT_ACTIONS) return;

        const res = engine.submitNightAction({
          ...msg.payload,
          playerId: client.playerId,
        });

        this.sendActionAck(socket, msg.payload.clientActionId, res.accepted, res.message);
        if (res.accepted) {
          this.sendPrivateSnapshot(socket, engine, client.playerId);
        }
        break;
      }

      case 'vote.submit': {
        const client = this.clients.get(socket);
        if (!client) return;
        const engine = this.rooms.get(client.roomId);
        if (!engine) return;

        const res = engine.submitVote(client.playerId, msg.payload.targetId);
        this.sendActionAck(socket, msg.payload.clientActionId, res.accepted, res.message);
        if (res.accepted) {
          this.broadcastRoom(client.roomId);
        }
        break;
      }

      case 'player.handRaise': {
        const client = this.clients.get(socket);
        if (!client) return;
        const engine = this.rooms.get(client.roomId);
        if (!engine) return;

        engine.toggleHandRaise(client.playerId);
        this.broadcastRoom(client.roomId);
        break;
      }

      case 'chat.send': {
        const client = this.clients.get(socket);
        if (!client) return;
        const engine = this.rooms.get(client.roomId);
        if (!engine) return;

        const player = engine.players.get(client.playerId);
        if (!player) return;

        const text = (msg.payload.text || '').trim();
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

        const history = this.chatHistory.get(client.roomId) || [];
        history.push(chatMsg);
        this.chatHistory.set(client.roomId, history);

        // Broadcast to eligible clients (Alive players do NOT see Dead chat)
        for (const [cliSocket, cliData] of this.clients.entries()) {
          if (cliData.roomId === client.roomId) {
            const recipient = engine.players.get(cliData.playerId);
            if (recipient) {
              if (!isDead || !recipient.isAlive) {
                this.sendSocket(cliSocket, {
                  type: 'chat.message',
                  payload: chatMsg,
                });
              }
            }
          }
        }
        break;
      }

      case 'match.restart': {
        const client = this.clients.get(socket);
        if (!client) return;
        const engine = this.rooms.get(client.roomId);
        if (!engine || engine.phase !== GamePhase.FINISHED) return;

        const player = engine.players.get(client.playerId);
        if (!player || !player.isHost) return;

        engine.phase = GamePhase.LOBBY;
        engine.roundNumber = 0;
        engine.winner = null;
        engine.dawnSummary = null;
        engine.lastVotingSummary = null;
        engine.players.forEach(p => {
          p.isAlive = true;
          p.isReady = p.isBot;
          p.hasConfirmedRole = false;
        });

        this.broadcastRoom(client.roomId);
        break;
      }
    }
  }

  /**
   * Authoritative 1-second server tick loop
   */
  private globalTick(): void {
    for (const [roomId, engine] of this.rooms.entries()) {
      if (engine.phase === GamePhase.LOBBY || engine.phase === GamePhase.FINISHED || engine.phase === GamePhase.PAUSED) {
        continue;
      }

      // Process Bot Actions
      processBotActions(engine);

      if (engine.phaseTimeRemaining > 0) {
        engine.phaseTimeRemaining -= 1;
      }

      // Phase Transition Check
      if (engine.phaseTimeRemaining <= 0) {
        this.advancePhase(roomId, engine);
      } else {
        // Check fast-forward conditions
        if (engine.phase === GamePhase.NIGHT_ACTIONS) {
          const aliveActors = Array.from(engine.players.values()).filter(
            p => p.isAlive && p.role !== 'CIDADAO'
          );
          const allSubmitted = aliveActors.every(a => engine.pendingNightActions.has(a.id));
          if (allSubmitted && aliveActors.length > 0) {
            this.advancePhase(roomId, engine);
          }
        } else if (engine.phase === GamePhase.VOTING || engine.phase === GamePhase.RUNOFF) {
          const aliveVoters = Array.from(engine.players.values()).filter(p => p.isAlive);
          const allVoted = aliveVoters.every(v => engine.pendingVotes.has(v.id));
          if (allVoted && aliveVoters.length > 0) {
            this.advancePhase(roomId, engine);
          }
        }
      }

      this.broadcastRoom(roomId);
    }
  }

  private advancePhase(roomId: string, engine: GameEngine): void {
    switch (engine.phase) {
      case GamePhase.ROLE_REVEAL:
        engine.startNight();
        break;

      case GamePhase.NIGHT_ACTIONS:
        engine.resolveNight();
        engine.startDawn();
        break;

      case GamePhase.DAWN:
        if (engine.checkVictoryCondition()) {
          // Finished
        } else {
          engine.startDiscussion();
        }
        break;

      case GamePhase.DISCUSSION:
        engine.startVoting();
        break;

      case GamePhase.VOTING:
      case GamePhase.RUNOFF:
      case GamePhase.MAYOR_TIEBREAK: {
        const summary = engine.resolveVoting();
        if (engine.phase === GamePhase.MAYOR_TIEBREAK) {
          // Stay in Mayor tiebreak for timer duration
          break;
        }
        if (summary.wasTie && !summary.eliminatedPlayerId) {
          // No one eliminated or tie, advance to next night
        }
        // Give 5 seconds for voting resolution banner then next round or finish
        engine.phaseTimeRemaining = 5;
        engine.phase = GamePhase.DAY_RESOLUTION;
        setTimeout(() => {
          if (engine.phase === GamePhase.DAY_RESOLUTION) {
            if (!engine.checkVictoryCondition()) {
              engine.nextRound();
              this.broadcastRoom(roomId);
            }
          }
        }, 5000);
        break;
      }

      case GamePhase.DAY_RESOLUTION:
        if (!engine.checkVictoryCondition()) {
          engine.nextRound();
        }
        break;
    }
  }

  private broadcastRoom(roomId: string): void {
    const engine = this.rooms.get(roomId);
    if (!engine) return;

    for (const [socket, client] of this.clients.entries()) {
      if (client.roomId === roomId) {
        this.sendPrivateSnapshot(socket, engine, client.playerId);
      }
    }
  }

  private sendPrivateSnapshot(socket: WebSocket, engine: GameEngine, playerId: string): void {
    const snapshot = engine.getPrivateSnapshot(playerId);
    if (snapshot) {
      this.sendSocket(socket, {
        type: 'snapshot.private',
        payload: snapshot,
      });
    }
  }

  private sendChatHistory(socket: WebSocket, roomId: string, isAlive: boolean): void {
    const history = this.chatHistory.get(roomId) || [];
    // If player is alive, filter out dead chat messages
    const filtered = isAlive ? history.filter(m => !m.isDeadChat) : history;
    this.sendSocket(socket, {
      type: 'chat.history',
      payload: { messages: filtered },
    });
  }

  private sendActionAck(socket: WebSocket, clientActionId: string, accepted: boolean, message?: string): void {
    this.sendSocket(socket, {
      type: 'action.ack',
      payload: { clientActionId, accepted, message },
    });
  }

  private sendError(socket: WebSocket, code: string, message: string): void {
    this.sendSocket(socket, {
      type: 'error.safe',
      payload: { code, message },
    });
  }

  private sendSocket(socket: WebSocket, msg: ServerMessage): void {
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(msg));
    }
  }
}
