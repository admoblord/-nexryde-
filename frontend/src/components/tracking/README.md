# NEXRYDE Tracking V2

## Status

The previous tracking screen (`RiderTrackingScreen.tsx` + `panels/*`) has been
**deleted** and replaced by a brand-new, map-first screen built from scratch.

Archived legacy monolith: `_legacy/TrackingScreenLegacy.tsx`

## Layout (live trip)

Map fills the entire viewport; everything floats above it as dark glass cards.

| Element | File |
|---------|------|
| Screen | `v2/NexrydeTrackingV2.tsx` |
| Styling tokens | `v2/trackingV2Theme.ts` |
| Floating header | `v2/TrackingHeaderV2.tsx` |
| Floating ETA card | `v2/ArrivalStatusCardV2.tsx` |
| Driver profile (plate hero) | `v2/DriverProfileCardV2.tsx` |
| Trip progress track | `v2/TripProgressCardV2.tsx` |
| Safe pickup (code + vehicle) | `v2/SafePickupCardV2.tsx` |
| Call / Chat / Share / SOS | `v2/ActionButtonsCardV2.tsx` |
| Fare + payment method | `v2/FareCardV2.tsx` |
| Bottom status bar | `v2/TrackingBottomBarV2.tsx` |

The bottom card stack is a scroll view capped at ~44% of the screen, so the
map always stays the hero (70%+ visible at rest).

## Map

`map/TrackingMapShell.tsx` → `map/TrackingMap.native.tsx` (react-native-maps,
animated driver car, traveled/remaining route split). Unchanged by V2 — only
the presentation layer around it was rebuilt.

## Data layer

Session + WebSocket + polling + actions live in
`hooks/useRiderTrackingSession.ts`. V2 consumes it as-is.

## Route

`app/rider/tracking.tsx` → `v2/NexrydeTrackingV2.tsx`

Finding phase uses the rebuilt `src/components/finding/FindingDriverScreenV2`
(radar matching experience); payment phase uses `TrackingPaymentView`.
