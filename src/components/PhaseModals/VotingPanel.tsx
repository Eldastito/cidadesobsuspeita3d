/**
 * Cidade Sob Suspeita 3D - Voting Panel (High Density Theme)
 * Day Voting, Runoffs, and Mayor Tiebreak Decisions
 */

import React from 'react';
import { Check, Crown, Eye, UserX, Vote } from 'lucide-react';
import { GamePhase, PrivatePlayerSnapshot, PublicPlayerView } from '../../engine/types.ts';

interface VotingPanelProps {
  snapshot: PrivatePlayerSnapshot;
  selectedTargetId: string | null;
  onSubmitVote: (targetId: string | null) => void;
}

export const VotingPanel: React.FC<VotingPanelProps> = ({
  snapshot,
  selectedTargetId,
  onSubmitVote,
}) => {
  const { player, room } = snapshot;
  const isMayorTiebreak = room.phase === GamePhase.MAYOR_TIEBREAK;
  const selectedTarget = room.players.find(p => p.id === selectedTargetId);
  const myCurrentVote = player.currentVote;

  if (!player.isAlive) {
    return (
      <div className="bg-[#0F1116] border border-white/5 rounded-lg p-3 text-center font-mono">
        <p className="text-[11px] text-slate-500">
          👻 ESPECTADORES PÓSTUMOS NÃO VOTAM NO TRIBUNAL. AGUARDE A DELIBERAÇÃO.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-[#0F1116] border border-rose-500/30 rounded-lg p-3 sm:p-4 space-y-3 font-sans shadow-lg">
      {/* Header Banner */}
      <div className="flex items-center justify-between border-b border-white/5 pb-2">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded bg-rose-500/10 border border-rose-500/20 text-rose-400">
            <Vote className="w-4 h-4" />
          </div>
          <div>
            <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-rose-400 block">
              TRIBUNAL DA CIDADE
            </span>
            <h4 className="text-xs font-bold text-white">
              {isMayorTiebreak ? 'Decisão de Desempate do Prefeito' : 'Votação de Julgamento'}
            </h4>
          </div>
        </div>

        {myCurrentVote !== undefined && myCurrentVote !== null && (
          <span className="px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[10px] font-mono font-bold flex items-center gap-1">
            <Check className="w-3 h-3" />
            VOTO REGISTRADO
          </span>
        )}
      </div>

      {/* Target Selector & Confirm */}
      <div className="p-2.5 bg-black/40 border border-white/10 rounded flex flex-col sm:flex-row items-center justify-between gap-2.5">
        <div className="flex items-center gap-2 text-xs font-mono w-full sm:w-auto">
          <span className="text-slate-500 text-[10px] uppercase">SEU VOTO EM:</span>
          <span className="font-bold text-amber-400">
            {selectedTarget ? `${selectedTarget.nickname} (#0${selectedTarget.seatNumber + 1})` : 'NENHUM ALVO SELECIONADO'}
          </span>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          {/* Vote for Selected */}
          <button
            onClick={() => onSubmitVote(selectedTargetId)}
            disabled={!selectedTarget || !selectedTarget.isAlive}
            className="flex-1 sm:flex-none px-4 py-1.5 rounded bg-rose-600 hover:bg-rose-500 disabled:opacity-30 text-white font-mono font-bold text-xs uppercase tracking-wider transition-colors shadow-sm flex items-center justify-center gap-1.5"
          >
            <UserX className="w-3.5 h-3.5" />
            VOTAR NO ALVO
          </button>

          {/* Abstain button */}
          {!isMayorTiebreak && (
            <button
              onClick={() => onSubmitVote(null)}
              className="px-3 py-1.5 rounded bg-white/5 hover:bg-white/10 text-slate-300 border border-white/10 text-xs font-mono font-bold uppercase transition-colors"
            >
              ABSTER
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

