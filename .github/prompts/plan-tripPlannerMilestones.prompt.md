# Plan: My Travel Helper — Feature Roadmap & Milestones

> **Planning Confidence**: High — Codebase fully explored; existing data models and installed-but-unused libraries make intended next features unambiguous.

## Overview

My Travel Helper is a React + Firebase trip planning app with a solid data model, Google Maps integration, and real-time Firestore sync. Core trip/day/activity CRUD is functional, but several high-value features are **partially scaffolded** (shared trips, budget totals, checklist, drag-and-drop, activity categories) and a second tier of new features would significantly elevate the product. This roadmap organizes work into 6 milestones ordered by user value and implementation dependency.

Scope: **Large** (10+ files, architectural additions, new pages and components).

---

## Context & Requirements

- **Goal**: Identify and prioritize all missing, incomplete, and net-new features into an actionable milestone plan
- **Scope**: Large
- **Assumptions**:
  - `[ASSUMED]` Priority is user-facing value over technical debt
  - `[ASSUMED]` The app targets solo travelers and small groups (≤10 members)
  - `[ASSUMED]` No native mobile app — PWA/responsive web is the mobile strategy
  - `[ASSUMED]` Firebase remains the backend (no migration to other infra)
  - `[ASSUMED] ⚠️ HIGH-RISK` Budget feature targets "expense tracking" (log what you spend) rather than a pre-trip booking integration (Airbnb/Booking.com). Confirm before Milestone 2.

---

## Research Summary

- **Closest Existing Pattern**: `src/pages/TripDetail.tsx` — the core planning view, extended by every milestone
- **Key Files**:
  - `src/lib/types.ts` — all data models; many fields defined but unused
  - `src/lib/firestore/trips.ts` — all Firestore reads/writes
  - `src/pages/Shared.tsx` — stub for shared trip view
  - `src/pages/Profile.tsx` — read-only profile page
  - `src/components/ActivityEditModal.tsx` — activity edit form
  - `src/components/DayTabs.tsx` — day navigation
  - `firestore.rules` — security rules (member model present)
- **External Dependencies**:
  - `@dnd-kit/core` + `@dnd-kit/sortable` — installed, unused
  - `@vis.gl/react-google-maps` — active
  - Google Places API (legacy) — active; migration to Places API v2 advised
  - Firebase 10 — active
- **CLAUDE.md Conventions Applied**: No CLAUDE.md found; conventions inferred from codebase patterns (Tailwind, lucide-react icons, react-hot-toast for notifications, nanoid for IDs)

---

## Milestone 1 — Foundation Completions
> **Theme**: Finish what's already scaffolded. These features have data models, functions, or installed libraries ready; only the UI is missing.

### Steps

**1. Implement drag-and-drop activity reordering**
- **Files**: `src/pages/TripDetail.tsx`, `src/components/ActivityCard.tsx`, `src/lib/firestore/trips.ts`
- **What to do**: Wrap the activity list in `@dnd-kit/core` `DndContext` + `SortableContext`. Make each `ActivityCard` a sortable item. On drag-end, recompute `Activity.order` values for all items in the day and persist via a single `updateDoc` patch. `@dnd-kit` is already installed; no new dependency needed.
- **Dependencies**: None
- **Effort**: M
- **Complexity**: Medium
- **Risks**: Optimistic UI update needed to prevent visual snap-back on slow writes

**2. Add "Remove Day" capability to DayTabs**
- **Files**: `src/components/DayTabs.tsx`, `src/pages/TripDetail.tsx`
- **What to do**: Add a small ✕ icon to each day tab (visible on hover, hidden if only one day remains). On click, show a confirm dialog listing how many activities will be lost. On confirm, call the existing `removeDay(tripId, dayId)` function which already exists in `src/lib/firestore/trips.ts`.
- **Dependencies**: None
- **Effort**: S
- **Complexity**: Low
- **Risks**: If the deleted day was the selected tab, the UI must switch to the nearest remaining day

**3. Implement shared trip read-only view**
- **Files**: `src/pages/Shared.tsx`, `src/lib/firestore/trips.ts`
- **What to do**: Replace the stub in `Shared.tsx`. Add a new Firestore query `getTripByShareToken(token)` that queries trips where `shareToken == token`. Render a read-only version of the trip: itinerary, map, cost summary. No edit controls. Add the share-link button to `src/pages/TripDetail.tsx` that copies `window.location.origin/#/shared/{shareToken}` to clipboard using `navigator.clipboard`. If `shareToken` is null, generate one with `nanoid(12)` and persist via `updateTrip`.
- **Dependencies**: None
- **Effort**: M
- **Complexity**: Medium
- **Risks**: Firestore security rules currently require `request.auth != null` for trips — rules must be updated to allow unauthenticated reads by `shareToken`

