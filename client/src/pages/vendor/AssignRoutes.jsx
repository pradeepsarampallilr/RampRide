import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Truck,
  Route as RouteIcon,
  Users,
  Car,
  Moon,
  ShieldAlert,
  X,
  Shuffle,
} from 'lucide-react';
import Shell from '../../components/Shell';
import Badge from '../../components/Badge';
import MapView from '../../components/MapView';
import RoutePolyline from '../../components/RoutePolyline';
import StopMarkers from '../../components/StopMarkers';
import Spinner from '../../components/Spinner';
import EmptyState from '../../components/EmptyState';
import api from '../../lib/api';
import { km } from '../../lib/format';

const NAV = [
  { to: '/vendor', label: 'Fleet', icon: Truck },
  { to: '/vendor/assign', label: 'Assign Routes', icon: RouteIcon },
];

// Frozen depot constant (server/src/config.js OFFICE) — used only as a map
// fallback center when no route is selected yet.
const OFFICE = { lat: 17.4435, lng: 78.3772 };

function SelectableCard({ selected, disabled, onClick, children }) {
  return (
    <button
      type="button"
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      className={[
        'w-full rounded-xl border p-3 text-left transition-colors',
        disabled
          ? 'cursor-not-allowed border-slate-200 bg-slate-50 opacity-50'
          : selected
          ? 'border-indigo-600 bg-indigo-50 shadow-sm'
          : 'border-slate-200 bg-white hover:border-indigo-300',
      ].join(' ')}
    >
      {children}
    </button>
  );
}

