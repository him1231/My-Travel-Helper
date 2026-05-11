# My Travel Helper

A trip planner web app — interactive map, day-by-day itinerary, scratch lists, budget tracking, sharing, and more.
Frontend-only, hosted on GitHub Pages, with Firebase Auth + Firestore as the only backend.

## Live demo

**https://him1231.github.io/My-Travel-Helper/**

Sign in with Google to get started. No account required beyond a Google account.

## Features

### Trip management
- Create trips with title, destination (Google Places autocomplete), dates, currency, and optional budget limit
- Trip list with live Firestore sync — changes appear across tabs instantly
- Invite collaborators by email; share a public read-only link
- Delete trips (with all days, lists, and activities)

### Day-by-day itinerary
- **Day tabs** with optional **custom titles** (e.g. "Tokyo arrival"); fall back to "Day N" if unset
- **Customisable tab display** — gear popup lets you toggle title/date/stop-count per tab; preference persists in localStorage
- Add or remove days freely; date label and stop count update live
- Drag-and-drop reorder activities within a day (powered by @dnd-kit)
- Activity types: **POI** (from Places search), **transport**, **note**, and **flight**
- Per-activity: start time, duration, cost, notes, category, photos, drive route mode

### Flight import
- **Add flight** button (bottom-of-sidebar quick-add row, alongside Note / Transport)
- **Two import modes** — switchable tabs in the modal:
  - **Manual entry** — structured form for airline, flight number, departure/arrival airport (IATA) + city + local datetime + terminal + gate, plus confirmation/PNR, seat, class
  - **Paste from email** — drop in a confirmation email; a regex extractor pre-fills airline, flight number, IATA codes, times, dates, confirmation, seat, class, terminal, and gate. You jump to the manual tab to review and edit before saving — never a silent import.
- **IATA autocomplete** — airline name + departure/arrival airport-code fields suggest as you type. Bundled lookup table covers top global carriers + every airline serving Hong Kong, and ~200 major airports worldwide (`src/data/iata-*.json`). Free-text is preserved, so unknown codes still work.
- Flight lands on the day matching its **departure date**; if that day isn't in the trip yet, it's auto-created so the flight has a home.
- **Custom card layout** in the day list and shared view: cyan plane badge, airline · flight #, `JFK → LHR · 14:30 → 02:30+1` (overnight day-shift indicated), terminal/gate, confirmation, seat, class chip
- **iCal export** treats flights specially: location becomes `JFK ✈ LHR`, description includes confirmation, seat, terminals, and gates
- No paid flight-status API — the feature is purely about capturing/displaying booking data the user already has

#### Seeding IATA data to Firestore (optional)
The app reads IATA data directly from bundled JSON — no Firestore reads
needed at runtime. A one-time seed script is provided so the same data
can also be stored in Firestore for any future server-side feature:

```bash
# 1) Firebase Console → Project Settings → Service accounts → Generate
#    new private key, save as `service-account.json` at the repo root
#    (already gitignored).
# 2) Run:
npm run seed:iata
```

Writes two single-document maps: `iata/airlines` and `iata/airports`,
each storing the full list plus a `updatedAt` server timestamp.

### Scratch / planning lists
- Named lists for backup POIs and "maybe" options, kept beside day tabs
- Stored as `trips/{tripId}/lists/{listId}` Firestore subcollection
- Drag activities between days **and** lists; cross-container moves use atomic `writeBatch`
- Save POIs from the map directly to any list

### Interactive map (Google Maps)
- Side-by-side itinerary list + map on desktop; toggle tabs on mobile
- **Numbered markers** match list order; selecting a card bounces its pin and vice-versa
- **Click any Google POI** (restaurant, museum, hotel) → bottom sheet with photo, name, address, rating
  - "Add to day" button (or "Already added" check if its `placeId` is already in the day/list)
  - "📋 Save to list" button to drop the POI into any scratch list
  - Auto-detected category (food / sight / hotel / transport / other)
- **Route ribbon** — dashed grey lines connect every consecutive POI; a distance chip floats at each segment midpoint
- **Walk radius** — 10 / 20 / 30-minute walking circle around the selected POI
- **Nearby suggestions** — opening a POI fetches 5 nearby places shown as scrollable chips you can pivot to with one tap
- **Category explore layers** — Food / Sights / Hotels / Transit pills fetch nearby places of that type and render orange emoji markers
- **Multi-day pins toggle** — overlay every other day's activities as faint coloured dots (one colour per day) to spot geographic overlap
- **⚡ Optimize route** — greedy nearest-neighbour reorder of stops; visible when the day has ≥3 POIs
- **📍 Search here** — hold/long-press the map (600 ms) to drop a draggable purple pin with a 500 m radius circle for area search
- **Map auto-fit** to all pins for the selected day or list
- **Search overlay** — the Places autocomplete floats at the top of the map (not in the toolbar)