**4. Wire up post-login redirect to original URL**
- **Files**: `src/pages/Login.tsx`
- **What to do**: After a successful sign-in, read `location.state?.from` (already set by `AuthGuard`) and `navigate(from ?? '/trips', { replace: true })`. One-line change.
- **Dependencies**: None
- **Effort**: XS
- **Complexity**: Low
- **Risks**: None

**5. Add day-level notes editing**
- **Files**: `src/pages/TripDetail.tsx`, `src/lib/firestore/trips.ts`
- **What to do**: Below the Places search input in the sidebar, add a collapsible textarea for the current day's `notes` field. On blur/debounce, call `updateDoc` on the day doc with the new notes value. The `Day.notes` field is already in the data model.
- **Dependencies**: None
- **Effort**: S
- **Complexity**: Low
- **Risks**: None

**Total M1 Effort**: ~5–8 hours

---

## Milestone 2 — Budget & Trip Depth
> **Theme**: Make the budget tracking and trip information features visible and useful.

**6. Build budget dashboard in TripDetail sidebar**
- **Files**: `src/pages/TripDetail.tsx`, `src/components/ActivityCard.tsx`
- **What to do**: Add a "Budget" tab or collapsible panel in the sidebar showing: per-activity cost list, day subtotal, trip grand total. All costs are already stored on `Activity.cost`. Use `formatMoney(amount, trip.currency)` from `utils.ts`. Add a "Budget limit" field to `Trip` (new optional field `budgetLimit?: Money`) with a progress bar when limit is set.
- **Dependencies**: None
- **Effort**: M
- **Complexity**: Medium
- **Risks**: Multi-currency activities (each activity can have its own currency) make trip-level totals misleading; consider showing a warning when currencies differ

**7. Add checklist UI to TripDetail**
- **Files**: `src/pages/TripDetail.tsx`, `src/lib/firestore/trips.ts`
- **What to do**: Add a "Checklist" panel (sidebar tab or slide-out drawer). Render `trip.checklist` items as checkboxes. Support add (text input + Enter), toggle `done`, and delete. Each change calls `updateTrip(tripId, { checklist: updatedArray })`. The `ChecklistItem` type and `checklist` field on `Trip` already exist.
- **Dependencies**: None
- **Effort**: S
- **Complexity**: Low
- **Risks**: Concurrent edits by multiple members could cause list conflicts (Firestore array operations are not atomic for object arrays — use `updateDoc` with full array replacement)

**8. Add activity category picker and filter**
- **Files**: `src/components/ActivityEditModal.tsx`, `src/pages/TripDetail.tsx`
- **What to do**: In `ActivityEditModal`, add a category selector (`sight | food | hotel | transport | other`) using icon buttons (lucide-react icons available). Pre-populate from `poi.category` when available. In the sidebar header, add category filter pills to show/hide activities by category.
- **Dependencies**: None
- **Effort**: S
- **Complexity**: Low
- **Risks**: None

**9. Display trip description and cover photo**
- **Files**: `src/pages/TripDetail.tsx`, `src/components/NewTripModal.tsx`, `src/components/TripCard.tsx`
- **What to do**: Add a description textarea to `NewTripModal` and save to `Trip.description`. In `TripCard`, display `coverPhotoUrl` as a card header image (fallback to a gradient placeholder). In `TripDetail`, show the description below the trip title. Allow editing description from TripDetail page header.
- **Dependencies**: None
- **Effort**: S
- **Complexity**: Low
- **Risks**: `coverPhotoUrl` has no upload mechanism — use the destination POI's `photoUrl` as the default cover photo

**Total M2 Effort**: ~5–7 hours

---

## Milestone 3 — Collaboration & Sharing
> **Theme**: Enable multi-user collaborative planning.

