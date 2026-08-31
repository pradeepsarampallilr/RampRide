// Employee Portal endpoints. Mounted at /api/employee in index.js.
import { Router } from 'express';
import * as db from '../db.js';

const router = Router();

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'forbidden', detail: `requires role: ${roles.join('|')}` });
    }
    next();
  };
}

router.use(requireRole('employee'));

const ACTIVE_ORDER = ['in_progress', 'assigned', 'planned'];

// ---------------------------------------------------------------------------
// GET /employee/trip
// ---------------------------------------------------------------------------
router.get('/trip', (req, res) => {
  const database = db.get();
  const employeeId = req.user.refId;

  const candidates = database.routes.filter(
    (r) => r.status !== 'completed' && r.stops.some((s) => s.employeeId === employeeId)
  );
  if (candidates.length === 0) {
    return res.status(404).json({ error: 'not_found', detail: 'no active trip for this employee' });
  }
  candidates.sort((a, b) => ACTIVE_ORDER.indexOf(a.status) - ACTIVE_ORDER.indexOf(b.status));
  const route = candidates[0];

  const myStopRaw = route.stops.find((s) => s.employeeId === employeeId);
  const driver = database.drivers.find((d) => d.id === route.driverId) || null;
  const vehicle = database.vehicles.find((v) => v.id === route.vehicleId) || null;

  const sanitized = db.sanitizeRoute(route, req.user.role, employeeId);
  const myStop = sanitized.stops.find((s) => s.employeeId === employeeId);

  res.json({
    route: sanitized,
    pin: myStopRaw.pin,
    myStop,
    driver,
    vehicle,
    etaMin: myStopRaw.etaMin,
  });
});

export default router;
