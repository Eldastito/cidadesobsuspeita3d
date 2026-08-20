/**
 * Cidade Sob Suspeita 3D — Praça 3D (invólucro React da VillageScene)
 * A cena Three.js vive fora do ciclo de render do React; aqui só
 * sincronizamos props e desenhamos os controles de toque.
 */

import React, { useEffect, useRef, useState } from 'react';
import { GamePhase, PublicPlayerView } from '../../engine/types.ts';
import { MovementBus } from '../../services/gameClient.ts';
import { VillageScene } from '../../three/villageScene.ts';

interface TownSquare3DProps {
  players: PublicPlayerView[];
  localPlayerId: string;
  phase: GamePhase;
  selectedTargetId: string | null;
  onSelectPlayer: (playerId: string) => void;
  movementBus: MovementBus;
  /** Eliminado do julgamento atual (fase DAY_RESOLUTION) para a encenação. */
  eliminatedPlayerId?: string | null;
  /** Quem está falando na voz agora (indicador 🔊). */
  speakingIds?: ReadonlySet<string>;
  /** Tema cosmético da praça (skin do jogo). */
  plazaTheme?: string;
}

const EMOTES = ['👍', '👎', '😂', '😱', '🤔', '😡', '❤️', '🤫'];

const MOVEMENT_PHASES = new Set<GamePhase>([
  GamePhase.LOBBY,
  GamePhase.DAWN,
  GamePhase.DISCUSSION,
  GamePhase.VOTING,
  GamePhase.RUNOFF,
  GamePhase.MAYOR_TIEBREAK,
  GamePhase.DAY_RESOLUTION,
  GamePhase.FINISHED,
]);

