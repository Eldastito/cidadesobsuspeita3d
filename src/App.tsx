/**
 * Cidade Sob Suspeita 3D — Aplicação principal
 * Praça 3D imersiva + trilhos de fase, legenda do narrador e chat social.
 */

import React, { useEffect, useState } from 'react';
import { GamePhase } from './engine/types.ts';
import { useGameClient } from './services/gameClient.ts';
import { Navbar } from './components/Navigation/Navbar.tsx';
import { LobbyView } from './components/Lobby/LobbyView.tsx';
import { TownSquare3D } from './components/3D/TownSquare3D.tsx';
import { TownSquare2D } from './components/2D/TownSquare2D.tsx';
import { RoleRevealModal } from './components/PhaseModals/RoleRevealModal.tsx';
import { NightActionPanel } from './components/PhaseModals/NightActionPanel.tsx';
import { DawnAnnouncement } from './components/PhaseModals/DawnAnnouncement.tsx';
import { VotingPanel } from './components/PhaseModals/VotingPanel.tsx';
import { ChatDrawer } from './components/Chat/ChatDrawer.tsx';
import { DetectiveNotebook } from './components/Notebook/DetectiveNotebook.tsx';
import { PostGameReplay } from './components/Timeline/PostGameReplay.tsx';
import { RuleSummaryModal } from './components/Rules/RuleSummaryModal.tsx';
import { AlertTriangle, X } from 'lucide-react';

