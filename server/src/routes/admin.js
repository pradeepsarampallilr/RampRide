// Admin + shared oversight endpoints. Mounted at bare /api in index.js (paths below already
// include their own /admin/... prefix where the CONTRACTS table shows one).
//   bootstrap, employees, admin/roster, admin/generate, admin/routes (DELETE),
//   routes (GET list/detail), alerts (GET/PATCH), metrics (GET)
import { Router } from 'express';
import * as db from '../db.js';
import { encodePolyline, haversineKm } from '../geo.js';
import { table as osrmTable, route as osrmRoute } from '../osrm.js';
import solve from '../solver.js';
import { computeMetrics } from '../metrics.js';
import { CITY_BBOX, AVG_SPEED_KMH } from '../config.js';

const router = Router();

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'forbidden', detail: `requires role: ${roles.join('|')}` });
    }
    next();
  };
}

function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

function sanitizeForUser(route, req) {
  const employeeId = req.user.role === 'employee' ? req.user.refId : null;
  return db.sanitizeRoute(route, req.user.role, employeeId);
}

// ---------------------------------------------------------------------------
// GET /bootstrap
// ---------------------------------------------------------------------------
router.get('/bootstrap', (req, res) => {
  const database = db.get();
  res.json({
    office: database.office,
    shifts: database.shifts,
    vendors: database.vendors,
    counts: {
      employees: database.employees.length,
      drivers: database.drivers.length,
      vehicles: database.vehicles.length,
      routes: database.routes.length,
      openAlerts: database.alerts.filter((a) => a.status === 'open').length,
    },
  });
});

// ---------------------------------------------------------------------------
// GET /employees?shiftId=
// ---------------------------------------------------------------------------
router.get('/employees', requireRole('admin'), (req, res) => {
  const database = db.get();
  const { shiftId } = req.query;
  const employees = shiftId ? database.employees.filter((e) => e.shiftId === shiftId) : database.employees;
  res.json({ employees });
});

// ---------------------------------------------------------------------------
// POST /admin/roster  { csv } or { employees: [...] }
// ---------------------------------------------------------------------------
function splitCsvLine(line) {
  const result = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      result.push(cur);
      cur = '';
    } else {
      cur += c;
    }
  }
  result.push(cur);
  return result;
}

function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return [];
  const headers = splitCsvLine(lines[0]).map((h) => h.trim().toLowerCase());
  return lines.slice(1).map((line) => {
    const cells = splitCsvLine(line);
    const row = {};
    headers.forEach((h, i) => {
      row[h] = (cells[i] ?? '').trim();
    });
    return row;
  });
}

function isInBbox(lat, lng) {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= CITY_BBOX.minLat &&
    lat <= CITY_BBOX.maxLat &&
    lng >= CITY_BBOX.minLng &&
    lng <= CITY_BBOX.maxLng
  );
}

function coerceLatLng(value) {
  if (value === null || value === undefined || value === '') return NaN;
  const n = typeof value === 'number' ? value : parseFloat(value);
  return n;
}

/** Ingests one normalized row (from CSV or the {employees:[...]} form). Never throws. */
function ingestRow(row) {
  const database = db.get();
  const lat = coerceLatLng(row.lat);
  const lng = coerceLatLng(row.lng);
  const addressValid = isInBbox(lat, lng);

  const existing = row.email ? database.employees.find((e) => e.email === row.email) : null;

  const gender = ['M', 'F', 'X'].includes(String(row.gender).toUpperCase()) ? String(row.gender).toUpperCase() : 'X';

  const record = {
    name: row.name || existing?.name || 'Unknown',
    email: row.email || existing?.email || null,
    phone: row.phone || existing?.phone || null,
    gender,
    address: row.address || existing?.address || '',
    lat: addressValid ? lat : null,
    lng: addressValid ? lng : null,
    shiftId: row.shiftId || row.shiftid || existing?.shiftId || null,
    addressValid,
  };

  let employee;
  let wasUpdate = false;
  if (existing) {
    Object.assign(existing, record);
    employee = existing;
    wasUpdate = true;
  } else {
    employee = { id: db.nextId('E', 'employees'), ...record };
    database.employees.push(employee);
  }

  let alert = null;
  if (!addressValid) {
    alert = {
      id: db.nextId('A', 'alerts'),
      type: 'invalid_address',
      severity: 'high',
      employeeId: employee.id,
      employeeName: employee.name,
      shiftId: employee.shiftId,
      message: 'Coordinates missing or outside Hyderabad service area',
      rawAddress: row.address || employee.address || '',
      status: 'open',
      createdAt: new Date().toISOString(),
      resolvedAt: null,
      suggestedLat: null,
      suggestedLng: null,
    };
    database.alerts.push(alert);
  }

  return { wasUpdate, invalid: !addressValid, alert };
}