export default function AssignRoutes() {
  const [unassignedRoutes, setUnassignedRoutes] = useState([]);
  const [fleet, setFleet] = useState({ drivers: [], vehicles: [], routes: [] });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [toast, setToast] = useState('');
  const [dispatching, setDispatching] = useState(false);

  const [selectedRouteId, setSelectedRouteId] = useState(null);
  const [selectedDriverId, setSelectedDriverId] = useState(null);
  const [selectedVehicleId, setSelectedVehicleId] = useState(null);

  const loadAll = useCallback(async () => {
    try {
      setLoadError('');
      const [routesRes, fleetRes] = await Promise.all([
        api.get('/routes', { params: { status: 'planned' } }),
        api.get('/vendor/fleet'),
      ]);
      setUnassignedRoutes(routesRes.data?.routes || []);
      setFleet({
        drivers: fleetRes.data?.drivers || [],
        vehicles: fleetRes.data?.vehicles || [],
        routes: fleetRes.data?.routes || [],
      });
    } catch (err) {
      setLoadError(err?.response?.data?.error || 'Failed to load routes and fleet');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const availableDrivers = useMemo(
    () => fleet.drivers.filter((d) => d.status === 'available'),
    [fleet.drivers]
  );
  const availableVehicles = useMemo(
    () => fleet.vehicles.filter((v) => v.status === 'available'),
    [fleet.vehicles]
  );
  const assignedRoutes = useMemo(
    () => fleet.routes.filter((r) => r.status === 'assigned' || r.status === 'in_progress'),
    [fleet.routes]
  );

  const selectedRoute = useMemo(
    () => unassignedRoutes.find((r) => r.id === selectedRouteId) || null,
    [unassignedRoutes, selectedRouteId]
  );

  useEffect(() => {
    // If the currently selected vehicle can no longer fit the newly
    // selected route, drop it rather than allow an invalid dispatch.
    if (!selectedRoute || !selectedVehicleId) return;
    const vehicle = availableVehicles.find((v) => v.id === selectedVehicleId);
    if (vehicle && vehicle.capacity < (selectedRoute.stops?.length || 0)) {
      setSelectedVehicleId(null);
    }
  }, [selectedRoute, selectedVehicleId, availableVehicles]);

  const canDispatch = Boolean(selectedRouteId && selectedDriverId && selectedVehicleId) && !dispatching;

  const handleDispatch = async () => {
    if (!canDispatch) return;
    try {
      setDispatching(true);
      setToast('');
      await api.post('/vendor/assign', {
        routeId: selectedRouteId,
        driverId: selectedDriverId,
        vehicleId: selectedVehicleId,
      });
      setSelectedRouteId(null);
      setSelectedDriverId(null);
      setSelectedVehicleId(null);
      await loadAll();
    } catch (err) {
      setToast(err?.response?.data?.error || err?.response?.data?.detail || 'Failed to dispatch route');
    } finally {
      setDispatching(false);
    }
  };

  const handleUnassign = async (routeId) => {
    try {
      setToast('');
      await api.post('/vendor/unassign', { routeId });
      if (selectedRouteId === routeId) setSelectedRouteId(null);
      await loadAll();
    } catch (err) {
      setToast(err?.response?.data?.error || 'Failed to unassign route');
    }
  };

  if (loading) {
    return (
      <Shell title="Assign Routes" nav={NAV}>
        <Spinner label="Loading routes and fleet..." />
      </Shell>
    );
  }

  const mapCenter = selectedRoute?.stops?.length
    ? [selectedRoute.stops[0].lat, selectedRoute.stops[0].lng]
    : [OFFICE.lat, OFFICE.lng];
  const mapBounds = selectedRoute?.stops?.length
    ? [[OFFICE.lat, OFFICE.lng], ...selectedRoute.stops.map((s) => [s.lat, s.lng])]
    : undefined;

  return (
    <Shell title="Assign Routes" nav={NAV}>
      {loadError && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {loadError}
        </div>
      )}

      {toast && (
        <div className="mb-4 flex items-start justify-between gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <span>{toast}</span>
          <button type="button" onClick={() => setToast('')} className="text-amber-600 hover:text-amber-900">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div>
          <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-700">
            <RouteIcon className="h-4 w-4" /> Unassigned Routes
          </h2>
          {unassignedRoutes.length === 0 ? (
            <EmptyState title="No unassigned routes" body="Generated routes waiting on dispatch will appear here." />
          ) : (
            <div className="flex flex-col gap-2">
              {unassignedRoutes.map((r) => (
                <SelectableCard
                  key={r.id}
                  selected={selectedRouteId === r.id}
                  onClick={() => setSelectedRouteId(r.id)}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-slate-800">{r.id}</span>
                    <div className="flex gap-1">
                      {r.flags?.isNight && <Badge tone="night">Night</Badge>}
                      {r.flags?.escortRequired && <Badge tone="escort">Escort</Badge>}
                      {r.flags?.reorderedForSafety && <Badge tone="reordered">Reordered</Badge>}
                    </div>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    {r.stops?.length || 0} passengers · {km(r.distanceKm)}
                  </p>
                </SelectableCard>
              ))}
            </div>
          )}
        </div>

        <div>
          <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-700">
            <Users className="h-4 w-4" /> Available Drivers
          </h2>
          {availableDrivers.length === 0 ? (
            <EmptyState title="No available drivers" body="All drivers are currently on a route." />
          ) : (
            <div className="flex flex-col gap-2">
              {availableDrivers.map((d) => (
                <SelectableCard
                  key={d.id}
                  selected={selectedDriverId === d.id}
                  onClick={() => setSelectedDriverId(d.id)}
                >
                  <span className="font-medium text-slate-800">{d.name}</span>
                  <p className="mt-1 text-xs text-slate-500">{d.phone} · {d.licenseNo}</p>
                </SelectableCard>
              ))}
            </div>
          )}
        </div>

        <div>
          <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-700">
            <Car className="h-4 w-4" /> Available Vehicles
          </h2>
          {availableVehicles.length === 0 ? (
            <EmptyState title="No available vehicles" body="All vehicles are currently on a route." />
          ) : (
            <div className="flex flex-col gap-2">
              {availableVehicles.map((v) => {
                const tooSmall = Boolean(selectedRoute) && v.capacity < (selectedRoute.stops?.length || 0);
                return (
                  <SelectableCard
                    key={v.id}
                    selected={selectedVehicleId === v.id}
                    disabled={tooSmall}
                    onClick={() => setSelectedVehicleId(v.id)}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-slate-800">{v.plate}</span>
                      <span className="text-xs text-slate-500">{v.type} · seats {v.capacity}</span>
                    </div>
                    {tooSmall && (
                      <p className="mt-1 text-xs font-medium text-red-600">
                        Too small — needs {selectedRoute.stops.length} seats
                      </p>
                    )}
                  </SelectableCard>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <p className="text-sm text-slate-600">
          {selectedRoute
            ? `${selectedRoute.id} · ${selectedRoute.stops?.length || 0} passengers`
            : 'Select a route, driver, and vehicle to dispatch.'}
        </p>
        <button
          type="button"
          onClick={handleDispatch}
          disabled={!canDispatch}
          className={[
            'flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white transition-colors',
            canDispatch ? 'bg-indigo-600 hover:bg-indigo-700' : 'cursor-not-allowed bg-slate-300',
          ].join(' ')}
        >
          <Shuffle className="h-4 w-4" />
          {dispatching ? 'Dispatching…' : 'Dispatch'}
        </button>
      </div>

      {selectedRoute && (
        <div className="mt-6">
          <h2 className="mb-2 text-sm font-semibold text-slate-700">Route Preview</h2>
          <div className="h-64 w-full overflow-hidden rounded-xl border border-slate-200 shadow-sm">
            <MapView center={mapCenter} zoom={12} bounds={mapBounds} className="h-full w-full">
              {selectedRoute.geometry && <RoutePolyline geometry={selectedRoute.geometry} />}
              <StopMarkers stops={selectedRoute.stops || []} />
            </MapView>
          </div>
        </div>
      )}

      <div className="mt-6">
        <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-700">
          <ShieldAlert className="h-4 w-4" /> Assigned Routes
        </h2>
        {assignedRoutes.length === 0 ? (
          <EmptyState title="Nothing dispatched yet" body="Routes you dispatch will show up here with an unassign option." />
        ) : (
          <div className="flex flex-col gap-2">
            {assignedRoutes.map((r) => {
              const driver = fleet.drivers.find((d) => d.id === r.driverId);
              const vehicle = fleet.vehicles.find((v) => v.id === r.vehicleId);
              return (
                <div
                  key={r.id}
                  className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-3 shadow-sm"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-slate-800">{r.id}</span>
                      <Badge tone={r.status === 'in_progress' ? 'progress' : 'assigned'}>{r.status}</Badge>
                      {r.flags?.escortRequired && <Badge tone="escort">Escort</Badge>}
                    </div>
                    <p className="mt-1 text-xs text-slate-500">
                      {driver?.name || '—'} · {vehicle?.plate || '—'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleUnassign(r.id)}
                    className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:border-red-300 hover:text-red-600"
                  >
                    Unassign
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Shell>
  );
}
