# NexRyde — Work Zone (driver territory dispatch)

## What this is

A driver declares a **work zone** for the day (e.g. "Victoria Island ↔ Lekki Phase 1 & 2").
From that moment, dispatch only offers him trips where **BOTH pickup AND dropoff are inside his
zone**. He drives his corridor all day and ends near where he started. Set once, system filters —
no browsing/rejecting a feed (that's inDrive's tiring model; ours is set-and-forget).

Designed with our founding drivers (Timmaj). The strategic pairing: **work zones = the driver
predicts his geography; zero commission = he predicts his income.** "Know your area. Know your
money. Before you start your engine." No Nigerian platform offers both.

## Replaces the existing "trip to destination" feature

The current 3-per-day "trip to destination" in the driver map is the Uber destination-mode pattern
(a temporary heading, rationed). Work Zone supersedes it:

- **Remove/retire the 3-per-day trip-to-destination feature and its UI.** Migrate any reusable
  logic (destination matching, map area selection) into Work Zone.
- If any driver-facing copy references it, replace with Work Zone copy.

## 1. Zone definition (driver-facing)

**Where:** Driver app — a "Work Zone" section in the hub/home (near go-online).

**Zone picker:**
- Driver selects one or more **adjacent named areas** from our existing area definitions (the same
  areas shown on the driver home map: Victoria Island, Lekki Phase 1, Lekki Phase 2, Sangotedo,
  Ajah, etc.). Selecting 1–4 adjacent areas forms the zone.
- Show the zone visually on the map (highlight the covered areas) before confirming.
- Store as a set of area IDs + a computed geo boundary (polygon or union of area polygons) on the
  driver's active state.

**Lifecycle:**
- Zone is **per-day**: activates when set, auto-expires at end of day (config: expiry hour) or when
  the driver turns it off. Going offline does NOT clear it (he can come back after lunch).
- Driver can change/clear the zone anytime; takes effect on the next dispatch.
- Driver home shows an active-zone chip: "🗺 Zone: VI ↔ Lekki Ph 1–2 · ON" with tap-to-manage.

## 2. Dispatch integration (the core)

In the dispatch/offer flow (where favorite-priority and radius checks already run):

```
eligible(driver, trip):
  if driver.work_zone is active:
      return point_in_zone(trip.pickup) AND point_in_zone(trip.dropoff)
  else:
      normal eligibility rules
```

- **Both endpoints inside the zone** — pickup AND dropoff.
- Zone filtering **composes with existing rules**: favorite-driver priority still applies within
  the zone; full trip visibility still shows; free decline unchanged.
- Use existing Redis geo-presence for driver location; zone check is an additional filter on trip
  endpoints.
- **Performance:** precompute area membership for pickup/dropoff once per trip request.

## 3. Marketplace guardrails (critical — protects riders)

Two throttles, both **server config**:

- `work_zone.max_zoned_share` (e.g. 0.3): at most X% of currently-online drivers in an area may be
  zoned at once. When the cap is reached: "Zone slots full for this area right now — try later."
  (Founding drivers bypass the cap.)
- `work_zone.min_online_drivers` (e.g. 5): zone activation requires at least N drivers online in
  the corridor.

Both values adjustable without redeploy.

## 4. Pricing — included with driver plan (trial + subscription)

Work Zone is **included in the NexRyde driver plan**. There is **no additional fee** and no separate Work Zone entitlement or add-on purchase flow.

- Server enforcement mirrors go-online: `active` (not expired), `grace_period`, or `trial` with `trial_active`.
- Trial drivers can use Work Zone during their evaluation period — same experience they subscribe to keep.
- Founding / test drivers on trial receive Work Zone automatically.
- If trial ends or subscription expires: Work Zone becomes unavailable; driver cannot activate until they subscribe.
- Driver-facing copy: **"Included with your NexRyde driver plan"** (trial) or **"Included with your NexRyde subscription"** (paid) — never the word "free" alone.

Every NexRyde driver automatically gets:

- 100% of every fare
- Work Zone included
- Full trip details before accepting
- Favourite Rider support
- Favourite Driver support
- Zero commission
- One predictable monthly payment

### Idle suggestion (30 minutes)

If a driver has Work Zone enabled and receives zero eligible offers for 30 minutes, the app suggests:

> You're receiving fewer requests in this zone right now.
>
> Would you like to:
> - Expand your Work Zone
> - Turn off Work Zone temporarily
> - Keep current zone

The decision remains entirely with the driver.

## 5. Driver economics display

On the zone picker, show simple demand context per area:
- "VI ↔ Lekki: ~40 trips/day this week" (from trip history aggregates).
- Low volume warning: "Low demand here — you may wait long between trips."

## 6. What NOT to build

- No inDrive-style open request feed.
- No per-trip price bidding.
- No dropoff-only or pickup-only zone variants.

## Rollout

1. Feature flag `work_zone.enabled` — default **OFF**.
2. Early access for founding drivers (`work_zone_early_access` + `WORK_ZONE_EARLY_ACCESS_EMAILS`).
3. General availability when corridor density clears `min_online_drivers` comfortably.

## Acceptance criteria

1. Old 3-per-day trip-to-destination removed; no orphaned UI/copy.
2. Zoned driver (VI + Lekki Ph1 + Ph2) → every offer has pickup AND dropoff inside zone;
   VI→Ikeja never offered. Logged: `[ZONE] driver=X trip=Y pickup_in=true dropoff_in=false → skipped`.
3. Zoned driver still gets favorite-priority within zone; full trip details; free decline.
4. Zone expires end-of-day; chip shows state; going offline preserves it.
5. Caps enforced server-side with clear messages; founding drivers bypass share cap.
6. Entitlement = **active trial, grace period, or paid subscription** (server-enforced); zone cleared on lapse; early-access flag for rollout only.
7. Feature flag OFF by default; ON for founding-driver accounts for testing.
8. Cross-zone rider trips still dispatch to non-zoned drivers with no added latency.

## Implementation map

| Layer | Location |
|-------|----------|
| Config | `backend/work_zone_config.py` |
| Areas | `backend/work_zone_areas.py` |
| Service | `backend/work_zone_service.py` |
| API | `backend/routers/work_zone.py` |
| Dispatch filter | `backend/routers/trips.py` → `_get_eligible_drivers_for_trip` |
| Driver UI | `frontend/app/driver/work-zone.tsx`, driver-home chip |

## Config keys (defaults)

| Env key | Default | Purpose |
|---------|---------|---------|
| `WORK_ZONE_ENABLED` | `false` | Global feature flag |
| `WORK_ZONE_MAX_ZONED_SHARE` | `0.3` | Share cap per corridor |
| `WORK_ZONE_MIN_ONLINE_DRIVERS` | `5` | Minimum online before activation |
| `WORK_ZONE_EXPIRY_HOUR_WAT` | `23` | End-of-day expiry (WAT) |
| `WORK_ZONE_EARLY_ACCESS_EMAILS` | `loopy9ice@gmail.com` | Rollout bypass when flag OFF |
| `WORK_ZONE_MAX_AREAS` | `4` | Max adjacent areas per zone |
| `idle_suggestion_minutes` | `30` | Client idle prompt (from `/work-zone/config`) |

## Driver pitch (Timmaj)

Three lines — all included in one flat subscription:

1. Keep 100% of every fare.
2. Control exactly where you work (Work Zone).
3. Your regulars can book you directly.

No competitor in Nigeria can say all three; two are structurally impossible for Bolt to copy.
