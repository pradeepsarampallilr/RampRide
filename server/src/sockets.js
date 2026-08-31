// Socket.io wiring — CONTRACTS §7. Namespace '/'. Rooms are `route:<routeId>`.
// Server is authoritative: client-emitted driver_location_update is enriched with
// currentSeq/etaMin/distanceToNextM (read from the live in-memory route) before being echoed.
import * as db from './db.js';
import { haversineM } from './geo.js';
import { AVG_SPEED_KMH } from './config.js';

function roomFor(routeId) {
  return `route:${routeId}`;
}

/** Computes a rough live ETA (minutes) to the next stop from a raw distance in meters. */
function estimateEtaMin(distanceM) {
  const kmh = AVG_SPEED_KMH;
  const hours = distanceM / 1000 / kmh;
  return Math.max(0, Math.round(hours * 60));
}

export function registerSockets(io) {
  io.on('connection', (socket) => {
    socket.on('subscribe_route', (payload) => {
      const routeId = payload && payload.routeId;
      if (!routeId) return;
      socket.join(roomFor(routeId));
    });

    socket.on('unsubscribe_route', (payload) => {
      const routeId = payload && payload.routeId;
      if (!routeId) return;
      socket.leave(roomFor(routeId));
    });

    socket.on('driver_location_update', (payload) => {
      const { routeId, lat, lng, bearing } = payload || {};
      if (!routeId || typeof lat !== 'number' || typeof lng !== 'number') return;

      const database = db.get();
      const route = database.routes.find((r) => r.id === routeId);
      if (!route) return;

      const resolvedBearing = typeof bearing === 'number' ? bearing : route.lastLocation?.bearing ?? 0;
      route.lastLocation = { lat, lng, bearing: resolvedBearing, at: new Date().toISOString() };

      const nextStop = route.stops.find((s) => s.seq === route.currentSeq);
      const distanceToNextM = nextStop ? Math.round(haversineM({ lat, lng }, nextStop)) : 0;
      const etaMin = estimateEtaMin(distanceToNextM);

      db.save();

      io.to(roomFor(routeId)).emit('driver_location_update', {
        routeId,
        lat,
        lng,
        bearing: resolvedBearing,
        currentSeq: route.currentSeq,
        etaMin,
        distanceToNextM,
      });
    });

    socket.on('disconnect', () => {
      // Rooms are cleaned up automatically by socket.io on disconnect.
    });
  });
}