router.post('/admin/roster', requireRole('admin'), (req, res) => {
  const { csv, employees } = req.body || {};
  let rows = [];
  if (typeof csv === 'string' && csv.trim().length > 0) {
    rows = parseCsv(csv);
  } else if (Array.isArray(employees)) {
    rows = employees;
  } else {
    return res.status(400).json({ error: 'bad_request', detail: 'csv or employees[] required' });
  }

  let added = 0;
  let updated = 0;
  let invalid = 0;
  const alerts = [];

  for (const row of rows) {
    try {
      const result = ingestRow(row);
      if (result.wasUpdate) updated++;
      else added++;
      if (result.invalid) invalid++;
      if (result.alert) alerts.push(result.alert);
    } catch {
      invalid++;
    }
  }

  db.save();
  res.json({ added, updated, invalid, alerts });
});

// ---------------------------------------------------------------------------
// POST /admin/generate  { shiftId }
// ---------------------------------------------------------------------------
function genPin() {
  return String(Math.floor(1000 + Math.random() * 9000));
}

function parseShiftTimeToMinutes(time) {
  const [h, m] = String(time).split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

function formatClock(totalMinutes) {
  const m = ((Math.round(totalMinutes) % 1440) + 1440) % 1440;
  const hh = String(Math.floor(m / 60)).padStart(2, '0');
  const mm = String(m % 60).padStart(2, '0');
  return `${hh}:${mm}`;
}

function fallbackLegKm(a, b) {
  return haversineKm(a, b) * 1.35;
}

function computeEtas(route, office, matrix, employeeIndexById, shiftTimeMinutes) {
  let cumulativeMin = 0;
  let prevIdx = 0;
  let prevPoint = office;
  for (const stop of route.stops) {
    const idx = employeeIndexById.get(stop.employeeId);
    let legMin;
    if (matrix && matrix.durations && matrix.durations[prevIdx] && matrix.durations[prevIdx][idx] != null) {
      legMin = matrix.durations[prevIdx][idx] / 60;
    } else {
      legMin = (fallbackLegKm(prevPoint, stop) / AVG_SPEED_KMH) * 60;
    }
    cumulativeMin += legMin;
    stop.etaMin = Math.round(cumulativeMin);
    stop.etaClock = formatClock(shiftTimeMinutes + cumulativeMin);
    prevIdx = idx ?? prevIdx;
    prevPoint = stop;
  }
}

router.post(
  '/admin/generate',
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const { shiftId } = req.body || {};
    const database = db.get();
    const shift = database.shifts.find((s) => s.id === shiftId);
    if (!shift) return res.status(404).json({ error: 'not_found', detail: 'unknown shiftId' });

    // Wipe existing routes for this shift first.
    database.routes = database.routes.filter((r) => r.shiftId !== shiftId);

    const employees = database.employees.filter((e) => e.shiftId === shiftId && e.addressValid);
    const employeeIndexById = new Map(employees.map((e, i) => [e.id, i + 1]));
    const office = database.office;
    const coords = [office, ...employees.map((e) => ({ lat: e.lat, lng: e.lng }))];

    const timings = { osrmMs: 0, solveMs: 0 };

    const osrmStart = Date.now();
    const matrix = employees.length > 0 ? await osrmTable(coords) : null;
    timings.osrmMs += Date.now() - osrmStart;

    const solveStart = Date.now();
    const solverResult = solve({
      office,
      employees,
      vehicles: database.vehicles,
      shift,
      matrix,
    });
    timings.solveMs = Date.now() - solveStart;

    const generatedAt = new Date().toISOString();
    const shiftTimeMinutes = parseShiftTimeToMinutes(shift.time);

    const finalRoutes = [];
    for (let i = 0; i < solverResult.routes.length; i++) {
      const r = solverResult.routes[i];
      const finalRoute = {
        id: `R-${shiftId}-${String(i + 1).padStart(2, '0')}`,
        shiftId,
        direction: shift.direction,
        status: 'planned',
        vendorId: null,
        driverId: null,
        vehicleId: null,
        capacity: r.capacity ?? null,
        stops: r.stops.map((s) => ({ ...s, pin: genPin() })),
        geometry: null,
        distanceKm: r.distanceKm ?? null,
        durationMin: r.durationMin ?? null,
        straightLineKm: r.straightLineKm ?? null,
        flags: r.flags || { isNight: !!shift.isNight, escortRequired: false, reorderedForSafety: false },
        createdAt: generatedAt,
        startedAt: null,
        completedAt: null,
        currentSeq: 1,
        lastLocation: null,
      };

      computeEtas(finalRoute, office, matrix, employeeIndexById, shiftTimeMinutes);

      const routeCoords = [office, ...finalRoute.stops.map((s) => ({ lat: s.lat, lng: s.lng })), office];
      const osrmStart2 = Date.now();
      const osrmResult = await osrmRoute(routeCoords);
      timings.osrmMs += Date.now() - osrmStart2;

      if (osrmResult) {
        finalRoute.geometry = osrmResult.geometry;
        finalRoute.distanceKm = osrmResult.distanceKm;
        finalRoute.durationMin = osrmResult.durationMin;
      } else {
        finalRoute.geometry = encodePolyline(routeCoords);
        if (finalRoute.distanceKm == null) {
          let km = 0;
          for (let j = 1; j < routeCoords.length; j++) km += fallbackLegKm(routeCoords[j - 1], routeCoords[j]);
          finalRoute.distanceKm = Math.round(km * 10) / 10;
          finalRoute.durationMin = Math.round((km / AVG_SPEED_KMH) * 60);
        }
      }

      finalRoutes.push(finalRoute);
    }

    const newAlerts = [];
    for (const a of solverResult.alerts || []) {
      const alert = {
        status: 'open',
        resolvedAt: null,
        suggestedLat: null,
        suggestedLng: null,
        createdAt: generatedAt,
        ...a,
        id: db.nextId('A', 'alerts'),
      };
      database.alerts.push(alert);
      newAlerts.push(alert);
    }

    database.routes.push(...finalRoutes);

    const metrics = computeMetrics(finalRoutes, employees, office);

    database.meta = database.meta || {};
    database.meta.lastGeneratedAt = generatedAt;
    db.save();

    res.json({
      routes: finalRoutes.map((r) => sanitizeForUser(r, req)),
      alerts: newAlerts,
      metrics,
      timings,
    });
  })
);

