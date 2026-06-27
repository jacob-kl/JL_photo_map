// ─────────────────────────────────────────────────────────
// FIREBASE INIT
// ─────────────────────────────────────────────────────────
firebase.initializeApp(FIREBASE_CONFIG);

const db   = firebase.firestore();
const auth = firebase.auth();

// ─────────────────────────────────────────────────────────
// STATE
// ─────────────────────────────────────────────────────────
let currentUser   = null;
let pendingUpload = false;
let locations     = [];

// Filter: which uploaders are selected (empty Set = show all)
let selectedUids  = new Set();
let allUploaders  = new Map(); // uid -> { uid, displayName, photoURL }

let pendingLat    = null;
let pendingLng    = null;
let selectedFile  = null;
let selectedURL   = null;
let pinMode       = false;
let tempPinMarker = null;

// ─────────────────────────────────────────────────────────
// AUTH
// ─────────────────────────────────────────────────────────
auth.onAuthStateChanged(function(user) {
  currentUser = user;
  updateAuthUI(user);
  if (user && pendingUpload) {
    pendingUpload = false;
    openUpload();
  }
});

function signIn() {
  var provider = new firebase.auth.GoogleAuthProvider();
  auth.signInWithPopup(provider).catch(function(err) {
    if (err.code !== 'auth/popup-closed-by-user') {
      toast('Sign-in failed. Please try again.');
    }
    pendingUpload = false;
  });
}

function signOut() {
  auth.signOut().then(function() { toast('Signed out.'); });
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
      ? '<img src="' + user.photoURL + '" class="auth-avatar" alt="Sign out" title="Sign out ' + (user.displayName || '') + '"/>'
      : '<span class="auth-initials" title="Sign out">' + ((user.displayName || '?')[0]).toUpperCase() + '</span>';
  } else {
    btn.textContent = 'Sign in';
  }
}

// ─────────────────────────────────────────────────────────
// FAB
// ─────────────────────────────────────────────────────────
function handleFabClick() {
  if (!currentUser) {
    pendingUpload = true;
    toast('Signing in...');
    signIn();
    return;
  }
  openUpload();
}

// ─────────────────────────────────────────────────────────
// MAP
// ─────────────────────────────────────────────────────────
const map = L.map('map', {
  center: [25, 10],
  zoom: 2,
  zoomControl: false
});

L.control.zoom({ position: 'bottomleft' }).addTo(map);

L.tileLayer(
  'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
  { attribution: 'OpenStreetMap, CartoDB', maxZoom: 19 }
).addTo(map);

const clusterGroup = L.markerClusterGroup({
  maxClusterRadius: 70,
  showCoverageOnHover: false,
  iconCreateFunction: function(c) {
    var kids   = c.getAllChildMarkers();
    var photos = [];
    kids.forEach(function(k) {
      if (k.options.loc && k.options.loc.photos) {
        photos = photos.concat(k.options.loc.photos);
      }
    });
    var count = photos.length;
    var p1 = photos[0] ? photos[0].url : '';
    var p2 = photos[1] ? photos[1].url : p1;
    return L.divIcon({
      html: '<div class="pm-stack">' +
            '<div class="pm-back"><img src="' + p1 + '" onerror="this.style.visibility=\'hidden\'"/></div>' +
            '<div class="pm-front"><img src="' + p2 + '" onerror="this.style.visibility=\'hidden\'"/></div>' +
            '<div class="pm-count">' + count + ' photos</div>' +
            '</div>',
      className: '',
      iconSize: [64, 54],
      iconAnchor: [32, 27]
    });
  }
});

function buildIcon(loc) {
  var url   = loc.photos[0] ? loc.photos[0].url : '';
  var count = loc.photos.length;
  if (count === 1) {
    return L.divIcon({
      html: '<div class="pm-wrap"><div class="pm-ring"><img src="' + url + '" onerror="this.style.visibility=\'hidden\'"/></div></div>',
      className: '', iconSize: [52, 52], iconAnchor: [26, 26]
    });
  }
  return L.divIcon({
    html: '<div class="pm-wrap"><div class="pm-ring"><img src="' + url + '" onerror="this.style.visibility=\'hidden\'"/></div><div class="pm-count">' + count + '</div></div>',
    className: '', iconSize: [52, 52], iconAnchor: [26, 26]
  });
}

