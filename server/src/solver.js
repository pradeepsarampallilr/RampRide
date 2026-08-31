// Route optimizer (CONTRACTS.md §8). Pure, synchronous — no network, no fs. Only imports are
// config.js and geo.js, as required.
//
// NODE INDEX CONVENTION (used throughout this file): node 0 is always OFFICE. Node i+1 is
// always employees[i] (the i-th element of the `employees` array passed in). Any function here
// that takes numeric node indices follows this convention unless documented otherwise.
//
// Vehicle-matching note: the solver only *plans* a capacity class for each route (the `capacity`
// field), so the UI can show how big a cab is needed and the demo can flag overflow. It does not
// commit `vehicleId` / `driverId` / `vendorId` — those stay `null` and `status` stays `planned`
// until a vendor actually assigns a real driver + vehicle via POST /vendor/assign (§6). This
// matches the FROZEN §4 example, which shows `vehicleId: null` alongside a populated `capacity`.

import { AVG_SPEED_KMH, MAX_DETOUR_FACTOR } from './config.js';
import { haversineKm, bearingDeg } from './geo.js';

const ROAD_FACTOR = 1.35;
const SWEEP_ANGLE_STEPS = [60, 120, Infinity];
const INSERTION_OFFICE_WEIGHT = 0.3;
const MAX_TWO_OPT_SWAPS = 200;

function angularGapDeg(a, b) {
  const diff = Math.abs(a - b) % 360;
  return diff > 180 ? 360 - diff : diff;
}

function randomPin() {
  return String(Math.floor(1000 + Math.random() * 9000));
}

function addMinutesToClock(hhmm, minutes) {
  const [h, m] = hhmm.split(':').map(Number);
  let total = h * 60 + m + Math.round(minutes);
  total = ((total % 1440) + 1440) % 1440;
  const hh = String(Math.floor(total / 60)).padStart(2, '0');
  const mm = String(total % 60).padStart(2, '0');
  return `${hh}:${mm}`;
}

/** Builds { nodes, distFn, durFn } — nodes[0] = office, nodes[i+1] = employees[i]. */
function buildGraph(office, employees, matrix) {
  const nodes = [office, ...employees];

  let distFn;
  if (matrix && matrix.distances) {
    distFn = (i, j) => matrix.distances[i][j] / 1000; // meters -> km
  } else {
    distFn = (i, j) => haversineKm(nodes[i], nodes[j]) * ROAD_FACTOR;
  }

  let durFn;
  if (matrix && matrix.durations) {
    durFn = (i, j) => matrix.durations[i][j] / 60; // seconds -> minutes
  } else {
    durFn = (i, j) => (distFn(i, j) / AVG_SPEED_KMH) * 60;
  }

  return { nodes, distFn, durFn };
}

/**
 * Step 1+2: sweep seeding + capacity-constrained cluster fill.
 * @returns {number[][]} array of clusters, each a list of employee indices (0-based into `employees`)
 */
