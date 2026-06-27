// ─────────────────────────────────────────────────────────
// FIREBASE INIT
// ─────────────────────────────────────────────────────────
firebase.initializeApp(FIREBASE_CONFIG);

const db   = firebase.firestore();
const auth = firebase.auth();

// ─────────────────────────────────────────────────────────
// STATE
// ─────────────────────────────────────────────────────────
let currentUser      = null;
let userFamilyId     = null;   // which family this user belongs to
let pendingUpload    = false;
let locationListener = null;   // Firestore unsubscribe fn
let locations        = [];

let selectedUids = new Set();
let allUploaders = new Map();

let pendingLat    = null;
let pendingLng    = null;
let selectedFiles = [];
let selectedURLs  = [];
let pinMode       = false;
let tempPinMarker = null;

let currentInviteCode    = null;
let inviteTimerInterval  = null;

// ─────────────────────────────────────────────────────────
// AUTH
// ─────────────────────────────────────────────────────────
auth.onAuthStateChanged(function(user) {
  currentUser = user;
  updateAuthUI(user);

  if (user) {
    checkFamilyMembership();
  } else {
    // Not signed in — hide the map, show nothing sensitive
    userFamilyId = null;
    if (locationListener) { locationListener(); locationListener = null; }
    document.getElementById('family-gate').classList.remove('show');
    document.getElementById('fab').style.display = 'none';
    document.getElementById('invite-btn').style.display = 'none';
  }
});

function signIn() {
  var provider = new firebase.auth.GoogleAuthProvider();
  auth.signInWithPopup(provider).catch(function(err) {
    if (err.code !== 'auth/popup-closed-by-user') toast('Sign-in failed. Please try again.');
    pendingUpload = false;
  });
}

function signOut() {
  auth.signOut();
}

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
      ? '<img src="' + user.photoURL + '" class="auth-avatar" alt="Sign out" title="Sign out"/>'
      : '<span class="auth-initials">' + ((user.displayName || '?')[0]).toUpperCase() + '</span>';
  } else {
    btn.textContent = 'Sign in';
  }
}

// ─────────────────────────────────────────────────────────
// FAMILY MEMBERSHIP
// ─────────────────────────────────────────────────────────
async function checkFamilyMembership() {
  try {
    var userDoc = await db.collection('users').doc(currentUser.uid).get();
    if (userDoc.exists && userDoc.data().familyId) {
      userFamilyId = userDoc.data().familyId;
      hideFamilyGate();
      startListening();
      if (pendingUpload) { pendingUpload = false; openUpload(); }
    } else {
      showFamilyGate();
    }
  } catch(err) {
    console.error('Family check failed:', err);
    showFamilyGate();
  }
}

function showFamilyGate() {
  var firstName = (currentUser.displayName || 'there').split(' ')[0];
  document.getElementById('gate-name').textContent = firstName;
  document.getElementById('code-error').textContent = '';
  document.getElementById('code-input').value = '';
  document.getElementById('family-gate').classList.add('show');
  document.getElementById('fab').style.display = 'none';
  document.getElementById('invite-btn').style.display = 'none';
  setTimeout(function() { document.getElementById('code-input').focus(); }, 300);
}

function hideFamilyGate() {
  document.getElementById('family-gate').classList.remove('show');
  document.getElementById('fab').style.display = 'flex';
  document.getElementById('invite-btn').style.display = 'flex';
}

// ── Create a brand-new family (first-time setup) ──
async function createFamily() {
  var btn = document.getElementById('btn-create');
  btn.disabled = true;
  btn.textContent = 'Creating…';

  try {
    var familyRef = db.collection('families').doc();
    await familyRef.set({
      adminUid:  currentUser.uid,
      members:   [currentUser.uid],
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });

    await db.collection('users').doc(currentUser.uid).set({
      familyId:    familyRef.id,
      displayName: currentUser.displayName || '',
      photoURL:    currentUser.photoURL    || null,
      joinedAt:    new Date().toISOString()
    }, { merge: true });

    userFamilyId = familyRef.id;
    hideFamilyGate();
    startListening();
    toast('Family map created! Share an invite code to add family members.');
  } catch(err) {
    console.error(err);
    document.getElementById('code-error').textContent = 'Something went wrong. Try again.';
    btn.disabled = false;
    btn.textContent = 'Set up a new family map';
  }
}