export default function App() {
  const {
    isConnecting,
    snapshot,
    chatMessages,
    lastError,
    selectedTargetId,
    viewMode,
    narratorCaption,
    movementBus,
    createRoom,
    joinRoom,
    leaveRoom,
    updateConfig,
    setReady,
    startMatch,
    confirmRole,
    submitNightAction,
    submitVote,
    submitMayorTiebreak,
    toggleHandRaise,
    sendChat,
    fillBots,
    removeBots,
    restartMatch,
    setSelectedTargetId,
    toggleViewMode,
    dismissError,
  } = useGameClient();

  const [isNotebookOpen, setIsNotebookOpen] = useState(false);
  const [isRulesOpen, setIsRulesOpen] = useState(false);
  const [captionVisible, setCaptionVisible] = useState(false);

  // Legenda do narrador aparece por alguns segundos (acessível sem áudio)
  useEffect(() => {
    if (!narratorCaption) return;
    setCaptionVisible(true);
    const timeout = setTimeout(() => setCaptionVisible(false), 6500);
    return () => clearTimeout(timeout);
  }, [narratorCaption]);

  const phase = snapshot?.room.phase || GamePhase.LOBBY;
  const isLobby = phase === GamePhase.LOBBY;
  const isRoleReveal = phase === GamePhase.ROLE_REVEAL;
  const isNight = phase === GamePhase.NIGHT_ACTIONS || phase === GamePhase.NIGHT_RESOLUTION;
  const isDawn = phase === GamePhase.DAWN;
  const isVotingLike =
    phase === GamePhase.VOTING || phase === GamePhase.RUNOFF || phase === GamePhase.MAYOR_TIEBREAK;
  const isDayResolution = phase === GamePhase.DAY_RESOLUTION;
  const isFinished = phase === GamePhase.FINISHED;

  // Eliminado do julgamento (para a encenação na praça 3D)
  const eliminatedPlayerId = isDayResolution
    ? snapshot?.room.lastVotingSummary?.eliminatedPlayerId ?? null
    : null;

  return (
    <div className="min-h-screen text-slate-300 flex flex-col selection:bg-lantern-400 selection:text-ink-950">
      <Navbar
        snapshot={snapshot}
        viewMode={viewMode}
        onToggleViewMode={toggleViewMode}
        onOpenNotebook={() => setIsNotebookOpen(true)}
        onOpenRules={() => setIsRulesOpen(true)}
        onLeaveRoom={leaveRoom}
      />

      {/* Erros do servidor */}
      {lastError && (
        <div className="fixed top-16 right-4 z-50 max-w-sm bg-ink-900 border border-rose-500/40 text-rose-300 p-3 rounded-xl shadow-2xl flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs">
            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{lastError}</span>
          </div>
          <button
            onClick={dismissError}
            aria-label="Fechar aviso"
            className="p-1 hover:bg-white/5 rounded text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      <main className="flex-1 flex flex-col overflow-hidden">
        {isLobby ? (
          <LobbyView
            snapshot={snapshot}
            onCreateRoom={createRoom}
            onJoinRoom={joinRoom}
            onUpdateConfig={updateConfig}
            onSetReady={setReady}
            onStartMatch={startMatch}
            onFillBots={fillBots}
            onRemoveBots={removeBots}
            onOpenRules={() => setIsRulesOpen(true)}
            movementBus={movementBus}
            viewMode={viewMode}
            selectedTargetId={selectedTargetId}
            onSelectPlayer={setSelectedTargetId}
          />
        ) : isFinished && snapshot ? (
          <PostGameReplay snapshot={snapshot} onRestartMatch={restartMatch} />
        ) : snapshot ? (
          <div className="flex-1 max-w-7xl w-full mx-auto p-2.5 sm:p-3.5 grid grid-cols-1 lg:grid-cols-12 gap-3">
            {/* Coluna principal: praça 3D/2D + console da fase */}
            <div className="lg:col-span-8 flex flex-col gap-3">
              <div className="flex-1 min-h-[380px] lg:min-h-[460px] bg-ink-900 border border-white/5 rounded-2xl overflow-hidden relative shadow-2xl">
                {viewMode === '3D' ? (
                  <TownSquare3D
                    players={snapshot.room.players}
                    localPlayerId={snapshot.player.id}
                    phase={snapshot.room.phase}
                    selectedTargetId={selectedTargetId}
                    onSelectPlayer={setSelectedTargetId}
                    movementBus={movementBus}
                    eliminatedPlayerId={eliminatedPlayerId}
                  />
                ) : (
                  <TownSquare2D
                    players={snapshot.room.players}
                    localPlayerId={snapshot.player.id}
                    phase={snapshot.room.phase}
                    selectedTargetId={selectedTargetId}
                    onSelectPlayer={setSelectedTargetId}
                  />
                )}

                {/* Legenda do narrador (acessibilidade: fase nunca depende só de áudio) */}
                {captionVisible && narratorCaption && (
                  <div
                    key={narratorCaption.key}
                    role="status"
                    className="narrator-caption absolute bottom-14 left-1/2 -translate-x-1/2 max-w-[92%] sm:max-w-md bg-ink-950/85 backdrop-blur-md border border-lantern-400/25 rounded-xl px-4 py-2 text-center pointer-events-none"
                  >
                    <span className="block text-[9px] uppercase tracking-[0.25em] text-lantern-300/80 font-bold mb-0.5">
                      Narrador
                    </span>
                    <p className="text-xs text-slate-100 leading-snug">{narratorCaption.text}</p>
                  </div>
                )}
              </div>

              {isNight && (
                <NightActionPanel
                  snapshot={snapshot}
                  selectedTargetId={selectedTargetId}
                  onSubmitAction={submitNightAction}
                />
              )}

              {isDawn && (
                <DawnAnnouncement
                  summary={snapshot.room.dawnSummary}
                  timeRemaining={snapshot.room.phaseTimeRemaining}
                />
              )}

              {(isVotingLike || isDayResolution) && (
                <VotingPanel
                  snapshot={snapshot}
                  selectedTargetId={selectedTargetId}
                  onSubmitVote={submitVote}
                  onSubmitMayorTiebreak={submitMayorTiebreak}
                />
              )}
            </div>

            {/* Coluna social: chat + fila de fala */}
            <div className="lg:col-span-4 flex flex-col h-full min-h-[420px]">
              <ChatDrawer
                snapshot={snapshot}
                messages={chatMessages}
                onSendMessage={sendChat}
                onToggleHandRaise={toggleHandRaise}
              />
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 text-slate-500">
            <div className="w-10 h-10 rounded-full border-2 border-lantern-400/30 border-t-lantern-400 animate-spin" />
            <span className="text-xs tracking-widest uppercase">
              {isConnecting ? 'Conectando à cidade…' : 'Acendendo as lamparinas…'}
            </span>
          </div>
        )}
      </main>

      {/* Revelação secreta de papel */}
      {isRoleReveal && snapshot && (
        <RoleRevealModal
          role={snapshot.player.role}
          isMayor={snapshot.player.isMayor}
          hasConfirmed={snapshot.player.hasConfirmedRole}
          onConfirm={confirmRole}
        />
      )}

      {/* Caderno do detetive */}
      {snapshot?.player.role === 'DETETIVE' && (
        <DetectiveNotebook
          entries={snapshot.player.investigationLog || []}
          isOpen={isNotebookOpen}
          onClose={() => setIsNotebookOpen(false)}
        />
      )}

      <RuleSummaryModal isOpen={isRulesOpen} onClose={() => setIsRulesOpen(false)} />
    </div>
  );
}
