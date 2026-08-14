# ADR 001 — Voz WebRTC em malha P2P (Fase 3)

**Status:** aceita · **Data:** 2026-08-14

## Contexto

A Fase 3 do PRD pede voz para os vivos e canal isolado de mortos, com um gate claro:
*falha do serviço de voz degrada para texto sem interromper partidas*. O PRD sugere
avaliar uma SFU gerenciada (ex.: LiveKit) em ADR separado.

O produto hoje é um único processo Node autoritativo, sem contas persistentes nem
infraestrutura externa, com salas de **5 a 12 jogadores**.

## Opções consideradas

1. **SFU gerenciada (LiveKit Cloud ou similar)** — escala bem, mas exige conta,
   chaves de API, custo por minuto e um segundo sistema para operar. Aumenta o
   risco operacional numa fase em que o produto nem tem contas de usuário.
2. **SFU auto-hospedada** — servidor de mídia próprio (ingest/egress UDP, TURN),
   complexidade alta de deploy e observabilidade para o estágio atual.
3. **Malha P2P (mesh)** — cada cliente conecta áudio diretamente aos pares do seu
   canal. Para áudio Opus (~32 kbps), 11 uplinks ≈ 350 kbps de subida no pior caso
   (sala cheia), aceitável em conexões domésticas; CPU é irrelevante para áudio.
   Sinalização passa pelo WebSocket já existente do jogo.

## Decisão

**Malha P2P com sinalização pelo servidor do jogo** e STUN público (sem TURN).

- O **servidor é a autoridade dos canais**: calcula quem pode falar com quem
  (vivos ↔ vivos; mortos ↔ mortos) e **só retransmite sinalização entre membros do
  mesmo canal** (`server/voiceChannels.ts`, com testes).
- Negociação "perfect negotiation" com iniciador determinístico (menor id oferece).
- **Noite silencia os microfones dos vivos** no cliente (dupla imposição: emissor
  desabilita a track e receptores esperam silêncio) — voz não pode vazar o timing
  de quem age. O cemitério conversa a qualquer hora.
- Voz é 100% opcional: sem microfone, sem WebRTC ou sem STUN alcançável, o jogo
  continua por texto (gate da Fase 3).

## Consequências

- **Positivas:** zero infraestrutura nova, zero custo, sem credenciais; o isolamento
  vivo/morto é imposto na sinalização do servidor; funciona no fluxo atual de deploy.
- **Negativas/limites:**
  - Sem TURN, pares atrás de NAT simétrico podem não conectar (≈5–10% dos casos);
    a UI mostra "conectando…" e o jogo segue por texto.
  - Malha não escala além de ~12 participantes — exatamente o teto do MVP.
  - Não há como o servidor policiar o conteúdo da mídia P2P (gravação/moderação de
    áudio ficam para a fase com SFU).
- **Caminho de evolução:** se as salas crescerem (>16) ou moderação de áudio se
  tornar requisito, migrar para SFU (LiveKit) mantendo o mesmo contrato de canais —
  o cliente já recebe a lista de pares do servidor, que passaria a devolver tokens
  de sala da SFU no lugar dos ids.
