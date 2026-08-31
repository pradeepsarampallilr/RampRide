# ShiftGuard (Cabmatic) — 5-Minute Live Demo Script

Password for every seeded account is `demo123`.
All timings assume routes for shift **S1 — Night Logout 22:30** have already been generated once
(see Pre-flight), so nothing in the demo waits on OSRM.

---

## Pre-flight (do this 5 minutes before you present)

1. From the repo root: `npm run dev`. Wait for both lines:
   - `ShiftGuard API listening on :4000`
   - `VITE v5.4.21  ready` / `Local: http://localhost:5173/`
2. Open **four browser tabs** and log each one in now — the demo has no time for logins:

   | Tab | URL to land on | Login | Who they are |
   |---|---|---|---|
   | **1 — Admin** | `http://localhost:5173/admin` | `admin@shiftguard.io` | Priya Nair, transport admin |
   | **2 — Vendor** | `http://localhost:5173/vendor/assign` | `vendor@saitravels.io` | Farooq Ahmed, Sai Travels |
   | **3 — Driver** | `http://localhost:5173/driver` | `driver4@saitravels.io` | Nagesh P, cab `TS09 AE 1444` (SUV, 6 seats) |
   | **4 — Employee** | `http://localhost:5173/employee` | `emp12@corp.io` | Lakshmi N, Miyapur — stop #1 on route `R-S1-02` |

   Use separate browser profiles or windows — the client keeps `token` in `localStorage`, so four
   tabs in the same profile will fight over one session.
3. In **Tab 1**, go to **Route Planner** (`/admin/routes`), pick **Night Logout 22:30**, hit
   **Generate Routes** once. This warms the OSRM disk cache. Confirm you get 4 routes:
   `R-S1-01` … `R-S1-04`.
4. Leave Tab 1 on **Dashboard** (`/admin`) and Tab 3 on the driver manifest.
5. Do **not** dispatch anything yet — Tab 2 does that live in Act 3.

> Note on exact numbers: route ids and per-route groupings are stable for a given generate, but
> the km/₹ figures shift slightly depending on whether the public OSRM server answered or the
> haversine fallback kicked in. Read the numbers off the screen rather than reciting them.

---

## Act 1 — 0:00–1:15 · Admin Dashboard → **WOW #1: the savings**

**Tab 1**, `/admin`.

1. Point at the six stat cards along the top, left to right:
   - **Employees Routed** ≈ 37 · **Cabs Used** ≈ 11
   - **Cabs Saved ≈ 26** — "37 people would have been 37 cabs. We're running 11."
   - **KM Saved ≈ 505 km** · **Cost Saved ≈ ₹9,084** · **CO₂ Saved ≈ 60.6 kg**
2. Drop to the **"Baseline vs Optimized KM by shift"** bar chart. Four pairs of bars — grey is
   one-dedicated-cab-per-person, indigo is what ShiftGuard actually dispatches. Say the line:
   *"Grey is what they pay today. Indigo is what they'd pay tomorrow."*
3. Tap the **Routes by status** donut (everything `planned` right now) and the **Safety** panel:
   **Escort flagged: 1**, **Safety-reordered: 2** — plant the seed for Act 2.

## Act 2 — 1:15–2:30 · Night safety → **WOW #2: the escort + reorder flags**

**Tab 1**, click **Route Planner** (`/admin/routes`). Shift is already **Night Logout 22:30**.

1. The map shows 4 coloured polylines out of HITEC City Hub, numbered stops, **pink pins for
   female passengers** and indigo for male.
2. In the left-hand list, click **`R-S1-01`** — it has a single passenger:
   **Shalini K (E10), Shamirpet**, 1/4 passengers.
   - It carries a violet **Night** badge and a rose **Escort** badge.
   - Expand it: her one stop row shows the pink **F** badge and the **shield icon**.
   - The line: *"Shamirpet is 20 km past every other cluster, so Shalini ends up alone in a cab at
     23:17. Rule R1 fires automatically — escort required, and it raised a high-severity
     `lone_female_night` alert without anyone asking."*
3. Click **`R-S1-02`** (5 passengers). It carries the amber **Reordered** chip.
   - Expand it and read the stop order aloud:
     `1 Lakshmi N (F) → 2 Sunitha K (F) → 3 Kiran M (M) → 4 Anitha R (F) → 5 Ramesh K (M)`
   - The line: *"This is a logout run, so the last drop is the person left alone in the cab.
     The optimizer's shortest tour ended on a woman; rule R2 swapped her with the nearest male
     stop. It costs us a few hundred metres and it's the whole reason the chip says
     'Reordered for safety'."*
   - `R-S1-04` shows the same chip — same rule, different cluster (Gachibowli).
