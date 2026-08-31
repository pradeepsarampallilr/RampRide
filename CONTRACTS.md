# ShiftGuard (Cabmatic) — FROZEN CONTRACTS v1

> **This file is the single source of truth.** Every build thread reads ONLY this file plus the
> files it owns. No thread may change anything in this document. If something is missing,
> the thread picks the simplest option, implements it locally, and does NOT alter shared shapes.

---

## 0. Repo layout

```
shiftguard/
├── CONTRACTS.md                 # this file (read-only for all threads)
├── package.json                 # root: concurrently runs both apps
├── README.md
├── server/
│   ├── package.json
│   ├── db.json                  # seeded persistence
│   ├── cache/osrm/              # gitignored, created at runtime
│   └── src/
│       ├── index.js             # express + http + socket.io bootstrap
│       ├── config.js            # constants (rates, radii, sim speed)
│       ├── db.js                # fs read/write + atomic save
│       ├── geo.js               # haversine, bearing, polyline encode/decode
│       ├── osrm.js              # /table + /route + disk cache + fallback
│       ├── solver.js            # optimizer (pure, no I/O)
│       ├── metrics.js           # ROI + sustainability math
│       ├── simulator.js         # replays route geometry as GPS stream
│       ├── sockets.js           # socket.io event wiring
│       └── routes/
│           ├── auth.js  admin.js  vendor.js  driver.js  employee.js  sim.js
└── client/
    ├── package.json  vite.config.js  tailwind.config.js  postcss.config.js
    ├── index.html
    └── src/
        ├── main.jsx  App.jsx  index.css
        ├── lib/  api.js  socket.js  format.js
        ├── context/AuthContext.jsx
        ├── components/
        │   Shell.jsx  StatCard.jsx  Badge.jsx  MapView.jsx
        │   RoutePolyline.jsx  StopMarkers.jsx  VehicleMarker.jsx
        │   PinPad.jsx  DataTable.jsx  Spinner.jsx
        └── pages/
            Login.jsx
            admin/{Dashboard,Roster,RoutePlanner,Alerts}.jsx
            vendor/{FleetBoard,AssignRoutes}.jsx
            driver/{Manifest,TripView}.jsx
            employee/TrackCab.jsx
```

Ports: **server 4000**, **client 5173**. Client proxies `/api` and `/socket.io` to `4000` via
`vite.config.js` `server.proxy`. All client calls use relative paths (`/api/...`) — never hardcode
`localhost:4000` in client code.

---

## 1. Dependencies (exact — do not add others without need)

**server**: `express`, `cors`, `axios`, `socket.io`, `nanoid`
**client**: `react`, `react-dom`, `react-router-dom`, `axios`, `socket.io-client`, `leaflet`,
`react-leaflet`, `lucide-react`, `recharts`
**client dev**: `vite`, `@vitejs/plugin-react`, `tailwindcss@3`, `postcss`, `autoprefixer`

Pin `tailwindcss` to **v3** (`^3.4.0`). v4 changes the PostCSS pipeline and will break the build.
Do **not** use `@mapbox/polyline` — polyline encode/decode is implemented by hand in `server/src/geo.js`
and duplicated in `client/src/lib/format.js` (≈30 lines each, avoids an install and version drift).

Import Leaflet CSS once, in `client/src/main.jsx`: `import 'leaflet/dist/leaflet.css'`.
Fix the missing-marker-icon bug in `MapView.jsx` by using `L.divIcon` for every marker — never the
default icon, never `require()` of PNGs.

---

## 2. Constants — `server/src/config.js`

```js
export const OFFICE = { name: 'HITEC City Hub', lat: 17.4435, lng: 78.3772 };
export const OSRM_BASE = 'https://router.project-osrm.org';
export const PROXIMITY_RADIUS_M = 50;      // PIN unlock radius
export const NIGHT_START_HOUR = 20;        // 20:00 inclusive
export const NIGHT_END_HOUR = 6;           // 06:00 exclusive
export const COST_PER_KM = 18;             // INR
export const CO2_KG_PER_KM = 0.12;
export const CITY_BBOX = { minLat: 17.0, maxLat: 17.8, minLng: 78.0, maxLng: 78.9 };
export const MAX_DETOUR_FACTOR = 1.6;      // route km vs. straight-line sum guard
export const SIM_TICK_MS = 500;
export const SIM_SPEED_MULTIPLIER = 25;    // 25x real time
export const AVG_SPEED_KMH = 28;           // fallback when OSRM unavailable
```

