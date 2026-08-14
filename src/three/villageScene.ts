/**
 * Cidade Sob Suspeita 3D — Gerenciador da cena da vila
 * Cena persistente (nunca reconstruída por snapshot), avatares com diff,
 * movimento livre do jogador local, câmera em terceira pessoa com órbita,
 * transições suaves de iluminação por fase e efeitos ambientais.
 */

import * as THREE from 'three';
import { GamePhase, PublicPlayerView } from '../engine/types.ts';
import { PlayerPositionMap } from '../engine/protocol.ts';
import { AvatarRig, AvatarVisualState } from './avatarRig.ts';
import { environmentForPhase, PhaseEnvironment } from './sceneAssets.ts';
import { buildVillage, VillageHandles } from './villageBuilder.ts';

const PLAZA_RADIUS = 12.5;
const SEAT_RADIUS = 9;
const FOUNTAIN_RADIUS = 3.3;
const MOVE_SPEED = 3.6; // m/s
const SEND_INTERVAL_MS = 100;

/** Fases em que o jogador local pode circular. */
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

const NIGHT_PHASES = new Set<GamePhase>([
  GamePhase.ROLE_REVEAL,
  GamePhase.NIGHT_ACTIONS,
  GamePhase.NIGHT_RESOLUTION,
]);

export interface VillageSceneOptions {
  onSelectPlayer: (playerId: string) => void;
  onLocalMove: (x: number, z: number, ry: number) => void;
  quality?: 'auto' | 'low' | 'high';
}

export function seatPositionFor(seatNumber: number, totalSeats: number): { x: number; z: number; ry: number } {
  const angle = (seatNumber / Math.max(totalSeats, 6)) * Math.PI * 2;
  const x = Math.sin(angle) * SEAT_RADIUS;
  const z = Math.cos(angle) * SEAT_RADIUS;
  return { x, z, ry: Math.atan2(-x, -z) }; // de frente para a fonte
}

function detectQuality(): 'low' | 'high' {
  if (typeof navigator === 'undefined') return 'high';
  const mem = (navigator as any).deviceMemory;
  const isMobile = /Android|iPhone|iPad|Mobi/i.test(navigator.userAgent);
  if (isMobile || (typeof mem === 'number' && mem <= 4)) return 'low';
  return 'high';
}

export class VillageScene {
  private container: HTMLElement;
  private opts: VillageSceneOptions;
  private quality: 'low' | 'high';

  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private ambient: THREE.AmbientLight;
  private sun: THREE.DirectionalLight;
  private village: VillageHandles;

  private rigs = new Map<string, AvatarRig>();
  private localPlayerId = '';
  private selectedTargetId: string | null = null;
  private phase: GamePhase = GamePhase.LOBBY;
  private totalSeats = 6;

  // Ambiente atual → alvo (interpolado no loop)
  private envCurrent: PhaseEnvironment;
  private envTarget: PhaseEnvironment;

  // Entrada
  private keys = new Set<string>();
  private joystick = { x: 0, y: 0 };
  private orbitAngle = 0.6;
  private orbitPitch = 0.42; // rad acima do horizonte
  private orbitDistance = 11;
  private dragging = false;
  private dragMoved = false;
  private lastPointer = { x: 0, y: 0 };
  private pinchDistance = 0;

  private localPos = new THREE.Vector3();
  private localRy = 0;
  private lastSentAt = 0;
  private lastSent = { x: NaN, z: NaN, ry: NaN };
  private hasLocalSpawned = false;

  private clock = new THREE.Clock();
  private animationFrame = 0;
  private resizeObserver: ResizeObserver;
  private disposed = false;
  private reducedMotion = false;

