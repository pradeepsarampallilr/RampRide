import { useCallback, useEffect, useMemo, useState } from 'react';
import { Truck, Users, Route as RouteIcon, Activity } from 'lucide-react';
import Shell from '../../components/Shell';
import StatCard from '../../components/StatCard';
import Badge from '../../components/Badge';
import DataTable from '../../components/DataTable';
import Spinner from '../../components/Spinner';
import EmptyState from '../../components/EmptyState';
import api from '../../lib/api';
import { getSocket } from '../../lib/socket';

const NAV = [
  { to: '/vendor', label: 'Fleet', icon: Truck },
  { to: '/vendor/assign', label: 'Assign Routes', icon: RouteIcon },
];

function statusTone(status) {
  switch (status) {
    case 'available':
      return 'planned';
    case 'assigned':
      return 'assigned';
    case 'on_trip':
    case 'in_progress':
      return 'progress';
    case 'completed':
      return 'completed';
    default:
      return 'planned';
  }
}

export default function FleetBoard() {
  const [fleet, setFleet] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      setError('');
      const { data } = await api.get('/vendor/fleet');
      setFleet(data);
    } catch (err) {
      setError(err?.response?.data?.error || 'Failed to load fleet');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const routes = fleet?.routes || [];
  const vehicles = fleet?.vehicles || [];
  const drivers = fleet?.drivers || [];

  const activeRoutes = useMemo(
    () => routes.filter((r) => r.status === 'in_progress'),
    [routes]
  );
  const activeRouteIds = useMemo(() => activeRoutes.map((r) => r.id), [activeRoutes]);
  const activeRouteIdsKey = activeRouteIds.join(',');

  // Live updates for the active-trips strip. Cleans up listeners and
  // unsubscribes from every room on unmount / when the active set changes.
  useEffect(() => {
    if (!activeRouteIds.length) return undefined;
    const socket = getSocket();

    const onRouteStatus = ({ routeId, status }) => {
      setFleet((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          routes: prev.routes.map((r) => (r.id === routeId ? { ...r, status } : r)),
        };
      });
    };

    const onStopStatus = ({ routeId, seq, status }) => {
      setFleet((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          routes: prev.routes.map((r) => {
            if (r.id !== routeId) return r;
            const stops = (r.stops || []).map((s) => (s.seq === seq ? { ...s, status } : s));
            const next = stops.find((s) => s.status === 'pending' || s.status === 'arrived');
            return { ...r, stops, currentSeq: next ? next.seq : stops.length + 1 };
          }),
        };
      });
    };

    activeRouteIds.forEach((routeId) => socket.emit('subscribe_route', { routeId }));
    socket.on('route_status', onRouteStatus);
    socket.on('stop_status', onStopStatus);

    return () => {
      socket.off('route_status', onRouteStatus);
      socket.off('stop_status', onStopStatus);
      activeRouteIds.forEach((routeId) => socket.emit('unsubscribe_route', { routeId }));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeRouteIdsKey]);

  const routesAssigned = routes.filter((r) => r.status !== 'planned').length;

  const vehicleRows = vehicles.map((v) => {
    const currentRoute = routes.find((r) => r.vehicleId === v.id && r.status !== 'completed');
    return { ...v, currentRouteId: currentRoute ? currentRoute.id : '—' };
  });

  const driverRows = drivers.map((d) => {
    const vehicle = vehicles.find((v) => v.id === d.vehicleId);
    return { ...d, vehiclePlate: vehicle ? vehicle.plate : '—' };
  });

  const vehicleColumns = [
    { key: 'plate', header: 'Plate' },
    { key: 'type', header: 'Type' },
    { key: 'capacity', header: 'Capacity' },
    {
      key: 'status',
      header: 'Status',
      render: (row) => <Badge tone={statusTone(row.status)}>{row.status}</Badge>,
    },
    { key: 'currentRouteId', header: 'Current Route' },
  ];

  const driverColumns = [
    { key: 'name', header: 'Name' },
    { key: 'phone', header: 'Phone' },
    { key: 'licenseNo', header: 'Licence' },
    { key: 'vehiclePlate', header: 'Vehicle' },
    {
      key: 'status',
      header: 'Status',
      render: (row) => <Badge tone={statusTone(row.status)}>{row.status}</Badge>,
    },
  ];

  if (loading) {
    return (
      <Shell title="Fleet Board" nav={NAV}>
        <Spinner label="Loading fleet..." />
      </Shell>
    );
  }

  return (
    <Shell title="Fleet Board" nav={NAV}>
      {error && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Vehicles" value={vehicles.length} icon={Truck} tone="brand" />
        <StatCard label="Drivers" value={drivers.length} icon={Users} tone="brand" />
        <StatCard label="Routes Assigned" value={routesAssigned} icon={RouteIcon} tone="savings" />
        <StatCard label="Trips Active" value={activeRoutes.length} icon={Activity} tone="night" />
      </div>

      <div className="mt-6">
        <h2 className="mb-2 text-sm font-semibold text-slate-700">Active Trips</h2>
        {activeRoutes.length === 0 ? (
          <EmptyState title="No active trips" body="Trips in progress will show up here." />
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {activeRoutes.map((r) => {
              const total = r.stops?.length || 0;
              const current = Math.min(r.currentSeq || 1, total || 1);
              const pct = total ? Math.round(((current - 1) / total) * 100) : 0;
              return (
                <div key={r.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-slate-800">{r.id}</span>
                    {r.flags?.isNight && <Badge tone="night">Night</Badge>}
                  </div>
                  <p className="mt-1 text-sm text-slate-500">
                    Stop {current} of {total}
                  </p>
                  <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                    <div className="h-1.5 rounded-full bg-indigo-600" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div>
          <h2 className="mb-2 text-sm font-semibold text-slate-700">Vehicles</h2>
          <DataTable
            columns={vehicleColumns}
            rows={vehicleRows}
            rowKey="id"
            empty={<EmptyState title="No vehicles" body="No vehicles found for this vendor." />}
          />
        </div>
        <div>
          <h2 className="mb-2 text-sm font-semibold text-slate-700">Drivers</h2>
          <DataTable
            columns={driverColumns}
            rows={driverRows}
            rowKey="id"
            empty={<EmptyState title="No drivers" body="No drivers found for this vendor." />}
          />
        </div>
      </div>
    </Shell>
  );
}
