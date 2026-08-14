/**
 * Cidade Sob Suspeita 3D — Console de ação noturna
 * Cada papel vê apenas o próprio poder. Todos os vivos têm algo para fazer
 * (o Cidadão registra um palpite), escondendo o timing das ações reais.
 */

import React from 'react';
import { Check, Eye, Heart, Moon, Search, Skull, Sparkles } from 'lucide-react';
import { NightActionType, PrivatePlayerSnapshot, Role } from '../../engine/types.ts';
import { ROLE_METADATA } from '../../engine/rules.ts';

interface NightActionPanelProps {
  snapshot: PrivatePlayerSnapshot;
  selectedTargetId: string | null;
  onSubmitAction: (actionType: NightActionType, targetId?: string | null) => void;
}

const Panel: React.FC<{
  accent: string;
  icon: React.ReactNode;
  kicker: string;
  title: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}> = ({ accent, icon, kicker, title, right, children }) => (
  <div className="bg-ink-900 border rounded-2xl p-3 sm:p-4 space-y-3 shadow-lg" style={{ borderColor: `${accent}40` }}>
    <div className="flex items-center justify-between border-b border-white/5 pb-2">
      <div className="flex items-center gap-2">
        <div className="p-1.5 rounded-lg border" style={{ backgroundColor: `${accent}14`, borderColor: `${accent}30`, color: accent }}>
          {icon}
        </div>
        <div>
          <span className="text-[10px] font-bold uppercase tracking-[0.2em] block" style={{ color: accent }}>
            {kicker}
          </span>
          <h4 className="text-xs font-bold text-white">{title}</h4>
        </div>
      </div>
      {right}
    </div>
    {children}
  </div>
);

const SubmittedBadge: React.FC<{ label?: string }> = ({ label }) => (
  <span className="px-2 py-0.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[10px] font-bold flex items-center gap-1">
    <Check className="w-3 h-3" />
    {label || 'Ação registrada'}
  </span>
);

