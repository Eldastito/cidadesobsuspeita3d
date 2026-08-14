# Regras canônicas — Cidade Sob Suspeita 3D

**Versão:** 2.0 · **Fonte:** PRD 1.0 (seção 3) + decisões de produto da seção 21
**Status:** implementadas e cobertas por testes em `tests/`

Este documento é a referência única das regras em vigor. Toda mudança de regra deve ser
versionada aqui e refletida no motor (`src/engine`) com testes.

---

## 1. Composição das salas

| Jogadores | Assassinos | Médico | Detetive | Bruxa | Prefeito |
|---:|---:|---:|---:|---:|---:|
| 5–6 | 1 | 1 | 1 | 0 | 0 |
| 7–9 | 1 | 1 | 1 | 1 | 0 |
| 10–12 | 2 | 1 | 1 | 1 | 1 |
| 13–16 | 3 | 1 | 1 | 1 | 1 |

- A tabela acima é a **sugestão automática**; o anfitrião pode ajustar no lobby.
- Validação obrigatória: a cidade precisa começar em maioria (`2 × assassinos < jogadores`).
- O sorteio de papéis usa **CSPRNG** (`crypto.getRandomValues`).

## 2. Objetivos

- **Cidade:** eliminar todos os assassinos.
- **Assassinos:** igualar ou superar o número de jogadores vivos da cidade.
- **Bruxa:** pertence à cidade nesta versão, apesar do poder ofensivo.

## 3. Decisões de produto adotadas (PRD seção 21)

| Pergunta | Decisão |
|---|---|
| Papel revelado na morte? | **Só no fim da partida** (configurável por sala) |
| Médico | 1 autoproteção por partida; **não pode repetir o alvo da noite anterior** |
| Bruxa | exatamente **1 poção de morte + 1 proteção coletiva** por partida |
| Prefeito | **papel público** sorteado entre não-assassinos; desempata votações |
| Votação padrão | **secreta e simultânea**; resultado só na apuração. Modo opcional **aberto em sequência** (como no vídeo): voto declarado em voz alta, público e definitivo, na ordem dos assentos, com janela de 15 s por votante (silêncio = abstenção) |
| Comunicação | texto (voz fica para fase futura) |
| Sala | 5 a 12 jogadores |
| Herança de papel | **não existe** — papel de morto não é transferido |

## 4. Papéis

### Assassino 🗡️
- Escolhe uma vítima viva por noite; não pode atacar a si mesmo nem comparsas.
- Assassinos se conhecem. Com vários, a maioria simples define o alvo; empate interno é
  sorteado pelo servidor (CSPRNG).

### Médico 🩺
- Protege um jogador vivo por noite contra o **ataque dos assassinos**.
- Autoproteção: **1 vez por partida**. Proibido repetir o alvo da noite anterior.
- Não bloqueia a poção de morte da Bruxa.

### Detetive 🔍
- Investiga um jogador vivo por noite (nunca a si mesmo).
- Recebe em segredo **“suspeito”** (assassino) ou **“não suspeito”** (demais), sem o papel exato.
- Resultados ficam no caderno privado, entregues apenas após o fechamento da noite.

### Bruxa 🧪
- Por noite escolhe **uma** opção: poção de morte (1 carga), proteção coletiva (1 carga) ou não agir.
- A proteção coletiva cancela o ataque dos assassinos daquela noite; não ressuscita.
- A poção de morte não pode atingir a própria Bruxa e não é bloqueada pelo Médico.
- Cargas consumidas desaparecem das opções.

### Cidadão 🏠
- Sem poder noturno; pode **anotar um palpite privado** por noite (sem efeito mecânico —
  também serve para esconder o timing de quem age de verdade).
- Debate e vota durante o dia.

### Prefeito 👑 (opcional)
- Papel **público**, acumulado com o papel secreto de um não-assassino.
- Em empate na votação, dá o **voto de minerva** entre os empatados.
- Se estiver morto, desconectado ou não decidir a tempo → **segundo turno**.

## 5. Resolução da noite (ordem determinística)

1. Validar ações e cargas;
2. Determinar o alvo dos assassinos (maioria; empate sorteado);
3. Aplicar proteção coletiva da Bruxa;
4. Aplicar proteção do Médico;
5. Aplicar poção de morte da Bruxa;
6. Registrar investigação do Detetive (e palpites de cidadãos);
7. Consolidar mortes **sem revelar autores**;
8. Anunciar o amanhecer; **só então** verificar vitória.

Se a Bruxa mata o mesmo alvo dos assassinos, há **uma única morte**. Reenvio de ação
substitui a anterior (idempotência) — nunca duplica efeito.

## 6. Dia, votação e desempates

1. **Amanhecer:** o narrador anuncia mortes (nunca causas ou autores).
2. **Debate:** cronômetro configurável (60–300 s); vivos conversam; mortos apenas no
   canal isolado do cemitério.
3. **Votação:** um voto por jogador vivo; ausência = abstenção.
   - *Modo secreto (padrão):* simultânea; pode mudar o voto até o fim; resultado só na apuração.
   - *Modo aberto em sequência:* cada votante declara na ordem dos assentos, com 15 s de
     janela; o voto é público e definitivo assim que declarado (o avatar aponta o acusado
     na praça). Estourar o tempo conta como abstenção pública.
4. **Empate:**
   - com Prefeito vivo e habilitado → **voto de minerva** (apenas entre empatados);
   - Prefeito omisso/morto/ausente → **segundo turno** restrito aos empatados;
   - empate persistindo no segundo turno → **ninguém é eliminado**.
5. **Veredito:** eliminado sai da disputa; papel revelado conforme configuração da sala.
6. Verificação de vitória após cada morte noturna e cada eliminação diurna.

## 7. Morte e desconexão

- Morto não fala com vivos, não vota, não age e **não transfere o papel**.
- Mortos conversam apenas entre si (cemitério) e assistem como espectadores —
  isso vale para **texto e voz**: ao morrer, o jogador é movido automaticamente
  para o canal de voz do cemitério (o servidor decide os pares; ADR 001).
- **Voz à noite:** microfones dos vivos são silenciados durante a noite para não
  vazar o timing de quem age; o cemitério conversa a qualquer hora.
- Desconexão não mata: o jogador fica “reconectando” e pode retomar com o mesmo
  `sessionId`; ações ausentes valem “não agir”/abstenção.
- No lobby, quem cai é removido da sala (a vaga fica livre); o anfitrião é transferido
  automaticamente se necessário.

## 8. Sigilo (invariantes testadas)

- Nenhum snapshot contém papel ou ação secreta de outro jogador.
- Assassinos conhecem apenas os próprios comparsas.
- Eventos secretos da linha do tempo só são liberados quando a partida termina.
- Todos os papéis são revelados apenas no estado `FINISHED`.

## 9. Máquina de estados

`LOBBY → ROLE_REVEAL → NIGHT_ACTIONS → NIGHT_RESOLUTION → DAWN →`
`DISCUSSION → VOTING → (RUNOFF | MAYOR_TIEBREAK)? → DAY_RESOLUTION → NIGHT_ACTIONS…`
com saída para `FINISHED` na checagem de vitória (pós-amanhecer e pós-veredito).

Fases avançam por **cronômetro do servidor** ou antes, quando todos os elegíveis já
agiram (todos os vivos enviam algo à noite — inclusive cidadãos — para não vazar
timing dos papéis ativos).
