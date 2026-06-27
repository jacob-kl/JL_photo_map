// ─────────────────────────────────────────────────────────
// Firebase — initialization
//
// Reads:  FIREBASE_CONFIG (from config.js, loaded before this)
// Writes: db, auth  (used by every other module)
// ─────────────────────────────────────────────────────────
firebase.initializeApp(FIREBASE_CONFIG);

const db   = firebase.firestore();
const auth = firebase.auth();
