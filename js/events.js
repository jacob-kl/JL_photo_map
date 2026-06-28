// ─────────────────────────────────────────────────────────
// Events
//
// Events let you group photos by trip or occasion.
// A location tagged "Summer Concert 07/2024" stays separate
// from the same spot tagged "Christmas 12/2024".
//
// "Day to Day" is the default — no event, no friction.
//
// Reads:  db, currentUser, connectedUIDs, locations, map
// Writes: events, selectedEventId, selectedEventFilter
// ─────────────────────────────────────────────────────────
let events              = [];
let selectedEventId     = 'daytoday';
let newEventName        = '';
let newEventDate        = '';
let selectedEventFilter = null;
let currentViewerLocId  = null;

// ── Real-time listener ───────────────────────────────────
function startEventsListener() {
  if (!currentUser) return;

  var allUIDs = [currentUser.uid].concat(connectedUIDs);

  db.collection('events')
    .where('createdBy', 'in', allUIDs.slice(0, 30))
    .onSnapshot(function(snap) {
      events = snap.docs.map(function(doc) {
        return Object.assign({ id: doc.id }, doc.data());
      });
      events.sort(function(a, b) {
        var da = (a.date || '').split('/').reverse().join('');
        var db2 = (b.date || '').split('/').reverse().join('');
        return db2.localeCompare(da);
      });
      renderEventPickerIfOpen();
      renderEventFilter();
    }, function(err) {
      console.error('Events listener error:', err);
    });
}

// ── Nearby events (used by picker when location is set) ──
// Returns events that have existing location pins within 100 miles
// of the pending upload location.
function getNearbyEvents() {
  if (pendingLat === null || pendingLng === null) return [];

  var RADIUS_M = 160934; // 100 miles in metres
  var nearbyIds = new Set();

  (locations || []).forEach(function(loc) {
    if (loc.eventId && typeof map !== 'undefined') {
      try {
        var dist = map.distance([loc.lat, loc.lng], [pendingLat, pendingLng]);
        if (dist < RADIUS_M) nearbyIds.add(loc.eventId);
      } catch(_) {}
    }
  });

  return events.filter(function(evt) { return nearbyIds.has(evt.id); });
}

// ── Event picker (in upload modal) ───────────────────────
function renderEventPicker() {
  var container = document.getElementById('event-picker-options');
  if (!container) return;
  container.innerHTML = '';

  var hasLocation = (pendingLat !== null && pendingLng !== null);
  var nearbyEvts  = hasLocation ? getNearbyEvents() : [];

  // Day to Day (always first)
  container.appendChild(makeEventPill('daytoday', '📅 Day to Day', selectedEventId === 'daytoday'));

  if (!hasLocation) {
    // Prompt user to set a location first
    var hint = document.createElement('span');
    hint.className   = 'event-picker-hint';
    hint.textContent = 'Set a location above to see nearby events';
    container.appendChild(hint);
  } else if (nearbyEvts.length > 0) {
    nearbyEvts.forEach(function(evt) {
      var label = evt.name + (evt.date ? ' (' + evt.date + ')' : '');
      container.appendChild(makeEventPill(evt.id, label, selectedEventId === evt.id));
    });
  } else if (events.length > 0) {
    // No nearby events — show all as a fallback with a note
    var hint = document.createElement('span');
    hint.className   = 'event-picker-hint';
    hint.textContent = 'No events within 100 mi — showing all';
    container.appendChild(hint);
    events.forEach(function(evt) {
      var label = evt.name + (evt.date ? ' (' + evt.date + ')' : '');
      container.appendChild(makeEventPill(evt.id, label, selectedEventId === evt.id));
    });
  }

  // Create new event (always available)
  container.appendChild(makeEventPill('new', '+ New Event', selectedEventId === 'new'));

  document.getElementById('new-event-form').style.display =
    selectedEventId === 'new' ? 'block' : 'none';
}

function renderEventPickerIfOpen() {
  if (document.getElementById('upload-overlay').classList.contains('open')) {
    renderEventPicker();
  }
}

function makeEventPill(id, label, active) {
  var btn = document.createElement('button');
  btn.className   = 'event-pill' + (active ? ' active' : '');
  btn.textContent = label;
  btn.type        = 'button';
  btn.onclick     = function() { selectedEventId = id; renderEventPicker(); };
  return btn;
}

function onEventNameInput(e) { newEventName = e.target.value.trim(); }

function onEventDateInput(e) {
  var raw = e.target.value.replace(/[^0-9]/g, '');
  if (raw.length > 2) raw = raw.slice(0, 2) + '/' + raw.slice(2, 6);
  e.target.value = raw;
  newEventDate   = raw;
}

