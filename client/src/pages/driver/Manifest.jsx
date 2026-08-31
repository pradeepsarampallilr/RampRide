import { useCallback, useEffect, useState } from 'react';
import { Navigation, ShieldAlert, MapPin, Clock3, Moon, RouteOff } from 'lucide-react';
import Shell from '../../components/Shell';
import Badge from '../../components/Badge';
import Spinner from '../../components/Spinner';
import EmptyState from '../../components/EmptyState';
import api from '../../lib/api';
import { km, clock } from '../../lib/format';
import TripView from './TripView';

const NAV = [{ to: '/driver', label: 'My Trip', icon: Navigation }];

const STOP_STATUS_TONE = {
  pending: 'planned',
  arrived: 'progress',
  verified: 'assigned',
  done: 'completed',
};

/** Driver Portal index (CONTRACTS §0). Fetches the assigned route and either shows the
 * pre-trip manifest with a Start Trip action, or hands off to <TripView> once the trip is
 * running/completed. */
export default function Manifest() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [route, setRoute] = useState(null);
  const [passengers, setPassengers] = useState([]);
  const [starting, setStarting] = useState(false);

  const loadRoute = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data } = await api.get('/driver/route');
      setRoute(data?.route ?? null);
      setPassengers(data?.passengers ?? []);
    } catch (e) {
      if (e?.response?.status === 404) {
        setRoute(null);
      } else {
        setError(e?.response?.data?.error || 'Failed to load your trip');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadRoute();
  }, [loadRoute]);

  async function startTrip() {
    if (!route || starting) return;
    setStarting(true);
    setError('');
    try {
      await api.post('/sim/start', { routeId: route.id });
      setRoute((r) => (r ? { ...r, status: 'in_progress' } : r));
    } catch (e) {
      setError(e?.response?.data?.error || 'Could not start the trip');
    } finally {
      setStarting(false);
    }
  }

  if (loading) {
    return (
      <Shell title="Driver" nav={NAV}>
        <div className="flex justify-center py-16">
          <Spinner label="Loading your trip…" />
        </div>
      </Shell>
    );
  }

  if (!route) {
    return (
      <Shell title="Driver" nav={NAV}>
        <div className="mx-auto max-w-md">
          <EmptyState
            icon={RouteOff}
            title="No trip assigned yet"
            body={error || 'Check back once dispatch assigns you a route.'}
          />
        </div>
      </Shell>
    );
  }

  if (route.status === 'in_progress' || route.status === 'completed') {
    return (
      <Shell title="Driver" nav={NAV}>
        <TripView initialRoute={route} initialPassengers={passengers} onExit={loadRoute} />
      </Shell>
    );
  }

  const stops = route.stops || [];

  return (
    <Shell title="Driver" nav={NAV}>
      <div className="mx-auto flex max-w-md flex-col gap-4 pb-6">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Route {route.id}
              </p>
              <p className="text-lg font-semibold capitalize text-slate-900">
                {route.direction === 'login' ? 'Home → Office' : 'Office → Home'}
              </p>
            </div>
            {route.flags?.isNight ? (
              <Badge tone="night">
                <Moon className="h-3 w-3" /> Night
              </Badge>
            ) : null}
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2 text-center">
            <div className="rounded-lg bg-slate-50 p-2">
              <p className="text-xs text-slate-500">Stops</p>
              <p className="text-sm font-semibold text-slate-800">{stops.length}</p>
            </div>
            <div className="rounded-lg bg-slate-50 p-2">
              <p className="text-xs text-slate-500">Distance</p>
              <p className="text-sm font-semibold text-slate-800">{km(route.distanceKm)}</p>
            </div>
            <div className="rounded-lg bg-slate-50 p-2">
              <p className="text-xs text-slate-500">Duration</p>
              <p className="text-sm font-semibold text-slate-800">
                {Math.round(route.durationMin || 0)} min
              </p>
            </div>
          </div>
        </div>

        {error ? <p className="text-sm font-medium text-red-600">{error}</p> : null}

        {stops.length === 0 ? (
          <EmptyState icon={MapPin} title="No stops on this route" />
        ) : (
          <ol className="space-y-2">
            {stops.map((stop) => (
              <li key={stop.seq}>
                <div className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-sm font-semibold text-white">
                    {stop.seq}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <p className="truncate text-sm font-semibold text-slate-900">{stop.name}</p>
                      <Badge tone={stop.gender === 'F' ? 'female' : 'male'}>{stop.gender}</Badge>
                    </div>
                    <p className="mt-1 flex items-center gap-1 text-xs text-slate-500">
                      <MapPin className="h-3 w-3 shrink-0" />
                      <span className="truncate">{stop.address}</span>
                    </p>
                    <p className="mt-0.5 flex items-center gap-1 text-xs text-slate-500">
                      <Clock3 className="h-3 w-3 shrink-0" /> ETA {clock(stop.etaClock)}
                    </p>
                  </div>
                  <Badge tone={STOP_STATUS_TONE[stop.status] || 'planned'}>{stop.status}</Badge>
                </div>
                {stop.escortRequired ? (
                  <div className="mt-2 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm font-medium text-rose-700">
                    <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
                    Security escort required — do not depart without escort.
                  </div>
                ) : null}
              </li>
            ))}
          </ol>
        )}

        <div className="sticky bottom-4 pt-2">
          <button
            type="button"
            onClick={startTrip}
            disabled={starting || stops.length === 0}
            className="w-full rounded-xl bg-indigo-600 py-3 text-sm font-semibold text-white shadow-lg shadow-indigo-600/20 disabled:bg-slate-300"
          >
            {starting ? 'Starting…' : 'Start Trip'}
          </button>
        </div>
      </div>
    </Shell>
  );
}
