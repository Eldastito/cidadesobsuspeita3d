/**
 * Cidade Sob Suspeita 3D — Painel do tribunal
 * Votação secreta, segundo turno restrito aos empatados,
 * voto de minerva do Prefeito e faixa de veredito.
 */

import React from 'react';
import { Check, Crown, Gavel, Megaphone, UserX, Vote } from 'lucide-react';
import { GamePhase, PrivatePlayerSnapshot, VotingMode } from '../../engine/types.ts';
import { ROLE_METADATA } from '../../engine/rules.ts';

interface VotingPanelProps {
  snapshot: PrivatePlayerSnapshot;
  selectedTargetId: string | null;
  onSubmitVote: (targetId: string | null) => void;
  onSubmitMayorTiebreak: (targetId: string) => void;
}

export const VotingPanel: React.FC<VotingPanelProps> = ({
  snapshot,
  selectedTargetId,
  onSubmitVote,
  onSubmitMayorTiebreak,
}) => {
  const { player, room } = snapshot;
  const phase = room.phase;
  const isRunoff = phase === GamePhase.RUNOFF;
  const isMayorTiebreak = phase === GamePhase.MAYOR_TIEBREAK;
  const isDayResolution = phase === GamePhase.DAY_RESOLUTION;
  const selectedTarget = room.players.find(p => p.id === selectedTargetId);
  const tieCandidates = room.tieCandidateIds
    .map(id => room.players.find(p => p.id === id))
    .filter((p): p is NonNullable<typeof p> => !!p);

  // ── Veredito do dia (após a apuração) ────────────────────────────────────
  if (isDayResolution) {
    const summary = room.lastVotingSummary;
    const roleMeta = summary?.revealedRole ? ROLE_METADATA[summary.revealedRole] : null;
    return (
      <div className="phase-banner bg-ink-900 border border-white/10 rounded-2xl p-4 text-center space-y-2 shadow-lg">
        <div className="w-10 h-10 mx-auto rounded-xl bg-white/5 border border-white/10 flex items-center justify-center">
          <Gavel className="w-5 h-5 text-lantern-300" />
        </div>
        {summary?.eliminatedNickname ? (
          <>
            <h4 className="text-sm font-bold text-white">
              {summary.eliminatedNickname} foi eliminado pela cidade
              {summary.mayorDecided ? ' (voto de minerva do Prefeito)' : ''}
            </h4>
            {roleMeta && (
              <p className="text-xs" style={{ color: roleMeta.color }}>
                {roleMeta.emoji} Seu papel era: <strong>{roleMeta.name}</strong>
              </p>
            )}
          </>
        ) : (
          <h4 className="text-sm font-bold text-slate-300">Ninguém foi eliminado neste julgamento</h4>
        )}
        <p className="text-[11px] text-slate-500">A noite se aproxima…</p>
      </div>
    );
  }

  if (!player.isAlive) {
    return (
      <div className="bg-ink-900 border border-white/5 rounded-2xl p-3 text-center">
        <p className="text-[11px] text-slate-500">
          👻 Espectadores não votam. Aguarde o veredito dos vivos.
        </p>
      </div>
    );
  }

  // ── Voto de minerva do Prefeito ──────────────────────────────────────────
  if (isMayorTiebreak) {
    if (!player.isMayor) {
      return (
        <div className="bg-ink-900 border border-lantern-400/30 rounded-2xl p-4 text-center space-y-1.5 shadow-lg">
          <Crown className="w-5 h-5 text-lantern-300 mx-auto" />
          <h4 className="text-xs font-bold text-white">A votação empatou!</h4>
          <p className="text-[11px] text-slate-400">
            Empate entre <strong>{tieCandidates.map(c => c.nickname).join(' e ')}</strong>. O Prefeito
            tem a palavra final.
          </p>
        </div>
      );
    }
    return (
      <div className="bg-ink-900 border border-lantern-400/40 rounded-2xl p-4 space-y-3 shadow-lg">
        <div className="flex items-center gap-2 border-b border-white/5 pb-2">
          <div className="p-1.5 rounded-lg bg-lantern-400/15 border border-lantern-400/30 text-lantern-300">
            <Crown className="w-4 h-4" />
          </div>
          <div>
            <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-lantern-300 block">
              Voto de minerva
            </span>
            <h4 className="text-xs font-bold text-white">Prefeito, escolha quem será julgado</h4>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {tieCandidates.map(c => (
            <button
              key={c.id}
              onClick={() => onSubmitMayorTiebreak(c.id)}
              className="px-4 py-2 rounded-xl bg-rose-600/90 hover:bg-rose-500 text-white text-xs font-bold transition-colors flex items-center gap-1.5"
            >
              <UserX className="w-3.5 h-3.5" />
              {c.nickname}
            </button>
          ))}
        </div>
        <p className="text-[10px] text-slate-500">
          Se não decidir a tempo, a cidade fará um segundo turno.
        </p>
      </div>
    );
  }

  // ── Votação aberta em sequência (modo do vídeo) ──────────────────────────
  const isSequential = room.config.votingMode === VotingMode.SEQUENTIAL;
  if (isSequential) {
    const currentVoter = room.players.find(p => p.id === room.currentVoterId);
    const isMyTurn = room.currentVoterId === player.id;
    const aliveInOrder = [...room.players]
      .filter(p => p.isAlive)
      .sort((a, b) => a.seatNumber - b.seatNumber);
    const eligibleSeq =
      selectedTarget &&
      selectedTarget.isAlive &&
      (!isRunoff || room.tieCandidateIds.includes(selectedTarget.id));

    return (
      <div className="bg-ink-900 border border-rose-500/30 rounded-2xl p-3 sm:p-4 space-y-3 shadow-lg">
        <div className="flex items-center justify-between border-b border-white/5 pb-2">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400">
              <Megaphone className="w-4 h-4" />
            </div>
            <div>
              <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-rose-400 block">
                {isRunoff ? 'Segundo turno — voto aberto' : 'Votação aberta na praça'}
              </span>
              <h4 className="text-xs font-bold text-white">
                {isMyTurn
                  ? 'Sua vez! Declare seu voto em voz alta'
                  : currentVoter
                  ? `Vez de ${currentVoter.nickname} declarar o voto`
                  : 'Apurando os votos…'}
              </h4>
            </div>
          </div>
          {player.hasVoted && (
            <span className="px-2 py-0.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[10px] font-bold flex items-center gap-1">
              <Check className="w-3 h-3" />
              Voto declarado
            </span>
          )}
        </div>

        {/* Fila de votação com votos já declarados (públicos) */}
        <div className="flex flex-wrap gap-1.5">
          {aliveInOrder.map(p => {
            const voted = p.votedTargetId !== undefined && room.players.some(v => v.id === p.id && v.votedTargetId !== undefined);
            const targetName = p.votedTargetId
              ? room.players.find(t => t.id === p.votedTargetId)?.nickname
              : null;
            const isCurrent = p.id === room.currentVoterId;
            return (
              <span
                key={p.id}
                className={`px-2 py-1 rounded-lg border text-[10px] font-semibold flex items-center gap-1 ${
                  isCurrent
                    ? 'bg-lantern-400/15 border-lantern-400/50 text-lantern-300 animate-pulse'
                    : targetName
                    ? 'bg-rose-500/10 border-rose-500/30 text-rose-300'
                    : p.votedTargetId === null && voted
                    ? 'bg-white/5 border-white/10 text-slate-500'
                    : 'bg-ink-950/60 border-white/5 text-slate-400'
                }`}
              >
                {p.nickname}
                {isCurrent && ' 🗣️'}
                {targetName && <span className="opacity-80">→ {targetName}</span>}
                {!targetName && p.votedTargetId === null && <span className="opacity-60">(absteve)</span>}
              </span>
            );
          })}
        </div>

        {isMyTurn ? (
          <div className="p-2.5 bg-ink-950/70 border border-lantern-400/30 rounded-xl flex flex-col sm:flex-row items-center justify-between gap-2.5">
            <div className="flex items-center gap-2 text-xs w-full sm:w-auto">
              <span className="text-slate-500 text-[10px] uppercase">Acusar:</span>
              <span className="font-bold text-lantern-300">
                {selectedTarget ? selectedTarget.nickname : 'toque em alguém na praça'}
              </span>
            </div>
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <button
                onClick={() => onSubmitVote(selectedTargetId)}
                disabled={!eligibleSeq}
                className="flex-1 sm:flex-none px-4 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 disabled:opacity-30 text-white font-bold text-xs transition-colors flex items-center justify-center gap-1.5"
              >
                <UserX className="w-3.5 h-3.5" />
                Declarar voto
              </button>
              <button
                onClick={() => onSubmitVote(null)}
                className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 border border-white/10 text-xs font-semibold transition-colors"
              >
                Abster-se
              </button>
            </div>
          </div>
        ) : (
          <p className="text-[10px] text-slate-500">
            Votos declarados são públicos e definitivos, na ordem dos assentos — como na roda original.
          </p>
        )}
      </div>
    );
  }

  // ── Votação secreta / segundo turno ──────────────────────────────────────
  const eligibleForRunoff =
    !isRunoff || (selectedTarget && room.tieCandidateIds.includes(selectedTarget.id));
  const canVote = selectedTarget && selectedTarget.isAlive && eligibleForRunoff;
  const hasVoted = player.hasVoted;

  return (
    <div className="bg-ink-900 border border-rose-500/30 rounded-2xl p-3 sm:p-4 space-y-3 shadow-lg">
      <div className="flex items-center justify-between border-b border-white/5 pb-2">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400">
            <Vote className="w-4 h-4" />
          </div>
          <div>
            <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-rose-400 block">
              {isRunoff ? 'Segundo turno' : 'Tribunal da praça'}
            </span>
            <h4 className="text-xs font-bold text-white">
              {isRunoff ? 'Vote apenas entre os empatados' : 'Quem deve ser julgado hoje?'}
            </h4>
          </div>
        </div>
        {hasVoted && (
          <span className="px-2 py-0.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[10px] font-bold flex items-center gap-1">
            <Check className="w-3 h-3" />
            Voto registrado
          </span>
        )}
      </div>

      {isRunoff && tieCandidates.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-slate-400">
          <span>Empatados:</span>
          {tieCandidates.map(c => (
            <span
              key={c.id}
              className={`px-2 py-0.5 rounded-lg border text-[10px] font-semibold ${
                selectedTargetId === c.id
                  ? 'bg-rose-500/15 border-rose-500/40 text-rose-300'
                  : 'bg-white/5 border-white/10 text-slate-300'
              }`}
            >
              {c.nickname}
            </span>
          ))}
        </div>
      )}

      <div className="p-2.5 bg-ink-950/70 border border-white/10 rounded-xl flex flex-col sm:flex-row items-center justify-between gap-2.5">
        <div className="flex items-center gap-2 text-xs w-full sm:w-auto">
          <span className="text-slate-500 text-[10px] uppercase">Seu voto:</span>
          <span className="font-bold text-lantern-300">
            {selectedTarget
              ? selectedTarget.nickname
              : 'toque em alguém na praça'}
          </span>
          {isRunoff && selectedTarget && !eligibleForRunoff && (
            <span className="text-[10px] text-rose-400">(fora do segundo turno)</span>
          )}
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <button
            onClick={() => onSubmitVote(selectedTargetId)}
            disabled={!canVote}
            className="flex-1 sm:flex-none px-4 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 disabled:opacity-30 text-white font-bold text-xs transition-colors flex items-center justify-center gap-1.5"
          >
            <UserX className="w-3.5 h-3.5" />
            Votar
          </button>
          <button
            onClick={() => onSubmitVote(null)}
            className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 border border-white/10 text-xs font-semibold transition-colors"
          >
            Abster-se
          </button>
        </div>
      </div>

      <p className="text-[10px] text-slate-500">
        O resultado só aparece quando a votação fecha. Você pode mudar o voto até o fim do tempo.
      </p>
    </div>
  );
};
