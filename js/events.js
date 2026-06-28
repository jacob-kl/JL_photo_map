// ─────────────────────────────────────────────────────────
// Events
//
// Events let you group photos by trip or occasion.
// A location tagged "Summer Concert 07/2024" stays separate
// from the same spot tagged "Christmas 12/2024".
//
// "Day to Day" is the default — no event, no friction.
//
// Reads:  db, currentUser, connectedUIDs, locations
// Writes: events, selectedEventId, selectedEventFilter
// ─────────────────────────────────────────────────────────
let events              = [];          // loaded from Firestore
let selectedEventId     = 'daytoday'; // 'daytoday' | eventId | 'new'
let newEventName        = '';
let newEventDate        = '';
let selectedEventFilter = null;        // null = show all events
let currentViewerLocId  = null;        // set by viewer.js when a location is opened

// ── Real-time listener ───────────────────────────────────
// Called from connections.js after the location listener starts
function startEventsListener() {
  if (!currentUser) return;

  // Load events from all connected users + your own
  var allUIDs = [currentUser.uid].concat(connectedUIDs);

  db.collection('events')
    .where('createdBy', 'in', allUIDs.slice(0, 30)) // Firestore 'in' limit
    .onSnapshot(function(snap) {
      events = snap.docs.map(function(doc) {
        return Object.assign({ id: doc.id }, doc.data());
      });
      // Sort newest first by date string (MM/YYYY sorts as MMYYYY = close enough)
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

// ── Event picker (in upload modal) ───────────────────────
function renderEventPicker() {
  var container = document.getElementById('event-picker-options');
  if (!container) return;
  container.innerHTML = '';

  // Day to Day (default)
  container.appendChild(makeEventPill('daytoday', '📅 Day to Day', selectedEventId === 'daytoday'));

  // Existing events
  events.forEach(function(evt) {
    var label = evt.name + ' (' + evt.date + ')';
    container.appendChild(makeEventPill(evt.id, label, selectedEventId === evt.id));
  });

  // Create new event
  container.appendChild(makeEventPill('new', '+ New Event', selectedEventId === 'new'));

  // Show new-event form only when "new" is selected
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

// Returns { id, name, date } for the chosen event, or null for Day to Day.
// Creates a new Firestore event document if "new" was chosen.
async function resolveSelectedEvent() {
  if (selectedEventId === 'daytoday') return null;

  if (selectedEventId === 'new') {
    if (!newEventName) return null; // no name = treat as Day to Day
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

  // Existing event
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

// ── Event filter (in the map filter row) ─────────────────
function renderEventFilter() {
  // This adds event pills to the existing filter-row after the uploader pills.
  // Called by renderFilter() in map.js and whenever events or locations change.
  var row = document.getElementById('filter-row');
  if (!row) return;

  // Remove any previous event pills + divider from the row
  row.querySelectorAll('.event-divider, .event-filter-btn').forEach(function(el) {
    el.parentNode.removeChild(el);
  });

  // Collect unique events that appear in current visible locations
  var seen = new Map();
  locations.forEach(function(loc) {
    if (loc.eventId && loc.eventName && !seen.has(loc.eventId)) {
      seen.set(loc.eventId, { id: loc.eventId, name: loc.eventName, date: loc.eventDate || '' });
    }
  });

  if (seen.size === 0) return;

  // Visual divider
  var divider = document.createElement('span');
  divider.className   = 'event-divider';
  divider.textContent = '·';
  row.appendChild(divider);

  // "All" pill
  row.appendChild(makeFilterBtn(null, '📅 All', selectedEventFilter === null));

  // One pill per event
  seen.forEach(function(evt) {
    row.appendChild(makeFilterBtn(evt.id, evt.name, selectedEventFilter === evt.id));
  });

  // Show the row if it was hidden
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

// Used by map.js renderMarkers()
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

    // Option to remove event tag
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