---

## 3. `db.json` shape (FROZEN)

Top-level keys, all arrays present even when empty:

```json
{
  "office":   { "name": "HITEC City Hub", "lat": 17.4435, "lng": 78.3772 },
  "users":    [{ "id": "U1", "email": "admin@shiftguard.io", "password": "demo123",
                 "role": "admin", "name": "Priya Nair", "refId": null }],
  "vendors":  [{ "id": "V1", "name": "Sai Travels", "contact": "+91 90000 00001" }],
  "vehicles": [{ "id": "VH1", "vendorId": "V1", "plate": "TS09 AB 1234",
                 "capacity": 6, "type": "SUV", "status": "available" }],
  "drivers":  [{ "id": "D1", "vendorId": "V1", "name": "Ramesh K", "phone": "+91 98480 11111",
                 "licenseNo": "TS0120180001", "vehicleId": "VH1", "status": "available" }],
  "shifts":   [{ "id": "S1", "label": "Night Logout 22:30", "time": "22:30",
                 "direction": "logout", "isNight": true }],
  "employees":[{ "id": "E1", "name": "Anitha R", "gender": "F",
                 "email": "anitha@corp.io", "phone": "+91 99999 00001",
                 "address": "Kukatpally, Hyderabad", "lat": 17.4849, "lng": 78.4138,
                 "shiftId": "S1", "addressValid": true }],
  "routes":   [],
  "alerts":   [],
  "trips":    [],
  "meta":     { "lastGeneratedAt": null, "version": 1 }
}
```

### Field rules
- `role` ∈ `admin | vendor | driver | employee`.
- `users[].refId` links to the domain record: vendor → `vendors[].id`, driver → `drivers[].id`,
  employee → `employees[].id`. `null` for admin.
- `gender` ∈ `M | F | X`.
- `shifts[].direction` ∈ `login` (home → office) | `logout` (office → home).
- `shifts[].isNight` is **derived and stored**: true when `time` hour ≥ 20 or < 6.
- `employees[].addressValid` false ⇒ excluded from routing, raises an alert. `lat`/`lng` may be
  `null` in that case.

---

## 4. Route object (FROZEN — the most important shape in the app)

```json
{
  "id": "R-S1-01",
  "shiftId": "S1",
  "direction": "logout",
  "status": "planned",
  "vendorId": null,
  "driverId": null,
  "vehicleId": null,
  "capacity": 6,
  "stops": [
    {
      "seq": 1,
      "employeeId": "E14",
      "name": "Anitha R",
      "gender": "F",
      "lat": 17.4849,
      "lng": 78.4138,
      "address": "Kukatpally, Hyderabad",
      "pin": "4821",
      "etaMin": 12,
      "etaClock": "22:42",
      "status": "pending",
      "escortRequired": false,
      "verifiedAt": null
    }
  ],
  "geometry": "<encoded polyline, precision 5>",
  "distanceKm": 18.4,
  "durationMin": 42,
  "straightLineKm": 14.1,
  "flags": { "isNight": true, "escortRequired": true, "reorderedForSafety": true },
  "createdAt": "2026-08-31T17:00:00.000Z",
  "startedAt": null,
  "completedAt": null,
  "currentSeq": 1,
  "lastLocation": null
}
```

- `status` ∈ `planned | assigned | in_progress | completed`.
- `stops[].status` ∈ `pending | arrived | verified | done`.
- Route is a **depot loop**: geometry always starts at OFFICE and ends at OFFICE.
  - `direction: "logout"` → OFFICE → stop1 … stopN → OFFICE.
  - `direction: "login"` → OFFICE → stop1 … stopN → OFFICE (cab leaves depot, collects, returns).
- `currentSeq` = seq of the next stop the driver must service; `stops.length + 1` means "returning
  to depot".
- `lastLocation` = `{ lat, lng, bearing, at }` or `null`.

### PIN rules (security-relevant, do not deviate)
- `pin` is a 4-digit string generated at route-creation time per `(routeId, employeeId)`.
- **Any response served to a driver or vendor MUST have `pin` stripped from every stop.**
  Implement one helper `sanitizeRoute(route, role)` in `server/src/db.js` and use it on every
  route-returning endpoint. Admin and the owning employee may see the PIN.
