# ShiftGuard — Build Runbook

Keep this file open while you build. You will be switching threads constantly and losing chat
history, so tick the boxes here.

Project root: `~/Desktop/Project/shiftguard`
Prompts to paste live in `SHIFTGUARD_BUILD_PLAN.md`. Frozen spec: `CONTRACTS.md`.

---

## STEP 0 — Prerequisites (do once, in your terminal)

```bash
node -v      # need v20 or newer. v18 will fail: `node --watch` is unstable there
npm -v
cd ~/Desktop/Project/shiftguard
ls           # must show CONTRACTS.md and SHIFTGUARD_BUILD_PLAN.md
git init && printf "node_modules\ndist\nserver/cache\n.DS_Store\n" > .gitignore
git add -A && git commit -m "contracts + plan"
```

If `node -v` is below 20, install Node 20 LTS before continuing.

**Why git matters here:** you are about to let 8 threads write files. Commit after every wave.
If a thread goes wrong you `git checkout .` instead of debugging someone else's mess.

- [ ] Node 20+ confirmed
- [ ] git initialised and first commit made

---

## STEP 1 — Wave 1: scaffold (1 thread, must finish before anything else)

1. Open a **new thread**, with this same folder connected.
2. Open `SHIFTGUARD_BUILD_PLAN.md` → section **WAVE 1** → copy the whole fenced prompt block.
3. Paste it. Let it finish.

**Then verify in your terminal — do not skip this:**

```bash
cd ~/Desktop/Project/shiftguard
npm run install:all                      # takes 1-2 min
node -e "const d=require('./server/db.json');
  console.log('employees',d.employees.length,
  '| invalid',d.employees.filter(e=>!e.addressValid).length,
  '| shifts',d.shifts.length,'| drivers',d.drivers.length,
  '| vehicles',d.vehicles.length,'| users',d.users.length)"
```

Expect: `employees 40 | invalid 3 | shifts 4 | drivers 10 | vehicles 10 | users 53`

If the numbers are wrong, tell that same thread exactly which number is off and have it fix
`db.json`. Do not move on with bad seed data — every later wave depends on it.

```bash
git add -A && git commit -m "wave 1: scaffold + seed"
```

- [ ] Wave 1 thread done
- [ ] `npm run install:all` clean
- [ ] Seed counts correct
- [ ] Committed

---

## STEP 2 — Wave 2: three threads at the same time

Open **three separate new threads**, one prompt each, and start all three. They do not conflict.

| Thread | Prompt section | What proves it worked |
|---|---|---|
| A | **W2-A · Optimizer, OSRM, metrics** | thread reports all assertions PASS |
| B | **W2-B · Express API + Socket.io + simulator** | thread reports its curl results |
| C | **W2-C · Client shell, auth, map, shared components** | `npm --prefix client run build` succeeds |

Thread A finishes first (pure Node, no UI). C is usually slowest.

**Verify yourself once all three report done:**

```bash
cd ~/Desktop/Project/shiftguard
npm --prefix server run test:solver      # must end with all PASS, exit 0
npm --prefix client run build            # must succeed
npm run dev                              # both boot; leave it running
```

In a second terminal tab:

```bash
curl -s localhost:4000/api/auth/login -H 'content-type: application/json' \
  -d '{"email":"admin@shiftguard.io","password":"demo123"}'
# copy the token, then:
curl -s localhost:4000/api/admin/generate -H 'content-type: application/json' \
  -H 'Authorization: Bearer U1' -d '{"shiftId":"S1"}' | head -c 400
```

You should get routes back. Then open http://localhost:5173 and log in as admin — the shell,
sidebar and login page should work even though the portals still say "Portal not built yet".
That message is expected at this stage.

```bash
git add -A && git commit -m "wave 2: engine, api, client shell"
```

- [ ] W2-A PASS
- [ ] W2-B curl OK
- [ ] W2-C build OK
- [ ] `npm run dev` boots both, login page renders
- [ ] Committed

