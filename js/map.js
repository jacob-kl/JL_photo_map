// ─────────────────────────────────────────────────────────
// Map
//
// Manages the 3D globe (globe.gl) and 2D flat map (Leaflet).
// Starts in globe mode. Clicking a location on the globe
// transitions to the flat map at that location.
//
// Reads:  locations, connectedUIDs, currentUser, selectedUids, allUploaders
// Writes: map, clusterGroup, activeStyle, selectedUids, allUploaders, globeActive
// ─────────────────────────────────────────────────────────
let selectedUids = new Set();
let allUploaders = new Map();
let globeActive  = true;
let globeInstance = null;

// ── Flat map init ─────────────────────────────────────────
const map = L.map('map', { center: [40, -96], zoom: 3, zoomControl: false });
L.control.zoom({ position: 'bottomleft' }).addTo(map);

var tileSets = {
  streets: L.tileLayer(
    'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
    { attribution: '©OpenStreetMap ©CartoDB', maxZoom: 19, subdomains: 'abcd' }
  ),
  topo: L.tileLayer(
    'https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}',
    { attribution: '©Esri, DeLorme, NAVTEQ', maxZoom: 19 }
  ),
  satellite: L.tileLayer(
    'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    { attribution: '©Esri, Earthstar Geographics', maxZoom: 19 }
  )
};

var activeStyle = 'topo';
tileSets[activeStyle].addTo(map);

// ── Globe ────────────────────────────────────────────────
function initGlobe() {
  if (!window.Globe) return; // library didn't load (e.g. ad-blocker)

  var container = document.getElementById('globe-container');

  globeInstance = Globe()
    .backgroundColor('#060d1f')
    .showAtmosphere(true)
    .atmosphereColor('#4a90d9')
    .atmosphereAltitude(0.18)
    .globeImageUrl('https://unpkg.com/three-globe/example/img/earth-blue-marble.jpg')
    .bumpImageUrl('https://unpkg.com/three-globe/example/img/earth-topology.png')
    .pointsData([])
    .pointLat(function(d) { return d.lat; })
    .pointLng(function(d) { return d.lng; })
    .pointColor(function() { return '#f59e0b'; })
    .pointRadius(0.4)
    .pointAltitude(0.015)
    .pointLabel(function(d) {
      return '<div style="background:rgba(0,0,0,.75);color:#fff;padding:5px 10px;border-radius:8px;font-size:13px;font-family:Inter,sans-serif">' +
             (d.eventName ? '<span style="color:#fbbf24">' + d.eventName + '</span><br>' : '') +
             d.name + '<br><span style="opacity:.6">' + d.count + ' photo' + (d.count !== 1 ? 's' : '') + '</span>' +
             '</div>';
    })
    .onPointClick(function(point) {
      enterFlatMap(point.lat, point.lng);
      // Open the viewer for this location after the transition
      setTimeout(function() {
        var loc = locations.find(function(l) {
          return Math.abs(l.lat - point.lat) < 0.001 && Math.abs(l.lng - point.lng) < 0.001;
        });
        if (loc) openViewer(loc);
      }, 600);
    })
    (container);

  // Start looking at North America
  globeInstance.pointOfView({ lat: 38, lng: -98, altitude: 2 });

  // Gentle auto-rotation; stops when user grabs
  globeInstance.controls().autoRotate      = true;
  globeInstance.controls().autoRotateSpeed = 0.25;
  container.addEventListener('pointerdown', function() {
    if (globeInstance) globeInstance.controls().autoRotate = false;
  });
}

function updateGlobeMarkers() {
  if (!globeInstance) return;
  globeInstance.pointsData(locations.map(function(loc) {
    return {
      lat:       loc.lat,
      lng:       loc.lng,
      name:      loc.name,
      count:     loc.photos ? loc.photos.length : 0,
      eventName: loc.eventName || null
    };
  }));
}

// ── View switching ────────────────────────────────────────
function enterFlatMap(lat, lng) {
  globeActive = false;

  document.getElementById('globe-container').classList.add('hidden');
  document.getElementById('map').classList.add('visible');

  // Reflect in the style switcher
  document.querySelectorAll('.ms-btn').forEach(function(b) {
    b.classList.toggle('active', b.dataset.style === activeStyle);
  });

  // Let Leaflet know the container is now visible and fly to the location
  setTimeout(function() {
    map.invalidateSize();
    if (lat !== undefined && lng !== undefined) {
      map.setView([lat, lng], 8);
    }
  }, 50);
}

function enterGlobe() {
  globeActive = true;

  document.getElementById('map').classList.remove('visible');
  document.getElementById('globe-container').classList.remove('hidden');

  document.querySelectorAll('.ms-btn').forEach(function(b) {
    b.classList.remove('active');
  });
  var globeBtn = document.querySelector('.ms-btn[data-style="globe"]');
  if (globeBtn) globeBtn.classList.add('active');

  // Restart auto-rotate if it was stopped
  if (globeInstance) globeInstance.controls().autoRotate = true;

  updateGlobeMarkers();
}

