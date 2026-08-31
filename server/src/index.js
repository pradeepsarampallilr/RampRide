// Express + HTTP + Socket.io bootstrap. Wave 2-B (API + REALTIME).
// Owns: fake-bearer auth resolution, role guard, router mounting, global error handling.
import express from 'express';
import cors from 'cors';
import http from 'node:http';
import { Server as SocketIOServer } from 'socket.io';

import * as db from './db.js';
import { registerSockets } from './sockets.js';

import authRouter from './routes/auth.js';
import adminRouter from './routes/admin.js';
import vendorRouter from './routes/vendor.js';
import driverRouter from './routes/driver.js';
import employeeRouter from './routes/employee.js';
import simRouter from './routes/sim.js';

const PORT = 4000;

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new SocketIOServer(server, { cors: { origin: '*' } });
app.set('io', io);
registerSockets(io);

/**
 * Fake-bearer auth middleware. Authorization: Bearer <userId>.
 * Resolves req.user from db.users. Missing/unknown token => 401.
 * The single public route, POST /api/auth/login, is skipped.
 */
function authenticate(req, res, next) {
  if (req.method === 'POST' && req.path === '/auth/login') return next();

  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice('Bearer '.length).trim() : null;
  if (!token) return res.status(401).json({ error: 'unauthorized', detail: 'missing bearer token' });

  const database = db.get();
  const user = database.users.find((u) => u.id === token);
  if (!user) return res.status(401).json({ error: 'unauthorized', detail: 'unknown token' });

  req.user = user;
  next();
}

/** Role guard middleware factory, e.g. requireRole('admin', 'vendor'). */
export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'forbidden', detail: `requires role: ${roles.join('|')}` });
    }
    next();
  };
}

app.use('/api', authenticate);

app.use('/api/auth', authRouter);
app.use('/api', adminRouter);
app.use('/api/vendor', vendorRouter);
app.use('/api/driver', driverRouter);
app.use('/api/employee', employeeRouter);
app.use('/api/sim', simRouter);

// Unmatched /api/* routes.
app.use('/api', (req, res) => {
  res.status(404).json({ error: 'not_found', detail: `${req.method} ${req.originalUrl}` });
});

// Global error handler — always JSON.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);
  const status = err.status || err.statusCode || 500;
  res.status(status).json({ error: err.error || 'internal_error', detail: err.message });
});

server.listen(PORT, () => {
  console.log(`ShiftGuard API listening on :${PORT}`);
});
