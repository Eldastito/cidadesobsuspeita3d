/**
 * Cidade Sob Suspeita 3D — Rig procedural de avatar
 * Boneco low-poly com animações de caminhada, respiração, sono,
 * mão levantada e morte — tudo sem assets externos.
 */

import * as THREE from 'three';
import {
  avatarColorFor,
  bodyMaterial,
  hatStyleFor,
  makeEmojiSprite,
  makeNameSprite,
  makeSleepSprite,
  sharedGeometries as G,
  sharedMaterials as M,
  skinMaterial,
  skinToneFor,
} from './sceneAssets.ts';

export interface AvatarVisualState {
  nickname: string;
  isAlive: boolean;
  isMayor: boolean;
  isLocal: boolean;
  isSelected: boolean;
  hasRaisedHand: boolean;
  isSleeping: boolean;
  isConnected: boolean;
}

const WALK_EPSILON = 0.003;

export class AvatarRig {
  public readonly group: THREE.Group;
  public readonly playerId: string;

  /** Posição-alvo para interpolação (movimento remoto/local). */
  public targetPosition = new THREE.Vector3();
  public targetRotationY = 0;

  private body: THREE.Group;
  private torso: THREE.Mesh;
  private head: THREE.Group;
  private armL: THREE.Group;
  private armR: THREE.Group;
  private legL: THREE.Group;
  private legR: THREE.Group;
  private crown: THREE.Mesh | null = null;
  private selectionRing: THREE.Mesh;
  private nameSprite: THREE.Sprite | null = null;
  private sleepSprite: THREE.Sprite | null = null;

  private tombstone: THREE.Group | null = null;
  private ghost: THREE.Group | null = null;

  private state: AvatarVisualState;
  private nameKey = '';
  private walkPhase = Math.random() * Math.PI * 2;
  private idleSeed = Math.random() * Math.PI * 2;
  private walkAmount = 0; // 0 parado → 1 andando (suavizado)
  private deathProgress = -1; // -1 = sem animação; 0..1 animando queda

  // Reação (balão de emoji)
  private emoteSprite: THREE.Sprite | null = null;
  private emoteT = 0;

  // Indicador de fala (voz ativa)
  private speakingSprite: THREE.Sprite | null = null;
  private isSpeaking = false;

  // Gesto de apontar (voto declarado em voz alta)
  private pointT = 0;
  private pointTarget = new THREE.Vector3();

  // Julgamento teatral: caminhar até o centro da praça antes de cair
  private pendingTrial: { stagePos: { x: number; z: number }; seatPos: { x: number; z: number; ry: number } } | null =
    null;
  private trial: {
    stage: 'walking' | 'dying';
    stagePos: { x: number; z: number };
    seatPos: { x: number; z: number; ry: number };
  } | null = null;

  constructor(playerId: string, avatarId: string, seatNumber: number, initial: AvatarVisualState) {
    this.playerId = playerId;
    this.state = { ...initial };

    this.group = new THREE.Group();
    this.group.userData = { playerId };

    const color = avatarColorFor(seatNumber);
    const skin = skinToneFor(seatNumber);
    const bodyMat = bodyMaterial(color);
    const skinMat = skinMaterial(skin);

    // Corpo articulado
    this.body = new THREE.Group();
    this.group.add(this.body);

    this.torso = new THREE.Mesh(G.torso, bodyMat);
    this.torso.position.y = 0.95;
    this.torso.castShadow = true;
    this.body.add(this.torso);

    // Cabeça + olhos + chapéu
    this.head = new THREE.Group();
    this.head.position.y = 1.62;
    const headMesh = new THREE.Mesh(G.head, skinMat);
    headMesh.castShadow = true;
    this.head.add(headMesh);

    const eyeL = new THREE.Mesh(G.eye, M.eye);
    eyeL.position.set(-0.095, 0.03, 0.235);
    const eyeR = new THREE.Mesh(G.eye, M.eye);
    eyeR.position.set(0.095, 0.03, 0.235);
    this.head.add(eyeL, eyeR);

    this.addHat(avatarId, bodyMat);
    this.body.add(this.head);

    // Braços (pivô no ombro)
    this.armL = this.makeLimb(G.arm, bodyMat, -0.46, 1.28, 0.21);
    this.armR = this.makeLimb(G.arm, bodyMat, 0.46, 1.28, 0.21);
    // Pernas (pivô no quadril)
    this.legL = this.makeLimb(G.leg, skinMat, -0.16, 0.62, 0.2, 0x384358);
    this.legR = this.makeLimb(G.leg, skinMat, 0.16, 0.62, 0.2, 0x384358);
    this.body.add(this.armL, this.armR, this.legL, this.legR);

    // Sombra falsa (barata) + anel de seleção
    const blob = new THREE.Mesh(G.shadowBlob, M.shadowBlob);
    blob.rotation.x = -Math.PI / 2;
    blob.position.y = 0.02;
    this.group.add(blob);

    this.selectionRing = new THREE.Mesh(G.selectionRing, M.selectionRing);
    this.selectionRing.rotation.x = Math.PI / 2;
    this.selectionRing.position.y = 0.05;
    this.selectionRing.visible = false;
    this.group.add(this.selectionRing);

    this.refreshVisualState(initial, true);
  }

