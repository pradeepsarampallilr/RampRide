// Transport Vendor Portal endpoints. Mounted at /api/vendor in index.js.
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

router.use(requireRole('vendor'));

// ---------------------------------------------------------------------------
// GET /vendor/fleet
// ---------------------------------------------------------------------------
router.get('/fleet', (req, res) => {
  const database = db.get();
  const vendorId = req.user.refId;
  const drivers = database.drivers.filter((d) => d.vendorId === vendorId);
  const vehicles = database.vehicles.filter((v) => v.vendorId === vendorId);
  const routes = database.routes
    .filter((r) => r.vendorId === vendorId)
    .map((r) => db.sanitizeRoute(r, req.user.role));
  res.json({ drivers, vehicles, routes });
});

// ---------------------------------------------------------------------------
// POST /vendor/assign  { routeId, driverId, vehicleId }
// ---------------------------------------------------------------------------
router.post('/assign', (req, res) => {
  const database = db.get();
  const { routeId, driverId, vehicleId } = req.body || {};
  const route = database.routes.find((r) => r.id === routeId);
  if (!route) return res.status(404).json({ error: 'not_found', detail: 'unknown routeId' });

  const driver = database.drivers.find((d) => d.id === driverId && d.vendorId === req.user.refId);
  if (!driver) return res.status(404).json({ error: 'not_found', detail: 'unknown driverId for this vendor' });

  const vehicle = database.vehicles.find((v) => v.id === vehicleId && v.vendorId === req.user.refId);
  if (!vehicle) return res.status(404).json({ error: 'not_found', detail: 'unknown vehicleId for this vendor' });

  if (route.status !== 'planned') {
    return res.status(409).json({ error: 'invalid_state', detail: `route is '${route.status}', expected 'planned'` });
  }
  if (vehicle.capacity < route.stops.length) {
    return res.status(409).json({ error: 'capacity_exceeded', detail: `vehicle capacity ${vehicle.capacity} < ${route.stops.length} stops` });
  }
  const driverBusy = database.routes.some((r) => r.driverId === driverId && r.status === 'in_progress');
  if (driverBusy) {
    return res.status(409).json({ error: 'driver_busy', detail: 'driver already owns an in_progress route' });
  }

  route.vendorId = req.user.refId;
  route.driverId = driverId;
  route.vehicleId = vehicleId;
  route.status = 'assigned';
  driver.status = 'assigned';
  vehicle.status = 'assigned';
  db.save();

  req.app.get('io').to(`route:${routeId}`).emit('route_status', { routeId, status: 'assigned' });

  res.json({ route: db.sanitizeRoute(route, req.user.role) });
});

// ---------------------------------------------------------------------------
// POST /vendor/unassign  { routeId }
// ---------------------------------------------------------------------------
router.post('/unassign', (req, res) => {
  const database = db.get();
  const { routeId } = req.body || {};
  const route = database.routes.find((r) => r.id === routeId && r.vendorId === req.user.refId);
  if (!route) return res.status(404).json({ error: 'not_found', detail: 'unknown routeId for this vendor' });

  const driver = database.drivers.find((d) => d.id === route.driverId);
  const vehicle = database.vehicles.find((v) => v.id === route.vehicleId);
  if (driver) driver.status = 'available';
  if (vehicle) vehicle.status = 'available';

  route.vendorId = null;
  route.driverId = null;
  route.vehicleId = null;
  route.status = 'planned';
  db.save();

  req.app.get('io').to(`route:${routeId}`).emit('route_status', { routeId, status: 'planned' });

  res.json({ route: db.sanitizeRoute(route, req.user.role) });
});

export default router;
