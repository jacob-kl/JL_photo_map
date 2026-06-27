// ─────────────────────────────────────────────────────────
// SAMPLE DATA  (swap this out when Firebase is wired up)
// ─────────────────────────────────────────────────────────
const SEED_LOCATIONS = [
  {
    id: 'loc-1',
    name: 'Denver, Colorado',
    lat: 39.7392, lng: -104.9903,
    photos: [
      { url: 'https://images.unsplash.com/photo-1546156929-a4c0ac411f47?w=600', caption: 'Red Rocks at sunset 🌅' },
      { url: 'https://images.unsplash.com/photo-1619468129361-605ebea04b44?w=600', caption: 'Downtown Denver 🏙️' },
      { url: 'https://images.unsplash.com/photo-1500534314209-a25ddb2bd429?w=600', caption: 'Rocky Mountains 🏔️' },
    ]
  },
  {
    id: 'loc-2',
    name: 'New York City',
    lat: 40.7128, lng: -74.006,
    photos: [
      { url: 'https://images.unsplash.com/photo-1490644658840-3f2e3f8c5625?w=600', caption: 'Central Park 🌳' },
      { url: 'https://images.unsplash.com/photo-1534430480872-3498386e7856?w=600', caption: 'Times Square ✨' },
    ]
  },
  {
    id: 'loc-3',
    name: 'Kyoto, Japan',
    lat: 35.0116, lng: 135.7681,
    photos: [
      { url: 'https://images.unsplash.com/photo-1545569341-9eb8b30979d9?w=600', caption: 'Fushimi Inari ⛩️' },
      { url: 'https://images.unsplash.com/photo-1528360983277-13d401cdc186?w=600', caption: 'Arashiyama bamboo 🎋' },
      { url: 'https://images.unsplash.com/photo-1493976040374-85c8e12f0c0e?w=600', caption: 'Temple gardens 🌸' },
      { url: 'https://images.unsplash.com/photo-1504805572947-34fad45aed93?w=600', caption: 'Golden hour 🌇' },
    ]
  },
  {
    id: 'loc-4',
    name: 'Patagonia, Argentina',
    lat: -50.9, lng: -72.8,
    photos: [
      { url: 'https://images.unsplash.com/photo-1501854140801-50d01698950b?w=600', caption: 'Torres del Paine 🏔️' },
      { url: 'https://images.unsplash.com/photo-1518623489648-a173ef7824f3?w=600', caption: 'Lakes and peaks 💙' },
    ]
  },
  {
    id: 'loc-5',
    name: 'Santorini, Greece',
    lat: 36.3932, lng: 25.4615,
    photos: [
      { url: 'https://images.unsplash.com/photo-1570077188670-e3a8d69ac5ff?w=600', caption: 'Oia at dusk 🌊' },
    ]
  }
];

// ─────────────────────────────────────────────────────────
// STATE
// ─────────────────────────────────────────────────────────
let locations     = JSON.parse(JSON.stringify(SEED_LOCATIONS));
let pendingLat    = null;
let pendingLng    = null;
let selectedFile  = null;
let selectedURL   = null;
let pinMode       = false;
let tempPinMarker = null;

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
  { attribution: '©OpenStreetMap ©CartoDB', maxZoom: 19 }
).addTo(map);

const cluster = L.markerClusterGroup({
  maxClusterRadius: 70,
  showCoverageOnHover: false,
  iconCreateFunction(c) {
    const kids   = c.getAllChildMarkers();
    const photos = kids.flatMap(k => k.options.loc?.photos ?? []);
    const count  = photos.length;
    const p1     = photos[0]?.url ?? '';
    const p2     = photos[1]?.url ?? '';
    return L.divIcon({
      html: `
        <div class="pm-stack">
          <div class="pm-back"><img src="${p1}" onerror="this.style.visibility='hidden'"/></div>
          <div class="pm-front"><img src="${p2 || p1}" onerror="this.style.visibility='hidden'"/></div>
          <div class="pm-count">${count} photos</div>
        </div>`,
      className: '',
      iconSize: [64, 54],
      iconAnchor: [32, 27]
    });
  }
});

