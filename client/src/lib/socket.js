import { io } from 'socket.io-client';

let socket = null;

/** Lazily creates and returns the single shared socket.io client instance (CONTRACTS §13). */
export function getSocket() {
  if (!socket) {
    socket = io({ transports: ['websocket', 'polling'] });
  }
  return socket;
}

/**
 * Subscribes to a route's live events (CONTRACTS §7) and returns an unsubscribe function that
 * removes every listener it added and emits `unsubscribe_route`. Listener leaks are the #1 bug
 * risk here — every effect that calls this MUST call the returned function on cleanup.
 * @param {string} routeId
 * @param {{
 *   onLocation?: (payload:{routeId,lat,lng,bearing,currentSeq,etaMin,distanceToNextM}) => void,
 *   onProximityAlert?: (payload:{routeId,seq,employeeId,distanceM}) => void,
 *   onStopStatus?: (payload:{routeId,seq,status}) => void,
 *   onRouteStatus?: (payload:{routeId,status}) => void,
 *   onSimEnded?: (payload:{routeId}) => void,
 * }} handlers
 * @returns {() => void} unsubscribe
 */
export function subscribeRoute(routeId, handlers = {}) {
  const s = getSocket();
  const { onLocation, onProximityAlert, onStopStatus, onRouteStatus, onSimEnded } = handlers;

  const filterRoute = (fn) => (payload) => {
    if (!payload || payload.routeId !== routeId) return;
    fn?.(payload);
  };

  const locationHandler = filterRoute(onLocation);
  const proximityHandler = filterRoute(onProximityAlert);
  const stopStatusHandler = filterRoute(onStopStatus);
  const routeStatusHandler = filterRoute(onRouteStatus);
  const simEndedHandler = filterRoute(onSimEnded);

  s.emit('subscribe_route', { routeId });
  s.on('driver_location_update', locationHandler);
  s.on('proximity_alert', proximityHandler);
  s.on('stop_status', stopStatusHandler);
  s.on('route_status', routeStatusHandler);
  s.on('sim_ended', simEndedHandler);

  return function unsubscribe() {
    s.off('driver_location_update', locationHandler);
    s.off('proximity_alert', proximityHandler);
    s.off('stop_status', stopStatusHandler);
    s.off('route_status', routeStatusHandler);
    s.off('sim_ended', simEndedHandler);
    s.emit('unsubscribe_route', { routeId });
  };
}