  private makeLimb(
    geo: THREE.BufferGeometry,
    mat: THREE.Material,
    x: number,
    y: number,
    halfLength: number,
    overrideColor?: number
  ): THREE.Group {
    const pivot = new THREE.Group();
    pivot.position.set(x, y, 0);
    const mesh = new THREE.Mesh(geo, overrideColor ? bodyMaterial(overrideColor) : mat);
    mesh.position.y = -halfLength;
    mesh.castShadow = true;
    pivot.add(mesh);
    return pivot;
  }

  private addHat(avatarId: string, bodyMat: THREE.MeshStandardMaterial): void {
    const style = hatStyleFor(avatarId);
    if (style === 'none') return;

    const hatMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(bodyMat.color).offsetHSL(0.02, -0.05, -0.12),
      roughness: 0.7,
    });

    if (style === 'cap') {
      const cap = new THREE.Mesh(G.hatCap, hatMat);
      cap.position.y = 0.24;
      const brim = new THREE.Mesh(G.hatBrim, hatMat);
      brim.position.set(0, 0.17, 0.12);
      this.head.add(cap, brim);
    } else if (style === 'wizard') {
      const cone = new THREE.Mesh(G.hatWizard, hatMat);
      cone.position.y = 0.42;
      cone.rotation.z = 0.08;
      this.head.add(cone);
    } else if (style === 'straw') {
      const brim = new THREE.Mesh(G.hatBrim, hatMat);
      brim.position.y = 0.18;
      const top = new THREE.Mesh(G.hatStraw, hatMat);
      top.position.y = 0.28;
      this.head.add(brim, top);
    } else if (style === 'tophat') {
      const brim = new THREE.Mesh(G.hatBrim, hatMat);
      brim.position.y = 0.16;
      const top = new THREE.Mesh(G.hatTop, hatMat);
      top.position.y = 0.34;
      this.head.add(brim, top);
    } else if (style === 'hood') {
      const hood = new THREE.Mesh(G.hood, hatMat);
      hood.position.y = 0.02;
      hood.scale.setScalar(1.12);
      this.head.add(hood);
    }
  }

  /** Agenda o julgamento teatral: será usado quando a morte chegar no snapshot. */
  public prepareTrial(stagePos: { x: number; z: number }, seatPos: { x: number; z: number; ry: number }): void {
    if (!this.state.isAlive) return; // já morto — nada a encenar
    this.pendingTrial = { stagePos, seatPos };
  }

  /** Mostra um balão de reação por alguns segundos. */
  public showEmote(emoji: string): void {
    if (this.emoteSprite) {
      this.group.remove(this.emoteSprite);
      this.emoteSprite.material.map?.dispose();
      this.emoteSprite.material.dispose();
    }
    this.emoteSprite = makeEmojiSprite(emoji, { bubble: true });
    this.emoteSprite.position.set(0, this.state.isAlive ? 2.95 : 2.1, 0);
    this.emoteSprite.scale.set(0.1, 0.1, 1);
    this.group.add(this.emoteSprite);
    this.emoteT = 3;
  }

  /** Aponta dramaticamente para uma posição (voto declarado). */
  public pointAt(target: THREE.Vector3, durationSeconds = 2.6): void {
    if (!this.state.isAlive) return;
    this.pointTarget.copy(target);
    this.pointT = durationSeconds;
  }

  /** Liga/desliga o indicador de fala (🔊 sobre a cabeça). */
  public setSpeaking(speaking: boolean): void {
    if (speaking === this.isSpeaking) return;
    this.isSpeaking = speaking;
    if (speaking && !this.speakingSprite) {
      this.speakingSprite = makeEmojiSprite('🔊');
      this.speakingSprite.scale.set(0.45, 0.45, 1);
      this.speakingSprite.position.set(-0.5, this.state.isAlive ? 2.15 : 1.9, 0);
      this.group.add(this.speakingSprite);
    } else if (!speaking && this.speakingSprite) {
      this.group.remove(this.speakingSprite);
      this.speakingSprite.material.map?.dispose();
      this.speakingSprite.material.dispose();
      this.speakingSprite = null;
    }
  }

  /** Aplica mudanças de estado vindas do snapshot (diff, sem rebuild). */
  public refreshVisualState(next: AvatarVisualState, force = false): void {
    const prev = this.state;
    const justDied = prev.isAlive && !next.isAlive;
    this.state = { ...next };

    if (justDied && !force) {
      if (this.pendingTrial) {
        // Julgamento: caminha até o centro da praça, cai por lá,
        // e a lápide aparece de volta no assento.
        const { stagePos, seatPos } = this.pendingTrial;
        this.pendingTrial = null;
        this.trial = { stage: 'walking', stagePos, seatPos };
        this.targetPosition.set(stagePos.x, 0, stagePos.z);
        this.targetRotationY = Math.atan2(seatPos.x - stagePos.x, seatPos.z - stagePos.z);
      } else {
        this.deathProgress = 0; // queda no lugar (morte noturna)
      }
    }

    // Placa de nome (recriada só quando o conteúdo muda)
    const key = `${next.nickname}|${next.isLocal}|${next.isMayor}|${next.isAlive}`;
    if (key !== this.nameKey) {
      this.nameKey = key;
      if (this.nameSprite) {
        this.group.remove(this.nameSprite);
        this.nameSprite.material.map?.dispose();
        this.nameSprite.material.dispose();
      }
      this.nameSprite = makeNameSprite(next.nickname, {
        isLocal: next.isLocal,
        isMayor: next.isMayor,
        isDead: !next.isAlive,
      });
      this.nameSprite.position.y = next.isAlive ? 2.45 : 1.6;
      this.group.add(this.nameSprite);
    }

    // Coroa do prefeito
    if (next.isMayor && next.isAlive && !this.crown) {
      this.crown = new THREE.Mesh(G.crown, M.crown);
      this.crown.position.y = 0.3;
      this.head.add(this.crown);
    } else if ((!next.isMayor || !next.isAlive) && this.crown) {
      this.head.remove(this.crown);
      this.crown = null;
    }

    // Anel de seleção / destaque local
    this.selectionRing.visible = next.isSelected || next.isLocal;
    this.selectionRing.material = next.isSelected ? M.selectionRing : M.localRing;

    // Morte imediata (spawn já morto / força) — exceto durante o julgamento teatral
    if (!next.isAlive && (force || this.deathProgress < 0) && !this.trial) {
      this.showDeadForm(true);
    }
    if (next.isAlive) {
      this.trial = null;
      this.pendingTrial = null;
      this.showDeadForm(false);
    }

    // Sprite de sono
    if (next.isSleeping && next.isAlive && !this.sleepSprite) {
      this.sleepSprite = makeSleepSprite();
      this.sleepSprite.position.set(0.42, 2.1, 0);
      this.group.add(this.sleepSprite);
    } else if ((!next.isSleeping || !next.isAlive) && this.sleepSprite) {
      this.group.remove(this.sleepSprite);
      this.sleepSprite.material.map?.dispose();
      this.sleepSprite.material.dispose();
      this.sleepSprite = null;
    }

    // Jogador desconectado fica translúcido
    this.body.traverse(obj => {
      if (obj instanceof THREE.Mesh && obj.material instanceof THREE.MeshStandardMaterial) {
        // materiais são compartilhados → usa opacidade via escala sutil
      }
    });
    this.body.scale.setScalar(next.isConnected ? 1 : 0.985);
  }

  private showDeadForm(dead: boolean): void {
    this.body.visible = !dead;
    if (dead) {
      if (!this.tombstone) {
        this.tombstone = new THREE.Group();
        const stone = new THREE.Mesh(G.tombstone, M.tombstone);
        stone.position.y = 0.48;
        stone.castShadow = true;
        const top = new THREE.Mesh(G.tombstoneTop, M.tombstone);
        top.rotation.x = Math.PI / 2;
        top.position.y = 0.95;
        this.tombstone.add(stone, top);
        this.group.add(this.tombstone);
      }
      if (!this.ghost) {
        this.ghost = new THREE.Group();
        const body = new THREE.Mesh(G.ghostBody, M.ghost);
        const tail = new THREE.Mesh(G.ghostTail, M.ghost);
        tail.position.y = -0.32;
        tail.rotation.x = Math.PI;
        this.ghost.add(body, tail);
        this.ghost.position.y = 1.6;
        this.group.add(this.ghost);
      }
    } else {
      if (this.tombstone) {
        this.group.remove(this.tombstone);
        this.tombstone = null;
      }
      if (this.ghost) {
        this.group.remove(this.ghost);
        this.ghost = null;
      }
      this.body.rotation.set(0, 0, 0);
      this.body.position.y = 0;
      this.deathProgress = -1;
    }
  }

  /** Avança animações. `dt` em segundos, `elapsed` tempo total. */
  public update(dt: number, elapsed: number): void {
    // Interpola em direção ao alvo
    const pos = this.group.position;
    const dx = this.targetPosition.x - pos.x;
    const dz = this.targetPosition.z - pos.z;
    const dist = Math.hypot(dx, dz);

    if (dist > 0.001) {
      const lerpFactor = Math.min(1, dt * 8);
      pos.x += dx * lerpFactor;
      pos.z += dz * lerpFactor;
    }

    // Suaviza rotação
    let dry = this.targetRotationY - this.group.rotation.y;
    while (dry > Math.PI) dry -= Math.PI * 2;
    while (dry < -Math.PI) dry += Math.PI * 2;
    this.group.rotation.y += dry * Math.min(1, dt * 10);

    // Fator de caminhada suavizado
    const moving = dist > WALK_EPSILON ? 1 : 0;
    this.walkAmount += (moving - this.walkAmount) * Math.min(1, dt * 6);

    // Indicador de fala pulsa suavemente
    if (this.speakingSprite) {
      const pulse = 0.42 + Math.sin(elapsed * 8) * 0.06;
      this.speakingSprite.scale.set(pulse, pulse, 1);
      (this.speakingSprite.material as THREE.SpriteMaterial).opacity =
        0.75 + Math.sin(elapsed * 8) * 0.25;
    }

    // Balão de reação: pop de entrada e fade de saída
    if (this.emoteSprite) {
      this.emoteT -= dt;
      const mat = this.emoteSprite.material as THREE.SpriteMaterial;
      if (this.emoteT <= 0) {
        this.group.remove(this.emoteSprite);
        mat.map?.dispose();
        mat.dispose();
        this.emoteSprite = null;
      } else {
        const scaleIn = Math.min(1, (3 - this.emoteT) * 5);
        this.emoteSprite.scale.set(0.85 * scaleIn, 0.85 * scaleIn, 1);
        mat.opacity = this.emoteT < 0.5 ? this.emoteT * 2 : 1;
        this.emoteSprite.position.y = (this.state.isAlive ? 2.95 : 2.1) + Math.sin(elapsed * 2.5) * 0.05;
      }
    }

    // Julgamento: caminhada "morta-viva" até o palco central
    if (this.trial?.stage === 'walking') {
      this.walkPhase += dt * 8;
      const swing = Math.sin(this.walkPhase) * 0.55;
      this.legL.rotation.x = swing;
      this.legR.rotation.x = -swing;
      this.armL.rotation.x = -swing * 0.6;
      this.armR.rotation.x = swing * 0.6;
      this.head.rotation.x = 0.22; // cabeça baixa, condenado
      const dStage = Math.hypot(
        this.trial.stagePos.x - pos.x,
        this.trial.stagePos.z - pos.z
      );
      if (dStage < 0.3) {
        this.trial.stage = 'dying';
        this.deathProgress = 0;
      }
      return;
    }

    // Animação de morte: queda para trás + afundar, depois lápide
    if (this.deathProgress >= 0 && this.deathProgress < 1) {
      this.deathProgress = Math.min(1, this.deathProgress + dt / 1.4);
      const t = this.deathProgress;
      this.body.rotation.x = -t * Math.PI * 0.5;
      this.body.position.y = -t * 0.25;
      if (this.deathProgress >= 1) {
        if (this.trial) {
          // A lápide fica no assento, não no palco
          const seat = this.trial.seatPos;
          this.trial = null;
          this.showDeadForm(true);
          this.snapTo(seat.x, seat.z, seat.ry);
        } else {
          this.showDeadForm(true);
        }
      }
      return;
    }

    if (!this.state.isAlive) {
      // Fantasma flutua devagar
      if (this.ghost) {
        this.ghost.position.y = 1.55 + Math.sin(elapsed * 1.6 + this.idleSeed) * 0.12;
        this.ghost.rotation.y = Math.sin(elapsed * 0.8 + this.idleSeed) * 0.4;
      }
      return;
    }

    if (this.state.isSleeping) {
      // Sono: corpo levemente caído, respiração lenta
      this.body.rotation.x = 0.18 + Math.sin(elapsed * 1.2 + this.idleSeed) * 0.02;
      this.head.rotation.x = 0.35;
      this.armL.rotation.x = 0.1;
      this.armR.rotation.x = 0.1;
      this.legL.rotation.x = 0;
      this.legR.rotation.x = 0;
      if (this.sleepSprite) {
        this.sleepSprite.position.y = 2.0 + Math.sin(elapsed * 1.8 + this.idleSeed) * 0.1;
        (this.sleepSprite.material as THREE.SpriteMaterial).opacity =
          0.6 + Math.sin(elapsed * 1.8 + this.idleSeed) * 0.3;
      }
      return;
    }

    // Ciclo de caminhada + respiração parada
    this.walkPhase += dt * (4 + this.walkAmount * 7);
    const swing = Math.sin(this.walkPhase) * 0.65 * this.walkAmount;

    this.legL.rotation.x = swing;
    this.legR.rotation.x = -swing;
    this.armL.rotation.x = -swing * 0.8;

    // Braço direito: apontar acusa, mão levantada pede a palavra
    if (this.pointT > 0) {
      this.pointT -= dt;
      const dx = this.pointTarget.x - this.group.position.x;
      const dz = this.pointTarget.z - this.group.position.z;
      if (Math.hypot(dx, dz) > 0.01) {
        this.targetRotationY = Math.atan2(dx, dz);
      }
      this.armR.rotation.x += (-Math.PI * 0.52 - this.armR.rotation.x) * Math.min(1, dt * 10);
      this.armR.rotation.z = 0;
    } else if (this.state.hasRaisedHand) {
      this.armR.rotation.x += (-Math.PI * 0.92 - this.armR.rotation.x) * Math.min(1, dt * 8);
      this.armR.rotation.z = Math.sin(elapsed * 6) * 0.08;
    } else {
      this.armR.rotation.x += (swing * 0.8 - this.armR.rotation.x) * Math.min(1, dt * 8);
      this.armR.rotation.z *= 0.9;
    }

    // Respiração e balanço sutil quando parado
    const idle = 1 - this.walkAmount;
    this.body.position.y = Math.abs(Math.sin(this.walkPhase)) * 0.06 * this.walkAmount;
    this.torso.scale.y = 1 + Math.sin(elapsed * 2.2 + this.idleSeed) * 0.015 * idle;
    this.body.rotation.x = 0;
    this.body.rotation.z = Math.sin(elapsed * 1.4 + this.idleSeed) * 0.02 * idle;
    this.head.rotation.x = Math.sin(elapsed * 0.9 + this.idleSeed) * 0.06 * idle;
    this.head.rotation.y = Math.sin(elapsed * 0.6 + this.idleSeed * 2) * 0.22 * idle;

    // Pulso do anel de seleção
    if (this.selectionRing.visible) {
      const pulse = 1 + Math.sin(elapsed * 4) * 0.08;
      this.selectionRing.scale.setScalar(pulse);
      this.selectionRing.rotation.z = elapsed * 1.2;
    }
  }

  /** Coloca instantaneamente (sem interpolar) — usado no spawn/teleporte. */
  public snapTo(x: number, z: number, ry: number): void {
    this.group.position.set(x, 0, z);
    this.group.rotation.y = ry;
    this.targetPosition.set(x, 0, z);
    this.targetRotationY = ry;
  }

  public dispose(scene: THREE.Scene): void {
    scene.remove(this.group);
    if (this.nameSprite) {
      this.nameSprite.material.map?.dispose();
      this.nameSprite.material.dispose();
    }
    if (this.sleepSprite) {
      this.sleepSprite.material.map?.dispose();
      this.sleepSprite.material.dispose();
    }
    if (this.emoteSprite) {
      this.emoteSprite.material.map?.dispose();
      this.emoteSprite.material.dispose();
    }
    if (this.speakingSprite) {
      this.speakingSprite.material.map?.dispose();
      this.speakingSprite.material.dispose();
    }
    // Geometrias/materiais são compartilhados — não descartar aqui.
  }
}