4. Optional 10-second detour: **Alerts** (`/admin/alerts`) → **3 invalid addresses** in the queue
   (Divya P — *"Plot 12, near the big tree"*; Pooja S — coordinates land in Mumbai;
   Rachana T — unmapped) plus the `lone_female_night` alert for Shalini K. Every one is
   actionable, none of them crashed the roster import.

## Act 3 — 2:30–3:15 · Vendor dispatch

**Tab 2**, `/vendor/assign`.

1. **Unassigned Routes** column: click **`R-S1-02`** (5 passengers). Note it already shows the
   **Night** and **Reordered** badges — the vendor sees the safety context, never the PINs.
2. **Available Drivers**: click **Nagesh P**.
3. **Available Vehicles**: click **`TS09 AE 1444` · SUV · seats 6**.
   - Worth showing: the 4-seaters in that column are greyed out with
     *"Too small — needs 5 seats"*. Capacity is enforced client-side and again server-side (409).
4. Hit **Dispatch**. The route drops out of the unassigned list and appears under
   **Assigned Routes** with status `assigned`.

## Act 4 — 3:15–4:45 · Driver + Employee → **WOW #3: the 50 m PIN unlock**

Put **Tab 3 (driver)** and **Tab 4 (employee)** side by side on screen.

1. **Tab 3** — refresh. The manifest for `R-S1-02` appears: 5 stops in order, ETAs, pink **F**
   badges, distance and duration.
   - Say the line and let them look: *"Five names, five addresses, five ETAs — and no PINs.
     The driver's payload physically does not contain them."*
2. **Tab 4** — refresh. Lakshmi N sees her driver **Nagesh P**, plate **TS09 AE 1444**, the
   violet *"Night shift — safety protocols active"* banner, and **her 4-digit PIN**
   (regenerated on every Generate, so read it off the screen now).
3. **Tab 3** — hit **Start Trip**. Both tabs go live at once:
   - the cab marker walks the road polyline (25× real time),
   - Tab 4's *"Arriving in N min"* counts down and its timeline advances to **On the way**.
4. As the cab closes on stop #1, the driver's card reads
   **"PIN unlocks within 50 m — 340 m away"** and the keypad stays disabled.
5. At ≤ 50 m the card flips to **Arrived**, Tab 4 flashes **"Your cab has arrived — share your
   PIN"**, and the keypad unlocks. **Now do the money shot:**
   - Type a **wrong** PIN (e.g. `0000`) → **"Incorrect PIN"**, red, stop does not advance.
   - Type the PIN from Tab 4 → **"Verified! Moving to the next stop."** The simulator, which had
     paused at the stop, resumes; Tab 4's timeline jumps to **Verified**.
   - The line: *"Right PIN, wrong place doesn't work either — the server checks the driver's GPS
     against the stop and rejects anything past 50 metres. Presence and identity, both."*
6. Let it run one more stop if you have the seconds, then move on — you don't need all five.

## Act 5 — 4:45–5:00 · Close

Back to **Tab 1**, `/admin`. Refresh.

- The **Routes by status** donut now has an `in_progress` slice.
- Land on the closing line: *"One generate: 26 cabs off the road, ₹9,000 a night, 60 kg of CO₂,
  every lone-female night ride flagged and escorted, and every pickup verified at the door."*

---

## If something goes sideways

| Symptom | Fix |
|---|---|
| Driver tab says *"No trip assigned yet"* | The vendor dispatch in Act 3 didn't land, or you're logged in as the wrong driver. Only `driver4@saitravels.io` owns `R-S1-02`. |
| Employee tab says *"No cab assigned for your shift yet"* | `emp12@corp.io` is only on a route after S1 has been generated. Re-run Generate in Tab 1, then refresh Tab 4. |
| PIN keypad never unlocks | Give the sim more time; it pauses at each stop until the PIN is verified, so it cannot overshoot. Distance-to-stop is shown live on the driver card. |
| Generate takes ~5 s and the map lines look unnaturally straight | Public OSRM is unreachable, so the haversine fallback drew depot→stop→depot legs. Routes, flags, PINs and metrics all still work — just say the map is running offline. |
| Stop order differs from this script | Re-generating re-solves from scratch. The rules (lone-female escort on Shalini K, reorder chips on the mixed-gender logout routes) still hold; only the ids may shift. |