### Trip overview (kanban + map)
- One-click switch from day-by-day to a full-trip overview
- **Kanban** — columns for every day (with day-colour stripe, title, date, stop count, notes snippet) and every scratch list
- Drag activities between any two columns; click a column header to jump back to that day's detail
- **Overview map** — colour-coded SVG pin markers per day with a legend; scratch-list items use a neutral colour
- Day-tab toolbar auto-hides in overview mode (the kanban already shows every day)

### Planning sidebar (all sections collapsible)
- **Day title** — inline editable, auto-saved with debounce
- **Day notes** — shown first; freeform textarea, auto-saved with debounce; ✓ badge when notes exist
- **Stops** — list view with category filter pills *or* timeline view; drag-and-drop reorder
- **Budget** — per-activity cost breakdown, day total, trip total with progress bar vs budget limit
- **Checklist** — trip-level packing list with check/uncheck and add/remove items
- **Quick-add buttons** at the very bottom: + Note · + Transport · + Flight (single tap from anywhere in the sidebar)

### Header & weather
- Combined app + trip header: logo, back button, trip title/destination/dates, trip actions, signed-in user
- Trip actions: Overview toggle, Weather toggle, Share link, Invite member, Print/PDF, iCal export, Delete
- **Weather toggle** — hidden by default; cloud button shows/hides a 5-day forecast strip (Open-Meteo, free)

### Export & sharing
- **iCal (.ics)** export for all timed activities (opens in calendar apps)
- **Print / PDF** — print-optimised stylesheet shows the sidebar only
- **Public share link** — read-only view with day tabs and map for non-signed-in visitors

### PWA
- Installable as a standalone app (Add to Home Screen)
- Offline persistence via Firestore IndexedDB cache + service worker (vite-plugin-pwa / Workbox)
- Maps tiles cached for 7 days; Firestore falls back to cache within 4 s

### Mobile
- Responsive layout: bottom tab bar (List / Overview / Map) replaces side-by-side split on narrow screens
- Action buttons collapse on small viewports; tap the Trips ← back button or header logo to navigate
- Map controls and POI bottom sheet are fully tappable on touch

## Stack

| Layer | Technology |
|---|---|
| Build | Vite 5 + React 18 + TypeScript (strict) |
| Styling | Tailwind CSS |
| Routing | React Router v6 (HashRouter — no server rewrites needed) |
| Auth | Firebase Auth (Google sign-in) |
| Database | Firestore (no backend) |
| Maps | Google Maps JavaScript API + Places API new SDK (`@vis.gl/react-google-maps`) |
| Drag-and-drop | @dnd-kit (core + sortable) |
| Weather | Open-Meteo API (free, no key) |
| Icons | lucide-react |
| Notifications | react-hot-toast |
| PWA | vite-plugin-pwa / Workbox |
| Hosting | GitHub Pages via GitHub Actions |

## Project structure

```
src/
├── components/
│   ├── ActivityCard.tsx        sortable list-view stop card
│   ├── ActivityEditModal.tsx   shared edit modal (works for day & list activities)
│   ├── AuthGuard.tsx           protected route wrapper
│   ├── FlightImportModal.tsx   manual + paste-from-email flight import
│   ├── IataAutocomplete.tsx    generic combobox used for airline + airport fields
│   ├── Linkify.tsx             render text with http(s) URLs as clickable links
│   ├── DayTabs.tsx             day buttons + ⚙ tab-display config (portal popup)
│   ├── Header.tsx
│   ├── Modal.tsx
│   ├── NearbyDrawer.tsx        sidebar nearby-place finder around a selected stop
│   ├── NewTripModal.tsx
│   ├── OverviewView.tsx        kanban + overview-map (drag across days/lists)
│   ├── PlacesAutocomplete.tsx  new-Places-API search input
│   ├── TimelineView.tsx        clock-style itinerary view
│   ├── TripCard.tsx            trip list tile
│   ├── TripMap.tsx             interactive map: pins, route ribbon, explore,
│   │                           walk radius, nearby, save-to-list, optimize
│   └── WeatherWidget.tsx
├── hooks/useAuth.tsx
├── lib/
│   ├── firebase.ts             Firestore + Auth init (with offline persistence)
│   ├── firestore/trips.ts      all trip / day / list / activity CRUD
│   ├── flightParse.ts          best-effort regex extractor for flight emails
│   ├── iata.ts                 IATA airline/airport lookup + search helpers
│   ├── types.ts                Trip, Day, Activity, FlightInfo, POI, ScratchList, …
│   └── utils.ts                date / money / iCal helpers
└── data/
    ├── iata-airlines.json      bundled airline lookup table
    └── iata-airports.json      bundled airport lookup table

scripts/seed-iata.mjs            one-shot uploader of the JSON tables to Firestore
└── pages/
    ├── Landing.tsx · Login.tsx · Profile.tsx
    ├── Shared.tsx              public read-only trip view
    ├── TripList.tsx
    └── TripDetail.tsx          the main editor (day tabs, sidebar, map, overview)

firestore.rules                  per-trip ownership + member access; public read via shareToken
firebase.json                    CLI config to deploy firestore.rules
```

