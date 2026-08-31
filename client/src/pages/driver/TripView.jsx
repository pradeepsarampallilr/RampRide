import { useEffect, useMemo, useRef, useState } from 'react';
import { MapPin, Clock3, ShieldAlert, CheckCircle2, Lock, Moon, PartyPopper } from 'lucide-react';
import MapView from '../../components/MapView';
import RoutePolyline from '../../components/RoutePolyline';
import StopMarkers from '../../components/StopMarkers';
import VehicleMarker from '../../components/VehicleMarker';
import Badge from '../../components/Badge';
import PinPad from '../../components/PinPad';
import api from '../../lib/api';
import { subscribeRoute } from '../../lib/socket';
import { km, minsFromNow } from '../../lib/format';

const OFFICE_FALLBACK = { lat: 17.4435, lng: 78.3772 };

const ERROR_MESSAGES = {
  bad_pin: () => 'Incorrect PIN',
  wrong_state: () => "This stop can't be verified right now",
};

/** Live trip screen (CONTRACTS §7/§13). Renders a map with the moving cab plus a bottom card
 * for the current stop, gated by the 50 m proximity rule until the driver can enter the PIN. */
export default function TripView({ initialRoute, initialPassengers = [], onExit }) {
  const [route, setRoute] = useState(initialRoute);
  const [live, setLive] = useState({
    lat: initialRoute?.lastLocation?.lat ?? null,
    lng: initialRoute?.lastLocation?.lng ?? null,
    bearing: initialRoute?.lastLocation?.bearing ?? 0,
    currentSeq: initialRoute?.currentSeq ?? 1,
    etaMin: null,
    distanceToNextM: null,
  });
  const [arrived, setArrived] = useState(() => {
    const stop = initialRoute?.stops?.find((s) => s.seq === initialRoute?.currentSeq);
    return stop?.status === 'arrived';
  });
  const [pinError, setPinError] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [confirmMsg, setConfirmMsg] = useState('');
  const [finished, setFinished] = useState(initialRoute?.status === 'completed');

  const lastCoordsRef = useRef({ lat: live.lat, lng: live.lng });
  const finishedRef = useRef(finished);
  const prevSeqRef = useRef(live.currentSeq);

  // Reset the arrived/error state whenever the server actually moves us to a new stop —
  // guarded so it doesn't clobber the "already arrived on reload" state computed above.
  useEffect(() => {
    if (prevSeqRef.current !== live.currentSeq) {
      prevSeqRef.current = live.currentSeq;
      setArrived(false);
      setPinError('');
    }
  }, [live.currentSeq]);

  useEffect(() => {
    const routeId = initialRoute?.id;
    if (!routeId) return undefined;

    const unsubscribe = subscribeRoute(routeId, {
      onLocation(payload) {
        setLive({
          lat: payload.lat,
          lng: payload.lng,
          bearing: payload.bearing,
          currentSeq: payload.currentSeq,
          etaMin: payload.etaMin,
          distanceToNextM: payload.distanceToNextM,
        });
        lastCoordsRef.current = { lat: payload.lat, lng: payload.lng };
      },
      onProximityAlert(payload) {
        if (payload.seq !== prevSeqRef.current) return;
        if (typeof navigator !== 'undefined' && navigator.vibrate) {
          navigator.vibrate(200);
        }
        setArrived(true);
      },
      onStopStatus(payload) {
        setRoute((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            stops: (prev.stops || []).map((s) =>
              s.seq === payload.seq ? { ...s, status: payload.status } : s
            ),
          };
        });
      },
      onRouteStatus(payload) {
        setRoute((prev) => (prev ? { ...prev, status: payload.status } : prev));
        if (payload.status === 'completed') finishTrip(routeId);
      },
      onSimEnded() {
        finishTrip(routeId);
      },
    });

    return unsubscribe;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialRoute?.id]);

  async function finishTrip(routeId) {
    if (finishedRef.current) return;
    finishedRef.current = true;
    try {
      const { data } = await api.post('/driver/finish', { routeId });
      if (data?.route) setRoute(data.route);
    } catch {
      // The drive is over either way — still show the summary.
    } finally {
      setFinished(true);
    }
  }

  const stops = route?.stops || [];
  const currentStop = useMemo(
    () => stops.find((s) => s.seq === live.currentSeq),
    [stops, live.currentSeq]
  );
  const returningToDepot = !finished && !currentStop && stops.length > 0;

  const mapCenter = live.lat != null && live.lng != null
    ? [live.lat, live.lng]
    : currentStop
      ? [currentStop.lat, currentStop.lng]
      : [OFFICE_FALLBACK.lat, OFFICE_FALLBACK.lng];

  const bounds = useMemo(() => {
    const pts = stops.map((s) => [s.lat, s.lng]);
    if (live.lat != null && live.lng != null) pts.push([live.lat, live.lng]);
    return pts.length > 1 ? pts : undefined;
  }, [stops, live.lat, live.lng]);

  async function handlePinSubmit(pin) {
    if (!currentStop || verifying) return;
    setVerifying(true);
    setPinError('');
    try {
      const { lat, lng } = lastCoordsRef.current || {};
      const { data } = await api.post('/driver/verify-pin', {
        routeId: route.id,
        seq: currentStop.seq,
        pin,
        lat,
        lng,
      });
      if (data?.route) {
        setRoute(data.route);
        const nextSeq = data.route.currentSeq ?? 0;
        setConfirmMsg('Verified! Moving to the next stop.');
        setTimeout(() => setConfirmMsg(''), 2500);
        if (nextSeq > (data.route.stops?.length || 0)) {
          finishTrip(route.id);
        }
      }
    } catch (e) {
      const err = e?.response?.data;
      if (err?.error === 'too_far') {
        setPinError(`Move closer — ${Math.round(err.distanceM ?? 0)}m away`);
      } else {
        setPinError(ERROR_MESSAGES[err?.error]?.() || err?.error || 'Could not verify PIN');
      }
    } finally {
      setVerifying(false);
    }
  }

  if (finished) {
    const verifiedCount = stops.filter((s) => s.status === 'done').length;
    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-4 py-10 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
          <PartyPopper className="h-7 w-7" />
        </div>
        <div>
          <p className="text-lg font-semibold text-slate-900">Trip completed</p>
          <p className="text-sm text-slate-500">Route {route.id} is done — nice driving.</p>
        </div>
        <div className="grid w-full grid-cols-3 gap-2">
          <div className="rounded-lg bg-slate-50 p-3">
            <p className="text-xs text-slate-500">Stops</p>
            <p className="text-sm font-semibold text-slate-800">{verifiedCount}/{stops.length}</p>
          </div>
          <div className="rounded-lg bg-slate-50 p-3">
            <p className="text-xs text-slate-500">Distance</p>
            <p className="text-sm font-semibold text-slate-800">{km(route.distanceKm)}</p>
          </div>
          <div className="rounded-lg bg-slate-50 p-3">
            <p className="text-xs text-slate-500">Duration</p>
            <p className="text-sm font-semibold text-slate-800">{Math.round(route.durationMin || 0)} min</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => onExit?.()}
          className="w-full rounded-xl bg-indigo-600 py-3 text-sm font-semibold text-white"
        >
          Done
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-md flex-col gap-4 pb-6">
      <div className="h-72 overflow-hidden rounded-xl border border-slate-200 shadow-sm">
        <MapView center={mapCenter} zoom={13} bounds={bounds} className="h-full w-full">
          <RoutePolyline geometry={route?.geometry} />
          <StopMarkers stops={stops} activeSeq={live.currentSeq} />
          <VehicleMarker lat={live.lat} lng={live.lng} bearing={live.bearing} />
        </MapView>
      </div>

      <div className="flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
          Route {route?.id} · Stop {Math.min(live.currentSeq, stops.length)}/{stops.length}
        </p>
        {route?.flags?.isNight ? (
          <Badge tone="night">
            <Moon className="h-3 w-3" /> Night
          </Badge>
        ) : null}
      </div>

      {returningToDepot ? (
        <div className="rounded-xl border border-slate-200 bg-white p-4 text-center shadow-sm">
          <p className="text-sm font-semibold text-slate-900">Returning to depot</p>
          <p className="mt-1 text-xs text-slate-500">All passengers dropped — heading back to the hub.</p>
        </div>
      ) : currentStop ? (
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-1.5">
              <p className="text-sm font-semibold text-slate-900">{currentStop.name}</p>
              <Badge tone={currentStop.gender === 'F' ? 'female' : 'male'}>{currentStop.gender}</Badge>
              {currentStop.escortRequired ? (
                <Badge tone="escort">
                  <ShieldAlert className="h-3 w-3" /> Escort
                </Badge>
              ) : null}
            </div>
            <Badge tone={arrived ? 'progress' : 'planned'}>{arrived ? 'Arrived' : 'En route'}</Badge>
          </div>
          <p className="mt-2 flex items-center gap-1 text-xs text-slate-500">
            <MapPin className="h-3 w-3 shrink-0" />
            <span className="truncate">{currentStop.address}</span>
          </p>
          <div className="mt-3 grid grid-cols-2 gap-2 text-center">
            <div className="rounded-lg bg-slate-50 p-2">
              <p className="text-xs text-slate-500">Distance</p>
              <p className="text-sm font-semibold text-slate-800">
                {live.distanceToNextM != null ? `${Math.round(live.distanceToNextM)} m` : '—'}
              </p>
            </div>
            <div className="rounded-lg bg-slate-50 p-2">
              <p className="text-xs text-slate-500 flex items-center justify-center gap-1">
                <Clock3 className="h-3 w-3" /> ETA
              </p>
              <p className="text-sm font-semibold text-slate-800">
                {live.etaMin != null ? minsFromNow(live.etaMin) : '—'}
              </p>
            </div>
          </div>

          {currentStop.escortRequired ? (
            <div className="mt-3 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm font-medium text-rose-700">
              <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
              Security escort required — do not depart without escort.
            </div>
          ) : null}

          {confirmMsg ? (
            <div className="mt-3 flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-medium text-emerald-700">
              <CheckCircle2 className="h-4 w-4 shrink-0" /> {confirmMsg}
            </div>
          ) : (
            <div className="mt-4">
              {!arrived ? (
                <div className="flex items-center justify-center gap-2 rounded-xl border border-dashed border-slate-200 bg-slate-50 py-3 text-sm text-slate-500">
                  <Lock className="h-4 w-4" />
                  PIN unlocks within 50 m —{' '}
                  {live.distanceToNextM != null ? `${Math.round(live.distanceToNextM)}m away` : '…'}
                </div>
              ) : null}
              <div className="mt-3">
                <PinPad
                  length={4}
                  onSubmit={handlePinSubmit}
                  error={pinError}
                  disabled={!arrived || verifying}
                  hint={arrived ? 'Enter the passenger’s 4-digit PIN' : undefined}
                />
              </div>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