**10. Build trip member invitation system**
- **Files**: `src/pages/TripDetail.tsx`, `src/lib/firestore/trips.ts`, `firestore.rules`
- **What to do**: Add an "Invite" button in TripDetail that opens a modal. Invite via email: query `users` collection for a matching email (requires Step 11 below). Add the found UID to `trip.memberIds` via `updateTrip`. Add a member list panel showing current members with a "Remove" option (owner only). Update Firestore rules so only the owner can modify `memberIds`.
- **Dependencies**: Step 11
- **Effort**: L
- **Complexity**: High
- **Risks**: Email-based lookup exposes user UIDs — ensure the `users` collection rule only allows looking up by exact email (not browsable). ⚠️ HIGH-RISK

**11. Write UserProfile to Firestore on sign-in**
- **Files**: `src/hooks/useAuth.tsx`, `src/lib/firestore/trips.ts`
- **What to do**: In `useAuth.tsx`, after a successful `signInWithPopup`, call `setDoc(doc(db, 'users', uid), { uid, displayName, email, photoURL }, { merge: true })`. This enables email-based member lookup. Update Firestore rules so users can only read their own doc, but the app can search by email.
- **Dependencies**: None
- **Effort**: S
- **Complexity**: Medium
- **Risks**: Making email searchable requires careful rules design — consider a separate `usersByEmail/{email}` lookup collection instead of a queryable `email` field

**12. Add user profile preferences page**
- **Files**: `src/pages/Profile.tsx`, `src/lib/firestore/trips.ts`
- **What to do**: Add a form to `Profile.tsx` with: default currency selector, display name editor, preferred date format toggle. Save to `UserProfile.prefs` in Firestore. Read prefs on app load and apply default currency to `NewTripModal`.
- **Dependencies**: Step 11
- **Effort**: S
- **Complexity**: Low
- **Risks**: None

**Total M3 Effort**: ~6–9 hours

---

## Milestone 4 — Activity Richness
> **Theme**: Make individual activities more detailed and useful.

**13. Add transport and note activity types**
- **Files**: `src/components/ActivityEditModal.tsx`, `src/pages/TripDetail.tsx`, `src/components/ActivityCard.tsx`
- **What to do**: Add an "Add note" and "Add transport leg" button in the sidebar (alongside the Places search). A "transport" activity gets fields: from/to text, transport mode (flight/train/bus/car), confirmation number, duration. A "note" activity is a freeform text block. Render these as distinct card styles in `ActivityCard` (no map marker for notes; transport gets a distinct icon). The `Activity.type` field already supports `'transport' | 'note'`.
- **Dependencies**: None
- **Effort**: M
- **Complexity**: Medium
- **Risks**: `TripMap.tsx` must skip non-POI activities when rendering markers

**14. Add activity photo support**
- **Files**: `src/components/ActivityEditModal.tsx`, `src/components/ActivityCard.tsx`
- **What to do**: In `ActivityEditModal`, add a photo section that auto-populates the Google Places photo (already fetched into `POI.photoUrl`) and allows the user to add photo URLs (URL input; no file upload in this iteration). Store in `Activity.photos[]`. Display a thumbnail strip in `ActivityCard`.
- **Dependencies**: None
- **Effort**: S
- **Complexity**: Low
- **Risks**: File upload requires Firebase Storage — defer to a later enhancement; URL-based photos avoid this dependency

**15. Add timeline / time visualization view**
- **Files**: `src/pages/TripDetail.tsx` — new `TimelineView` component
- **What to do**: Add a "Timeline" toggle button above the activity list. When active, render activities in a vertical timeline with time slots (06:00–23:00 grid), proportional to `durationMinutes`. Activities without times float at the bottom. This leverages the existing `startTime` and `durationMinutes` fields.
- **Dependencies**: None
- **Effort**: L
- **Complexity**: High
- **Risks**: Overlapping activities at the same time need visual handling

**Total M4 Effort**: ~6–10 hours

---

## Milestone 5 — Export & Discovery
> **Theme**: Help users share their trip and discover new places.

**16. Implement PDF / print export**
- **Files**: `src/pages/TripDetail.tsx` — new `ExportModal` component
- **What to do**: Add an "Export" button to TripDetail header. Use `window.print()` with a dedicated print stylesheet (`@media print`) that hides the map and formats the itinerary as a clean printable page. Alternatively integrate `jsPDF` + `html2canvas` for a direct download.
- **Dependencies**: None
- **Effort**: M
- **Complexity**: Medium
- **Risks**: Maps rendering in print context is unreliable; hide `TripMap` for print output

