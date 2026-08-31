# ShiftGuard (Cabmatic)

Automated corporate transport management — route optimization, night safety protocols, and
live tracking across four role portals. See `CONTRACTS.md` for the frozen technical spec.

## Setup

Requires Node 20+.

```bash
npm run install:all
npm run dev
```

This boots the server on `http://localhost:4000` and the client on `http://localhost:5173`
(client proxies `/api` and `/socket.io` to the server). Open `http://localhost:5173`.

## Demo logins

Password for everyone: `demo123`

| Role     | Email                     |
|----------|----------------------------|
| Admin    | `admin@shiftguard.io`      |
| Vendor   | `vendor@saitravels.io`     |
| Vendor   | `vendor@orbitfleet.io`     |
| Driver   | `driver1@saitravels.io` … `driver6@saitravels.io` |
| Driver   | `driver7@orbitfleet.io` … `driver10@orbitfleet.io` |
| Employee | `emp1@corp.io` … `emp40@corp.io` |

For the PIN demo, log in as the admin first, generate routes for shift `S1`, note which
employee is first on a route, then log in as that `empN@corp.io` in another tab to see their PIN.

## Smoke test

1. `npm run dev` boots server (4000) and client (5173) with no console errors.
2. Log in as admin → Dashboard shows counts; Alerts shows **3** invalid addresses.
3. Admin → Route Planner → pick `S1` → Generate → routes appear on the map with polylines,
   numbered stops, and pink `F` badges; at least one route shows an escort/reorder flag.
4. Dashboard metrics show non-zero Cabs Saved, KM Saved, ₹ Saved, and CO₂ Saved.
5. Log in as a vendor → assign a driver + vehicle to a route → route status becomes `assigned`.
6. Log in as that driver → manifest lists stops in order with **no PINs visible**; "Start trip"
   runs the simulator and the cab marker moves along the road polyline.
