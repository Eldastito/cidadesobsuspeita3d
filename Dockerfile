# Cidade Sob Suspeita 3D — imagem de produção
# Funciona em qualquer host de containers (Fly.io, Railway, VPS com Docker…).
# Node 22+ é obrigatório: a persistência usa o node:sqlite nativo.

FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json* bun.lock* ./
RUN npm install --no-audit --no-fund
COPY . .
RUN npm run build

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules ./node_modules
COPY package.json ./

# Banco SQLite fica em /app/data — monte um volume aqui para as partidas,
# perfis e Kokolas sobreviverem a reinícios/deploys.
VOLUME ["/app/data"]

EXPOSE 3000
CMD ["node", "dist/server.cjs"]
