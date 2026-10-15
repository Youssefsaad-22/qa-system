import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

import authRoutes from './routes/auth.js';
import callsRoutes from './routes/calls.js';
import supervisorRoutes from './routes/supervisor.js';
import agentsRoutes from './routes/agents.js';
import webhooksRoutes from './routes/webhooks.js';
import { startSweeper, stopSweeper } from './utils/sweeper.js';
import { startSyncJob, stopSyncJob } from './sync/syncJob.js';
import { startAgentPoller, stopAgentPoller } from './sync/agentPoller.js';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Webhooks intentionally mounted BEFORE express.json(): Directus may POST an
// empty/invalid JSON body, and a body-parser error must never make the webhook
// return 5xx (the route doesn't read the body anyway).
app.use('/api/webhooks', webhooksRoutes);

app.use(express.json());

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/calls', callsRoutes);
app.use('/api/supervisor', supervisorRoutes);
app.use('/api/agents', agentsRoutes);

// Built frontend (single-process hosting): serve /public if it exists,
// with an SPA fallback so client-side routes (/login, etc.) return index.html.
const publicDir = path.join(__dirname, '..', 'public');
const indexFile = path.join(publicDir, 'index.html');
if (fs.existsSync(indexFile)) {
  app.use(express.static(publicDir));
  app.get(/^\/(?!api\/).*/, (req, res) => res.sendFile(indexFile));
  console.log('Serving frontend from', publicDir);
}

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  const status = err.status || err.statusCode || 500;
  res.status(status).json({
    error: status === 500 ? 'Internal server error' : (err.message || 'Bad request'),
  });
});

const server = app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  startSweeper();
  startSyncJob();
  startAgentPoller();
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  stopSweeper();
  stopSyncJob();
  stopAgentPoller();
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully');
  stopSweeper();
  stopSyncJob();
  stopAgentPoller();
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

export default app;