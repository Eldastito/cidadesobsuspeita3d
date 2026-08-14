/**
 * Cidade Sob Suspeita 3D - WebSocket Game Client Service
 */

import { useEffect, useRef, useState } from 'react';
import {
  ChatMessage,
  GamePhase,
  NightActionType,
  NightSubmission,
  PrivatePlayerSnapshot,
  RoomConfig,
  VoteSubmission,
} from '../engine/types.ts';
import { ClientMessage, ServerMessage } from '../engine/protocol.ts';
import { sound } from './soundEffects.ts';

export interface GameClientState {
  isConnected: boolean;
  isConnecting: boolean;
  snapshot: PrivatePlayerSnapshot | null;
  chatMessages: ChatMessage[];
  lastError: string | null;
  selectedTargetId: string | null;
  viewMode: '3D' | '2D';
}

export function useGameClient() {
  const [state, setState] = useState<GameClientState>({
    isConnected: false,
    isConnecting: false,
    snapshot: null,
    chatMessages: [],
    lastError: null,
    selectedTargetId: null,
    viewMode: '3D',
  });

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastPhaseRef = useRef<GamePhase | null>(null);

  const connect = () => {
    if (wsRef.current && (wsRef.current.readyState === WebSocket.OPEN || wsRef.current.readyState === WebSocket.CONNECTING)) {
      return;
    }

    setState(prev => ({ ...prev, isConnecting: true, lastError: null }));

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    const wsUrl = `${protocol}//${host}/ws`;

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      setState(prev => ({ ...prev, isConnected: true, isConnecting: false, lastError: null }));
    };

    ws.onmessage = (event) => {
      try {
        const msg: ServerMessage = JSON.parse(event.data);
        handleServerMessage(msg);
      } catch (err) {
        console.error('Failed to parse server message:', err);
      }
    };

    ws.onclose = () => {
      setState(prev => ({ ...prev, isConnected: false, isConnecting: false }));
      // Attempt reconnect after 2.5 seconds
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = setTimeout(() => {
        connect();
      }, 2500);
    };

    ws.onerror = (err) => {
      console.warn('WebSocket connection error:', err);
      setState(prev => ({ ...prev, isConnected: false, isConnecting: false }));
    };
  };

  useEffect(() => {
    connect();
    return () => {
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      if (wsRef.current) wsRef.current.close();
    };
  }, []);

  const send = (msg: ClientMessage) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
    } else {
      console.warn('Cannot send message: WebSocket is not open');
    }
  };

  const handleServerMessage = (msg: ServerMessage) => {
    switch (msg.type) {
      case 'snapshot.private': {
        const snapshot = msg.payload;
        
        // Sound and narration triggers on phase transition
        if (snapshot.room.phase !== lastPhaseRef.current) {
          const currentPhase = snapshot.room.phase;
          lastPhaseRef.current = currentPhase;

          if (currentPhase === GamePhase.NIGHT_ACTIONS) {
            sound.playNightWhisper();
            sound.speakNarration('A noite caiu sobre a cidade. Os personagens especiais agem nas sombras.');
          } else if (currentPhase === GamePhase.DAWN) {
            sound.playBellToll();
            if (snapshot.room.dawnSummary?.narrativeText) {
              sound.speakNarration(snapshot.room.dawnSummary.narrativeText);
            }
          } else if (currentPhase === GamePhase.DISCUSSION) {
            sound.speakNarration('O debate na praça começou. Descubram os culpados!');
          } else if (currentPhase === GamePhase.VOTING) {
            sound.speakNarration('A votação foi iniciada. Escolham seu voto com sabedoria.');
          } else if (currentPhase === GamePhase.DAY_RESOLUTION) {
            sound.playEliminationGavel();
            if (snapshot.room.lastVotingSummary?.eliminatedNickname) {
              sound.speakNarration(`${snapshot.room.lastVotingSummary.eliminatedNickname} foi eliminado pela cidade.`);
            }
          } else if (currentPhase === GamePhase.FINISHED) {
            sound.playVictoryFanfare();
            if (snapshot.room.winner === 'CIDADE') {
              sound.speakNarration('A cidade venceu! Todos os assassinos foram derrotados.');
            } else if (snapshot.room.winner === 'ASSASSINOS') {
              sound.speakNarration('Os assassinos triunfaram e dominaram a cidade!');
            }
          }
        }

        setState(prev => ({
          ...prev,
          snapshot,
          lastError: null,
        }));
        break;
      }

      case 'chat.message': {
        setState(prev => ({
          ...prev,
          chatMessages: [...prev.chatMessages, msg.payload],
        }));
        break;
      }

      case 'chat.history': {
        setState(prev => ({
          ...prev,
          chatMessages: msg.payload.messages,
        }));
        break;
      }

      case 'action.ack': {
        if (!msg.payload.accepted && msg.payload.message) {
          setState(prev => ({ ...prev, lastError: msg.payload.message || 'Ação rejeitada.' }));
        }
        break;
      }

      case 'error.safe': {
        setState(prev => ({ ...prev, lastError: msg.payload.message }));
        break;
      }
    }
  };

  // Helper actions
  const createRoom = (nickname: string, avatarId: string, config?: Partial<RoomConfig>) => {
    send({
      type: 'room.create',
      payload: { nickname, avatarId, config },
    });
  };

  const joinRoom = (roomCode: string, nickname: string, avatarId: string) => {
    send({
      type: 'room.join',
      payload: { roomCode, nickname, avatarId },
    });
  };

  const updateConfig = (config: RoomConfig) => {
    send({
      type: 'room.updateConfig',
      payload: { config },
    });
  };

  const setReady = (isReady: boolean) => {
    send({
      type: 'player.ready',
      payload: { isReady },
    });
  };

  const startMatch = () => {
    send({ type: 'match.start' });
  };

  const confirmRole = () => {
    send({ type: 'role.confirm' });
  };

  const submitNightAction = (actionType: NightActionType, targetId?: string | null) => {
    sound.playVoteClick();
    send({
      type: 'night.action',
      payload: {
        playerId: state.snapshot?.player.id || '',
        actionType,
        targetId,
        clientActionId: `act-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
        timestamp: Date.now(),
      },
    });
  };

  const submitVote = (targetId: string | null) => {
    sound.playVoteClick();
    send({
      type: 'vote.submit',
      payload: {
        voterId: state.snapshot?.player.id || '',
        targetId,
        clientActionId: `vote-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
        timestamp: Date.now(),
      },
    });
  };

  const toggleHandRaise = () => {
    send({ type: 'player.handRaise' });
  };

  const sendChat = (text: string) => {
    send({
      type: 'chat.send',
      payload: { text },
    });
  };

  const fillBots = (count: number) => {
    send({
      type: 'bot.fill',
      payload: { count },
    });
  };

  const removeBots = () => {
    send({ type: 'bot.remove' });
  };

  const restartMatch = () => {
    send({ type: 'match.restart' });
  };

  const setSelectedTargetId = (targetId: string | null) => {
    setState(prev => ({ ...prev, selectedTargetId: targetId }));
  };

  const toggleViewMode = () => {
    setState(prev => ({ ...prev, viewMode: prev.viewMode === '3D' ? '2D' : '3D' }));
  };

  const dismissError = () => {
    setState(prev => ({ ...prev, lastError: null }));
  };

  return {
    ...state,
    createRoom,
    joinRoom,
    updateConfig,
    setReady,
    startMatch,
    confirmRole,
    submitNightAction,
    submitVote,
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
