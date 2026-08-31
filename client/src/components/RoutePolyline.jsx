import { useMemo } from 'react';
import { Polyline } from './MapView';
import { decodePolyline } from '../lib/format';

/** Decodes an encoded route polyline itself (client mirror, CONTRACTS §1) and draws it. */
export default function RoutePolyline({ geometry, color = '#4f46e5', weight = 4 }) {
  const positions = useMemo(() => {
    if (!geometry) return [];
    return decodePolyline(geometry).map((p) => [p.lat, p.lng]);
  }, [geometry]);

  if (positions.length === 0) return null;

  return <Polyline positions={positions} pathOptions={{ color, weight }} />;
}
