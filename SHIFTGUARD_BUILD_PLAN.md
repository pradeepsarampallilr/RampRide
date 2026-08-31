# ShiftGuard (Cabmatic) — Phased Build Plan & Thread Prompts

A Routematic-style corporate transport prototype. Built in **4 waves / 9 threads**, where
threads inside a wave run **in parallel** and never read each other's code — they coordinate
through `CONTRACTS.md` only. That's the whole token-saving trick.

---

## How to run this

1. Create the project folder and put **`CONTRACTS.md` at its root** (already written for you,
   next to this file — move both into `shiftguard/`).
2. Run **Wave 1** (one thread). Wait for it to finish.
3. Open **3 fresh threads** and paste the three Wave 2 prompts — one per thread. Let them run
   simultaneously.
4. Open **4 fresh threads** for Wave 3. Simultaneously.
5. Run **Wave 4** in one thread. Done.

**Always a fresh thread per prompt.** A thread that has already read 40 files costs 10× more per
message than one that has read 3.

---

## Why this is cheap

| Technique | Effect |
|---|---|
| `CONTRACTS.md` freezes every shared shape | No thread ever reads another thread's source to learn an interface |
| Strict file-ownership table | Zero merge conflicts, so no re-reading to reconcile |
| Solver is pure & I/O-free | Testable via one node script; no server boot, no map, no browser |
| Seed `db.json` written once in Wave 1 | Every later thread has real data without generating any |
| "No prose, write files" instruction in each prompt | Kills the explanation tokens, usually 30–40% of output |
| OSRM disk cache | Repeated dev/test runs make zero network calls |

---

## File ownership (never let two threads own the same file)

| Thread | Owns (create/edit) | May read |
|---|---|---|
| **W1** Scaffold | root `package.json`, `README.md`, `.gitignore`, `server/package.json`, `server/db.json`, `server/src/config.js`, `server/src/geo.js`, `server/src/db.js`, all `client/` config files, `client/index.html`, `client/src/index.css` | `CONTRACTS.md` |
| **W2-A** Optimizer | `server/src/osrm.js`, `server/src/solver.js`, `server/src/metrics.js`, `server/tools/test-solver.js` | `CONTRACTS.md`, `config.js`, `geo.js`, `db.json` |
| **W2-B** API + realtime | `server/src/index.js`, `server/src/sockets.js`, `server/src/simulator.js`, `server/src/routes/*.js` | `CONTRACTS.md`, `config.js`, `geo.js`, `db.js` |
| **W2-C** Client shell | `client/src/main.jsx`, `App.jsx`, `lib/*`, `context/AuthContext.jsx`, `components/*`, `pages/Login.jsx` | `CONTRACTS.md`, client config files |
| **W3-A** Admin | `client/src/pages/admin/*` | `CONTRACTS.md`, `client/src/components/*`, `lib/*`, `context/*` |
| **W3-B** Vendor | `client/src/pages/vendor/*` | same as W3-A |
| **W3-C** Driver | `client/src/pages/driver/*` | same as W3-A |
| **W3-D** Employee | `client/src/pages/employee/*` | same as W3-A |
| **W4** Integration | anything (fix-only) | anything |

W2-B stubs `solver.js`/`osrm.js`/`metrics.js` imports against the **frozen signatures in §8/§10/§11**
and must not open those files. W3-* import `MapView`, `StatCard`, `Badge`, `PinPad`, `DataTable`,
`Shell` by the **signatures in the prompt** and must not open `components/` unless something breaks.

---

## Wave map

```
WAVE 1  ── W1 Scaffold + seed data (must finish first)
              │
WAVE 2  ──┬── W2-A Solver / OSRM / metrics      (pure Node, no UI)
          ├── W2-B Express API + Socket.io + simulator
          └── W2-C Client shell, auth, map & shared components
              │
WAVE 3  ──┬── W3-A Admin portal
          ├── W3-B Vendor portal
          ├── W3-C Driver portal
          └── W3-D Employee portal
              │
WAVE 4  ── W4 Integration, smoke test, polish
```

