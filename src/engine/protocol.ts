/**
 * Cidade Sob Suspeita 3D - Protocol & Messaging Definition
 */

import {
  ChatMessage,
  GamePhase,
  NightSubmission,
  PrivatePlayerSnapshot,
  RoomConfig,
  VoteSubmission,
} from './types.ts';

export const PROTOCOL_VERSION = '1.0.0';

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
        sessionId?: string;
      };
    }
  | {
      type: 'room.updateConfig';
      payload: {
        config: RoomConfig;
      };
    }
  | {
      type: 'player.ready';
      payload: {
        isReady: boolean;
      };
    }
  | {
      type: 'match.start';
      payload?: {};
    }
  | {
      type: 'role.confirm';
      payload?: {};
    }
  | {
      type: 'night.action';
      payload: NightSubmission;
    }
  | {
      type: 'vote.submit';
      payload: VoteSubmission;
    }
  | {
      type: 'player.handRaise';
      payload?: {};
    }
  | {
      type: 'chat.send';
      payload: {
        text: string;
      };
    }
  | {
      type: 'bot.fill';
      payload: {
        count: number;
      };
    }
  | {
      type: 'bot.remove';
      payload?: {};
    }
  | {
      type: 'match.restart';
      payload?: {};
    };

export type ServerMessage =
  | {
      type: 'snapshot.private';
      payload: PrivatePlayerSnapshot;
    }
  | {
      type: 'chat.message';
      payload: ChatMessage;
    }
  | {
      type: 'chat.history';
      payload: {
        messages: ChatMessage[];
      };
    }
  | {
      type: 'action.ack';
      payload: {
        clientActionId: string;
        accepted: boolean;
        message?: string;
      };
    }
  | {
      type: 'error.safe';
      payload: {
        code: string;
        message: string;
      };
    };