**17. Add iCal / Google Calendar export**
- **Files**: `src/pages/TripDetail.tsx`
- **What to do**: Generate an `.ics` file from trip days and activities (RFC 5545 format). Each activity with a `startTime` becomes a `VEVENT`. Trigger a file download via a `Blob` + anchor click. No external library required for basic iCal generation.
- **Dependencies**: None
- **Effort**: M
- **Complexity**: Medium
- **Risks**: Time zone handling — `startTime` is stored as `"HH:mm"` local time; iCal requires timezone-aware `DTSTART`

**18. Add "Nearby suggestions" from Google Places**
- **Files**: `src/components/TripMap.tsx`, `src/pages/TripDetail.tsx`
- **What to do**: Add a "Discover nearby" button in the sidebar. Use `PlacesService.nearbySearch()` centered on the selected activity's coordinates (or trip destination). Show up to 10 results in a panel with a one-click "Add to itinerary" action.
- **Dependencies**: None
- **Effort**: M
- **Complexity**: Medium
- **Risks**: Google Places API billing — nearbySearch counts as one request per call; add visible "powered by Google" attribution

**Total M5 Effort**: ~5–8 hours

---

## Milestone 6 — Polish & Platform
> **Theme**: Production readiness, mobile experience, and offline capability.

**19. Improve mobile responsiveness**
- **Files**: `src/pages/TripDetail.tsx`, `src/components/DayTabs.tsx`
- **What to do**: The current split layout (sidebar + map) breaks on mobile screens. Implement a bottom-tab toggle between "List" and "Map" views on screens < 768px using Tailwind responsive prefixes. Make `DayTabs` horizontally scrollable on mobile.
- **Dependencies**: None
- **Effort**: M
- **Complexity**: Medium
- **Risks**: Map height on mobile requires careful viewport handling (`100dvh`)

**20. Add PWA / offline support**
- **Files**: `vite.config.ts`, new `sw.ts` service worker
- **What to do**: Add `vite-plugin-pwa` to Vite config. Configure a manifest (`name`, `icons`, `theme_color`). Enable Firebase offline persistence via `enableIndexedDbPersistence(db)` in `firebase.ts`. Configure a cache-first strategy for static assets and network-first for Firestore.
- **Dependencies**: None
- **Effort**: M
- **Complexity**: Medium
- **Risks**: IndexedDB persistence must be enabled before any Firestore reads; add it as the first call in `firebase.ts`

**21. Migrate Google Places API to Places API v2**
- **Files**: `src/components/PlacesAutocomplete.tsx`, `src/components/TripMap.tsx`
- **What to do**: Replace deprecated `google.maps.places.AutocompleteService` and `PlacesService` with the new `google.maps.places.Place` and `AutocompleteSessionToken` APIs from `@vis.gl/react-google-maps` v1's `usePlacesLibrary`. Update photo URL retrieval (no more `.getUrl()` — use `photo.getURI()`).
- **Dependencies**: None
- **Effort**: M
- **Complexity**: Medium
- **Risks**: Breaking changes in photo fetching will affect `POI.photoUrl` population

**22. Add weather information for trip dates/destinations**
- **Files**: `src/pages/TripDetail.tsx` — new `WeatherWidget` component
- **What to do**: Integrate Open-Meteo API (free, no API key) to fetch a 16-day weather forecast for the trip's destination coordinates. Show a compact 5-day weather strip in the TripDetail header with temperature range and condition icon. Only show for trips within 16 days of today.
- **Dependencies**: None (Open-Meteo requires no API key)
- **Effort**: M
- **Complexity**: Medium
- **Risks**: Open-Meteo returns UTC-based forecasts; local-time alignment needed for destinations in different time zones

**Total M6 Effort**: ~7–10 hours

---

## Full Feature Comparison Table

| Feature | Milestone | Status Today | Complexity |
|---|---|---|---|
| Activity drag-and-drop reorder | M1 | Library installed, no UI | Medium |
| Remove day | M1 | Function exists, no UI | Low |
| Shared trip read-only view | M1 | Stub page only | Medium |
| Post-login URL redirect | M1 | Bug — always goes to `/trips` | Low |
| Day-level notes | M1 | Field exists, no UI | Low |
| Budget dashboard | M2 | Data stored, no rollup UI | Medium |
| Checklist UI | M2 | Type + field exist, no UI | Low |
| Activity categories + filter | M2 | Type exists, no picker | Low |
| Trip description / cover photo | M2 | Fields exist, never shown | Low |
| Member invitation | M3 | Data model only | High |
| UserProfile Firestore write | M3 | Type defined, never written | Medium |
| User preferences page | M3 | Read-only profile today | Low |
| Transport + note activity types | M4 | Types defined, only `poi` used | Medium |
| Activity photo support | M4 | Field defined, never shown | Low |
| Timeline view | M4 | Net-new | High |
| PDF / print export | M5 | Net-new | Medium |
| iCal export | M5 | Net-new | Medium |
| Nearby suggestions | M5 | Net-new | Medium |
| Mobile responsive layout | M6 | Partially broken | Medium |
| PWA / offline support | M6 | Net-new | Medium |
| Places API v2 migration | M6 | On deprecated API | Medium |
| Weather widget | M6 | Net-new | Medium |

