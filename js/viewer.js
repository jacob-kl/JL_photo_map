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

  document.getElementById('vwr-location').textContent = loc.name;
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
