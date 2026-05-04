# My Travel Helper

A trip planner web app — map view, day-by-day itinerary, budget tracking, sharing, and more.
Frontend-only, hosted on GitHub Pages, with Firebase Auth + Firestore as the only backend.

## Live demo

**https://him1231.github.io/My-Travel-Helper/**

Sign in with Google to get started. No account required beyond a Google account.

## Features

### Trip management
- Create trips with title, destination (Google Places autocomplete), dates, currency, and optional budget limit
- Trip list with live Firestore sync — changes appear across tabs instantly
- Invite collaborators by email; share a public read-only link
- Delete trips (with all days and activities)

### Day-by-day itinerary
- Day tabs auto-advance by date; add or remove days freely
- Drag-and-drop reorder activities within a day (powered by @dnd-kit)
- Activity types: **POI** (from Places search), **transport**, and **note**
- Per-activity: start time, duration, cost, notes, category

### Map view (Google Maps)
- Side-by-side itinerary list + map on desktop; toggle tabs on mobile
- Numbered markers match list order; selecting a card bounces its pin and vice-versa
- Map auto-fits all pins for the selected day
- Nearby places drawer — discover POIs around a selected stop

### Planning sidebar (all sections collapsible)
- **Stops** — list view with category filter pills or timeline view; drag-and-drop reorder
- **Day notes** — freeform textarea, auto-saved with debounce; ✓ badge when notes exist
- **Budget** — per-activity cost breakdown, day total, trip total with progress bar vs budget limit
- **Checklist** — trip-level packing list with check/uncheck and add/remove items

### Header & weather
- Combined app + trip header: logo, back button, trip title/destination/dates, trip actions, signed-in user
- Trip actions: Share link, Invite member, Print/PDF, iCal export, Delete
- **Weather toggle** — cloud button in the header shows/hides a 5-day forecast strip (Open-Meteo, free)

### Export & sharing
- **iCal (.ics)** export for all timed activities (opens in calendar apps)
- **Print / PDF** — print-optimised stylesheet shows the sidebar only
- **Public share link** — read-only view with day tabs and map for non-signed-in visitors

### PWA
- Installable as a standalone app (Add to Home Screen)
- Offline persistence via Firestore IndexedDB cache + service worker (vite-plugin-pwa / Workbox)
- Maps tiles cached for 7 days; Firestore falls back to cache within 4 s

### Mobile
- Responsive layout: bottom tab bar (List / Map) replaces side-by-side split on narrow screens
- Action buttons collapse on small viewports; tap the Trips ← back button or header logo to navigate

## Stack

| Layer | Technology |
|---|---|
| Build | Vite 5 + React 18 + TypeScript |
| Styling | Tailwind CSS |
| Routing | React Router v6 (HashRouter — no server rewrites needed) |
| Auth | Firebase Auth (Google sign-in) |
| Database | Firestore (no backend) |
| Maps | Google Maps JavaScript API + Places API (`@vis.gl/react-google-maps`) |
| Drag-and-drop | @dnd-kit |
| Weather | Open-Meteo API (free, no key) |
| PWA | vite-plugin-pwa / Workbox |
| Hosting | GitHub Pages via GitHub Actions |

## Local development

```bash
npm install
cp .env.example .env.local   # fill in your Firebase + Maps API keys
npm run dev
```

Open the URL Vite prints (default `http://localhost:5173/My-Travel-Helper/`).

## Environment variables

| Variable | Where to find it |
|---|---|
| `VITE_FIREBASE_API_KEY` | Firebase Console → Project settings → Your apps → SDK config |
| `VITE_FIREBASE_AUTH_DOMAIN` | same |
| `VITE_FIREBASE_PROJECT_ID` | same |
| `VITE_FIREBASE_STORAGE_BUCKET` | same |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | same |
| `VITE_FIREBASE_APP_ID` | same |
| `VITE_GOOGLE_MAPS_API_KEY` | Google Cloud Console → APIs & Services → Credentials. Enable: **Maps JavaScript API**, **Places API**. Restrict by HTTP referrer (your Pages URL + `localhost:5173`). |

## Deploying to GitHub Pages

1. **Repo Settings → Pages → Source: GitHub Actions** (one-time — or done via API if not yet enabled).
2. **Repo Settings → Secrets and variables → Actions** → add all 7 variables above as repository secrets.
3. Push to `main`. The *Deploy to GitHub Pages* workflow builds with your secrets and publishes `dist/`.

Add your Pages URL (`https://<user>.github.io/My-Travel-Helper/`) to:
- Firebase Console → Authentication → Settings → **Authorized domains**
- Google Cloud Console → API key → **HTTP referrer restrictions**

## Deploying Firestore rules

Rules live in `firestore.rules`. Deploy with the Firebase CLI:

```bash
npx firebase-tools deploy --only firestore:rules --project <your-project-id>
```

Or paste the rules into Firebase Console → Firestore → **Rules**.

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
  date, notes
  activities: [{
    id, order, type ("poi" | "transport" | "note"),
    title, poi { placeId, name, lat, lng, address, category, rating, url, photoUrl },
    startTime ("HH:mm"), durationMinutes,
    cost { amount, currency },
    notes, photos []
  }]
```
