/**
 * Cidade Sob Suspeita 3D — Lobby
 * Tela de chegada (criar/entrar) e sala de espera com a praça 3D ao vivo,
 * composição de papéis editável e resumo de regras visível antes do "pronto".
 */

import React, { useState } from 'react';
import {
  Bot,
  CheckCircle,
  Copy,
  Crown,
  Minus,
  Play,
  Plus,
  ScrollText,
  Trash2,
  UserCheck,
  Users,
  WifiOff,
} from 'lucide-react';
import { GamePhase, PrivatePlayerSnapshot, Role, RoomConfig, VotingMode } from '../../engine/types.ts';
import { getRecommendedRoles, ROLE_METADATA, validateComposition } from '../../engine/rules.ts';
import { MovementBus } from '../../services/gameClient.ts';
import { TownSquare3D } from '../3D/TownSquare3D.tsx';
import { TownSquare2D } from '../2D/TownSquare2D.tsx';

interface LobbyViewProps {
  snapshot: PrivatePlayerSnapshot | null;
  onCreateRoom: (nickname: string, avatarId: string, config?: Partial<RoomConfig>) => void;
  onJoinRoom: (roomCode: string, nickname: string, avatarId: string) => void;
  onUpdateConfig: (config: Partial<RoomConfig>) => void;
  onSetReady: (isReady: boolean) => void;
  onStartMatch: () => void;
  onFillBots: (count: number) => void;
  onRemoveBots: () => void;
  onOpenRules: () => void;
  movementBus: MovementBus;
  viewMode: '3D' | '2D';
  selectedTargetId: string | null;
  onSelectPlayer: (playerId: string) => void;
  /** Falantes na voz (indicador 🔊 na praça). */
  speakingIds?: ReadonlySet<string>;
  /** Barra de voz pronta, renderizada na coluna lateral. */
  voiceBar?: React.ReactNode;
}

const AVATAR_OPTIONS = [
  { id: 'avatar-1', emoji: '🧢', label: 'Boina' },
  { id: 'avatar-2', emoji: '🙂', label: 'Sem chapéu' },
  { id: 'avatar-3', emoji: '🧙', label: 'Chapéu de mago' },
  { id: 'avatar-4', emoji: '🎩', label: 'Cartola' },
  { id: 'avatar-5', emoji: '🥷', label: 'Capuz' },
  { id: 'avatar-6', emoji: '👒', label: 'Chapéu de palha' },
];

const NICKNAME_SUGGESTIONS = [
  'Aurora', 'Baltazar', 'Celeste', 'Dorival', 'Esmeralda', 'Firmino',
  'Guiomar', 'Horácio', 'Iolanda', 'Jacinto', 'Leonor', 'Martim',
];