// ---------------------------------------------------------------------------
// DELETE /admin/routes?shiftId=
// ---------------------------------------------------------------------------
router.delete('/admin/routes', requireRole('admin'), (req, res) => {
  const database = db.get();
  const { shiftId } = req.query;
  if (!shiftId) return res.status(400).json({ error: 'bad_request', detail: 'shiftId required' });
  const before = database.routes.length;
  database.routes = database.routes.filter((r) => r.shiftId !== shiftId);
  const deleted = before - database.routes.length;
  db.save();
  res.json({ deleted });
});

// ---------------------------------------------------------------------------
// GET /routes?shiftId=&vendorId=&driverId=&status=
// ---------------------------------------------------------------------------
router.get('/routes', requireRole('admin', 'vendor', 'driver'), (req, res) => {
  const database = db.get();
  const { shiftId, vendorId, driverId, status } = req.query;
  let routes = database.routes;
  if (shiftId) routes = routes.filter((r) => r.shiftId === shiftId);
  if (vendorId) routes = routes.filter((r) => r.vendorId === vendorId);
  if (driverId) routes = routes.filter((r) => r.driverId === driverId);
  if (status) routes = routes.filter((r) => r.status === status);
  res.json({ routes: routes.map((r) => sanitizeForUser(r, req)) });
});

// ---------------------------------------------------------------------------
// GET /routes/:id
// ---------------------------------------------------------------------------
router.get('/routes/:id', requireRole('admin', 'vendor', 'driver'), (req, res) => {
  const database = db.get();
  const route = database.routes.find((r) => r.id === req.params.id);
  if (!route) return res.status(404).json({ error: 'not_found' });
  res.json({ route: sanitizeForUser(route, req) });
});

// ---------------------------------------------------------------------------
// GET /alerts?status=
// ---------------------------------------------------------------------------
router.get('/alerts', requireRole('admin'), (req, res) => {
  const database = db.get();
  const { status } = req.query;
  const alerts = status ? database.alerts.filter((a) => a.status === status) : database.alerts;
  res.json({ alerts });
});

// ---------------------------------------------------------------------------
// PATCH /alerts/:id  { action: 'resolve' | 'dismiss', lat?, lng? }
// ---------------------------------------------------------------------------
router.patch('/alerts/:id', requireRole('admin'), (req, res) => {
  const database = db.get();
  const alert = database.alerts.find((a) => a.id === req.params.id);
  if (!alert) return res.status(404).json({ error: 'not_found' });

  const { action, lat, lng } = req.body || {};
  if (!['resolve', 'dismiss'].includes(action)) {
    return res.status(400).json({ error: 'bad_request', detail: "action must be 'resolve' or 'dismiss'" });
  }

  let employee = null;
  if (action === 'dismiss') {
    alert.status = 'dismissed';
    alert.resolvedAt = new Date().toISOString();
  } else {
    if (alert.type === 'invalid_address') {
      if (typeof lat !== 'number' || typeof lng !== 'number') {
        return res.status(400).json({ error: 'bad_request', detail: 'lat and lng are required to resolve an invalid_address alert' });
      }
      employee = database.employees.find((e) => e.id === alert.employeeId);
      if (employee) {
        employee.lat = lat;
        employee.lng = lng;
        employee.addressValid = true;
      }
    }
    alert.status = 'resolved';
    alert.resolvedAt = new Date().toISOString();
  }

  db.save();
  res.json({ alert, ...(employee ? { employee } : {}) });
});

// ---------------------------------------------------------------------------
// GET /metrics?shiftId=
// ---------------------------------------------------------------------------
router.get('/metrics', requireRole('admin'), (req, res) => {
  const database = db.get();
  const { shiftId } = req.query;
  const routes = shiftId ? database.routes.filter((r) => r.shiftId === shiftId) : database.routes;
  const employees = shiftId ? database.employees.filter((e) => e.shiftId === shiftId) : database.employees;
  const metrics = computeMetrics(routes, employees, database.office);
  res.json({ metrics });
});

export default router;
