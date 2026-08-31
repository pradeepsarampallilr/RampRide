// POST /auth/login (public), GET /auth/me. Mounted at /api/auth in index.js.
import { Router } from 'express';
import * as db from '../db.js';

const router = Router();

router.post('/login', (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ error: 'bad_request', detail: 'email and password are required' });
  }
  const database = db.get();
  const user = database.users.find((u) => u.email === email && u.password === password);
  if (!user) return res.status(401).json({ error: 'invalid_credentials' });
  res.json({ token: user.id, user });
});

router.get('/me', (req, res) => {
  res.json({ user: req.user });
});

export default router;
