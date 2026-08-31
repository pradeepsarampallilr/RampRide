// Driver Portal endpoints. Mounted at /api/driver in index.js.
import { Router } from 'express';
import * as db from '../db.js';
import { haversineM } from '../geo.js';
import { PROXIMITY_RADIUS_M } from '../config.js';
import { stopSim } from '../simulator.js';

const router = Router();

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'forbidden', detail: `requires role: ${roles.join('|')}` });
    }
    next();
  };
}

router.use(requireRole('driver'));

function findOwnedRoute(database, routeId, driverId) {
  return database.routes.find((r) => r.id === routeId && r.driverId === driverId);
}

// ---------------------------------------------------------------------------
// GET /driver/route
// ---------------------------------------------------------------------------
router.get('/route', (req, res) => {
  const database = db.get();
  const driverId = req.user.refId;
  const route =
    database.routes.find((r) => r.driverId === driverId && r.status === 'in_progress') ||
    database.routes.find((r) => r.driverId === driverId && r.status === 'assigned') ||
    null;

  if (!route) return res.json({ route: null, passengers: [] });

  const sanitized = db.sanitizeRoute(route, req.user.role);
  res.json({ route: sanitized, passengers: sanitized.stops });
});

// ---------------------------------------------------------------------------
// POST /driver/arrive  { routeId, seq, lat, lng }
// ---------------------------------------------------------------------------
router.post('/arrive', (req, res) => {
  const database = db.get();
  const { routeId, seq, lat, lng } = req.body || {};
  const route = findOwnedRoute(database, routeId, req.user.refId);
  if (!route) return res.status(404).json({ error: 'not_found', detail: 'unknown routeId for this driver' });

  const stop = route.stops.find((s) => s.seq === seq);
  if (!stop) return res.status(404).json({ error: 'not_found', detail: 'unknown seq' });

  const distanceM = Math.round(haversineM({ lat, lng }, stop));
  const unlocked = distanceM <= PROXIMITY_RADIUS_M;

  if (unlocked && stop.status === 'pending') {
    stop.status = 'arrived';
    db.save();
    req.app.get('io').to(`route:${routeId}`).emit('stop_status', { routeId, seq, status: 'arrived' });
  }

  res.json({ stop, distanceM, unlocked });
});

// ---------------------------------------------------------------------------
// POST /driver/verify-pin  { routeId, seq, pin, lat, lng }
// ---------------------------------------------------------------------------
router.post('/verify-pin', (req, res) => {
  const database = db.get();
  const { routeId, seq, pin, lat, lng } = req.body || {};
  const route = findOwnedRoute(database, routeId, req.user.refId);
  if (!route) return res.status(404).json({ error: 'not_found', detail: 'unknown routeId for this driver' });

  const stop = route.stops.find((s) => s.seq === seq);
  if (!stop) return res.status(404).json({ error: 'not_found', detail: 'unknown seq' });

  const distanceM = Math.round(haversineM({ lat, lng }, stop));

  if (stop.pin !== pin) {
    return res.status(400).json({ error: 'bad_pin', distanceM });
  }
  if (distanceM > PROXIMITY_RADIUS_M) {
    return res.status(400).json({ error: 'too_far', distanceM });
  }
  if (!['pending', 'arrived'].includes(stop.status)) {
    return res.status(400).json({ error: 'wrong_state', distanceM });
  }
  if (!['assigned', 'in_progress'].includes(route.status)) {
    return res.status(400).json({ error: 'wrong_state', distanceM });
  }

  stop.status = 'verified';
  stop.verifiedAt = new Date().toISOString();
  route.currentSeq = stop.seq + 1;
  db.save();

  req.app.get('io').to(`route:${routeId}`).emit('stop_status', { routeId, seq, status: 'verified' });

  res.json({ ok: true, route: db.sanitizeRoute(route, req.user.role) });
});

// ---------------------------------------------------------------------------
// POST /driver/complete-stop  { routeId, seq }
// ---------------------------------------------------------------------------
router.post('/complete-stop', (req, res) => {
  const database = db.get();
  const { routeId, seq } = req.body || {};
  const route = findOwnedRoute(database, routeId, req.user.refId);
  if (!route) return res.status(404).json({ error: 'not_found', detail: 'unknown routeId for this driver' });

  const stop = route.stops.find((s) => s.seq === seq);
  if (!stop) return res.status(404).json({ error: 'not_found', detail: 'unknown seq' });

  stop.status = 'done';
  db.save();
  req.app.get('io').to(`route:${routeId}`).emit('stop_status', { routeId, seq, status: 'done' });

  res.json({ route: db.sanitizeRoute(route, req.user.role) });
});

// ---------------------------------------------------------------------------
// POST /driver/finish  { routeId }
// ---------------------------------------------------------------------------
router.post('/finish', (req, res) => {
  const database = db.get();
  const route = findOwnedRoute(database, req.body?.routeId, req.user.refId);
  if (!route) return res.status(404).json({ error: 'not_found', detail: 'unknown routeId for this driver' });

  stopSim(route.id);
  route.status = 'completed';
  route.completedAt = new Date().toISOString();
  db.save();

  const io = req.app.get('io');
  io.to(`route:${route.id}`).emit('route_status', { routeId: route.id, status: 'completed' });
  io.to(`route:${route.id}`).emit('sim_ended', { routeId: route.id });

  res.json({ route: db.sanitizeRoute(route, req.user.role) });
});

export default router;