---

# WAVE 1 — Scaffold + seed data

*One thread. Everything downstream depends on it, so it's the only sequential step.*

```
Project: ShiftGuard (Cabmatic) — a corporate cab routing prototype.
Read ./CONTRACTS.md fully. It is frozen; do not change it.

You are WAVE 1: SCAFFOLD. Create ONLY these files:
  package.json (root)          .gitignore                README.md
  server/package.json          server/db.json
  server/src/config.js         server/src/geo.js         server/src/db.js
  client/package.json          client/vite.config.js     client/tailwind.config.js
  client/postcss.config.js     client/index.html         client/src/index.css

Requirements:
1. Root package.json: private, "scripts": { "dev": "concurrently -n server,client -c blue,green
   \"npm --prefix server run dev\" \"npm --prefix client run dev\"", "install:all": "npm i &&
   npm --prefix server i && npm --prefix client i" }. devDependency: concurrently.
2. server/package.json: "type": "module", scripts dev = "node --watch src/index.js",
   start = "node src/index.js", test:solver = "node tools/test-solver.js".
   Dependencies exactly as CONTRACTS §1.
3. client/package.json + vite.config.js: React plugin, port 5173, proxy /api and /socket.io
   (ws: true) to http://localhost:4000. Tailwind v3 with the standard content globs.
4. config.js: export the constants from CONTRACTS §2 verbatim.
5. geo.js: export haversineM(a,b), haversineKm(a,b), bearingDeg(a,b),
   encodePolyline(points, precision=5), decodePolyline(str, precision=5),
   interpolate(a,b,t), pointAlongPath(points, metersFromStart).
   Hand-written Google polyline algorithm — no npm package. Points are {lat,lng}.
6. db.js: load() reads db.json once into memory and returns the object; save() writes it
   atomically (write .tmp then rename) and is debounced 300 ms; get() returns the live object;
   nextId(prefix, collection); and sanitizeRoute(route, role) which deep-clones the route and
   deletes stops[].pin unless role is 'admin', or role is 'employee' (in which case keep the pin
   only on stops belonging to that employee — accept an extra employeeId arg for that).
7. server/db.json: generate the FULL seed dataset per CONTRACTS §14 — 40 employees with jittered
   cluster coords, 4 shifts, 3 deliberately-broken addresses, the lone-female Shamirpet case,
   2 vendors, 10 vehicles, 10 drivers, 53 users. Write it as real JSON data, not a generator
   script. Use deterministic jitter (a seeded LCG) so the data is reproducible.
8. index.css: Tailwind directives plus a few base styles. Ensure .leaflet-container has a
   defined height (h-full on parent) so maps never render 0px.
9. README.md: one-command setup, the demo login table from §14, and the §15 smoke-test steps.

Rules: no prose in your reply — write the files, then output only a file list and the exact
commands to install and run. Do not create any file not listed above. Do not run npm install.
```

**Verify before moving on:** `npm run install:all` succeeds, `node -e "JSON.parse(require('fs').readFileSync('server/db.json'))"` passes, and `db.json` has 40 employees with exactly 3 `addressValid: false`.

---

# WAVE 2 — Three parallel threads

### W2-A · Optimizer, OSRM, metrics

