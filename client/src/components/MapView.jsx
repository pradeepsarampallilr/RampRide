import { useEffect } from 'react';
import { MapContainer, TileLayer, Polyline, Marker, Tooltip, useMap } from 'react-leaflet';
import L from 'leaflet';

// CONTRACTS §13: MapView.jsx is the ONLY file that imports from `react-leaflet` or `leaflet`.
// Everything else (RoutePolyline, StopMarkers, VehicleMarker) composes the map by importing the
// primitives re-exported below instead of touching `leaflet`/`react-leaflet` directly.
export { Polyline, Marker, Tooltip, useMap, L };

/** Builds a Leaflet divIcon — never use the default marker icon (missing-PNG bug, CONTRACTS §1). */
export function makeDivIcon(html, { className = '', size = [28, 28], anchor } = {}) {
  return L.divIcon({
    html,
    className: `shiftguard-div-icon ${className}`.trim(),
    iconSize: size,
    iconAnchor: anchor ?? [size[0] / 2, size[1] / 2],
  });
}

function FitBounds({ bounds }) {
  const map = useMap();
  useEffect(() => {
    if (bounds && bounds.length > 0) {
      map.fitBounds(bounds, { padding: [32, 32] });
    }
  }, [bounds, map]);
  return null;
}

/**
 * <MapView center={[lat,lng]} zoom={12} bounds? className>{children}</MapView>
 * Renders MapContainer + OSM TileLayer + an optional FitBounds helper.
 */
export default function MapView({ center, zoom = 12, bounds, className, children }) {
  return (
    <MapContainer center={center} zoom={zoom} className={className ?? 'h-full w-full'} scrollWheelZoom>
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution="&copy; OpenStreetMap contributors"
      />
      {bounds ? <FitBounds bounds={bounds} /> : null}
      {children}
    </MapContainer>
  );
}
