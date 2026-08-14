/**
 * Cidade Sob Suspeita 3D - Dawn Announcement (High Density Theme)
 */

import React from 'react';
import { Newspaper, Skull, Sun } from 'lucide-react';
import { DawnSummary } from '../../engine/types.ts';
import { ROLE_METADATA } from '../../engine/rules.ts';

interface DawnAnnouncementProps {
  summary: DawnSummary | null;
  timeRemaining: number;
}

export const DawnAnnouncement: React.FC<DawnAnnouncementProps> = ({ summary, timeRemaining }) => {
  if (!summary) return null;

  const hasDeaths = summary.deaths.length > 0;

  return (
    <div className="bg-[#0F1116] border border-amber-500/30 rounded-lg p-3 sm:p-4 shadow-lg space-y-3 font-sans">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/5 pb-2">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">
            <Newspaper className="w-4 h-4" />
          </div>
          <div>
            <span className="text-[10px] font-mono uppercase tracking-widest text-amber-400 block font-bold">
              GAZETA DA PRAÇA • EDIÇÃO MATINAL
            </span>
            <h3 className="text-xs font-bold text-white">
              Relatório do Amanhecer #0{summary.round}
            </h3>
          </div>
        </div>

        <div className="px-2 py-0.5 rounded bg-black/40 border border-white/10 text-[10px] font-mono font-bold text-amber-400">
          T-{timeRemaining < 10 ? `0${timeRemaining}` : timeRemaining}s
        </div>
      </div>

      {/* Main Narrative */}
      <div className="p-3 bg-black/40 border border-white/5 rounded space-y-2.5">
        <p className="text-xs italic text-slate-300 leading-relaxed font-mono">
          "{summary.narrativeText}"
        </p>

        {hasDeaths ? (
          <div className="pt-2 border-t border-white/5 space-y-1.5">
            <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-rose-400 flex items-center gap-1">
              <Skull className="w-3 h-3" />
              FATALIDADES CONFIRMADAS NA MADRUGADA:
            </span>
            <div className="flex flex-wrap gap-1.5">
              {summary.deaths.map((d) => {
                const roleMeta = d.revealedRole ? ROLE_METADATA[d.revealedRole] : null;
                return (
                  <div
                    key={d.playerId}
                    className="px-2.5 py-1 rounded bg-rose-500/10 border border-rose-500/20 text-xs font-mono font-bold text-rose-300 flex items-center gap-1.5"
                  >
                    <span>💀 {d.nickname}</span>
                    {roleMeta && (
                      <span className="text-[9px] text-slate-400 font-normal">
                        [{roleMeta.name.toUpperCase()}]
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="pt-2 border-t border-white/5 text-[11px] font-mono text-emerald-400 flex items-center gap-1.5">
            <Sun className="w-3.5 h-3.5" />
            <span>NENHUMA VÍTIMA REGISTRADA. PROTEÇÃO MÉDICA/ALQUÍMICA BEM SUCEDIDA!</span>
          </div>
        )}
      </div>
    </div>
  );
};

