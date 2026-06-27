// ─────────────────────────────────────────────────────────
// Connections & Privacy
//
// Reads:  db, auth, currentUser, map (for distance calc)
// Writes: locations, connectedUIDs, locationListener
// Calls:  renderFilter, renderMarkers  (map.js)
//         renderEventFilter, startEventsListener (events.js)
//         renderConnectionsList (sharing.js)
// ─────────────────────────────────────────────────────────
let locations        = [];
let connectedUIDs    = [];
let locationListener = null;

function startConnectionsListener() {
  if (!currentUser) return;

  db.collection('connections')
    .where('uids', 'array-contains', currentUser.uid)
    .onSnapshot(function(snap) {
      connectedUIDs = snap.docs.map(function(doc) {
        return doc.data().uids.find(function(uid) { return uid !== currentUser.uid; });
      }).filter(Boolean);

      startLocationListener();
      startEventsListener();
      renderConnectionsList();
    }, function(err) {
      console.error('Connections listener error:', err);
      startLocationListener();
      startEventsListener();
    });
}

function startLocationListener() {
  if (locationListener) { locationListener(); locationListener = null; }
  if (!currentUser) return;

  locationListener = db.collection('locations')
    .onSnapshot(function(snap) {
      var all = snap.docs.map(function(doc) {
        return Object.assign({ id: doc.id }, doc.data());
      });

      locations = all.filter(function(loc) {
        if (!loc.ownedBy)                               return true;
        if (loc.ownedBy === currentUser.uid)            return true;
        if (connectedUIDs.indexOf(loc.ownedBy) !== -1)  return true;
        return false;
      });

      locations.sort(function(a, b) {
        var ta = a.createdAt && a.createdAt.toDate ? a.createdAt.toDate() : new Date(a.createdAt || 0);
        var tb = b.createdAt && b.createdAt.toDate ? b.createdAt.toDate() : new Date(b.createdAt || 0);
        return ta - tb;
      });

      renderFilter();
      renderMarkers();
      renderEventFilter(); // refresh event pills whenever locations change

      // Auto-migrate old documents missing ownedBy
      all.forEach(function(loc) {
        if (!loc.ownedBy) {
          db.collection('locations').doc(loc.id)
            .update({ ownedBy: currentUser.uid })
            .catch(function() {});
        }
      });
    }, function(err) {
      console.error('Location listener error:', err);
      toast('Trouble loading photos — check your Firestore rules in the README.');
    });
}
