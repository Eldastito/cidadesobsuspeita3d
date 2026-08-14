/**
 * Cidade Sob Suspeita 3D - Navigation & Status Header (High Density Theme)
 */

import React, { useState } from 'react';
import {
  BookOpen,
  CheckCircle,
  Copy,
  Eye,
  HelpCircle,
  Moon,
  Radio,
  Shield,
  Sun,
  Users,
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
}

export const Navbar: React.FC<NavbarProps> = ({
  snapshot,
  viewMode,
  onToggleViewMode,
  onOpenNotebook,
  onOpenRules,
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

  const getPhaseDisplay = (phase: GamePhase) => {
    switch (phase) {
      case GamePhase.LOBBY:
        return { label: 'LOBBY_SESSION', color: 'bg-slate-800/60 text-slate-300 border-white/10', icon: Users };
      case GamePhase.ROLE_REVEAL:
        return { label: 'PAPEL_DISTRIBUICAO', color: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/30', icon: Shield };
      case GamePhase.NIGHT_ACTIONS:
      case GamePhase.NIGHT_RESOLUTION:
        return { label: 'NOITE_EXECUCAO', color: 'bg-purple-500/10 text-purple-300 border-purple-500/30', icon: Moon };
      case GamePhase.DAWN:
        return { label: 'AMANHECER_REPORT', color: 'bg-amber-500/10 text-amber-400 border-amber-500/30', icon: Sun };
      case GamePhase.DISCUSSION:
        return { label: 'DEBATE_ABERTO', color: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30', icon: Radio };
      case GamePhase.VOTING:
      case GamePhase.RUNOFF:
      case GamePhase.MAYOR_TIEBREAK:
        return { label: 'VOTACAO_TRIBUNAL', color: 'bg-rose-500/10 text-rose-400 border-rose-500/30', icon: Eye };
      case GamePhase.DAY_RESOLUTION:
        return { label: 'VEREDITO_CIDADE', color: 'bg-slate-800/80 text-slate-200 border-white/10', icon: Shield };
      case GamePhase.FINISHED:
        return { label: 'SESSAO_FINALIZADA', color: 'bg-amber-500/20 text-amber-300 border-amber-500/40', icon: CheckCircle };
      default:
        return { label: 'EM_PROGRESSO', color: 'bg-slate-800 text-slate-300 border-white/10', icon: Users };
    }
  };

  const phaseInfo = snapshot ? getPhaseDisplay(snapshot.room.phase) : null;
  const playerRoleMeta = snapshot?.player.role ? ROLE_METADATA[snapshot.player.role] : null;

  return (
    <header className="h-14 border-b border-white/5 bg-[#0F1116] flex items-center justify-between px-4 sm:px-6 select-none sticky top-0 z-40">
      {/* Left: Engine Brand & Room Code */}
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 bg-indigo-600 rounded flex items-center justify-center shrink-0 shadow-sm">
          <div className="w-3.5 h-3.5 border-2 border-white rotate-45"></div>
        </div>
        <div className="flex flex-col">
          <div className="flex items-center gap-2">
            <h1 className="text-sm font-bold text-white tracking-tight">CIDADE SOB SUSPEITA</h1>
            <span className="hidden md:inline px-1.5 py-0.2 rounded bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 text-[9px] font-mono font-bold">
              3D.ENGINE
            </span>
          </div>
          <p className="text-[10px] text-slate-500 uppercase tracking-widest hidden sm:block">
            Social Deduction Framework
          </p>
        </div>

        {/* Room Code Badge */}
        {snapshot?.room.roomCode && (
          <div className="flex items-center gap-1.5 ml-2 pl-3 border-l border-white/5">
            <span className="text-[10px] font-mono uppercase text-slate-500">SALA:</span>
            <button
              onClick={handleCopyCode}
              title="Copiar código da sala"
              className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-black/40 hover:bg-white/5 border border-white/10 text-xs font-mono font-bold text-amber-400 transition-colors"
            >
              <span>{snapshot.room.roomCode}</span>
              {copied ? (
                <CheckCircle className="w-3 h-3 text-emerald-400" />
              ) : (
                <Copy className="w-3 h-3 text-slate-500" />
              )}
            </button>
          </div>
        )}
      </div>

      {/* Center: Phase Status & Countdown Timer */}
      {snapshot && snapshot.room.phase !== GamePhase.LOBBY && (
        <div className="flex items-center gap-2 sm:gap-3">
          {phaseInfo && (
            <div
              className={`flex items-center gap-1.5 px-3 py-1 border rounded text-[10px] font-mono font-bold uppercase tracking-wider ${phaseInfo.color}`}
            >
              <phaseInfo.icon className="w-3 h-3" />
              <span>{phaseInfo.label}</span>
              {snapshot.room.roundNumber > 0 && (
                <span className="opacity-70 text-[9px]">#0{snapshot.room.roundNumber}</span>
              )}
            </div>
          )}

          {snapshot.room.phaseTimeRemaining > 0 && (
            <div
              className={`px-2 py-0.5 rounded font-mono font-bold text-xs border ${
                snapshot.room.phaseTimeRemaining <= 5
                  ? 'bg-rose-500/20 text-rose-400 border-rose-500/40 animate-pulse'
                  : 'bg-black/40 text-slate-200 border-white/10'
              }`}
            >
              T-{snapshot.room.phaseTimeRemaining < 10 ? `0${snapshot.room.phaseTimeRemaining}` : snapshot.room.phaseTimeRemaining}s
            </div>
          )}
        </div>
      )}

      {/* Right: Controls & Dossiers */}
      <div className="flex items-center gap-2">
        {/* Active Player Role Badge */}
        {snapshot && snapshot.room.phase !== GamePhase.LOBBY && playerRoleMeta && (
          <div
            className="hidden lg:flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-mono border"
            style={{
              backgroundColor: `${playerRoleMeta.color}15`,
              borderColor: `${playerRoleMeta.color}35`,
              color: playerRoleMeta.color,
            }}
          >
            <Shield className="w-3.5 h-3.5" />
            <span className="font-bold">{playerRoleMeta.name.toUpperCase()}</span>
            {!snapshot.player.isAlive && (
              <span className="text-[10px] text-slate-500 font-mono">(SPECTATOR)</span>
            )}
          </div>
        )}

        {/* Detective Notebook */}
        {snapshot?.player.role === 'DETETIVE' && snapshot.room.phase !== GamePhase.LOBBY && (
          <button
            onClick={onOpenNotebook}
            title="Dossiê de Investigações do Detetive"
            className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/30 text-indigo-300 text-[11px] font-mono font-medium transition-colors"
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">DOSSIÊ</span>
          </button>
        )}

        {/* 3D / 2D Switcher */}
        <button
          onClick={onToggleViewMode}
          title={viewMode === '3D' ? 'Alternar para visualizador tático 2D' : 'Alternar para visualizador 3D'}
          className="px-2 py-1 rounded bg-white/5 hover:bg-white/10 border border-white/10 text-[11px] font-mono font-bold text-slate-300 transition-colors"
        >
          VIEW: {viewMode}
        </button>

        {/* Mute toggle */}
        <button
          onClick={handleToggleMute}
          title={isMuted ? 'Ativar sintetizador de áudio' : 'Silenciar áudio'}
          className="p-1.5 rounded bg-white/5 hover:bg-white/10 border border-white/10 text-slate-400 hover:text-slate-200 transition-colors"
        >
          {isMuted ? <VolumeX className="w-3.5 h-3.5 text-rose-400" /> : <Volume2 className="w-3.5 h-3.5 text-slate-300" />}
        </button>

        {/* Rules */}
        <button
          onClick={onOpenRules}
          title="Manual de Regras"
          className="p-1.5 rounded bg-white/5 hover:bg-white/10 border border-white/10 text-slate-400 hover:text-slate-200 transition-colors"
        >
          <HelpCircle className="w-3.5 h-3.5" />
        </button>
      </div>
    </header>
  );
};

