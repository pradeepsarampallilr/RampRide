import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  LayoutDashboard, Users, Car, PiggyBank, Route as RouteIcon, IndianRupee, Leaf,
  Shield, ShieldCheck, AlertTriangle, ArrowRight,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell,
} from 'recharts';
import Shell from '../../components/Shell';
import StatCard from '../../components/StatCard';
import Badge from '../../components/Badge';
import Spinner from '../../components/Spinner';
import EmptyState from '../../components/EmptyState';
import api from '../../lib/api';
import { inr, km, clock } from '../../lib/format';

const NAV = (openAlerts) => [
  { to: '/admin', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/admin/roster', label: 'Roster', icon: Users },
  { to: '/admin/routes', label: 'Route Planner', icon: RouteIcon },
  { to: '/admin/alerts', label: openAlerts ? `Alerts (${openAlerts})` : 'Alerts', icon: AlertTriangle },
];

const PIE_COLORS = {
  planned: '#94a3b8',
  assigned: '#4f46e5',
  in_progress: '#f59e0b',
  completed: '#10b981',
};

const STATUS_TONE = {
  planned: 'planned',
  assigned: 'assigned',
  in_progress: 'progress',
  completed: 'completed',
};

export default function Dashboard() {
  const [loading, setLoading] = useState(true);
  const [bootstrap, setBootstrap] = useState(null);
  const [metrics, setMetrics] = useState(null);
  const [routes, setRoutes] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [shiftKm, setShiftKm] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    let mounted = true;
    async function load() {
      setLoading(true);
      setError('');
      try {
        const [bootRes, metricsRes, routesRes, alertsRes] = await Promise.all([
          api.get('/bootstrap'),
          api.get('/metrics'),
          api.get('/routes'),
          api.get('/alerts', { params: { status: 'open' } }),
        ]);
        if (!mounted) return;
        setBootstrap(bootRes.data);
        setMetrics(metricsRes.data.metrics);
        setRoutes(routesRes.data.routes || []);
        setAlerts(alertsRes.data.alerts || []);
      } catch (e) {
        if (mounted) setError(e?.response?.data?.error || 'Failed to load dashboard');
      } finally {
        if (mounted) setLoading(false);
      }
    }
    load();
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    let mounted = true;
    if (!bootstrap?.shifts?.length) return;
    Promise.all(
      bootstrap.shifts.map((s) =>
        api.get('/metrics', { params: { shiftId: s.id } }).then((r) => ({
          shift: s.label.replace(/^(Night|Morning|Day|Evening)\s/, ''),
          baseline: r.data.metrics.baselineKm,
          optimized: r.data.metrics.optimizedKm,
        })).catch(() => null)
      )
    ).then((rows) => {
      if (mounted) setShiftKm(rows.filter(Boolean));
    });
    return () => { mounted = false; };
  }, [bootstrap]);

  const statusData = useMemo(() => {
    const counts = {};
    routes.forEach((r) => { counts[r.status] = (counts[r.status] || 0) + 1; });
    return Object.entries(counts).map(([name, value]) => ({ name, value }));
  }, [routes]);

  const escortCount = useMemo(() => routes.filter((r) => r.flags?.escortRequired).length, [routes]);
  const reorderedCount = useMemo(() => routes.filter((r) => r.flags?.reorderedForSafety).length, [routes]);

  const openAlertsCount = bootstrap?.counts?.openAlerts ?? alerts.length;

  return (
    <Shell title="Dashboard" nav={NAV(openAlertsCount)}>
      {loading ? (
        <div className="flex justify-center py-16"><Spinner label="Loading dashboard…" /></div>
      ) : error ? (
        <EmptyState icon={AlertTriangle} title="Couldn't load dashboard" body={error} />
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            <StatCard label="Employees Routed" value={metrics?.employeesRouted ?? 0} icon={Users} tone="brand" />
            <StatCard label="Cabs Used" value={metrics?.cabsUsed ?? 0} icon={Car} tone="brand" />
            <StatCard label="Cabs Saved" value={metrics?.cabsSaved ?? 0} icon={PiggyBank} tone="savings" />
            <StatCard label="KM Saved" value={km(metrics?.kmSaved ?? 0)} icon={RouteIcon} tone="savings" />
            <StatCard label="Cost Saved" value={inr(metrics?.costSaved ?? 0)} icon={IndianRupee} tone="savings" />
            <StatCard label="CO₂ Saved" value={`${(metrics?.co2SavedKg ?? 0).toFixed(1)} kg`} icon={Leaf} tone="savings" />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2 bg-white border border-slate-200 rounded-xl shadow-sm p-4">
              <h3 className="text-sm font-semibold text-slate-700 mb-3">Baseline vs Optimized KM by shift</h3>
              {shiftKm.length === 0 ? (
                <EmptyState icon={RouteIcon} title="No shift data yet" body="Generate routes to see km savings per shift." />
              ) : (
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={shiftKm}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="shift" tick={{ fontSize: 12 }} />
                      <YAxis tick={{ fontSize: 12 }} />
                      <Tooltip />
                      <Legend />
                      <Bar dataKey="baseline" name="Baseline km" fill="#94a3b8" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="optimized" name="Optimized km" fill="#4f46e5" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>

            <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-4">
              <h3 className="text-sm font-semibold text-slate-700 mb-3">Routes by status</h3>
              {statusData.length === 0 ? (
                <EmptyState icon={RouteIcon} title="No routes yet" body="Generate routes from the Route Planner." />
              ) : (
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={statusData} dataKey="value" nameKey="name" innerRadius={45} outerRadius={75} paddingAngle={2}>
                        {statusData.map((entry) => (
                          <Cell key={entry.name} fill={PIE_COLORS[entry.name] || '#64748b'} />
                        ))}
                      </Pie>
                      <Tooltip />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-4">
              <h3 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
                <Shield className="h-4 w-4 text-rose-600" /> Safety
              </h3>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex items-center gap-3 p-3 rounded-lg bg-rose-50 border border-rose-100">
                  <ShieldCheck className="h-5 w-5 text-rose-600" />
                  <div>
                    <p className="text-xs text-slate-500">Escort flagged</p>
                    <p className="text-lg font-semibold text-slate-800">{escortCount}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 p-3 rounded-lg bg-violet-50 border border-violet-100">
                  <RouteIcon className="h-5 w-5 text-violet-900" />
                  <div>
                    <p className="text-xs text-slate-500">Safety-reordered</p>
                    <p className="text-lg font-semibold text-slate-800">{reorderedCount}</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-slate-700">Open alerts</h3>
                <Link to="/admin/alerts" className="text-xs font-medium text-indigo-600 flex items-center gap-1 hover:underline">
                  View all <ArrowRight className="h-3 w-3" />
                </Link>
              </div>
              {alerts.length === 0 ? (
                <EmptyState icon={AlertTriangle} title="No open alerts" body="Everything looks clean." />
              ) : (
                <ul className="divide-y divide-slate-100">
                  {alerts.slice(0, 5).map((a) => (
                    <li key={a.id}>
                      <Link to="/admin/alerts" className="flex items-center justify-between py-2 hover:bg-slate-50 -mx-1 px-1 rounded">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-slate-800 truncate">{a.employeeName || a.type}</p>
                          <p className="text-xs text-slate-500 truncate">{a.message}</p>
                        </div>
                        <Badge tone={a.severity === 'high' ? 'escort' : 'alert'}>{a.severity}</Badge>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}
    </Shell>
  );
}