function resetEventPicker() {
  selectedEventId = 'daytoday';
  newEventName    = '';
  newEventDate    = '';
  var nameEl = document.getElementById('new-event-name');
  var dateEl = document.getElementById('new-event-date');
  if (nameEl) nameEl.value = '';
  if (dateEl) dateEl.value = '';
  renderEventPicker();
}

async function resolveSelectedEvent() {
  if (selectedEventId === 'daytoday') return null;

  if (selectedEventId === 'new') {
    if (!newEventName) return null;
    if (newEventDate && !isValidDate(newEventDate)) {
      toast('Enter a valid date in MM/YYYY format.');
      throw new Error('invalid-date');
    }
    var ref = await db.collection('events').add({
      name:      newEventName,
      date:      newEventDate || '',
      createdBy: currentUser.uid,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    return { id: ref.id, name: newEventName, date: newEventDate || '' };
  }

  var evt = events.find(function(e) { return e.id === selectedEventId; });
  return evt ? { id: evt.id, name: evt.name, date: evt.date || '' } : null;
}

function isValidDate(d) {
  if (!d) return true;
  var parts = d.split('/');
  if (parts.length !== 2 || parts[1].length !== 4) return false;
  var m = parseInt(parts[0]), y = parseInt(parts[1]);
  return m >= 1 && m <= 12 && y >= 2000 && y <= 2099;
}

// ── Event filter (in map filter row) ─────────────────────
function renderEventFilter() {
  var row = document.getElementById('filter-row');
  if (!row) return;

  row.querySelectorAll('.event-divider, .event-filter-btn').forEach(function(el) {
    el.parentNode.removeChild(el);
  });

  var seen = new Map();
  locations.forEach(function(loc) {
    if (loc.eventId && loc.eventName && !seen.has(loc.eventId)) {
      seen.set(loc.eventId, { id: loc.eventId, name: loc.eventName, date: loc.eventDate || '' });
    }
  });

  if (seen.size === 0) return;

  var divider = document.createElement('span');
  divider.className   = 'event-divider';
  divider.textContent = '·';
  row.appendChild(divider);

  row.appendChild(makeFilterBtn(null, '📅 All', selectedEventFilter === null));

  seen.forEach(function(evt) {
    row.appendChild(makeFilterBtn(evt.id, evt.name, selectedEventFilter === evt.id));
  });

  row.style.display = 'flex';
}

function makeFilterBtn(id, label, active) {
  var btn = document.createElement('button');
  btn.className   = 'event-filter-btn' + (active ? ' active' : '');
  btn.textContent = label;
  btn.onclick     = function() {
    selectedEventFilter = id;
    renderEventFilter();
    renderMarkers();
  };
  return btn;
}

function locationMatchesEventFilter(loc) {
  if (selectedEventFilter === null) return true;
  return loc.eventId === selectedEventFilter;
}

// ── Add to Event (from viewer) ───────────────────────────
function openAddEventOverlay(locId) {
  currentViewerLocId = locId;
  var list = document.getElementById('add-event-list');
  list.innerHTML = '';

  if (!events.length) {
    list.innerHTML = '<p class="ae-empty">No events yet. Create one when uploading a photo.</p>';
  } else {
    events.forEach(function(evt) {
      var item = document.createElement('button');
      item.className = 'ae-item';
      item.innerHTML =
        '<span class="ae-name">' + evt.name + '</span>' +
        (evt.date ? '<span class="ae-date">' + evt.date + '</span>' : '');
      item.onclick = function() { assignLocationToEvent(locId, evt); };
      list.appendChild(item);
    });

    var removeItem = document.createElement('button');
    removeItem.className = 'ae-item ae-remove';
    removeItem.innerHTML = '<span class="ae-name">Remove from event</span>';
    removeItem.onclick   = function() { assignLocationToEvent(locId, null); };
    list.appendChild(removeItem);
  }

  document.getElementById('add-event-overlay').classList.add('open');
}

async function assignLocationToEvent(locId, evt) {
  try {
    await db.collection('locations').doc(locId).update({
      eventId:   evt ? evt.id   : null,
      eventName: evt ? evt.name : null,
      eventDate: evt ? (evt.date || null) : null
    });
    document.getElementById('add-event-overlay').classList.remove('open');
    toast(evt ? 'Added to ' + evt.name + '!' : 'Removed from event.');
  } catch(err) {
    console.error(err);
    toast('Something went wrong. Try again.');
  }
}

function maybeCloseAddEvent(e) {
  if (e.target === document.getElementById('add-event-overlay'))
    document.getElementById('add-event-overlay').classList.remove('open');
}
