# My Travel Helper

A trip planner web app — map view, day-by-day itinerary, budget tracking, sharing.
Frontend-only, hosted on GitHub Pages, with Firebase Auth + Firestore as the backend.

## Stack

- React 18 + TypeScript + Vite
- Tailwind CSS for styling
- React Router (HashRouter — works with GitHub Pages without server rewrites)
- Firebase Auth (Google sign-in) + Firestore
- Google Maps JavaScript API + Places (via `@vis.gl/react-google-maps`)
- `@dnd-kit` for drag-and-drop activity reordering

## Local development

```bash
npm install
cp .env.example .env.local   # then fill in your Firebase + Maps keys
npm run dev
```

Open the URL Vite prints (default `http://localhost:5173/My-Travel-Helper/`).

## Environment variables

| Variable | Where to find it |
|---|---|
| `VITE_FIREBASE_*` | Firebase Console → Project settings → Your apps → SDK setup and configuration |
| `VITE_GOOGLE_MAPS_API_KEY` | Google Cloud Console → APIs & Services → Credentials. Enable: Maps JavaScript API, Places API. Restrict by HTTP referrer (your GitHub Pages URL + `localhost:5173`). |

## Deploying to GitHub Pages

1. **Repo Settings → Pages → Source: GitHub Actions** (one-time).
2. **Repo Settings → Secrets and variables → Actions** → add the 7 secrets matching `.env.example`.
3. Push to `main`. The `Deploy to GitHub Pages` workflow builds and publishes.

The site will be served at `https://<your-user>.github.io/My-Travel-Helper/`.

Add that URL to:
- Firebase Console → Authentication → Settings → Authorized domains
- Google Cloud Console → API key referrer restrictions

## Deploying Firestore rules

Rules live in `firestore.rules`. Deploy with the Firebase CLI:

```bash
npx firebase-tools deploy --only firestore:rules --project <your-project-id>
```

(Or paste them in the Firebase Console → Firestore → Rules.)

## Data model

See `src/lib/types.ts`. Trip-centric:

- `users/{uid}` — profile + prefs
- `trips/{tripId}` — metadata, members, checklist, totals
- `trips/{tripId}/days/{YYYY-MM-DD}` — embedded list of activities (each with optional POI)

## Status

**Phase A/B (foundation + auth)** — done.
- Vite scaffold, Tailwind, routing, GitHub Pages deploy
- Firebase Auth (Google sign-in), protected routes, profile page

**Next (Phase C/D)** — trip CRUD + map view.
