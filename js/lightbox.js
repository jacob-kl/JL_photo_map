// ─────────────────────────────────────────────────────────
// Lightbox
//
// Full-screen photo viewer. Supports:
//   - prev / next navigation (arrows + keyboard)
//   - pinch-to-zoom on mobile, click/button zoom on desktop
//   - save to device (download)
//   - delete (owner only, updates Firestore)
//
// Reads:  currentUser, db
// Writes: lbPhotos, lbIndex, lbLoc, lbZoom, lbZoomScale
// ─────────────────────────────────────────────────────────
let lbPhotos    = [];
let lbIndex     = 0;
let lbLoc       = null;
let lbZoom      = false;
let lbZoomScale = 1.0;  // ranges 1–4; button snaps to 1.5x

var lbPinchStartDist  = 0;
var lbPinchStartScale = 1;
var lbPinchInit       = false;

// ── Open / close ─────────────────────────────────────────
function openLightbox(loc, index) {
  lbLoc    = loc;
  lbPhotos = loc.photos.slice();
  lbIndex  = index;
  document.getElementById('lightbox').classList.add('open');
  renderLightbox();
  if (!lbPinchInit) { initPinchZoom(); lbPinchInit = true; }
}

function closeLightbox() {
  resetLightboxZoom();
  document.getElementById('lightbox').classList.remove('open');
}

function lightboxBackdropClick(e) {
  if (e.target === document.getElementById('lightbox')) closeLightbox();
}

// ── Render current photo ─────────────────────────────────
function renderLightbox() {
  var photo = lbPhotos[lbIndex];
  if (!photo) return;

  resetLightboxZoom();

  var img  = document.getElementById('lightbox-img');
  var wrap = document.getElementById('lb-image-wrap');
  img.src  = photo.url;
  wrap.scrollTop = 0; wrap.scrollLeft = 0;

  // Caption
  var parts = [];
  if (photo.uploaderName) parts.push(photo.uploaderName);
  if (photo.caption)      parts.push(photo.caption);
  var cap = document.getElementById('lb-caption');
  cap.textContent   = parts.join(' · ');
  cap.style.display = parts.length ? 'block' : 'none';

  // Counter
  document.getElementById('lb-counter').textContent = (lbIndex + 1) + ' / ' + lbPhotos.length;

  // Arrows
  document.getElementById('lb-prev').classList.toggle('hidden', lbIndex === 0);
  document.getElementById('lb-next').classList.toggle('hidden', lbIndex === lbPhotos.length - 1);

  // Delete — always reset here so it's never stuck on "Deleting…"
  var delBtn   = document.getElementById('lb-delete');
  var delLabel = document.getElementById('lb-delete-label');
  delBtn.disabled      = false;
  delLabel.textContent = 'Delete';
  delBtn.style.display = (currentUser && photo.uploadedBy === currentUser.uid) ? 'flex' : 'none';
}

// ── Navigation ───────────────────────────────────────────
function lightboxNav(dir, e) {
  if (e && e.stopPropagation) e.stopPropagation();
  var next = lbIndex + dir;
  if (next < 0 || next >= lbPhotos.length) return;
  lbIndex = next;
  renderLightbox();
}

// ── Zoom ─────────────────────────────────────────────────
function resetLightboxZoom() {
  lbZoom      = false;
  lbZoomScale = 1.0;
  applyLightboxZoom();
}

function applyLightboxZoom() {
  var img   = document.getElementById('lightbox-img');
  var wrap  = document.getElementById('lb-image-wrap');
  var label = document.getElementById('lb-zoom-label');
  var btn   = document.getElementById('lb-zoom-btn');
  if (!img) return;

  if (lbZoomScale <= 1) {
    img.style.transform = '';
    img.classList.remove('zoomed');
    img.style.cursor    = 'zoom-in';
    if (wrap) { wrap.scrollTop = 0; wrap.scrollLeft = 0; }
  } else {
    img.style.transform = 'scale(' + lbZoomScale.toFixed(2) + ')';
    img.classList.add('zoomed');
    img.style.cursor    = 'zoom-out';
  }

  if (label) label.textContent = (lbZoomScale > 1) ? 'Zoom out' : 'Zoom';
  if (btn)   btn.title         = (lbZoomScale > 1) ? 'Zoom out' : 'Zoom in';
}

// Button / click toggle — 1.5x is comfortable; not too aggressive
function toggleZoom(e) {
  if (e && e.stopPropagation) e.stopPropagation();

  if (lbZoom) {
    lbZoom      = false;
    lbZoomScale = 1.0;
    applyLightboxZoom();
  } else {
    lbZoom      = true;
    lbZoomScale = 1.5;
    applyLightboxZoom();
    // Center the scroll position after transition
    setTimeout(function() {
      var wrap = document.getElementById('lb-image-wrap');
      if (wrap) {
        wrap.scrollLeft = (wrap.scrollWidth  - wrap.clientWidth)  / 2;
        wrap.scrollTop  = (wrap.scrollHeight - wrap.clientHeight) / 2;
      }
    }, 260);
  }
}