function buildIcon(loc) {
  const url   = loc.photos[0]?.url ?? '';
  const count = loc.photos.length;

  if (count === 1) {
    return L.divIcon({
      html: `<div class="pm-wrap"><div class="pm-ring"><img src="${url}" onerror="this.style.visibility='hidden'"/></div></div>`,
      className: '',
      iconSize: [52, 52],
      iconAnchor: [26, 26]
    });
  }

  return L.divIcon({
    html: `<div class="pm-wrap"><div class="pm-ring"><img src="${url}" onerror="this.style.visibility='hidden'"/></div><div class="pm-count">${count}</div></div>`,
    className: '',
    iconSize: [52, 52],
    iconAnchor: [26, 26]
  });
}

function renderMarkers() {
  cluster.clearLayers();
  locations.forEach(loc => {
    if (!loc.photos.length) return;
    const m = L.marker([loc.lat, loc.lng], { icon: buildIcon(loc), loc });
    m.on('click', () => openViewer(loc));
    cluster.addLayer(m);
  });
  map.addLayer(cluster);
}

renderMarkers();

// ─────────────────────────────────────────────────────────
// VIEWER
// ─────────────────────────────────────────────────────────
function openViewer(loc) {
  if (pinMode) return;

  document.getElementById('vwr-location').textContent = '📍 ' + loc.name;
  document.getElementById('vwr-title').textContent =
    loc.photos.length + ' photo' + (loc.photos.length !== 1 ? 's' : '');

  const grid = document.getElementById('vwr-grid');
  grid.innerHTML = '';
  loc.photos.forEach(ph => {
    const el = document.createElement('div');
    el.className = 'photo-grid-item';
    el.innerHTML = `
      <img src="${ph.url}" alt="${ph.caption ?? ''}" loading="lazy"/>
      ${ph.caption ? `<div class="caption-overlay">${ph.caption}</div>` : ''}`;
    el.onclick = () => openLightbox(ph.url, ph.caption);
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
// UPLOAD
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

  document.getElementById('file-input').value = '';
  document.getElementById('caption').value    = '';
  document.getElementById('opt-gps').classList.remove('active');
  document.getElementById('opt-pin').classList.remove('active');
  document.getElementById('add-btn').disabled = true;

  const status = document.getElementById('loc-status');
  status.classList.remove('show', 'warn');
  status.textContent = '';

  document.getElementById('dz-content').innerHTML = `
    <div class="dz-icon">📷</div>
    <div class="dz-main">Choose a photo</div>
    <div class="dz-sub">Tap here or drag and drop</div>`;
  document.getElementById('drop-zone').classList.remove('has-file');

  if (tempPinMarker) {
    map.removeLayer(tempPinMarker);
    tempPinMarker = null;
  }
}

function handleFile(e) {
  const file = e.target.files[0];
  if (!file) return;
  selectedFile = file;

  const reader = new FileReader();
  reader.onload = ev => {
    selectedURL = ev.target.result;
    document.getElementById('dz-content').innerHTML = `
      <div class="dz-preview"><img src="${selectedURL}"/></div>
      <div class="dz-main" style="color:#0f172a">${file.name}</div>
      <div class="dz-change">Tap to change</div>`;
    document.getElementById('drop-zone').classList.add('has-file');
    checkReady();
  };
  reader.readAsDataURL(file);
}

// Drag-and-drop support
const dropZone = document.getElementById('drop-zone');
dropZone.addEventListener('dragover', e => {
  e.preventDefault();
  dropZone.style.borderColor = '#f59e0b';
});
dropZone.addEventListener('dragleave', () => {
  dropZone.style.borderColor = '';
});
dropZone.addEventListener('drop', e => {
  e.preventDefault();
  dropZone.style.borderColor = '';
  const file = e.dataTransfer.files[0];
  if (file?.type.startsWith('image/')) {
    handleFile({ target: { files: [file] } });
  }
});

// ─────────────────────────────────────────────────────────
// LOCATION — GPS
// ─────────────────────────────────────────────────────────
function useGPS() {
  document.getElementById('opt-gps').classList.add('active');
  document.getElementById('opt-pin').classList.remove('active');
  showStatus('🔍 Getting your location…', false);

  if (!navigator.geolocation) {
    // Demo fallback when geolocation isn't available
    pendingLat = 39.74 + (Math.random() - .5) * .05;
    pendingLng = -104.99 + (Math.random() - .5) * .05;
    showStatus('✅ Demo location set (GPS not available here)', false);
    checkReady();
    return;
  }

  navigator.geolocation.getCurrentPosition(
    pos => {
      pendingLat = pos.coords.latitude;
      pendingLng = pos.coords.longitude;
      showStatus(`✅ Location found — ${pendingLat.toFixed(4)}, ${pendingLng.toFixed(4)}`, false);
      checkReady();
    },
    () => {
      // Fallback if the user denies location permission
      pendingLat = 39.74;
      pendingLng = -104.99;
      showStatus('📍 Using Denver as demo location (GPS permission denied)', true);
      checkReady();
    }
  );
}

// ─────────────────────────────────────────────────────────
// LOCATION — PIN DROP
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
      html: `<div style="width:18px;height:18px;background:#f59e0b;border:3px solid #fff;border-radius:50%;box-shadow:0 2px 8px rgba(0,0,0,.4)"></div>`,
      className: '',
      iconSize: [18, 18],
      iconAnchor: [9, 9]
    })
  }).addTo(map);

  exitPinMode();

  setTimeout(() => {
    document.getElementById('upload-overlay').classList.add('open');
    showStatus(`✅ Pin placed — ${pendingLat.toFixed(4)}, ${pendingLng.toFixed(4)}`, false);
    checkReady();
  }, 120);
}

