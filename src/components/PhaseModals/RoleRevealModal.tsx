/**
 * Cidade Sob Suspeita 3D - Secret Role Reveal Modal (High Density Theme)
 */

import React, { useState } from 'react';
import { Check, Eye, EyeOff, Shield } from 'lucide-react';
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
    <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex items-center justify-center p-4 font-sans">
      <div className="w-full max-w-md bg-[#0F1116] border border-white/10 rounded-lg p-5 sm:p-6 shadow-2xl space-y-4 text-center animate-in fade-in zoom-in duration-300">
        <div className="space-y-0.5">
          <span className="text-[10px] uppercase tracking-widest font-mono text-indigo-400 font-bold block">
            DISTRIBUIÇÃO DE CREDENCIAIS
          </span>
          <h2 className="text-sm font-bold text-white uppercase font-mono">Designação Tática</h2>
        </div>

        {/* Role Secret Card */}
        <div className="relative p-4 rounded bg-black/40 border border-white/10 transition-all shadow-inner">
          {isRevealed ? (
            <div className="space-y-3">
              <div
                className="w-12 h-12 mx-auto rounded flex items-center justify-center text-2xl border"
                style={{
                  backgroundColor: `${meta.color}15`,
                  borderColor: `${meta.color}40`,
                }}
              >
                {role === Role.ASSASSINO && '🔪'}
                {role === Role.MEDICO && '🧑‍⚕️'}
                {role === Role.DETETIVE && '🔍'}
                {role === Role.BRUXA && '🧙‍♀️'}
                {role === Role.CIDADAO && '👥'}
              </div>

              <div>
                <h3 className="text-lg font-bold font-mono tracking-wider" style={{ color: meta.color }}>
                  {meta.name.toUpperCase()}
                </h3>
                <div className="flex items-center justify-center gap-1.5 mt-1">
                  <span className="px-2 py-0.5 rounded text-[9px] font-mono font-bold bg-white/5 border border-white/10 text-slate-300">
                    ALINHAMENTO: {meta.alignment.toUpperCase()}
                  </span>
                  {isMayor && (
                    <span className="px-2 py-0.5 rounded text-[9px] font-mono font-bold bg-amber-500/10 border border-amber-500/30 text-amber-300">
                      👑 PREFEITO
                    </span>
                  )}
                </div>
              </div>

              <p className="text-xs text-slate-300 leading-relaxed font-sans">{meta.description}</p>

              <div className="p-2.5 bg-black/50 border border-white/5 rounded text-left">
                <span className="block text-[9px] font-mono font-bold uppercase tracking-wider text-slate-400 mb-0.5">
                  DIRETIVA / HABILIDADE
                </span>
                <p className="text-xs text-slate-200 leading-normal font-sans">{meta.abilityDescription}</p>
              </div>
            </div>
          ) : (
            <div className="py-8 space-y-2 font-mono">
              <div className="text-3xl opacity-30">🔒</div>
              <p className="text-xs text-slate-500 uppercase tracking-wider">CREDENCIAL OCULTA POR SEGURANÇA</p>
            </div>
          )}

          {/* Peek Toggle Button */}
          <button
            onClick={() => setIsRevealed(!isRevealed)}
            className="mt-3 inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-black/40 hover:bg-white/5 border border-white/10 text-[10px] font-mono text-slate-300 transition-colors"
          >
            {isRevealed ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
            <span>{isRevealed ? 'OCULTAR' : 'REVELAR'}</span>
          </button>
        </div>

        {/* Confirmation Button */}
        <div>
          <button
            onClick={onConfirm}
            disabled={hasConfirmed}
            className="w-full py-2 px-4 rounded bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-950/60 disabled:text-indigo-400 text-white font-mono font-bold text-xs uppercase tracking-wider shadow transition-all flex items-center justify-center gap-2"
          >
            <Check className="w-4 h-4" />
            {hasConfirmed ? 'CONFIRMADO • AGUARDANDO DEMAIS' : 'CIENTE • INICIAR OPERAÇÃO'}
          </button>
        </div>
      </div>
    </div>
  );
};

