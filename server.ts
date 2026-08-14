/**
 * Cidade Sob Suspeita 3D - Server Entry Point
 * Express HTTP + WebSocket Server with Vite Middleware Integration
 */

import http from 'http';
import path from 'path';
import express from 'express';
import { WebSocketServer } from 'ws';
import { createServer as createViteServer } from 'vite';
import { RoomManager } from './server/roomManager.ts';
import { Persistence } from './server/persistence.ts';

const PORT = 3000;

async function startServer() {
  const app = express();
  const server = http.createServer(app);

  app.use(express.json());

  // Health API
  app.get('/api/health', (req, res) => {
    res.json({
      status: 'ok',
      game: 'Cidade Sob Suspeita 3D',
      version: '2.0.0',
      timestamp: Date.now(),
    });
  });

  // Persistência embutida (SQLite): salas sobrevivem a reinícios,
  // partidas viram histórico e perfis acumulam estatísticas.
  let persistence: Persistence | null = null;
  try {
    persistence = new Persistence();
  } catch (err) {
    console.warn('⚠️ Persistência indisponível — seguindo apenas em memória:', err);
  }

  // Initialize Room & WebSocket Manager
  const roomManager = new RoomManager(persistence);
  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws) => {
    roomManager.handleConnection(ws);
  });

  // Vite Middleware in Dev vs Static Files in Production
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`🏰 Cidade Sob Suspeita 3D Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Fatal error starting server:', err);
  process.exit(1);
});
