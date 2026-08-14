/**
 * Cidade Sob Suspeita 3D — Revelação secreta do papel
 * Carta individual com tutorial curto e confirmação deliberada.
 */

import React, { useState } from 'react';
import { Check, Eye, EyeOff } from 'lucide-react';
import { Role } from '../../engine/types.ts';
import { ROLE_METADATA } from '../../engine/rules.ts';

interface RoleRevealModalProps {
  role: Role;
  isMayor: boolean;
  hasConfirmed: boolean;
  onConfirm: () => void;
}

export const RoleRevealModal: React.FC<RoleRevealModalProps> = ({
  role,
  isMayor,
  hasConfirmed,
  onConfirm,
}) => {
  const [isRevealed, setIsRevealed] = useState(true);
  const meta = ROLE_METADATA[role];

  return (
    <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex items-center justify-center p-4">
      <div className="phase-banner w-full max-w-md bg-ink-900 border border-white/10 rounded-2xl p-5 sm:p-6 shadow-2xl space-y-4 text-center">
        <div className="space-y-0.5">
          <span className="text-[10px] uppercase tracking-[0.3em] text-lantern-300 font-bold block">
            Papel secreto
          </span>
          <h2 className="font-display text-base font-bold text-white">Seu destino nesta partida</h2>
        </div>

        {/* Carta do papel */}
        <div className="relative p-4 rounded-2xl bg-ink-950/80 border border-white/10 shadow-inner">
          {isRevealed ? (
            <div className="space-y-3">
              <div
                className="w-14 h-14 mx-auto rounded-2xl flex items-center justify-center text-3xl border"
                style={{ backgroundColor: `${meta.color}15`, borderColor: `${meta.color}40` }}
                aria-hidden
              >
                {meta.emoji}
              </div>

              <div>
                <h3 className="font-display text-xl font-bold tracking-wide" style={{ color: meta.color }}>
                  {meta.name}
                </h3>
                <div className="flex items-center justify-center gap-1.5 mt-1.5">
                  <span className="px-2 py-0.5 rounded-lg text-[9px] font-bold bg-white/5 border border-white/10 text-slate-300 uppercase tracking-wider">
                    Lado: {meta.alignment === 'AMEACA' ? 'Assassinos' : 'Cidade'}
                  </span>
                  {isMayor && (
                    <span className="px-2 py-0.5 rounded-lg text-[9px] font-bold bg-lantern-400/10 border border-lantern-400/30 text-lantern-300 uppercase tracking-wider">
                      👑 Prefeito (público)
                    </span>
                  )}
                </div>
              </div>

              <p className="text-xs text-slate-300 leading-relaxed">{meta.description}</p>

              <div className="p-2.5 bg-black/50 border border-white/5 rounded-xl text-left">
                <span className="block text-[9px] font-bold uppercase tracking-[0.2em] text-slate-400 mb-1">
                  Como jogar
                </span>
                <p className="text-xs text-slate-200 leading-normal">{meta.abilityDescription}</p>
              </div>
            </div>
          ) : (
            <div className="py-8 space-y-2">
              <div className="text-3xl opacity-30" aria-hidden>🔒</div>
              <p className="text-xs text-slate-500 uppercase tracking-widest">
                Papel oculto — cuidado com olhares curiosos
              </p>
            </div>
          )}

          <button
            onClick={() => setIsRevealed(!isRevealed)}
            className="mt-3 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-black/40 hover:bg-white/5 border border-white/10 text-[10px] text-slate-300 transition-colors"
          >
            {isRevealed ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
            <span>{isRevealed ? 'Ocultar' : 'Revelar'}</span>
          </button>
        </div>

        <button
          onClick={onConfirm}
          disabled={hasConfirmed}
          className="w-full py-2.5 px-4 rounded-xl bg-lantern-400 hover:bg-lantern-300 disabled:bg-ink-800 disabled:text-slate-500 text-ink-950 font-bold text-sm shadow transition-all flex items-center justify-center gap-2"
        >
          <Check className="w-4 h-4" />
          {hasConfirmed ? 'Confirmado — aguardando os demais…' : 'Entendi meu papel'}
        </button>
      </div>
    </div>
  );
};