// ─────────────────────────────────────────────────────────
// FILTER HELPERS
// ─────────────────────────────────────────────────────────

// Returns true if this photo should be shown given the current filter
function photoPassesFilter(photo) {
  if (selectedUids.size === 0) return true;
  return selectedUids.has(photo.uploadedBy);
}

// Returns the filtered photos for a location
function getFilteredPhotos(loc) {
  if (!loc.photos) return [];
  if (selectedUids.size === 0) return loc.photos;
  return loc.photos.filter(function(p) { return selectedUids.has(p.uploadedBy); });
}

// ─────────────────────────────────────────────────────────
// RENDER MARKERS (respects active filter)
// ─────────────────────────────────────────────────────────
function renderMarkers() {
  clusterGroup.clearLayers();
  locations.forEach(function(loc) {
    var visiblePhotos = getFilteredPhotos(loc);
    if (!visiblePhotos.length) return;

    // Build a filtered copy of the location for the icon + viewer
    var filteredLoc = Object.assign({}, loc, { photos: visiblePhotos });
    var m = L.marker([loc.lat, loc.lng], { icon: buildIcon(filteredLoc), loc: filteredLoc });
    m.on('click', function() { openViewer(filteredLoc); });
    clusterGroup.addLayer(m);
  });
  map.addLayer(clusterGroup);
}

// ─────────────────────────────────────────────────────────
// UPLOADER FILTER UI
// ─────────────────────────────────────────────────────────

// Collect every unique uploader across all locations
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

  // Hide the row if there's only one uploader — nothing to filter
  if (allUploaders.size < 2) {
    row.style.display = 'none';
    return;
  }

  row.style.display = 'flex';
  row.innerHTML = '<span class="filter-row-label">Show</span>';

  allUploaders.forEach(function(uploader, uid) {
    var isActive = selectedUids.size === 0 || selectedUids.has(uid);
    var btn = document.createElement('button');
    btn.className   = 'filter-btn' + (isActive ? '' : ' inactive');
    btn.title       = uploader.displayName;
    btn.setAttribute('data-name', uploader.displayName.split(' ')[0]); // first name in tooltip
    btn.onclick     = function() { toggleFilter(uid); };

    if (uploader.photoURL) {
      btn.innerHTML = '<img src="' + uploader.photoURL + '" alt="' + uploader.displayName + '"/>';
    } else {
      var initial = (uploader.displayName[0] || '?').toUpperCase();
      btn.innerHTML = '<div class="filter-initial">' + initial + '</div>';
    }

    row.appendChild(btn);
  });
}

function toggleFilter(uid) {
  if (selectedUids.size === 0) {
    // Currently showing everyone → isolate this one person
    selectedUids = new Set([uid]);
  } else if (selectedUids.has(uid)) {
    // Deselect this person
    selectedUids.delete(uid);
    // If nobody is selected anymore, reset to show all
    if (selectedUids.size === 0) {
      selectedUids = new Set();
    }
  } else {
    // Add this person to the selection
    selectedUids.add(uid);
    // If everyone is now selected, clean up by resetting to "show all"
    if (selectedUids.size === allUploaders.size) {
      selectedUids = new Set();
    }
  }
  renderFilter();
  renderMarkers();
}

// ─────────────────────────────────────────────────────────
// FIRESTORE — real-time listener
// ─────────────────────────────────────────────────────────
db.collection('locations')
  .orderBy('createdAt', 'asc')
  .onSnapshot(function(snapshot) {
    locations = snapshot.docs.map(function(doc) {
      return Object.assign({ id: doc.id }, doc.data());
    });
    renderFilter();   // rebuild the uploader filter pills
    renderMarkers();  // redraw the map
  }, function(err) {
    console.error('Firestore error:', err);
    toast('Trouble connecting. Check your config.js values.');
  });

