// OSRM wrapper (CONTRACTS.md §11). Two exports: table(coords), route(coords).
// Hard rules: never throw, never hang the demo. 6s timeout + 1 retry (700ms backoff),
// disk cache keyed by sha1 of the request URL (never expires), a single-flight queue with a
// 120ms gap between outbound requests (public OSRM server rate-limits aggressively), and a
// hard bail (return null) when coords.length > 90 rather than attempting a chunked matrix.

import axios from 'axios';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { OSRM_BASE } from './config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = path.join(__dirname, '..', 'cache', 'osrm');

const AXIOS_TIMEOUT_MS = 6000;
const RETRY_BACKOFF_MS = 700;
const QUEUE_GAP_MS = 120;
const MAX_COORDS = 90;

function ensureCacheDir() {
  try {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
  } catch {
    // ignore — worst case we skip caching for this call
  }
}

function cachePathFor(url) {
  const hash = crypto.createHash('sha1').update(url).digest('hex');
  return path.join(CACHE_DIR, `${hash}.json`);
}

function readCache(url) {
  try {
    const p = cachePathFor(url);
    if (!fs.existsSync(p)) return undefined;
    const raw = fs.readFileSync(p, 'utf8');
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

function writeCache(url, data) {
  try {
    ensureCacheDir();
    fs.writeFileSync(cachePathFor(url), JSON.stringify(data));
  } catch {
    // disk cache is best-effort — never let a write failure surface to the caller
  }
}

// --- single-flight request queue: at most 1 in-flight request, 120ms gap between calls ---
let queueTail = Promise.resolve();

function enqueue(task) {
  const run = () =>
    task().finally(() => new Promise((resolve) => setTimeout(resolve, QUEUE_GAP_MS)));
  const result = queueTail.then(run, run);
  // swallow so one caller's rejection doesn't poison the queue for the next
  queueTail = result.then(
    () => undefined,
    () => undefined
  );
  return result;
}

function coordsToOsrmString(coords) {
  // OSRM order is lng,lat
  return coords.map((c) => `${c.lng},${c.lat}`).join(';');
}

async function fetchWithRetry(url) {
  const attempt = () => axios.get(url, { timeout: AXIOS_TIMEOUT_MS });
  try {
    const res = await attempt();
    return res.data;
  } catch (firstErr) {
    await new Promise((resolve) => setTimeout(resolve, RETRY_BACKOFF_MS));
    try {
      const res = await attempt();
      return res.data;
    } catch (secondErr) {
      return null;
    }
  }
}

async function fetchUrl(url) {
  const cached = readCache(url);
  if (cached !== undefined) return cached;

  const data = await enqueue(() => fetchWithRetry(url));
  if (data === null || data === undefined) return null;

  writeCache(url, data);
  return data;
}

/**
 * @param {{lat:number,lng:number}[]} coords
 * @returns {Promise<{durations:number[][], distances:number[][]} | null>}
 */
export async function table(coords) {
  if (!Array.isArray(coords) || coords.length < 2) return null;
  if (coords.length > MAX_COORDS) return null;

  try {
    const coordStr = coordsToOsrmString(coords);
    const url = `${OSRM_BASE}/table/v1/driving/${coordStr}?annotations=duration,distance`;
    const data = await fetchUrl(url);
    if (!data || data.code !== 'Ok' || !data.durations || !data.distances) return null;
    return { durations: data.durations, distances: data.distances };
  } catch {
    return null;
  }
}

/**
 * @param {{lat:number,lng:number}[]} coords
 * @returns {Promise<{geometry:string, distanceKm:number, durationMin:number} | null>}
 */
export async function route(coords) {
  if (!Array.isArray(coords) || coords.length < 2) return null;

  try {
    const coordStr = coordsToOsrmString(coords);
    const url = `${OSRM_BASE}/route/v1/driving/${coordStr}?overview=full&geometries=polyline`;
    const data = await fetchUrl(url);
    if (!data || data.code !== 'Ok' || !Array.isArray(data.routes) || data.routes.length === 0) {
      return null;
    }
    const best = data.routes[0];
    return {
      geometry: best.geometry,
      distanceKm: best.distance / 1000,
      durationMin: best.duration / 60,
    };
  } catch {
    return null;
  }
}
