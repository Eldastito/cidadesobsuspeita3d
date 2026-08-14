/**
 * Cidade Sob Suspeita 3D - Lobby View (High Density Theme)
 * Room Creation, Room Joining, Player Deck Balancing, and Bot Fillers
 */

import React, { useState } from 'react';
import {
  Bot,
  CheckCircle,
  Copy,
  Crown,
  Play,
  Plus,
  RefreshCw,
  Settings,
  Shield,
  Trash2,
  UserCheck,
  Users,
} from 'lucide-react';
import { PrivatePlayerSnapshot, Role, RoomConfig } from '../../engine/types.ts';
import { getRecommendedRoles, ROLE_METADATA } from '../../engine/rules.ts';

interface LobbyViewProps {
  snapshot: PrivatePlayerSnapshot | null;
  onCreateRoom: (nickname: string, avatarId: string, config?: Partial<RoomConfig>) => void;
  onJoinRoom: (roomCode: string, nickname: string, avatarId: string) => void;
  onUpdateConfig: (config: RoomConfig) => void;
  onSetReady: (isReady: boolean) => void;
  onStartMatch: () => void;
  onFillBots: (count: number) => void;
  onRemoveBots: () => void;
}

const AVATAR_OPTIONS = [
  { id: 'avatar-1', emoji: '🕵️', label: 'Detetive' },
  { id: 'avatar-2', emoji: '🧑‍⚕️', label: 'Médico' },
  { id: 'avatar-3', emoji: '🧙‍♀️', label: 'Bruxa' },
  { id: 'avatar-4', emoji: '🤵', label: 'Cidadão' },
  { id: 'avatar-5', emoji: '🎭', label: 'Misterioso' },
  { id: 'avatar-6', emoji: '👑', label: 'Prefeito' },
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
}) => {
  const [nickname, setNickname] = useState('Agente ' + Math.floor(10 + Math.random() * 90));
  const [selectedAvatar, setSelectedAvatar] = useState('avatar-1');
  const [joinCode, setJoinCode] = useState('');
  const [copied, setCopied] = useState(false);

  // If not inside a room yet: Landing Screen
  if (!snapshot) {
    return (
      <div className="min-h-[calc(100vh-60px)] flex items-center justify-center p-3 sm:p-4 bg-[#0A0B0E]">
        <div className="w-full max-w-md bg-[#0F1116] border border-white/5 rounded-lg p-5 sm:p-6 shadow-2xl space-y-5">
          {/* Header Title */}
          <div className="border-b border-white/5 pb-4">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-8 h-8 bg-indigo-600 rounded flex items-center justify-center shadow-sm">
                <div className="w-3.5 h-3.5 border-2 border-white rotate-45"></div>
              </div>
              <div>
                <h1 className="text-sm font-bold text-white tracking-tight">CIDADE SOB SUSPEITA</h1>
                <p className="text-[10px] text-slate-500 uppercase tracking-widest">
                  Game Session Initialization
                </p>
              </div>
            </div>
            <p className="text-xs text-slate-400">
              Protocolo de dedução social em tempo real. Crie uma nova sala ou acesse via código de sessão.
            </p>
          </div>

          {/* Nickname Input */}
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1.5 font-mono">
              IDENTIFICADOR DE JOGADOR
            </label>
            <input
              type="text"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              placeholder="Digite seu codinome"
              maxLength={20}
              className="w-full px-3 py-2 bg-black/40 border border-white/10 rounded text-xs font-mono text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500 transition-colors"
            />
          </div>

          {/* Avatar Selector */}
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1.5 font-mono">
              SELEÇÃO DE AVATAR
            </label>
            <div className="grid grid-cols-6 gap-2">
              {AVATAR_OPTIONS.map((av) => (
                <button
                  key={av.id}
                  onClick={() => setSelectedAvatar(av.id)}
                  title={av.label}
                  className={`p-2 rounded border transition-all flex items-center justify-center text-xl ${
                    selectedAvatar === av.id
                      ? 'bg-indigo-500/20 border-indigo-500 ring-1 ring-indigo-500'
                      : 'bg-black/30 border-white/5 hover:border-white/20'
                  }`}
                >
                  {av.emoji}
                </button>
              ))}
            </div>
          </div>

          {/* Primary Action Buttons */}
          <div className="space-y-3 pt-2">
            <button
              onClick={() => onCreateRoom(nickname, selectedAvatar)}
              disabled={!nickname.trim()}
              className="w-full py-2.5 px-4 rounded bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white font-bold text-xs uppercase tracking-wider transition-colors shadow-sm flex items-center justify-center gap-2"
            >
              <Plus className="w-3.5 h-3.5" />
              CRIAR NOVA SESSÃO
            </button>

            <div className="relative flex py-1 items-center">
              <div className="flex-grow border-t border-white/5"></div>
              <span className="flex-shrink mx-3 text-[10px] font-mono uppercase tracking-widest text-slate-600">
                OU ACESSAR CÓDIGO
              </span>
              <div className="flex-grow border-t border-white/5"></div>
            </div>

            <div className="flex gap-2">
              <input
                type="text"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                placeholder="CÓDIGO (EX: ABCD)"
                maxLength={8}
                className="flex-1 px-3 py-2 bg-black/40 border border-white/10 rounded text-xs font-mono uppercase text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500"
              />
              <button
                onClick={() => onJoinRoom(joinCode, nickname, selectedAvatar)}
                disabled={!joinCode.trim() || !nickname.trim()}
                className="px-4 py-2 rounded bg-white/5 hover:bg-white/10 disabled:opacity-40 text-slate-200 border border-white/10 font-mono font-bold text-xs uppercase tracking-wider transition-colors"
              >
                ENTRAR
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Inside Active Lobby Screen
  const isHost = snapshot.player.isHost;
  const players = snapshot.room.players;
  const config = snapshot.room.config;
  const recommendedRoles = getRecommendedRoles(players.length);
  const canStart = players.length >= config.minPlayers && players.every(p => p.isReady);

  const handleCopy = () => {
    navigator.clipboard.writeText(snapshot.room.roomCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="max-w-7xl mx-auto p-3 sm:p-4 space-y-3">
      {/* Top Banner: Room Code & Status Bar */}
      <div className="bg-[#0F1116] border border-white/5 rounded-lg p-3 sm:p-4 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-lg">
            🏰
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-slate-500">
                SESSÃO DE ESPERA
              </span>
              <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[10px] font-mono font-bold">
                {players.length}/{config.maxPlayers} CIDADÃOS
              </span>
            </div>
            <p className="text-xs text-slate-300 font-medium mt-0.5">
              Aguardando confirmação de prontidão de todos os jogadores para iniciar
            </p>
          </div>
        </div>

        {/* Room Code Badge */}
        <div className="flex items-center gap-2">
          <div className="px-3 py-1.5 bg-black/40 border border-white/10 rounded flex items-center gap-2">
            <span className="text-[10px] font-mono uppercase text-slate-500">CÓDIGO:</span>
            <span className="text-sm font-mono font-bold text-amber-400 tracking-widest">
              {snapshot.room.roomCode}
            </span>
          </div>
          <button
            onClick={handleCopy}
            title="Copiar código da sala"
            className="p-2 bg-white/5 hover:bg-white/10 text-slate-300 rounded border border-white/10 transition-colors"
          >
            {copied ? <CheckCircle className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Main Grid: Player Registry & Role Composition */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
        {/* Left 8 Cols: Player Registry */}
        <div className="lg:col-span-8 bg-[#0F1116] border border-white/5 rounded-lg flex flex-col overflow-hidden">
          <div className="p-3 border-b border-white/5 flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500 flex items-center gap-2">
              <Users className="w-3.5 h-3.5 text-indigo-400" />
              REGISTRO DE CIDADÃOS ({players.length})
            </span>

            {/* Ready Toggle */}
            <button
              onClick={() => onSetReady(!snapshot.player.isHost ? !players.find(p => p.id === snapshot.player.id)?.isReady : true)}
              className={`px-3 py-1 rounded text-xs font-mono font-bold uppercase tracking-wider transition-colors flex items-center gap-1.5 ${
                players.find(p => p.id === snapshot.player.id)?.isReady
                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                  : 'bg-white/5 text-slate-300 border border-white/10 hover:bg-white/10'
              }`}
            >
              <UserCheck className="w-3.5 h-3.5" />
              {players.find(p => p.id === snapshot.player.id)?.isReady ? 'CONFIRMADO' : 'CONFIRMAR PRONTO'}
            </button>
          </div>

          {/* Grid of Players */}
          <div className="p-3 grid grid-cols-1 sm:grid-cols-2 gap-2 flex-1">
            {players.map((p, idx) => (
              <div
                key={p.id}
                className="p-2.5 bg-black/30 border border-white/5 hover:border-white/10 rounded flex items-center justify-between transition-colors"
              >
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded bg-white/5 border border-white/10 flex items-center justify-center text-sm font-mono text-slate-300">
                    {p.isBot ? '🤖' : '👤'}
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-bold text-white tracking-tight">{p.nickname}</span>
                      {p.isHost && (
                        <span title="Anfitrião" className="text-amber-400">
                          <Crown className="w-3 h-3" />
                        </span>
                      )}
                    </div>
                    <span className="text-[10px] text-slate-500 font-mono">
                      #{p.seatNumber < 9 ? `0${p.seatNumber + 1}` : p.seatNumber + 1} {p.isBot ? '• BOT_AI' : '• LOCAL'}
                    </span>
                  </div>
                </div>

                <div>
                  {p.isReady ? (
                    <span className="px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[9px] font-mono font-bold uppercase">
                      PRONTO
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded bg-white/5 border border-white/5 text-slate-500 text-[9px] font-mono uppercase">
                      AGUARDANDO
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Bot Fill Testing Bar */}
          {isHost && (
            <div className="p-2.5 bg-black/40 border-t border-white/5 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1 text-[10px] font-mono uppercase tracking-wider text-slate-500">
                <Bot className="w-3 h-3 text-indigo-400" />
                SIMULAÇÃO DE BOTS:
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => onFillBots(Math.max(1, 6 - players.length))}
                  disabled={players.length >= 6}
                  className="px-2.5 py-1 rounded bg-white/5 hover:bg-white/10 border border-white/10 disabled:opacity-30 text-[10px] font-mono font-bold text-slate-300 transition-colors"
                >
                  + PREENCHER 6
                </button>
                <button
                  onClick={() => onFillBots(Math.max(1, 8 - players.length))}
                  disabled={players.length >= 8}
                  className="px-2.5 py-1 rounded bg-white/5 hover:bg-white/10 border border-white/10 disabled:opacity-30 text-[10px] font-mono font-bold text-slate-300 transition-colors"
                >
                  + PREENCHER 8
                </button>
                {players.some(p => p.isBot) && (
                  <button
                    onClick={onRemoveBots}
                    className="px-2.5 py-1 rounded bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 text-[10px] font-mono font-bold transition-colors flex items-center gap-1"
                  >
                    <Trash2 className="w-3 h-3" />
                    LIMPAR BOTS
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Right 4 Cols: Role Composition & Start Button */}
        <div className="lg:col-span-4 bg-[#0F1116] border border-white/5 rounded-lg flex flex-col justify-between overflow-hidden">
          <div>
            <div className="p-3 border-b border-white/5">
              <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500 flex items-center gap-2">
                <Shield className="w-3.5 h-3.5 text-indigo-400" />
                COMPOSIÇÃO DE PAPÉIS
              </span>
            </div>

            {/* List of Roles in this match */}
            <div className="p-3 space-y-1.5 font-mono text-[11px]">
              <div className="p-2 rounded bg-rose-500/5 border border-rose-500/20 flex items-center justify-between">
                <span className="text-rose-300 flex items-center gap-1.5">
                  <span>🔪</span> {ROLE_METADATA[Role.ASSASSINO].name}
                </span>
                <span className="font-bold text-rose-400 font-mono">{config.rolesCount.assassins}x</span>
              </div>

              <div className="p-2 rounded bg-emerald-500/5 border border-emerald-500/20 flex items-center justify-between">
                <span className="text-emerald-300 flex items-center gap-1.5">
                  <span>🧑‍⚕️</span> {ROLE_METADATA[Role.MEDICO].name}
                </span>
                <span className="font-bold text-emerald-400 font-mono">{config.rolesCount.doctor}x</span>
              </div>

              <div className="p-2 rounded bg-indigo-500/5 border border-indigo-500/20 flex items-center justify-between">
                <span className="text-indigo-300 flex items-center gap-1.5">
                  <span>🔍</span> {ROLE_METADATA[Role.DETETIVE].name}
                </span>
                <span className="font-bold text-indigo-400 font-mono">{config.rolesCount.detective}x</span>
              </div>

              <div className="p-2 rounded bg-purple-500/5 border border-purple-500/20 flex items-center justify-between">
                <span className="text-purple-300 flex items-center gap-1.5">
                  <span>🧙‍♀️</span> {ROLE_METADATA[Role.BRUXA].name}
                </span>
                <span className="font-bold text-purple-400 font-mono">{config.rolesCount.witch}x</span>
              </div>

              <div className="p-2 rounded bg-amber-500/5 border border-amber-500/20 flex items-center justify-between">
                <span className="text-amber-300 flex items-center gap-1.5">
                  <span>👥</span> {ROLE_METADATA[Role.CIDADAO].name}s
                </span>
                <span className="font-bold text-amber-400 font-mono">
                  {Math.max(0, players.length - (config.rolesCount.assassins + config.rolesCount.doctor + config.rolesCount.detective + config.rolesCount.witch))}x
                </span>
              </div>
            </div>
          </div>

          {/* Start Button */}
          <div className="p-3 bg-black/40 border-t border-white/5 space-y-2">
            {isHost ? (
              <button
                onClick={onStartMatch}
                disabled={!canStart}
                className="w-full py-2.5 px-4 rounded bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold text-xs uppercase tracking-wider transition-colors shadow-sm flex items-center justify-center gap-2"
              >
                <Play className="w-3.5 h-3.5 fill-white" />
                INICIAR PARTIDA
              </button>
            ) : (
              <div className="text-center p-2.5 rounded bg-black/30 border border-white/5 font-mono text-[10px] text-slate-500">
                AGUARDANDO ANFITRIÃO INICIAR...
              </div>
            )}

            {players.length < config.minPlayers && (
              <p className="text-[10px] font-mono text-amber-400 text-center">
                Mínimo de {config.minPlayers} jogadores requeridos.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