// ─────────────────────────────────────────────────────────
// VIEWER
// ─────────────────────────────────────────────────────────
function uploaderBadgeHTML(photo) {
  if (photo.uploaderPhoto) {
    return '<div class="uploader-badge"><img src="' + photo.uploaderPhoto +
           '" alt="' + (photo.uploaderName || '') + '" title="' + (photo.uploaderName || '') + '"/></div>';
  }
  var initial = photo.uploaderName ? photo.uploaderName[0].toUpperCase() : '?';
  return '<div class="uploader-badge"><div class="uploader-initial">' + initial + '</div></div>';
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
  if (e.target === document.getElementById('viewer-overlay')) {
    document.getElementById('viewer-overlay').classList.remove('open');
  }
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
  selectedFile = null;
  selectedURL  = null;
  pendingLat   = null;
  pendingLng   = null;

  document.getElementById('file-input').value    = '';
  document.getElementById('caption').value       = '';
  document.getElementById('opt-gps').classList.remove('active');
  document.getElementById('opt-pin').classList.remove('active');
  document.getElementById('add-btn').disabled    = true;
  document.getElementById('add-btn').textContent = 'Add to Map';

  var status = document.getElementById('loc-status');
  status.classList.remove('show', 'warn');
  status.textContent = '';

  document.getElementById('dz-content').innerHTML =
    '<div class="dz-icon">📷</div>' +
    '<div class="dz-main">Choose a photo</div>' +
    '<div class="dz-sub">Tap here or drag and drop</div>';
  document.getElementById('drop-zone').classList.remove('has-file');

  if (tempPinMarker) { map.removeLayer(tempPinMarker); tempPinMarker = null; }
}

// ─────────────────────────────────────────────────────────
// UPLOAD — file selection + drag and drop
// ─────────────────────────────────────────────────────────
function handleFile(e) {
  var file = e.target.files[0];
  if (!file) return;
  selectedFile = file;

  var reader = new FileReader();
  reader.onload = function(ev) {
    selectedURL = ev.target.result;
    document.getElementById('dz-content').innerHTML =
      '<div class="dz-preview"><img src="' + selectedURL + '"/></div>' +
      '<div class="dz-main" style="color:#0f172a">' + file.name + '</div>' +
      '<div class="dz-change">Tap to change</div>';
    document.getElementById('drop-zone').classList.add('has-file');
    checkReady();
  };
  reader.readAsDataURL(file);
}

var dropZone = document.getElementById('drop-zone');
dropZone.addEventListener('dragover', function(e) {
  e.preventDefault(); dropZone.style.borderColor = '#f59e0b';
});
dropZone.addEventListener('dragleave', function() {
  dropZone.style.borderColor = '';
});
dropZone.addEventListener('drop', function(e) {
  e.preventDefault(); dropZone.style.borderColor = '';
  var file = e.dataTransfer.files[0];
  if (file && file.type.startsWith('image/')) handleFile({ target: { files: [file] } });
});