function clusterEmployees(employees, distFn, capacityCap, maxCabs) {
  const officeNode = 0;
  const empNode = (empIdx) => empIdx + 1;
  const bearingOf = (idx) => employees[idx].__bearing;

  const unassigned = new Set(employees.map((_, idx) => idx));
  const clusters = [];

  // Pre-compute each employee's distance-from-office (used to pick seeds); it never changes.
  const distFromOffice = employees.map((_, idx) => distFn(officeNode, empNode(idx)));

  while (unassigned.size > 0) {
    // Seed = farthest-from-office unassigned employee.
    let seedIdx = null;
    let seedDist = -Infinity;
    for (const idx of unassigned) {
      if (distFromOffice[idx] > seedDist) {
        seedDist = distFromOffice[idx];
        seedIdx = idx;
      }
    }

    unassigned.delete(seedIdx);
    const cluster = [seedIdx];
    const seedBearing = bearingOf(seedIdx);
    let lastNode = empNode(seedIdx);
    clusters.push(cluster); // reserve the slot now so maxCabs accounting below is accurate

    while (cluster.length < capacityCap && unassigned.size > 0) {
      // A fresh cab can still be opened for whatever is left over once this one closes, so stay
      // strict (60°) and let the outer loop spin up a new cluster rather than overfilling this
      // one. Only widen the angle once every cab slot is spoken for and remaining employees have
      // nowhere else to go (CONTRACTS §8: "Relax the angle ... if ... no cab can be opened.").
      const canOpenAnotherCab = clusters.length < maxCabs;
      const angleSteps = canOpenAnotherCab ? [SWEEP_ANGLE_STEPS[0]] : SWEEP_ANGLE_STEPS;

      let picked = null;

      for (const angleLimit of angleSteps) {
        let bestIdx = null;
        let bestCost = Infinity;

        for (const idx of unassigned) {
          const gap = angularGapDeg(seedBearing, bearingOf(idx));
          if (gap > angleLimit) continue;

          // MAX_DETOUR_FACTOR guard (config.js: "route km vs. straight-line sum guard"): a
          // same-bearing candidate whose own distance-from-office is wildly different from the
          // seed's isn't really in the same cluster — it just happens to share a compass
          // direction. Without this, a lone far-out outlier (e.g. the deliberate Shamirpet case)
          // would get vacuumed into a nearby ring of employees purely because the angle lines up.
          const seedOfficeDist = distFromOffice[seedIdx];
          const candOfficeDist = distFromOffice[idx];
          const detourRatio =
            Math.max(seedOfficeDist, candOfficeDist) / Math.max(Math.min(seedOfficeDist, candOfficeDist), 0.001);
          if (detourRatio > MAX_DETOUR_FACTOR) continue;

          const cost =
            distFn(lastNode, empNode(idx)) - INSERTION_OFFICE_WEIGHT * distFn(officeNode, empNode(idx));
          if (cost < bestCost) {
            bestCost = cost;
            bestIdx = idx;
          }
        }

        if (bestIdx !== null) {
          picked = bestIdx;
          break;
        }
      }

      if (picked === null) break; // nothing fits even at the widest angle available to us

      unassigned.delete(picked);
      cluster.push(picked);
      lastNode = empNode(picked);
    }
  }

  return clusters;
}

/** Step 3a: nearest-neighbour construction starting from the office. */
function nearestNeighbourOrder(clusterEmpIdx, distFn) {
  const officeNode = 0;
  const empNode = (idx) => idx + 1;
  const remaining = new Set(clusterEmpIdx);
  const order = [];
  let current = officeNode;

  while (remaining.size > 0) {
    let bestIdx = null;
    let bestDist = Infinity;
    for (const idx of remaining) {
      const d = distFn(current, empNode(idx));
      if (d < bestDist) {
        bestDist = d;
        bestIdx = idx;
      }
    }
    order.push(bestIdx);
    remaining.delete(bestIdx);
    current = empNode(bestIdx);
  }

  return order;
}

function tourDistance(order, distFn) {
  const officeNode = 0;
  const empNode = (idx) => idx + 1;
  if (order.length === 0) return 0;
  let total = distFn(officeNode, empNode(order[0]));
  for (let i = 0; i < order.length - 1; i++) {
    total += distFn(empNode(order[i]), empNode(order[i + 1]));
  }
  total += distFn(empNode(order[order.length - 1]), officeNode);
  return total;
}

/** Step 3b: 2-opt local search, capped at MAX_TWO_OPT_SWAPS improving swaps. */
function twoOpt(order, distFn) {
  if (order.length < 3) return order;
  let best = order.slice();
  let bestDist = tourDistance(best, distFn);
  let swaps = 0;
  let improved = true;

  while (improved && swaps < MAX_TWO_OPT_SWAPS) {
    improved = false;
    for (let i = 0; i < best.length - 1 && !improved; i++) {
      for (let k = i + 1; k < best.length; k++) {
        const candidate = best
          .slice(0, i)
          .concat(best.slice(i, k + 1).reverse(), best.slice(k + 1));
        const candidateDist = tourDistance(candidate, distFn);
        if (candidateDist + 1e-9 < bestDist) {
          best = candidate;
          bestDist = candidateDist;
          swaps++;
          improved = true;
          break;
        }
      }
    }
  }

  return best;
}

/**
 * Step 4: female night-safety pass (§9). Mutates nothing; returns a new plan describing the
 * (possibly reordered) stop order plus the flags/alerts it produced.
 */
