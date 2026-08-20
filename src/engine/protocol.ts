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

/** Pose corporal cosmética do avatar. */
export enum AvatarPose {
  IDLE = 0,
  SITTING = 1,
  JUMPING = 2,
}

/** Posição cosmética de um avatar na praça: [x, z, ângulo Y, pose?]. */
export type PlayerPosition = [number, number, number, AvatarPose?];
export type PlayerPositionMap = Record<string, PlayerPosition>;

/** Estatísticas persistentes de um convidado (por navegador). */
export interface ProfileStats {
  nickname: string;
  matchesPlayed: number;
  wins: number;
  roleStats: Record<string, { played: number; wins: number }>;
  /** Moeda cosmética ganha jogando. */
  kokolas: number;
  /** Skins e temas comprados. */
  ownedSkins: string[];
}

export interface LeaderboardRow {
  nickname: string;
  wins: number;
  matchesPlayed: number;
}

export interface ProfileRecentMatch {
  roomCode: string;
  finishedAt: number;
  winner: string;
  playerCount: number;
  rounds: number;
}

export type ClientMessage =
  | {
      type: 'room.create';
      payload: {
        nickname: string;
        avatarId: string;
        /** Cor cosmética do morador (índice da paleta). */
        avatarColor?: number;
        /** Skin equipada (o servidor valida a propriedade). */
        skinId?: string;
        config?: Partial<RoomConfig>;
        /** Identidade persistente do navegador (estatísticas). */
        guestId?: string;
      };
    }
  | {
      type: 'room.join';
      payload: {
        roomCode: string;
        nickname: string;
        avatarId: string;
        avatarColor?: number;
        skinId?: string;
        /** Presente ao retomar sessão após queda de conexão. */
        sessionId?: string;
        guestId?: string;
      };
    }
  | {
      /** Pede o perfil persistente e as últimas partidas da vila. */
      type: 'profile.get';
      payload: { guestId: string };
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
      payload: { x: number; z: number; ry: number; pose?: AvatarPose };
    }
  | {
      /** Compra na loja (Kokolas ganhas jogando; validação no servidor). */
      type: 'shop.buy';
      payload: { guestId: string; itemId: string; clientActionId: string };
    }
  | {
      /** Reação rápida (emoji de lista fechada); efêmera e cosmética. */
      type: 'player.emote';
      payload: { emoji: string };
    }
  | { type: 'chat.send'; payload: { text: string } }
  | { type: 'bot.fill'; payload: { count: number } }
  | { type: 'bot.remove'; payload?: {} }
  | { type: 'match.restart'; payload?: {} }
  /** Entra no canal de voz da sala (vivos ou cemitério, decidido no servidor). */
  | { type: 'voice.join'; payload?: {} }
  /** Sai do canal de voz. */
  | { type: 'voice.leave'; payload?: {} }
  /**
   * Sinalização WebRTC (SDP/ICE) retransmitida a um par elegível.
   * O servidor só encaminha entre membros do MESMO canal de voz.
   */
  | { type: 'voice.signal'; payload: { targetId: string; data: unknown } };

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
  | {
      type: 'profile.data';
      payload: {
        profile: ProfileStats | null;
        recentMatches: ProfileRecentMatch[];
        /** Ranking da vila (mais vitórias primeiro). */
        leaderboard: LeaderboardRow[];
      };
    }
  | {
      type: 'shop.result';
      payload: {
        clientActionId: string;
        accepted: boolean;
        message?: string;
        kokolas: number;
        ownedSkins: string[];
      };
    }
  /**
   * Pares do seu canal de voz (recalculado em morte, entrada e saída).
   * Conecte-se APENAS a esses ids; `channel` é informativo para a UI.
   */
  | { type: 'voice.peers'; payload: { channel: 'ALIVE' | 'DEAD'; peerIds: string[] } }
  /** Sinalização WebRTC vinda de um par autorizado. */
  | { type: 'voice.signal'; payload: { fromId: string; data: unknown } }
  | { type: 'error.safe'; payload: { code: string; message: string } };
