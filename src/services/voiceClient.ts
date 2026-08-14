/**
 * Cidade Sob Suspeita 3D — Voz WebRTC em malha P2P
 * Sinalização pelo WebSocket do jogo; o servidor decide os pares (canais
 * vivos/cemitério). Falha de voz nunca afeta o jogo — degrada para texto.
 *
 * Padrão de negociação: "perfect negotiation" (polite/impolite por id),
 * com iniciador determinístico (menor id oferece primeiro).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { VoiceBus } from './gameClient.ts';

const ICE_SERVERS: RTCConfiguration = {
  iceServers: [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }],
};

const SPEAKING_THRESHOLD = 18; // 0-255 (média do espectro)
const SPEAKING_POLL_MS = 160;

export type VoiceStatus = 'off' | 'requesting-mic' | 'on' | 'mic-denied' | 'unsupported';

export interface VoicePeer {
  playerId: string;
  connected: boolean;
  speaking: boolean;
  /** Silenciado apenas neste aparelho (PRD 6.6). */
  mutedLocally: boolean;
}

interface PeerEntry {
  pc: RTCPeerConnection;
  audio: HTMLAudioElement;
  analyser: AnalyserNode | null;
  makingOffer: boolean;
  ignoreOffer: boolean;
  polite: boolean;
  mutedLocally: boolean;
  connected: boolean;
  speaking: boolean;
}

export interface VoiceChatApi {
  status: VoiceStatus;
  channel: 'ALIVE' | 'DEAD' | null;
  micEnabled: boolean;
  /** Falantes no momento (inclui o próprio jogador, se falando). */
  speakingIds: Set<string>;
  peers: VoicePeer[];
  joinVoice: () => Promise<void>;
  leaveVoice: () => void;
  toggleMic: () => void;
  togglePeerMute: (playerId: string) => void;
}