function applyNightSafety({ order, employees, shift, distFn }) {
  const flags = { isNight: !!shift.isNight, escortRequired: false, reorderedForSafety: false };
  const alerts = [];

  if (!shift.isNight) {
    return { order, flags, alerts };
  }

  const genderOf = (empIdx) => employees[empIdx].gender;

  // R1 — lone female escort.
  if (order.length === 1 && genderOf(order[0]) === 'F') {
    flags.escortRequired = true;
    const emp = employees[order[0]];
    alerts.push({
      type: 'lone_female_night',
      severity: 'high',
      employeeId: emp.id,
      employeeName: emp.name,
      shiftId: shift.id,
      message: `${emp.name} is the sole passenger on a night ${shift.direction} route — escort required`,
      rawAddress: null,
      status: 'open',
      createdAt: new Date().toISOString(),
      resolvedAt: null,
      suggestedLat: null,
      suggestedLng: null,
    });
    return { order, flags, alerts };
  }

  const allFemale = order.every((idx) => genderOf(idx) === 'F');
  const checkFirst = shift.direction === 'login';
  const targetPos = checkFirst ? 0 : order.length - 1;
  const isIsolatedEnd = order.length > 1 && genderOf(order[targetPos]) === 'F';

  if (isIsolatedEnd && allFemale) {
    // R4 — every passenger is female: cannot fix by reordering.
    flags.escortRequired = true;
    const emp = employees[order[targetPos]];
    alerts.push({
      type: 'escort_required',
      severity: 'high',
      employeeId: emp.id,
      employeeName: emp.name,
      shiftId: shift.id,
      message: `All-female night route cannot avoid an isolated ${checkFirst ? 'first pickup' : 'last drop-off'} — escort required`,
      rawAddress: null,
      status: 'open',
      createdAt: new Date().toISOString(),
      resolvedAt: null,
      suggestedLat: null,
      suggestedLng: null,
    });
    return { order, flags, alerts };
  }

  if (isIsolatedEnd && !allFemale) {
    // R2/R3 — swap with the nearest preceding (logout) / following (login) non-female stop,
    // choosing whichever candidate swap adds the least distance to the tour.
    let bestSwapPos = null;
    let bestDist = Infinity;
    const candidatePositions = checkFirst
      ? order.map((_, i) => i).filter((i) => i !== targetPos)
      : order.map((_, i) => i).filter((i) => i !== targetPos);

    for (const pos of candidatePositions) {
      if (genderOf(order[pos]) === 'F') continue;
      const swapped = order.slice();
      [swapped[targetPos], swapped[pos]] = [swapped[pos], swapped[targetPos]];
      const dist = tourDistance(swapped, distFn);
      if (dist < bestDist) {
        bestDist = dist;
        bestSwapPos = pos;
      }
    }

    if (bestSwapPos !== null) {
      const swapped = order.slice();
      [swapped[targetPos], swapped[bestSwapPos]] = [swapped[bestSwapPos], swapped[targetPos]];
      flags.reorderedForSafety = true;
      return { order: swapped, flags, alerts };
    }
  }

  return { order, flags, alerts };
}

function runNightSafety({ order, employees, shift, distFn }) {
  return applyNightSafety({ order, employees, shift, distFn });
}

/** Step 5: assign the smallest capacity class that fits; pool is consumed as classes are used. */
function matchVehicleCapacity(passengerCount, capacityPool) {
  capacityPool.sort((a, b) => a - b);
  for (let i = 0; i < capacityPool.length; i++) {
    if (capacityPool[i] >= passengerCount) {
      const cap = capacityPool[i];
      capacityPool.splice(i, 1);
      return cap;
    }
  }
  return null;
}

/**
 * @param {{
 *   office:   {lat:number,lng:number},
 *   employees:Array<{id,name,gender,lat,lng,address}>,
 *   vehicles: Array<{id,capacity,vendorId,plate,type}>,
 *   shift:    {id,direction:'login'|'logout',time:string,isNight:boolean},
 *   matrix:   {durations:number[][], distances:number[][]} | null
 * }} input
 * @returns {{ routes: object[], alerts: object[], stats: object }}
 */
