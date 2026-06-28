// ─────────────────────────────────────────────────────────
// Lightbox
//
// Full-screen photo viewer. Supports:
//   - prev / next navigation (arrows + keyboard)
//   - zoom in / out (click image or Zoom button)
//   - save to device (download)
//   - delete (owner only, updates Firestore)
//
// Reads:  currentUser, db
// Writes: lbPhotos, lbIndex, lbLoc, lbZoom
// ─────────────────────────────────────────────────────────
let lbPhotos = [];
let lbIndex  = 0;
let lbLoc    = null;
let lbZoom   = false;

// ── Open / close ─────────────────────────────────────────
function openLightbox(loc, index) {
  lbLoc    = loc;
  lbPhotos = loc.photos.slice();
  lbIndex  = index;
  lbZoom   = false;
  document.getElementById('lightbox').classList.add('open');
  renderLightbox();
}

function closeLightbox() {
  lbZoom = false;
  document.getElementById('lightbox-img').classList.remove('zoomed');
  document.getElementById('lightbox').classList.remove('open');
}

function lightboxBackdropClick(e) {
  if (e.target === document.getElementById('lightbox')) closeLightbox();
}

// ── Render current photo ─────────────────────────────────
function renderLightbox() {
  var photo = lbPhotos[lbIndex];
  if (!photo) return;

  // Reset zoom on every photo change
  lbZoom = false;
  var img  = document.getElementById('lightbox-img');
  var wrap = document.getElementById('lb-image-wrap');
  img.src  = photo.url;
  img.classList.remove('zoomed');
  wrap.scrollTop = 0; wrap.scrollLeft = 0;

  document.getElementById('lb-zoom-label').textContent = 'Zoom';
  document.getElementById('lb-zoom-btn').title          = 'Zoom in';

  // Caption line: "Name · caption text"
  var parts = [];
  if (photo.uploaderName) parts.push(photo.uploaderName);
  if (photo.caption)      parts.push(photo.caption);
  var cap = document.getElementById('lb-caption');
  cap.textContent   = parts.join(' · ');
  cap.style.display = parts.length ? 'block' : 'none';

  // Counter
  document.getElementById('lb-counter').textContent = (lbIndex + 1) + ' / ' + lbPhotos.length;

  // Arrow visibility
  document.getElementById('lb-prev').classList.toggle('hidden', lbIndex === 0);
  document.getElementById('lb-next').classList.toggle('hidden', lbIndex === lbPhotos.length - 1);

  // Delete button — always reset here so it's never stuck on "Deleting…"
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
function toggleZoom(e) {
  if (e && e.stopPropagation) e.stopPropagation();
  lbZoom = !lbZoom;

  var img   = document.getElementById('lightbox-img');
  var wrap  = document.getElementById('lb-image-wrap');
  var label = document.getElementById('lb-zoom-label');
  var btn   = document.getElementById('lb-zoom-btn');

  img.classList.toggle('zoomed', lbZoom);
  label.textContent = lbZoom ? 'Zoom out' : 'Zoom';
  btn.title         = lbZoom ? 'Zoom out' : 'Zoom in';

  if (lbZoom) {
    // After transition, center the scrollable zone
    setTimeout(function() {
      wrap.scrollLeft = (wrap.scrollWidth  - wrap.clientWidth)  / 2;
      wrap.scrollTop  = (wrap.scrollHeight - wrap.clientHeight) / 2;
    }, 260);
  } else {
    wrap.scrollTop = 0; wrap.scrollLeft = 0;
  }
}

// ── Save to device ───────────────────────────────────────
async function downloadCurrentPhoto() {
  var photo   = lbPhotos[lbIndex];
  if (!photo) return;

  var saveBtn = document.querySelector('.lb-save');
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
    // Fallback: open in new tab — user can long-press to save on mobile
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
    // Fetch fresh Firestore doc so our filter matches exactly
    var locDoc = await db.collection('locations').doc(lbLoc.id).get();
    var fresh  = (locDoc.data().photos || []).filter(function(p) {
      return !(p.url === photo.url &&
               p.createdAt === photo.createdAt &&
               p.uploadedBy === photo.uploadedBy);
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
