// ─────────────────────────────────────────────────────────
// Photo Viewer
//
// Shows a bottom-sheet grid of photos for a map location.
// Displays event info if the location is tagged with one.
// Tapping a photo opens the Lightbox.
//
// Reads:  currentUser, events (events.js)
// Calls:  openLightbox (lightbox.js)
//         openAddEventOverlay (events.js)
// ─────────────────────────────────────────────────────────

function uploaderBadgeHTML(photo) {
  if (photo.uploaderPhoto) {
    return '<div class="uploader-badge"><img src="' + photo.uploaderPhoto +
           '" title="' + (photo.uploaderName || '') + '"/></div>';
  }
  var initial = ((photo.uploaderName || '?')[0]).toUpperCase();
  return '<div class="uploader-badge"><div class="uploader-initial">' + initial + '</div></div>';
}

function openViewer(loc) {
  if (typeof pinMode !== 'undefined' && pinMode) return;

  // Track which location is open so "Add to Event" knows which doc to update
  currentViewerLocId = loc.id;

  // Event badge
  var badge = document.getElementById('vwr-event-badge');
  if (loc.eventName) {
    badge.textContent = '📅 ' + loc.eventName + (loc.eventDate ? ' · ' + loc.eventDate : '');
    badge.style.display = 'block';
  } else {
    badge.style.display = 'none';
  }

  var locEl = document.getElementById('vwr-location');
  currentLoc = loc;
  if (currentUser && loc.ownedBy === currentUser.uid) {
    locEl.innerHTML =
      '<span id="vwr-name-text">' + escHtml(loc.name) + '</span>' +
      ' <button class="vwr-icon-btn" title="Rename" onclick="startRenameLocation()">✏️</button>' +
      ' <button class="vwr-icon-btn" title="Delete pin" onclick="confirmDeleteLocation()">🗑️</button>';
  } else {
    locEl.textContent = loc.name;
  }
  document.getElementById('vwr-title').textContent =
    loc.photos.length + ' photo' + (loc.photos.length !== 1 ? 's' : '');

  var grid = document.getElementById('vwr-grid');
  grid.innerHTML = '';
  loc.photos.forEach(function(ph, i) {
    var el = document.createElement('div');
    el.className = 'photo-grid-item';
    el.innerHTML =
      '<img src="' + ph.url + '" alt="' + (ph.caption || '') + '" loading="lazy"/>' +
      (ph.caption ? '<div class="caption-overlay">' + ph.caption + '</div>' : '') +
      uploaderBadgeHTML(ph);
    (function(idx) { el.onclick = function() { openLightbox(loc, idx); }; })(i);
    grid.appendChild(el);
  });

  // "Add to Event" button — always shown so you can tag or re-tag
  var addEvtBtn = document.getElementById('vwr-add-event-btn');
  addEvtBtn.textContent = loc.eventName ? '📅 Change event' : '📅 Add to event';

  document.getElementById('viewer-overlay').classList.add('open');
}

function maybeCloseViewer(e) {
  if (e.target === document.getElementById('viewer-overlay'))
    document.getElementById('viewer-overlay').classList.remove('open');
}

// ── New: rename, delete, swipe (added without changing existing code) ─
let currentLoc = null;

function escHtml(s) {
  return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function startRenameLocation() {
  var locEl = document.getElementById('vwr-location');
  locEl.innerHTML =
    '<input id="rename-input" class="rename-input" value="' + escHtml(currentLoc.name) + '" maxlength="80"/>' +
    ' <button class="btn-outline-sm" style="padding:5px 10px;font-size:12px" onclick="saveRenameLocation()">Save</button>' +
    ' <button class="btn-outline-sm" style="padding:5px 10px;font-size:12px" onclick="openViewer(currentLoc)">Cancel</button>';
  var inp = document.getElementById('rename-input');
  inp.focus(); inp.select();
  inp.addEventListener('keydown', function(e) {
    if (e.key === 'Enter') saveRenameLocation();
    if (e.key === 'Escape') openViewer(currentLoc);
  });
}

async function saveRenameLocation() {
  var inp  = document.getElementById('rename-input');
  var name = inp ? inp.value.trim() : '';
  if (!name) return;
  try {
    await db.collection('locations').doc(currentLoc.id).update({ name: name });
    currentLoc = Object.assign({}, currentLoc, { name: name });
    openViewer(currentLoc);
    toast('Location renamed.');
  } catch(err) { console.error(err); toast('Rename failed.'); }
}

async function confirmDeleteLocation() {
  if (!confirm('Delete "' + currentLoc.name + '" and all its photos?')) return;
  try {
    await db.collection('locations').doc(currentLoc.id).delete();
    document.getElementById('viewer-overlay').classList.remove('open');
    toast('Location deleted.');
  } catch(err) { console.error(err); toast('Delete failed.'); }
}

// Swipe-down to close
(function() {
  var sheet = document.querySelector('#viewer-overlay .sheet');
  if (!sheet) return;
  var sy = 0;
  sheet.addEventListener('touchstart', function(e) { sy = e.touches[0].clientY; }, { passive: true });
  sheet.addEventListener('touchend', function(e) {
    if (sheet.scrollTop > 10) return;
    if (e.changedTouches[0].clientY - sy > 80)
      document.getElementById('viewer-overlay').classList.remove('open');
  }, { passive: true });
})();
