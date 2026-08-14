/**
 * Cidade Sob Suspeita 3D - Night Action Control Console (High Density Theme)
 */

import React from 'react';
import {
  Heart,
  Moon,
  Search,
  Shield,
  Skull,
  Sparkles,
  Users,
  Zap,
} from 'lucide-react';
import {
  NightActionType,
  PrivatePlayerSnapshot,
  PublicPlayerView,
  Role,
} from '../../engine/types.ts';
import { ROLE_METADATA } from '../../engine/rules.ts';

interface NightActionPanelProps {
  snapshot: PrivatePlayerSnapshot;
  selectedTargetId: string | null;
  onSubmitAction: (actionType: NightActionType, targetId?: string | null) => void;
}

export const NightActionPanel: React.FC<NightActionPanelProps> = ({
  snapshot,
  selectedTargetId,
  onSubmitAction,
}) => {
  const { player, room } = snapshot;
  const meta = ROLE_METADATA[player.role];
  const selectedTarget = room.players.find(p => p.id === selectedTargetId);

  // If player is dead, spectator view
  if (!player.isAlive) {
    return (
      <div className="bg-[#0F1116] border border-white/5 rounded-lg p-3 sm:p-4 text-center space-y-1 font-mono">
        <span className="text-xl">👻</span>
        <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider">MODO ESPECTADOR PÓSTUMO</h4>
        <p className="text-[11px] text-slate-500 max-w-md mx-auto">
          Você foi eliminado da sessão. Acompanhe a resolução das ações noturnas e interaja pelo cemitério.
        </p>
      </div>
    );
  }

  // Role: CIDADÃO
  if (player.role === Role.CIDADAO) {
    return (
      <div className="bg-[#0F1116] border border-white/5 rounded-lg p-3 sm:p-4 text-center space-y-1.5 font-sans">
        <div className="w-8 h-8 mx-auto rounded bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-sm">
          🌙
        </div>
        <div>
          <h4 className="text-xs font-bold text-slate-200 uppercase tracking-wider font-mono">
            A CIDADE DORME EM SILÊNCIO
          </h4>
          <p className="text-[11px] text-slate-400 mt-0.5 max-w-sm mx-auto">
            Cidadãos não possuem poderes noturnos ativos. Aguarde o relatório do amanhecer para debater.
          </p>
        </div>
      </div>
    );
  }

  // Role: ASSASSINO
  if (player.role === Role.ASSASSINO) {
    const isTargetValid = selectedTarget && selectedTarget.isAlive && selectedTarget.id !== player.id;

    return (
      <div className="bg-[#0F1116] border border-rose-500/30 rounded-lg p-3 sm:p-4 space-y-3 font-sans">
        <div className="flex items-center justify-between border-b border-white/5 pb-2">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded bg-rose-500/10 text-rose-400 border border-rose-500/20">
              <Skull className="w-4 h-4" />
            </div>
            <div>
              <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-rose-400 block">
                PROTOCOLO DE ELIMINAÇÃO
              </span>
              <h4 className="text-xs font-bold text-white">Ação Coordenada dos Assassinos</h4>
            </div>
          </div>
        </div>

        {/* Selected Target Banner */}
        <div className="p-2.5 bg-black/40 border border-white/10 rounded flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-xs font-mono">
            <span className="text-slate-500 text-[10px] uppercase">ALVO:</span>
            <span className="font-bold text-white">
              {selectedTarget ? `${selectedTarget.nickname} (#0${selectedTarget.seatNumber + 1})` : 'NENHUM (CLIQUE EM UM CIDADÃO NA PRAÇA)'}
            </span>
          </div>

          <button
            onClick={() => onSubmitAction(NightActionType.KILL, selectedTargetId)}
            disabled={!isTargetValid}
            className="w-full sm:w-auto px-4 py-1.5 rounded bg-rose-600 hover:bg-rose-500 disabled:opacity-30 text-white font-mono font-bold text-xs uppercase tracking-wider transition-colors shadow-sm"
          >
            CONFIRMAR ATAQUE
          </button>
        </div>
      </div>
    );
  }

  // Role: MÉDICO
  if (player.role === Role.MEDICO) {
    const isTargetSelf = selectedTarget?.id === player.id;
    const canSelfHeal = !player.doctorSelfHealUsed;
    const isConsecutive = player.lastDoctorTargetId === selectedTarget?.id;
    const isTargetValid = selectedTarget && selectedTarget.isAlive && (!isTargetSelf || canSelfHeal) && !isConsecutive;

    return (
      <div className="bg-[#0F1116] border border-emerald-500/30 rounded-lg p-3 sm:p-4 space-y-3 font-sans">
        <div className="flex items-center justify-between border-b border-white/5 pb-2">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <Heart className="w-4 h-4" />
            </div>
            <div>
              <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-emerald-400 block">
                INTERVENÇÃO MÉDICA
              </span>
              <h4 className="text-xs font-bold text-white">Proteção Noturna</h4>
            </div>
          </div>
          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
            AUTO-CURA: {player.doctorSelfHealUsed ? 'USADA' : '1 DISPONÍVEL'}
          </span>
        </div>

        {/* Selected Target Banner */}
        <div className="p-2.5 bg-black/40 border border-white/10 rounded flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-xs font-mono">
            <span className="text-slate-500 text-[10px] uppercase">ALVO:</span>
            <span className="font-bold text-white">
              {selectedTarget ? `${selectedTarget.nickname} (#0${selectedTarget.seatNumber + 1})` : 'NENHUM (CLIQUE EM ALGUÉM NA PRAÇA)'}
            </span>
          </div>

          <button
            onClick={() => onSubmitAction(NightActionType.HEAL, selectedTargetId)}
            disabled={!isTargetValid}
            className="w-full sm:w-auto px-4 py-1.5 rounded bg-emerald-600 hover:bg-emerald-500 disabled:opacity-30 text-white font-mono font-bold text-xs uppercase tracking-wider transition-colors shadow-sm"
          >
            CONFIRMAR PROTEÇÃO
          </button>
        </div>

        {isConsecutive && (
          <p className="text-[10px] font-mono text-amber-400">⚠️ Proibido proteger o mesmo cidadão em duas noites consecutivas.</p>
        )}
      </div>
    );
  }

  // Role: DETETIVE
  if (player.role === Role.DETETIVE) {
    const isTargetValid = selectedTarget && selectedTarget.isAlive && selectedTarget.id !== player.id;

    return (
      <div className="bg-[#0F1116] border border-indigo-500/30 rounded-lg p-3 sm:p-4 space-y-3 font-sans">
        <div className="flex items-center justify-between border-b border-white/5 pb-2">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
              <Search className="w-4 h-4" />
            </div>
            <div>
              <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-indigo-400 block">
                INVESTIGAÇÃO TÁTICA
              </span>
              <h4 className="text-xs font-bold text-white">Dossiê do Detetive</h4>
            </div>
          </div>
        </div>

        {/* Selected Target Banner */}
        <div className="p-2.5 bg-black/40 border border-white/10 rounded flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-xs font-mono">
            <span className="text-slate-500 text-[10px] uppercase">SUSPEITO:</span>
            <span className="font-bold text-white">
              {selectedTarget ? `${selectedTarget.nickname} (#0${selectedTarget.seatNumber + 1})` : 'NENHUM (CLIQUE EM ALGUÉM NA PRAÇA)'}
            </span>
          </div>

          <button
            onClick={() => onSubmitAction(NightActionType.INVESTIGATE, selectedTargetId)}
            disabled={!isTargetValid}
            className="w-full sm:w-auto px-4 py-1.5 rounded bg-indigo-600 hover:bg-indigo-500 disabled:opacity-30 text-white font-mono font-bold text-xs uppercase tracking-wider transition-colors shadow-sm"
          >
            INVESTIGAR SUSPEITO
          </button>
        </div>
      </div>
    );
  }

  // Role: BRUXA
  if (player.role === Role.BRUXA) {
    const charges = player.witchCharges || { hasKillPotion: true, hasProtectAllPotion: true };
    const isKillTargetValid = selectedTarget && selectedTarget.isAlive && selectedTarget.id !== player.id && charges.hasKillPotion;

    return (
      <div className="bg-[#0F1116] border border-purple-500/30 rounded-lg p-3 sm:p-4 space-y-3 font-sans">
        <div className="flex items-center justify-between border-b border-white/5 pb-2">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded bg-purple-500/10 text-purple-300 border border-purple-500/20">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-purple-400 block">
                ALQUIMIA NOTURNA
              </span>
              <h4 className="text-xs font-bold text-white">Poções da Bruxa</h4>
            </div>
          </div>
        </div>

        {/* Action Buttons for Witch */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {/* Option 1: Death Potion */}
          <button
            onClick={() => onSubmitAction(NightActionType.WITCH_KILL, selectedTargetId)}
            disabled={!isKillTargetValid}
            className="p-2.5 rounded bg-black/40 hover:bg-white/[0.04] border border-white/10 disabled:opacity-30 text-left space-y-1 transition-colors"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-rose-400 flex items-center gap-1 font-mono">
                ☠️ POÇÃO DE MORTE
              </span>
              <span className="text-[9px] font-mono px-1 py-0.2 rounded bg-black/50 text-slate-400">
                {charges.hasKillPotion ? '1x' : '0x'}
              </span>
            </div>
            <p className="text-[10px] text-slate-400">
              {selectedTarget ? `Matar ${selectedTarget.nickname}` : 'Selecione um alvo na praça'}
            </p>
          </button>

          {/* Option 2: Collective Protection */}
          <button
            onClick={() => onSubmitAction(NightActionType.WITCH_PROTECT_ALL)}
            disabled={!charges.hasProtectAllPotion}
            className="p-2.5 rounded bg-black/40 hover:bg-white/[0.04] border border-white/10 disabled:opacity-30 text-left space-y-1 transition-colors"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-emerald-400 flex items-center gap-1 font-mono">
                🛡️ SALVAR TODOS
              </span>
              <span className="text-[9px] font-mono px-1 py-0.2 rounded bg-black/50 text-slate-400">
                {charges.hasProtectAllPotion ? '1x' : '0x'}
              </span>
            </div>
            <p className="text-[10px] text-slate-400">Protege a cidade inteira do ataque</p>
          </button>

          {/* Option 3: Pass */}
          <button
            onClick={() => onSubmitAction(NightActionType.PASS)}
            className="p-2.5 rounded bg-black/40 hover:bg-white/[0.04] border border-white/10 text-left space-y-1 transition-colors"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-300 font-mono">⏳ POUPAR POÇÕES</span>
            </div>
            <p className="text-[10px] text-slate-400">Guardar recursos para a próxima noite</p>
          </button>
        </div>
      </div>
    );
  }

  return null;
};