---

## STEP 3 — Wave 3: four threads at the same time

For each of the four, the prompt is **the shared header + that portal's block**. Copy the
`Shared header` fenced block from the plan, then paste the portal block underneath it, replacing
the `[SHARED HEADER]` line. So each paste is two blocks joined.

Open four new threads:

- [ ] **W3-A Admin portal**
- [ ] **W3-B Vendor portal**
- [ ] **W3-C Driver portal**
- [ ] **W3-D Employee portal**

Keep `npm run dev` running while they work — Vite hot-reloads, so you can watch each portal
appear in the browser as its thread finishes.

**Verify:**

```bash
npm --prefix client run build
```

Then click through all four portals in the browser. Note anything broken but **do not fix it
yourself** — Wave 4 does the fixing, with full context.

```bash
git add -A && git commit -m "wave 3: four portals"
```

- [ ] All four threads done
- [ ] Client build clean
- [ ] Committed

---

## STEP 4 — Wave 4: integration (1 thread)

Open a new thread, paste the **WAVE 4** prompt, and add any breakage you spotted in Step 3 as a
short list at the end of the prompt. That thread runs the full smoke test and fixes.

**Final acceptance — run through this yourself with 3 browser tabs open:**

| # | Check |
|---|---|
| 1 | Admin dashboard: Cabs Saved, KM Saved, ₹ Saved, CO₂ all non-zero |
| 2 | Admin alerts: exactly 3 invalid addresses; fixing one makes that employee routable |
| 3 | Admin route planner: generate S1 → polylines on the map, pink F badges, ≥1 escort flag |
| 4 | Vendor: dispatch a driver + vehicle → route flips to `assigned` |
| 5 | Driver: manifest shows stops in order, **no PINs anywhere** |
| 6 | Driver: Start Trip → cab marker moves along the road |
| 7 | Driver: at ≤50 m PIN unlocks; wrong PIN rejected; correct PIN advances |
| 8 | Employee tab: cab moves live, ETA updates, PIN displayed |
| 9 | Kill your wifi mid-generate → routes still produced via haversine fallback |

```bash
git add -A && git commit -m "wave 4: integration + demo script"
```

- [ ] All 9 acceptance checks pass
- [ ] `DEMO_SCRIPT.md` created
- [ ] Committed

---

## Demo logins (after Wave 1)

Password for everyone: `demo123`

| Role | Email |
|---|---|
| Admin | `admin@shiftguard.io` |
| Vendor | `vendor@saitravels.io` |
| Driver | `driver1@saitravels.io` |
| Employee | `emp1@corp.io` |

For the PIN demo, log in as the **employee whose stop is first on the driver's route** — check
the admin route planner to see which employee that is, then use `empN@corp.io`.

---

## If a thread goes off the rails

| Symptom | Do this |
|---|---|
| Thread edits files it doesn't own | `git checkout -- <file>`, then remind it of its ownership list |
| Thread asks about another thread's code | Reply: "Use the signature in CONTRACTS.md §8/§10/§11 and do not read that file." |
| Thread wants to change CONTRACTS.md | Say no. Have it work around it locally and note the issue for Wave 4. |
| Map renders 0px tall | Parent needs an explicit height (`h-full` inside a fixed-height box) — Wave 4 fix |
| OSRM 429 / hangs | Expected on the public server. The disk cache + fallback should absorb it; if not, it's a Wave 4 bug in `osrm.js` |
| Blank white page | Browser console first. Usually a bad import path in a portal page |

---

## Time expectations

| Wave | Wall clock |
|---|---|
| 1 | 10-15 min |
| 2 | 25-40 min (parallel) |
| 3 | 20-30 min (parallel) |
| 4 | 20-30 min |

Roughly 1.5-2 hours end to end if you verify at each gate. Skipping the gates is what turns it
into a day.
