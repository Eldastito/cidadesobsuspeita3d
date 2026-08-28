/**
 * Cidade Sob Suspeita 3D — Noite narrada (roteiro do narrador)
 * A noite acontece em chamadas, como no jogo clássico: cada papel age no seu
 * turno; todos os demais dormem. Quem age tem UMA tarefa clara — tocar no
 * morador já registra a ação (nada de botão de confirmação perdido).
 */

import React, { useEffect } from 'react';
import { Check, Heart, Moon, Search, Shield, Skull, Sparkles, ThumbsDown, ThumbsUp } from 'lucide-react';
import { NightActionType, NightTurn, PrivatePlayerSnapshot, Role } from '../../engine/types.ts';
import { NIGHT_TURN_CALLS, NIGHT_TURN_ROLE, ROLE_METADATA } from '../../engine/rules.ts';

interface NightActionPanelProps {
  snapshot: PrivatePlayerSnapshot;
  selectedTargetId: string | null;
  onSubmitAction: (actionType: NightActionType, targetId?: string | null) => void;
}

const TURN_ICONS: Record<NightTurn, React.ReactNode> = {
  [NightTurn.ASSASSINS]: <Skull className="w-4 h-4" />,
  [NightTurn.DOCTOR]: <Heart className="w-4 h-4" />,
  [NightTurn.WITCH]: <Sparkles className="w-4 h-4" />,
  [NightTurn.GUARD]: <Shield className="w-4 h-4" />,
  [NightTurn.DETECTIVE]: <Search className="w-4 h-4" />,
};

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
    {label || 'Registrado'}
  </span>
);

/** Tela de "dormindo": o narrador segue o roteiro e você espera de olhos fechados. */
const SleepingCard: React.FC<{ turn: NightTurn | null; note?: string }> = ({ turn, note }) => (
  <div className="bg-ink-900 border border-indigo-500/20 rounded-2xl p-4 text-center space-y-2">
    <div className="flex items-center justify-center gap-2 text-indigo-300">
      <Moon className="w-4 h-4" aria-hidden />
      <span className="text-xs font-bold uppercase tracking-[0.25em]">Cidade dorme…</span>
      <span aria-hidden>💤</span>
    </div>
    {turn && (
      <p className="text-[11px] text-slate-400">
        <span className="text-slate-300 font-semibold">{NIGHT_TURN_CALLS[turn].sleepLabel}</span>{' '}
        Mantenha os olhos fechados até o narrador acordar a cidade.
      </p>
    )}
    {note && <p className="text-[10px] text-slate-500">{note}</p>}
  </div>
);