// ─────────────────────────────────────────────────────────
// LOCATION — GPS
// ─────────────────────────────────────────────────────────
function useGPS() {
  document.getElementById('opt-gps').classList.add('active');
  document.getElementById('opt-pin').classList.remove('active');
  showStatus('Getting your location...', false);

  if (!navigator.geolocation) {
    showStatus('GPS not available in this browser.', true); return;
  }

  navigator.geolocation.getCurrentPosition(
    function(pos) {
      pendingLat = pos.coords.latitude;
      pendingLng = pos.coords.longitude;
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
  pendingLat = e.latlng.lat;
  pendingLng = e.latlng.lng;

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

function showStatus(msg, warn) {
  var el = document.getElementById('loc-status');
  el.textContent = msg;
  el.classList.add('show');
  el.classList.toggle('warn', warn);
}

function checkReady() {
  document.getElementById('add-btn').disabled = !(selectedFile && pendingLat !== null);
}

// ─────────────────────────────────────────────────────────
// CLOUDINARY UPLOAD
// ─────────────────────────────────────────────────────────
async function uploadToCloudinary(file) {
  var form = new FormData();
  form.append('file', file);
  form.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);
  form.append('folder', 'kline-of-sight');

  var res = await fetch(
    'https://api.cloudinary.com/v1_1/' + CLOUDINARY_CLOUD_NAME + '/image/upload',
    { method: 'POST', body: form }
  );
  if (!res.ok) throw new Error('Cloudinary upload failed: ' + res.status);
  var data = await res.json();
  return data.secure_url;
}

// ─────────────────────────────────────────────────────────
// SAVE PHOTO — Cloudinary + Firestore
// ─────────────────────────────────────────────────────────
async function savePhoto() {
  if (!selectedFile || pendingLat === null || !currentUser) return;

  var addBtn = document.getElementById('add-btn');
  addBtn.disabled    = true;
  addBtn.textContent = 'Uploading...';

  try {
    // 1. Upload image to Cloudinary
    var photoUrl = await uploadToCloudinary(selectedFile);
    var caption  = document.getElementById('caption').value.trim();

    // 2. Reverse-geocode
    var locName = pendingLat.toFixed(3) + ', ' + pendingLng.toFixed(3);
    try {
      var geo = await fetch(
        'https://nominatim.openstreetmap.org/reverse?lat=' + pendingLat + '&lon=' + pendingLng + '&format=json',
        { headers: { 'Accept-Language': 'en' } }
      );
      if (geo.ok) {
        var d = await geo.json();
        var a = d.address;
        locName = a.city || a.town || a.village || a.county || a.state || locName;
        if (a.country && locName !== a.country) locName += ', ' + a.country;
      }
    } catch(_) {}

    // 3. Build the photo entry — tagged to the signed-in user
    var photoEntry = {
      url:          photoUrl,
      caption:      caption,
      uploadedBy:   currentUser.uid,
      uploaderName: currentUser.displayName || 'Someone',
      uploaderPhoto: currentUser.photoURL   || null,
      createdAt:    new Date().toISOString()
    };

    // 4. Merge into nearby Firestore location or create a new one
    var MERGE_RADIUS_M = 3000;
    var nearby = locations.find(function(l) {
      return map.distance([l.lat, l.lng], [pendingLat, pendingLng]) < MERGE_RADIUS_M;
    });

    if (nearby) {
      await db.collection('locations').doc(nearby.id).update({
        photos: firebase.firestore.FieldValue.arrayUnion(photoEntry)
      });
    } else {
      await db.collection('locations').add({
        name:      locName,
        lat:       pendingLat,
        lng:       pendingLng,
        photos:    [photoEntry],
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });
    }

    document.getElementById('upload-overlay').classList.remove('open');
    if (tempPinMarker) { map.removeLayer(tempPinMarker); tempPinMarker = null; }
    resetUpload();
    map.flyTo([pendingLat, pendingLng], Math.max(map.getZoom(), 9), { duration: 1.4 });
    toast('Photo added!');

  } catch(err) {
    console.error('Save failed:', err);
    toast('Upload failed. Check your connection and try again.');
    addBtn.disabled    = false;
    addBtn.textContent = 'Add to Map';
  }
}

// ─────────────────────────────────────────────────────────
// LIGHTBOX
// ─────────────────────────────────────────────────────────
function openLightbox(url, caption, uploaderName) {
  document.getElementById('lightbox-img').src = url;
  var cap = document.getElementById('lightbox-caption');
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
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function() { el.classList.remove('show'); }, 3500);
}

// ─────────────────────────────────────────────────────────
// KEYBOARD SHORTCUTS
// ─────────────────────────────────────────────────────────
document.addEventListener('keydown', function(e) {
  if (e.key !== 'Escape') return;
  closeLightbox();
  document.getElementById('viewer-overlay').classList.remove('open');
  if (pinMode) cancelPin();
  else document.getElementById('upload-overlay').classList.remove('open');
});
