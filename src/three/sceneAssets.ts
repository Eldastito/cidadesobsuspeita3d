/**
 * Cidade Sob Suspeita 3D — Recursos compartilhados da cena
 * Geometrias, materiais e texturas procedurais reutilizados por todos os
 * avatares e construções (evita GC churn e duplicação de GPU buffers).
 */

import * as THREE from 'three';
import { GamePhase } from '../engine/types.ts';
import { SkinEffect } from '../engine/skins.ts';

// ── Paleta de avatares ─────────────────────────────────────────────────────

export const AVATAR_COLORS = [
  0xc0563e, // terracota
  0x3e7bc0, // azul
  0x5da154, // verde
  0xb08fd6, // lilás
  0xd6a23f, // mostarda
  0x4fadad, // petróleo
  0xd06a8c, // rosa
  0x8a7a5c, // caqui
  0x7261c9, // violeta
  0xc97f42, // âmbar
  0x62a0c9, // celeste
  0x9a5f4a, // castanho
] as const;

export const SKIN_TONES = [0xf5d0b5, 0xe0b090, 0xc68e63, 0x8d5a3a, 0x6b4226] as const;

export function avatarColorFor(seatNumber: number): number {
  return AVATAR_COLORS[seatNumber % AVATAR_COLORS.length];
}

export function skinToneFor(seatNumber: number): number {
  return SKIN_TONES[(seatNumber * 7 + 3) % SKIN_TONES.length];
}

/** Estilo de chapéu por avatarId escolhido no lobby. */
export function hatStyleFor(avatarId: string): 'cap' | 'wizard' | 'straw' | 'none' | 'hood' | 'tophat' {
  switch (avatarId) {
    case 'avatar-1': return 'cap';
    case 'avatar-2': return 'none';
    case 'avatar-3': return 'wizard';
    case 'avatar-4': return 'tophat';
    case 'avatar-5': return 'hood';
    case 'avatar-6': return 'straw';
    default: return 'none';
  }
}

// ── Ambientes por fase (dia/noite/amanhecer) ───────────────────────────────

export interface PhaseEnvironment {
  sky: THREE.Color;
  fog: THREE.Color;
  fogDensity: number;
  ambientColor: THREE.Color;
  ambientIntensity: number;
  sunColor: THREE.Color;
  sunIntensity: number;
  sunPosition: THREE.Vector3;
  lanternIntensity: number;
  starsOpacity: number;
  moonOpacity: number;
  sunSpriteOpacity: number;
  windowGlow: number;
  firefliesOpacity: number;
}

const DAY_ENV: PhaseEnvironment = {
  sky: new THREE.Color(0x8fb7d4),
  fog: new THREE.Color(0x9dbfd6),
  fogDensity: 0.012,
  ambientColor: new THREE.Color(0xdfeaf2),
  ambientIntensity: 0.75,
  sunColor: new THREE.Color(0xfff2d8),
  sunIntensity: 1.9,
  sunPosition: new THREE.Vector3(18, 26, 12),
  lanternIntensity: 0.15,
  starsOpacity: 0,
  moonOpacity: 0,
  sunSpriteOpacity: 0.9,
  windowGlow: 0.05,
  firefliesOpacity: 0,
};

const NIGHT_ENV: PhaseEnvironment = {
  sky: new THREE.Color(0x0a0f24),
  fog: new THREE.Color(0x0b1128),
  fogDensity: 0.02,
  ambientColor: new THREE.Color(0x27335e),
  ambientIntensity: 0.5,
  sunColor: new THREE.Color(0x8ea6d8),
  sunIntensity: 0.55,
  sunPosition: new THREE.Vector3(-14, 24, -10),
  lanternIntensity: 1.9,
  starsOpacity: 1,
  moonOpacity: 1,
  sunSpriteOpacity: 0,
  windowGlow: 1.35,
  firefliesOpacity: 1,
};

const DAWN_ENV: PhaseEnvironment = {
  sky: new THREE.Color(0xc27a55),
  fog: new THREE.Color(0xc98a63),
  fogDensity: 0.016,
  ambientColor: new THREE.Color(0xf2c1a0),
  ambientIntensity: 0.62,
  sunColor: new THREE.Color(0xff9e5e),
  sunIntensity: 1.3,
  sunPosition: new THREE.Vector3(26, 8, 4),
  lanternIntensity: 0.8,
  starsOpacity: 0.15,
  moonOpacity: 0.2,
  sunSpriteOpacity: 0.7,
  windowGlow: 0.5,
  firefliesOpacity: 0.2,
};

export function environmentForPhase(phase: GamePhase): PhaseEnvironment {
  switch (phase) {
    case GamePhase.ROLE_REVEAL:
    case GamePhase.NIGHT_ACTIONS:
    case GamePhase.NIGHT_RESOLUTION:
      return NIGHT_ENV;
    case GamePhase.DAWN:
      return DAWN_ENV;
    default:
      return DAY_ENV;
  }
}

// ── Texturas procedurais ───────────────────────────────────────────────────

