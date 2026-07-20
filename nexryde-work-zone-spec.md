# NexRyde — Work Zone (driver territory dispatch)

## What this is

A driver declares one or more **work zones** for the day using real searchable places
(state, city, LGA, town, district, estate, neighborhood, or landmark).
From that moment, dispatch prioritizes trips whose pickup is inside one of those radius geofences.
He can work familiar areas without waiting for NexRyde to predefine a city list. Set once, system filters —
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
- Driver searches Google Places through the backend proxy and selects one or more real places.
- Supported searches include state, city, LGA, town, district, estate, neighborhood, and landmark.
- Each selected zone stores `place_id`, label, address, lat/lng, country/state metadata, and radius.
- The old hardcoded Lagos area registry is legacy-only for already-saved profiles and old clients.

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
      return point_in_any_radius_zone(trip.pickup)
  else:
      normal eligibility rules
```

- **Pickup inside the zone** is the primary filter. Dropoff-inside is logged for transparency but does
  not block a local pickup from being served.
- Zone filtering **composes with existing rules**: favorite-driver priority still applies within
  the zone; full trip visibility still shows; free decline unchanged.
- Use existing Redis geo-presence for driver location; zone check is an additional filter on trip
  endpoints.
- **Performance:** use radius/geofence checks against normalized profile zones; add coarse geospatial
  prefilters when volume grows.

## 3. Marketplace telemetry

These values are information only and must never block activation:

- Online driver count near selected zones.
- Recent demand/trips near selected zones.
- `activation_requires_online_driver_count` is always `false`.

A single driver can activate any work zone, including a brand-new neighborhood.

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

On the zone picker, show simple demand context per selected place:
- "Sangotedo: ~40 trips/week · 3 drivers online nearby" (from trip history aggregates).
- Low volume warning: "Low demand here — you may wait long between trips."

## 6. What NOT to build

- No inDrive-style open request feed.
- No per-trip price bidding.
- No hardcoded city list as the primary selector.

## Rollout

1. Feature flag `work_zone.enabled` — default **OFF**.
2. Early access for founding drivers (`work_zone_early_access` + `WORK_ZONE_EARLY_ACCESS_EMAILS`).
3. General availability can launch city by city, but activation must not depend on online-driver density.

## Acceptance criteria

1. Old 3-per-day trip-to-destination removed; no orphaned UI/copy.
2. Zoned driver selects any real place; pickup inside the selected radius is eligible.
   Pickup outside all selected radii is skipped and logged with `[ZONE]`.
3. Zoned driver still gets favorite-priority within zone; full trip details; free decline.
4. Zone expires end-of-day; chip shows state; going offline preserves it.
5. Online driver counts and demand are shown as context only; they never disable activation.
6. Entitlement = **active trial, grace period, or paid subscription** (server-enforced); zone cleared on lapse; early-access flag for rollout only.
7. Feature flag OFF by default; ON for founding-driver accounts for testing.
8. Cross-zone rider trips still dispatch to non-zoned drivers with no added latency.

## Implementation map

| Layer | Location |
|-------|----------|
| Config | `backend/work_zone_config.py` |
| Legacy area adapter | `backend/work_zone_areas.py` |
| Service | `backend/work_zone_service.py` |
| API | `backend/routers/work_zone.py` |
| Dispatch filter | `backend/routers/trips.py` → `_get_eligible_drivers_for_trip` |
| Driver UI | `frontend/app/driver/work-zone.tsx`, driver-home chip |

## Config keys (defaults)

| Env key | Default | Purpose |
|---------|---------|---------|
| `WORK_ZONE_ENABLED` | `false` | Global feature flag |
| `WORK_ZONE_MAX_ZONED_SHARE` | `0.3` | Informational marketplace telemetry |
| `WORK_ZONE_MIN_ONLINE_DRIVERS` | `1` | Informational telemetry only |
| `WORK_ZONE_EXPIRY_HOUR_WAT` | `23` | End-of-day expiry (WAT) |
| `WORK_ZONE_EARLY_ACCESS_EMAILS` | `loopy9ice@gmail.com` | Rollout bypass when flag OFF |
| `WORK_ZONE_MAX_ZONES` | `4` | Max selected place zones |
| `WORK_ZONE_DEFAULT_RADIUS_M` | `5000` | Default radius for a selected place |
| `idle_suggestion_minutes` | `30` | Client idle prompt (from `/work-zone/config`) |

## Driver pitch (Timmaj)

Three lines — all included in one flat subscription:

1. Keep 100% of every fare.
2. Control exactly where you work (Work Zone).
3. Your regulars can book you directly.

No competitor in Nigeria can say all three; two are structurally impossible for Bolt to copy.
