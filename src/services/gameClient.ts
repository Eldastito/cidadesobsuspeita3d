/**
 * Cidade Sob Suspeita 3D — Cliente WebSocket do jogo
 * Reconexão com retomada de sessão, legendas do narrador (acessibilidade)
 * e canal de posições fora do estado React (atualiza a 10 Hz sem re-render).
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ChatMessage,
  GamePhase,
  NightActionType,
  PrivatePlayerSnapshot,
  RoomConfig,
} from '../engine/types.ts';
import {
  ClientMessage,
  PlayerPositionMap,
  ProfileRecentMatch,
  ProfileStats,
  ServerMessage,
} from '../engine/protocol.ts';
import { sound } from './soundEffects.ts';

const STORAGE_KEY = 'cidade-sob-suspeita:session';
const GUEST_KEY = 'cidade-sob-suspeita:guest-id';

/** Identidade persistente do navegador — dá continuidade às estatísticas. */
function getGuestId(): string {
  try {
    let id = localStorage.getItem(GUEST_KEY);
    if (!id) {
      id =
        typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID()
          : `guest-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      localStorage.setItem(GUEST_KEY, id);
    }
    return id;
  } catch {
    return `guest-anon-${Math.random().toString(36).slice(2, 10)}`;
  }
}

interface StoredSession {
  roomCode: string;
  sessionId: string;
  nickname: string;
  avatarId: string;
}

function loadStoredSession(): StoredSession | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as StoredSession) : null;
  } catch {
    return null;
  }
}

function saveStoredSession(session: StoredSession | null): void {
  try {
    if (session) localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // armazenamento indisponível (modo privado etc.) — sessão só não é retomável
  }
}

export interface NarratorCaption {
  text: string;
  key: number;
}

export interface ProfileData {
  profile: ProfileStats | null;
  recentMatches: ProfileRecentMatch[];
}

export interface GameClientState {
  isConnected: boolean;
  isConnecting: boolean;
  snapshot: PrivatePlayerSnapshot | null;
  chatMessages: ChatMessage[];
  lastError: string | null;
  selectedTargetId: string | null;
  viewMode: '3D' | '2D';
  narratorCaption: NarratorCaption | null;
  profileData: ProfileData | null;
}

export interface EmoteEvent {
  playerId: string;
  emoji: string;
}

export interface VoicePeersEvent {
  channel: 'ALIVE' | 'DEAD';
  peerIds: string[];
}

export interface VoiceSignalEvent {
  fromId: string;
  data: unknown;
}

/** Canal de sinalização de voz — consumido pelo VoiceManager (WebRTC). */
export interface VoiceBus {
  joinVoice: () => void;
  leaveVoice: () => void;
  sendSignal: (targetId: string, data: unknown) => void;
  subscribePeers: (cb: (event: VoicePeersEvent) => void) => () => void;
  subscribeSignals: (cb: (event: VoiceSignalEvent) => void) => () => void;
}

/** Canal imperativo de posições e reações — consumido direto pela cena 3D. */
export interface MovementBus {
  sendMove: (x: number, z: number, ry: number) => void;
  subscribePositions: (cb: (positions: PlayerPositionMap) => void) => () => void;
  sendEmote: (emoji: string) => void;
  subscribeEmotes: (cb: (event: EmoteEvent) => void) => () => void;
}

type PositionListener = (positions: PlayerPositionMap) => void;
type EmoteListener = (event: EmoteEvent) => void;

export function useGameClient() {
  const [state, setState] = useState<GameClientState>({
    isConnected: false,
    isConnecting: false,
    snapshot: null,
    chatMessages: [],
    lastError: null,
    selectedTargetId: null,
    viewMode: '3D',
    narratorCaption: null,
    profileData: null,
  });

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastPhaseRef = useRef<GamePhase | null>(null);
  const storedSessionRef = useRef<StoredSession | null>(null);
  const pendingIdentityRef = useRef<{ nickname: string; avatarId: string } | null>(null);
  const positionListenersRef = useRef<Set<PositionListener>>(new Set());
  const emoteListenersRef = useRef<Set<EmoteListener>>(new Set());
  const voicePeersListenersRef = useRef<Set<(e: VoicePeersEvent) => void>>(new Set());
  const voiceSignalListenersRef = useRef<Set<(e: VoiceSignalEvent) => void>>(new Set());

  const send = (msg: ClientMessage) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
    }
  };

  const narrate = (text: string) => {
    sound.speakNarration(text);
    setState(prev => ({ ...prev, narratorCaption: { text, key: Date.now() } }));
  };

  const handleServerMessage = (msg: ServerMessage) => {
    switch (msg.type) {
      case 'snapshot.private': {
        const snapshot = msg.payload;

        if (snapshot.room.phase !== lastPhaseRef.current) {
          const phase = snapshot.room.phase;
          lastPhaseRef.current = phase;

          if (phase === GamePhase.NIGHT_ACTIONS) {
            sound.playNightWhisper();
            narrate('A noite caiu sobre a cidade. Fechem os olhos... alguns agirão nas sombras.');
          } else if (phase === GamePhase.DAWN) {
            sound.playBellToll();
            if (snapshot.room.dawnSummary?.narrativeText) {
              narrate(snapshot.room.dawnSummary.narrativeText);
            }
          } else if (phase === GamePhase.DISCUSSION) {
            narrate('O dia amanheceu de vez. Debatam na praça: quem está mentindo?');
          } else if (phase === GamePhase.VOTING) {
            narrate('A votação começou. Escolham com sabedoria — o voto é secreto.');
          } else if (phase === GamePhase.RUNOFF) {
            narrate('Empate! Segundo turno: votem novamente, apenas entre os empatados.');
          } else if (phase === GamePhase.MAYOR_TIEBREAK) {
            narrate('Empate na votação. A palavra final é do Prefeito.');
          } else if (phase === GamePhase.DAY_RESOLUTION) {
            sound.playEliminationGavel();
            const summary = snapshot.room.lastVotingSummary;
            if (summary?.eliminatedNickname) {
              narrate(`${summary.eliminatedNickname} foi eliminado pela cidade.`);
            } else if (summary) {
              narrate('Ninguém foi eliminado neste julgamento.');
            }
          } else if (phase === GamePhase.FINISHED) {
            sound.playVictoryFanfare();
            if (snapshot.room.winner === 'CIDADE') {
              narrate('A cidade venceu! Todos os assassinos foram desmascarados.');
            } else if (snapshot.room.winner === 'ASSASSINOS') {
              narrate('Os assassinos triunfaram e dominaram a cidade!');
            }
            // Atualiza as estatísticas persistentes após o registro no servidor
            setTimeout(() => send({ type: 'profile.get', payload: { guestId: getGuestId() } }), 1500);
          }
        }

        setState(prev => ({ ...prev, snapshot, lastError: null }));
        break;
      }

      case 'session.info': {
        const identity = pendingIdentityRef.current;
        const stored: StoredSession = {
          roomCode: msg.payload.roomCode,
          sessionId: msg.payload.sessionId,
          nickname: identity?.nickname || storedSessionRef.current?.nickname || 'Morador',
          avatarId: identity?.avatarId || storedSessionRef.current?.avatarId || 'avatar-1',
        };
        storedSessionRef.current = stored;
        saveStoredSession(stored);
        break;
      }

      case 'player.positions': {
        positionListenersRef.current.forEach(cb => cb(msg.payload.positions));
        break;
      }

      case 'player.emote.shown': {
        emoteListenersRef.current.forEach(cb => cb(msg.payload));
        break;
      }

      case 'profile.data': {
        setState(prev => ({ ...prev, profileData: msg.payload }));
        break;
      }

      case 'voice.peers': {
        voicePeersListenersRef.current.forEach(cb => cb(msg.payload));
        break;
      }

      case 'voice.signal': {
        voiceSignalListenersRef.current.forEach(cb => cb(msg.payload));
        break;
      }

      case 'chat.message': {
        setState(prev => ({ ...prev, chatMessages: [...prev.chatMessages, msg.payload] }));
        break;
      }

      case 'chat.history': {
        setState(prev => ({ ...prev, chatMessages: msg.payload.messages }));
        break;
      }

      case 'action.ack': {
        if (!msg.payload.accepted && msg.payload.message) {
          setState(prev => ({ ...prev, lastError: msg.payload.message || 'Ação rejeitada.' }));
        }
        break;
      }

      case 'room.left': {
        storedSessionRef.current = null;
        saveStoredSession(null);
        lastPhaseRef.current = null;
        setState(prev => ({
          ...prev,
          snapshot: null,
          chatMessages: [],
          selectedTargetId: null,
          narratorCaption: null,
        }));
        break;
      }

      case 'error.safe': {
        // Sessão guardada não vale mais → limpa para não insistir
        if (msg.payload.code === 'ROOM_NOT_FOUND' && storedSessionRef.current) {
          storedSessionRef.current = null;
          saveStoredSession(null);
        }
        setState(prev => ({ ...prev, lastError: msg.payload.message }));
        break;
      }
    }
  };

  const connect = () => {
    if (
      wsRef.current &&
      (wsRef.current.readyState === WebSocket.OPEN || wsRef.current.readyState === WebSocket.CONNECTING)
    ) {
      return;
    }

    setState(prev => ({ ...prev, isConnecting: true }));

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws`);
    wsRef.current = ws;

    ws.onopen = () => {
      setState(prev => ({ ...prev, isConnected: true, isConnecting: false }));
      // Perfil persistente (estatísticas e últimas partidas)
      ws.send(
        JSON.stringify({ type: 'profile.get', payload: { guestId: getGuestId() } } satisfies ClientMessage)
      );
      // Retomada automática após queda: reentra na sala com a mesma sessão
      const stored = storedSessionRef.current;
      if (stored) {
        ws.send(
          JSON.stringify({
            type: 'room.join',
            payload: {
              roomCode: stored.roomCode,
              nickname: stored.nickname,
              avatarId: stored.avatarId,
              sessionId: stored.sessionId,
              guestId: getGuestId(),
            },
          } satisfies ClientMessage)
        );
      }
    };

    ws.onmessage = event => {
      try {
        handleServerMessage(JSON.parse(event.data));
      } catch (err) {
        console.error('Falha ao interpretar mensagem do servidor:', err);
      }
    };

    ws.onclose = () => {
      setState(prev => ({ ...prev, isConnected: false, isConnecting: false }));
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = setTimeout(connect, 2000);
    };

    ws.onerror = () => {
      setState(prev => ({ ...prev, isConnected: false, isConnecting: false }));
    };
  };

  useEffect(() => {
    storedSessionRef.current = loadStoredSession();
    connect();
    return () => {
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      if (wsRef.current) wsRef.current.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Ações ────────────────────────────────────────────────────────────────

  const newActionId = (prefix: string) =>
    `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

  const createRoom = (nickname: string, avatarId: string, config?: Partial<RoomConfig>) => {
    pendingIdentityRef.current = { nickname, avatarId };
    send({ type: 'room.create', payload: { nickname, avatarId, config, guestId: getGuestId() } });
  };

  const joinRoom = (roomCode: string, nickname: string, avatarId: string) => {
    pendingIdentityRef.current = { nickname, avatarId };
    send({ type: 'room.join', payload: { roomCode, nickname, avatarId, guestId: getGuestId() } });
  };

  const leaveRoom = () => send({ type: 'room.leave' });

  const updateConfig = (config: Partial<RoomConfig>) =>
    send({ type: 'room.updateConfig', payload: { config } });

  const setReady = (isReady: boolean) => send({ type: 'player.ready', payload: { isReady } });
  const startMatch = () => send({ type: 'match.start' });
  const confirmRole = () => send({ type: 'role.confirm' });

  const submitNightAction = (actionType: NightActionType, targetId?: string | null) => {
    sound.playVoteClick();
    send({
      type: 'night.action',
      payload: {
        playerId: '', // o servidor usa a identidade da conexão
        actionType,
        targetId,
        clientActionId: newActionId('act'),
        timestamp: Date.now(),
      },
    });
  };

  const submitVote = (targetId: string | null) => {
    sound.playVoteClick();
    send({
      type: 'vote.submit',
      payload: {
        voterId: '',
        targetId,
        clientActionId: newActionId('vote'),
        timestamp: Date.now(),
      },
    });
  };

  const submitMayorTiebreak = (targetId: string) => {
    sound.playVoteClick();
    send({
      type: 'mayor.tiebreak.submit',
      payload: { targetId, clientActionId: newActionId('mayor') },
    });
  };

  const toggleHandRaise = () => send({ type: 'player.handRaise' });
  const sendChat = (text: string) => send({ type: 'chat.send', payload: { text } });
  const fillBots = (count: number) => send({ type: 'bot.fill', payload: { count } });
  const removeBots = () => send({ type: 'bot.remove' });
  const restartMatch = () => send({ type: 'match.restart' });

  const setSelectedTargetId = (targetId: string | null) =>
    setState(prev => ({
      ...prev,
      selectedTargetId: prev.selectedTargetId === targetId ? null : targetId,
    }));

  const toggleViewMode = () =>
    setState(prev => ({ ...prev, viewMode: prev.viewMode === '3D' ? '2D' : '3D' }));

  const dismissError = () => setState(prev => ({ ...prev, lastError: null }));

  // Canal de movimento estável (não muda entre renders)
  const movementBus = useMemo<MovementBus>(
    () => ({
      sendMove: (x, z, ry) => send({ type: 'player.move', payload: { x, z, ry } }),
      subscribePositions: cb => {
        positionListenersRef.current.add(cb);
        return () => positionListenersRef.current.delete(cb);
      },
      sendEmote: emoji => send({ type: 'player.emote', payload: { emoji } }),
      subscribeEmotes: cb => {
        emoteListenersRef.current.add(cb);
        return () => emoteListenersRef.current.delete(cb);
      },
    }),
    []
  );

  const voiceBus = useMemo<VoiceBus>(
    () => ({
      joinVoice: () => send({ type: 'voice.join' }),
      leaveVoice: () => send({ type: 'voice.leave' }),
      sendSignal: (targetId, data) => send({ type: 'voice.signal', payload: { targetId, data } }),
      subscribePeers: cb => {
        voicePeersListenersRef.current.add(cb);
        return () => voicePeersListenersRef.current.delete(cb);
      },
      subscribeSignals: cb => {
        voiceSignalListenersRef.current.add(cb);
        return () => voiceSignalListenersRef.current.delete(cb);
      },
    }),
    []
  );

  return {
    ...state,
    movementBus,
    voiceBus,
    createRoom,
    joinRoom,
    leaveRoom,
    updateConfig,
    setReady,
    startMatch,
    confirmRole,
    submitNightAction,
    submitVote,
    submitMayorTiebreak,
    toggleHandRaise,
    sendChat,
    fillBots,
    removeBots,
    restartMatch,
    setSelectedTargetId,
    toggleViewMode,
    dismissError,
  };
}