export function makeCobblestoneTexture(): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#4a4f5c';
  ctx.fillRect(0, 0, size, size);

  const cols = 8;
  const cell = size / cols;
  for (let row = 0; row < cols; row++) {
    for (let col = 0; col < cols; col++) {
      const offset = (row % 2) * cell * 0.5;
      const x = col * cell + offset;
      const y = row * cell;
      const shade = 92 + Math.floor(Math.random() * 40);
      ctx.fillStyle = `rgb(${shade - 8}, ${shade - 4}, ${shade + 8})`;
      const pad = 2 + Math.random() * 2;
      roundRect(ctx, (x + pad) % size, y + pad, cell - pad * 2, cell - pad * 2, 6);
      ctx.fill();
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(6, 6);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export function makeGrassTexture(): THREE.CanvasTexture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#41633f';
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 320; i++) {
    const g = 84 + Math.floor(Math.random() * 46);
    ctx.fillStyle = `rgb(${g - 32}, ${g}, ${g - 40})`;
    ctx.fillRect(Math.random() * size, Math.random() * size, 2, 2 + Math.random() * 3);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(10, 10);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Placa de nome flutuante (sprite via canvas). */
export function makeNameSprite(
  nickname: string,
  opts: { isLocal: boolean; isMayor: boolean; isDead: boolean }
): THREE.Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;

  const label = `${opts.isMayor ? '👑 ' : ''}${nickname}${opts.isDead ? ' ✝' : ''}`;
  ctx.font = 'bold 44px system-ui, sans-serif';
  const textWidth = Math.min(ctx.measureText(label).width, 460);
  const boxW = textWidth + 44;
  const boxX = (canvas.width - boxW) / 2;

  ctx.fillStyle = opts.isDead ? 'rgba(20, 22, 30, 0.55)' : 'rgba(12, 14, 24, 0.72)';
  roundRect(ctx, boxX, 24, boxW, 76, 34);
  ctx.fill();

  ctx.strokeStyle = opts.isLocal
    ? 'rgba(250, 200, 90, 0.95)'
    : opts.isMayor
    ? 'rgba(245, 185, 66, 0.6)'
    : 'rgba(255, 255, 255, 0.16)';
  ctx.lineWidth = opts.isLocal ? 5 : 3;
  roundRect(ctx, boxX, 24, boxW, 76, 34);
  ctx.stroke();

  ctx.fillStyle = opts.isDead ? 'rgba(160, 168, 190, 0.8)' : '#f4f6fb';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, canvas.width / 2, 64, 460);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(2.6, 0.65, 1);
  sprite.renderOrder = 10;
  return sprite;
}

/** Sprite de um único emoji (💤 do sono, balões de reação etc.). */
export function makeEmojiSprite(emoji: string, opts: { bubble?: boolean } = {}): THREE.Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;

  if (opts.bubble) {
    ctx.fillStyle = 'rgba(255, 255, 255, 0.92)';
    ctx.beginPath();
    ctx.arc(64, 58, 52, 0, Math.PI * 2);
    ctx.fill();
    // rabinho do balão
    ctx.beginPath();
    ctx.moveTo(48, 102);
    ctx.lineTo(64, 126);
    ctx.lineTo(78, 102);
    ctx.closePath();
    ctx.fill();
  }

  ctx.font = opts.bubble ? '64px system-ui, sans-serif' : '84px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(emoji, 64, opts.bubble ? 62 : 70);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false, opacity: 0.95 });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(0.7, 0.7, 1);
  sprite.renderOrder = 10;
  return sprite;
}

/** Sprite "💤" para o sono noturno. */
export function makeSleepSprite(): THREE.Sprite {
  return makeEmojiSprite('💤');
}

// ── Geometrias e materiais compartilhados dos avatares ─────────────────────

export const sharedGeometries = {
  torso: new THREE.CapsuleGeometry(0.34, 0.5, 6, 12),
  head: new THREE.SphereGeometry(0.27, 16, 14),
  eye: new THREE.SphereGeometry(0.038, 8, 8),
  arm: new THREE.CapsuleGeometry(0.09, 0.42, 4, 8),
  leg: new THREE.CapsuleGeometry(0.11, 0.4, 4, 8),
  hatCap: new THREE.CylinderGeometry(0.3, 0.32, 0.14, 12),
  hatBrim: new THREE.CylinderGeometry(0.42, 0.42, 0.04, 12),
  hatWizard: new THREE.ConeGeometry(0.3, 0.65, 10),
  hatStraw: new THREE.CylinderGeometry(0.2, 0.34, 0.22, 10),
  hatTop: new THREE.CylinderGeometry(0.22, 0.22, 0.34, 12),
  hood: new THREE.SphereGeometry(0.32, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.62),
  hand: new THREE.SphereGeometry(0.095, 8, 8),
  foot: new THREE.BoxGeometry(0.16, 0.09, 0.26),
  crown: new THREE.CylinderGeometry(0.24, 0.28, 0.16, 8, 1, true),
  selectionRing: new THREE.TorusGeometry(0.72, 0.045, 10, 32),
  shadowBlob: new THREE.CircleGeometry(0.55, 20),
  tombstone: new THREE.BoxGeometry(0.62, 0.95, 0.2),
  tombstoneTop: new THREE.CylinderGeometry(0.31, 0.31, 0.2, 16, 1, false, 0, Math.PI),
  ghostBody: new THREE.SphereGeometry(0.3, 12, 12),
  ghostTail: new THREE.ConeGeometry(0.28, 0.5, 10),
};