export const LobbyView: React.FC<LobbyViewProps> = ({
  snapshot,
  onCreateRoom,
  onJoinRoom,
  onUpdateConfig,
  onSetReady,
  onStartMatch,
  onFillBots,
  onRemoveBots,
  onOpenRules,
  movementBus,
  viewMode,
  selectedTargetId,
  onSelectPlayer,
  speakingIds,
  voiceBar,
}) => {
  const [nickname, setNickname] = useState(
    () => NICKNAME_SUGGESTIONS[Math.floor(Math.random() * NICKNAME_SUGGESTIONS.length)]
  );
  const [selectedAvatar, setSelectedAvatar] = useState('avatar-1');
  const [joinCode, setJoinCode] = useState('');
  const [copied, setCopied] = useState(false);

  // ── Tela de chegada ──────────────────────────────────────────────────────
  if (!snapshot) {
    return (
      <div className="min-h-[calc(100vh-56px)] flex items-center justify-center p-4">
        <div className="w-full max-w-md space-y-6">
          {/* Marca */}
          <div className="text-center space-y-2">
            <div className="text-5xl leading-none select-none" aria-hidden>
              🏘️🌙
            </div>
            <h1 className="font-display text-2xl sm:text-3xl font-bold text-lantern-300 tracking-wide">
              Cidade Sob Suspeita
            </h1>
            <p className="text-xs text-slate-400 max-w-sm mx-auto leading-relaxed">
              Uma vila 3D, papéis secretos e uma pergunta por rodada:
              <span className="text-slate-200"> quem entre nós é o assassino?</span>
            </p>
          </div>

          <div className="bg-ink-900/90 border border-white/8 rounded-2xl p-5 shadow-2xl space-y-5 backdrop-blur">
            {/* Apelido */}
            <div>
              <label
                htmlFor="nickname"
                className="block text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500 mb-1.5"
              >
                Seu apelido na vila
              </label>
              <input
                id="nickname"
                type="text"
                value={nickname}
                onChange={e => setNickname(e.target.value)}
                placeholder="Como querem te chamar?"
                maxLength={20}
                className="w-full px-3 py-2.5 bg-ink-950/80 border border-white/10 rounded-lg text-sm text-white placeholder-slate-600 focus:outline-none focus:border-lantern-400/60 focus:ring-1 focus:ring-lantern-400/30 transition-colors"
              />
            </div>

            {/* Avatar */}
            <div>
              <span className="block text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500 mb-1.5">
                Estilo do seu morador
              </span>
              <div className="grid grid-cols-6 gap-2" role="radiogroup" aria-label="Escolha de avatar">
                {AVATAR_OPTIONS.map(av => (
                  <button
                    key={av.id}
                    role="radio"
                    aria-checked={selectedAvatar === av.id}
                    onClick={() => setSelectedAvatar(av.id)}
                    title={av.label}
                    className={`p-2 rounded-lg border transition-all flex items-center justify-center text-xl ${
                      selectedAvatar === av.id
                        ? 'bg-lantern-400/15 border-lantern-400/70 ring-1 ring-lantern-400/40'
                        : 'bg-ink-950/60 border-white/5 hover:border-white/20'
                    }`}
                  >
                    {av.emoji}
                  </button>
                ))}
              </div>
            </div>

            {/* Ações */}
            <div className="space-y-3 pt-1">
              <button
                onClick={() => onCreateRoom(nickname, selectedAvatar)}
                disabled={!nickname.trim()}
                className="w-full py-3 px-4 rounded-xl bg-lantern-400 hover:bg-lantern-300 disabled:opacity-40 text-ink-950 font-bold text-sm transition-colors shadow-lg shadow-lantern-500/10 flex items-center justify-center gap-2"
              >
                <Plus className="w-4 h-4" />
                Fundar uma nova vila
              </button>

              <div className="relative flex py-0.5 items-center">
                <div className="flex-grow border-t border-white/5" />
                <span className="flex-shrink mx-3 text-[10px] uppercase tracking-[0.2em] text-slate-600">
                  ou entre com um código
                </span>
                <div className="flex-grow border-t border-white/5" />
              </div>

              <div className="flex gap-2">
                <input
                  type="text"
                  value={joinCode}
                  onChange={e => setJoinCode(e.target.value.toUpperCase())}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && joinCode.trim() && nickname.trim()) {
                      onJoinRoom(joinCode, nickname, selectedAvatar);
                    }
                  }}
                  placeholder="CÓDIGO (EX: XK4P)"
                  maxLength={8}
                  aria-label="Código da sala"
                  className="flex-1 px-3 py-2.5 bg-ink-950/80 border border-white/10 rounded-lg text-sm font-mono uppercase tracking-widest text-white placeholder-slate-600 focus:outline-none focus:border-lantern-400/60"
                />
                <button
                  onClick={() => onJoinRoom(joinCode, nickname, selectedAvatar)}
                  disabled={!joinCode.trim() || !nickname.trim()}
                  className="px-5 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 disabled:opacity-40 text-slate-200 border border-white/10 font-bold text-sm transition-colors"
                >
                  Entrar
                </button>
              </div>
            </div>
          </div>

          <p className="text-center text-[10px] text-slate-600">
            5 a 12 jogadores • funciona no celular • sem instalação
          </p>
        </div>
      </div>
    );
  }

  // ── Sala de espera ───────────────────────────────────────────────────────
  const isHost = snapshot.player.isHost;
  const players = snapshot.room.players;
  const config = snapshot.room.config;
  const me = players.find(p => p.id === snapshot.player.id);
  const composition = validateComposition(players.length, config.rolesCount);
  const canStart = players.length >= config.minPlayers && players.every(p => p.isReady) && composition.valid;

  const handleCopy = () => {
    navigator.clipboard.writeText(snapshot.room.roomCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const patchRoles = (key: keyof RoomConfig['rolesCount'], delta: number, max: number) => {
    const value = Math.max(0, Math.min(max, config.rolesCount[key] + delta));
    onUpdateConfig({ rolesCount: { ...config.rolesCount, [key]: value } });
  };

  const roleRow = (
    role: Role,
    key: keyof RoomConfig['rolesCount'],
    max: number,
    minValue: number = 0
  ) => {
    const meta = ROLE_METADATA[role];
    const count = config.rolesCount[key];
    return (
      <div
        className="p-2 rounded-lg border flex items-center justify-between gap-2"
        style={{ backgroundColor: `${meta.color}0d`, borderColor: `${meta.color}30` }}
      >
        <span className="flex items-center gap-1.5 text-xs font-semibold" style={{ color: meta.color }}>
          <span aria-hidden>{meta.emoji}</span> {meta.name}
        </span>
        <div className="flex items-center gap-1.5">
          {isHost && (
            <button
              onClick={() => patchRoles(key, -1, max)}
              disabled={count <= minValue}
              aria-label={`Diminuir ${meta.name}`}
              className="p-1 rounded bg-black/30 border border-white/10 disabled:opacity-25 text-slate-300 hover:bg-white/10"
            >
              <Minus className="w-3 h-3" />
            </button>
          )}
          <span className="font-bold text-sm w-6 text-center" style={{ color: meta.color }}>
            {count}
          </span>
          {isHost && (
            <button
              onClick={() => patchRoles(key, 1, max)}
              disabled={count >= max}
              aria-label={`Aumentar ${meta.name}`}
              className="p-1 rounded bg-black/30 border border-white/10 disabled:opacity-25 text-slate-300 hover:bg-white/10"
            >
              <Plus className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>
    );
  };

  const citizensCount = Math.max(
    0,
    players.length -
      (config.rolesCount.assassins +
        config.rolesCount.doctor +
        config.rolesCount.detective +
        config.rolesCount.witch)
  );
  const recommended = getRecommendedRoles(players.length);

  return (
    <div className="flex-1 max-w-7xl w-full mx-auto p-2.5 sm:p-3.5 grid grid-cols-1 lg:grid-cols-12 gap-3">
      {/* Praça ao vivo enquanto o grupo se forma */}
      <div className="lg:col-span-7 flex flex-col gap-3">
        <div className="bg-ink-900 border border-white/5 rounded-2xl p-3 flex flex-wrap items-center justify-between gap-2 shadow-lg">
          <div className="flex items-center gap-2.5">
            <span className="text-xl" aria-hidden>🏘️</span>
            <div>
              <h2 className="font-display text-sm font-bold text-lantern-300">Praça da Vila</h2>
              <p className="text-[11px] text-slate-400">
                {players.length}/{config.maxPlayers} moradores • mínimo {config.minPlayers} para começar
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="px-3 py-1.5 bg-ink-950/80 border border-white/10 rounded-lg flex items-center gap-2">
              <span className="text-[10px] uppercase text-slate-500">Código</span>
              <span className="text-base font-mono font-bold text-lantern-300 tracking-[0.2em]">
                {snapshot.room.roomCode}
              </span>
            </div>
            <button
              onClick={handleCopy}
              title="Copiar código da sala"
              className="p-2 bg-white/5 hover:bg-white/10 text-slate-300 rounded-lg border border-white/10 transition-colors"
            >
              {copied ? <CheckCircle className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
            </button>
          </div>
        </div>

        <div className="flex-1 min-h-[320px] lg:min-h-[420px] bg-ink-900 border border-white/5 rounded-2xl overflow-hidden shadow-2xl">
          {viewMode === '3D' ? (
            <TownSquare3D
              players={players}
              localPlayerId={snapshot.player.id}
              phase={GamePhase.LOBBY}
              selectedTargetId={selectedTargetId}
              onSelectPlayer={onSelectPlayer}
              movementBus={movementBus}
              speakingIds={speakingIds}
            />
          ) : (
            <TownSquare2D
              players={players}
              localPlayerId={snapshot.player.id}
              phase={GamePhase.LOBBY}
              selectedTargetId={selectedTargetId}
              onSelectPlayer={onSelectPlayer}
            />
          )}
        </div>
      </div>

      {/* Painel da sala */}
      <div className="lg:col-span-5 flex flex-col gap-3">
        {voiceBar}
        {/* Moradores */}
        <div className="bg-ink-900 border border-white/5 rounded-2xl overflow-hidden shadow-lg">
          <div className="p-3 border-b border-white/5 flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500 flex items-center gap-2">
              <Users className="w-3.5 h-3.5 text-lantern-400" />
              Moradores ({players.length})
            </span>
            <button
              onClick={() => onSetReady(!me?.isReady)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors flex items-center gap-1.5 ${
                me?.isReady
                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                  : 'bg-lantern-400 text-ink-950 hover:bg-lantern-300'
              }`}
            >
              <UserCheck className="w-3.5 h-3.5" />
              {me?.isReady ? 'Pronto!' : 'Estou pronto'}
            </button>
          </div>

          <div className="p-2.5 grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-56 overflow-y-auto">
            {players.map(p => (
              <div
                key={p.id}
                className="px-2.5 py-2 bg-ink-950/60 border border-white/5 rounded-lg flex items-center justify-between gap-2"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-base shrink-0" aria-hidden>
                    {p.isBot ? '🤖' : AVATAR_OPTIONS.find(a => a.id === p.avatarId)?.emoji || '🙂'}
                  </span>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1">
                      <span className="text-xs font-semibold text-white truncate">{p.nickname}</span>
                      {p.isHost && <Crown className="w-3 h-3 text-lantern-400 shrink-0" aria-label="Anfitrião" />}
                      {!p.isConnected && <WifiOff className="w-3 h-3 text-rose-400 shrink-0" aria-label="Reconectando" />}
                    </div>
                    <span className="text-[10px] text-slate-500">
                      {p.id === snapshot.player.id ? 'você' : p.isBot ? 'bot' : 'convidado'}
                    </span>
                  </div>
                </div>
                <span
                  className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase ${
                    p.isReady
                      ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400'
                      : 'bg-white/5 border border-white/5 text-slate-500'
                  }`}
                >
                  {p.isReady ? 'pronto' : 'esperando'}
                </span>
              </div>
            ))}
          </div>

          {isHost && (
            <div className="p-2.5 bg-ink-950/60 border-t border-white/5 flex flex-wrap items-center gap-2">
              <span className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-slate-500">
                <Bot className="w-3 h-3 text-lantern-400" /> Completar com bots:
              </span>
              {[6, 8, 10].map(n => (
                <button
                  key={n}
                  onClick={() => onFillBots(Math.max(1, n - players.length))}
                  disabled={players.length >= n}
                  className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 disabled:opacity-30 text-[11px] font-bold text-slate-300 transition-colors"
                >
                  até {n}
                </button>
              ))}
              {players.some(p => p.isBot) && (
                <button
                  onClick={onRemoveBots}
                  className="px-2.5 py-1 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 text-[11px] font-bold transition-colors flex items-center gap-1"
                >
                  <Trash2 className="w-3 h-3" /> limpar
                </button>
              )}
            </div>
          )}
        </div>

        {/* Papéis da partida */}
        <div className="bg-ink-900 border border-white/5 rounded-2xl overflow-hidden shadow-lg">
          <div className="p-3 border-b border-white/5 flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">
              Papéis desta partida
            </span>
            {isHost && (
              <button
                onClick={() => onUpdateConfig({ rolesCount: recommended })}
                className="text-[10px] text-lantern-300 hover:text-lantern-200 underline underline-offset-2"
              >
                usar sugestão para {players.length}
              </button>
            )}
          </div>
          <div className="p-2.5 space-y-1.5">
            {roleRow(Role.ASSASSINO, 'assassins', 3, 1)}
            {roleRow(Role.MEDICO, 'doctor', 1)}
            {roleRow(Role.DETETIVE, 'detective', 1)}
            {roleRow(Role.BRUXA, 'witch', 1)}
            <div className="p-2 rounded-lg bg-amber-500/5 border border-amber-500/20 flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-xs font-semibold text-amber-300">
                <span aria-hidden>🏠</span> Cidadãos
              </span>
              <span className="font-bold text-sm text-amber-300">{citizensCount}</span>
            </div>
            {!composition.valid && (
              <p className="text-[11px] text-rose-400 pt-1">⚠️ {composition.reason}</p>
            )}
          </div>

          {/* Opções da sala */}
          <div className="px-2.5 pb-2.5 space-y-1.5 text-xs">
            <label className="flex items-center justify-between p-2 rounded-lg bg-ink-950/60 border border-white/5">
              <span className="text-slate-300">Prefeito desempata votações</span>
              <input
                type="checkbox"
                checked={config.enableMayorTiebreak}
                disabled={!isHost}
                onChange={e =>
                  onUpdateConfig({
                    enableMayorTiebreak: e.target.checked,
                    rolesCount: { ...config.rolesCount, mayor: e.target.checked ? 1 : 0 },
                  })
                }
                className="accent-amber-400 w-4 h-4"
              />
            </label>
            <label className="flex items-center justify-between p-2 rounded-lg bg-ink-950/60 border border-white/5">
              <span className="text-slate-300">Revelar papel de quem morre</span>
              <input
                type="checkbox"
                checked={config.revealRoleOnDeath}
                disabled={!isHost}
                onChange={e => onUpdateConfig({ revealRoleOnDeath: e.target.checked })}
                className="accent-amber-400 w-4 h-4"
              />
            </label>
            <label className="flex items-center justify-between p-2 rounded-lg bg-ink-950/60 border border-white/5">
              <span className="text-slate-300">Debate (segundos)</span>
              <select
                value={config.discussionDurationSeconds}
                disabled={!isHost}
                onChange={e => onUpdateConfig({ discussionDurationSeconds: Number(e.target.value) })}
                className="bg-ink-950 border border-white/10 rounded px-2 py-1 text-slate-200"
              >
                {[60, 90, 120, 180, 240, 300].map(s => (
                  <option key={s} value={s}>
                    {s}s
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center justify-between p-2 rounded-lg bg-ink-950/60 border border-white/5">
              <span className="text-slate-300">Modo de votação</span>
              <select
                value={config.votingMode}
                disabled={!isHost}
                onChange={e => onUpdateConfig({ votingMode: e.target.value as VotingMode })}
                className="bg-ink-950 border border-white/10 rounded px-2 py-1 text-slate-200"
              >
                <option value={VotingMode.SECRET}>Secreta simultânea</option>
                <option value={VotingMode.SEQUENTIAL}>Aberta em sequência (clássica)</option>
              </select>
            </label>
          </div>
        </div>

        {/* Começar */}
        <div className="bg-ink-900 border border-white/5 rounded-2xl p-3 shadow-lg space-y-2">
          <button
            onClick={onOpenRules}
            className="w-full py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 text-xs font-semibold transition-colors flex items-center justify-center gap-2"
          >
            <ScrollText className="w-3.5 h-3.5" />
            Ler as regras desta sala
          </button>
          {isHost ? (
            <button
              onClick={onStartMatch}
              disabled={!canStart}
              className="w-full py-3 px-4 rounded-xl bg-lantern-400 hover:bg-lantern-300 disabled:opacity-40 disabled:cursor-not-allowed text-ink-950 font-bold text-sm transition-colors shadow-lg shadow-lantern-500/10 flex items-center justify-center gap-2"
            >
              <Play className="w-4 h-4 fill-current" />
              Começar a partida
            </button>
          ) : (
            <div className="text-center p-2.5 rounded-xl bg-ink-950/60 border border-white/5 text-[11px] text-slate-500">
              Aguardando o anfitrião iniciar…
            </div>
          )}
          {players.length < config.minPlayers && (
            <p className="text-[11px] text-lantern-300 text-center">
              Faltam {config.minPlayers - players.length} moradores (ou complete com bots).
            </p>
          )}
        </div>
      </div>
    </div>
  );
};
