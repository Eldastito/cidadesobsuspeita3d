/**
 * Cidade Sob Suspeita 3D — Partição dos canais de voz
 * Regra de sigilo (PRD 6.6 / Fase 3): vivos falam apenas com vivos;
 * mortos apenas com mortos. O servidor é a única autoridade sobre
 * quem pode se conectar a quem — o cliente nunca decide isso.
 */

export type VoiceChannel = 'ALIVE' | 'DEAD';

export interface VoiceMember {
  id: string;
  isAlive: boolean;
}

export function voiceChannelFor(isAlive: boolean): VoiceChannel {
  return isAlive ? 'ALIVE' : 'DEAD';
}

/** Pares elegíveis para um jogador: mesmos canal, prontos para voz, exceto ele. */
export function voicePeersFor(
  members: VoiceMember[],
  voiceReady: ReadonlySet<string>,
  forId: string
): { channel: VoiceChannel; peerIds: string[] } {
  const me = members.find(m => m.id === forId);
  const channel = voiceChannelFor(me?.isAlive ?? true);
  const peerIds = members
    .filter(m => m.id !== forId && voiceReady.has(m.id) && voiceChannelFor(m.isAlive) === channel)
    .map(m => m.id)
    .sort();
  return { channel, peerIds };
}

/** Dois membros podem trocar sinalização? (mesmo canal, ambos prontos) */
export function canSignal(
  members: VoiceMember[],
  voiceReady: ReadonlySet<string>,
  fromId: string,
  targetId: string
): boolean {
  if (fromId === targetId) return false;
  if (!voiceReady.has(fromId) || !voiceReady.has(targetId)) return false;
  const from = members.find(m => m.id === fromId);
  const target = members.find(m => m.id === targetId);
  if (!from || !target) return false;
  return voiceChannelFor(from.isAlive) === voiceChannelFor(target.isAlive);
}

/**
 * Assinatura do estado de voz da sala — quando muda (morte, entrada, saída),
 * as listas de pares precisam ser reenviadas.
 */
export function voiceSignature(members: VoiceMember[], voiceReady: ReadonlySet<string>): string {
  return members
    .filter(m => voiceReady.has(m.id))
    .map(m => `${m.id}:${m.isAlive ? 'A' : 'D'}`)
    .sort()
    .join('|');
}