export const NightActionPanel: React.FC<NightActionPanelProps> = ({
  snapshot,
  selectedTargetId,
  onSubmitAction,
}) => {
  const { player, room } = snapshot;
  const turn = room.nightTurn;
  const selectedTarget = room.players.find(p => p.id === selectedTargetId);
  const currentAction = player.currentNightAction;
  const hasSubmitted = !!currentAction;

  const isMyTurn = !!turn && player.isAlive && NIGHT_TURN_ROLE[turn] === player.role;

  // Resposta imediata do Detetive nesta noite (o narrador já respondeu?)
  const investigationNow =
    player.role === Role.DETETIVE
      ? (player.investigationLog || []).find(e => e.round === room.roundNumber)
      : undefined;

  // Um toque já age: selecionar um morador válido durante o SEU turno envia a
  // ação na hora (trocar de alvo reenvia; o Detetive tem uma pergunta só).
  useEffect(() => {
    if (!isMyTurn || !turn || !selectedTarget || !selectedTarget.isAlive) return;
    if (currentAction?.targetId === selectedTarget.id) return;

    if (player.role === Role.ASSASSINO) {
      const isFellow = (player.fellowAssassinIds || []).includes(selectedTarget.id);
      if (selectedTarget.id === player.id || isFellow) return;
      onSubmitAction(NightActionType.KILL, selectedTarget.id);
    } else if (player.role === Role.MEDICO) {
      const isSelf = selectedTarget.id === player.id;
      if (isSelf && player.doctorSelfHealUsed) return;
      if (player.lastDoctorTargetId === selectedTarget.id) return;
      onSubmitAction(NightActionType.HEAL, selectedTarget.id);
    } else if (player.role === Role.DETETIVE) {
      if (selectedTarget.id === player.id || investigationNow) return;
      onSubmitAction(NightActionType.INVESTIGATE, selectedTarget.id);
    } else if (player.role === Role.GUARDA) {
      if (selectedTarget.id === player.id) return;
      onSubmitAction(NightActionType.BODYGUARD, selectedTarget.id);
    }
    // Bruxa decide por botões (duas poções diferentes) — sem envio automático.
  }, [isMyTurn, turn, selectedTarget?.id]); // eslint-disable-line react-hooks/exhaustive-deps

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

  // Não é a sua vez (ou é o intervalo entre chamadas): a cidade dorme.
  if (!turn || !isMyTurn) {
    const citizenNote =
      player.role === Role.CIDADAO
        ? 'Você é Cidadão: dorme a noite toda. Sua hora chega no debate e na votação.'
        : undefined;
    return <SleepingCard turn={turn} note={citizenNote} />;
  }

  const call = NIGHT_TURN_CALLS[turn];

  // ── Assassinos: um toque marca a vítima da EQUIPE ────────────────────────
  if (player.role === Role.ASSASSINO) {
    const meta = ROLE_METADATA[Role.ASSASSINO];
    const teamTarget = player.assassinTeamTarget
      ? room.players.find(p => p.id === player.assassinTeamTarget!.targetId)
      : null;
    const markedBy = player.assassinTeamTarget
      ? room.players.find(p => p.id === player.assassinTeamTarget!.markedById)
      : null;
    return (
      <Panel
        accent={meta.color}
        icon={TURN_ICONS[turn]}
        kicker="O narrador chama"
        title={call.call}
        right={hasSubmitted ? <SubmittedBadge label="Golpe armado" /> : undefined}
      >
        <p className="text-[11px] text-slate-400">{call.prompt}</p>
        {(player.fellowAssassinIds?.length ?? 0) > 0 && (
          <p className="text-[10px] text-rose-300/80">
            Seus comparsas:{' '}
            {player.fellowAssassinIds!
              .map(id => room.players.find(p => p.id === id)?.nickname)
              .filter(Boolean)
              .join(', ')}
          </p>
        )}
        <div className="p-2.5 bg-ink-950/70 border border-white/10 rounded-xl flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-xs">
            <span className="text-slate-500 text-[10px] uppercase">Vítima da equipe:</span>
            {teamTarget ? (
              <span className="font-bold text-rose-300">
                🗡️ {teamTarget.nickname}
                {markedBy && markedBy.id !== player.id && (
                  <span className="text-[10px] text-slate-400 font-normal"> — marcado por {markedBy.nickname}</span>
                )}
              </span>
            ) : (
              <span className="text-slate-400">toque em alguém na praça</span>
            )}
          </div>
        </div>
        <p className="text-[10px] text-slate-500">
          Quem você tocar É quem cai — sem sorteio. Para trocar, toque em outro morador antes de o narrador seguir.
        </p>
      </Panel>
    );
  }

  // ── Médico ───────────────────────────────────────────────────────────────
  if (player.role === Role.MEDICO) {
    const meta = ROLE_METADATA[Role.MEDICO];
    const protectedTarget = currentAction?.targetId
      ? room.players.find(p => p.id === currentAction.targetId)
      : null;
    const isConsecutive = !!selectedTarget && player.lastDoctorTargetId === selectedTarget.id;
    const selfBlocked = selectedTarget?.id === player.id && player.doctorSelfHealUsed;
    return (
      <Panel
        accent={meta.color}
        icon={TURN_ICONS[turn]}
        kicker="O narrador chama"
        title={call.call}
        right={
          hasSubmitted ? (
            <SubmittedBadge label="Proteção ativa" />
          ) : (
            <span className="text-[10px] px-2 py-0.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-semibold">
              Autoproteção: {player.doctorSelfHealUsed ? 'usada' : '1 disponível'}
            </span>
          )
        }
      >
        <p className="text-[11px] text-slate-400">{call.prompt}</p>
        <div className="p-2.5 bg-ink-950/70 border border-white/10 rounded-xl flex items-center gap-2 text-xs">
          <span className="text-slate-500 text-[10px] uppercase">Protegendo:</span>
          <span className="font-bold text-emerald-300">
            {protectedTarget ? `🛡️ ${protectedTarget.nickname}` : 'toque em alguém na praça'}
          </span>
        </div>
        {isConsecutive && (
          <p className="text-[10px] text-amber-400">⚠️ Você protegeu essa pessoa na noite passada — escolha outra.</p>
        )}
        {selfBlocked && (
          <p className="text-[10px] text-amber-400">⚠️ Sua única autoproteção já foi usada nesta partida.</p>
        )}
        <p className="text-[10px] text-slate-500">Um toque protege. Para trocar, toque em outro morador.</p>
      </Panel>
    );
  }

  // ── Detetive: o narrador responde NA HORA ────────────────────────────────
  if (player.role === Role.DETETIVE) {
    const meta = ROLE_METADATA[Role.DETETIVE];
    return (
      <Panel
        accent={meta.color}
        icon={TURN_ICONS[turn]}
        kicker="O narrador chama"
        title={call.call}
        right={investigationNow ? <SubmittedBadge label="Resposta recebida" /> : undefined}
      >
        {investigationNow ? (
          <div
            className={`p-3 rounded-xl border flex items-center gap-3 ${
              investigationNow.isSuspicious
                ? 'bg-rose-500/10 border-rose-500/30'
                : 'bg-emerald-500/10 border-emerald-500/30'
            }`}
          >
            {investigationNow.isSuspicious ? (
              <ThumbsDown className="w-6 h-6 text-rose-400 shrink-0" />
            ) : (
              <ThumbsUp className="w-6 h-6 text-emerald-400 shrink-0" />
            )}
            <div>
              <p className={`text-sm font-bold ${investigationNow.isSuspicious ? 'text-rose-300' : 'text-emerald-300'}`}>
                {investigationNow.targetNickname} é {investigationNow.isSuspicious ? 'SUSPEITO! 🗡️' : 'inocente.'}
              </p>
              <p className="text-[10px] text-slate-400">
                O gesto do narrador fica anotado no seu caderno. Guarde segredo… ou use no debate.
              </p>
            </div>
          </div>
        ) : (
          <>
            <p className="text-[11px] text-slate-400">{call.prompt}</p>
            <div className="p-2.5 bg-ink-950/70 border border-white/10 rounded-xl flex items-center gap-2 text-xs">
              <span className="text-slate-500 text-[10px] uppercase">Investigar:</span>
              <span className="font-bold text-indigo-300">toque em alguém na praça</span>
            </div>
            <p className="text-[10px] text-slate-500">Uma pergunta por noite — escolha bem.</p>
          </>
        )}
      </Panel>
    );
  }

  // ── Guarda-costas ────────────────────────────────────────────────────────
  if (player.role === Role.GUARDA) {
    const meta = ROLE_METADATA[Role.GUARDA];
    const escortTarget = currentAction?.targetId
      ? room.players.find(p => p.id === currentAction.targetId)
      : null;
    return (
      <Panel
        accent={meta.color}
        icon={TURN_ICONS[turn]}
        kicker="O narrador chama"
        title={call.call}
        right={hasSubmitted ? <SubmittedBadge label="Escolta a postos" /> : undefined}
      >
        <p className="text-[11px] text-slate-400">{call.prompt}</p>
        <div className="p-2.5 bg-ink-950/70 border border-white/10 rounded-xl flex items-center gap-2 text-xs">
          <span className="text-slate-500 text-[10px] uppercase">Escoltando:</span>
          <span className="font-bold text-sky-300">
            {escortTarget ? `🛡️ ${escortTarget.nickname}` : 'toque em alguém na praça'}
          </span>
        </div>
        <p className="text-[10px] text-slate-500">
          Se os assassinos atacarem quem você escolta, você cai no lugar da vítima.
        </p>
      </Panel>
    );
  }

  // ── Bruxa (duas poções → decisão por botões) ─────────────────────────────
  if (player.role === Role.BRUXA) {
    const meta = ROLE_METADATA[Role.BRUXA];
    const charges = player.witchCharges || { hasKillPotion: true, hasProtectAllPotion: true };
    const isKillTargetValid =
      selectedTarget && selectedTarget.isAlive && selectedTarget.id !== player.id && charges.hasKillPotion;
    return (
      <Panel
        accent={meta.color}
        icon={TURN_ICONS[turn]}
        kicker="O narrador chama"
        title={call.call}
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

  return <SleepingCard turn={turn} />;
};
