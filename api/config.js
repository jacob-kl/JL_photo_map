// ─────────────────────────────────────────────────────────
// Vercel Serverless Function: /api/config
//
// Serves Firebase + Cloudinary credentials from Vercel
// Environment Variables so they never appear in the repo.
//
// Set these in: Vercel Dashboard → Your Project → Settings → Environment Variables
//   FIREBASE_API_KEY
//   FIREBASE_AUTH_DOMAIN
//   FIREBASE_PROJECT_ID
//   FIREBASE_STORAGE_BUCKET
//   FIREBASE_MESSAGING_SENDER_ID
//   FIREBASE_APP_ID
//   CLOUDINARY_CLOUD_NAME
//   CLOUDINARY_UPLOAD_PRESET
// ─────────────────────────────────────────────────────────
export default function handler(req, res) {
  // Only serve this on GET requests
  if (req.method !== 'GET') {
    return res.status(405).end();
  }

  const config = {
    apiKey:            process.env.FIREBASE_API_KEY            || '',
    authDomain:        process.env.FIREBASE_AUTH_DOMAIN        || '',
    projectId:         process.env.FIREBASE_PROJECT_ID         || '',
    storageBucket:     process.env.FIREBASE_STORAGE_BUCKET     || '',
    messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || '',
    appId:             process.env.FIREBASE_APP_ID             || '',
  };

  const cloudName    = process.env.CLOUDINARY_CLOUD_NAME    || '';
  const uploadPreset = process.env.CLOUDINARY_UPLOAD_PRESET || 'photo-map';

  // Return as executable JavaScript (same shape as config.js)
  res.setHeader('Content-Type', 'application/javascript');
  res.setHeader('Cache-Control', 'no-store'); // don't cache credentials
  res.send(
    'const FIREBASE_CONFIG = ' + JSON.stringify(config) + ';\n' +
    'const CLOUDINARY_CLOUD_NAME = ' + JSON.stringify(cloudName) + ';\n' +
    'const CLOUDINARY_UPLOAD_PRESET = ' + JSON.stringify(uploadPreset) + ';\n'
  );
}
