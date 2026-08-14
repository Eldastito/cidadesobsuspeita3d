# ADR 002 — Persistência embutida com SQLite (Fase 4)

**Status:** aceita · **Data:** 2026-08-14

## Contexto

A Fase 4 do PRD pede operação confiável: estado que sobreviva a reinícios, histórico
de partidas e identidade persistente. A arquitetura de referência do PRD sugere
PostgreSQL + Redis, dimensionados para 1.000 salas simultâneas — uma escala que o
produto ainda não tem. Hoje o jogo roda em **um único processo Node**, sem contas de
usuário, e o README promete execução local em minutos.

## Opções consideradas

1. **PostgreSQL + Redis (stack do PRD)** — correta para a escala-alvo, mas exige
   provisionar e operar dois serviços externos antes de existir demanda; quebra o
   "clone e rode" e adiciona segredos/conexões ao deploy.
2. **Supabase (Postgres gerenciado)** — reduz operação, mas cria dependência de
   credenciais externas no repositório/ambiente e latência de rede por escrita.
3. **SQLite embutido (`node:sqlite`, nativo do Node ≥ 22)** — arquivo local em
   `data/cidade.db` (WAL), zero dependências novas, zero configuração, transacional.

## Decisão

**SQLite embutido via `node:sqlite`**, atrás de uma classe `Persistence` com
interface estreita (salas, histórico, perfis). O caminho para PostgreSQL é trocar a
implementação dessa classe — nenhum outro módulo conhece SQL.

O que é persistido:

- **Salas em andamento** — snapshot completo do motor (`GameEngine.serialize()`)
  + chat, gravado a cada 2 s quando houver mudança. No boot, `restoreRooms()`
  reergue as salas; humanos voltam como "reconectando" e retomam pela sessão
  (o cliente já reentra sozinho), bots continuam jogando.
- **Histórico de partidas** — código da sala, vencedor, papéis, rodadas.
- **Perfis de convidados** — `guestId` gerado pelo navegador (localStorage):
  partidas, vitórias e estatísticas por papel. Sem e-mail, sem senha, sem PII
  além do apelido — alinhado à minimização de dados da LGPD (PRD 12.3).

## Consequências

- **Positivas:** reinício/deploy do servidor não mata partidas (requisito-chave de
  confiabilidade da Fase 4 no nosso estágio); histórico e perfis habilitam a tela
  de estatísticas; instalação local continua trivial; testes usam `:memory:`.
- **Negativas/limites:**
  - Um único processo/arquivo: sem réplicas nem failover — igual ao status quo,
    mas agora com recuperação após queda.
  - `node:sqlite` é experimental (warning no boot); a API usada (DatabaseSync,
    prepare/run/get/all) é estável desde o Node 22.5.
  - Perfis por navegador não são contas: limpar o localStorage zera a identidade.
    Contas/passkeys continuam no roadmap da Fase 4 completa.
- **Gatilhos para migrar a Postgres:** múltiplos processos/instâncias, salas
  públicas com matchmaking, ou contas persistentes com autenticação.