  constructor(container: HTMLElement, opts: VillageSceneOptions) {
    this.container = container;
    this.opts = opts;
    this.quality = opts.quality === 'auto' || !opts.quality ? detectQuality() : opts.quality;
    this.reducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;

    // Cena e câmera
    this.scene = new THREE.Scene();
    this.envCurrent = cloneEnv(environmentForPhase(GamePhase.LOBBY));
    this.envTarget = cloneEnv(this.envCurrent);
    this.scene.background = this.envCurrent.sky.clone();
    this.scene.fog = new THREE.FogExp2(this.envCurrent.fog.getHex(), this.envCurrent.fogDensity);

    this.camera = new THREE.PerspectiveCamera(
      50,
      container.clientWidth / Math.max(container.clientHeight, 1),
      0.1,
      160
    );
    this.camera.position.set(0, 12, 16);

    // Renderer
    this.renderer = new THREE.WebGLRenderer({ antialias: this.quality === 'high', alpha: false });
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, this.quality === 'high' ? 2 : 1.3));
    this.renderer.shadowMap.enabled = this.quality === 'high';
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(this.renderer.domElement);

    // Luzes
    this.ambient = new THREE.AmbientLight(this.envCurrent.ambientColor, this.envCurrent.ambientIntensity);
    this.scene.add(this.ambient);

    this.sun = new THREE.DirectionalLight(this.envCurrent.sunColor, this.envCurrent.sunIntensity);
    this.sun.position.copy(this.envCurrent.sunPosition);
    if (this.quality === 'high') {
      this.sun.castShadow = true;
      this.sun.shadow.mapSize.set(1024, 1024);
      this.sun.shadow.camera.left = -24;
      this.sun.shadow.camera.right = 24;
      this.sun.shadow.camera.top = 24;
      this.sun.shadow.camera.bottom = -24;
      this.sun.shadow.camera.far = 80;
      this.sun.shadow.bias = -0.0015;
    }
    this.scene.add(this.sun);

    // Vila
    this.village = buildVillage(this.quality);
    this.scene.add(this.village.root);

    // Entrada
    this.bindInput();

    this.resizeObserver = new ResizeObserver(entries => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) {
          this.camera.aspect = width / height;
          this.camera.updateProjectionMatrix();
          this.renderer.setSize(width, height);
        }
      }
    });
    this.resizeObserver.observe(container);

    this.animate();
  }

  // ── API pública (chamada pelo componente React) ─────────────────────────

  /**
   * Muda a fase; se um jogador foi eliminado em julgamento, agenda a
   * encenação (caminhada ao centro da praça) antes do snapshot marcá-lo morto.
   */
  public setPhase(phase: GamePhase, trialEliminatedId?: string | null): void {
    if (trialEliminatedId) {
      const rig = this.rigs.get(trialEliminatedId);
      if (rig) {
        const seatNumber = (rig.group.userData.seatNumber as number) ?? 0;
        const seat = seatPositionFor(seatNumber, this.totalSeats);
        // O palco fica entre a fonte e o assento do condenado
        const angle = Math.atan2(seat.x, seat.z);
        const stagePos = { x: Math.sin(angle) * 4.6, z: Math.cos(angle) * 4.6 };
        rig.prepareTrial(stagePos, seat);
      }
    }

    if (this.phase === phase) return;
    this.phase = phase;
    this.envTarget = cloneEnv(environmentForPhase(phase));

    // À noite todo mundo volta para o assento
    if (!this.movementAllowed()) {
      this.rigs.forEach(rig => {
        const seat = this.seatOf(rig);
        rig.targetPosition.set(seat.x, 0, seat.z);
        rig.targetRotationY = seat.ry;
      });
      const localRig = this.rigs.get(this.localPlayerId);
      if (localRig) {
        this.localPos.set(localRig.targetPosition.x, 0, localRig.targetPosition.z);
        this.localRy = localRig.targetRotationY;
      }
    }
  }

  /** Mostra um balão de reação sobre o avatar. */
  public showEmote(playerId: string, emoji: string): void {
    this.rigs.get(playerId)?.showEmote(emoji);
  }

  private lastPublicVotes = new Map<string, string | null>();

  public syncPlayers(players: PublicPlayerView[], localPlayerId: string, selectedTargetId: string | null): void {
    this.localPlayerId = localPlayerId;
    this.selectedTargetId = selectedTargetId;
    this.totalSeats = Math.max(players.length, 6);

    const seen = new Set<string>();
    const isNight = NIGHT_PHASES.has(this.phase);
    const isVotingPhase = this.phase === GamePhase.VOTING || this.phase === GamePhase.RUNOFF;

    players.forEach(player => {
      seen.add(player.id);
      const visual: AvatarVisualState = {
        nickname: player.nickname,
        isAlive: player.isAlive,
        isMayor: player.isMayor,
        isLocal: player.id === localPlayerId,
        isSelected: player.id === selectedTargetId,
        hasRaisedHand: player.hasRaisedHand,
        isSleeping: isNight && player.isAlive,
        isConnected: player.isConnected,
      };

      let rig = this.rigs.get(player.id);
      if (!rig) {
        rig = new AvatarRig(player.id, player.avatarId, player.seatNumber, visual);
        rig.group.userData.seatNumber = player.seatNumber;
        const seat = seatPositionFor(player.seatNumber, this.totalSeats);
        rig.snapTo(seat.x, seat.z, seat.ry);
        this.scene.add(rig.group);
        this.rigs.set(player.id, rig);

        if (player.id === localPlayerId && !this.hasLocalSpawned) {
          this.hasLocalSpawned = true;
          this.localPos.set(seat.x, 0, seat.z);
          this.localRy = seat.ry;
          this.orbitAngle = Math.atan2(-seat.x, -seat.z) + Math.PI;
        }
      } else {
        rig.group.userData.seatNumber = player.seatNumber;
        rig.refreshVisualState(visual);
      }

      // Voto declarado em voz alta (modo sequencial): o votante aponta o alvo
      if (isVotingPhase && player.votedTargetId !== undefined) {
        const previous = this.lastPublicVotes.get(player.id);
        if (player.votedTargetId && player.votedTargetId !== previous) {
          const targetRig = this.rigs.get(player.votedTargetId);
          if (targetRig && rig) {
            rig.pointAt(targetRig.group.position);
          }
        }
        this.lastPublicVotes.set(player.id, player.votedTargetId ?? null);
      } else if (!isVotingPhase) {
        this.lastPublicVotes.delete(player.id);
      }
    });

    // Remove quem saiu da sala
    for (const [id, rig] of this.rigs.entries()) {
      if (!seen.has(id)) {
        rig.dispose(this.scene);
        this.rigs.delete(id);
      }
    }
  }

  /** Posições cosméticas vindas do servidor (10 Hz). */
  public applyRemotePositions(positions: PlayerPositionMap): void {
    if (!this.movementAllowed()) return;
    for (const [id, pos] of Object.entries(positions)) {
      if (id === this.localPlayerId) continue; // local é autoritativo no próprio cliente
      const rig = this.rigs.get(id);
      if (rig) {
        rig.targetPosition.set(pos[0], 0, pos[1]);
        rig.targetRotationY = pos[2];
      }
    }
  }

  /** Vetor do joystick virtual (-1..1 em cada eixo). */
  public setJoystick(x: number, y: number): void {
    this.joystick.x = x;
    this.joystick.y = y;
  }

  public dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.animationFrame);
    this.resizeObserver.disconnect();
    this.unbindInput();
    this.rigs.forEach(rig => rig.dispose(this.scene));
    this.rigs.clear();
    this.renderer.dispose();
    if (this.renderer.domElement.parentElement === this.container) {
      this.container.removeChild(this.renderer.domElement);
    }
  }

  // ── Entrada: teclado, mouse/touch (órbita + seleção + pinch) ────────────

  private onKeyDown = (e: KeyboardEvent) => {
    const target = e.target as HTMLElement | null;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
    this.keys.add(e.key.toLowerCase());
  };
  private onKeyUp = (e: KeyboardEvent) => {
    this.keys.delete(e.key.toLowerCase());
  };

  private onPointerDown = (e: PointerEvent) => {
    this.dragging = true;
    this.dragMoved = false;
    this.lastPointer = { x: e.clientX, y: e.clientY };
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  };

  private onPointerMove = (e: PointerEvent) => {
    if (!this.dragging) return;
    const dx = e.clientX - this.lastPointer.x;
    const dy = e.clientY - this.lastPointer.y;
    if (Math.abs(dx) + Math.abs(dy) > 4) this.dragMoved = true;
    this.lastPointer = { x: e.clientX, y: e.clientY };
    this.orbitAngle -= dx * 0.006;
    this.orbitPitch = clamp(this.orbitPitch + dy * 0.004, 0.15, 1.15);
  };

  private onPointerUp = (e: PointerEvent) => {
    const wasDrag = this.dragMoved;
    this.dragging = false;
    if (!wasDrag) this.handleSelect(e.clientX, e.clientY);
  };

  private onWheel = (e: WheelEvent) => {
    e.preventDefault();
    this.orbitDistance = clamp(this.orbitDistance + e.deltaY * 0.012, 5, 20);
  };

  private onTouchMove = (e: TouchEvent) => {
    if (e.touches.length === 2) {
      const d = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      if (this.pinchDistance > 0) {
        this.orbitDistance = clamp(this.orbitDistance - (d - this.pinchDistance) * 0.03, 5, 20);
      }
      this.pinchDistance = d;
    }
  };
  private onTouchEnd = () => {
    this.pinchDistance = 0;
  };

  private bindInput(): void {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    const el = this.renderer.domElement;
    el.addEventListener('pointerdown', this.onPointerDown);
    el.addEventListener('pointermove', this.onPointerMove);
    el.addEventListener('pointerup', this.onPointerUp);
    el.addEventListener('wheel', this.onWheel, { passive: false });
    el.addEventListener('touchmove', this.onTouchMove, { passive: true });
    el.addEventListener('touchend', this.onTouchEnd);
    el.style.touchAction = 'none';
  }

  private unbindInput(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    const el = this.renderer.domElement;
    el.removeEventListener('pointerdown', this.onPointerDown);
    el.removeEventListener('pointermove', this.onPointerMove);
    el.removeEventListener('pointerup', this.onPointerUp);
    el.removeEventListener('wheel', this.onWheel);
    el.removeEventListener('touchmove', this.onTouchMove);
    el.removeEventListener('touchend', this.onTouchEnd);
  }

  private raycaster = new THREE.Raycaster();
  private pointerVec = new THREE.Vector2();

  private handleSelect(clientX: number, clientY: number): void {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointerVec.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    this.pointerVec.y = -((clientY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(this.pointerVec, this.camera);
    const rigGroups = Array.from(this.rigs.values()).map(r => r.group);
    const hits = this.raycaster.intersectObjects(rigGroups, true);

    for (const hit of hits) {
      let cur: THREE.Object3D | null = hit.object;
      while (cur) {
        if (cur.userData?.playerId) {
          this.opts.onSelectPlayer(cur.userData.playerId);
          return;
        }
        cur = cur.parent;
      }
    }
  }

  // ── Loop principal ──────────────────────────────────────────────────────

  private movementAllowed(): boolean {
    return MOVEMENT_PHASES.has(this.phase);
  }

  private seatOf(rig: AvatarRig): { x: number; z: number; ry: number } {
    const seatNumber = (rig.group.userData.seatNumber as number) ?? 0;
    return seatPositionFor(seatNumber, this.totalSeats);
  }

  private updateLocalMovement(dt: number): void {
    const rig = this.rigs.get(this.localPlayerId);
    if (!rig || !this.movementAllowed()) return;

    // Direção de entrada (teclado + joystick), relativa à câmera
    let ix = this.joystick.x;
    let iy = this.joystick.y;
    if (this.keys.has('w') || this.keys.has('arrowup')) iy -= 1;
    if (this.keys.has('s') || this.keys.has('arrowdown')) iy += 1;
    if (this.keys.has('a') || this.keys.has('arrowleft')) ix -= 1;
    if (this.keys.has('d') || this.keys.has('arrowright')) ix += 1;

    const mag = Math.hypot(ix, iy);
    if (mag < 0.15) return;
    ix /= Math.max(mag, 1);
    iy /= Math.max(mag, 1);

    // Converte para o espaço do mundo usando o ângulo da câmera
    const sin = Math.sin(this.orbitAngle);
    const cos = Math.cos(this.orbitAngle);
    const wx = ix * cos - iy * sin;
    const wz = -ix * sin - iy * cos;

    let nx = this.localPos.x + wx * MOVE_SPEED * dt;
    let nz = this.localPos.z + wz * MOVE_SPEED * dt;

    // Limites: borda da praça e fonte central
    const dist = Math.hypot(nx, nz);
    if (dist > PLAZA_RADIUS) {
      nx = (nx / dist) * PLAZA_RADIUS;
      nz = (nz / dist) * PLAZA_RADIUS;
    }
    if (Math.hypot(nx, nz) < FOUNTAIN_RADIUS) {
      const a = Math.atan2(nx, nz);
      nx = Math.sin(a) * FOUNTAIN_RADIUS;
      nz = Math.cos(a) * FOUNTAIN_RADIUS;
    }

    this.localPos.set(nx, 0, nz);
    this.localRy = Math.atan2(wx, wz);
    rig.targetPosition.set(nx, 0, nz);
    rig.targetRotationY = this.localRy;

    // Envia ao servidor (throttle + dedupe)
    const now = performance.now();
    if (now - this.lastSentAt >= SEND_INTERVAL_MS) {
      if (
        Math.abs(this.lastSent.x - nx) > 0.02 ||
        Math.abs(this.lastSent.z - nz) > 0.02 ||
        Math.abs(this.lastSent.ry - this.localRy) > 0.05
      ) {
        this.lastSentAt = now;
        this.lastSent = { x: nx, z: nz, ry: this.localRy };
        this.opts.onLocalMove(nx, nz, this.localRy);
      }
    }
  }

  private updateCamera(dt: number): void {
    const rig = this.rigs.get(this.localPlayerId);
    const focus = rig ? rig.group.position : ORIGIN;

    // Sem jogador local ainda: órbita cinematográfica lenta da praça
    if (!rig) {
      this.orbitAngle += dt * 0.05;
    }

    const pitch = this.orbitPitch;
    const dist = rig ? this.orbitDistance : 18;
    const cx = focus.x + Math.sin(this.orbitAngle) * Math.cos(pitch) * dist;
    const cz = focus.z + Math.cos(this.orbitAngle) * Math.cos(pitch) * dist;
    const cy = 1.4 + Math.sin(pitch) * dist;

    const lerp = Math.min(1, dt * 5);
    this.camera.position.x += (cx - this.camera.position.x) * lerp;
    this.camera.position.y += (cy - this.camera.position.y) * lerp;
    this.camera.position.z += (cz - this.camera.position.z) * lerp;
    this.camera.lookAt(focus.x, 1.2, focus.z);
  }

  private updateEnvironment(dt: number): void {
    const k = Math.min(1, dt * (this.reducedMotion ? 10 : 0.9));
    const cur = this.envCurrent;
    const tgt = this.envTarget;

    cur.sky.lerp(tgt.sky, k);
    cur.fog.lerp(tgt.fog, k);
    cur.fogDensity += (tgt.fogDensity - cur.fogDensity) * k;
    cur.ambientColor.lerp(tgt.ambientColor, k);
    cur.ambientIntensity += (tgt.ambientIntensity - cur.ambientIntensity) * k;
    cur.sunColor.lerp(tgt.sunColor, k);
    cur.sunIntensity += (tgt.sunIntensity - cur.sunIntensity) * k;
    cur.sunPosition.lerp(tgt.sunPosition, k);
    cur.lanternIntensity += (tgt.lanternIntensity - cur.lanternIntensity) * k;
    cur.starsOpacity += (tgt.starsOpacity - cur.starsOpacity) * k;
    cur.moonOpacity += (tgt.moonOpacity - cur.moonOpacity) * k;
    cur.sunSpriteOpacity += (tgt.sunSpriteOpacity - cur.sunSpriteOpacity) * k;
    cur.windowGlow += (tgt.windowGlow - cur.windowGlow) * k;
    cur.firefliesOpacity += (tgt.firefliesOpacity - cur.firefliesOpacity) * k;

    (this.scene.background as THREE.Color).copy(cur.sky);
    (this.scene.fog as THREE.FogExp2).color.copy(cur.fog);
    (this.scene.fog as THREE.FogExp2).density = cur.fogDensity;
    this.ambient.color.copy(cur.ambientColor);
    this.ambient.intensity = cur.ambientIntensity;
    this.sun.color.copy(cur.sunColor);
    this.sun.intensity = cur.sunIntensity;
    this.sun.position.copy(cur.sunPosition);

    const v = this.village;
    (v.stars.material as THREE.PointsMaterial).opacity = cur.starsOpacity;
    (v.moon.material as THREE.MeshBasicMaterial).opacity = cur.moonOpacity;
    (v.sunSprite.material as THREE.MeshBasicMaterial).opacity = cur.sunSpriteOpacity;
    (v.fireflies.material as THREE.PointsMaterial).opacity = cur.firefliesOpacity;
    v.windowMaterials.forEach(m => (m.emissiveIntensity = cur.windowGlow));
    v.lanternMaterials.forEach(m => (m.emissiveIntensity = 0.15 + cur.lanternIntensity));
    v.lanternLights.forEach(l => (l.intensity = cur.lanternIntensity * 1.4));
  }

  private updateAmbientEffects(elapsed: number, dt: number): void {
    const v = this.village;

    // Fonte: água girando + orbe pulsante
    v.fountainWater.rotation.y += dt * 0.4;
    v.fountainWater.position.y = 0.74 + Math.sin(elapsed * 2.4) * 0.015;
    v.fountainOrb.position.y = 3.15 + Math.sin(elapsed * 1.8) * 0.09;
    v.fountainOrb.rotation.y += dt * 0.6;
    v.fountainLight.intensity = 1.1 + this.envCurrent.lanternIntensity + Math.sin(elapsed * 5) * 0.12;

    // Nuvens à deriva
    if (!this.reducedMotion) {
      v.clouds.forEach((cloud, i) => {
        cloud.position.x += dt * (0.25 + i * 0.06);
        if (cloud.position.x > 48) cloud.position.x = -48;
      });

      // Vagalumes serpenteando
      if (this.envCurrent.firefliesOpacity > 0.02) {
        const positions = v.fireflies.geometry.getAttribute('position') as THREE.BufferAttribute;
        for (let i = 0; i < positions.count; i++) {
          const y = positions.getY(i);
          positions.setY(i, y + Math.sin(elapsed * 1.4 + i * 1.7) * 0.004);
          positions.setX(i, positions.getX(i) + Math.cos(elapsed * 0.8 + i * 2.3) * 0.004);
        }
        positions.needsUpdate = true;
        (v.fireflies.material as THREE.PointsMaterial).size = 0.13 + Math.sin(elapsed * 3) * 0.05;
      }

      // Estrelas cintilando
      if (this.envCurrent.starsOpacity > 0.02) {
        (v.stars.material as THREE.PointsMaterial).opacity =
          this.envCurrent.starsOpacity * (0.82 + Math.sin(elapsed * 1.1) * 0.18);
      }
    }
  }

  private animate = (): void => {
    if (this.disposed) return;
    this.animationFrame = requestAnimationFrame(this.animate);

    const dt = Math.min(this.clock.getDelta(), 0.1);
    const elapsed = this.clock.elapsedTime;

    this.updateLocalMovement(dt);
    this.rigs.forEach(rig => rig.update(dt, elapsed));
    this.updateCamera(dt);
    this.updateEnvironment(dt);
    this.updateAmbientEffects(elapsed, dt);

    this.renderer.render(this.scene, this.camera);
  };
}

const ORIGIN = new THREE.Vector3(0, 0, 0);

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function cloneEnv(env: PhaseEnvironment): PhaseEnvironment {
  return {
    sky: env.sky.clone(),
    fog: env.fog.clone(),
    fogDensity: env.fogDensity,
    ambientColor: env.ambientColor.clone(),
    ambientIntensity: env.ambientIntensity,
    sunColor: env.sunColor.clone(),
    sunIntensity: env.sunIntensity,
    sunPosition: env.sunPosition.clone(),
    lanternIntensity: env.lanternIntensity,
    starsOpacity: env.starsOpacity,
    moonOpacity: env.moonOpacity,
    sunSpriteOpacity: env.sunSpriteOpacity,
    windowGlow: env.windowGlow,
    firefliesOpacity: env.firefliesOpacity,
  };
}
