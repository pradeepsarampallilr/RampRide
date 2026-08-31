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