function cancelPin() {
  map.off('click', onPinClick);
  exitPinMode();
}

function exitPinMode() {
  pinMode = false;
  document.getElementById('pin-banner').classList.remove('show');
  document.body.classList.remove('pin-mode');
}

// ─────────────────────────────────────────────────────────
// UPLOAD — SAVE
// ─────────────────────────────────────────────────────────
function showStatus(msg, warn) {
  const el = document.getElementById('loc-status');
  el.textContent = msg;
  el.classList.add('show');
  el.classList.toggle('warn', warn);
}

function checkReady() {
  document.getElementById('add-btn').disabled = !(selectedURL && pendingLat !== null);
}

async function savePhoto() {
  if (!selectedURL || pendingLat === null) return;
  const caption = document.getElementById('caption').value.trim();

  // Reverse-geocode with Nominatim (free, no API key needed)
  let locName = `${pendingLat.toFixed(3)}°, ${pendingLng.toFixed(3)}°`;
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${pendingLat}&lon=${pendingLng}&format=json`,
      { headers: { 'Accept-Language': 'en' } }
    );
    if (res.ok) {
      const data = await res.json();
      const a = data.address;
      locName = a.city || a.town || a.village || a.county || a.state || locName;
      if (a.country && locName !== a.country) locName += ', ' + a.country;
    }
  } catch (_) { /* keep coordinate fallback */ }

  // Merge into an existing nearby location (within 3 km) or create a new one
  const MERGE_RADIUS_M = 3000;
  let target = locations.find(l =>
    map.distance([l.lat, l.lng], [pendingLat, pendingLng]) < MERGE_RADIUS_M
  );

  if (target) {
    target.photos.push({ url: selectedURL, caption });
  } else {
    target = {
      id: 'loc-' + Date.now(),
      name: locName,
      lat: pendingLat,
      lng: pendingLng,
      photos: [{ url: selectedURL, caption }]
    };
    locations.push(target);
  }

  renderMarkers();
  document.getElementById('upload-overlay').classList.remove('open');
  if (tempPinMarker) { map.removeLayer(tempPinMarker); tempPinMarker = null; }
  resetUpload();
  map.flyTo([pendingLat, pendingLng], Math.max(map.getZoom(), 9), { duration: 1.4 });
  toast('📍 Photo added to your map!');
}

// ─────────────────────────────────────────────────────────
// LIGHTBOX
// ─────────────────────────────────────────────────────────
function openLightbox(url, caption) {
  document.getElementById('lightbox-img').src = url;
  const cap = document.getElementById('lightbox-caption');
  cap.textContent    = caption ?? '';
  cap.style.display  = caption ? 'block' : 'none';
  document.getElementById('lightbox').classList.add('open');
}

function closeLightbox() {
  document.getElementById('lightbox').classList.remove('open');
}

// ─────────────────────────────────────────────────────────
// TOAST
// ─────────────────────────────────────────────────────────
let toastTimer;

function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 3000);
}

// ─────────────────────────────────────────────────────────
// KEYBOARD SHORTCUTS
// ─────────────────────────────────────────────────────────
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  closeLightbox();
  document.getElementById('viewer-overlay').classList.remove('open');
  if (pinMode) cancelPin();
  else document.getElementById('upload-overlay').classList.remove('open');
});
