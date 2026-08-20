/**
 * Cidade Sob Suspeita 3D — Gerenciador da cena da vila
 * Cena persistente (nunca reconstruída por snapshot), avatares com diff,
 * movimento livre do jogador local, câmera em terceira pessoa com órbita,
 * transições suaves de iluminação por fase e efeitos ambientais.
 */

import * as THREE from 'three';
import { GamePhase, PublicPlayerView } from '../engine/types.ts';
import { AvatarPose, PlayerPositionMap } from '../engine/protocol.ts';
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
  onLocalMove: (x: number, z: number, ry: number, pose: AvatarPose) => void;
  /** Notifica a UI quando há banco por perto / o jogador senta. */
  onSitHintChange?: (nearBench: boolean, sitting: boolean) => void;
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
  private lastSent = { x: NaN, z: NaN, ry: NaN, pose: AvatarPose.IDLE as AvatarPose };
  private hasLocalSpawned = false;

  // Movimentos novos: pular e sentar nos bancos
  private localPose: AvatarPose = AvatarPose.IDLE;
  private jumpVy = 0;
  private jumpY = 0;
  private nearBenchIndex = -1;
  private lastSitHint = { near: false, sitting: false };

  // Tema cosmético da praça (skin do jogo)
  private themeId = 'padrao';
  private themeGroup: THREE.Group | null = null;
  private snow: THREE.Points | null = null;

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
      this.standUp();
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

  /** Atualiza os indicadores de fala (voz ativa). */
  public setSpeakingIds(ids: ReadonlySet<string>): void {
    this.rigs.forEach((rig, id) => rig.setSpeaking(ids.has(id)));
  }

  /** Diagnóstico para testes E2E (posição local e banco próximo). */
  public debugState(): { x: number; z: number; nearBench: number; pose: number } {
    return {
      x: this.localPos.x,
      z: this.localPos.z,
      nearBench: this.nearBenchIndex,
      pose: this.localPose,
    };
  }

  /** Pulo do jogador local (tecla espaço ou botão de toque). */
  public requestJump(): void {
    if (!this.movementAllowed()) return;
    if (this.localPose === AvatarPose.SITTING) {
      this.standUp();
      return;
    }
    if (this.jumpY <= 0.001 && this.jumpVy === 0) {
      this.jumpVy = 5.4;
      this.localPose = AvatarPose.JUMPING;
    }
  }

  /** Sentar/levantar do banco mais próximo (tecla E ou botão de toque). */
  public toggleSit(): void {
    if (!this.movementAllowed()) return;
    if (this.localPose === AvatarPose.SITTING) {
      this.standUp();
      return;
    }
    if (this.nearBenchIndex < 0) return;
    const seat = this.village.benchSeats[this.nearBenchIndex];
    const rig = this.rigs.get(this.localPlayerId);
    if (!seat || !rig) return;

    this.localPose = AvatarPose.SITTING;
    this.localPos.set(seat.x, 0, seat.z);
    this.localRy = seat.ry;
    rig.targetPosition.set(seat.x, 0, seat.z);
    rig.targetRotationY = seat.ry;
    rig.setPose(AvatarPose.SITTING);
    this.sendLocalState(true);
  }

  private standUp(): void {
    if (this.localPose !== AvatarPose.SITTING && this.jumpY === 0) {
      this.localPose = AvatarPose.IDLE;
      return;
    }
    this.localPose = AvatarPose.IDLE;
    const rig = this.rigs.get(this.localPlayerId);
    if (rig && this.nearBenchIndex >= 0) {
      // dá um passo à frente do banco ao levantar
      const seat = this.village.benchSeats[this.nearBenchIndex];
      if (seat) {
        const nx = seat.x + Math.sin(seat.ry) * 0.8;
        const nz = seat.z + Math.cos(seat.ry) * 0.8;
        this.localPos.set(nx, 0, nz);
        rig.targetPosition.set(nx, 0, nz);
      }
      rig.setPose(AvatarPose.IDLE);
    } else {
      rig?.setPose(AvatarPose.IDLE);
    }
    this.sendLocalState(true);
  }

  /** Tema cosmético da praça (skin do jogo, escolhida pelo anfitrião). */
  public setTheme(themeId: string): void {
    if (themeId === this.themeId) return;
    this.themeId = themeId;

    if (this.themeGroup) {
      this.scene.remove(this.themeGroup);
      this.themeGroup.traverse(obj => {
        if (obj instanceof THREE.Mesh || obj instanceof THREE.Points) {
          obj.geometry?.dispose();
          const mat = obj.material as THREE.Material | THREE.Material[];
          (Array.isArray(mat) ? mat : [mat]).forEach(m => m?.dispose());
        }
      });
      this.themeGroup = null;
      this.snow = null;
    }

    if (themeId === 'junina') {
      this.themeGroup = this.buildJuninaFlags();
      this.scene.add(this.themeGroup);
    } else if (themeId === 'inverno') {
      this.themeGroup = new THREE.Group();
      this.snow = this.buildSnow();
      this.themeGroup.add(this.snow);
      this.scene.add(this.themeGroup);
    }
  }

  /** Bandeirinhas de festa junina entre os postes da praça. */
  private buildJuninaFlags(): THREE.Group {
    const group = new THREE.Group();
    const lamps = this.village.lampPositions;
    const colors = [0xef4444, 0xf59e0b, 0x22c55e, 0x3b82f6, 0xec4899, 0xfacc15];
    const flagGeo = new THREE.ConeGeometry(0.11, 0.26, 3);
    const flagsPerSpan = 8;
    const total = lamps.length * flagsPerSpan;
    const flags = new THREE.InstancedMesh(
      flagGeo,
      new THREE.MeshStandardMaterial({ roughness: 0.8, side: THREE.DoubleSide }),
      total
    );
    const dummy = new THREE.Object3D();
    let idx = 0;
    for (let i = 0; i < lamps.length; i++) {
      const a = lamps[i];
      const b = lamps[(i + 1) % lamps.length];
      for (let f = 0; f < flagsPerSpan; f++) {
        const t = (f + 0.5) / flagsPerSpan;
        const sag = Math.sin(t * Math.PI) * 0.45; // corda arqueada
        dummy.position.set(a.x + (b.x - a.x) * t, 3.7 - sag, a.z + (b.z - a.z) * t);
        dummy.rotation.set(Math.PI, 0, 0); // ponta para baixo
        dummy.updateMatrix();
        flags.setMatrixAt(idx, dummy.matrix);
        flags.setColorAt(idx, new THREE.Color(colors[idx % colors.length]));
        idx++;
      }
    }
    if (flags.instanceColor) flags.instanceColor.needsUpdate = true;
    group.add(flags);

    // Cordinhas entre os postes (ancoram visualmente as bandeirinhas)
    const cordMat = new THREE.MeshBasicMaterial({ color: 0x3a3128 });
    for (let i = 0; i < lamps.length; i++) {
      const a = lamps[i];
      const b = lamps[(i + 1) % lamps.length];
      const length = Math.hypot(b.x - a.x, b.z - a.z);
      const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, length, 4), cordMat);
      cord.position.set((a.x + b.x) / 2, 3.62, (a.z + b.z) / 2);
      cord.rotation.z = Math.PI / 2;
      cord.rotation.y = -Math.atan2(b.z - a.z, b.x - a.x);
      group.add(cord);
    }
    return group;
  }

  /** Neve caindo (tema de inverno). */
  private buildSnow(): THREE.Points {
    const count = this.quality === 'high' ? 420 : 200;
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 56;
      positions[i * 3 + 1] = Math.random() * 18;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 56;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    return new THREE.Points(
      geo,
      new THREE.PointsMaterial({ color: 0xf4f7ff, size: 0.14, transparent: true, opacity: 0.9, depthWrite: false })
    );
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
        rig = new AvatarRig(
          player.id,
          player.avatarId,
          player.seatNumber,
          visual,
          player.avatarColor,
          player.skinId
        );
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
        rig.setPose((pos[3] ?? AvatarPose.IDLE) as AvatarPose);
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
    const key = e.key.toLowerCase();
    if (key === ' ') {
      e.preventDefault();
      this.requestJump();
      return;
    }
    if (key === 'e') {
      this.toggleSit();
      return;
    }
    this.keys.add(key);
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

  /** Envia posição+pose ao servidor (throttle; `force` ignora o dedupe). */
  private sendLocalState(force = false): void {
    const now = performance.now();
    if (!force && now - this.lastSentAt < SEND_INTERVAL_MS) return;
    const changed =
      force ||
      Math.abs(this.lastSent.x - this.localPos.x) > 0.02 ||
      Math.abs(this.lastSent.z - this.localPos.z) > 0.02 ||
      Math.abs(this.lastSent.ry - this.localRy) > 0.05 ||
      this.lastSent.pose !== this.localPose;
    if (!changed) return;
    this.lastSentAt = now;
    this.lastSent = { x: this.localPos.x, z: this.localPos.z, ry: this.localRy, pose: this.localPose };
    this.opts.onLocalMove(this.localPos.x, this.localPos.z, this.localRy, this.localPose);
  }

  /** Detecta banco próximo e avisa a UI (botão "Sentar"). */
  private updateSitHint(): void {
    if (this.localPose !== AvatarPose.SITTING) {
      this.nearBenchIndex = -1;
      let best = 2.1;
      this.village.benchSeats.forEach((seat, i) => {
        const d = Math.hypot(seat.x - this.localPos.x, seat.z - this.localPos.z);
        if (d < best) {
          best = d;
          this.nearBenchIndex = i;
        }
      });
    }
    const near = this.nearBenchIndex >= 0 && this.movementAllowed();
    const sitting = this.localPose === AvatarPose.SITTING;
    if (near !== this.lastSitHint.near || sitting !== this.lastSitHint.sitting) {
      this.lastSitHint = { near, sitting };
      this.opts.onSitHintChange?.(near, sitting);
    }
  }

  private updateLocalMovement(dt: number): void {
    const rig = this.rigs.get(this.localPlayerId);
    if (!rig || !this.movementAllowed()) return;

    // Física do pulo (cosmética, local; remotos veem o salto pela pose)
    if (this.jumpVy !== 0 || this.jumpY > 0) {
      this.jumpVy -= 14 * dt;
      this.jumpY = Math.max(0, this.jumpY + this.jumpVy * dt);
      if (this.jumpY === 0 && this.jumpVy < 0) {
        this.jumpVy = 0;
        if (this.localPose === AvatarPose.JUMPING) this.localPose = AvatarPose.IDLE;
      }
      rig.verticalOffset = this.jumpY;
      this.sendLocalState();
    }

    this.updateSitHint();

    // Direção de entrada (teclado + joystick), relativa à câmera
    let ix = this.joystick.x;
    let iy = this.joystick.y;
    if (this.keys.has('w') || this.keys.has('arrowup')) iy -= 1;
    if (this.keys.has('s') || this.keys.has('arrowdown')) iy += 1;
    if (this.keys.has('a') || this.keys.has('arrowleft')) ix -= 1;
    if (this.keys.has('d') || this.keys.has('arrowright')) ix += 1;

    const mag = Math.hypot(ix, iy);
    if (mag < 0.15) return;

    // Sentado: qualquer direção levanta do banco
    if (this.localPose === AvatarPose.SITTING) {
      this.standUp();
      return;
    }

    ix /= Math.max(mag, 1);
    iy /= Math.max(mag, 1);

    // Converte para o espaço do mundo usando o ângulo da câmera:
    // frente = para onde a câmera olha; direita = perpendicular
    const sin = Math.sin(this.orbitAngle);
    const cos = Math.cos(this.orbitAngle);
    const wx = ix * cos + iy * sin;
    const wz = -ix * sin + iy * cos;

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

    this.sendLocalState();
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

    // Tema de inverno clareia céu e névoa
    if (this.themeId === 'inverno') {
      (this.scene.background as THREE.Color).lerp(WINTER_TINT, 0.35);
      (this.scene.fog as THREE.FogExp2).color.lerp(WINTER_TINT, 0.35);
    }
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

    // Neve do tema de inverno
    if (this.snow) {
      const positions = this.snow.geometry.getAttribute('position') as THREE.BufferAttribute;
      for (let i = 0; i < positions.count; i++) {
        let y = positions.getY(i) - dt * (1.4 + (i % 5) * 0.2);
        if (y < 0) y = 16 + Math.random() * 2;
        positions.setY(i, y);
        positions.setX(i, positions.getX(i) + Math.sin(elapsed * 0.7 + i) * 0.003);
      }
      positions.needsUpdate = true;
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
const WINTER_TINT = new THREE.Color(0xdde6f2);

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