export function useVoiceChat(
  bus: VoiceBus,
  localPlayerId: string | null,
  /** Falso durante a noite: microfones silenciam para não vazar timing. */
  micAllowedByPhase: boolean,
  isSocketConnected: boolean
): VoiceChatApi {
  const [status, setStatus] = useState<VoiceStatus>('off');
  const [channel, setChannel] = useState<'ALIVE' | 'DEAD' | null>(null);
  const [micEnabled, setMicEnabled] = useState(true);
  const [speakingIds, setSpeakingIds] = useState<Set<string>>(new Set());
  const [peerList, setPeerList] = useState<VoicePeer[]>([]);

  const statusRef = useRef<VoiceStatus>('off');
  const micStreamRef = useRef<MediaStream | null>(null);
  const peersRef = useRef<Map<string, PeerEntry>>(new Map());
  const audioCtxRef = useRef<AudioContext | null>(null);
  const localAnalyserRef = useRef<AnalyserNode | null>(null);
  const micAllowedRef = useRef(micAllowedByPhase);
  const micEnabledRef = useRef(true);
  const localIdRef = useRef<string | null>(null);
  localIdRef.current = localPlayerId;

  const publishPeers = useCallback(() => {
    setPeerList(
      Array.from(peersRef.current.entries()).map(([playerId, entry]) => ({
        playerId,
        connected: entry.connected,
        speaking: entry.speaking,
        mutedLocally: entry.mutedLocally,
      }))
    );
  }, []);

  const applyMicState = useCallback(() => {
    const stream = micStreamRef.current;
    if (!stream) return;
    const enabled = micEnabledRef.current && micAllowedRef.current;
    stream.getAudioTracks().forEach(track => (track.enabled = enabled));
  }, []);

  const closePeer = useCallback(
    (playerId: string) => {
      const entry = peersRef.current.get(playerId);
      if (!entry) return;
      entry.pc.onicecandidate = null;
      entry.pc.ontrack = null;
      entry.pc.onnegotiationneeded = null;
      entry.pc.onconnectionstatechange = null;
      try {
        entry.pc.close();
      } catch {
        // já fechada
      }
      entry.audio.srcObject = null;
      entry.audio.remove();
      peersRef.current.delete(playerId);
      publishPeers();
    },
    [publishPeers]
  );

  const createPeer = useCallback(
    (playerId: string): PeerEntry => {
      const localId = localIdRef.current || '';
      const pc = new RTCPeerConnection(ICE_SERVERS);
      const audio = document.createElement('audio');
      audio.autoplay = true;
      (audio as any).playsInline = true;
      document.body.appendChild(audio);

      const entry: PeerEntry = {
        pc,
        audio,
        analyser: null,
        makingOffer: false,
        ignoreOffer: false,
        polite: localId > playerId, // o "educado" cede em caso de colisão de ofertas
        mutedLocally: false,
        connected: false,
        speaking: false,
      };

      const micStream = micStreamRef.current;
      if (micStream) {
        micStream.getAudioTracks().forEach(track => pc.addTrack(track, micStream));
      }

      pc.onnegotiationneeded = async () => {
        try {
          entry.makingOffer = true;
          await pc.setLocalDescription();
          bus.sendSignal(playerId, { description: pc.localDescription });
        } catch (err) {
          console.warn('Falha na oferta de voz:', err);
        } finally {
          entry.makingOffer = false;
        }
      };

      pc.onicecandidate = event => {
        if (event.candidate) {
          bus.sendSignal(playerId, { candidate: event.candidate });
        }
      };

      pc.ontrack = event => {
        const [stream] = event.streams;
        if (!stream) return;
        entry.audio.srcObject = stream;
        entry.audio.muted = entry.mutedLocally;
        entry.audio.play().catch(() => {
          // autoplay bloqueado até o próximo gesto — o botão de voz resolve
        });
        // Analisador para o indicador "falando"
        try {
          const ctx = audioCtxRef.current;
          if (ctx) {
            const source = ctx.createMediaStreamSource(stream);
            const analyser = ctx.createAnalyser();
            analyser.fftSize = 256;
            source.connect(analyser);
            entry.analyser = analyser;
          }
        } catch {
          // sem analisador, sem indicador — voz continua funcionando
        }
      };

      pc.onconnectionstatechange = () => {
        entry.connected = pc.connectionState === 'connected';
        if (pc.connectionState === 'failed') {
          try {
            pc.restartIce();
          } catch {
            // reconexão total virá pela lista de pares
          }
        }
        publishPeers();
      };

      peersRef.current.set(playerId, entry);
      publishPeers();
      return entry;
    },
    [bus, publishPeers]
  );

  /** Reconcilia a malha com a lista autoritativa de pares do servidor. */
  const reconcilePeers = useCallback(
    (peerIds: string[]) => {
      const wanted = new Set(peerIds);
      const existingIds: string[] = Array.from(peersRef.current.keys());
      for (const existing of existingIds) {
        if (!wanted.has(existing)) closePeer(existing);
      }
      const localId = localIdRef.current || '';
      for (const peerId of peerIds) {
        if (!peersRef.current.has(peerId)) {
          const entry = createPeer(peerId);
          // Iniciador determinístico: o menor id chama primeiro.
          // (onnegotiationneeded dispara ao adicionar as tracks; para o
          // não-iniciador sem tracks ainda, força transceiver de recepção.)
          if (localId < peerId && !micStreamRef.current) {
            entry.pc.addTransceiver('audio', { direction: 'recvonly' });
          }
        }
      }
    },
    [closePeer, createPeer]
  );

  // Sinalização vinda do servidor (apenas de pares autorizados)
  useEffect(() => {
    const unsubscribeSignals = bus.subscribeSignals(async ({ fromId, data }) => {
      if (statusRef.current !== 'on') return;
      let entry = peersRef.current.get(fromId);
      if (!entry) entry = createPeer(fromId);
      const { pc } = entry;
      const payload = data as {
        description?: RTCSessionDescriptionInit;
        candidate?: RTCIceCandidateInit;
      };

      try {
        if (payload.description) {
          const offerCollision =
            payload.description.type === 'offer' &&
            (entry.makingOffer || pc.signalingState !== 'stable');
          entry.ignoreOffer = !entry.polite && offerCollision;
          if (entry.ignoreOffer) return;

          await pc.setRemoteDescription(payload.description);
          if (payload.description.type === 'offer') {
            await pc.setLocalDescription();
            bus.sendSignal(fromId, { description: pc.localDescription });
          }
        } else if (payload.candidate) {
          try {
            await pc.addIceCandidate(payload.candidate);
          } catch (err) {
            if (!entry.ignoreOffer) throw err;
          }
        }
      } catch (err) {
        console.warn('Erro de sinalização de voz:', err);
      }
    });

    const unsubscribePeers = bus.subscribePeers(({ channel: ch, peerIds }) => {
      if (statusRef.current !== 'on') return;
      setChannel(ch);
      reconcilePeers(peerIds);
    });

    return () => {
      unsubscribeSignals();
      unsubscribePeers();
    };
  }, [bus, createPeer, reconcilePeers]);

  // Política de fase: noite silencia o microfone automaticamente
  useEffect(() => {
    micAllowedRef.current = micAllowedByPhase;
    applyMicState();
  }, [micAllowedByPhase, applyMicState]);

  // Reentra na voz após reconexão do WebSocket
  useEffect(() => {
    if (isSocketConnected && statusRef.current === 'on') {
      bus.joinVoice();
    }
  }, [isSocketConnected, bus]);

  // Indicador "falando" (local + remotos), ~6 Hz
  useEffect(() => {
    const interval = setInterval(() => {
      if (statusRef.current !== 'on') return;
      const next = new Set<string>();
      const buffer = new Uint8Array(128);

      const isLoud = (analyser: AnalyserNode | null): boolean => {
        if (!analyser) return false;
        analyser.getByteFrequencyData(buffer);
        let sum = 0;
        for (let i = 0; i < buffer.length; i++) sum += buffer[i];
        return sum / buffer.length > SPEAKING_THRESHOLD;
      };

      const localId = localIdRef.current;
      if (localId && micEnabledRef.current && micAllowedRef.current && isLoud(localAnalyserRef.current)) {
        next.add(localId);
      }
      peersRef.current.forEach((entry, playerId) => {
        const speaking = !entry.mutedLocally && isLoud(entry.analyser);
        if (speaking) next.add(playerId);
        if (speaking !== entry.speaking) {
          entry.speaking = speaking;
        }
      });

      setSpeakingIds(prev => {
        if (prev.size === next.size && [...next].every(id => prev.has(id))) return prev;
        publishPeers();
        return next;
      });
    }, SPEAKING_POLL_MS);
    return () => clearInterval(interval);
  }, [publishPeers]);

  const joinVoice = useCallback(async () => {
    if (statusRef.current === 'on' || statusRef.current === 'requesting-mic') return;
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia || typeof RTCPeerConnection === 'undefined') {
      statusRef.current = 'unsupported';
      setStatus('unsupported');
      return;
    }

    statusRef.current = 'requesting-mic';
    setStatus('requesting-mic');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      micStreamRef.current = stream;

      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        const ctx: AudioContext = audioCtxRef.current || new AudioCtx();
        audioCtxRef.current = ctx;
        ctx.resume().catch(() => {});
        const source = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        source.connect(analyser);
        localAnalyserRef.current = analyser;
      }

      applyMicState();
      statusRef.current = 'on';
      setStatus('on');
      bus.joinVoice();
    } catch (err) {
      console.warn('Microfone indisponível:', err);
      statusRef.current = 'mic-denied';
      setStatus('mic-denied');
    }
  }, [bus, applyMicState]);

  const leaveVoice = useCallback(() => {
    bus.leaveVoice();
    statusRef.current = 'off';
    setStatus('off');
    setChannel(null);
    setSpeakingIds(new Set());
    Array.from(peersRef.current.keys()).forEach(closePeer);
    micStreamRef.current?.getTracks().forEach(t => t.stop());
    micStreamRef.current = null;
    localAnalyserRef.current = null;
  }, [bus, closePeer]);

  const toggleMic = useCallback(() => {
    micEnabledRef.current = !micEnabledRef.current;
    setMicEnabled(micEnabledRef.current);
    applyMicState();
  }, [applyMicState]);

  const togglePeerMute = useCallback(
    (playerId: string) => {
      const entry = peersRef.current.get(playerId);
      if (!entry) return;
      entry.mutedLocally = !entry.mutedLocally;
      entry.audio.muted = entry.mutedLocally;
      publishPeers();
    },
    [publishPeers]
  );

  // Encerramento limpo ao desmontar
  useEffect(() => {
    return () => {
      if (statusRef.current === 'on') {
        Array.from(peersRef.current.keys()).forEach(id => {
          const entry = peersRef.current.get(id);
          entry?.pc.close();
          entry?.audio.remove();
        });
        peersRef.current.clear();
        micStreamRef.current?.getTracks().forEach(t => t.stop());
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return useMemo(
    () => ({
      status,
      channel,
      micEnabled,
      speakingIds,
      peers: peerList,
      joinVoice,
      leaveVoice,
      toggleMic,
      togglePeerMute,
    }),
    [status, channel, micEnabled, speakingIds, peerList, joinVoice, leaveVoice, toggleMic, togglePeerMute]
  );
}