```
Project: ShiftGuard (Cabmatic), a corporate cab routing prototype. The repo is scaffolded.
Read ./CONTRACTS.md fully (especially §4, §8, §9, §10, §11) plus server/src/config.js and
server/src/geo.js. Do NOT read or edit anything else.

You are WAVE 2-A: OPTIMIZATION ENGINE. Create ONLY:
  server/src/osrm.js       server/src/solver.js
  server/src/metrics.js    server/tools/test-solver.js

1. osrm.js — exactly the contract in §11: table(coords), route(coords). sha1 disk cache under
   server/cache/osrm/, 6s axios timeout, one retry, single-flight queue with a 120ms gap,
   return null on any failure or when coords.length > 90. Never throw.
2. solver.js — the default-exported pure solve(input) from §8. Implement sweep seeding →
   capacity-constrained cluster fill → nearest-neighbour → 2-opt → night-safety pass §9 →
   smallest-fitting-vehicle matching. Comment the matrix index convention (0 = office).
   No network, no fs, no imports beyond config.js and geo.js.
3. metrics.js — computeMetrics() per §10 with the exact field names and rounding.
4. server/tools/test-solver.js — a runnable harness (node tools/test-solver.js) that loads
   db.json directly, and for EACH of S1..S4: filters valid employees, calls osrm.table (falling
   back to null), runs solve(), and prints a compact report — routes, per-route passenger count /
   capacity / distance / flags, the stop order with gender letters, all alerts, and the metrics
   block. Then it ASSERTS and prints PASS/FAIL for:
     - every employee with addressValid appears in exactly one route
     - no route exceeds its capacity
     - every route's stop seqs are 1..n with no gaps
     - S1 (night logout) has no route ending on a female stop unless flags.escortRequired
     - S2 (night login) has no route starting on a female stop unless flags.escortRequired
     - the lone Shamirpet female produces a lone_female_night alert
     - optimizedKm < baselineKm and cabsSaved > 0
   Exit code 1 if any assertion fails.
5. Run `node tools/test-solver.js` yourself and fix your code until every assertion prints PASS.

Rules: no prose. Iterate on the harness until it's green, then reply with only the final
PASS/FAIL summary lines.
```

### W2-B · Express API + Socket.io + simulator

```
Project: ShiftGuard (Cabmatic), a corporate cab routing prototype. The repo is scaffolded.
Read ./CONTRACTS.md fully (especially §3, §4, §5, §6, §7, §12) plus server/src/config.js,
server/src/db.js and server/src/geo.js. Do NOT read or edit solver.js, osrm.js, metrics.js,
or anything under client/ — another thread owns those. Import them by the signatures in
CONTRACTS §8/§10/§11 and trust those signatures completely.

You are WAVE 2-B: API + REALTIME. Create ONLY:
  server/src/index.js  server/src/sockets.js  server/src/simulator.js
  server/src/routes/{auth,admin,vendor,driver,employee,sim}.js

1. index.js — express + cors + json, http server, socket.io attached, mount all routers under
   /api, a fake-bearer auth middleware resolving req.user from db.users (401 if unknown),
   requireRole(...roles) guard, a global error handler that always returns JSON, and
   app.listen(4000). Public routes: POST /api/auth/login only.
2. Implement EVERY endpoint in the §6 table with the exact paths, bodies and status codes.
   Key logic:
   - POST /admin/generate: filter addressValid employees for the shift → build coords
     [office, ...employees] → osrm.table → solve() → for each route call osrm.route() on
     [office, ...stops, office] to fill geometry/distanceKm/durationMin (fall back to solver's
     numbers when null) → assign 4-digit PINs → compute etaMin/etaClock cumulatively from the
     shift time → persist routes, merge alerts (assign IDs), compute metrics → respond.
     Wipe existing routes for that shift first. Include a `timings` object (ms for osrm vs solve).
   - POST /vendor/assign: 409 if vehicle.capacity < stops.length, if the driver already owns an
     in_progress route, or if the route is not 'planned'. On success set vendorId/driverId/
     vehicleId, status 'assigned', flip driver+vehicle status to 'assigned', emit route_status.
   - POST /driver/verify-pin: enforce ALL FOUR conditions in §4 and return the documented 400
     bodies with distanceM. On success mark the stop 'verified', increment route.currentSeq,
     emit stop_status, and resume the paused simulator for that route.
   - Every route-returning endpoint MUST pass through sanitizeRoute(route, req.user.role,
     req.user.refId). A driver or vendor response containing a PIN is a hard failure.
   - PATCH /alerts/:id with action 'resolve' + lat/lng writes those coords back to the employee
     and sets addressValid true.
3. sockets.js — the §7 events, room join/leave, and server-authoritative enrichment of
   driver_location_update before echoing to the room.
4. simulator.js — exactly §12, including the pause-at-arrived behaviour, once-per-stop
   proximity_alert, 2s write throttling, and clean interval teardown.
5. Self-test with curl and paste nothing but the results: login as admin, POST /admin/generate
   for S1, GET /routes, login as a driver and confirm no PIN appears in the payload, then
   POST /sim/start and confirm 200. Kill the server when done.

Rules: no prose, no README edits. Reply with only the curl result lines.
```