export const TownSquare3D: React.FC<TownSquare3DProps> = ({
  players,
  localPlayerId,
  phase,
  selectedTargetId,
  onSelectPlayer,
  movementBus,
  eliminatedPlayerId,
  speakingIds,
  plazaTheme,
}) => {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const sceneRef = useRef<VillageScene | null>(null);
  const joystickRef = useRef<HTMLDivElement | null>(null);
  const knobRef = useRef<HTMLDivElement | null>(null);
  const [emoteCooldown, setEmoteCooldown] = useState(false);
  const [sitHint, setSitHint] = useState({ near: false, sitting: false });

  const onSelectRef = useRef(onSelectPlayer);
  onSelectRef.current = onSelectPlayer;

  // Cria a cena uma única vez
  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const scene = new VillageScene(container, {
      onSelectPlayer: id => onSelectRef.current(id),
      onLocalMove: (x, z, ry, pose) => movementBus.sendMove(x, z, ry, pose),
      onSitHintChange: (near, sitting) => setSitHint({ near, sitting }),
      quality: 'auto',
    });
    sceneRef.current = scene;
    // Gancho de diagnóstico para testes E2E
    (window as unknown as { __villageScene?: VillageScene }).__villageScene = scene;

    const unsubPositions = movementBus.subscribePositions(positions => {
      scene.applyRemotePositions(positions);
    });
    const unsubEmotes = movementBus.subscribeEmotes(({ playerId, emoji }) => {
      scene.showEmote(playerId, emoji);
    });

    return () => {
      unsubPositions();
      unsubEmotes();
      scene.dispose();
      sceneRef.current = null;
    };
  }, [movementBus]);

  // Sincroniza props → cena (diff interno, sem rebuild).
  // A fase (com o eliminado do julgamento) entra ANTES dos jogadores,
  // para a encenação ser agendada antes do snapshot marcá-lo morto.
  useEffect(() => {
    sceneRef.current?.setPhase(phase, eliminatedPlayerId);
  }, [phase, eliminatedPlayerId]);

  useEffect(() => {
    sceneRef.current?.syncPlayers(players, localPlayerId, selectedTargetId);
  }, [players, localPlayerId, selectedTargetId]);

  useEffect(() => {
    if (speakingIds) sceneRef.current?.setSpeakingIds(speakingIds);
  }, [speakingIds]);

  useEffect(() => {
    sceneRef.current?.setTheme(plazaTheme || 'padrao');
  }, [plazaTheme]);

  // Joystick virtual (toque)
  useEffect(() => {
    const pad = joystickRef.current;
    const knob = knobRef.current;
    if (!pad || !knob) return;

    let activeTouch: number | null = null;
    const RADIUS = 40;

    const setVector = (clientX: number, clientY: number) => {
      const rect = pad.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      let dx = clientX - cx;
      let dy = clientY - cy;
      const dist = Math.hypot(dx, dy);
      if (dist > RADIUS) {
        dx = (dx / dist) * RADIUS;
        dy = (dy / dist) * RADIUS;
      }
      knob.style.transform = `translate(${dx}px, ${dy}px)`;
      sceneRef.current?.setJoystick(dx / RADIUS, dy / RADIUS);
    };

    const reset = () => {
      activeTouch = null;
      knob.style.transform = 'translate(0px, 0px)';
      sceneRef.current?.setJoystick(0, 0);
    };

    const onTouchStart = (e: TouchEvent) => {
      e.preventDefault();
      const touch = e.changedTouches[0];
      activeTouch = touch.identifier;
      setVector(touch.clientX, touch.clientY);
    };
    const onTouchMove = (e: TouchEvent) => {
      if (activeTouch === null) return;
      for (const touch of Array.from(e.changedTouches)) {
        if (touch.identifier === activeTouch) {
          e.preventDefault();
          setVector(touch.clientX, touch.clientY);
        }
      }
    };
    const onTouchEnd = (e: TouchEvent) => {
      for (const touch of Array.from(e.changedTouches)) {
        if (touch.identifier === activeTouch) reset();
      }
    };

    pad.addEventListener('touchstart', onTouchStart, { passive: false });
    pad.addEventListener('touchmove', onTouchMove, { passive: false });
    pad.addEventListener('touchend', onTouchEnd);
    pad.addEventListener('touchcancel', onTouchEnd);

    return () => {
      pad.removeEventListener('touchstart', onTouchStart);
      pad.removeEventListener('touchmove', onTouchMove);
      pad.removeEventListener('touchend', onTouchEnd);
      pad.removeEventListener('touchcancel', onTouchEnd);
    };
  }, []);

  const canMove = MOVEMENT_PHASES.has(phase);
  const isTouch = typeof window !== 'undefined' && 'ontouchstart' in window;
  const localAlive = players.find(p => p.id === localPlayerId)?.isAlive ?? false;
  const canEmote = localAlive && phase !== GamePhase.NIGHT_ACTIONS && phase !== GamePhase.NIGHT_RESOLUTION;

  const handleEmote = (emoji: string) => {
    if (emoteCooldown) return;
    movementBus.sendEmote(emoji);
    setEmoteCooldown(true);
    setTimeout(() => setEmoteCooldown(false), 1500);
  };

  return (
    <div className="relative w-full h-full min-h-[380px] overflow-hidden">
      <div ref={mountRef} className="w-full h-full cursor-grab active:cursor-grabbing" />

      {/* Barra de reações (só vivos, fases diurnas) */}
      {canEmote && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 flex items-center gap-1 bg-black/40 backdrop-blur-md px-2 py-1 rounded-full border border-white/10">
          {EMOTES.map(emoji => (
            <button
              key={emoji}
              onClick={() => handleEmote(emoji)}
              disabled={emoteCooldown}
              aria-label={`Reagir com ${emoji}`}
              className="text-base sm:text-lg leading-none p-1 rounded-full hover:bg-white/10 disabled:opacity-40 transition-all hover:scale-110"
            >
              {emoji}
            </button>
          ))}
        </div>
      )}

      {/* Joystick virtual em telas de toque */}
      <div
        ref={joystickRef}
        className={`absolute bottom-5 left-5 w-24 h-24 rounded-full border-2 border-white/20 bg-black/25 backdrop-blur-sm items-center justify-center select-none ${
          isTouch && canMove ? 'flex' : 'hidden'
        }`}
        aria-label="Controle de movimento"
      >
        <div
          ref={knobRef}
          className="w-10 h-10 rounded-full bg-amber-300/70 border border-amber-200/70 shadow-lg transition-transform duration-75"
        />
      </div>

      {/* Botões de movimento (pular / sentar) */}
      {canMove && (
        <div className="absolute bottom-5 right-3 flex flex-col gap-2">
          {(sitHint.near || sitHint.sitting) && (
            <button
              onClick={() => sceneRef.current?.toggleSit()}
              className="px-3 py-2 rounded-xl bg-lantern-400/90 hover:bg-lantern-300 text-ink-950 text-xs font-bold shadow-lg backdrop-blur transition-colors"
            >
              {sitHint.sitting ? '🧍 Levantar' : '🪑 Sentar'}
              {!isTouch && <span className="opacity-60 font-normal"> (E)</span>}
            </button>
          )}
          {isTouch && !sitHint.sitting && (
            <button
              onClick={() => sceneRef.current?.requestJump()}
              aria-label="Pular"
              className="w-12 h-12 rounded-full bg-white/15 hover:bg-white/25 border border-white/25 text-xl backdrop-blur shadow-lg transition-colors"
            >
              ⬆️
            </button>
          )}
        </div>
      )}

      {/* Dica de controles */}
      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 sm:left-auto sm:translate-x-0 sm:right-20 bg-black/45 backdrop-blur-md px-3 py-1.5 rounded-lg border border-white/10 text-[11px] text-slate-300 pointer-events-none flex items-center gap-2 max-w-[92%]">
        {canMove ? (
          <span>
            {isTouch ? '🕹️ Joystick para andar' : '⌨️ WASD anda • espaço pula'} • arraste para girar •
            clique para selecionar
          </span>
        ) : (
          <span>🌙 A cidade dorme — todos voltam aos seus lugares</span>
        )}
      </div>
    </div>
  );
};