- PIN verification succeeds only when **all** hold: correct pin, driver GPS within
  `PROXIMITY_RADIUS_M` of the stop, stop status is `pending` or `arrived`, and route status is
  `assigned` or `in_progress`. Failure returns HTTP 400 with
  `{ error: 'bad_pin' | 'too_far' | 'wrong_state', distanceM }`.

---

## 5. Alert object (FROZEN)

```json
{
  "id": "A1",
  "type": "invalid_address",
  "severity": "high",
  "employeeId": "E7",
  "employeeName": "Kiran M",
  "shiftId": "S2",
  "message": "Coordinates missing or outside Hyderabad service area",
  "rawAddress": "Plot 12, near the big tree",
  "status": "open",
  "createdAt": "2026-08-31T17:00:00.000Z",
  "resolvedAt": null,
  "suggestedLat": null,
  "suggestedLng": null
}
```

`type` ∈ `invalid_address | escort_required | lone_female_night | unassigned_route | capacity_overflow`.
`status` ∈ `open | resolved | dismissed`. `severity` ∈ `high | medium | low`.

---

## 6. HTTP API (FROZEN)

Base `/api`. All responses JSON. Errors: `{ error: string, detail?: string }` with a real status code.
Auth is a fake bearer token: `Authorization: Bearer <userId>`. Middleware resolves it to
`req.user` from `db.users`; missing/unknown ⇒ 401. Role guard helper `requireRole('admin')`.

| Method | Path | Body / Query | Returns |
|---|---|---|---|
| POST | `/auth/login` | `{email, password}` | `{token, user}` (token = `user.id`) |
| GET | `/auth/me` | – | `{user}` |
| GET | `/bootstrap` | – | `{office, shifts, vendors, counts:{employees,drivers,vehicles,routes,openAlerts}}` |
| GET | `/employees` | `?shiftId=` | `{employees}` |
| POST | `/admin/roster` | `{csv}` **or** `{employees:[...]}` | `{added, updated, invalid, alerts}` |
| POST | `/admin/generate` | `{shiftId}` | `{routes, alerts, metrics, timings}` |
| DELETE | `/admin/routes` | `?shiftId=` | `{deleted}` |
| GET | `/routes` | `?shiftId=&vendorId=&driverId=&status=` | `{routes}` (sanitized by role) |
| GET | `/routes/:id` | – | `{route}` (sanitized by role) |
| GET | `/alerts` | `?status=` | `{alerts}` |
| PATCH | `/alerts/:id` | `{action:'resolve'\|'dismiss', lat?, lng?}` | `{alert, employee?}` |
| GET | `/metrics` | `?shiftId=` | `{metrics}` (see §8) |
| GET | `/vendor/fleet` | – | `{drivers, vehicles, routes}` for `req.user`'s vendor |
| POST | `/vendor/assign` | `{routeId, driverId, vehicleId}` | `{route}`; 409 on capacity < passengers or driver already on an active route |
| POST | `/vendor/unassign` | `{routeId}` | `{route}` |
| GET | `/driver/route` | – | `{route, passengers}` for logged-in driver, PIN stripped |
| POST | `/driver/arrive` | `{routeId, seq, lat, lng}` | `{stop, distanceM, unlocked:boolean}` |
| POST | `/driver/verify-pin` | `{routeId, seq, pin, lat, lng}` | `{ok:true, route}` or 400 |
| POST | `/driver/complete-stop` | `{routeId, seq}` | `{route}` |
| POST | `/driver/finish` | `{routeId}` | `{route}` |
| GET | `/employee/trip` | – | `{route, pin, myStop, driver, vehicle, etaMin}` |
| POST | `/sim/start` | `{routeId, speed?}` | `{ok, routeId}` |
| POST | `/sim/stop` | `{routeId}` | `{ok}` |
| GET | `/sim/status` | – | `{running:[routeId]}` |

### CSV roster format (header row required, order-insensitive)
```
name,email,phone,gender,address,lat,lng,shiftId
Anitha R,anitha@corp.io,+919999900001,F,"Kukatpally, Hyderabad",17.4849,78.4138,S1
```
Rows with unparseable/out-of-bbox `lat`/`lng` are still inserted with `addressValid: false` and
raise an `invalid_address` alert. Roster ingest never throws on a bad row.

---

## 7. Socket.io contract (FROZEN)

Namespace: default `/`. Rooms are `route:<routeId>`.