### W2-C · Client shell, auth, map, shared components

```
Project: ShiftGuard (Cabmatic), a corporate cab routing prototype. The repo is scaffolded and
client config files exist. Read ./CONTRACTS.md fully (especially §4, §6, §7, §13) and
client/src/index.css. Do NOT read or edit anything under server/ or client/src/pages/admin,
vendor, driver, employee — other threads own those.

You are WAVE 2-C: CLIENT SHELL + DESIGN SYSTEM. Create ONLY:
  client/src/main.jsx  client/src/App.jsx
  client/src/lib/{api.js,socket.js,format.js}
  client/src/context/AuthContext.jsx
  client/src/components/{Shell.jsx,StatCard.jsx,Badge.jsx,MapView.jsx,RoutePolyline.jsx,
    StopMarkers.jsx,VehicleMarker.jsx,PinPad.jsx,DataTable.jsx,Spinner.jsx,EmptyState.jsx}
  client/src/pages/Login.jsx

Component APIs — these are CONTRACTS for the four portal threads, so implement them exactly:
  <Shell title nav={[{to,label,icon}]} right?>{children}</Shell>
      sidebar + topbar with the app name, user name, role chip and a Logout button
  <StatCard label value sub? icon? tone="brand|savings|alert|night" />
  <Badge tone="female|male|escort|night|planned|assigned|progress|completed|reordered">txt</Badge>
  <MapView center zoom bounds? className>{children}</MapView>   // only file importing leaflet
  <RoutePolyline geometry color? weight? />                      // decodes the polyline itself
  <StopMarkers stops onStopClick? activeSeq? />                  // numbered pins, pink if F,
                                                                 // shield glyph if escortRequired
  <VehicleMarker lat lng bearing? label? />                      // rotating cab icon, smooth CSS
  <PinPad length={4} onSubmit error? disabled? hint? />          // big touch keypad
  <DataTable columns={[{key,label,render?,className?}]} rows rowKey onRowClick? empty? />
  <Spinner label? />   <EmptyState icon? title body? action? />

Also:
1. lib/format.js: inr(n) with Intl en-IN, km(n), pct(n), clock(hhmm), minsFromNow(n),
   plus decodePolyline(str) (hand-written, mirrors the server implementation).
2. lib/socket.js: single lazily-created io() instance via getSocket(); helpers
   subscribeRoute(routeId, handlers) returning an unsubscribe function that removes every
   listener it added and emits unsubscribe_route. Do not leak listeners.
3. lib/api.js and context/AuthContext.jsx per §13.
4. App.jsx: BrowserRouter, AuthProvider, <RoleRoute role>, the §13 route table, and lazy-loaded
   portal pages via React.lazy so a portal that isn't built yet cannot crash the app —
   wrap each in a Suspense + error boundary that renders "Portal not built yet".
5. Login.jsx: split-screen — left a gradient panel with the ShiftGuard mark and three
   value-prop lines (Optimized fleets · Night-safe routing · Verified pickups), right the form.
   Include four one-click demo-login chips (Admin / Vendor / Driver / Employee) that fill the
   credentials from §14. Show API errors inline.
6. Run `npm --prefix client run build` and fix every error until it succeeds.

Rules: no prose. Tailwind core utilities only. Reply with only the build result.
```

