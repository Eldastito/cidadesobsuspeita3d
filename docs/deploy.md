# Colocando a vila na internet 🌐

O jogo é um único servidor Node (Express + WebSocket + SQLite embutido) que também
serve o cliente. Qualquer host que rode **Node 22.5+** com **WebSocket** serve.
O HTTPS é obrigatório para a **voz** funcionar (o navegador só libera o microfone
em `https://` ou `localhost`) — todas as opções abaixo já dão HTTPS de graça.

## Opção recomendada: Render (grátis para começar)

1. Crie uma conta em **https://render.com** (pode entrar com a conta do GitHub).
2. No painel: **New → Blueprint**.
3. Conecte o repositório `cidadesobsuspeita3d` — a Render lê o `render.yaml`
   deste repositório e configura tudo sozinha (build, start, health check, Node 22).
4. Clique em **Apply/Deploy** e aguarde o primeiro build (~3 min).
5. Pronto: seu jogo estará em `https://cidade-sob-suspeita-3d.onrender.com`
   (o nome exato aparece no painel). Compartilhe o link com os amigos!

**Limitações do plano free** (tudo funciona, mas saiba disso):

- O servidor **dorme após ~15 min sem visitas**; o primeiro acesso seguinte demora
  ~1 minuto para acordar.
- O disco é **efêmero**: Kokolas, perfis, ranking e partidas em andamento **zeram
  a cada deploy ou reinício**. Durante o uso contínuo, tudo persiste normalmente.
- Para persistência de verdade: plano Starter (~US$ 7/mês) + disco (descomente o
  bloco `disk` no `render.yaml`).

Cada `git push` na branch `main` faz **deploy automático** da nova versão.

## Alternativas

### Railway (fácil, com volume para o banco)

1. https://railway.app → **New Project → Deploy from GitHub repo**.
2. Ele detecta o `Dockerfile` automaticamente.
3. Em **Settings → Volumes**, monte um volume em `/app/data` — assim o banco
   SQLite (Kokolas, perfis, partidas) sobrevive a deploys.
4. Em **Settings → Networking**, gere o domínio público.
   Custo: ~US$ 5/mês após o crédito inicial.

### Fly.io (ótimo custo, um pouco mais técnico)

```bash
fly launch          # detecta o Dockerfile
fly volumes create dados_da_vila --size 1
# no fly.toml, monte o volume em /app/data e defina PORT=3000
fly deploy
```

### VPS próprio (Hetzner, DigitalOcean, Oracle Free…)

Com Docker instalado no servidor:

```bash
git clone https://github.com/Eldastito/cidadesobsuspeita3d.git
cd cidadesobsuspeita3d
docker build -t cidade3d .
docker run -d --name cidade3d --restart unless-stopped \
  -p 3000:3000 -v cidade3d-dados:/app/data cidade3d
```

Depois coloque um proxy reverso com HTTPS na frente (Caddy resolve em 2 linhas):

```
# Caddyfile
jogo.seudominio.com.br {
    reverse_proxy localhost:3000
}
```

## Variáveis de ambiente

| Variável | Padrão | Para quê |
|---|---|---|
| `PORT` | `3000` | Porta do servidor (as plataformas definem sozinhas) |
| `NODE_ENV` | — | `production` ativa o modo de produção (serve o `dist/`) |
| `CSS3D_DB_PATH` | `./data/cidade.db` | Caminho do banco SQLite (aponte para o volume) |

## Checklist pós-deploy

- [ ] `https://SEU-APP/api/health` responde `{"status":"ok", ...}`
- [ ] Criar uma vila, entrar pelo celular com o código — WebSocket ok
- [ ] Botão **Ativar voz** pede o microfone (HTTPS ok)
- [ ] No celular, "Adicionar à tela inicial" instala o PWA
- [ ] Jogar uma partida com bots e conferir as Kokolas no perfil

## Escalando depois

Um processo atende confortavelmente dezenas de salas simultâneas. Os gatilhos para
evoluir a arquitetura (múltiplas instâncias, PostgreSQL, TURN/SFU para voz) estão
documentados nos ADRs 001 e 002 em `docs/adr/`.