---

## Alternatives Considered

1. **Feature flags / gradual rollout approach**
   - **Approach**: Wrap each new feature in a Firebase Remote Config flag
   - **Pros**: Safer rollout, easy A/B testing
   - **Cons**: Significant added complexity for a small-team project; Remote Config adds a new dependency
   - **Decision**: Not chosen — prioritize shipping features

2. **Third-party trip planning API (e.g., Amadeus, TripAdvisor)**
   - **Approach**: Replace Google Places with a specialized travel API for richer content
   - **Pros**: Hotel prices, flight data, structured itineraries
   - **Cons**: High cost, complex auth, breaks existing POI model
   - **Decision**: Not chosen — Google Places + Open-Meteo covers the needs within the current stack

3. **Current approach: Extend existing Firebase + Google Maps stack** ✅
   - **Approach**: All milestones build on existing infrastructure
   - **Pros**: Zero new infrastructure cost, consistent architecture, leverages already-installed libraries
   - **Decision**: Chosen — lowest friction, fastest delivery

---

## Definition of Done (per milestone)

- [ ] All new features have corresponding Firestore security rule updates where data access changes
- [ ] All new `updateTrip` / `updateDoc` calls go through `stripUndefinedDeep` to prevent Firestore write errors
- [ ] No TypeScript errors introduced (`tsc --noEmit` passes)
- [ ] New UI components follow existing Tailwind + lucide-react patterns
- [ ] All user-facing errors are surfaced via `react-hot-toast`
- [ ] Mobile viewports (375px+) render each new feature without overflow or layout breakage
- [ ] Firestore security rules are updated and tested for each new data access pattern

---

## Risks & Mitigation

1. **Google Places legacy API deprecation (existing)**
   - **Impact**: High | **Likelihood**: High (already deprecated as of March 2025)
   - **Mitigation**: Milestone 6, Step 21 addresses this; block new Places-dependent features on the migration

2. **Firestore rule gaps in member collaboration**
   - **Impact**: High | **Likelihood**: Medium
   - **Mitigation**: Step 10 includes a Firestore rules audit; add rule that only `ownerId` can modify `memberIds`

3. **Email lookup in `users` collection leaks PII**
   - **Impact**: High | **Likelihood**: Medium
   - **Mitigation**: Use a separate `usersByEmail/{hashedEmail}` collection rather than a queryable `email` field on the user doc

4. **`@dnd-kit` conflicts with click handlers on `ActivityCard`**
   - **Impact**: Medium | **Likelihood**: Medium
   - **Mitigation**: Use `@dnd-kit`'s `activationConstraint: { distance: 8 }` to distinguish drag from tap

5. **Multi-currency budget totals are misleading**
   - **Impact**: Medium | **Likelihood**: High
   - **Mitigation**: Group costs by currency in the budget dashboard rather than summing across currencies

---

## Open Questions

1. **Should "invite member" require the invitee to already have an account, or support email invitation for new users?** — *Blocks: Step 10. Default assumption: existing accounts only (lookup by email in `users` collection).*
2. **Should the budget feature track pre-planned estimates or actual post-trip expenses?** — *Blocks: Step 6. Default assumption: both — activities have an estimated cost; a separate "actual" field could be added.*
3. **What is the cover photo strategy — auto-use the destination photo from Google Places, or allow user-uploaded images?** — *Blocks: Step 9. Default assumption: auto-use destination POI `photoUrl` as cover; file upload deferred to M6.*

---

## Next Steps

- Confirm the three **Open Questions** above before starting M2 and M3
- Start with **Milestone 1** (all scaffolding already exists — fastest wins)
- Run **Steps 1, 2, 4, 5** in parallel (no dependencies between them)
- Step 3 (shared trip view) requires a Firestore rules change — test in Firebase Emulator before deploying