// ── Join an existing family via invite code ──
async function joinWithCode() {
  var code    = document.getElementById('code-input').value.trim().toUpperCase();
  var errorEl = document.getElementById('code-error');
  errorEl.textContent = '';

  if (code.length !== 6) {
    errorEl.textContent = 'Enter the full 6-character code.';
    return;
  }

  var btn = document.getElementById('btn-join');
  btn.disabled = true;
  btn.textContent = 'Joining…';

  try {
    var codeDoc = await db.collection('inviteCodes').doc(code).get();

    if (!codeDoc.exists) {
      throw new Error('not-found');
    }

    var data = codeDoc.data();
    if (new Date(data.expiresAt) < new Date()) {
      throw new Error('expired');
    }

    var familyId = data.familyId;

    // Add user to the family's members array
    await db.collection('families').doc(familyId).update({
      members: firebase.firestore.FieldValue.arrayUnion(currentUser.uid)
    });

    // Save familyId to this user's profile
    await db.collection('users').doc(currentUser.uid).set({
      familyId:    familyId,
      displayName: currentUser.displayName || '',
      photoURL:    currentUser.photoURL    || null,
      joinedAt:    new Date().toISOString()
    }, { merge: true });

    userFamilyId = familyId;
    hideFamilyGate();
    startListening();
    toast('Welcome to the family!');

  } catch(err) {
    if      (err.message === 'not-found') errorEl.textContent = 'Code not found. Double-check it and try again.';
    else if (err.message === 'expired')   errorEl.textContent = 'This code has expired. Ask for a fresh one.';
    else                                  errorEl.textContent = 'Something went wrong. Try again.';
    btn.disabled = false;
    btn.textContent = 'Join Family';
  }
}

// ─────────────────────────────────────────────────────────
// FAB
// ─────────────────────────────────────────────────────────
function handleFabClick() {
  if (!currentUser) {
    pendingUpload = true;
    toast('Signing in…');
    signIn();
    return;
  }
  if (!userFamilyId) {
    showFamilyGate();
    return;
  }
  openUpload();
}

// ─────────────────────────────────────────────────────────
// MAP  —  centered on North America, Voyager tiles
// ─────────────────────────────────────────────────────────
const map = L.map('map', {
  center: [40, -96],
  zoom: 3,
  zoomControl: false
});

L.control.zoom({ position: 'bottomleft' }).addTo(map);

L.tileLayer(
  'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
  { attribution: 'OpenStreetMap, CartoDB', maxZoom: 19, subdomains: 'abcd' }
).addTo(map);

const clusterGroup = L.markerClusterGroup({
  maxClusterRadius: 70,
  showCoverageOnHover: false,
  iconCreateFunction: function(c) {
    var kids = c.getAllChildMarkers();
    var photos = [];
    kids.forEach(function(k) {
      if (k.options.loc && k.options.loc.photos) photos = photos.concat(k.options.loc.photos);
    });
    var p1 = photos[0] ? photos[0].url : '';
    var p2 = photos[1] ? photos[1].url : p1;
    return L.divIcon({
      html: '<div class="pm-stack">' +
            '<div class="pm-back"><img src="' + p1 + '" onerror="this.style.visibility=\'hidden\'"/></div>' +
            '<div class="pm-front"><img src="' + p2 + '" onerror="this.style.visibility=\'hidden\'"/></div>' +
            '<div class="pm-count">' + photos.length + ' photos</div>' +
            '</div>',
      className: '', iconSize: [64, 54], iconAnchor: [32, 27]
    });
  }
});

function buildIcon(loc) {
  var url = loc.photos[0] ? loc.photos[0].url : '';
  var n   = loc.photos.length;
  return L.divIcon({
    html: '<div class="pm-wrap"><div class="pm-ring"><img src="' + url + '" onerror="this.style.visibility=\'hidden\'"/></div>' +
          (n > 1 ? '<div class="pm-count">' + n + '</div>' : '') + '</div>',
    className: '', iconSize: [52, 52], iconAnchor: [26, 26]
  });
}

