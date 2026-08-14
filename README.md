# Cidade Sob Suspeita 3D

Jogo social de **dedução, sobrevivência e votação** em uma vila 3D, direto no navegador — sem instalação. Uma reconstrução do clássico *Cidade Dorme/Máfia*, baseada no [PRD do projeto](docs/game-rules.md).

![Fases](https://img.shields.io/badge/jogadores-5%20a%2012-f5b942) ![Stack](https://img.shields.io/badge/stack-React%20%2B%20Three.js%20%2B%20WebSocket-3b82f6)

## Como funciona

- A cidade alterna entre **noite** e **dia** em uma praça 3D com casario, capela, fonte e iluminação dinâmica.
- Cada jogador recebe um **papel secreto**: Assassino, Médico, Detetive, Bruxa ou Cidadão (e opcionalmente um Prefeito público que desempata votações).
- À noite, os papéis agem em segredo; de dia, todos debatem na praça — **andando livremente pelo cenário** — e votam para eliminar um suspeito.
- A **cidade vence** ao eliminar todos os assassinos; os **assassinos vencem** ao igualar o número de moradores vivos.

As regras completas e as decisões de produto estão em [`docs/game-rules.md`](docs/game-rules.md).

## Rodando localmente

Pré-requisitos: Node.js 20+ (ou Bun).

```bash
# instalar dependências
npm install        # ou: bun install

# desenvolvimento (servidor + cliente com Vite middleware)
npm run dev        # abre em http://localhost:3000

# testes do motor de regras (inclui simulação de partidas completas)
npm test

# verificação de tipos
npm run lint

# build de produção
npm run build
npm start
```

Para jogar sozinho durante o desenvolvimento, crie uma sala e use **“Completar com bots”** no lobby.

## Arquitetura

```
server.ts                  → Express + WebSocket + Vite middleware
server/
  roomManager.ts           → salas autoritativas, tick de 1s, relay de posições (10 Hz)
  botAI.ts                 → bots neutros de preenchimento
src/engine/                → MOTOR DE REGRAS PURO (sem DOM/rede/relógio)
  types.ts                 → entidades e snapshots tipados
  rules.ts                 → regras canônicas, metadados, CSPRNG
  gameEngine.ts            → máquina de estados determinística
  protocol.ts              → mensagens cliente ⇄ servidor
src/three/                 → cena 3D (Three.js, procedural, sem assets externos)
  villageScene.ts          → loop, câmera, movimento, transições dia/noite
  villageBuilder.ts        → vila procedural (casas, capela, árvores instanciadas…)
  avatarRig.ts             → avatares low-poly com animações procedurais
  sceneAssets.ts           → geometrias/materiais/texturas compartilhados
src/components/            → interface React (lobby, painéis de fase, chat, replay)
src/services/              → cliente WebSocket com retomada de sessão
tests/                     → testes unitários do motor + simulador de partidas
```

### Princípios (herdados do PRD)

1. **O servidor decide tudo.** O cliente envia intenções; papéis, votos, mortes e vitória são resolvidos no servidor.
2. **Segredo por minimização.** Cada cliente recebe apenas o snapshot que pode conhecer — papéis alheios nunca são serializados.
3. **Motor puro e testável.** `src/engine` não conhece WebSocket, banco nem Three.js; os testes simulam partidas completas.
4. **Queda de conexão não destrói a partida.** A sessão é retomável: o cliente guarda `sessionId` e reentra automaticamente.
5. **3D adaptativo.** Qualidade detectada por dispositivo (sombras/partículas reduzidas em celulares) e **modo 2D com paridade funcional**.

## Controles

| Dispositivo | Andar | Câmera | Selecionar alvo |
|---|---|---|---|
| Desktop | `WASD` / setas | arrastar com o mouse + roda para zoom | clique no morador |
| Celular/tablet | joystick virtual | arrastar + pinça | toque no morador |

Durante a **noite**, todos os avatares voltam a seus assentos e dormem — o movimento é liberado nas fases diurnas.

## Estado atual vs. PRD

Implementado: motor determinístico com todos os papéis, votação secreta **e votação aberta em sequência** (modo clássico do vídeo, com o avatar apontando o acusado), segundo turno e voto de minerva do Prefeito, chat com canal isolado de mortos, **emotes/reações em tempo real**, caderno do Detetive, palpites do Cidadão, **julgamento teatral** (o eliminado caminha ao centro da praça), tutorial por papel, linha do tempo pós-jogo com auditoria, revanche, bots, reconexão, narrador com legendas (acessibilidade), praça 3D com ciclo dia/noite, animações e movimento livre.

Fora do escopo desta versão (roadmap do PRD): voz WebRTC, salas públicas/matchmaking, contas persistentes, PostgreSQL/Redis (estado é em memória por processo) e observabilidade completa.