export default function solve(input) {
  const { office, employees, vehicles, shift, matrix } = input;

  if (!employees || employees.length === 0) {
    return { routes: [], alerts: [], stats: { employeesRouted: 0, cabsUsed: 0 } };
  }

  // Attach bearings once (helper property, not part of the public employee shape).
  const employeesWithBearing = employees.map((e) => ({ ...e, __bearing: bearingDeg(office, e) }));

  const { distFn, durFn } = buildGraph(office, employeesWithBearing, matrix);

  const capacities = (vehicles || []).map((v) => v.capacity);
  const capacityCap = capacities.length > 0 ? Math.max(...capacities) : 6;
  const maxCabs = capacities.length > 0 ? capacities.length : Infinity;

  const clusters = clusterEmployees(employeesWithBearing, distFn, capacityCap, maxCabs);

  const allAlerts = [];
  const routes = [];
  const capacityPool = capacities.slice();

  clusters.forEach((clusterEmpIdx, clusterOrdinal) => {
    let order = nearestNeighbourOrder(clusterEmpIdx, distFn);
    order = twoOpt(order, distFn);

    const safety = runNightSafety({ order, employees: employeesWithBearing, shift, distFn });
    order = safety.order;
    allAlerts.push(...safety.alerts);

    const distanceKm = tourDistance(order, distFn);
    const straightLineKm =
      order.reduce((sum, idx, i) => {
        const prevPoint = i === 0 ? office : employeesWithBearing[order[i - 1]];
        return sum + haversineKm(prevPoint, employeesWithBearing[idx]);
      }, 0) + haversineKm(employeesWithBearing[order[order.length - 1]], office);

    let cumulativeMin = 0;
    const legMinutes = [];
    for (let i = 0; i < order.length; i++) {
      const fromNode = i === 0 ? 0 : order[i - 1] + 1;
      const toNode = order[i] + 1;
      cumulativeMin += durFn(fromNode, toNode);
      legMinutes.push(cumulativeMin);
    }
    const totalDurationMin = (() => {
      let d = 0;
      let prev = 0;
      for (const idx of order) {
        d += durFn(prev, idx + 1);
        prev = idx + 1;
      }
      d += durFn(prev, 0);
      return d;
    })();

    const passengers = order.length;
    const matchedCapacity = matchVehicleCapacity(passengers, capacityPool);

    if (matchedCapacity === null) {
      allAlerts.push({
        type: 'capacity_overflow',
        severity: 'high',
        employeeId: null,
        employeeName: null,
        shiftId: shift.id,
        message: `No available vehicle can seat ${passengers} passengers for this route`,
        rawAddress: null,
        status: 'open',
        createdAt: new Date().toISOString(),
        resolvedAt: null,
        suggestedLat: null,
        suggestedLng: null,
      });
    }

    const departureAnchor =
      shift.direction === 'logout' ? shift.time : addMinutesToClock(shift.time, -totalDurationMin);

    const stops = order.map((empIdx, i) => {
      const emp = employeesWithBearing[empIdx];
      const isTargetSafetyStop =
        safety.flags.escortRequired && order.length === 1 && emp.gender === 'F';
      return {
        seq: i + 1,
        employeeId: emp.id,
        name: emp.name,
        gender: emp.gender,
        lat: emp.lat,
        lng: emp.lng,
        address: emp.address,
        pin: randomPin(),
        etaMin: Math.round(legMinutes[i]),
        etaClock: addMinutesToClock(departureAnchor, legMinutes[i]),
        status: 'pending',
        escortRequired: isTargetSafetyStop,
        verifiedAt: null,
      };
    });

    routes.push({
      id: `R-${shift.id}-${String(clusterOrdinal + 1).padStart(2, '0')}`,
      shiftId: shift.id,
      direction: shift.direction,
      status: 'planned',
      vendorId: null,
      driverId: null,
      vehicleId: null,
      capacity: matchedCapacity !== null ? matchedCapacity : passengers,
      stops,
      geometry: null,
      distanceKm: Math.round(distanceKm * 10) / 10,
      durationMin: Math.round(totalDurationMin),
      straightLineKm: Math.round(straightLineKm * 10) / 10,
      flags: safety.flags,
      createdAt: new Date().toISOString(),
      startedAt: null,
      completedAt: null,
      currentSeq: 1,
      lastLocation: null,
    });
  });

  const stats = {
    employeesRouted: employees.length,
    cabsUsed: routes.length,
    clustersFormed: clusters.length,
  };

  return { routes, alerts: allAlerts, stats };
}
