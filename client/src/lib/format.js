// Formatting helpers for the client (CONTRACTS.md §10/§13).

const inrFormatter = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
});

/** Formats a number as INR currency, e.g. inr(48213) -> "₹48,213". */
export function inr(n) {
  return inrFormatter.format(Number(n) || 0);
}

/** Formats a number as kilometers, 1 decimal place, e.g. km(18.42) -> "18.4 km". */
export function km(n) {
  return `${(Number(n) || 0).toFixed(1)} km`;
}

/** Formats a number as a rounded percentage, e.g. pct(63.4) -> "63%". */
export function pct(n) {
  return `${Math.round(Number(n) || 0)}%`;
}

/** Formats a "HH:MM" 24h string as a 12h clock, e.g. clock("22:30") -> "10:30 PM". */
export function clock(hhmm) {
  if (!hhmm || typeof hhmm !== 'string' || !hhmm.includes(':')) return hhmm ?? '';
  const [hStr, mStr] = hhmm.split(':');
  let h = parseInt(hStr, 10);
  const m = parseInt(mStr, 10);
  if (Number.isNaN(h) || Number.isNaN(m)) return hhmm;
  const suffix = h >= 12 ? 'PM' : 'AM';
  h = h % 12;
  if (h === 0) h = 12;
  return `${h}:${String(m).padStart(2, '0')} ${suffix}`;
}

/** Formats a minute count as a short relative label, e.g. minsFromNow(12) -> "in 12 min". */
export function minsFromNow(n) {
  const mins = Math.round(Number(n) || 0);
  if (mins <= 0) return 'arriving now';
  if (mins === 1) return 'in 1 min';
  return `in ${mins} min`;
}

/**
 * Hand-written Google polyline decoder — mirrors server/src/geo.js decodePolyline exactly
 * (CONTRACTS §1: no @mapbox/polyline dependency).
 * @param {string} str
 * @param {number} precision decimal places, default 5
 * @returns {{lat:number,lng:number}[]}
 */
export function decodePolyline(str, precision = 5) {
  const factor = 10 ** precision;
  const points = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < str.length) {
    let result = 1;
    let shift = 0;
    let b;
    do {
      b = str.charCodeAt(index++) - 63 - 1;
      result += b << shift;
      shift += 5;
    } while (b >= 0x1f);
    lat += result & 1 ? ~(result >> 1) : result >> 1;

    result = 1;
    shift = 0;
    do {
      b = str.charCodeAt(index++) - 63 - 1;
      result += b << shift;
      shift += 5;
    } while (b >= 0x1f);
    lng += result & 1 ? ~(result >> 1) : result >> 1;

    points.push({ lat: lat / factor, lng: lng / factor });
  }
  return points;
}
