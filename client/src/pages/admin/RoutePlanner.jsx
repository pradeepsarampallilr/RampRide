import { useEffect, useMemo, useRef, useState } from 'react';
import {
  LayoutDashboard, Users, Route as RouteIcon, AlertTriangle, Play, Trash2, ChevronDown,
  ChevronRight, KeyRound, Clock as ClockIcon, ShieldCheck, Moon, Shuffle,
} from 'lucide-react';
import Shell from '../../components/Shell';
import Badge from '../../components/Badge';
import MapView from '../../components/MapView';
import RoutePolyline from '../../components/RoutePolyline';
import StopMarkers from '../../components/StopMarkers';
import VehicleMarker from '../../components/VehicleMarker';
import Spinner from '../../components/Spinner';
import EmptyState from '../../components/EmptyState';
import api from '../../lib/api';
import { km } from '../../lib/format';

const NAV = (openAlerts) => [
  { to: '/admin', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/admin/roster', label: 'Roster', icon: Users },
  { to: '/admin/routes', label: 'Route Planner', icon: RouteIcon },
  { to: '/admin/alerts', label: openAlerts ? `Alerts (${openAlerts})` : 'Alerts', icon: AlertTriangle },
];

const STATUS_TONE = { planned: 'planned', assigned: 'assigned', in_progress: 'progress', completed: 'completed' };
const ROUTE_COLORS = ['#4f46e5', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#84cc16', '#f97316'];

function boundsFor(stopsList, office) {
  const lats = [office.lat, ...stopsList.map((s) => s.lat)];
  const lngs = [office.lng, ...stopsList.map((s) => s.lng)];
  return [[Math.min(...lats), Math.min(...lngs)], [Math.max(...lats), Math.max(...lngs)]];
}

export default function RoutePlanner() {
  const [office, setOffice] = useState(null);
  const [shifts, setShifts] = useState([]);
  const [openAlerts, setOpenAlerts] = useState(0);
  const [shiftId, setShiftId] = useState('');
  const [routes, setRoutes] = useState([]);
  const [loadingRoutes, setLoadingRoutes] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [timings, setTimings] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [error, setError] = useState('');
  const timerRef = useRef(null);

  useEffect(() => {
    api.get('/bootstrap').then((r) => {
      setOffice(r.data.office);
      setShifts(r.data.shifts || []);
      setOpenAlerts(r.data.counts?.openAlerts ?? 0);
      if (r.data.shifts?.length) setShiftId(r.data.shifts[0].id);
    }).catch(() => {});
  }, []);

  async function loadRoutes(sid) {
    if (!sid) return;
    setLoadingRoutes(true);
    setError('');
    try {
      const res = await api.get('/routes', { params: { shiftId: sid } });
      setRoutes(res.data.routes || []);
    } catch (e) {
      setError(e?.response?.data?.error || 'Failed to load routes');
    } finally {
      setLoadingRoutes(false);
    }
  }

  useEffect(() => { setSelectedId(null); setTimings(null); loadRoutes(shiftId); }, [shiftId]);

  async function handleGenerate() {
    setGenerating(true);
    setError('');
    setElapsed(0);
    timerRef.current = setInterval(() => setElapsed((e) => e + 1), 1000);
    try {
      const res = await api.post('/admin/generate', { shiftId });
      setRoutes(res.data.routes || []);
      setTimings(res.data.timings || null);
      setSelectedId(null);
    } catch (e) {
      setError(e?.response?.data?.error || 'Generate failed');
    } finally {
      clearInterval(timerRef.current);
      setGenerating(false);
    }
  }

  async function handleClear() {
    if (!shiftId) return;
    try {
      await api.delete('/admin/routes', { params: { shiftId } });
      setRoutes([]);
      setSelectedId(null);
      setTimings(null);
    } catch (e) {
      setError(e?.response?.data?.error || 'Clear failed');
    }
  }

  const colorOf = (idx) => ROUTE_COLORS[idx % ROUTE_COLORS.length];

  const mapBounds = useMemo(() => {
    if (!office) return null;
    if (selectedId) {
      const r = routes.find((x) => x.id === selectedId);
      if (r) return boundsFor(r.stops, office);
    }
    if (routes.length === 0) return null;
    const allStops = routes.flatMap((r) => r.stops);
    return boundsFor(allStops, office);
  }, [routes, selectedId, office]);

  return (
    <Shell title="Route Planner" nav={NAV(openAlerts)}>
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <select
          value={shiftId}
          onChange={(e) => setShiftId(e.target.value)}
          disabled={generating}
          className="text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          {shifts.map((s) => (
            <option key={s.id} value={s.id}>{s.label}</option>
          ))}
        </select>

        <button
          onClick={handleGenerate}
          disabled={generating || !shiftId}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-indigo-600 text-white disabled:opacity-50 hover:bg-indigo-700"
        >
          {generating ? <Spinner label="" /> : <Play className="h-4 w-4" />}
          {generating ? `Generating… ${elapsed}s` : 'Generate Routes'}
        </button>

        <button
          onClick={handleClear}
          disabled={generating || routes.length === 0}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg border border-slate-200 text-slate-600 disabled:opacity-50 hover:bg-slate-50"
        >
          <Trash2 className="h-4 w-4" /> Clear routes
        </button>

        {timings && (
          <span className="text-xs text-slate-400">
            optimized in {timings.totalMs ?? timings.total ?? Object.values(timings).find((v) => typeof v === 'number') ?? '?'}ms
          </span>
        )}
        {error && <span className="text-xs text-red-600">{error}</span>}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4" style={{ height: '70vh' }}>
        <div className="lg:col-span-1 overflow-y-auto bg-white border border-slate-200 rounded-xl shadow-sm">
          {loadingRoutes ? (
            <div className="flex justify-center py-10"><Spinner label="Loading routes…" /></div>
          ) : routes.length === 0 ? (
            <div className="p-4">
              <EmptyState icon={RouteIcon} title="No routes yet" body="Pick a shift and click Generate Routes." />
            </div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {routes.map((r, idx) => {
                const expanded = selectedId === r.id;
                return (
                  <li key={r.id}>
                    <button
                      onClick={() => setSelectedId(expanded ? null : r.id)}
                      className="w-full text-left p-3 hover:bg-slate-50 flex items-start gap-2"
                    >
                      <span className="mt-0.5 h-3 w-3 rounded-full flex-shrink-0" style={{ backgroundColor: colorOf(idx) }} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium text-slate-800">{r.id}</span>
                          {expanded ? <ChevronDown className="h-4 w-4 text-slate-400" /> : <ChevronRight className="h-4 w-4 text-slate-400" />}
                        </div>
                        <p className="text-xs text-slate-500">
                          {r.stops.length}/{r.capacity} passengers · {km(r.distanceKm)} · {r.durationMin} min
                        </p>
                        <div className="flex flex-wrap gap-1 mt-1.5">
                          <Badge tone={STATUS_TONE[r.status] || 'planned'}>{r.status}</Badge>
                          {r.flags?.isNight && <Badge tone="night"><Moon className="h-3 w-3 inline mr-0.5" />Night</Badge>}
                          {r.flags?.escortRequired && <Badge tone="escort"><ShieldCheck className="h-3 w-3 inline mr-0.5" />Escort</Badge>}
                          {r.flags?.reorderedForSafety && <Badge tone="reordered"><Shuffle className="h-3 w-3 inline mr-0.5" />Reordered</Badge>}
                        </div>
                      </div>
                    </button>

                    {expanded && (
                      <div className="px-3 pb-3">
                        <ol className="space-y-1.5">
                          {r.stops.map((s) => (
                            <li key={s.seq} className="flex items-center gap-2 text-xs bg-slate-50 rounded-lg px-2 py-1.5">
                              <span className="font-semibold text-slate-500 w-4">{s.seq}</span>
                              <span className="flex-1 truncate text-slate-700">{s.name}</span>
                              <Badge tone={s.gender === 'F' ? 'female' : 'male'}>{s.gender}</Badge>
                              {s.escortRequired && <ShieldCheck className="h-3.5 w-3.5 text-rose-600" />}
                              <span className="flex items-center gap-1 text-slate-500">
                                <ClockIcon className="h-3 w-3" />{s.etaClock}
                              </span>
                              <span className="flex items-center gap-1 font-mono text-slate-600">
                                <KeyRound className="h-3 w-3" />{s.pin}
                              </span>
                            </li>
                          ))}
                        </ol>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="lg:col-span-2 h-full rounded-xl overflow-hidden border border-slate-200 shadow-sm">
          {office ? (
            <MapView center={[office.lat, office.lng]} zoom={12} bounds={mapBounds} className="h-full w-full">
              <VehicleMarker lat={office.lat} lng={office.lng} bearing={0} label="Office" />
              {routes.map((r, idx) => {
                const dimmed = selectedId && selectedId !== r.id;
                return (
                  <RoutePolyline
                    key={r.id}
                    geometry={r.geometry}
                    color={dimmed ? '#cbd5e1' : colorOf(idx)}
                    weight={dimmed ? 2 : 5}
                  />
                );
              })}
              {routes.map((r, idx) => {
                if (selectedId && selectedId !== r.id) return null;
                return <StopMarkers key={r.id} stops={r.stops} activeSeq={selectedId === r.id ? undefined : undefined} />;
              })}
            </MapView>
          ) : (
            <div className="flex h-full items-center justify-center"><Spinner label="Loading map…" /></div>
          )}
        </div>
      </div>
    </Shell>
  );
}
