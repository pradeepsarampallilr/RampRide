import { Marker, makeDivIcon } from './MapView';

function vehicleIcon(bearing, label) {
  const rotation = Number.isFinite(bearing) ? bearing : 0;
  const html = `
    <div style="display:flex;flex-direction:column;align-items:center;">
      <div style="display:flex;align-items:center;justify-content:center;width:32px;height:32px;border-radius:9999px;background:#0f172a;box-shadow:0 2px 6px rgba(0,0,0,0.4);transform:rotate(${rotation}deg);transition:transform 300ms linear;">
        <span style="font-size:16px;">🚐</span>
      </div>
      ${
        label
          ? `<div style="margin-top:2px;border-radius:4px;background:#0f172a;color:#fff;font-size:10px;font-weight:600;padding:1px 6px;white-space:nowrap;">${label}</div>`
          : ''
      }
    </div>
  `;
  return makeDivIcon(html, { size: [36, label ? 56 : 36] });
}

/** Rotating cab icon; rotation transition is CSS-driven so bearing updates animate smoothly. */
export default function VehicleMarker({ lat, lng, bearing, label }) {
  if (lat == null || lng == null) return null;
  return <Marker position={[lat, lng]} icon={vehicleIcon(bearing, label)} />;
}