**Client → server**
| Event | Payload |
|---|---|
| `subscribe_route` | `{ routeId }` |
| `unsubscribe_route` | `{ routeId }` |
| `driver_location_update` | `{ routeId, lat, lng, bearing? }` |

**Server → client** (all include `routeId`)
| Event | Payload |
|---|---|
| `driver_location_update` | `{ routeId, lat, lng, bearing, currentSeq, etaMin, distanceToNextM }` |
| `proximity_alert` | `{ routeId, seq, employeeId, distanceM }` — fired once per stop when ≤ 50 m |
| `stop_status` | `{ routeId, seq, status }` |
| `route_status` | `{ routeId, status }` |
| `sim_ended` | `{ routeId }` |

The **server is authoritative**: it echoes `driver_location_update` to the room after enriching it
with `currentSeq`/`etaMin`. Clients never trust their own emit as state.

---

## 8. Solver contract — `server/src/solver.js`

Pure, synchronous, no network, no `fs`. Single default export:

```js
/**
 * @param {{
 *   office:   {lat:number,lng:number},
 *   employees:Array<{id,name,gender,lat,lng,address}>,   // pre-filtered: addressValid only
 *   vehicles: Array<{id,capacity,vendorId,plate,type}>,
 *   shift:    {id,direction:'login'|'logout',time:string,isNight:boolean},
 *   matrix:   {durations:number[][], distances:number[][]} | null  // index 0 = office
 * }} input
 * @returns {{ routes: Route[], alerts: Alert[], stats: object }}
 */
export default function solve(input) {}
```

- When `matrix` is `null`, fall back to haversine × 1.35 road factor and `AVG_SPEED_KMH`.
- Node index mapping: `0` = office, `i+1` = `employees[i]`. Document this in a comment.
- Returned routes carry **no** `geometry` (the caller fills it from OSRM `/route`), and
  `distanceKm`/`durationMin` computed from the matrix; the caller overwrites them with OSRM values
  if available.
- Returned alerts use §5 shape but may leave `id` empty — the caller assigns IDs.

### Algorithm (required — better than plain greedy, still <50 ms for 200 employees)
1. **Sweep seeding** — compute each employee's bearing from the office; sort ascending.
2. **Cluster fill** — walk the sweep order; open a cab, take the farthest-from-office unassigned
   employee as the seed, then repeatedly add the unassigned employee with the lowest
   `insertionCost = matrixDist(last, cand) − 0.3 × matrixDist(office, cand)` while
   `passengers < capacity` and the angular gap from the seed ≤ 60°. Relax the angle to 120°, then
   ∞, if employees remain and no cab can be opened.
3. **Intra-route ordering** — nearest-neighbour from the office, then **2-opt** to convergence
   (cap 200 swaps). For `logout`, order is drop order; for `login`, pickup order. Both loop
   back to the depot.
4. **Night safety pass** (§9) — applied after 2-opt; recompute distance/duration afterwards.
5. **Vehicle matching** — assign the smallest vehicle whose `capacity ≥ passengers`; if none is
   free, emit a `capacity_overflow` alert and leave `vehicleId: null`.
6. Sort vehicles by capacity ascending before matching so 4-seaters aren't wasted on 2 passengers.

---

## 9. Female night-safety rules (FROZEN — demo centerpiece)

Applies only when `shift.isNight === true`.

- **R1 — Lone female escort.** If a route's passengers are exactly one and that passenger's
  `gender === 'F'`, set `stops[0].escortRequired = true`, `flags.escortRequired = true`, and emit a
  `lone_female_night` alert (severity `high`).
- **R2 — No isolated last drop.** `direction === 'logout'`: the final stop must not be female. If it
  is, swap it with the nearest preceding non-female stop (choose the swap with the smallest added
  distance) and set `flags.reorderedForSafety = true`.
- **R3 — No isolated first pickup.** `direction === 'login'`: the first stop must not be female.
  Same nearest-swap procedure.
- **R4 — All-female route.** If R2/R3 cannot be satisfied because every passenger is female, do not
  reorder; set `flags.escortRequired = true` and emit an `escort_required` alert.
- **R5** Rules never break capacity and never move a passenger between routes.

The UI must surface all of this: a pink `F` badge on female stops, a shield icon on
`escortRequired`, and a "Reordered for safety" chip on `flags.reorderedForSafety`.

---

