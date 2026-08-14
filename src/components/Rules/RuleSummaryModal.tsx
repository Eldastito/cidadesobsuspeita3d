/**
 * Cidade Sob Suspeita 3D - Rule Summary Modal (High Density Theme)
 * Complete in-game rulebook and tactical guide
 */

import React from 'react';
import { BookOpen, Shield, X } from 'lucide-react';
import { Role } from '../../engine/types.ts';
import { ROLE_METADATA } from '../../engine/rules.ts';

interface RuleSummaryModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const RuleSummaryModal: React.FC<RuleSummaryModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 font-sans">
      <div className="w-full max-w-2xl bg-[#0F1116] border border-white/10 rounded-lg p-4 sm:p-5 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto animate-in fade-in zoom-in duration-200">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/5 pb-2.5">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded bg-indigo-500/10 border border-indigo-500/20 text-indigo-400">
              <BookOpen className="w-4 h-4" />
            </div>
            <div>
              <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-indigo-400 block">
                MANUAL TÁTICO
              </span>
              <h3 className="text-xs font-bold text-white">Regras Canônicas da Cidade</h3>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-white/5 text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Roles Section */}
        <div className="space-y-2">
          <h4 className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-400">
            ESPECIFICAÇÕES DE PAPÉIS
          </h4>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {Object.values(Role).map((r) => {
              const meta = ROLE_METADATA[r];
              return (
                <div
                  key={r}
                  className="p-2.5 rounded border text-xs space-y-1 bg-black/40 border-white/10"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold font-mono text-xs" style={{ color: meta.color }}>
                      {meta.name.toUpperCase()}
                    </span>
                    <span className="text-[9px] font-mono text-slate-400 uppercase">
                      [{meta.alignment}]
                    </span>
                  </div>
                  <p className="text-slate-300 text-[11px] leading-snug">{meta.abilityDescription}</p>
                </div>
              );
            })}
          </div>
        </div>

        {/* Night Resolution & Tiebreak Rules */}
        <div className="space-y-2 pt-2 border-t border-white/5 text-xs">
          <h4 className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-400">
            PROTOCOLO DETERMINÍSTICO DE RESOLUÇÃO
          </h4>

          <ul className="space-y-1.5 text-slate-300 font-mono text-[11px] list-disc list-inside leading-relaxed bg-black/40 p-3 rounded border border-white/5">
            <li>
              <strong>CICLO NOTURNO:</strong> Ações calculadas simultaneamente. Proteção coletiva da Bruxa e intervenção médica bloqueiam o assassinato. A poção de morte da Bruxa é letal.
            </li>
            <li>
              <strong>INVESTIGAÇÃO DETETIVE:</strong> Retorna estritamente "Suspeito" ou "Inocente", gravado no arquivo pessoal.
            </li>
            <li>
              <strong>TRIBUNAL E DESEMPATE:</strong> O voto do Prefeito tem peso decisivo em caso de empate na deliberação da praça.
            </li>
            <li>
              <strong>VITÓRIA:</strong> A Cidade vence eliminando todos os assassinos. Os Assassinos vencem ao igualar o número de cidadãos vivos.
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
};

