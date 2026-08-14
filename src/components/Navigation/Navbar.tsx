/**
 * Cidade Sob Suspeita 3D — Cabeçalho de navegação e status
 * Fase atual com barra de tempo, papel do jogador, sala e controles.
 */

import React, { useState } from 'react';
import {
  BookOpen,
  CheckCircle,
  Copy,
  DoorOpen,
  Gavel,
  HelpCircle,
  Moon,
  Shield,
  Sun,
  Sunrise,
  Trophy,
  Users,
  MessagesSquare,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { GamePhase, PrivatePlayerSnapshot } from '../../engine/types.ts';
import { ROLE_METADATA } from '../../engine/rules.ts';
import { sound } from '../../services/soundEffects.ts';

interface NavbarProps {
  snapshot: PrivatePlayerSnapshot | null;
  viewMode: '3D' | '2D';
  onToggleViewMode: () => void;
  onOpenNotebook: () => void;
  onOpenRules: () => void;
  onLeaveRoom: () => void;
}

const PHASE_DISPLAY: Record<string, { label: string; classes: string; icon: React.ElementType }> = {
  [GamePhase.LOBBY]: { label: 'Sala de espera', classes: 'bg-white/5 text-slate-300 border-white/10', icon: Users },
  [GamePhase.ROLE_REVEAL]: { label: 'Papéis secretos', classes: 'bg-indigo-500/10 text-indigo-300 border-indigo-500/30', icon: Shield },
  [GamePhase.NIGHT_ACTIONS]: { label: 'Noite', classes: 'bg-purple-500/10 text-purple-300 border-purple-500/30', icon: Moon },
  [GamePhase.NIGHT_RESOLUTION]: { label: 'Noite', classes: 'bg-purple-500/10 text-purple-300 border-purple-500/30', icon: Moon },
  [GamePhase.DAWN]: { label: 'Amanhecer', classes: 'bg-amber-500/10 text-amber-300 border-amber-500/30', icon: Sunrise },
  [GamePhase.DISCUSSION]: { label: 'Debate na praça', classes: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30', icon: MessagesSquare },
  [GamePhase.VOTING]: { label: 'Votação secreta', classes: 'bg-rose-500/10 text-rose-300 border-rose-500/30', icon: Gavel },
  [GamePhase.RUNOFF]: { label: 'Segundo turno', classes: 'bg-rose-500/10 text-rose-300 border-rose-500/30', icon: Gavel },
  [GamePhase.MAYOR_TIEBREAK]: { label: 'Voto do Prefeito', classes: 'bg-lantern-400/10 text-lantern-300 border-lantern-400/30', icon: Gavel },
  [GamePhase.DAY_RESOLUTION]: { label: 'Veredito', classes: 'bg-white/8 text-slate-200 border-white/10', icon: Sun },
  [GamePhase.FINISHED]: { label: 'Fim de jogo', classes: 'bg-lantern-400/15 text-lantern-300 border-lantern-400/40', icon: Trophy },
};

export const Navbar: React.FC<NavbarProps> = ({
  snapshot,
  viewMode,
  onToggleViewMode,
  onOpenNotebook,
  onOpenRules,
  onLeaveRoom,
}) => {
  const [copied, setCopied] = useState(false);
  const [isMuted, setIsMuted] = useState(sound.isMuted);

  const handleCopyCode = () => {
    if (!snapshot?.room.roomCode) return;
    navigator.clipboard.writeText(snapshot.room.roomCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleToggleMute = () => {
    sound.isMuted = !isMuted;
    setIsMuted(!isMuted);
  };

  const phase = snapshot?.room.phase;
  const phaseInfo = phase ? PHASE_DISPLAY[phase] : null;
  const playerRoleMeta = snapshot?.player.role ? ROLE_METADATA[snapshot.player.role] : null;
  const inMatch = snapshot && phase !== GamePhase.LOBBY;

  const timeRemaining = snapshot?.room.phaseTimeRemaining ?? 0;
  const duration = snapshot?.room.phaseDuration ?? 0;
  const timerPct = duration > 0 ? Math.max(0, Math.min(100, (timeRemaining / duration) * 100)) : 0;

  return (
    <header className="h-14 border-b border-white/5 bg-ink-900/90 backdrop-blur flex items-center justify-between px-3 sm:px-5 select-none sticky top-0 z-40">
      {/* Marca + sala */}
      <div className="flex items-center gap-3 min-w-0">
        <span className="text-xl shrink-0" aria-hidden>🏘️</span>
        <div className="hidden sm:flex flex-col min-w-0">
          <h1 className="font-display text-sm font-bold text-lantern-300 tracking-wide leading-tight truncate">
            Cidade Sob Suspeita
          </h1>
          <p className="text-[9px] text-slate-500 uppercase tracking-[0.25em]">dedução social 3D</p>
        </div>

        {snapshot?.room.roomCode && (
          <button
            onClick={handleCopyCode}
            title="Copiar código da sala"
            className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg bg-ink-950/70 hover:bg-white/5 border border-white/10 text-xs font-mono font-bold text-lantern-300 transition-colors shrink-0"
          >
            <span>{snapshot.room.roomCode}</span>
            {copied ? (
              <CheckCircle className="w-3 h-3 text-emerald-400" />
            ) : (
              <Copy className="w-3 h-3 text-slate-500" />
            )}
          </button>
        )}
      </div>

      {/* Fase + cronômetro */}
      {inMatch && phaseInfo && (
        <div className="flex items-center gap-2 sm:gap-3">
          <div
            className={`phase-banner flex items-center gap-1.5 px-2.5 sm:px-3 py-1 border rounded-lg text-[11px] font-bold ${phaseInfo.classes}`}
          >
            <phaseInfo.icon className="w-3.5 h-3.5" />
            <span className="hidden xs:inline sm:inline">{phaseInfo.label}</span>
            {snapshot!.room.roundNumber > 0 && (
              <span className="opacity-60 text-[10px]">dia {snapshot!.room.roundNumber}</span>
            )}
          </div>

          {timeRemaining > 0 && duration > 0 && (
            <div className="w-16 sm:w-24" title={`${timeRemaining}s restantes`}>
              <div className="flex justify-between text-[9px] text-slate-500 mb-0.5">
                <span className={timeRemaining <= 5 ? 'text-rose-400 font-bold' : ''}>{timeRemaining}s</span>
              </div>
              <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                <div
                  className={`timer-bar h-full rounded-full ${
                    timeRemaining <= 5 ? 'bg-rose-500' : 'bg-lantern-400'
                  }`}
                  style={{ width: `${timerPct}%` }}
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Controles */}
      <div className="flex items-center gap-1.5 sm:gap-2">
        {inMatch && playerRoleMeta && (
          <div
            className="hidden lg:flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] border font-semibold"
            style={{
              backgroundColor: `${playerRoleMeta.color}12`,
              borderColor: `${playerRoleMeta.color}35`,
              color: playerRoleMeta.color,
            }}
          >
            <span aria-hidden>{playerRoleMeta.emoji}</span>
            <span>{playerRoleMeta.name}</span>
            {!snapshot!.player.isAlive && <span className="text-slate-500">(espectador)</span>}
          </div>
        )}

        {snapshot?.player.role === 'DETETIVE' && inMatch && (
          <button
            onClick={onOpenNotebook}
            title="Caderno de investigações"
            className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/30 text-indigo-300 text-[11px] font-semibold transition-colors"
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Caderno</span>
          </button>
        )}

        <button
          onClick={onToggleViewMode}
          title={viewMode === '3D' ? 'Mudar para o modo 2D acessível' : 'Mudar para a praça 3D'}
          className="px-2 py-1 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-[11px] font-bold text-slate-300 transition-colors"
        >
          {viewMode}
        </button>

        <button
          onClick={handleToggleMute}
          title={isMuted ? 'Ativar sons e narração' : 'Silenciar sons e narração'}
          className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-slate-400 hover:text-slate-200 transition-colors"
        >
          {isMuted ? <VolumeX className="w-3.5 h-3.5 text-rose-400" /> : <Volume2 className="w-3.5 h-3.5" />}
        </button>

        <button
          onClick={onOpenRules}
          title="Regras do jogo"
          className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-slate-400 hover:text-slate-200 transition-colors"
        >
          <HelpCircle className="w-3.5 h-3.5" />
        </button>

        {snapshot && (
          <button
            onClick={() => {
              if (window.confirm('Sair da sala? Sua vaga poderá ser retomada se você voltar rápido.')) {
                onLeaveRoom();
              }
            }}
            title="Sair da sala"
            className="p-1.5 rounded-lg bg-white/5 hover:bg-rose-500/20 border border-white/10 hover:border-rose-500/30 text-slate-400 hover:text-rose-300 transition-colors"
          >
            <DoorOpen className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </header>
  );
};