## 10. Metrics — `server/src/metrics.js`

```js
export function computeMetrics(routes, employees, office) → {
  employeesRouted, cabsUsed, cabsSaved, occupancyPct,
  optimizedKm, baselineKm, kmSaved, kmSavedPct,
  costOptimized, costBaseline, costSaved,
  co2SavedKg, escortFlagged, routesReordered, avgRideMin
}
```

- `baselineKm` = Σ over routed employees of `2 × haversine(office, employee) × 1.35`
  (one dedicated cab per employee, round trip, road factor).
- `optimizedKm` = Σ `route.distanceKm`.
- `kmSaved = baselineKm − optimizedKm` (clamp at 0).
- `cabsSaved = employeesRouted − cabsUsed`.
- `occupancyPct = employeesRouted / Σ route.capacity × 100`.
- `costSaved = kmSaved × COST_PER_KM`; `co2SavedKg = kmSaved × CO2_KG_PER_KM`.
- Round money to 0 dp, km to 1 dp, percentages to 0 dp. Currency displayed as `₹` with
  `Intl.NumberFormat('en-IN')`.

---

## 11. OSRM wrapper — `server/src/osrm.js`

```js
export async function table(coords)   // [{lat,lng}...] → {durations, distances} | null
export async function route(coords)   // → {geometry, distanceKm, durationMin} | null
```

Hard requirements — the demo must never hang or crash on OSRM:
- Coordinates in OSRM order: `lng,lat`, joined by `;`.
- `/table/v1/driving/{coords}?annotations=duration,distance`
- `/route/v1/driving/{coords}?overview=full&geometries=polyline`
- `axios` timeout **6000 ms**, one retry with 700 ms backoff, then return `null` (caller falls back).
- Disk cache: `server/cache/osrm/<sha1-of-url>.json`, read before any network call, written after
  every success. Cache never expires (demo data is static).
- Serialize requests: at most **1 in flight**, 120 ms gap between calls (the public server
  rate-limits aggressively). A tiny promise queue in this file, not `p-limit`.
- OSRM `/table` caps at ~100 coordinates per request. If `coords.length > 90`, return `null` rather
  than attempting a chunked matrix — the haversine fallback is fine for the demo.

---

## 12. Simulator — `server/src/simulator.js`

```js
export function startSim(io, routeId)   // decode route.geometry → interpolate → emit
export function stopSim(routeId)
export function simStatus()
```

- Decode `route.geometry` to a point list; walk it at
  `AVG_SPEED_KMH × SIM_SPEED_MULTIPLIER` every `SIM_TICK_MS`, interpolating between vertices.
- Each tick: persist `route.lastLocation`, emit `driver_location_update` to `route:<id>`, and
  compute `distanceToNextM` for `route.currentSeq`. When ≤ `PROXIMITY_RADIUS_M`, emit
  `proximity_alert` **once per stop** (track a per-stop fired flag) and set that stop's status to
  `arrived` + emit `stop_status`.
- Sim **pauses** at a stop whose status is `arrived` and does not advance until the driver verifies
  the PIN (`currentSeq` increments server-side). This is what makes the PIN demo work.
- Set `route.status = 'in_progress'` and `startedAt` on start; on reaching the depot, set
  `completed` / `completedAt`, emit `route_status` and `sim_ended`, then clear the interval.
- Only one sim per route; `startSim` on an already-running route is a no-op returning `false`.
- Throttle `db.json` writes to once per 2 s (keep the in-memory route as truth between writes).

---

## 13. Client conventions

- `lib/api.js`: single axios instance, `baseURL: '/api'`, request interceptor attaching
  `Bearer localStorage.token`, response interceptor that clears auth and redirects to `/login` on 401.
- `lib/socket.js`: **one** shared `io()` instance, lazily created, exported as `getSocket()`.
  Every `useEffect` that subscribes must return a cleanup that removes its listeners **and** emits
  `unsubscribe_route`. Listener leaks are the #1 bug in this app.
- `context/AuthContext.jsx`: `{user, token, login(email,password), logout(), loading}`.
  Persist `token` + `user` in `localStorage`.
- Routing: `/login`, `/admin/*`, `/vendor/*`, `/driver`, `/employee`. A `<RoleRoute role="admin">`
  wrapper redirects mismatches to that user's home. Post-login redirect by role:
  admin → `/admin`, vendor → `/vendor`, driver → `/driver`, employee → `/employee`.