function setMapStyle(style) {
  if (style === 'globe') { enterGlobe(); return; }
  if (globeActive) enterFlatMap();

  if (style === activeStyle) return;
  map.removeLayer(tileSets[activeStyle]);
  tileSets[style].addTo(map);
  activeStyle = style;

  document.querySelectorAll('.ms-btn').forEach(function(b) {
    b.classList.toggle('active', b.dataset.style === style);
  });
}

// ── Marker cluster ───────────────────────────────────────
const clusterGroup = L.markerClusterGroup({
  maxClusterRadius: 70,
  showCoverageOnHover: false,
  iconCreateFunction: function(c) {
    var photos = c.getAllChildMarkers().reduce(function(acc, k) {
      return acc.concat(k.options.loc ? k.options.loc.photos || [] : []);
    }, []);
    var p1 = photos[0] ? photos[0].url : '';
    var p2 = photos[1] ? photos[1].url : p1;
    return L.divIcon({
      html: '<div class="pm-stack">' +
            '<div class="pm-back"><img src="' + p1 + '" onerror="this.style.visibility=\'hidden\'"/></div>' +
            '<div class="pm-front"><img src="' + p2 + '" onerror="this.style.visibility=\'hidden\'"/></div>' +
            '<div class="pm-count">' + photos.length + ' photos</div></div>',
      className: '', iconSize: [64, 54], iconAnchor: [32, 27]
    });
  }
});

function buildIcon(loc) {
  var url = loc.photos[0] ? loc.photos[0].url : '';
  var n   = loc.photos.length;
  return L.divIcon({
    html: '<div class="pm-wrap"><div class="pm-ring"><img src="' + url +
          '" onerror="this.style.visibility=\'hidden\'"/></div>' +
          (n > 1 ? '<div class="pm-count">' + n + '</div>' : '') + '</div>',
    className: '', iconSize: [52, 52], iconAnchor: [26, 26]
  });
}

// ── Render markers ───────────────────────────────────────
function getFilteredPhotos(loc) {
  if (!loc.photos) return [];
  if (selectedUids.size === 0) return loc.photos;
  return loc.photos.filter(function(p) { return selectedUids.has(p.uploadedBy); });
}

function renderMarkers() {
  clusterGroup.clearLayers();
  locations.forEach(function(loc) {
    if (!locationMatchesEventFilter(loc)) return;
    var visible = getFilteredPhotos(loc);
    if (!visible.length) return;
    var fl = Object.assign({}, loc, { photos: visible });
    var m  = L.marker([loc.lat, loc.lng], { icon: buildIcon(fl), loc: fl });
    m.on('click', function() { openViewer(fl); });
    clusterGroup.addLayer(m);
  });
  map.addLayer(clusterGroup);
  updateGlobeMarkers(); // keep globe in sync
}

// ── Uploader filter bar ──────────────────────────────────
function buildUploaderMap() {
  var up = new Map();
  locations.forEach(function(loc) {
    (loc.photos || []).forEach(function(ph) {
      if (ph.uploadedBy && !up.has(ph.uploadedBy)) {
        up.set(ph.uploadedBy, {
          uid:         ph.uploadedBy,
          displayName: ph.uploaderName  || 'Someone',
          photoURL:    ph.uploaderPhoto || null
        });
      }
    });
  });
  return up;
}

function renderFilter() {
  allUploaders = buildUploaderMap();
  var row = document.getElementById('filter-row');
  if (allUploaders.size < 2) { row.style.display = 'none'; return; }

  row.style.display = 'flex';
  row.innerHTML = '<span class="filter-row-label">Show</span>';

  allUploaders.forEach(function(u, uid) {
    var active = selectedUids.size === 0 || selectedUids.has(uid);
    var btn = document.createElement('button');
    btn.className = 'filter-btn' + (active ? '' : ' inactive');
    btn.title     = u.displayName;
    btn.setAttribute('data-name', u.displayName.split(' ')[0]);
    btn.onclick   = function() { toggleFilter(uid); };
    btn.innerHTML = u.photoURL
      ? '<img src="' + u.photoURL + '" alt="' + u.displayName + '"/>'
      : '<div class="filter-initial">' + (u.displayName[0] || '?').toUpperCase() + '</div>';
    row.appendChild(btn);
  });
}

function toggleFilter(uid) {
  if      (selectedUids.size === 0)   selectedUids = new Set([uid]);
  else if (selectedUids.has(uid))     { selectedUids.delete(uid); }
  else {
    selectedUids.add(uid);
    if (selectedUids.size === allUploaders.size) selectedUids = new Set();
  }
  renderFilter();
  renderMarkers();
}

// ── Init globe after page loads ──────────────────────────
// Brief delay so Leaflet can initialize with a visible container first,
// then globe takes over as the default view.
window.addEventListener('load', function() {
  setTimeout(function() {
    initGlobe();
    if (globeInstance) {
      enterGlobe(); // Globe as default view
    }
    // If globe.gl didn't load (ad blocker etc.), fall back to flat map
  }, 400);
});
