// Geo helpers: haversine distance/bearing, hand-written Google polyline codec (per
// CONTRACTS.md §1 — no @mapbox/polyline dependency), and simulator interpolation helpers.
// Points are always plain { lat, lng } objects.

//The Haversine formula calculates the shortest great-circle distance between two points 
// on the surface of a sphere using their latitude and longitude coordinates.

const EARTH_RADIUS_M = 6371000;

function toRad(deg) {
  return (deg * Math.PI) / 180;
}

function toDeg(rad) {
  return (rad * 180) / Math.PI;
}

/** Great-circle distance between two {lat,lng} points, in meters. */
export function haversineM(a, b) {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(Math.min(1, h)));
}

/** Great-circle distance between two {lat,lng} points, in kilometers. */
export function haversineKm(a, b) {
  return haversineM(a, b) / 1000;
}

/** Initial compass bearing in degrees (0-360, 0 = north) from a to b. */
export function bearingDeg(a, b) {
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const dLng = toRad(b.lng - a.lng);
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

function encodeNumber(num) {
  let n = num;
  let output = '';
  while (n >= 0x20) {
    output += String.fromCharCode((0x20 | (n & 0x1f)) + 63);
    n >>= 5;
  }
  output += String.fromCharCode(n + 63);
  return output;
}

function encodeSignedNumber(num) {
  let sgnNum = num << 1;
  if (num < 0) sgnNum = ~sgnNum;
  return encodeNumber(sgnNum);
}

/**
 * Hand-written Google polyline algorithm encoder (CONTRACTS §1: no @mapbox/polyline).
 * @param {{lat:number,lng:number}[]} points
 * @param {number} precision decimal places, default 5
 * @returns {string}
 */
export function encodePolyline(points, precision = 5) {
  const factor = 10 ** precision;
  let output = '';
  let prevLat = 0;
  let prevLng = 0;
  for (const { lat, lng } of points) {
    const lat5 = Math.round(lat * factor);
    const lng5 = Math.round(lng * factor);
    output += encodeSignedNumber(lat5 - prevLat);
    output += encodeSignedNumber(lng5 - prevLng);
    prevLat = lat5;
    prevLng = lng5;
  }
  return output;
}

/**
 * Hand-written Google polyline algorithm decoder.
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

/** Linear interpolation between two {lat,lng} points at t in [0,1]. */
export function interpolate(a, b, t) {
  return { lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t };
}

/**
 * Walks a decoded polyline point list and returns { lat, lng, bearing } at the given distance
 * (meters) from the start of the path. Clamps to the first/last point when out of range.
 * Used by the simulator to place the moving vehicle marker.
 * @param {{lat:number,lng:number}[]} points
 * @param {number} metersFromStart
 */
export function pointAlongPath(points, metersFromStart) {
  if (!points || points.length === 0) return null;
  if (points.length === 1) return { lat: points[0].lat, lng: points[0].lng, bearing: 0 };

  if (metersFromStart <= 0) {
    return { lat: points[0].lat, lng: points[0].lng, bearing: bearingDeg(points[0], points[1]) };
  }

  let traveled = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const segMeters = haversineM(points[i], points[i + 1]);
    if (traveled + segMeters >= metersFromStart) {
      const t = segMeters === 0 ? 0 : (metersFromStart - traveled) / segMeters;
      const pt = interpolate(points[i], points[i + 1], t);
      return { lat: pt.lat, lng: pt.lng, bearing: bearingDeg(points[i], points[i + 1]) };
    }
    traveled += segMeters;
  }

  const last = points[points.length - 1];
  const prev = points[points.length - 2];
  return { lat: last.lat, lng: last.lng, bearing: bearingDeg(prev, last) };
}