7. At ≤ 50 m the driver sees "Arrived — enter PIN"; a wrong PIN is rejected; the correct PIN
   (visible in that employee's portal) advances to the next stop.
8. Log in as that employee in another tab → the cab marker moves live, ETA updates, PIN is shown.
9. Resolving an alert with corrected coordinates makes that employee routable on the next generate.

See `DEMO_SCRIPT.md` for a timed 5-minute walkthrough using the seeded data.

## Known limitations

Observed during Wave 4 integration QA. These are real, reproducible behaviours of the current
build — not a wish list.

### Persistence

- **`server/db.json` is the whole database.** It is loaded once into memory on first access and
  every module mutates that same live object; writes are debounced 300 ms and flushed atomically
  (`.tmp` + rename). Consequences you will actually hit:
  - Reading `db.json` off disk immediately after an API call can show stale values — the write may
    still be inside its 300 ms window. The in-memory object is the source of truth, not the file.
  - There is no locking. Running two server processes against the same repo will have them
    overwrite each other's state wholesale.
  - The simulator throttles its own writes to once per 2 s, so a hard kill mid-trip loses up to
    2 s of `lastLocation` history (harmless) and can leave a route stuck at `in_progress`
    (recoverable: re-generate that shift, or `POST /driver/finish`).
- **Demo state is not reset on boot.** `db.json` accumulates whatever the last session did.
  Re-generating a shift now clears that shift's routes, its stale route-derived alerts, and
  releases any orphaned drivers/vehicles — but generated routes, resolved alerts and corrected
  coordinates from previous sessions persist. If you need a pristine demo, restore `db.json` from
  git before presenting.

### OSRM

- **The haversine fallback is load-bearing, not a nicety.** `server/src/osrm.js` returns `null`
  after a 6 s timeout plus one retry, and callers fall back to
  `haversine × 1.35` for distance and `AVG_SPEED_KMH` (28 km/h) for duration. This was tested by
  pointing `OSRM_BASE` at an unreachable host: all four shifts still generate `200`, routes still
  get geometry, distances, ETAs, night-safety flags and PINs, and metrics stay coherent. What you
  lose is visual fidelity — the fallback geometry is a straight depot→stop→…→depot polyline, so
  the map draws lines across blocks instead of following roads, and route distances read ~10-15%
  lower than the road-network answer.
- **Generation is slow when OSRM is unreachable.** Requests are serialised with a 120 ms gap and
  each failing call burns 6 s timeout + 700 ms backoff + a second 6 s timeout before giving up.
  With one `/table` plus one `/route` per route, a cold generate of S1 took ~5 s in QA and would
  be considerably worse on a slower DNS failure. Generate once before demoing.
- **The disk cache never expires** (`server/cache/osrm/<sha1-of-url>.json`, by design — the demo
  data is static). Because the cache key is the full URL, changing `OSRM_BASE` silently
  invalidates every cached entry, and a stop-order change produces a cache miss and a fresh
  network call.
- **`/table` bails above 90 coordinates** and returns `null` rather than chunking the matrix, so
  any shift with more than ~89 routable employees is permanently on the fallback. The seeded
  shifts max out at 14, so this is latent rather than active.

### Simulator

- **It is time-accelerated and not a real GPS feed.** It replays the encoded route geometry at
  `AVG_SPEED_KMH × SIM_SPEED_MULTIPLIER` (28 × 25 = 700 km/h) on a 500 ms tick, so a 40 km route
  finishes in roughly three minutes. `POST /sim/start` accepts a `speed` multiplier on top of
  that, which QA used to compress an end-to-end run to ~20 s.
- **Proximity depends on the polyline passing near the stop.** The sim clamps travel at the
  path vertex nearest each stop, so it cannot overshoot — but the `proximity_alert` /
  `arrived` transition only fires when that vertex is within `PROXIMITY_RADIUS_M` (50 m).
  Measured gaps on the real OSRM geometry for `R-S1-02` were 2–24 m, comfortably inside the
  radius, and the fallback geometry passes exactly through each stop. A stop whose road geometry
  happens to be snapped further than 50 m away would leave the sim parked and the PIN pad locked,
  with no timeout to recover. Not observed on the seeded data; untested on arbitrary addresses.
- **The client drives the completion call.** The simulator sets `completed` and emits
  `route_status` + `sim_ended` on reaching the depot, and the driver's `TripView` then also calls
  `POST /driver/finish`. Both paths are idempotent, so the redundancy is harmless, but a route
  whose driver tab is closed mid-trip is finished by the simulator alone.
- **PIN-verified stops stay `verified`, not `done`,** unless something calls
  `POST /driver/complete-stop`. The driver UI does not, so the trip-summary stop count now counts
  `verified` and `done` together rather than reporting 0/N. The two statuses are effectively
  interchangeable in the current UI.

### Fixed but still fragile

- **PIN sanitisation is enforced per-endpoint, not by construction.** `sanitizeRoute(route, role)`
  in `server/src/db.js` is correct and is now applied on every route-returning endpoint —
  including `POST /driver/arrive`, which was returning the raw stop object with its `pin` intact
  and is the one place QA found a live leak. But nothing structurally prevents the next endpoint
  from serving a raw route: the guard is a convention, not a type. A driver/vendor payload sweep
  (`grep -i pin` over the raw response bodies of every route-returning route) is worth repeating
  after any change to `server/src/routes/`.
- **Socket listener hygiene is manual.** `subscribeRoute()` returns an unsubscribe that removes
  all five listeners and emits `unsubscribe_route`; ten mount/unmount cycles were verified to
  leave zero listeners on the shared socket. The employee `TrackCab` page was calling
  `subscribeRoute()` and discarding that unsubscribe while registering a second hand-rolled set of
  listeners, leaking five listeners per mount — worse under `StrictMode`, which double-invokes
  effects. It now returns the unsubscribe. `FleetBoard` still hand-rolls `socket.on`/`socket.off`
  pairs instead of using the helper; correct today, easy to get wrong tomorrow.
- **The `DataTable` column API is ambiguous.** Callers are split between `{ key, header }`
  (`FleetBoard`) and `{ key, label }` (`Roster`); the component now accepts either. Picking one
  and migrating both callers would be the real fix.
- **Route `distanceKm` / `durationMin` are stored unrounded when OSRM answers**
  (e.g. `94.41980000000001`, `91.81333333333333`), because they come straight from
  `distance / 1000` and `duration / 60`. Every display path happens to round them
  (`format.km()`, `Math.round`), so nothing is visibly wrong, but raw API consumers get noise.
  The fallback path rounds to 1 dp, so the two sources are inconsistent.

### Not fixed, and why

- **No automated test suite.** There is a solver harness at `server/tools/test-solver.js`, but
  the 7-item smoke test is executed by hand (curl for the API, a socket.io script for the
  drive-through). Adding a real test runner is outside the "fix bugs, don't restructure" scope of
  this pass.
- **Auth is deliberately fake.** `Authorization: Bearer <userId>` with plaintext passwords in
  `db.json`, per the frozen contract. Anyone who can guess `U1` is an admin. Fine for a demo,
  disqualifying for anything else.
- **No React key warnings were observed, but they were not observed in a browser.** No Chrome
  instance was reachable from the QA environment, so this was verified by a clean production
  build (`vite build`, 2454 modules, zero warnings) plus a static audit confirming every JSX list
  render carries a `key`. A real console pass on the driver and employee pages is still worth
  doing before the demo.
- **`GET /routes/:id` and `GET /metrics` are closed to the employee role** (403). That matches the
  contract's endpoint table, but it means the employee portal depends entirely on
  `GET /employee/trip` and has no way to poll route detail if that call fails.
- **Vendor `assign`/`unassign` do not reconcile fleet status the way route deletion now does.**
  The reconciliation added to `POST /admin/generate` and `DELETE /admin/routes` releases drivers
  and vehicles left `assigned` with no live route; the vendor endpoints still manage those two
  fields by hand. They are correct on the paths QA exercised.

### Environment note

The QA environment mounted the repo over a FUSE filesystem that rejects `unlink`, which broke
Vite's dependency-cache rewrite (`node_modules/.vite/deps/_metadata.json`) on the first
`npm run dev`. That is a sandbox artefact, not a defect in this project — it also explains the
stray `client/vite.config.js.timestamp-*.mjs` files, which Vite normally deletes after loading the
config. They are safe to remove.

