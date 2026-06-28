// ─────────────────────────────────────────────────────────
// Upload
//
// Reads:  db, currentUser, map, locations (connections.js)
// Writes: pendingLat, pendingLng, selectedFiles, selectedURLs,
//         pinMode, tempPinMarker
// ─────────────────────────────────────────────────────────
let pendingLat    = null;
let pendingLng    = null;
let selectedFiles = [];
let selectedURLs  = [];
let pinMode       = false;
let tempPinMarker = null;

// ── Open / close / reset ─────────────────────────────────
function openUpload() {
  if (typeof globeActive !== 'undefined' && globeActive) enterFlatMap();
  resetUpload();
  renderEventPicker();
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
  pendingLat = null;  pendingLng  = null;

  document.getElementById('file-input').value    = '';
  document.getElementById('caption').value       = '';
  document.getElementById('caption').placeholder = 'Add a caption… (optional)';

  ['opt-gps', 'opt-pin', 'opt-search'].forEach(function(id) {
    document.getElementById(id).classList.remove('active');
  });

  document.getElementById('search-panel').classList.remove('show');
  document.getElementById('search-input').value              = '';
  document.getElementById('search-results').classList.remove('show');
  document.getElementById('search-results').innerHTML        = '';
  document.getElementById('add-btn').disabled                = true;
  document.getElementById('add-btn').textContent             = 'Add to Map';

  var s = document.getElementById('loc-status');
  s.classList.remove('show', 'warn'); s.textContent = '';

  document.getElementById('dz-content').innerHTML =
    '<div class="dz-icon">📷</div>' +
    '<div class="dz-main">Choose photos</div>' +
    '<div class="dz-sub">Tap here • select one or many</div>';
  document.getElementById('drop-zone').classList.remove('has-file');

  if (tempPinMarker) { map.removeLayer(tempPinMarker); tempPinMarker = null; }
  resetEventPicker();
}

// ── File selection ───────────────────────────────────────
function handleFile(e) {
  var files = Array.from(e.target ? e.target.files : e);
  if (!files.length) return;
  selectedFiles = files;
  selectedURLs  = new Array(files.length);
  var pending   = files.length;
  files.forEach(function(file, i) {
    var r = new FileReader();
    r.onload = function(ev) { selectedURLs[i] = ev.target.result; if (!--pending) updateDropZonePreview(); };
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

// ── Location — GPS ───────────────────────────────────────
function useGPS() {
  document.getElementById('opt-gps').classList.add('active');
  ['opt-pin', 'opt-search'].forEach(function(id) { document.getElementById(id).classList.remove('active'); });
  document.getElementById('search-panel').classList.remove('show');
  showStatus('Getting your location…', false);
  if (!navigator.geolocation) { showStatus('GPS not available in this browser.', true); return; }
  navigator.geolocation.getCurrentPosition(
    function(pos) {
      pendingLat = pos.coords.latitude; pendingLng = pos.coords.longitude;
      showStatus('Location found: ' + pendingLat.toFixed(4) + ', ' + pendingLng.toFixed(4), false);
      checkReady(); renderEventPicker();
    },
    function() {
      showStatus('GPS permission denied. Try dropping a pin instead.', true);
      document.getElementById('opt-gps').classList.remove('active');
    }
  );
}

// ── Location — pin drop ──────────────────────────────────
function startPin() {
  document.getElementById('opt-pin').classList.add('active');
  ['opt-gps', 'opt-search'].forEach(function(id) { document.getElementById(id).classList.remove('active'); });
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
      className: '', iconSize: [18,18], iconAnchor: [9,9]
    })
  }).addTo(map);
  exitPinMode();
  setTimeout(function() {
    document.getElementById('upload-overlay').classList.add('open');
    showStatus('Pin placed: ' + pendingLat.toFixed(4) + ', ' + pendingLng.toFixed(4), false);
    checkReady(); renderEventPicker();
  }, 120);
}

function cancelPin() { map.off('click', onPinClick); exitPinMode(); }

function exitPinMode() {
  pinMode = false;
  document.getElementById('pin-banner').classList.remove('show');
  document.body.classList.remove('pin-mode');
}

