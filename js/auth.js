// ─────────────────────────────────────────────────────────
// Auth
//
// Reads:  db, auth  (firebase.js)
// Writes: currentUser, pendingUpload
// Calls:  startConnectionsListener (connections.js)
//         openUpload (upload.js)
//         openSharingPanel (sharing.js)
// ─────────────────────────────────────────────────────────
let currentUser   = null;
let pendingUpload = false;

// ── Auth state ───────────────────────────────────────────
auth.onAuthStateChanged(function(user) {
  currentUser = user;
  updateAuthUI(user);

  if (user) {
    // Save / refresh public profile so others can look up names
    db.collection('users').doc(user.uid).set({
      displayName: user.displayName || '',
      photoURL:    user.photoURL    || null
    }, { merge: true });

    document.getElementById('fab').style.display        = 'flex';
    document.getElementById('invite-btn').style.display = 'flex';

    startConnectionsListener();

    if (pendingUpload) { pendingUpload = false; openUpload(); }

  } else {
    document.getElementById('fab').style.display        = 'none';
    document.getElementById('invite-btn').style.display = 'none';
    locations     = [];
    connectedUIDs = [];
    if (typeof locationListener === 'function') { locationListener(); locationListener = null; }
    renderMarkers();
  }
});

function signIn() {
  var provider = new firebase.auth.GoogleAuthProvider();
  auth.signInWithPopup(provider).catch(function(err) {
    if (err.code !== 'auth/popup-closed-by-user') toast('Sign-in failed. Please try again.');
    pendingUpload = false;
  });
}

function signOut() { auth.signOut(); }

function handleAuthClick() {
  if (currentUser) {
    if (confirm('Sign out of ' + (currentUser.displayName || 'your account') + '?')) signOut();
  } else {
    signIn();
  }
}

function updateAuthUI(user) {
  var btn = document.getElementById('auth-btn');
  if (user) {
    btn.innerHTML = user.photoURL
      ? '<img src="' + user.photoURL + '" class="auth-avatar" title="Sign out"/>'
      : '<span class="auth-initials">' + ((user.displayName || '?')[0]).toUpperCase() + '</span>';
  } else {
    btn.textContent = 'Sign in';
  }
}

// ── FAB ─────────────────────────────────────────────────
function handleFabClick() {
  if (!currentUser) { pendingUpload = true; signIn(); return; }
  openUpload();
}

// ── Toast ────────────────────────────────────────────────
var toastTimer;

function toast(msg) {
  var el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function() { el.classList.remove('show'); }, 3500);
}

// ── Keyboard shortcuts ───────────────────────────────────
document.addEventListener('keydown', function(e) {
  var lbOpen = document.getElementById('lightbox').classList.contains('open');

  if (lbOpen) {
    if (lbZoom) {
      // When zoomed, Escape exits zoom; arrows scroll the image natively
      if (e.key === 'Escape') toggleZoom({ stopPropagation: function() {} });
      return;
    }
    if (e.key === 'ArrowLeft')  { lightboxNav(-1, e); return; }
    if (e.key === 'ArrowRight') { lightboxNav(1,  e); return; }
    if (e.key === 'Escape')     { closeLightbox(); return; }
    return;
  }

  if (e.key !== 'Escape') return;
  document.getElementById('viewer-overlay').classList.remove('open');
  document.getElementById('sharing-overlay').classList.remove('open');
  if (typeof pinMode !== 'undefined' && pinMode) cancelPin();
  else document.getElementById('upload-overlay').classList.remove('open');
});