export const NightActionPanel: React.FC<NightActionPanelProps> = ({
  snapshot,
  selectedTargetId,
  onSubmitAction,
}) => {
  const { player, room } = snapshot;
  const selectedTarget = room.players.find(p => p.id === selectedTargetId);
  const currentAction = player.currentNightAction;
  const hasSubmitted = !!currentAction;

  const targetLabel = (empty: string) =>
    selectedTarget ? selectedTarget.nickname : empty;

  if (!player.isAlive) {
    return (
      <div className="bg-ink-900 border border-white/5 rounded-2xl p-4 text-center space-y-1">
        <span className="text-xl" aria-hidden>👻</span>
        <h4 className="text-xs font-bold text-slate-300">Você observa do além</h4>
        <p className="text-[11px] text-slate-500 max-w-md mx-auto">
          Os vivos não podem ouvir você. Acompanhe a noite e converse no canal do cemitério.
        </p>
      </div>
    );
  }

  // ── Cidadão: palpite privado ──────────────────────────────────────────────
  if (player.role === Role.CIDADAO) {
    const meta = ROLE_METADATA[Role.CIDADAO];
    const isTargetValid = selectedTarget && selectedTarget.isAlive && selectedTarget.id !== player.id;
    return (
      <Panel
        accent={meta.color}
        icon={<Eye className="w-4 h-4" />}
        kicker="Vigília silenciosa"
        title="Anote uma suspeita antes de dormir"
        right={hasSubmitted ? <SubmittedBadge /> : undefined}
      >
        <div className="p-2.5 bg-ink-950/70 border border-white/10 rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-xs">
            <span className="text-slate-500 text-[10px] uppercase">Suspeito de hoje:</span>
            <span className="font-bold text-white">{targetLabel('toque em alguém na praça')}</span>
          </div>
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              onClick={() => onSubmitAction(NightActionType.OBSERVE, selectedTargetId)}
              disabled={!isTargetValid}
              className="flex-1 sm:flex-none px-4 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 disabled:opacity-30 text-ink-950 font-bold text-xs transition-colors"
            >
              Anotar suspeita
            </button>
            <button
              onClick={() => onSubmitAction(NightActionType.PASS)}
              className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 border border-white/10 text-xs font-semibold transition-colors"
            >
              Só dormir
            </button>
          </div>
        </div>
        {(player.hunchLog?.length ?? 0) > 0 && (
          <p className="text-[10px] text-slate-500">
            Suas anotações: {player.hunchLog!.map(h => `${h.targetNickname} (noite ${h.round})`).join(' · ')}
          </p>
        )}
      </Panel>
    );
  }

  // ── Assassino ────────────────────────────────────────────────────────────
  if (player.role === Role.ASSASSINO) {
    const meta = ROLE_METADATA[Role.ASSASSINO];
    const isFellow = !!selectedTarget && (player.fellowAssassinIds || []).includes(selectedTarget.id);
    const isTargetValid = selectedTarget && selectedTarget.isAlive && selectedTarget.id !== player.id && !isFellow;
    return (
      <Panel
        accent={meta.color}
        icon={<Skull className="w-4 h-4" />}
        kicker="Pacto das sombras"
        title="Escolham a vítima desta noite"
        right={hasSubmitted ? <SubmittedBadge /> : undefined}
      >
        {(player.fellowAssassinIds?.length ?? 0) > 0 && (
          <p className="text-[10px] text-rose-300/80">
            Seus comparsas:{' '}
            {player.fellowAssassinIds!
              .map(id => room.players.find(p => p.id === id)?.nickname)
              .filter(Boolean)
              .join(', ')}{' '}
            — a maioria define o alvo.
          </p>
        )}
        <div className="p-2.5 bg-ink-950/70 border border-white/10 rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-xs">
            <span className="text-slate-500 text-[10px] uppercase">Alvo:</span>
            <span className="font-bold text-white">{targetLabel('toque em alguém na praça')}</span>
            {isFellow && <span className="text-[10px] text-rose-400">(comparsa — proibido)</span>}
          </div>
          <button
            onClick={() => onSubmitAction(NightActionType.KILL, selectedTargetId)}
            disabled={!isTargetValid}
            className="w-full sm:w-auto px-4 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 disabled:opacity-30 text-white font-bold text-xs transition-colors"
          >
            Confirmar ataque
          </button>
        </div>
      </Panel>
    );
  }

  // ── Médico ───────────────────────────────────────────────────────────────
  if (player.role === Role.MEDICO) {
    const meta = ROLE_METADATA[Role.MEDICO];
    const isTargetSelf = selectedTarget?.id === player.id;
    const canSelfHeal = !player.doctorSelfHealUsed;
    const isConsecutive = !!selectedTarget && player.lastDoctorTargetId === selectedTarget.id;
    const isTargetValid =
      selectedTarget && selectedTarget.isAlive && (!isTargetSelf || canSelfHeal) && !isConsecutive;
    return (
      <Panel
        accent={meta.color}
        icon={<Heart className="w-4 h-4" />}
        kicker="Plantão noturno"
        title="Escolha quem proteger esta noite"
        right={
          hasSubmitted ? (
            <SubmittedBadge />
          ) : (
            <span className="text-[10px] px-2 py-0.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-semibold">
              Autoproteção: {player.doctorSelfHealUsed ? 'usada' : '1 disponível'}
            </span>
          )
        }
      >
        <div className="p-2.5 bg-ink-950/70 border border-white/10 rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-xs">
            <span className="text-slate-500 text-[10px] uppercase">Proteger:</span>
            <span className="font-bold text-white">{targetLabel('toque em alguém na praça')}</span>
          </div>
          <button
            onClick={() => onSubmitAction(NightActionType.HEAL, selectedTargetId)}
            disabled={!isTargetValid}
            className="w-full sm:w-auto px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-30 text-white font-bold text-xs transition-colors"
          >
            Confirmar proteção
          </button>
        </div>
        {isConsecutive && (
          <p className="text-[10px] text-amber-400">
            ⚠️ Você protegeu essa pessoa na noite passada — escolha outra.
          </p>
        )}
      </Panel>
    );
  }

  // ── Detetive ─────────────────────────────────────────────────────────────
  if (player.role === Role.DETETIVE) {
    const meta = ROLE_METADATA[Role.DETETIVE];
    const isTargetValid = selectedTarget && selectedTarget.isAlive && selectedTarget.id !== player.id;
    return (
      <Panel
        accent={meta.color}
        icon={<Search className="w-4 h-4" />}
        kicker="Ronda investigativa"
        title="Quem você vai investigar esta noite?"
        right={hasSubmitted ? <SubmittedBadge label="Investigação em curso" /> : undefined}
      >
        <div className="p-2.5 bg-ink-950/70 border border-white/10 rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-xs">
            <span className="text-slate-500 text-[10px] uppercase">Suspeito:</span>
            <span className="font-bold text-white">{targetLabel('toque em alguém na praça')}</span>
          </div>
          <button
            onClick={() => onSubmitAction(NightActionType.INVESTIGATE, selectedTargetId)}
            disabled={!isTargetValid}
            className="w-full sm:w-auto px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-30 text-white font-bold text-xs transition-colors"
          >
            Investigar
          </button>
        </div>
        <p className="text-[10px] text-slate-500">
          O resultado chega ao seu caderno quando o dia amanhecer.
        </p>
      </Panel>
    );
  }

  // ── Bruxa ────────────────────────────────────────────────────────────────
  if (player.role === Role.BRUXA) {
    const meta = ROLE_METADATA[Role.BRUXA];
    const charges = player.witchCharges || { hasKillPotion: true, hasProtectAllPotion: true };
    const isKillTargetValid =
      selectedTarget && selectedTarget.isAlive && selectedTarget.id !== player.id && charges.hasKillPotion;
    return (
      <Panel
        accent={meta.color}
        icon={<Sparkles className="w-4 h-4" />}
        kicker="Caldeirão da meia-noite"
        title="Escolha uma poção (ou guarde as duas)"
        right={hasSubmitted ? <SubmittedBadge /> : undefined}
      >
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <button
            onClick={() => onSubmitAction(NightActionType.WITCH_KILL, selectedTargetId)}
            disabled={!isKillTargetValid}
            className="p-2.5 rounded-xl bg-ink-950/70 hover:bg-white/5 border border-white/10 disabled:opacity-30 text-left space-y-1 transition-colors"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-rose-400">☠️ Poção da morte</span>
              <span className="text-[9px] px-1.5 rounded bg-black/50 text-slate-400 font-mono">
                {charges.hasKillPotion ? '1×' : '0×'}
              </span>
            </div>
            <p className="text-[10px] text-slate-400">
              {selectedTarget ? `Eliminar ${selectedTarget.nickname}` : 'Toque em um alvo na praça'}
            </p>
          </button>

          <button
            onClick={() => onSubmitAction(NightActionType.WITCH_PROTECT_ALL)}
            disabled={!charges.hasProtectAllPotion}
            className="p-2.5 rounded-xl bg-ink-950/70 hover:bg-white/5 border border-white/10 disabled:opacity-30 text-left space-y-1 transition-colors"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-emerald-400">🛡️ Escudo coletivo</span>
              <span className="text-[9px] px-1.5 rounded bg-black/50 text-slate-400 font-mono">
                {charges.hasProtectAllPotion ? '1×' : '0×'}
              </span>
            </div>
            <p className="text-[10px] text-slate-400">Bloqueia o ataque dos assassinos hoje</p>
          </button>

          <button
            onClick={() => onSubmitAction(NightActionType.PASS)}
            className="p-2.5 rounded-xl bg-ink-950/70 hover:bg-white/5 border border-white/10 text-left space-y-1 transition-colors"
          >
            <span className="text-xs font-bold text-slate-300">⏳ Guardar poções</span>
            <p className="text-[10px] text-slate-400">Esperar uma noite mais decisiva</p>
          </button>
        </div>
      </Panel>
    );
  }

  return null;
};
