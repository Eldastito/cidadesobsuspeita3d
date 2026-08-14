/**
 * Testes da partição dos canais de voz — invariante de sigilo:
 * vivos nunca sinalizam com mortos, e vice-versa.
 */

import { describe, expect, it } from 'vitest';
import { canSignal, voicePeersFor, voiceSignature } from '../server/voiceChannels.ts';

const members = [
  { id: 'a1', isAlive: true },
  { id: 'a2', isAlive: true },
  { id: 'a3', isAlive: true },
  { id: 'd1', isAlive: false },
  { id: 'd2', isAlive: false },
];

describe('canais de voz', () => {
  it('vivos só recebem pares vivos; mortos só recebem mortos', () => {
    const ready = new Set(['a1', 'a2', 'a3', 'd1', 'd2']);

    const alive = voicePeersFor(members, ready, 'a1');
    expect(alive.channel).toBe('ALIVE');
    expect(alive.peerIds).toEqual(['a2', 'a3']);

    const dead = voicePeersFor(members, ready, 'd1');
    expect(dead.channel).toBe('DEAD');
    expect(dead.peerIds).toEqual(['d2']);
  });

  it('quem não ativou a voz não aparece como par', () => {
    const ready = new Set(['a1', 'a3']);
    expect(voicePeersFor(members, ready, 'a1').peerIds).toEqual(['a3']);
  });

  it('sinalização entre canais diferentes é bloqueada', () => {
    const ready = new Set(['a1', 'a2', 'd1', 'd2']);
    expect(canSignal(members, ready, 'a1', 'a2')).toBe(true);
    expect(canSignal(members, ready, 'd1', 'd2')).toBe(true);
    // Vivo ↔ morto: nunca
    expect(canSignal(members, ready, 'a1', 'd1')).toBe(false);
    expect(canSignal(members, ready, 'd1', 'a1')).toBe(false);
    // Sem voz ativada, sem sinalização
    expect(canSignal(members, ready, 'a1', 'a3')).toBe(false);
    // Consigo mesmo, jamais
    expect(canSignal(members, ready, 'a1', 'a1')).toBe(false);
  });

  it('assinatura muda quando alguém morre (troca de canal)', () => {
    const ready = new Set(['a1', 'a2']);
    const before = voiceSignature(members, ready);
    const afterDeath = voiceSignature(
      members.map(m => (m.id === 'a2' ? { ...m, isAlive: false } : m)),
      ready
    );
    expect(before).not.toBe(afterDeath);
  });
});