// ── Location — search ────────────────────────────────────
function selectSearch() {
  document.getElementById('opt-search').classList.add('active');
  ['opt-gps', 'opt-pin'].forEach(function(id) { document.getElementById(id).classList.remove('active'); });
  document.getElementById('search-panel').classList.add('show');
  pendingLat = null; pendingLng = null;
  if (tempPinMarker) { map.removeLayer(tempPinMarker); tempPinMarker = null; }
  checkReady(); renderEventPicker();
  setTimeout(function() { document.getElementById('search-input').focus(); }, 50);
}

function clearSearch() {
  document.getElementById('search-input').value      = '';
  document.getElementById('search-results').innerHTML = '';
  document.getElementById('search-results').classList.remove('show');
  pendingLat = null; pendingLng = null;
  if (tempPinMarker) { map.removeLayer(tempPinMarker); tempPinMarker = null; }
  document.getElementById('loc-status').classList.remove('show', 'warn');
  checkReady(); renderEventPicker();
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
    var res  = await fetch(
      'https://nominatim.openstreetmap.org/search?q=' + encodeURIComponent(q) +
      '&format=json&limit=6&addressdetails=1',
      { headers: { 'Accept-Language': 'en' } }
    );
    var data = await res.json();
    if (!data.length) { results.innerHTML = '<div class="search-message">No results found.</div>'; return; }
    results.innerHTML = '';
    data.forEach(function(place) {
      var parts = place.display_name.split(', ');
      var item  = document.createElement('div');
      item.className = 'search-result-item';
      item.innerHTML =
        '<div class="result-main">' + parts.slice(0,2).join(', ') + '</div>' +
        (parts.length > 2 ? '<div class="result-sub">' + parts.slice(2,5).join(', ') + '</div>' : '');
      item.onclick = function() { pickPlace(parseFloat(place.lat), parseFloat(place.lon), place.display_name); };
      results.appendChild(item);
    });
  } catch(_) {
    results.innerHTML = '<div class="search-message">Search failed. Check your connection.</div>';
  }
}

function pickPlace(lat, lng, fullName) {
  pendingLat = lat; pendingLng = lng;
  document.getElementById('search-input').value = fullName.split(', ').slice(0,3).join(', ');
  document.getElementById('search-results').classList.remove('show');
  if (tempPinMarker) map.removeLayer(tempPinMarker);
  tempPinMarker = L.marker([lat, lng], {
    icon: L.divIcon({
      html: '<div style="width:18px;height:18px;background:#f59e0b;border:3px solid #fff;border-radius:50%;box-shadow:0 2px 8px rgba(0,0,0,.4)"></div>',
      className: '', iconSize: [18,18], iconAnchor: [9,9]
    })
  }).addTo(map);
  map.panTo([lat, lng], { animate: true, duration: 0.8 });
  showStatus('Location set: ' + fullName.split(', ').slice(0,2).join(', '), false);
  checkReady(); renderEventPicker();
}

function showStatus(msg, warn) {
  var el = document.getElementById('loc-status');
  el.textContent = msg; el.classList.add('show'); el.classList.toggle('warn', warn);
}

function checkReady() {
  var n = selectedFiles.length, ready = n > 0 && pendingLat !== null;
  var btn = document.getElementById('add-btn');
  btn.disabled    = !ready;
  btn.textContent = (ready && n > 1) ? 'Add ' + n + ' Photos to Map' : 'Add to Map';
}

// ── Cloudinary upload ────────────────────────────────────
// f_auto converts HEIC/HEIF → WebP or JPEG based on the browser.
// Without this, photos from iPhones appear blank on non-Safari browsers.
async function uploadToCloudinary(file) {
  var form = new FormData();
  form.append('file',          file);
  form.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);
  form.append('folder',        'kline-of-sight');
  var res = await fetch(
    'https://api.cloudinary.com/v1_1/' + CLOUDINARY_CLOUD_NAME + '/image/upload',
    { method: 'POST', body: form }
  );
  if (!res.ok) throw new Error('Cloudinary ' + res.status);
  var data = await res.json();
  return data.secure_url.replace('/upload/', '/upload/f_auto,q_auto/');
}

