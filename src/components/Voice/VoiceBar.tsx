/**
 * Cidade Sob Suspeita 3D — Barra de voz
 * Ativar/sair da voz, microfone, canal atual (praça/cemitério),
 * lista de participantes com indicador de fala e mute local.
 */

import React from 'react';
import { Headphones, Mic, MicOff, PhoneOff, Volume2, VolumeX } from 'lucide-react';
import { PublicPlayerView } from '../../engine/types.ts';
import { VoiceChatApi } from '../../services/voiceClient.ts';

interface VoiceBarProps {
  voice: VoiceChatApi;
  players: PublicPlayerView[];
  localPlayerId: string;
  /** Noite silencia microfones dos vivos. */
  isNightMuted: boolean;
}

export const VoiceBar: React.FC<VoiceBarProps> = ({ voice, players, localPlayerId, isNightMuted }) => {
  const nameOf = (id: string) => players.find(p => p.id === id)?.nickname || '???';

  if (voice.status === 'unsupported') {
    return (
      <div className="bg-ink-900 border border-white/5 rounded-2xl p-2.5 text-[11px] text-slate-500">
        🎙️ Voz indisponível neste navegador — o jogo continua por texto.
      </div>
    );
  }

  if (voice.status === 'mic-denied') {
    return (
      <div className="bg-ink-900 border border-amber-500/30 rounded-2xl p-2.5 flex items-center justify-between gap-2">
        <span className="text-[11px] text-amber-300">
          Microfone bloqueado. Libere a permissão no navegador e tente de novo.
        </span>
        <button
          onClick={() => voice.joinVoice()}
          className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-[11px] font-semibold text-slate-200"
        >
          Tentar de novo
        </button>
      </div>
    );
  }

  if (voice.status !== 'on') {
    return (
      <div className="bg-ink-900 border border-white/5 rounded-2xl p-2.5 flex items-center justify-between gap-2">
        <span className="text-[11px] text-slate-400 flex items-center gap-1.5">
          <Headphones className="w-3.5 h-3.5 text-lantern-300" />
          Converse por voz com a sala (opcional)
        </span>
        <button
          onClick={() => voice.joinVoice()}
          disabled={voice.status === 'requesting-mic'}
          className="px-3 py-1.5 rounded-lg bg-lantern-400 hover:bg-lantern-300 disabled:opacity-50 text-ink-950 text-[11px] font-bold transition-colors flex items-center gap-1.5"
        >
          <Mic className="w-3.5 h-3.5" />
          {voice.status === 'requesting-mic' ? 'Pedindo microfone…' : 'Ativar voz'}
        </button>
      </div>
    );
  }

  const localSpeaking = voice.speakingIds.has(localPlayerId);
  const micLive = voice.micEnabled && !isNightMuted;

  return (
    <div className="bg-ink-900 border border-white/5 rounded-2xl p-2.5 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500 flex items-center gap-1.5">
          <Headphones className="w-3.5 h-3.5 text-lantern-300" />
          {voice.channel === 'DEAD' ? 'Voz — Cemitério 👻' : 'Voz — Praça'}
        </span>
        <div className="flex items-center gap-1.5">
          <button
            onClick={voice.toggleMic}
            title={voice.micEnabled ? 'Silenciar meu microfone' : 'Reativar meu microfone'}
            className={`p-1.5 rounded-lg border transition-colors ${
              micLive
                ? localSpeaking
                  ? 'bg-emerald-500/20 border-emerald-400/60 text-emerald-300'
                  : 'bg-white/5 border-white/10 text-slate-200 hover:bg-white/10'
                : 'bg-rose-500/10 border-rose-500/30 text-rose-400'
            }`}
          >
            {micLive ? <Mic className="w-3.5 h-3.5" /> : <MicOff className="w-3.5 h-3.5" />}
          </button>
          <button
            onClick={voice.leaveVoice}
            title="Sair da voz"
            className="p-1.5 rounded-lg bg-white/5 hover:bg-rose-500/20 border border-white/10 text-slate-400 hover:text-rose-300 transition-colors"
          >
            <PhoneOff className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {isNightMuted && (
        <p className="text-[10px] text-purple-300/80">
          🌙 A cidade dorme: microfones silenciados até o amanhecer.
        </p>
      )}

      {voice.peers.length === 0 ? (
        <p className="text-[10px] text-slate-500">Ninguém mais está na voz por enquanto.</p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {voice.peers.map(peer => (
            <button
              key={peer.playerId}
              onClick={() => voice.togglePeerMute(peer.playerId)}
              title={peer.mutedLocally ? 'Reativar este jogador (só para você)' : 'Silenciar este jogador (só para você)'}
              className={`px-2 py-1 rounded-lg border text-[10px] font-semibold flex items-center gap-1 transition-colors ${
                peer.speaking
                  ? 'bg-emerald-500/15 border-emerald-400/50 text-emerald-300'
                  : peer.mutedLocally
                  ? 'bg-rose-500/10 border-rose-500/30 text-rose-300'
                  : peer.connected
                  ? 'bg-white/5 border-white/10 text-slate-300'
                  : 'bg-ink-950/60 border-white/5 text-slate-500'
              }`}
            >
              {peer.mutedLocally ? <VolumeX className="w-3 h-3" /> : <Volume2 className="w-3 h-3" />}
              {nameOf(peer.playerId)}
              {!peer.connected && <span className="opacity-60">(conectando…)</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
