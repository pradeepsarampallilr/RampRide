import { Marker, Tooltip, makeDivIcon } from './MapView';

function stopIcon(stop, isActive) {
  const isFemale = stop.gender === 'F';
  const bg = isFemale ? 'background:#ec4899;' : 'background:#4f46e5;';
  const ring = isActive ? 'box-shadow:0 0 0 3px #fbbf24;' : 'box-shadow:0 1px 3px rgba(0,0,0,0.4);';
  const shield = stop.escortRequired
    ? '<span style="position:absolute;top:-6px;right:-8px;font-size:12px;">🛡️</span>'
    : '';
  const html = `
    <div style="position:relative;display:flex;align-items:center;justify-content:center;width:28px;height:28px;border-radius:9999px;color:#fff;font-size:12px;font-weight:700;${bg}${ring}">
      ${stop.seq}${shield}
    </div>
  `;
  return makeDivIcon(html, { size: [28, 28] });
}

/** Numbered pickup/drop pins — pink if female, shield glyph if escortRequired. */
export default function StopMarkers({ stops, onStopClick, activeSeq }) {
  if (!stops || stops.length === 0) return null;
  return stops.map((stop) => (
    <Marker
      key={stop.seq}
      position={[stop.lat, stop.lng]}
      icon={stopIcon(stop, stop.seq === activeSeq)}
      eventHandlers={onStopClick ? { click: () => onStopClick(stop) } : undefined}
    >
      <Tooltip>
        #{stop.seq} {stop.name}
        {stop.escortRequired ? ' · escort' : ''}
      </Tooltip>
    </Marker>
  ));
}
