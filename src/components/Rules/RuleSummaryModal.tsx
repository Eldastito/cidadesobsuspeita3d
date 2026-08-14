/**
 * Cidade Sob Suspeita 3D — Resumo das regras da sala
 * Sempre visível antes do "pronto" (PRD 6.2): papéis, noite, votação e vitória.
 */

import React from 'react';
import { BookOpen, X } from 'lucide-react';
import { Role } from '../../engine/types.ts';
import { ROLE_METADATA } from '../../engine/rules.ts';

interface RuleSummaryModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const RuleSummaryModal: React.FC<RuleSummaryModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-4">
      <div className="w-full max-w-2xl bg-ink-900 border border-white/10 rounded-2xl p-4 sm:p-5 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto phase-banner">
        <div className="flex items-center justify-between border-b border-white/5 pb-2.5">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-lantern-400/10 border border-lantern-400/30 text-lantern-300">
              <BookOpen className="w-4 h-4" />
            </div>
            <div>
              <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-lantern-300 block">
                Livro da vila
              </span>
              <h3 className="text-xs font-bold text-white">Regras desta sala</h3>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Fechar regras"
            className="p-1 rounded-lg hover:bg-white/5 text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Papéis */}
        <div className="space-y-2">
          <h4 className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">Papéis</h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {Object.values(Role).map(r => {
              const meta = ROLE_METADATA[r];
              return (
                <div key={r} className="p-2.5 rounded-xl border text-xs space-y-1 bg-ink-950/60 border-white/10">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-xs flex items-center gap-1.5" style={{ color: meta.color }}>
                      <span aria-hidden>{meta.emoji}</span> {meta.name}
                    </span>
                    <span className="text-[9px] text-slate-400 uppercase">
                      {meta.alignment === 'AMEACA' ? 'assassinos' : 'cidade'}
                    </span>
                  </div>
                  <p className="text-slate-300 text-[11px] leading-snug">{meta.abilityDescription}</p>
                </div>
              );
            })}
          </div>
        </div>

        {/* Como cada rodada funciona */}
        <div className="space-y-2 pt-2 border-t border-white/5 text-xs">
          <h4 className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">
            Como cada rodada funciona
          </h4>
          <ul className="space-y-1.5 text-slate-300 text-[11px] list-disc list-inside leading-relaxed bg-ink-950/60 p-3 rounded-xl border border-white/5">
            <li>
              <strong>Noite:</strong> todos "dormem" nos seus lugares. Assassinos escolhem uma vítima;
              Médico protege alguém; Detetive investiga; Bruxa decide entre as poções; Cidadãos anotam
              um palpite privado. As ações são resolvidas juntas: proteção do Médico e escudo da Bruxa
              bloqueiam o ataque; a poção de morte da Bruxa não é bloqueada.
            </li>
            <li>
              <strong>Amanhecer:</strong> o narrador anuncia quem morreu — nunca quem agiu, salvou ou
              investigou.
            </li>
            <li>
              <strong>Debate:</strong> os vivos conversam na praça e podem circular livremente pelo
              cenário. Mortos falam apenas no cemitério.
            </li>
            <li>
              <strong>Votação:</strong> no modo padrão é secreta e simultânea — o resultado só
              aparece na apuração. No modo <strong>aberto em sequência</strong> (como na roda
              original), cada morador declara o voto em voz alta na ordem dos assentos, e o voto é
              público e definitivo. Empate → o <strong>Prefeito</strong> dá o voto de minerva (se
              houver); senão, há <strong>segundo turno</strong> entre os empatados; persistindo o
              empate, ninguém sai.
            </li>
            <li>
              <strong>Vitória:</strong> a Cidade vence eliminando todos os assassinos; os Assassinos
              vencem quando igualam o número de moradores vivos da cidade.
            </li>
            <li>
              <strong>Morte:</strong> quem morre não fala, não vota e não herda papel. Os papéis são
              revelados apenas no fim da partida (a menos que a sala configure diferente).
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
};
