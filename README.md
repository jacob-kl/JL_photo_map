<div align="center">

<h1>📍 Our Photo Map</h1>

<p>A shared travel photo map for you and your people.<br/>
Upload photos from anywhere — they pin to the map exactly where you took them.</p>

<p>
  <img src="https://img.shields.io/badge/Leaflet-199900?style=flat-square&logo=leaflet&logoColor=white" alt="Leaflet"/>
  <img src="https://img.shields.io/badge/Firebase-FFCA28?style=flat-square&logo=firebase&logoColor=black" alt="Firebase"/>
  <img src="https://img.shields.io/badge/Vercel-000000?style=flat-square&logo=vercel&logoColor=white" alt="Vercel"/>
  <img src="https://img.shields.io/badge/PWA-5A0FC8?style=flat-square&logo=pwa&logoColor=white" alt="PWA"/>
</p>

<br/>

**[📍 View our travels →](preview.geojson)**

<sub>Opens an interactive map — no app install needed.</sub>

</div>

---

## What it does

Open the map, tap **+**, pick a photo, and choose whether to use your GPS location or drop a pin manually. The photo appears on the map as a circular thumbnail right where you were. Nearby photos stack into a cluster — tap any cluster to browse the full album from that trip.

Anyone with the link can view the map. Uploading requires signing in with Google, so only your group can add photos.

---

## Features

- **Photo clusters** — photos near each other stack into a single pin; tap to open the album
- **Two ways to place a photo** — GPS auto-detect or manual pin drop on the map
- **Auto location names** — reverse geocoding fills in "Kyoto, Japan" so you don't have to
- **Lightbox viewer** — tap any photo to see it full-screen with its caption
- **Works on any device** — installable as a home screen app on iPhone and Android (PWA)
- **Shared access** — everyone with the link sees the same live map
- **Google sign-in** — viewers don't need an account; uploaders sign in with one tap

---

## Tech stack

| Layer | Tool |
|---|---|
| Map | [Leaflet.js](https://leafletjs.com) + [CartoDB Positron tiles](https://carto.com/basemaps/) |
| Clustering | [Leaflet.markercluster](https://github.com/Leaflet/Leaflet.markercluster) |
| Reverse geocoding | [Nominatim](https://nominatim.org) (OpenStreetMap, free, no key needed) |
| Photo storage | [Firebase Storage](https://firebase.google.com/products/storage) |
| Database | [Firebase Firestore](https://firebase.google.com/products/firestore) |
| Auth | [Firebase Authentication](https://firebase.google.com/products/auth) (Google sign-in) |
| Hosting | [Vercel](https://vercel.com) (auto-deploys from this repo) |

---

## Getting started

### Prerequisites

- A [Firebase](https://firebase.google.com) account (free)
- A [Vercel](https://vercel.com) account (free)
- [Git](https://git-scm.com) installed locally

### 1 — Clone the repo

```bash
git clone https://github.com/YOUR_USERNAME/photo-map.git
cd photo-map
```

### 2 — Set up Firebase

1. Go to [console.firebase.google.com](https://console.firebase.google.com) and create a new project
2. In the left sidebar, enable these three services:
   - **Authentication** → Sign-in method → Google → Enable
   - **Firestore Database** → Create database → Start in production mode
   - **Storage** → Get started
3. Go to **Project settings** (gear icon) → **Your apps** → click **</>** to add a web app
4. Copy the `firebaseConfig` object it shows you

### 3 — Add your Firebase config

Create a file called `firebase-config.js` in the project root:

```js
// firebase-config.js
const firebaseConfig = {
  apiKey:            "YOUR_API_KEY",
  authDomain:        "YOUR_PROJECT.firebaseapp.com",
  projectId:         "YOUR_PROJECT_ID",
  storageBucket:     "YOUR_PROJECT.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId:             "YOUR_APP_ID"
};
```

> **Note:** This file is in `.gitignore` — your keys stay off GitHub. Vercel gets them separately via environment variables (see step 5).

### 4 — Set Firestore rules

In the Firebase console → Firestore → Rules, paste:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /photos/{photoId} {
      allow read: if true;                          // anyone with the link can view
      allow write: if request.auth != null;         // must be signed in to upload
    }
  }
}
```

Do the same for Storage → Rules:

```
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /photos/{allPaths=**} {
      allow read: if true;
      allow write: if request.auth != null;
    }
  }
}
```

### 5 — Deploy to Vercel

1. Push this repo to GitHub
2. Go to [vercel.com](https://vercel.com) → **New Project** → import your repo
3. Under **Environment Variables**, add each key from your `firebaseConfig` (e.g. `FIREBASE_API_KEY`, `FIREBASE_PROJECT_ID`, etc.)
4. Click **Deploy**

Vercel gives you a live URL (e.g. `your-photo-map.vercel.app`) that updates automatically every time you push to `main`.

---

## Using the app

| Action | How |
|---|---|
| View the map | Open the URL — no account needed |
| Add a photo | Tap **+** → choose photo → pick GPS or drop a pin → tap **Add to Map** |
| Browse a location | Tap any photo cluster on the map |
| View full-screen | Tap a photo in the album |
| Install on phone | iOS: Share → Add to Home Screen · Android: browser menu → Install app |

---

## Keeping the map preview updated

The [`preview.geojson`](preview.geojson) file is what GitHub renders as the interactive map in this README. When you visit a new place for real, add it there too — it takes about 30 seconds:

```json
{
  "type": "Feature",
  "geometry": {
    "type": "Point",
    "coordinates": [LONGITUDE, LATITUDE]
  },
  "properties": {
    "name": "City, Country",
    "description": "2 photos · What you saw",
    "marker-symbol": "camera",
    "marker-color": "#f59e0b",
    "marker-size": "medium"
  }
}
```

Note that GeoJSON uses **`[longitude, latitude]`** order — the opposite of how most maps state it.

---

## Local development

Open `index.html` directly in your browser — no build step needed. Photo uploads in local mode save to browser memory only (they clear on refresh). Connect Firebase to persist them.

```bash
# Optional: use a local dev server for cleaner URLs
npx serve .
```

---

## Contributing

This is a personal project, but if you fork it and make something cool — nice work. PRs with bug fixes are welcome.

---

## License

MIT — do whatever you want with it.