- `MapView.jsx` is the ONLY file that imports from `react-leaflet` or `leaflet`. Everything else
  composes it via props/children. Signature:
  ```jsx
  <MapView center={[lat,lng]} zoom={12} className="h-full w-full">{children}</MapView>
  ```
  It renders `MapContainer` + OSM `TileLayer` and a `FitBounds` helper child that accepts a
  `bounds` prop. Tiles: `https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png`, attribution required.
- Colors (Tailwind): brand `indigo-600`, night `violet-900`, female badge `pink-500`,
  escort `rose-600`, savings `emerald-600`, alert `amber-500`, danger `red-600`.
  Backgrounds `slate-50` / cards `white` + `border-slate-200` + `rounded-xl` + `shadow-sm`.
- Never use `localStorage` for domain data — only `token` and `user`.
- Empty states are mandatory: every list renders a friendly "nothing here yet" block, never a crash.

---

## 14. Seed data requirements (`server/db.json`)

- **Office**: HITEC City Hub `17.4435, 78.3772`.
- **40 employees**, `E1`–`E40`, ~55% `F` / 45% `M`, spread across these Hyderabad clusters
  (jitter each by ±0.012° so stops don't overlap):

  | Cluster | lat | lng | ~count |
  |---|---|---|---|
  | Kukatpally | 17.4849 | 78.4138 | 6 |
  | Gachibowli | 17.4401 | 78.3489 | 5 |
  | Miyapur | 17.4970 | 78.3580 | 5 |
  | Ameerpet | 17.4375 | 78.4483 | 5 |
  | Kondapur | 17.4615 | 78.3676 | 5 |
  | Manikonda | 17.4020 | 78.3860 | 4 |
  | Secunderabad | 17.4399 | 78.4983 | 4 |
  | LB Nagar | 17.3457 | 78.5522 | 3 |
  | Uppal | 17.4058 | 78.5590 | 3 |

- **4 shifts**: `S1` Night Logout 22:30 (`logout`, night, 14 employees),
  `S2` Morning Login 06:00 (`login`, night, 12), `S3` Day Login 09:30 (`login`, day, 8),
  `S4` Evening Logout 18:30 (`logout`, day, 6).
- **3 deliberately broken employees** for the alert queue: one with `lat/lng` `null`
  (`"Plot 12, near the big tree"`), one outside the bbox (`19.0760, 72.8777` — Mumbai),
  one with string-garbage coords. All three get `addressValid: false`.
- **Deliberate lone-female night case**: place exactly one female employee in `S1` far from every
  cluster (e.g. Shamirpet `17.6100, 78.5600`) so she ends up alone in a cab and triggers R1.
- **2 vendors**, **10 vehicles** (`4×4-seater`, `4×6-seater`, `2×12-seater`), **10 drivers**
  (one per vehicle), split 6/4 between vendors.
- **Users** (password `demo123` for all):
  `admin@shiftguard.io` (admin), `vendor@saitravels.io` + `vendor@orbitfleet.io` (vendor),
  `driver1@saitravels.io` … `driver10@…` (driver, `refId` = `D1`…`D10`),
  `emp1@corp.io` … `emp40@corp.io` (employee, `refId` = `E1`…`E40`).
  Print this table in `README.md`.

---

## 15. Definition of "working" (the smoke test every thread is judged against)

1. `npm run dev` at repo root boots server 4000 + client 5173 with no console errors.
2. Login as admin → Dashboard shows counts; Alerts shows **3** invalid addresses.
3. Admin → Route Planner → pick `S1` → Generate → routes appear on the map with polylines,
   numbered stops, pink `F` badges; at least one route shows an escort/reorder flag.
4. Dashboard metrics show non-zero Cabs Saved, KM Saved, ₹ Saved, CO₂ Saved.
5. Login as vendor → assign a driver+vehicle to a route → route status `assigned`.
6. Login as that driver → manifest lists stops in order, **no PINs visible**, "Start trip" runs the
   sim; the cab marker moves along the road polyline.
7. At ≤ 50 m the driver sees "Arrived — enter PIN"; a wrong PIN is rejected; the correct PIN
   (visible in that employee's portal) advances to the next stop.
8. Login as that employee in another tab → the cab marker moves live, ETA updates, PIN is shown.
9. Resolving an alert with corrected coords makes that employee routable on the next generate.
