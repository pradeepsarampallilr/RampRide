// Simulator control endpoints. Mounted at /api/sim in index.js.
import { Router } from 'express';
import { startSim, stopSim, simStatus } from '../simulator.js';

const router = Router();

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'forbidden', detail: `requires role: ${roles.join('|')}` });
    }
    next();
  };
}

router.use(requireRole('admin', 'vendor', 'driver'));

// ---------------------------------------------------------------------------
// POST /sim/start  { routeId, speed? }
// ---------------------------------------------------------------------------
router.post('/start', (req, res) => {
  const { routeId, speed } = req.body || {};
  if (!routeId) return res.status(400).json({ error: 'bad_request', detail: 'routeId required' });

  const io = req.app.get('io');
  const started = startSim(io, routeId, typeof speed === 'number' && speed > 0 ? speed : 1);
  res.json({ ok: started, routeId });
});

// ---------------------------------------------------------------------------
// POST /sim/stop  { routeId }
// ---------------------------------------------------------------------------
router.post('/stop', (req, res) => {
  const { routeId } = req.body || {};
  if (!routeId) return res.status(400).json({ error: 'bad_request', detail: 'routeId required' });
  stopSim(routeId);
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// GET /sim/status
// ---------------------------------------------------------------------------
router.get('/status', (req, res) => {
  res.json({ running: simStatus() });
});

export default router;