// ─────────────────────────────────────────────────────────
// FILTER HELPERS
// ─────────────────────────────────────────────────────────
function getFilteredPhotos(loc) {
  if (!loc.photos) return [];
  if (selectedUids.size === 0) return loc.photos;
  return loc.photos.filter(function(p) { return selectedUids.has(p.uploadedBy); });
}

// ─────────────────────────────────────────────────────────
// RENDER MARKERS
// ─────────────────────────────────────────────────────────
function renderMarkers() {
  clusterGroup.clearLayers();
  locations.forEach(function(loc) {
    var visible = getFilteredPhotos(loc);
    if (!visible.length) return;
    var fl = Object.assign({}, loc, { photos: visible });
    var m  = L.marker([loc.lat, loc.lng], { icon: buildIcon(fl), loc: fl });
    m.on('click', function() { openViewer(fl); });
    clusterGroup.addLayer(m);
  });
  map.addLayer(clusterGroup);
}

// ─────────────────────────────────────────────────────────
// UPLOADER FILTER UI
// ─────────────────────────────────────────────────────────
function buildUploaderMap() {
  var uploaders = new Map();
  locations.forEach(function(loc) {
    (loc.photos || []).forEach(function(ph) {
      if (ph.uploadedBy && !uploaders.has(ph.uploadedBy)) {
        uploaders.set(ph.uploadedBy, {
          uid:         ph.uploadedBy,
          displayName: ph.uploaderName  || 'Someone',
          photoURL:    ph.uploaderPhoto || null
        });
      }
    });
  });
  return uploaders;
}

function renderFilter() {
  allUploaders = buildUploaderMap();
  var row = document.getElementById('filter-row');
  if (allUploaders.size < 2) { row.style.display = 'none'; return; }

  row.style.display = 'flex';
  row.innerHTML = '<span class="filter-row-label">Show</span>';

  allUploaders.forEach(function(uploader, uid) {
    var isActive = selectedUids.size === 0 || selectedUids.has(uid);
    var btn = document.createElement('button');
    btn.className = 'filter-btn' + (isActive ? '' : ' inactive');
    btn.title     = uploader.displayName;
    btn.setAttribute('data-name', uploader.displayName.split(' ')[0]);
    btn.onclick   = function() { toggleFilter(uid); };
    btn.innerHTML = uploader.photoURL
      ? '<img src="' + uploader.photoURL + '" alt="' + uploader.displayName + '"/>'
      : '<div class="filter-initial">' + (uploader.displayName[0] || '?').toUpperCase() + '</div>';
    row.appendChild(btn);
  });
}

function toggleFilter(uid) {
  if (selectedUids.size === 0) {
    selectedUids = new Set([uid]);
  } else if (selectedUids.has(uid)) {
    selectedUids.delete(uid);
  } else {
    selectedUids.add(uid);
    if (selectedUids.size === allUploaders.size) selectedUids = new Set();
  }
  renderFilter();
  renderMarkers();
}

// ─────────────────────────────────────────────────────────
// FIRESTORE — real-time listener (family-scoped)
// ─────────────────────────────────────────────────────────
function startListening() {
  if (locationListener) { locationListener(); locationListener = null; }
  if (!userFamilyId) return;

  locationListener = db.collection('locations')
    .where('familyId', '==', userFamilyId)
    .onSnapshot(function(snapshot) {
      locations = snapshot.docs.map(function(doc) {
        return Object.assign({ id: doc.id }, doc.data());
      });
      // Sort by createdAt client-side (avoids composite index requirement)
      locations.sort(function(a, b) {
        var ta = a.createdAt ? (a.createdAt.toDate ? a.createdAt.toDate() : new Date(a.createdAt)) : 0;
        var tb = b.createdAt ? (b.createdAt.toDate ? b.createdAt.toDate() : new Date(b.createdAt)) : 0;
        return ta - tb;
      });
      renderFilter();
      renderMarkers();
    }, function(err) {
      console.error('Firestore error:', err);
      toast('Trouble connecting. Check your config.js values.');
    });
}