// ── Save to Firestore ────────────────────────────────────
async function savePhoto() {
  if (!selectedFiles.length || pendingLat === null || !currentUser) return;

  var n   = selectedFiles.length;
  var btn = document.getElementById('add-btn');
  btn.disabled = true; btn.textContent = n > 1 ? 'Uploading 0 of ' + n + '…' : 'Uploading…';

  // 1. Resolve event — non-fatal
  var eventInfo = null;
  try {
    eventInfo = await resolveSelectedEvent();
  } catch(evtErr) {
    if (evtErr.message === 'invalid-date') {
      btn.disabled = false; btn.textContent = 'Add to Map'; return;
    }
    console.warn('Event error (skipping event tag):', evtErr);
  }

  // 2. Upload to Cloudinary — per-file error handling so one bad file
  //    doesn't kill the entire batch.
  var uploaded = 0;
  var skipped  = 0;
  var photoUrls = await Promise.all(selectedFiles.map(async function(file) {
    try {
      var url = await uploadToCloudinary(file);
      uploaded++;
      if (n > 1) btn.textContent = 'Uploading ' + uploaded + ' of ' + n + '…';
      return url;
    } catch(fileErr) {
      skipped++;
      console.warn('Skipped file:', file.name, fileErr.message);
      if (n > 1) btn.textContent = 'Uploading ' + (uploaded + skipped) + ' of ' + n + '…';
      return null; // null entries are filtered out below
    }
  }));

  photoUrls = photoUrls.filter(Boolean);

  if (!photoUrls.length) {
    toast('All uploads failed. Check file sizes and your Cloudinary config.');
    btn.disabled = false; btn.textContent = n > 1 ? 'Add ' + n + ' Photos to Map' : 'Add to Map';
    return;
  }
  if (skipped > 0) toast(skipped + ' file' + (skipped > 1 ? 's' : '') + ' skipped (too large or unsupported format).');

  // 3. Reverse-geocode
  var locName = pendingLat.toFixed(3) + ', ' + pendingLng.toFixed(3);
  try {
    var geo = await fetch(
      'https://nominatim.openstreetmap.org/reverse?lat=' + pendingLat + '&lon=' + pendingLng + '&format=json',
      { headers: { 'Accept-Language': 'en' } }
    );
    if (geo.ok) {
      var d = await geo.json(), a = d.address;
      locName = a.city || a.town || a.village || a.county || a.state || locName;
      if (a.country && locName !== a.country) locName += ', ' + a.country;
    }
  } catch(_) {}

  // 4. Build photo entries
  var photoEntries = photoUrls.map(function(url) {
    return {
      url:           url,
      caption:       document.getElementById('caption').value.trim(),
      uploadedBy:    currentUser.uid,
      uploaderName:  currentUser.displayName || 'Someone',
      uploaderPhoto: currentUser.photoURL    || null,
      createdAt:     new Date().toISOString()
    };
  });

  // 5. Merge into nearby same-event location or create new
  var MERGE_RADIUS_M = 3000;
  var myEventId = eventInfo ? eventInfo.id : null;
  var nearby = locations.find(function(l) {
    return (l.eventId || null) === myEventId &&
           map.distance([l.lat, l.lng], [pendingLat, pendingLng]) < MERGE_RADIUS_M;
  });

  try {
    if (nearby) {
      await db.collection('locations').doc(nearby.id).update({
        photos: firebase.firestore.FieldValue.arrayUnion.apply(
          firebase.firestore.FieldValue, photoEntries)
      });
    } else {
      await db.collection('locations').add({
        ownedBy:   currentUser.uid,
        name:      locName,
        lat:       pendingLat,
        lng:       pendingLng,
        eventId:   eventInfo ? eventInfo.id   : null,
        eventName: eventInfo ? eventInfo.name : null,
        eventDate: eventInfo ? eventInfo.date : null,
        photos:    photoEntries,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });
    }
  } catch(dbErr) {
    console.error('Firestore write failed:', dbErr);
    toast('Photos uploaded but map save failed. Check your Firestore rules (README step 1.4).');
    btn.disabled = false; btn.textContent = n > 1 ? 'Add ' + n + ' Photos to Map' : 'Add to Map';
    return;
  }

  document.getElementById('upload-overlay').classList.remove('open');
  if (tempPinMarker) { map.removeLayer(tempPinMarker); tempPinMarker = null; }
  resetUpload();
  map.flyTo([pendingLat, pendingLng], Math.max(map.getZoom(), 9), { duration: 1.4 });
  toast(photoUrls.length + ' photo' + (photoUrls.length > 1 ? 's' : '') + ' added!');
}
