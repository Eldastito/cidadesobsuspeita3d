/**
 * Cidade Sob Suspeita 3D — Protocolo tipado cliente ⇄ servidor
 */

import {
  ChatMessage,
  NightSubmission,
  PrivatePlayerSnapshot,
  RoomConfig,
  VoteSubmission,
} from './types.ts';

export const PROTOCOL_VERSION = '2.0.0';

/** Posição cosmética de um avatar na praça: [x, z, ângulo Y]. */
export type PlayerPosition = [number, number, number];
export type PlayerPositionMap = Record<string, PlayerPosition>;

export type ClientMessage =
  | {
      type: 'room.create';
      payload: {
        nickname: string;
        avatarId: string;
        config?: Partial<RoomConfig>;
      };
    }
  | {
      type: 'room.join';
      payload: {
        roomCode: string;
        nickname: string;
        avatarId: string;
        /** Presente ao retomar sessão após queda de conexão. */
        sessionId?: string;
      };
    }
  | { type: 'room.leave'; payload?: {} }
  | { type: 'room.updateConfig'; payload: { config: Partial<RoomConfig> } }
  | { type: 'player.ready'; payload: { isReady: boolean } }
  | { type: 'match.start'; payload?: {} }
  | { type: 'role.confirm'; payload?: {} }
  | { type: 'night.action'; payload: NightSubmission }
  | { type: 'vote.submit'; payload: VoteSubmission }
  | {
      type: 'mayor.tiebreak.submit';
      payload: { targetId: string; clientActionId: string };
    }
  | { type: 'player.handRaise'; payload?: {} }
  | {
      /** Movimento cosmético do avatar; nunca afeta regras. */
      type: 'player.move';
      payload: { x: number; z: number; ry: number };
    }
  | {
      /** Reação rápida (emoji de lista fechada); efêmera e cosmética. */
      type: 'player.emote';
      payload: { emoji: string };
    }
  | { type: 'chat.send'; payload: { text: string } }
  | { type: 'bot.fill'; payload: { count: number } }
  | { type: 'bot.remove'; payload?: {} }
  | { type: 'match.restart'; payload?: {} };

export type ServerMessage =
  | { type: 'snapshot.private'; payload: PrivatePlayerSnapshot }
  | {
      /** Credenciais de retomada — o cliente persiste localmente. */
      type: 'session.info';
      payload: { sessionId: string; playerId: string; roomCode: string };
    }
  | {
      /** Posições dos avatares (10 Hz), volátil e cosmético. */
      type: 'player.positions';
      payload: { positions: PlayerPositionMap };
    }
  | {
      /** Reação de um jogador, retransmitida à sala (não persiste). */
      type: 'player.emote.shown';
      payload: { playerId: string; emoji: string };
    }
  | { type: 'chat.message'; payload: ChatMessage }
  | { type: 'chat.history'; payload: { messages: ChatMessage[] } }
  | {
      type: 'action.ack';
      payload: { clientActionId: string; accepted: boolean; message?: string };
    }
  | { type: 'room.left'; payload?: {} }
  | { type: 'error.safe'; payload: { code: string; message: string } };
