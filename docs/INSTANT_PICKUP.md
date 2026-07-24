# Instant Pickup Detection Engine

Riders always see a human-readable pickup — never raw GPS coordinates.

## Flow

1. Smart GPS acquires a fix (`smartPickupGps.ts`).
2. Instant Pickup Engine resolves a label (`instantPickupEngine.ts`):
   - Local AsyncStorage + nearby cell cache (&lt;500 ms warm)
   - `GET /api/places/reverse-geocode` with H3/Redis reuse
   - Auto-retry → `"Near your location"` fallback (never coords)
3. UI shows `"Detecting your pickup..."` then cross-fades via `AnimatedPickupLabel`.
4. Movement ≥ ~25 m refreshes the label.
5. Destination search preloads the pickup resolve.

## Label priority (server)

Landmark → Building → Street → Estate → Area → City  
(`backend/instant_pickup.py`)

## Config

| Env | Default | Meaning |
|-----|---------|---------|
| `NEXRYDE_PICKUP_H3_RES` | `10` | H3 cache resolution (~66 m) |
| `NEXRYDE_PICKUP_REUSE_RADIUS_M` | `35` | Soft reuse radius |

## Tests

```bash
cd backend && pytest tests/test_instant_pickup.py -q
```