// ── Pinch-to-zoom (mobile) ───────────────────────────────
function getTouchDist(touches) {
  var dx = touches[0].clientX - touches[1].clientX;
  var dy = touches[0].clientY - touches[1].clientY;
  return Math.sqrt(dx * dx + dy * dy);
}

function initPinchZoom() {
  var wrap = document.getElementById('lb-image-wrap');
  if (!wrap) return;

  wrap.addEventListener('touchstart', function(e) {
    if (e.touches.length === 2) {
      e.preventDefault();
      lbPinchStartDist  = getTouchDist(e.touches);
      lbPinchStartScale = lbZoomScale;
    }
  }, { passive: false });

  wrap.addEventListener('touchmove', function(e) {
    if (e.touches.length === 2) {
      e.preventDefault();
      var dist    = getTouchDist(e.touches);
      var newScale = (dist / lbPinchStartDist) * lbPinchStartScale;
      lbZoomScale = Math.max(1, Math.min(4, newScale));
      lbZoom      = lbZoomScale > 1;
      applyLightboxZoom();
    }
  }, { passive: false });

  wrap.addEventListener('touchend', function() {
    // Snap back to 1x if barely zoomed — avoids getting stuck at 1.05x
    if (lbZoomScale < 1.15) {
      lbZoom      = false;
      lbZoomScale = 1.0;
      applyLightboxZoom();
    }
  });
}

// ── Save to device ───────────────────────────────────────
async function downloadCurrentPhoto() {
  var photo    = lbPhotos[lbIndex];
  if (!photo) return;

  var saveBtn  = document.querySelector('.lb-save');
  var origHTML = saveBtn.innerHTML;
  saveBtn.innerHTML = 'Saving…';
  saveBtn.disabled  = true;

  try {
    var res  = await fetch(photo.url);
    var blob = await res.blob();
    var url  = URL.createObjectURL(blob);
    var a    = document.createElement('a');
    a.href     = url;
    a.download = (lbLoc.name || 'photo').replace(/[^a-z0-9]/gi, '-').toLowerCase() +
                 '-' + (lbIndex + 1) + '.' + (blob.type.split('/')[1] || 'jpg');
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast('Photo saved!');
  } catch(err) {
    window.open(photo.url, '_blank');
    toast('Opening photo — long-press to save.');
  } finally {
    saveBtn.innerHTML = origHTML;
    saveBtn.disabled  = false;
  }
}

// ── Delete ───────────────────────────────────────────────
async function deleteCurrentPhoto() {
  var photo = lbPhotos[lbIndex];
  if (!photo || !currentUser || photo.uploadedBy !== currentUser.uid) return;
  if (!confirm('Delete this photo?')) return;

  var delBtn   = document.getElementById('lb-delete');
  var delLabel = document.getElementById('lb-delete-label');
  delLabel.textContent = 'Deleting…';
  delBtn.disabled      = true;

  try {
    var locDoc = await db.collection('locations').doc(lbLoc.id).get();
    var fresh  = (locDoc.data().photos || []).filter(function(p) {
      return !(p.url === photo.url && p.createdAt === photo.createdAt && p.uploadedBy === photo.uploadedBy);
    });
    await db.collection('locations').doc(lbLoc.id).update({ photos: fresh });

    lbPhotos.splice(lbIndex, 1);

    if (lbPhotos.length === 0) {
      closeLightbox();
      document.getElementById('viewer-overlay').classList.remove('open');
    } else {
      if (lbIndex >= lbPhotos.length) lbIndex = lbPhotos.length - 1;
      renderLightbox(); // resets delete button state automatically
    }
    toast('Photo deleted.');
  } catch(err) {
    console.error(err);
    toast('Delete failed. Try again.');
    delLabel.textContent = 'Delete';
    delBtn.disabled      = false;
  }
}

// ── Native share (added to original) ──────────────────────
async function shareCurrentPhoto() {
  var photo = lbPhotos[lbIndex];
  if (!photo) return;
  if (!navigator.share) {
    navigator.clipboard && navigator.clipboard.writeText(photo.url)
      .then(function() { toast('Link copied!'); });
    return;
  }
  try {
    var res  = await fetch(photo.url);
    var blob = await res.blob();
    var file = new File([blob], 'photo.jpg', { type: blob.type });
    var data = { title: lbLoc ? lbLoc.name : 'Kline of Sight' };
    if (navigator.canShare && navigator.canShare({ files: [file] })) data.files = [file];
    else data.url = photo.url;
    await navigator.share(data);
  } catch(e) { if (e.name !== 'AbortError') toast('Copy the photo URL to share.'); }
}

// Swipe-down to close lightbox
(function() {
  var lb = document.getElementById('lightbox');
  if (!lb) return;
  var sy = 0;
  lb.addEventListener('touchstart', function(e) { sy = e.touches[0].clientY; }, { passive: true });
  lb.addEventListener('touchend', function(e) {
    if (lbZoom) return;
    if (e.changedTouches[0].clientY - sy > 90) closeLightbox();
  }, { passive: true });
})();