---

# WAVE 3 — Four parallel portal threads

Each of these four prompts starts with the same header. Keep it verbatim.

**Shared header (prepend to each W3 prompt):**

```
Project: ShiftGuard (Cabmatic), a corporate cab routing prototype. Server API and client shell
are built. Read ./CONTRACTS.md fully (§4, §5, §6, §7, §13 matter most). Do NOT read anything
under server/, and do NOT read or edit client/src/components, lib, context, App.jsx or any
pages/ folder other than your own — other threads own them. Use the shared components by the
API listed below and trust it.

Shared component API (already implemented):
  <Shell title nav={[{to,label,icon}]} right?>{children}</Shell>
  <StatCard label value sub? icon? tone="brand|savings|alert|night" />
  <Badge tone="female|male|escort|night|planned|assigned|progress|completed|reordered">txt</Badge>
  <MapView center zoom bounds? className>{children}</MapView>
  <RoutePolyline geometry color? weight? />
  <StopMarkers stops onStopClick? activeSeq? />
  <VehicleMarker lat lng bearing? label? />
  <PinPad length={4} onSubmit error? disabled? hint? />
  <DataTable columns rows rowKey onRowClick? empty? />
  <Spinner label? />   <EmptyState icon? title body? action? />
  api from '../../lib/api'          // axios, baseURL /api, token attached
  getSocket, subscribeRoute from '../../lib/socket'
  useAuth from '../../context/AuthContext'
  inr, km, pct, clock from '../../lib/format'
Icons come from lucide-react. Tailwind core utilities only. Maps need a parent with a fixed
height. Every list needs an EmptyState. No prose in your reply — write files, then run
`npm --prefix client run build` and report only the result.
```

### W3-A · Admin portal

```
[SHARED HEADER]

You are WAVE 3-A: COMPANY ADMIN PORTAL. Create ONLY
client/src/pages/admin/{Dashboard,Roster,RoutePlanner,Alerts}.jsx.
Nav: Dashboard /admin · Roster /admin/roster · Route Planner /admin/routes · Alerts /admin/alerts
(with an open-count pill on Alerts).

Dashboard — GET /bootstrap and /metrics. Six StatCards: Employees Routed, Cabs Used,
Cabs Saved, KM Saved, Cost Saved (₹), CO₂ Saved (kg). A recharts BarChart of baseline vs
optimized km, a recharts PieChart of routes by status, a "Safety" panel counting escort-flagged
and safety-reordered routes, and an open-alerts preview list linking to /admin/alerts.

Roster — GET /employees with a shift filter. DataTable: name, gender Badge, address, shift,
coords, and a valid/invalid Badge. A "Bulk import" panel with a CSV textarea (show the §6 header
format as placeholder) POSTing {csv} to /admin/roster, then rendering the
added/updated/invalid summary.

RoutePlanner — the centerpiece. Shift selector, "Generate Routes" button POSTing
/admin/generate (show a Spinner with elapsed seconds; it can take ~10s on OSRM), and
"Clear routes". Two-pane layout: left a scrollable route list (id, passengers/capacity,
distance, duration, status Badge, night/escort/reordered Badges), right a full-height MapView
showing an office marker plus every route's RoutePolyline in a distinct color with StopMarkers.
Selecting a route dims the others and fits the map to its bounds; expanding it shows the ordered
stop list with seq, name, gender Badge, ETA and PIN (admin may see PINs). Show the `timings`
from the response as a small "optimized in Xms" note.

Alerts — GET /alerts with status tabs (Open / Resolved / All). Each card shows type, severity,
employee, message and raw address. For invalid_address, an inline fix form with lat/lng inputs
plus a small MapView the admin can click to pick coordinates, PATCHing
{action:'resolve',lat,lng}; also a Dismiss action. Optimistically update the list.
```

