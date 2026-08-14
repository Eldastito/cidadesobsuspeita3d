/**
 * Cidade Sob Suspeita 3D - Detective Notebook (High Density Theme)
 * Private investigation dossier
 */

import React from 'react';
import { BookOpen, CheckCircle, Search, ShieldAlert, X } from 'lucide-react';
import { DetectiveEntry } from '../../engine/types.ts';

interface DetectiveNotebookProps {
  entries: DetectiveEntry[];
  isOpen: boolean;
  onClose: () => void;
}

export const DetectiveNotebook: React.FC<DetectiveNotebookProps> = ({
  entries,
  isOpen,
  onClose,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-4">
      <div className="w-full max-w-lg bg-[#0F1116] border border-white/10 rounded-lg p-4 sm:p-5 shadow-2xl space-y-3 animate-in fade-in zoom-in duration-200 font-sans">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/5 pb-2.5">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded bg-indigo-500/10 border border-indigo-500/20 text-indigo-400">
              <BookOpen className="w-4 h-4" />
            </div>
            <div>
              <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-indigo-400 block">
                ARQUIVO CONFIDENCIAL
              </span>
              <h3 className="text-xs font-bold text-white">Dossiê de Investigações</h3>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-white/5 text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Entries List */}
        <div className="space-y-2 max-h-[350px] overflow-y-auto">
          {entries.length === 0 ? (
            <div className="py-8 text-center text-slate-600 text-xs font-mono uppercase tracking-widest">
              NENHUM REGISTRO DE INVESTIGAÇÃO CONCLUÍDO
            </div>
          ) : (
            entries.map((entry, idx) => (
              <div
                key={idx}
                className={`p-2.5 rounded border flex items-center justify-between gap-3 font-mono ${
                  entry.isSuspicious
                    ? 'bg-rose-500/10 border-rose-500/30 text-rose-200'
                    : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-200'
                }`}
              >
                <div>
                  <span className="text-[9px] uppercase text-slate-400 block">
                    NOITE #0{entry.round}
                  </span>
                  <p className="text-xs font-bold text-white">{entry.targetNickname}</p>
                </div>

                <div>
                  {entry.isSuspicious ? (
                    <span className="px-2 py-0.5 rounded bg-rose-500/20 border border-rose-500/40 text-rose-300 text-[10px] font-bold flex items-center gap-1">
                      <ShieldAlert className="w-3 h-3" />
                      SUSPEITO [ASSASSINO]
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-[10px] font-bold flex items-center gap-1">
                      <CheckCircle className="w-3 h-3" />
                      NÃO SUSPEITO [INOCENTE]
                    </span>
                  )}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer Note */}
        <p className="text-[10px] font-mono uppercase tracking-wider text-slate-500 pt-2 border-t border-white/5">
          SIGILO TÁTICO: Apenas o agente Detetive possui autorização de leitura deste dossiê.
        </p>
      </div>
    </div>
  );
};

