/**
 * Cidade Sob Suspeita 3D - Post Game Timeline & Full Audit Replay (High Density Theme)
 */

import React, { useEffect } from 'react';
import confetti from 'canvas-confetti';
import {
  CheckCircle,
  Clock,
  Crown,
  History,
  RotateCcw,
  Shield,
  Skull,
  Trophy,
  Users,
} from 'lucide-react';
import { PrivatePlayerSnapshot, Role, VictoryWinner } from '../../engine/types.ts';
import { ROLE_METADATA } from '../../engine/rules.ts';

interface PostGameReplayProps {
  snapshot: PrivatePlayerSnapshot;
  onRestartMatch: () => void;
}

export const PostGameReplay: React.FC<PostGameReplayProps> = ({
  snapshot,
  onRestartMatch,
}) => {
  const { room, player } = snapshot;
  const isHost = player.isHost;
  const isTownVictory = room.winner === VictoryWinner.TOWN;
  const isAssassinVictory = room.winner === VictoryWinner.ASSASSINS;

  useEffect(() => {
    try {
      confetti({
        particleCount: 80,
        spread: 70,
        origin: { y: 0.6 },
      });
    } catch (e) {
      // Ignored if confetti unavailable
    }
  }, []);

  return (
    <div className="max-w-4xl mx-auto p-3 sm:p-4 space-y-4 animate-in fade-in zoom-in duration-300 font-sans">
      {/* Victory Header Banner */}
      <div
        className={`p-5 sm:p-6 rounded-lg border text-center space-y-2 shadow-xl ${
          isTownVictory
            ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-200'
            : isAssassinVictory
            ? 'bg-rose-500/10 border-rose-500/30 text-rose-200'
            : 'bg-white/5 border-white/10 text-slate-200'
        }`}
      >
        <div className="w-12 h-12 mx-auto rounded bg-black/40 border border-white/10 flex items-center justify-center text-2xl shadow">
          {isTownVictory ? '🏆' : isAssassinVictory ? '🔪' : '⚖️'}
        </div>

        {/* Recompensa em Kokolas (moeda cosmética ganha jogando) */}
        {!player.id.startsWith('bot-') && (
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-black/40 border border-amber-400/30 text-amber-300 text-xs font-bold">
            🪙 +
            {10 +
              ((room.winner === VictoryWinner.TOWN && player.role !== Role.ASSASSINO) ||
              (room.winner === VictoryWinner.ASSASSINS && player.role === Role.ASSASSINO)
                ? 15
                : 0)}{' '}
            kokolas pela partida
          </div>
        )}

        <div>
          <span className="text-[10px] uppercase tracking-widest font-mono text-slate-400 font-bold block">
            RESULTADO FINAL DA OPERAÇÃO
          </span>
          <h2 className="text-xl sm:text-2xl font-bold font-mono uppercase tracking-wider mt-0.5">
            {isTownVictory
              ? 'A CIDADE TRIUNFOU!'
              : isAssassinVictory
              ? 'OS ASSASSINOS VENCERAM!'
              : 'EMPATE NA CIDADE'}
          </h2>
          <p className="text-xs text-slate-300 mt-1 max-w-lg mx-auto leading-relaxed">
            {isTownVictory
              ? 'A ordem foi restabelecida! Todos os agentes hostis foram neutralizados pela deliberação dos cidadãos.'
              : 'O caos se consolidou! Os assassinos eliminaram os cidadãos e assumiram o controle do município.'}
          </p>
        </div>

        {/* Rematch button for Host */}
        <div className="pt-2">
          {isHost ? (
            <button
              onClick={onRestartMatch}
              className="px-5 py-2 rounded bg-indigo-600 hover:bg-indigo-500 text-white font-mono font-bold text-xs uppercase tracking-wider shadow transition-all inline-flex items-center gap-2"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              INICIAR REVANCHE COM O MESMO GRUPO
            </button>
          ) : (
            <div className="text-xs font-mono text-slate-500 uppercase">
              AGUARDANDO ANFITRIÃO INICIAR NOVA SESSÃO...
            </div>
          )}
        </div>
      </div>

      {/* Grid: All Players Secret Roles Revealed */}
      <div className="bg-[#0F1116] border border-white/5 rounded-lg p-4 space-y-3">
        <h3 className="text-xs font-bold text-white uppercase tracking-wider font-mono flex items-center gap-1.5">
          <Users className="w-3.5 h-3.5 text-indigo-400" />
          REVELAÇÃO COMPLETA DAS CREDENCIAIS
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
          {room.players.map((p) => {
            const role = (room.allRolesRevealed && room.allRolesRevealed[p.id]) || p.revealedRole || Role.CIDADAO;
            const meta = ROLE_METADATA[role];

            return (
              <div
                key={p.id}
                className="p-2.5 rounded border border-white/10 bg-black/40 flex items-center justify-between gap-2 font-mono"
              >
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-bold text-white">{p.nickname}</span>
                    {p.isMayor && (
                      <span title="Prefeito" className="text-amber-400 text-xs">
                        👑
                      </span>
                    )}
                  </div>
                  <span className="text-[10px] text-slate-500">
                    {p.isAlive ? '[SOBREVIVEU]' : '[ELIMINADO]'}
                  </span>
                </div>

                <div className="text-right">
                  <span className="text-xs font-bold block" style={{ color: meta.color }}>
                    {meta.name.toUpperCase()}
                  </span>
                  <span className="text-[9px] text-slate-400">[{meta.alignment}]</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Timeline Audit Event Log */}
      <div className="bg-[#0F1116] border border-white/5 rounded-lg p-4 space-y-3">
        <h3 className="text-xs font-bold text-white uppercase tracking-wider font-mono flex items-center gap-1.5">
          <History className="w-3.5 h-3.5 text-indigo-400" />
          AUDITORIA CRONOLÓGICA DE EVENTOS
        </h3>

        <div className="space-y-1.5 max-h-[320px] overflow-y-auto pr-1">
          {room.timeline.map((event) => (
            <div
              key={event.id}
              className="p-2.5 rounded bg-black/40 border border-white/5 flex items-start gap-2.5 text-xs font-mono"
            >
              <div className="p-1 rounded bg-white/5 text-slate-400 mt-0.5">
                <Clock className="w-3 h-3" />
              </div>
              <div className="flex-1 space-y-0.5">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-200">{event.title}</span>
                  <span className="text-[9px] text-slate-500">
                    {new Date(event.timestamp).toLocaleTimeString()}
                  </span>
                </div>
                <p className="text-slate-400 text-[11px] font-sans leading-normal">{event.description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

