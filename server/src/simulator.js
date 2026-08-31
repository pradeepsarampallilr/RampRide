// GPS simulator — CONTRACTS §12. Decodes route.geometry, walks it at
// AVG_SPEED_KMH * SIM_SPEED_MULTIPLIER, and emits driver_location_update / proximity_alert /
// stop_status / route_status / sim_ended over socket.io. One sim per route.
//
// Pause/resume works by polling the *live* in-memory route object (same object db.js hands out
// to every module) on every tick: when the stop at route.currentSeq is 'arrived', the tick stops
// advancing traveled distance. driver.js's verify-pin handler simply increments route.currentSeq
// and flips the stop to 'verified' — the very next tick sees the new currentSeq/status and
// resumes automatically. No direct simulator<->driver-route coupling needed.
import * as db from './db.js';
import { decodePolyline, pointAlongPath, haversineM } from './geo.js';
import { PROXIMITY_RADIUS_M, SIM_TICK_MS, SIM_SPEED_MULTIPLIER, AVG_SPEED_KMH } from './config.js';

const SAVE_THROTTLE_MS = 2000;

/** routeId -> simulator state */
const running = new Map();

function roomFor(routeId) {
  return `route:${routeId}`;
}

function buildCumulativeLengths(points) {
  const cum = [0];
  for (let i = 1; i < points.length; i++) {
    cum.push(cum[i - 1] + haversineM(points[i - 1], points[i]));
  }
  return cum;
}

/** Finds the index of the path point nearest to `target`, searching forward from `startIndex`. */
function nearestIndexFrom(points, target, startIndex) {
  let bestIdx = startIndex;
  let bestDist = Infinity;
  for (let i = startIndex; i < points.length; i++) {
    const d = haversineM(points[i], target);
    if (d < bestDist) {
      bestDist = d;
      bestIdx = i;
    }
  }
  return bestIdx;
}

/** Maps each stop's seq -> cumulative meters-from-start milestone along the decoded path. */
function buildMilestones(points, cumLen, stops) {
  const milestones = new Map();
  let searchFrom = 0;
  for (const stop of stops) {
    const idx = nearestIndexFrom(points, stop, searchFrom);
    milestones.set(stop.seq, cumLen[idx]);
    searchFrom = idx;
  }
  return milestones;
}

function estimateEtaMin(distanceM) {
  const hours = distanceM / 1000 / AVG_SPEED_KMH;
  return Math.max(0, Math.round(hours * 60));
}

/**
 * Starts replaying `routeId`'s geometry as a live GPS stream. No-op (returns false) if the route
 * is unknown, has no geometry, or a sim is already running for it.
 * @param {import('socket.io').Server} io
 * @param {string} routeId
 * @param {number} [speedMultiplier] optional override of SIM_SPEED_MULTIPLIER (defaults to 1x that constant)
 */
export function startSim(io, routeId, speedMultiplier = 1) {
  if (running.has(routeId)) return false;

  const database = db.get();
  const route = database.routes.find((r) => r.id === routeId);
  if (!route || !route.geometry) return false;

  const points = decodePolyline(route.geometry);
  if (points.length < 2) return false;

  const cumLen = buildCumulativeLengths(points);
  const totalLengthM = cumLen[cumLen.length - 1];
  const milestones = buildMilestones(points, cumLen, route.stops);

  route.status = 'in_progress';
  route.startedAt = route.startedAt || new Date().toISOString();
  route.currentSeq = route.currentSeq || 1;
  db.save();
  io.to(roomFor(routeId)).emit('route_status', { routeId, status: 'in_progress' });

  const speedMps = (AVG_SPEED_KMH * SIM_SPEED_MULTIPLIER * speedMultiplier * 1000) / 3600;

  const state = {
    timer: null,
    points,
    cumLen,
    totalLengthM,
    milestones,
    traveledM: 0,
    firedStops: new Set(),
    lastSaveAt: Date.now(),
  };

  state.timer = setInterval(() => tick(io, routeId, speedMps), SIM_TICK_MS);
  running.set(routeId, state);
  return true;
}

function finishRoute(io, routeId, state) {
  const database = db.get();
  const route = database.routes.find((r) => r.id === routeId);
  if (route) {
    route.status = 'completed';
    route.completedAt = new Date().toISOString();
    db.save();
  }
  io.to(roomFor(routeId)).emit('route_status', { routeId, status: 'completed' });
  io.to(roomFor(routeId)).emit('sim_ended', { routeId });
  clearInterval(state.timer);
  running.delete(routeId);
}

function tick(io, routeId, speedMps) {
  const state = running.get(routeId);
  if (!state) return;

  const database = db.get();
  const route = database.routes.find((r) => r.id === routeId);
  if (!route) {
    clearInterval(state.timer);
    running.delete(routeId);
    return;
  }

  const stopsCount = route.stops.length;
  const headingToDepot = route.currentSeq > stopsCount;
  const currentStop = headingToDepot ? null : route.stops.find((s) => s.seq === route.currentSeq);
  const target = headingToDepot ? state.totalLengthM : state.milestones.get(route.currentSeq) ?? state.totalLengthM;

  const paused = !!currentStop && currentStop.status === 'arrived';
  if (!paused) {
    const delta = speedMps * (SIM_TICK_MS / 1000);
    state.traveledM = Math.min(state.traveledM + delta, target);
  }

  const point = pointAlongPath(state.points, state.traveledM);
  if (!point) return;

  const targetCoord = headingToDepot ? database.office : currentStop;
  const distanceToNextM = targetCoord ? haversineM(point, targetCoord) : 0;
  const etaMin = estimateEtaMin(distanceToNextM);

  route.lastLocation = { lat: point.lat, lng: point.lng, bearing: point.bearing, at: new Date().toISOString() };

  io.to(roomFor(routeId)).emit('driver_location_update', {
    routeId,
    lat: point.lat,
    lng: point.lng,
    bearing: point.bearing,
    currentSeq: route.currentSeq,
    etaMin,
    distanceToNextM: Math.round(distanceToNextM),
  });

  if (!headingToDepot && currentStop && distanceToNextM <= PROXIMITY_RADIUS_M && !state.firedStops.has(currentStop.seq)) {
    state.firedStops.add(currentStop.seq);
    io.to(roomFor(routeId)).emit('proximity_alert', {
      routeId,
      seq: currentStop.seq,
      employeeId: currentStop.employeeId,
      distanceM: Math.round(distanceToNextM),
    });
    if (currentStop.status === 'pending') {
      currentStop.status = 'arrived';
      io.to(roomFor(routeId)).emit('stop_status', { routeId, seq: currentStop.seq, status: 'arrived' });
    }
  }

  if (headingToDepot && state.traveledM >= state.totalLengthM) {
    finishRoute(io, routeId, state);
    return;
  }

  if (Date.now() - state.lastSaveAt >= SAVE_THROTTLE_MS) {
    db.save();
    state.lastSaveAt = Date.now();
  }
}

/** Stops a running sim for `routeId`. No-op (returns false) if none is running. */
export function stopSim(routeId) {
  const state = running.get(routeId);
  if (!state) return false;
  clearInterval(state.timer);
  running.delete(routeId);
  return true;
}

/** @returns {string[]} routeIds with an active simulator. */
export function simStatus() {
  return Array.from(running.keys());
}