// ─────────────────────────────────────────────────────────
// INVITE CODE PANEL
// ─────────────────────────────────────────────────────────
function openInvitePanel() {
  document.getElementById('invite-overlay').classList.add('open');
  generateAndShowCode();
}

function maybeCloseInvite(e) {
  if (e.target === document.getElementById('invite-overlay')) {
    document.getElementById('invite-overlay').classList.remove('open');
    if (inviteTimerInterval) { clearInterval(inviteTimerInterval); inviteTimerInterval = null; }
  }
}

async function generateAndShowCode() {
  var display = document.getElementById('invite-code-display');
  display.innerHTML = '<div class="code-generating">Generating…</div>';

  try {
    var code      = makeRandomCode();
    var expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    await db.collection('inviteCodes').doc(code).set({
      familyId:  userFamilyId,
      createdBy: currentUser.uid,
      expiresAt: expiresAt.toISOString()
    });

    currentInviteCode = code;
    renderCodeDisplay(code, expiresAt);
  } catch(err) {
    console.error(err);
    display.innerHTML = '<div class="code-generating">Failed to generate code. Try again.</div>';
  }
}

function makeRandomCode() {
  // Avoids visually ambiguous chars (0/O, 1/I)
  var chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  var code  = '';
  for (var i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

function renderCodeDisplay(code, expiresAt) {
  var display = document.getElementById('invite-code-display');
  display.innerHTML =
    '<div class="big-code">' + code + '</div>' +
    '<div class="code-expires" id="code-timer"></div>' +
    '<button class="btn-copy" onclick="copyCode()">Copy Code</button>';
  tickTimer(expiresAt);
  if (inviteTimerInterval) clearInterval(inviteTimerInterval);
  inviteTimerInterval = setInterval(function() { tickTimer(expiresAt); }, 30000);
}

function tickTimer(expiresAt) {
  var el  = document.getElementById('code-timer');
  if (!el) return;
  var ms  = expiresAt - new Date();
  if (ms <= 0) { el.textContent = 'Expired'; return; }
  var hrs = Math.floor(ms / 3600000);
  var min = Math.floor((ms % 3600000) / 60000);
  el.textContent = 'Expires in ' + hrs + 'h ' + min + 'm';
}

function copyCode() {
  if (!currentInviteCode) return;
  var fallback = function() {
    var inp = document.createElement('input');
    inp.value = currentInviteCode;
    document.body.appendChild(inp);
    inp.select();
    document.execCommand('copy');
    document.body.removeChild(inp);
    toast('Code copied!');
  };
  if (navigator.clipboard) {
    navigator.clipboard.writeText(currentInviteCode).then(function() { toast('Code copied!'); }).catch(fallback);
  } else {
    fallback();
  }
}

// ─────────────────────────────────────────────────────────
// VIEWER
// ─────────────────────────────────────────────────────────
function uploaderBadgeHTML(photo) {
  if (photo.uploaderPhoto) {
    return '<div class="uploader-badge"><img src="' + photo.uploaderPhoto + '" title="' + (photo.uploaderName || '') + '"/></div>';
  }
  return '<div class="uploader-badge"><div class="uploader-initial">' + ((photo.uploaderName || '?')[0]).toUpperCase() + '</div></div>';
}

function openViewer(loc) {
  if (pinMode) return;
  document.getElementById('vwr-location').textContent = loc.name;
  document.getElementById('vwr-title').textContent =
    loc.photos.length + ' photo' + (loc.photos.length !== 1 ? 's' : '');

  var grid = document.getElementById('vwr-grid');
  grid.innerHTML = '';
  loc.photos.forEach(function(ph) {
    var el = document.createElement('div');
    el.className = 'photo-grid-item';
    el.innerHTML =
      '<img src="' + ph.url + '" alt="' + (ph.caption || '') + '" loading="lazy"/>' +
      (ph.caption ? '<div class="caption-overlay">' + ph.caption + '</div>' : '') +
      uploaderBadgeHTML(ph);
    el.onclick = function() { openLightbox(ph.url, ph.caption, ph.uploaderName); };
    grid.appendChild(el);
  });
  document.getElementById('viewer-overlay').classList.add('open');
}

function maybeCloseViewer(e) {
  if (e.target === document.getElementById('viewer-overlay'))
    document.getElementById('viewer-overlay').classList.remove('open');
}

// ─────────────────────────────────────────────────────────
// UPLOAD — open / close / reset
// ─────────────────────────────────────────────────────────
function openUpload() {
  resetUpload();
  document.getElementById('upload-overlay').classList.add('open');
}

function maybeCloseUpload(e) {
  if (e.target !== document.getElementById('upload-overlay')) return;
  if (pinMode) { cancelPin(); return; }
  document.getElementById('upload-overlay').classList.remove('open');
  resetUpload();
}

function resetUpload() {
  selectedFiles = []; selectedURLs = [];
  pendingLat = null; pendingLng = null;

  document.getElementById('file-input').value    = '';
  document.getElementById('caption').value       = '';
  document.getElementById('caption').placeholder = 'Add a caption… (optional)';
  document.getElementById('opt-gps').classList.remove('active');
  document.getElementById('opt-pin').classList.remove('active');
  document.getElementById('opt-search').classList.remove('active');
  document.getElementById('search-panel').classList.remove('show');
  document.getElementById('search-input').value  = '';
  document.getElementById('search-results').classList.remove('show');
  document.getElementById('search-results').innerHTML = '';
  document.getElementById('add-btn').disabled    = true;
  document.getElementById('add-btn').textContent = 'Add to Map';

  var s = document.getElementById('loc-status');
  s.classList.remove('show', 'warn'); s.textContent = '';

  document.getElementById('dz-content').innerHTML =
    '<div class="dz-icon">📷</div>' +
    '<div class="dz-main">Choose photos</div>' +
    '<div class="dz-sub">Tap here • select one or many</div>';
  document.getElementById('drop-zone').classList.remove('has-file');

  if (tempPinMarker) { map.removeLayer(tempPinMarker); tempPinMarker = null; }
}

// ─────────────────────────────────────────────────────────
// UPLOAD — file selection (multi-photo)
// ─────────────────────────────────────────────────────────
function handleFile(e) {
  var files = Array.from(e.target ? e.target.files : e);
  if (!files.length) return;
  selectedFiles = files;
  selectedURLs  = new Array(files.length);
  var pending   = files.length;

  files.forEach(function(file, i) {
    var r = new FileReader();
    r.onload = function(ev) {
      selectedURLs[i] = ev.target.result;
      if (--pending === 0) updateDropZonePreview();
    };
    r.readAsDataURL(file);
  });
}

function updateDropZonePreview() {
  var n = selectedFiles.length;
  document.getElementById('drop-zone').classList.add('has-file');

  if (n === 1) {
    document.getElementById('dz-content').innerHTML =
      '<div class="dz-preview"><img src="' + selectedURLs[0] + '"/></div>' +
      '<div class="dz-main" style="color:#0f172a">' + selectedFiles[0].name + '</div>' +
      '<div class="dz-change">Tap to change</div>';
    document.getElementById('caption').placeholder = 'Add a caption… (optional)';
  } else {
    var thumbs = '';
    for (var i = 0; i < Math.min(n, 5); i++)
      thumbs += '<img src="' + selectedURLs[i] + '" class="dz-multi-thumb"/>';
    if (n > 5) thumbs += '<div class="dz-multi-more">+' + (n - 5) + '</div>';

    document.getElementById('dz-content').innerHTML =
      '<div class="dz-multi-grid">' + thumbs + '</div>' +
      '<div class="dz-main" style="color:#0f172a">' + n + ' photos selected</div>' +
      '<div class="dz-change">Tap to change</div>';
    document.getElementById('caption').placeholder = 'Add a caption… (applies to all)';
  }
  checkReady();
}

var dropZone = document.getElementById('drop-zone');
dropZone.addEventListener('dragover',  function(e) { e.preventDefault(); dropZone.style.borderColor = '#f59e0b'; });
dropZone.addEventListener('dragleave', function()  { dropZone.style.borderColor = ''; });
dropZone.addEventListener('drop', function(e) {
  e.preventDefault(); dropZone.style.borderColor = '';
  var files = Array.from(e.dataTransfer.files).filter(function(f) { return f.type.startsWith('image/'); });
  if (files.length) handleFile(files);
});

// ─────────────────────────────────────────────────────────
// LOCATION — GPS
// ─────────────────────────────────────────────────────────
function useGPS() {
  document.getElementById('opt-gps').classList.add('active');
  document.getElementById('opt-pin').classList.remove('active');
  document.getElementById('opt-search').classList.remove('active');
  document.getElementById('search-panel').classList.remove('show');
  showStatus('Getting your location…', false);

  if (!navigator.geolocation) { showStatus('GPS not available in this browser.', true); return; }

  navigator.geolocation.getCurrentPosition(
    function(pos) {
      pendingLat = pos.coords.latitude; pendingLng = pos.coords.longitude;
      showStatus('Location found: ' + pendingLat.toFixed(4) + ', ' + pendingLng.toFixed(4), false);
      checkReady();
    },
    function() {
      showStatus('GPS permission denied. Try dropping a pin instead.', true);
      document.getElementById('opt-gps').classList.remove('active');
    }
  );
}

// ─────────────────────────────────────────────────────────
// LOCATION — pin drop
// ─────────────────────────────────────────────────────────
function startPin() {
  document.getElementById('opt-pin').classList.add('active');
  document.getElementById('opt-gps').classList.remove('active');
  document.getElementById('opt-search').classList.remove('active');
  document.getElementById('search-panel').classList.remove('show');
  document.getElementById('upload-overlay').classList.remove('open');
  enterPinMode();
}

function enterPinMode() {
  pinMode = true;
  document.getElementById('pin-banner').classList.add('show');
  document.body.classList.add('pin-mode');
  map.once('click', onPinClick);
}

function onPinClick(e) {
  pendingLat = e.latlng.lat; pendingLng = e.latlng.lng;
  if (tempPinMarker) map.removeLayer(tempPinMarker);
  tempPinMarker = L.marker([pendingLat, pendingLng], {
    icon: L.divIcon({
      html: '<div style="width:18px;height:18px;background:#f59e0b;border:3px solid #fff;border-radius:50%;box-shadow:0 2px 8px rgba(0,0,0,.4)"></div>',
      className: '', iconSize: [18, 18], iconAnchor: [9, 9]
    })
  }).addTo(map);
  exitPinMode();
  setTimeout(function() {
    document.getElementById('upload-overlay').classList.add('open');
    showStatus('Pin placed: ' + pendingLat.toFixed(4) + ', ' + pendingLng.toFixed(4), false);
    checkReady();
  }, 120);
}

function cancelPin() { map.off('click', onPinClick); exitPinMode(); }

function exitPinMode() {
  pinMode = false;
  document.getElementById('pin-banner').classList.remove('show');
  document.body.classList.remove('pin-mode');
}

// ─────────────────────────────────────────────────────────
// LOCATION — search
// ─────────────────────────────────────────────────────────
function selectSearch() {
  document.getElementById('opt-search').classList.add('active');
  document.getElementById('opt-gps').classList.remove('active');
  document.getElementById('opt-pin').classList.remove('active');
  document.getElementById('search-panel').classList.add('show');
  pendingLat = null; pendingLng = null;
  if (tempPinMarker) { map.removeLayer(tempPinMarker); tempPinMarker = null; }
  checkReady();
  setTimeout(function() { document.getElementById('search-input').focus(); }, 50);
}

function clearSearch() {
  document.getElementById('search-input').value = '';
  document.getElementById('search-results').innerHTML = '';
  document.getElementById('search-results').classList.remove('show');
  pendingLat = null; pendingLng = null;
  if (tempPinMarker) { map.removeLayer(tempPinMarker); tempPinMarker = null; }
  document.getElementById('loc-status').classList.remove('show', 'warn');
  checkReady();
}

var searchDebounce;
function onSearchInput() {
  var q       = document.getElementById('search-input').value.trim();
  var results = document.getElementById('search-results');
  clearTimeout(searchDebounce);
  if (!q) { results.classList.remove('show'); pendingLat = null; pendingLng = null; checkReady(); return; }
  results.innerHTML = '<div class="search-message">Searching…</div>';
  results.classList.add('show');
  searchDebounce = setTimeout(function() { doSearch(q); }, 420);
}

async function doSearch(q) {
  var results = document.getElementById('search-results');
  try {
    var res  = await fetch('https://nominatim.openstreetmap.org/search?q=' + encodeURIComponent(q) +
                          '&format=json&limit=6&addressdetails=1', { headers: { 'Accept-Language': 'en' } });
    var data = await res.json();
    if (!data.length) { results.innerHTML = '<div class="search-message">No results found.</div>'; return; }
    results.innerHTML = '';
    data.forEach(function(place) {
      var parts = place.display_name.split(', ');
      var item  = document.createElement('div');
      item.className = 'search-result-item';
      item.innerHTML = '<div class="result-main">' + parts.slice(0, 2).join(', ') + '</div>' +
                       (parts.length > 2 ? '<div class="result-sub">' + parts.slice(2, 5).join(', ') + '</div>' : '');
      item.onclick = function() { pickPlace(parseFloat(place.lat), parseFloat(place.lon), place.display_name); };
      results.appendChild(item);
    });
  } catch(_) {
    results.innerHTML = '<div class="search-message">Search failed. Check your connection.</div>';
  }
}

function pickPlace(lat, lng, fullName) {
  pendingLat = lat; pendingLng = lng;
  document.getElementById('search-input').value = fullName.split(', ').slice(0, 3).join(', ');
  document.getElementById('search-results').classList.remove('show');
  if (tempPinMarker) map.removeLayer(tempPinMarker);
  tempPinMarker = L.marker([lat, lng], {
    icon: L.divIcon({
      html: '<div style="width:18px;height:18px;background:#f59e0b;border:3px solid #fff;border-radius:50%;box-shadow:0 2px 8px rgba(0,0,0,.4)"></div>',
      className: '', iconSize: [18, 18], iconAnchor: [9, 9]
    })
  }).addTo(map);
  map.panTo([lat, lng], { animate: true, duration: 0.8 });
  showStatus('Location set: ' + fullName.split(', ').slice(0, 2).join(', '), false);
  checkReady();
}

function showStatus(msg, warn) {
  var el = document.getElementById('loc-status');
  el.textContent = msg; el.classList.add('show');
  el.classList.toggle('warn', warn);
}

function checkReady() {
  var n      = selectedFiles.length;
  var ready  = n > 0 && pendingLat !== null;
  var addBtn = document.getElementById('add-btn');
  addBtn.disabled    = !ready;
  addBtn.textContent = (ready && n > 1) ? 'Add ' + n + ' Photos to Map' : 'Add to Map';
}

// ─────────────────────────────────────────────────────────
// CLOUDINARY UPLOAD
// ─────────────────────────────────────────────────────────
async function uploadToCloudinary(file) {
  var form = new FormData();
  form.append('file', file);
  form.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);
  form.append('folder', 'kline-of-sight');
  var res = await fetch('https://api.cloudinary.com/v1_1/' + CLOUDINARY_CLOUD_NAME + '/image/upload',
                        { method: 'POST', body: form });
  if (!res.ok) throw new Error('Cloudinary error: ' + res.status);
  return (await res.json()).secure_url;
}

// ─────────────────────────────────────────────────────────
// SAVE PHOTOS
// ─────────────────────────────────────────────────────────
async function savePhoto() {
  if (!selectedFiles.length || pendingLat === null || !currentUser || !userFamilyId) return;

  var n      = selectedFiles.length;
  var addBtn = document.getElementById('add-btn');
  addBtn.disabled = true;
  addBtn.textContent = n > 1 ? 'Uploading 0 of ' + n + '…' : 'Uploading…';

  try {
    var uploaded = 0;
    var photoUrls = await Promise.all(selectedFiles.map(async function(file) {
      var url = await uploadToCloudinary(file);
      uploaded++;
      if (n > 1) addBtn.textContent = 'Uploading ' + uploaded + ' of ' + n + '…';
      return url;
    }));

    var caption = document.getElementById('caption').value.trim();

    // Reverse-geocode
    var locName = pendingLat.toFixed(3) + ', ' + pendingLng.toFixed(3);
    try {
      var geo = await fetch('https://nominatim.openstreetmap.org/reverse?lat=' + pendingLat +
                            '&lon=' + pendingLng + '&format=json', { headers: { 'Accept-Language': 'en' } });
      if (geo.ok) {
        var d = await geo.json(), a = d.address;
        locName = a.city || a.town || a.village || a.county || a.state || locName;
        if (a.country && locName !== a.country) locName += ', ' + a.country;
      }
    } catch(_) {}

    var photoEntries = photoUrls.map(function(url) {
      return {
        url:          url,
        caption:      caption,
        uploadedBy:   currentUser.uid,
        uploaderName: currentUser.displayName || 'Someone',
        uploaderPhoto: currentUser.photoURL   || null,
        createdAt:    new Date().toISOString()
      };
    });

    var MERGE_RADIUS_M = 3000;
    var nearby = locations.find(function(l) {
      return map.distance([l.lat, l.lng], [pendingLat, pendingLng]) < MERGE_RADIUS_M;
    });

    if (nearby) {
      await db.collection('locations').doc(nearby.id).update({
        photos: firebase.firestore.FieldValue.arrayUnion.apply(
          firebase.firestore.FieldValue, photoEntries)
      });
    } else {
      await db.collection('locations').add({
        familyId:  userFamilyId,
        name:      locName,
        lat:       pendingLat,
        lng:       pendingLng,
        photos:    photoEntries,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });
    }

    document.getElementById('upload-overlay').classList.remove('open');
    if (tempPinMarker) { map.removeLayer(tempPinMarker); tempPinMarker = null; }
    resetUpload();
    map.flyTo([pendingLat, pendingLng], Math.max(map.getZoom(), 9), { duration: 1.4 });
    toast(n > 1 ? n + ' photos added!' : 'Photo added!');

  } catch(err) {
    console.error('Save failed:', err);
    toast('Upload failed. Check your connection and try again.');
    addBtn.disabled = false;
    addBtn.textContent = n > 1 ? 'Add ' + n + ' Photos to Map' : 'Add to Map';
  }
}

// ─────────────────────────────────────────────────────────
// LIGHTBOX
// ─────────────────────────────────────────────────────────
function openLightbox(url, caption, uploaderName) {
  document.getElementById('lightbox-img').src = url;
  var cap   = document.getElementById('lightbox-caption');
  var parts = [];
  if (uploaderName) parts.push(uploaderName);
  if (caption)      parts.push(caption);
  cap.textContent   = parts.join(' · ');
  cap.style.display = parts.length ? 'block' : 'none';
  document.getElementById('lightbox').classList.add('open');
}

function closeLightbox() {
  document.getElementById('lightbox').classList.remove('open');
}

// ─────────────────────────────────────────────────────────
// TOAST
// ─────────────────────────────────────────────────────────
var toastTimer;
function toast(msg) {
  var el = document.getElementById('toast');
  el.textContent = msg; el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function() { el.classList.remove('show'); }, 3500);
}

// ─────────────────────────────────────────────────────────
// KEYBOARD
// ─────────────────────────────────────────────────────────
document.addEventListener('keydown', function(e) {
  if (e.key !== 'Escape') return;
  closeLightbox();
  document.getElementById('viewer-overlay').classList.remove('open');
  document.getElementById('invite-overlay').classList.remove('open');
  if (pinMode) cancelPin();
  else document.getElementById('upload-overlay').classList.remove('open');
});
