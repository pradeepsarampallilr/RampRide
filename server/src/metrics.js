// ROI + sustainability math (CONTRACTS.md §10). Pure function, no I/O.

import { COST_PER_KM, CO2_KG_PER_KM } from './config.js';
import { haversineKm } from './geo.js';

function round1(n) {
  return Math.round(n * 10) / 10;
}
function round0(n) {
  return Math.round(n);
}

/**
 * @param {object[]} routes  freshly generated (or stored) Route objects (§4)
 * @param {object[]} employees full employee records, used to look up lat/lng for baseline math
 * @param {{lat:number,lng:number}} office
 */
export function computeMetrics(routes, employees, office) {
  const byId = new Map(employees.map((e) => [e.id, e]));

  const routedEmployeeIds = routes.flatMap((r) => r.stops.map((s) => s.employeeId));
  const employeesRouted = routedEmployeeIds.length;
  const cabsUsed = routes.length;

  const baselineKm = routedEmployeeIds.reduce((sum, empId) => {
    const emp = byId.get(empId);
    if (!emp || emp.lat == null || emp.lng == null) return sum;
    return sum + 2 * haversineKm(office, emp) * 1.35;
  }, 0);

  const optimizedKm = routes.reduce((sum, r) => sum + (r.distanceKm || 0), 0);
  const kmSaved = Math.max(0, baselineKm - optimizedKm);
  const kmSavedPct = baselineKm > 0 ? (kmSaved / baselineKm) * 100 : 0;

  const cabsSaved = employeesRouted - cabsUsed;

  const totalCapacity = routes.reduce((sum, r) => sum + (r.capacity || 0), 0);
  const occupancyPct = totalCapacity > 0 ? (employeesRouted / totalCapacity) * 100 : 0;

  const costOptimized = optimizedKm * COST_PER_KM;
  const costBaseline = baselineKm * COST_PER_KM;
  const costSaved = kmSaved * COST_PER_KM;
  const co2SavedKg = kmSaved * CO2_KG_PER_KM;

  const escortFlagged = routes.filter((r) => r.flags && r.flags.escortRequired).length;
  const routesReordered = routes.filter((r) => r.flags && r.flags.reorderedForSafety).length;

  const avgRideMin =
    cabsUsed > 0 ? routes.reduce((sum, r) => sum + (r.durationMin || 0), 0) / cabsUsed : 0;

  return {
    employeesRouted,
    cabsUsed,
    cabsSaved,
    occupancyPct: round0(occupancyPct),
    optimizedKm: round1(optimizedKm),
    baselineKm: round1(baselineKm),
    kmSaved: round1(kmSaved),
    kmSavedPct: round0(kmSavedPct),
    costOptimized: round0(costOptimized),
    costBaseline: round0(costBaseline),
    costSaved: round0(costSaved),
    co2SavedKg: round1(co2SavedKg),
    escortFlagged,
    routesReordered,
    avgRideMin: round0(avgRideMin),
  };
}

export default computeMetrics;