### W3-B · Vendor portal

```
[SHARED HEADER]

You are WAVE 3-B: TRANSPORT VENDOR PORTAL. Create ONLY
client/src/pages/vendor/{FleetBoard,AssignRoutes}.jsx.
Nav: Fleet /vendor · Assign Routes /vendor/assign.

FleetBoard — GET /vendor/fleet. StatCards: Vehicles, Drivers, Routes Assigned, Trips Active.
Two DataTables (vehicles: plate, type, capacity, status Badge, current route; drivers: name,
phone, licence, vehicle, status Badge). An "Active Trips" strip of cards for in_progress routes
showing progress as "stop N of M" with a thin progress bar; subscribe to route_status and
stop_status over the socket so these update live, and clean up the listeners on unmount.

AssignRoutes — GET /routes?status=planned plus /vendor/fleet. A three-column board:
unassigned routes | available drivers | available vehicles. Selecting one from each enables
"Dispatch", which POSTs /vendor/assign. Grey out and label vehicles whose capacity is below the
selected route's passenger count; surface the 409 error text in a toast-style banner. Each route
card shows its passenger count, distance, night Badge and escort Badge, so the vendor can see
that an escort-flagged route needs care. An "Unassign" action on assigned routes posts
/vendor/unassign. Include a small MapView preview of the selected route.
```

### W3-C · Driver portal

```
[SHARED HEADER]

You are WAVE 3-C: DRIVER PORTAL. Create ONLY
client/src/pages/driver/{Manifest,TripView}.jsx (Manifest is the /driver index and renders
TripView once a trip is running, or export a single page that switches internally — your call,
but keep both files).

Mobile-first: max-w-md centered column, large touch targets, bottom-anchored primary action.
GET /driver/route on mount. If there is no assigned route, render an EmptyState
("No trip assigned yet").

Manifest — a header card with route id, shift, direction, total distance/duration and a night
Badge. Then the ordered stop list: big seq circle, name, gender Badge, address, ETA, and status
Badge. Escort-required stops get a prominent rose banner: "Security escort required — do not
depart without escort." PINs are never displayed anywhere (the API strips them; do not add a
field for them). Primary button "Start Trip" POSTs /sim/start {routeId}.

TripView — top half a MapView with RoutePolyline, StopMarkers (activeSeq highlighted) and a live
VehicleMarker driven by driver_location_update from subscribeRoute. Bottom half the current-stop
card: passenger name, gender Badge, address, distance-to-stop in metres and ETA, all updating
live. While distanceToNextM > 50 show a locked state ("PIN unlocks within 50 m — Xm away") with
PinPad disabled. On proximity_alert, vibrate if available, flip to an "Arrived" state and enable
the PinPad. Submitting posts /driver/verify-pin {routeId, seq, pin, lat, lng} using the last
known socket coords; on 400 show the mapped message (bad_pin → "Incorrect PIN", too_far →
"Move closer — Xm away"); on success show a green confirmation and advance to the next stop.
After the last stop, POST /driver/finish and show a trip summary. Handle sim_ended and
route_status. Remove all socket listeners on unmount.
```

### W3-D · Employee portal