## Local development

```bash
npm install
cp .env.example .env.local   # fill in your Firebase + Maps API keys
npm run dev
```

Open the URL Vite prints (default `http://localhost:5173/My-Travel-Helper/`).

| Script | What it does |
|---|---|
| `npm run dev` | Vite dev server with HMR |
| `npm run build` | TypeScript type-check + production build |
| `npm run preview` | Serve the built `dist/` locally |
| `npm run typecheck` | Type-check only (no build) |

## Environment variables

| Variable | Where to find it |
|---|---|
| `VITE_FIREBASE_API_KEY` | Firebase Console → Project settings → Your apps → SDK config |
| `VITE_FIREBASE_AUTH_DOMAIN` | same |
| `VITE_FIREBASE_PROJECT_ID` | same |
| `VITE_FIREBASE_STORAGE_BUCKET` | same |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | same |
| `VITE_FIREBASE_APP_ID` | same |
| `VITE_GOOGLE_MAPS_API_KEY` | Google Cloud Console → APIs & Services → Credentials. Enable: **Maps JavaScript API** + **Places API (New)**. Restrict by HTTP referrer (your Pages URL + `localhost:5173`). |

## Deploying to GitHub Pages

1. **Repo Settings → Pages → Source: GitHub Actions** (one-time).
2. **Repo Settings → Secrets and variables → Actions** → add all 7 variables above as repository secrets.
3. Push to `main`. The *Deploy to GitHub Pages* workflow builds with your secrets and publishes `dist/`.

Add your Pages URL (`https://<user>.github.io/My-Travel-Helper/`) to:
- Firebase Console → Authentication → Settings → **Authorized domains**
- Google Cloud Console → API key → **HTTP referrer restrictions**

## Deploying Firestore rules

A `firebase.json` is included so the Firebase CLI can deploy the rules in `firestore.rules`:

```bash
firebase use <your-project-id>      # one-time
firebase deploy --only firestore:rules
```

Or paste the rules into Firebase Console → Firestore → **Rules**.

The rules enforce:
- `users/{uid}` — readable by any signed-in user; writable only by the owner
- `trips/{tripId}` — read/write by `ownerId` or anyone in `memberIds`; **public read** when `shareToken` is set
- `trips/{tripId}/days/{dayId}` and `trips/{tripId}/lists/{listId}` — same access as their parent trip

## Data model

```
users/{uid}
  displayName, email, photoURL, prefs { currency }, updatedAt

trips/{tripId}
  ownerId, memberIds[], shareToken | null
  title, description, coverPhotoUrl
  destination: { placeId, name, lat, lng, address, … }
  startDate, endDate (YYYY-MM-DD), currency, budgetLimit { amount, currency }
  checklist: [{ id, text, done }]
  createdAt, updatedAt

trips/{tripId}/days/{YYYY-MM-DD}
  date, title?, notes
  activities: [{
    id, order, type ("poi" | "transport" | "note"),
    title, poi { placeId, name, lat, lng, address, category, rating, url, photoUrl },
    startTime ("HH:mm"), durationMinutes,
    cost { amount, currency },
    notes, photos [],
    route?: { mode: "straight" | "drive", polyline?, distanceM?, durationS? }
  }]

trips/{tripId}/lists/{listId}
  name, createdAt
  activities: [ ... same shape as day activities ... ]
```

## Map feature reference

| UI element | Where | What it does |
|---|---|---|
| 🍽 / 🏛 / 🏨 / 🚇 pills | Top-left of map | Toggle category explore layers (nearby places of that type) |
| **Route** pill | Top-left | Show/hide dashed connector lines + distance chips between consecutive stops |
| **All days** pill | Top-left | Overlay other days' activities as small coloured dots |
| **⚡ Optimize** pill | Top-left (≥ 3 POIs) | Reorder stops by greedy nearest-neighbour |
| **📍 Search here** pill | Top-left | Drop a draggable purple search pin with 500 m radius circle |
| Floating search bar | Top-centre | Places autocomplete that adds POIs to the current day/list |
| Long-press map | Anywhere | Same as Search here pill (drops a pin) |
| Click a Google POI | Anywhere | Open bottom sheet with photo, rating, walk radius, nearby chips, Add / Save buttons |

## Notable implementation details

- **Firestore offline persistence** is enabled with a 4-second timeout fallback — the app stays responsive even on cold starts behind a flaky network.
- **Cross-container drag-and-drop** (between days and lists, in both kanban and sidebar) uses Firestore `writeBatch` so partial-failure states cannot occur.
- **Day-tab settings popup** is rendered through `createPortal` to `document.body` so it doesn't get clipped by the horizontal-scroll tabs row.
- **POI category** is auto-detected from Google place types when adding from the map, so filter pills "just work" without manual tagging.
- **Optimize route** runs locally (greedy O(n²) nearest-neighbour); the resulting order is persisted via the standard `reorderActivities` path.
