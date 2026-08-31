import { useCallback, useEffect, useState } from 'react';
import { Car, Copy, Check, Phone, ShieldCheck, Moon, RefreshCw } from 'lucide-react';
import Shell from '../../components/Shell';
import MapView from '../../components/MapView';
import RoutePolyline from '../../components/RoutePolyline';
import StopMarkers from '../../components/StopMarkers';
import VehicleMarker from '../../components/VehicleMarker';
import Badge from '../../components/Badge';
import Spinner from '../../components/Spinner';
import EmptyState from '../../components/EmptyState';
import api from '../../lib/api';
import { getSocket, subscribeRoute } from '../../lib/socket';
import { clock } from '../../lib/format';

const NAV = [{ to: '/employee', label: 'My Ride', icon: Car }];

const STEPS = ['Assigned', 'On the way', 'Arriving', 'Verified', 'Completed'];

function stepIndexFor(route, myStop) {
  const stopStatus = myStop?.status;
  if (stopStatus === 'done') return 4;
  if (stopStatus === 'verified') return 3;
  if (stopStatus === 'arrived') return 2;
  if (route?.status === 'in_progress' || route?.status === 'assigned') return 1;
  return 0;
}

export default function TrackCab() {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [trip, setTrip] = useState(null); // {route, pin, myStop, driver, vehicle, etaMin}
  const [etaMin, setEtaMin] = useState(null);
  const [vehiclePos, setVehiclePos] = useState(null); // {lat, lng, bearing}
  const [stepIndex, setStepIndex] = useState(0);
  const [arrivedBanner, setArrivedBanner] = useState(false);
  const [flashPin, setFlashPin] = useState(false);
  const [copied, setCopied] = useState(false);

  const loadTrip = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const res = await api.get('/employee/trip');
      const data = res.data || {};
      setTrip(data.route ? data : null);
      if (data.etaMin != null) setEtaMin(data.etaMin);
      if (data.route) {
        setStepIndex(stepIndexFor(data.route, data.myStop));
        setVehiclePos(data.route.lastLocation || null);
      }
    } catch {
      setLoadError(true);
      setTrip(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTrip();
  }, [loadTrip]);

  const routeId = trip?.route?.id;
  const mySeq = trip?.myStop?.seq;

  useEffect(() => {
    if (!routeId) return undefined;

    const socket = getSocket();
    subscribeRoute(routeId);

    const onLocation = (payload) => {
      if (payload.routeId !== routeId) return;
      setVehiclePos({ lat: payload.lat, lng: payload.lng, bearing: payload.bearing });
      if (payload.etaMin != null) setEtaMin(payload.etaMin);
    };

    const onProximity = (payload) => {
      if (payload.routeId !== routeId) return;
      if (mySeq != null && payload.seq === mySeq) {
        setArrivedBanner(true);
        setFlashPin(true);
        setStepIndex((s) => Math.max(s, 2));
        setTimeout(() => setFlashPin(false), 4000);
      }
    };

    const onStopStatus = (payload) => {
      if (payload.routeId !== routeId) return;
      if (mySeq != null && payload.seq === mySeq) {
        if (payload.status === 'arrived') setStepIndex((s) => Math.max(s, 2));
        if (payload.status === 'verified') {
          setStepIndex((s) => Math.max(s, 3));
          setArrivedBanner(false);
          setFlashPin(false);
        }
        if (payload.status === 'done') setStepIndex((s) => Math.max(s, 4));
      }
    };

    const onRouteStatus = (payload) => {
      if (payload.routeId !== routeId) return;
      if (payload.status === 'in_progress') setStepIndex((s) => Math.max(s, 1));
      if (payload.status === 'completed') setStepIndex(4);
    };

    socket.on('driver_location_update', onLocation);
    socket.on('proximity_alert', onProximity);
    socket.on('stop_status', onStopStatus);
    socket.on('route_status', onRouteStatus);

    return () => {
      socket.off('driver_location_update', onLocation);
      socket.off('proximity_alert', onProximity);
      socket.off('stop_status', onStopStatus);
      socket.off('route_status', onRouteStatus);
      socket.emit('unsubscribe_route', { routeId });
    };
  }, [routeId, mySeq]);

  const copyPin = () => {
    if (!trip?.pin) return;
    navigator.clipboard?.writeText(trip.pin).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  if (loading) {
    return (
      <Shell title="My Ride" nav={NAV}>
        <div className="flex justify-center py-24">
          <Spinner label="Loading your trip..." />
        </div>
      </Shell>
    );
  }

  if (loadError || !trip?.route) {
    return (
      <Shell title="My Ride" nav={NAV}>
        <EmptyState
          icon={Car}
          title="No cab assigned for your shift yet"
          body="Once routes are generated and a driver is assigned for your shift, your ride will show up here."
          action={
            <button
              onClick={loadTrip}
              className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
            >
              <RefreshCw className="h-4 w-4" />
              Refresh
            </button>
          }
        />
      </Shell>
    );
  }

  const { route, pin, myStop, driver, vehicle } = trip;
  const isNight = !!route.flags?.isNight;
  const vendorName = driver?.vendorName || driver?.vendor?.name || vehicle?.vendorName || vehicle?.vendor?.name;
  const etaClock = etaMin != null ? clock(new Date(Date.now() + etaMin * 60000)) : null;
  const mapCenter = vehiclePos
    ? [vehiclePos.lat, vehiclePos.lng]
    : myStop
    ? [myStop.lat, myStop.lng]
    : [route.stops?.[0]?.lat ?? 17.4435, route.stops?.[0]?.lng ?? 78.3772];
  const bounds = [
    ...(route.stops || []).map((s) => [s.lat, s.lng]),
    ...(vehiclePos ? [[vehiclePos.lat, vehiclePos.lng]] : []),
  ];

  return (
    <Shell title="My Ride" nav={NAV}>
      <div className="mx-auto max-w-md space-y-4 pb-8">
        {isNight && (
          <div className="flex items-center gap-2 rounded-xl bg-violet-900 px-4 py-2.5 text-sm font-medium text-white shadow-sm">
            <Moon className="h-4 w-4 shrink-0" />
            Night shift — safety protocols active
          </div>
        )}

        {arrivedBanner && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm font-medium text-emerald-700 shadow-sm">
            Your cab has arrived — share your PIN
          </div>
        )}

        <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
          <p className="text-sm font-medium text-slate-500">
            {stepIndex >= 4 ? 'Trip completed' : 'Arriving in'}
          </p>
          <p className="mt-1 text-4xl font-bold tracking-tight text-slate-900">
            {stepIndex >= 4 ? 'Done' : etaMin != null ? `${etaMin} min` : '—'}
          </p>
          {etaClock && stepIndex < 4 && <p className="mt-1 text-sm text-slate-400">{etaClock}</p>}
        </div>

        <div className="h-72 overflow-hidden rounded-2xl border border-slate-200 shadow-sm">
          <MapView center={mapCenter} zoom={13} bounds={bounds.length ? bounds : undefined} className="h-full w-full">
            {route.geometry && <RoutePolyline geometry={route.geometry} color="#4f46e5" weight={4} />}
            {route.stops?.length > 0 && <StopMarkers stops={route.stops} activeSeq={myStop?.seq} />}
            {vehiclePos && (
              <VehicleMarker
                lat={vehiclePos.lat}
                lng={vehiclePos.lng}
                bearing={vehiclePos.bearing}
                label={vehicle?.plate}
              />
            )}
          </MapView>
        </div>

        <StatusTimeline stepIndex={stepIndex} />

        {myStop?.escortRequired && (
          <div className="flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 shadow-sm">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <p className="font-medium">Security escort arranged</p>
              <p className="mt-0.5 text-rose-600/90">
                For your safety on this night ride, a security escort has been arranged to accompany your trip.
              </p>
            </div>
          </div>
        )}

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Your driver</p>
          <div className="mt-2 flex items-center justify-between">
            <div>
              <p className="text-lg font-semibold text-slate-900">{driver?.name || 'Unassigned'}</p>
              {vendorName && <p className="text-sm text-slate-500">{vendorName}</p>}
            </div>
            {driver?.phone && (
              <a
                href={`tel:${driver.phone}`}
                className="inline-flex items-center gap-2 rounded-lg bg-indigo-50 px-3 py-2 text-sm font-medium text-indigo-600 hover:bg-indigo-100"
              >
                <Phone className="h-4 w-4" />
                Call
              </a>
            )}
          </div>
          <div className="mt-4 flex items-center gap-3">
            {vehicle?.plate && (
              <div className="rounded-md border-2 border-slate-800 bg-slate-900 px-3 py-1.5 font-mono text-sm font-bold tracking-widest text-white">
                {vehicle.plate}
              </div>
            )}
            {vehicle?.type && <span className="text-sm text-slate-500">{vehicle.type}</span>}
          </div>
        </div>

        {pin && (
          <div
            className={`rounded-2xl border-2 border-indigo-300 bg-indigo-50 p-5 text-center shadow-sm transition-shadow ${
              flashPin ? 'animate-pulse ring-4 ring-indigo-400' : ''
            }`}
          >
            <p className="text-sm font-medium text-indigo-700">Share this PIN with your driver on arrival</p>
            <div className="mt-3 flex items-center justify-center gap-2">
              {pin.split('').map((digit, i) => (
                <div
                  key={i}
                  className="flex h-12 w-10 items-center justify-center rounded-lg border-2 border-indigo-400 bg-white text-2xl font-bold text-indigo-700"
                >
                  {digit}
                </div>
              ))}
            </div>
            <button
              onClick={copyPin}
              className="mt-4 inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
            >
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              {copied ? 'Copied' : 'Copy PIN'}
            </button>
          </div>
        )}
      </div>
    </Shell>
  );
}

function StatusTimeline({ stepIndex }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center">
        {STEPS.map((label, i) => (
          <div key={label} className="flex flex-1 items-center last:flex-none">
            <div className="flex flex-col items-center gap-1">
              <div
                className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-semibold ${
                  i < stepIndex
                    ? 'bg-emerald-500 text-white'
                    : i === stepIndex
                    ? 'bg-indigo-600 text-white'
                    : 'bg-slate-200 text-slate-500'
                }`}
              >
                {i + 1}
              </div>
              <span
                className={`text-center text-[11px] leading-tight ${
                  i <= stepIndex ? 'font-medium text-slate-700' : 'text-slate-400'
                }`}
              >
                {label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div className={`mx-1 h-0.5 flex-1 ${i < stepIndex ? 'bg-emerald-500' : 'bg-slate-200'}`} />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