```
[SHARED HEADER]

You are WAVE 3-D: EMPLOYEE PORTAL. Create ONLY client/src/pages/employee/TrackCab.jsx.
Nav: My Ride /employee.

GET /employee/trip on mount. If the employee has no route yet, render an EmptyState
("No cab assigned for your shift yet") with a Refresh action.

Layout — mobile-first, max-w-md centered. Top: a large ETA hero ("Arriving in 7 min", with the
clock time beneath) that recomputes from driver_location_update. Then a MapView (h-72) with
RoutePolyline, the employee's own StopMarker emphasized, and a live VehicleMarker. Then a driver
card: driver name, phone with a tel: link, vehicle plate in a monospace plate-style box, vehicle
type, and vendor name. Then the PIN card — the 4 digits rendered as four large boxed characters
with a "Share this PIN with your driver on arrival" caption and a Copy button; keep it visually
distinct (indigo border, subtle background).

Status timeline below: Assigned → On the way → Arriving → Verified → Completed, advanced by
stop_status, proximity_alert and route_status events. On proximity_alert for this employee's own
stop, flash the PIN card and show a banner "Your cab has arrived — share your PIN". If the trip
is a night shift, show a violet night banner, and if the employee's stop has escortRequired,
show a reassuring escort notice. Remove all socket listeners on unmount.
```

---

# WAVE 4 — Integration & smoke test

*One thread, and the only one allowed to touch everything.*

```
Project: ShiftGuard (Cabmatic). All waves are built. Read ./CONTRACTS.md §15.

You are WAVE 4: INTEGRATION. Boot the app (npm run install:all, then npm run dev with the
server and client in the background), then walk the entire §15 smoke test and FIX whatever
breaks. Highest-value checks, in order:
1. Both apps boot; no unhandled server exception; client build is clean.
2. Admin generate for all four shifts succeeds, including when OSRM returns null (test this by
   temporarily pointing OSRM_BASE at an unreachable host — the app must still produce routes
   from the haversine fallback; restore the constant afterwards).
3. No driver- or vendor-facing payload contains a `pin` field. Verify with curl and grep.
4. Night-safety flags render in the admin UI; the lone-female Shamirpet case shows an escort flag.
5. Vendor assign → driver start → sim moves → proximity at 50 m → wrong PIN rejected → correct
   PIN advances → route completes. Drive this end-to-end with curl if the UI is slow to exercise.
6. No React key warnings, no leaked socket listeners (check by mounting/unmounting the driver
   and employee pages repeatedly and confirming listener counts stay flat).
7. Metrics are non-zero and internally consistent (baseline > optimized, cabsSaved = employees −
   cabs, cost = km × 18).

Then create ./DEMO_SCRIPT.md: a 5-minute walkthrough with the exact clicks, which browser tabs
to pre-open for which role, and the three "wow" moments to land — the savings dashboard, the
night-safety reorder, and the 50 m PIN unlock. Also append a "Known limitations" section to
README.md.

Rules: fix code, don't rewrite architecture. Do not change CONTRACTS.md. Reply with only a
PASS/FAIL checklist and a list of the files you changed.
```

---

## Optional Wave 5 (only if you want more polish)

| Idea | Prompt sketch |
|---|---|
| Vendor billing reconciliation | Add `/api/vendor/invoice?shiftId=` comparing vendor-claimed km against `route.distanceKm`, and a Billing page flagging variance > 5%. Directly demos "eliminate vendor billing errors." |
| Escort assignment flow | Add an `escorts` collection and `POST /admin/assign-escort`, surfaced on escort-flagged routes. |
| Route replay | Persist sim breadcrumbs to `trips[]` and add an admin replay slider. |
| Multi-shift generate | `POST /admin/generate-all` and a shift-comparison metrics view. |

---

## Guardrails worth repeating

- **Never** let a Wave 3 thread edit `components/`. If a shared component is genuinely wrong, note
  it and fix it in Wave 4 — otherwise four threads will each patch it differently.
- The public OSRM server rate-limits. The disk cache in `osrm.js` is not optional; without it
  you'll hit `429` mid-demo.
- Test the fallback path deliberately (Wave 4, step 2). A demo that dies because a free API is
  down is the most avoidable failure here.
- Tailwind must stay on v3. v4's PostCSS change is a silent, confusing breakage.
- `MapView` owning all Leaflet imports is what keeps `window`-crash and marker-icon bugs to a
  single file.
