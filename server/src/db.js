// Native-fs persistence for db.json. No database server (CONTRACTS §0 / tech table): everything
// lives in one JSON file, loaded once into memory and flushed back with a debounced, atomic write.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, '..', 'db.json');
const TMP_PATH = `${DB_PATH}.tmp`;
const SAVE_DEBOUNCE_MS = 300;

let cache = null;
let saveTimer = null;

/**
 * Reads db.json once into memory and returns the live object. Safe to call more than once —
 * later calls are no-ops that return the same in-memory object (use get() for that instead).
 */
export function load() {
  if (cache) return cache;
  const raw = fs.readFileSync(DB_PATH, 'utf-8');
  cache = JSON.parse(raw);
  return cache;
}

/** Returns the live in-memory db object, loading it from disk first if needed. */
export function get() {
  if (!cache) return load();
  return cache;
}

/**
 * Schedules a debounced (300ms), atomic write of the live object to db.json: writes to a .tmp
 * file first, then renames over the real file, so a crash mid-write never corrupts db.json.
 */
export function save() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    if (!cache) return;
    fs.writeFileSync(TMP_PATH, JSON.stringify(cache, null, 2));
    fs.renameSync(TMP_PATH, DB_PATH);
  }, SAVE_DEBOUNCE_MS);
}

/**
 * Generates the next sequential id for a collection, e.g. nextId('E', 'employees') -> 'E41'.
 * Scans existing ids in db[collection] for the numeric suffix after `prefix` and returns
 * prefix + (max + 1). Starts at `${prefix}1` when the collection is empty.
 */
export function nextId(prefix, collection) {
  const db = get();
  const rows = db[collection] || [];
  let max = 0;
  const re = new RegExp(`^${prefix}(\\d+)$`);
  for (const row of rows) {
    const m = re.exec(String(row.id ?? ''));
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return `${prefix}${max + 1}`;
}

/**
 * Deep-clones a route and strips PINs per CONTRACTS §4/§6 security rules:
 *  - role 'admin': every pin is kept.
 *  - role 'employee': the pin is kept only on the stop whose employeeId matches `employeeId`;
 *    every other stop has its pin removed.
 *  - any other role (vendor/driver/none): every pin is removed.
 * Never mutates the input route.
 */
export function sanitizeRoute(route, role, employeeId = null) {
  const clone = JSON.parse(JSON.stringify(route));
  if (!Array.isArray(clone.stops)) return clone;
  clone.stops = clone.stops.map((stop) => {
    if (role === 'admin') return stop;
    if (role === 'employee' && employeeId && stop.employeeId === employeeId) return stop;
    const rest = { ...stop };
    delete rest.pin;
    return rest;
  });
  return clone;
}