export const sharedMaterials = {
  eye: new THREE.MeshBasicMaterial({ color: 0x1c2030 }),
  crown: new THREE.MeshStandardMaterial({ color: 0xf5b942, metalness: 0.75, roughness: 0.25 }),
  shadowBlob: new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.28, depthWrite: false }),
  tombstone: new THREE.MeshStandardMaterial({ color: 0x6b7280, roughness: 0.9 }),
  ghost: new THREE.MeshStandardMaterial({
    color: 0xdce6f5,
    transparent: true,
    opacity: 0.34,
    roughness: 0.4,
    emissive: 0x8fa8d8,
    emissiveIntensity: 0.25,
    depthWrite: false,
  }),
  selectionRing: new THREE.MeshBasicMaterial({ color: 0xf43f5e, transparent: true, opacity: 0.9 }),
  localRing: new THREE.MeshBasicMaterial({ color: 0xfac85a, transparent: true, opacity: 0.85 }),
};

const bodyMaterialCache = new Map<number, THREE.MeshStandardMaterial>();
export function bodyMaterial(color: number): THREE.MeshStandardMaterial {
  let mat = bodyMaterialCache.get(color);
  if (!mat) {
    mat = new THREE.MeshStandardMaterial({ color, roughness: 0.62, metalness: 0.05 });
    bodyMaterialCache.set(color, mat);
  }
  return mat;
}

const skinMaterialCache = new Map<number, THREE.MeshStandardMaterial>();
export function skinMaterial(tone: number): THREE.MeshStandardMaterial {
  let mat = skinMaterialCache.get(tone);
  if (!mat) {
    mat = new THREE.MeshStandardMaterial({ color: tone, roughness: 0.55 });
    skinMaterialCache.set(tone, mat);
  }
  return mat;
}

/** Materiais de uma skin cosmética (por rig — não compartilhados). */
export interface SkinMaterialSet {
  body: THREE.MeshStandardMaterial;
  limbs: THREE.MeshStandardMaterial;
  /** Braço direito/segundo tom, para skins bicolores. */
  accent: THREE.MeshStandardMaterial;
  /** Opacidade aplicada também à pele/cabeça (skin fantasma). */
  translucent?: boolean;
  /** Emissivo pulsa no loop (lava/neon). */
  pulses?: boolean;
}

export function makeSkinMaterials(effect: SkinEffect, baseColor: number): SkinMaterialSet | null {
  const std = (opts: THREE.MeshStandardMaterialParameters) => new THREE.MeshStandardMaterial(opts);
  switch (effect) {
    case 'shadow': {
      const body = std({ color: 0x232633, roughness: 0.35, metalness: 0.15 });
      return { body, limbs: std({ color: 0x14161f, roughness: 0.4 }), accent: body.clone() };
    }
    case 'neon': {
      const body = std({ color: 0x0e7490, emissive: 0x22d3ee, emissiveIntensity: 0.55, roughness: 0.3 });
      const limbs = std({ color: 0x155e75, emissive: 0x67e8f9, emissiveIntensity: 0.35, roughness: 0.3 });
      return { body, limbs, accent: limbs.clone(), pulses: true };
    }
    case 'harlequin': {
      const body = std({ color: 0xd06a8c, roughness: 0.6 });
      const limbs = std({ color: 0x5da154, roughness: 0.6 });
      return { body, limbs, accent: std({ color: 0x3e7bc0, roughness: 0.6 }) };
    }
    case 'gold': {
      const body = std({ color: 0xf5b942, metalness: 0.85, roughness: 0.25 });
      return { body, limbs: body.clone(), accent: body.clone() };
    }
    case 'lava': {
      const body = std({ color: 0x1c1917, emissive: 0xf97316, emissiveIntensity: 0.7, roughness: 0.5 });
      const limbs = std({ color: 0x292524, emissive: 0xdc2626, emissiveIntensity: 0.45, roughness: 0.5 });
      return { body, limbs, accent: limbs.clone(), pulses: true };
    }
    case 'ghost': {
      const body = std({
        color: 0xdce6f5,
        transparent: true,
        opacity: 0.5,
        roughness: 0.3,
        emissive: 0x8fa8d8,
        emissiveIntensity: 0.2,
        depthWrite: false,
      });
      return { body, limbs: body.clone(), accent: body.clone(), translucent: true };
    }
    case 'royal': {
      const body = std({ color: 0x7c3aed, roughness: 0.45, metalness: 0.1 });
      const accent = std({ color: 0xf5b942, metalness: 0.7, roughness: 0.3 });
      return { body, limbs: std({ color: 0x4c1d95, roughness: 0.5 }), accent };
    }
    default:
      return null;
  }
}
