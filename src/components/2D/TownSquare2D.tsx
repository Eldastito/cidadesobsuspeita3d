/**
 * Cidade Sob Suspeita 3D - Accessible 2D Tactical Seating Plan (High Density Theme)
 */

import React from 'react';
import { Crown, Hand, Skull, UserCheck } from 'lucide-react';
import { GamePhase, PublicPlayerView } from '../../engine/types.ts';
import { ROLE_METADATA } from '../../engine/rules.ts';

interface TownSquare2DProps {
  players: PublicPlayerView[];
  localPlayerId: string;
  phase: GamePhase;
  selectedTargetId: string | null;
  onSelectPlayer: (playerId: string) => void;
}

export const TownSquare2D: React.FC<TownSquare2DProps> = ({
  players,
  localPlayerId,
  phase,
  selectedTargetId,
  onSelectPlayer,
}) => {
  const isNight = phase === GamePhase.NIGHT_ACTIONS || phase === GamePhase.NIGHT_RESOLUTION;

  return (
    <div className="w-full h-full min-h-[380px] bg-[#0F1116] p-3 sm:p-4 flex flex-col justify-between overflow-y-auto font-sans">
      {/* Header Info */}
      <div className="flex items-center justify-between pb-2.5 border-b border-white/5 text-[10px] font-mono uppercase tracking-widest text-slate-500">
        <span className="font-bold text-slate-300">PRAÇA EM MODO 2D (ACESSÍVEL)</span>
        <span className="text-emerald-400 font-bold">
          {players.filter(p => p.isAlive).length} VIVOS / {players.length} TOTAL
        </span>
      </div>

      {/* Grid of Player Seating Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 my-3">
        {players.map((player) => {
          const isSelected = selectedTargetId === player.id;
          const isLocal = localPlayerId === player.id;
          const roleMeta = player.revealedRole ? ROLE_METADATA[player.revealedRole] : null;

          return (
            <button
              key={player.id}
              onClick={() => onSelectPlayer(player.id)}
              className={`relative p-2.5 rounded border text-left transition-all flex flex-col justify-between gap-1.5 ${
                !player.isAlive
                  ? 'bg-black/30 border-white/5 opacity-50'
                  : isSelected
                  ? 'bg-rose-500/10 border-rose-500 ring-1 ring-rose-500/40'
                  : isLocal
                  ? 'bg-indigo-500/10 border-indigo-500/40'
                  : 'bg-black/40 hover:bg-white/[0.04] border-white/5'
              }`}
            >
              {/* Top row: Seat & Badges */}
              <div className="flex items-center justify-between">
                <span className="px-1.5 py-0.2 rounded bg-black/40 border border-white/10 text-[9px] font-mono text-slate-400">
                  #{player.seatNumber < 9 ? `0${player.seatNumber + 1}` : player.seatNumber + 1}
                </span>

                <div className="flex items-center gap-1">
                  {player.isMayor && (
                    <span title="Prefeito" className="p-0.5 rounded bg-amber-500/10 border border-amber-500/20 text-amber-400">
                      <Crown className="w-3 h-3" />
                    </span>
                  )}
                  {player.hasRaisedHand && (
                    <span title="Mão levantada" className="p-0.5 rounded bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 animate-pulse">
                      <Hand className="w-3 h-3" />
                    </span>
                  )}
                  {!player.isAlive && (
                    <span title="Eliminado" className="p-0.5 rounded bg-black/40 border border-white/10 text-slate-500">
                      <Skull className="w-3 h-3" />
                    </span>
                  )}
                </div>
              </div>

              {/* Middle: Nickname & Status */}
              <div>
                <div className="flex items-center gap-1.5">
                  <p className="text-xs font-bold text-white truncate">{player.nickname}</p>
                  {isLocal && (
                    <span className="text-[8px] px-1 py-0.2 rounded bg-indigo-500/20 border border-indigo-500/30 text-indigo-300 font-mono font-bold uppercase">
                      VOCÊ
                    </span>
                  )}
                </div>
                <p className="text-[10px] font-mono text-slate-500 mt-0.5">
                  {player.isAlive ? 'STATUS: ATIVO' : 'STATUS: ELIMINADO'}
                  {player.isBot ? ' [BOT]' : ''}
                </p>
              </div>

              {/* Bottom: Revealed role or Voted indicator */}
              {roleMeta && (
                <div className="mt-0.5 pt-1 border-t border-white/5 flex items-center gap-1 text-[10px] font-mono font-bold" style={{ color: roleMeta.color }}>
                  <span>{roleMeta.name.toUpperCase()}</span>
                </div>
              )}
            </button>
          );
        })}
      </div>

      <div className="text-[10px] font-mono uppercase tracking-wider text-slate-600 pt-2 border-t border-white/5 text-center">
        TOQUE EM UM MORADOR VIVO PARA SELECIONAR ALVO DE AÇÃO OU VOTO
      </div>
    </div>
  );
};

