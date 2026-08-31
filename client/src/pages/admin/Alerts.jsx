import { useEffect, useState } from 'react';
import {
  LayoutDashboard, Users, Route as RouteIcon, AlertTriangle, MapPin, Check, X, Loader,
} from 'lucide-react';
import Shell from '../../components/Shell';
import Badge from '../../components/Badge';
import MapView from '../../components/MapView';
import VehicleMarker from '../../components/VehicleMarker';
import Spinner from '../../components/Spinner';
import EmptyState from '../../components/EmptyState';
import api from '../../lib/api';

function formatTimestamp(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
}

const NAV = (openAlerts) => [
  { to: '/admin', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/admin/roster', label: 'Roster', icon: Users },
  { to: '/admin/routes', label: 'Route Planner', icon: RouteIcon },
  { to: '/admin/alerts', label: openAlerts ? `Alerts (${openAlerts})` : 'Alerts', icon: AlertTriangle },
];

const TABS = [
  { key: 'open', label: 'Open' },
  { key: 'resolved', label: 'Resolved' },
  { key: 'all', label: 'All' },
];

const SEVERITY_TONE = { high: 'escort', medium: 'alert', low: 'planned' };

function FixAddressForm({ alert, office, onResolve, busy }) {
  const [lat, setLat] = useState(alert.suggestedLat ?? office?.lat ?? '');
  const [lng, setLng] = useState(alert.suggestedLng ?? office?.lng ?? '');

  const previewLat = Number(lat);
  const previewLng = Number(lng);
  const hasPreview = Number.isFinite(previewLat) && Number.isFinite(previewLng);

  return (
    <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
      <div className="space-y-2">
        <div className="flex gap-2">
          <input
            type="number"
            step="any"
            value={lat}
            onChange={(e) => setLat(e.target.value)}
            placeholder="Latitude"
            className="w-full text-sm border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <input
            type="number"
            step="any"
            value={lng}
            onChange={(e) => setLng(e.target.value)}
            placeholder="Longitude"
            className="w-full text-sm border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
        <button
          onClick={() => onResolve(previewLat, previewLng)}
          disabled={busy || !hasPreview}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-indigo-600 text-white disabled:opacity-50 hover:bg-indigo-700"
        >
          {busy ? <Loader className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
          Save & resolve
        </button>
      </div>
      <div className="h-32 rounded-lg overflow-hidden border border-slate-200">
        {hasPreview ? (
          <MapView center={[previewLat, previewLng]} zoom={13} className="h-full w-full">
            <VehicleMarker lat={previewLat} lng={previewLng} label="Pin" />
          </MapView>
        ) : office ? (
          <MapView center={[office.lat, office.lng]} zoom={11} className="h-full w-full">
            <VehicleMarker lat={office.lat} lng={office.lng} label="Office" />
          </MapView>
        ) : null}
      </div>
    </div>
  );
}

export default function Alerts() {
  const [office, setOffice] = useState(null);
  const [openAlerts, setOpenAlerts] = useState(0);
  const [tab, setTab] = useState('open');
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState(null);

  useEffect(() => {
    api.get('/bootstrap').then((r) => {
      setOffice(r.data.office);
      setOpenAlerts(r.data.counts?.openAlerts ?? 0);
    }).catch(() => {});
  }, []);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const res = await api.get('/alerts', tab === 'all' ? {} : { params: { status: tab } });
      setAlerts(res.data.alerts || []);
    } catch (e) {
      setError(e?.response?.data?.error || 'Failed to load alerts');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [tab]);

  async function handleResolve(alertId, lat, lng) {
    setBusyId(alertId);
    const prev = alerts;
    setAlerts((cur) => cur.map((a) => (a.id === alertId ? { ...a, status: 'resolved', resolvedAt: new Date().toISOString() } : a)));
    try {
      await api.patch(`/alerts/${alertId}`, { action: 'resolve', lat, lng });
      setOpenAlerts((n) => Math.max(0, n - 1));
      if (tab !== 'all') setAlerts((cur) => cur.filter((a) => a.id !== alertId));
    } catch (e) {
      setAlerts(prev);
      setError(e?.response?.data?.error || 'Resolve failed');
    } finally {
      setBusyId(null);
    }
  }

  async function handleDismiss(alertId) {
    setBusyId(alertId);
    const prev = alerts;
    setAlerts((cur) => cur.map((a) => (a.id === alertId ? { ...a, status: 'dismissed' } : a)));
    try {
      await api.patch(`/alerts/${alertId}`, { action: 'dismiss' });
      setOpenAlerts((n) => Math.max(0, n - 1));
      if (tab !== 'all') setAlerts((cur) => cur.filter((a) => a.id !== alertId));
    } catch (e) {
      setAlerts(prev);
      setError(e?.response?.data?.error || 'Dismiss failed');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Shell title="Alerts" nav={NAV(openAlerts)}>
      <div className="flex items-center gap-2 mb-4">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-3 py-1.5 text-sm font-medium rounded-lg border ${
              tab === t.key ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
            }`}
          >
            {t.label}
          </button>
        ))}
        {error && <span className="text-xs text-red-600 ml-2">{error}</span>}
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Spinner label="Loading alerts…" /></div>
      ) : alerts.length === 0 ? (
        <EmptyState icon={AlertTriangle} title="Nothing here" body={`No ${tab === 'all' ? '' : tab} alerts right now.`} />
      ) : (
        <div className="space-y-3">
          {alerts.map((a) => (
            <div key={a.id} className="bg-white border border-slate-200 rounded-xl shadow-sm p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge tone={SEVERITY_TONE[a.severity] || 'planned'}>{a.severity}</Badge>
                    <span className="text-sm font-semibold text-slate-800">{a.type.replace(/_/g, ' ')}</span>
                    {a.status !== 'open' && <Badge tone="completed">{a.status}</Badge>}
                  </div>
                  <p className="text-sm text-slate-600 mt-1">{a.message}</p>
                  <p className="text-xs text-slate-400 mt-1">
                    {a.employeeName ? `${a.employeeName} · ` : ''}{formatTimestamp(a.createdAt)}
                  </p>
                  {a.rawAddress && (
                    <p className="text-xs text-slate-500 mt-1 flex items-center gap-1">
                      <MapPin className="h-3 w-3" /> {a.rawAddress}
                    </p>
                  )}
                </div>
                {a.status === 'open' && (
                  <button
                    onClick={() => handleDismiss(a.id)}
                    disabled={busyId === a.id}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-50 flex-shrink-0"
                  >
                    <X className="h-3.5 w-3.5" /> Dismiss
                  </button>
                )}
              </div>

              {a.status === 'open' && a.type === 'invalid_address' && (
                <FixAddressForm
                  alert={a}
                  office={office}
                  busy={busyId === a.id}
                  onResolve={(lat, lng) => handleResolve(a.id, lat, lng)}
                />
              )}
            </div>
          ))}
        </div>
      )}
    </Shell>
  );
}
