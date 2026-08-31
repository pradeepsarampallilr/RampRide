#!/usr/bin/env node
// Runnable harness for the optimization engine (WAVE 2-A). Loads db.json directly, runs the
// solver for each seeded shift, prints a compact report, and asserts the invariants CONTRACTS.md
// promises. Run with: node tools/test-solver.js  (or `npm run test:solver` from server/).

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { table } from '../src/osrm.js';
import solve from '../src/solver.js';
import { computeMetrics } from '../src/metrics.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, '..', 'db.json');

const db = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));

const assertions = [];
function assert(label, condition) {
  assertions.push({ label, pass: !!condition });
}

function genderLetter(g) {
  return g || '?';
}

function fmtKm(n) {
  return `${n.toFixed(1)}km`;
}

const SHIFT_IDS = ['S1', 'S2', 'S3', 'S4'];
const perShift = {}; // shiftId -> { routes, alerts, metrics, employees }

for (const shiftId of SHIFT_IDS) {
  const shift = db.shifts.find((s) => s.id === shiftId);
  if (!shift) {
    console.log(`\n=== ${shiftId}: NOT FOUND IN db.json — skipping ===`);
    continue;
  }

  const employees = db.employees.filter((e) => e.shiftId === shiftId && e.addressValid);
  const vehicles = db.vehicles.filter((v) => v.status === 'available');
  const coords = [db.office, ...employees.map((e) => ({ lat: e.lat, lng: e.lng }))];

  // eslint-disable-next-line no-await-in-loop
  const matrix = await table(coords); // network is expected to fail in this sandbox -> null

  const { routes, alerts, stats } = solve({
    office: db.office,
    employees,
    vehicles,
    shift,
    matrix,
  });

  const metrics = computeMetrics(routes, employees, db.office);

  perShift[shiftId] = { shift, employees, routes, alerts, metrics, stats };

  console.log(`\n=== ${shiftId} — ${shift.label} (${shift.direction}, ${shift.isNight ? 'NIGHT' : 'day'}) ===`);
  console.log(`employees eligible: ${employees.length}, matrix: ${matrix ? 'OSRM' : 'haversine fallback'}`);

  routes.forEach((r) => {
    const seqStr = r.stops.map((s) => `${s.seq}:${s.name}(${genderLetter(s.gender)})`).join(' -> ');
    console.log(
      `  ${r.id}  pax=${r.stops.length}/${r.capacity}  dist=${fmtKm(r.distanceKm)}  ` +
        `straight=${fmtKm(r.straightLineKm)}  dur=${r.durationMin}min  ` +
        `flags=${JSON.stringify(r.flags)}`
    );
    console.log(`    stops: ${seqStr}`);
  });

  if (alerts.length === 0) {
    console.log('  alerts: (none)');
  } else {
    alerts.forEach((a) => console.log(`  ALERT [${a.type}/${a.severity}] ${a.message}`));
  }

  console.log(`  metrics: ${JSON.stringify(metrics)}`);

  // --- per-shift assertions -------------------------------------------------

  const routedIds = routes.flatMap((r) => r.stops.map((s) => s.employeeId));
  const uniqueRoutedIds = new Set(routedIds);
  assert(
    `${shiftId}: every addressValid employee appears in exactly one route`,
    routedIds.length === uniqueRoutedIds.size &&
      employees.every((e) => uniqueRoutedIds.has(e.id)) &&
      uniqueRoutedIds.size === employees.length
  );

  assert(
    `${shiftId}: no route exceeds its capacity`,
    routes.every((r) => r.stops.length <= r.capacity)
  );

  assert(
    `${shiftId}: every route's stop seqs are 1..n with no gaps`,
    routes.every((r) => r.stops.every((s, i) => s.seq === i + 1))
  );

  if (shiftId === 'S1') {
    assert(
      'S1: no route ends on a female stop unless flags.escortRequired',
      routes.every((r) => {
        const last = r.stops[r.stops.length - 1];
        return last.gender !== 'F' || r.flags.escortRequired;
      })
    );
  }

  if (shiftId === 'S2') {
    assert(
      'S2: no route starts on a female stop unless flags.escortRequired',
      routes.every((r) => {
        const first = r.stops[0];
        return first.gender !== 'F' || r.flags.escortRequired;
      })
    );
  }

  assert(
    `${shiftId}: optimizedKm < baselineKm and cabsSaved > 0`,
    metrics.optimizedKm < metrics.baselineKm && metrics.cabsSaved > 0
  );
}

// --- cross-cutting assertion: the lone Shamirpet female (S1) triggers lone_female_night -------
const s1 = perShift.S1;
if (s1) {
  const shamirpetFemale = s1.employees.find(
    (e) => e.gender === 'F' && e.lat > 17.55 && e.lng > 78.5
  );
  const gotAlert =
    shamirpetFemale &&
    s1.alerts.some(
      (a) => a.type === 'lone_female_night' && a.employeeId === shamirpetFemale.id
    );
  assert(
    'S1: lone Shamirpet female produces a lone_female_night alert',
    !!shamirpetFemale && !!gotAlert
  );
} else {
  assert('S1: lone Shamirpet female produces a lone_female_night alert', false);
}

// --- summary ------------------------------------------------------------------------------
console.log('\n=== ASSERTIONS ===');
let failed = 0;
for (const { label, pass } of assertions) {
  console.log(`[${pass ? 'PASS' : 'FAIL'}] ${label}`);
  if (!pass) failed++;
}

console.log(`\n${assertions.length - failed}/${assertions.length} assertions passed.`);

if (failed > 0) {
  process.exit(1);
}
