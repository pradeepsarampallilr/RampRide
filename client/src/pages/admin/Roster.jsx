import { useEffect, useMemo, useState } from 'react';
import {
  LayoutDashboard, Users, Route as RouteIcon, AlertTriangle, Upload, CheckCircle2, XCircle,
} from 'lucide-react';
import Shell from '../../components/Shell';
import Badge from '../../components/Badge';
import DataTable from '../../components/DataTable';
import Spinner from '../../components/Spinner';
import EmptyState from '../../components/EmptyState';
import api from '../../lib/api';

const NAV = (openAlerts) => [
  { to: '/admin', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/admin/roster', label: 'Roster', icon: Users },
  { to: '/admin/routes', label: 'Route Planner', icon: RouteIcon },
  { to: '/admin/alerts', label: openAlerts ? `Alerts (${openAlerts})` : 'Alerts', icon: AlertTriangle },
];

const CSV_PLACEHOLDER = `name,email,phone,gender,address,lat,lng,shiftId
Anitha R,anitha@corp.io,+919999900001,F,"Kukatpally, Hyderabad",17.4849,78.4138,S1`;

export default function Roster() {
  const [shifts, setShifts] = useState([]);
  const [openAlerts, setOpenAlerts] = useState(0);
  const [shiftId, setShiftId] = useState('');
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [csv, setCsv] = useState('');
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const [importError, setImportError] = useState('');

  useEffect(() => {
    api.get('/bootstrap').then((r) => {
      setShifts(r.data.shifts || []);
      setOpenAlerts(r.data.counts?.openAlerts ?? 0);
    }).catch(() => {});
  }, []);

  async function loadEmployees() {
    setLoading(true);
    setError('');
    try {
      const res = await api.get('/employees', { params: shiftId ? { shiftId } : {} });
      setEmployees(res.data.employees || []);
    } catch (e) {
      setError(e?.response?.data?.error || 'Failed to load employees');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadEmployees(); }, [shiftId]);

  const shiftLabel = useMemo(() => {
    const map = {};
    shifts.forEach((s) => { map[s.id] = s.label; });
    return map;
  }, [shifts]);

  async function handleImport() {
    if (!csv.trim()) return;
    setImporting(true);
    setImportError('');
    setImportResult(null);
    try {
      const res = await api.post('/admin/roster', { csv });
      setImportResult(res.data);
      setCsv('');
      loadEmployees();
    } catch (e) {
      setImportError(e?.response?.data?.error || 'Import failed');
    } finally {
      setImporting(false);
    }
  }

  const columns = [
    { key: 'name', label: 'Name', render: (row) => <span className="font-medium text-slate-800">{row.name}</span> },
    { key: 'gender', label: 'Gender', render: (row) => <Badge tone={row.gender === 'F' ? 'female' : 'male'}>{row.gender}</Badge> },
    { key: 'address', label: 'Address', render: (row) => <span className="text-slate-600">{row.address}</span> },
    { key: 'shift', label: 'Shift', render: (row) => <span className="text-slate-600">{shiftLabel[row.shiftId] || row.shiftId}</span> },
    {
      key: 'coords',
      label: 'Coordinates',
      render: (row) => {
        const lat = Number(row.lat);
        const lng = Number(row.lng);
        const valid = Number.isFinite(lat) && Number.isFinite(lng);
        return (
          <span className="font-mono text-xs text-slate-500">
            {valid ? `${lat.toFixed(4)}, ${lng.toFixed(4)}` : '—'}
          </span>
        );
      },
    },
    {
      key: 'addressValid',
      label: 'Address',
      render: (row) => (
        <Badge tone={row.addressValid ? 'completed' : 'alert'}>
          {row.addressValid ? 'Valid' : 'Invalid'}
        </Badge>
      ),
    },
  ];

  return (
    <Shell title="Roster" nav={NAV(openAlerts)}>
      <div className="space-y-6">
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-4">
          <div className="flex items-center gap-3 mb-3">
            <Upload className="h-4 w-4 text-indigo-600" />
            <h3 className="text-sm font-semibold text-slate-700">Bulk import</h3>
          </div>
          <textarea
            value={csv}
            onChange={(e) => setCsv(e.target.value)}
            placeholder={CSV_PLACEHOLDER}
            rows={5}
            className="w-full font-mono text-xs border border-slate-200 rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <div className="flex items-center justify-between mt-3">
            <p className="text-xs text-slate-400">Header row required, column order doesn't matter.</p>
            <button
              onClick={handleImport}
              disabled={importing || !csv.trim()}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-indigo-600 text-white disabled:opacity-50 hover:bg-indigo-700"
            >
              {importing ? <Spinner label="" /> : <Upload className="h-4 w-4" />}
              Import CSV
            </button>
          </div>

          {importError && (
            <div className="mt-3 flex items-center gap-2 text-sm text-red-600">
              <XCircle className="h-4 w-4" /> {importError}
            </div>
          )}
          {importResult && (
            <div className="mt-3 flex flex-wrap items-center gap-4 text-sm bg-emerald-50 border border-emerald-100 rounded-lg p-3">
              <span className="flex items-center gap-1 text-emerald-700"><CheckCircle2 className="h-4 w-4" /> Added: {importResult.added ?? 0}</span>
              <span className="text-slate-600">Updated: {importResult.updated ?? 0}</span>
              <span className="text-amber-600">Invalid: {importResult.invalid ?? 0}</span>
              {importResult.alerts?.length > 0 && (
                <span className="text-slate-500">{importResult.alerts.length} alert(s) raised</span>
              )}
            </div>
          )}
        </div>

        <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-slate-700">Employees</h3>
            <select
              value={shiftId}
              onChange={(e) => setShiftId(e.target.value)}
              className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">All shifts</option>
              {shifts.map((s) => (
                <option key={s.id} value={s.id}>{s.label}</option>
              ))}
            </select>
          </div>

          {loading ? (
            <div className="flex justify-center py-10"><Spinner label="Loading employees…" /></div>
          ) : error ? (
            <EmptyState icon={AlertTriangle} title="Couldn't load employees" body={error} />
          ) : employees.length === 0 ? (
            <EmptyState icon={Users} title="No employees" body="Import a roster CSV to get started." />
          ) : (
            <DataTable columns={columns} rows={employees} rowKey="id" empty={<EmptyState icon={Users} title="No employees" />} />
          )}
        </div>
      </div>
    </Shell>
  );
}
