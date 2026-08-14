/**
 * Cidade Sob Suspeita 3D - Main Application
 * Modern, modular, full-stack 3D social deduction web application
 */

import React, { useState } from 'react';
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
    isConnected,
    isConnecting,
    snapshot,
    chatMessages,
    lastError,
    selectedTargetId,
    viewMode,
    createRoom,
    joinRoom,
    updateConfig,
    setReady,
    startMatch,
    confirmRole,
    submitNightAction,
    submitVote,
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

  const phase = snapshot?.room.phase || GamePhase.LOBBY;
  const isLobby = phase === GamePhase.LOBBY;
  const isRoleReveal = phase === GamePhase.ROLE_REVEAL;
  const isNight = phase === GamePhase.NIGHT_ACTIONS || phase === GamePhase.NIGHT_RESOLUTION;
  const isDawn = phase === GamePhase.DAWN;
  const isDiscussion = phase === GamePhase.DISCUSSION;
  const isVoting = phase === GamePhase.VOTING || phase === GamePhase.RUNOFF || phase === GamePhase.MAYOR_TIEBREAK;
  const isFinished = phase === GamePhase.FINISHED;

  return (
    <div className="min-h-screen bg-[#0A0B0E] text-slate-300 flex flex-col font-sans selection:bg-indigo-600 selection:text-white">
      {/* Navigation & Status Header */}
      <Navbar
        snapshot={snapshot}
        viewMode={viewMode}
        onToggleViewMode={toggleViewMode}
        onOpenNotebook={() => setIsNotebookOpen(true)}
        onOpenRules={() => setIsRulesOpen(true)}
      />

      {/* Global Error Toast */}
      {lastError && (
        <div className="fixed top-16 right-4 z-50 max-w-sm bg-[#0F1116] border border-rose-500/40 text-rose-300 p-3 rounded-lg shadow-2xl flex items-center justify-between gap-3 animate-in slide-in-from-top-2">
          <div className="flex items-center gap-2 text-xs">
            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
            <span className="font-mono text-[11px]">{lastError}</span>
          </div>
          <button onClick={dismissError} className="p-1 hover:bg-white/5 rounded text-slate-400 hover:text-white transition-colors">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Main Content Area */}
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
          />
        ) : isFinished && snapshot ? (
          <PostGameReplay snapshot={snapshot} onRestartMatch={restartMatch} />
        ) : snapshot ? (
          <div className="flex-1 max-w-7xl w-full mx-auto p-2.5 sm:p-3.5 grid grid-cols-1 lg:grid-cols-12 gap-3">
            {/* Left 8 Cols: 3D / 2D Town Square & Active Phase Action Console */}
            <div className="lg:col-span-8 flex flex-col gap-3">
              {/* Town Plaza Canvas (3D or 2D) */}
              <div className="flex-1 min-h-[380px] lg:min-h-[460px] bg-[#0F1116] border border-white/5 rounded-lg overflow-hidden relative shadow-inner">
                {viewMode === '3D' ? (
                  <TownSquare3D
                    players={snapshot.room.players}
                    localPlayerId={snapshot.player.id}
                    phase={snapshot.room.phase}
                    selectedTargetId={selectedTargetId}
                    onSelectPlayer={setSelectedTargetId}
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
              </div>

              {/* Dynamic Phase Action Bar */}
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

              {isVoting && (
                <VotingPanel
                  snapshot={snapshot}
                  selectedTargetId={selectedTargetId}
                  onSubmitVote={submitVote}
                />
              )}
            </div>

            {/* Right 4 Cols: Social Chat & Speaker Queue */}
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
          <div className="flex-1 flex items-center justify-center text-slate-500 font-mono text-xs tracking-wider">
            {isConnecting ? 'CONECTANDO AO PROTOCOLO...' : 'CARREGANDO AMBIENTE...'}
          </div>
        )}
      </main>

      {/* Role Reveal Modal (at match start) */}
      {isRoleReveal && snapshot && (
        <RoleRevealModal
          role={snapshot.player.role}
          isMayor={snapshot.player.isMayor}
          hasConfirmed={snapshot.player.hasConfirmedRole}
          onConfirm={confirmRole}
        />
      )}

      {/* Detective Notebook Modal */}
      {snapshot?.player.role === 'DETETIVE' && (
        <DetectiveNotebook
          entries={snapshot.player.investigationLog || []}
          isOpen={isNotebookOpen}
          onClose={() => setIsNotebookOpen(false)}
        />
      )}

      {/* Rule Summary Modal */}
      <RuleSummaryModal isOpen={isRulesOpen} onClose={() => setIsRulesOpen(false)} />
    </div>
  );
}
