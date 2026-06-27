// ─────────────────────────────────────────────────────────
// Sharing
//
// Handles: sharing panel UI, generating invite codes,
//          validating + redeeming codes, connections list.
//
// Privacy model recap:
//   - Bob generates a code → stores it in /inviteCodes/{code}
//   - John enters the code → creates /connections/{bobUID_johnUID}
//   - Both now see each other's photos (via connections.js listener)
//   - Bill doesn't see either until he exchanges codes with someone
//
// Reads:  db, currentUser, connectedUIDs
// Writes: currentInviteCode, inviteTimerInterval
// ─────────────────────────────────────────────────────────
let currentInviteCode   = null;
let inviteTimerInterval = null;

// ── Panel open / close ───────────────────────────────────
function openSharingPanel() {
  document.getElementById('connect-error').textContent = '';
  document.getElementById('connect-input').value       = '';
  document.getElementById('sharing-overlay').classList.add('open');
  renderConnectionsList();
}

function maybeCloseSharing(e) {
  if (e.target === document.getElementById('sharing-overlay')) {
    document.getElementById('sharing-overlay').classList.remove('open');
    if (inviteTimerInterval) { clearInterval(inviteTimerInterval); inviteTimerInterval = null; }
  }
}

// ── Generate invite code ──────────────────────────────────
async function generateAndShowCode() {
  var display = document.getElementById('invite-code-display');
  display.innerHTML = '<div class="code-generating">Generating…</div>';

  try {
    var code      = makeRandomCode();
    var expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    await db.collection('inviteCodes').doc(code).set({
      createdBy: currentUser.uid,
      expiresAt: expiresAt.toISOString()
    });

    currentInviteCode = code;
    display.innerHTML =
      '<div class="big-code">' + code + '</div>' +
      '<div class="code-expires" id="code-timer"></div>' +
      '<button class="btn-copy" onclick="copyCode()">Copy Code</button>';

    tickTimer(expiresAt);
    if (inviteTimerInterval) clearInterval(inviteTimerInterval);
    inviteTimerInterval = setInterval(function() { tickTimer(expiresAt); }, 30000);

  } catch(err) {
    console.error(err);
    display.innerHTML = '<div class="code-generating">Failed to generate. Try again.</div>';
  }
}

// Avoids visually confusing characters (0/O, 1/I)
function makeRandomCode() {
  var chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  var code  = '';
  for (var i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

function tickTimer(expiresAt) {
  var el = document.getElementById('code-timer');
  if (!el) return;
  var ms = expiresAt - new Date();
  if (ms <= 0) { el.textContent = 'Expired'; return; }
  el.textContent = 'Expires in ' + Math.floor(ms / 3600000) + 'h ' +
                   Math.floor((ms % 3600000) / 60000) + 'm';
}

function copyCode() {
  if (!currentInviteCode) return;
  var fallback = function() {
    var inp = document.createElement('input');
    inp.value = currentInviteCode;
    document.body.appendChild(inp); inp.select();
    document.execCommand('copy'); document.body.removeChild(inp);
    toast('Code copied!');
  };
  navigator.clipboard
    ? navigator.clipboard.writeText(currentInviteCode).then(function() { toast('Code copied!'); }).catch(fallback)
    : fallback();
}

// ── Connect with someone else's code ─────────────────────
async function connectWithCode() {
  var code    = document.getElementById('connect-input').value.trim().toUpperCase();
  var errorEl = document.getElementById('connect-error');
  errorEl.textContent = '';

  if (code.length !== 6) { errorEl.textContent = 'Enter the full 6-character code.'; return; }

  var btn = document.getElementById('btn-connect');
  btn.disabled = true; btn.textContent = 'Connecting…';

  try {
    var codeDoc = await db.collection('inviteCodes').doc(code).get();
    if (!codeDoc.exists) throw new Error('not-found');

    var data = codeDoc.data();
    if (new Date(data.expiresAt) < new Date()) throw new Error('expired');
    if (data.createdBy === currentUser.uid)     throw new Error('own-code');

    var theirUID = data.createdBy;
    var pairId   = [currentUser.uid, theirUID].sort().join('_');

    var existing = await db.collection('connections').doc(pairId).get();
    if (existing.exists) throw new Error('already-connected');

    await db.collection('connections').doc(pairId).set({
      uids:      [currentUser.uid, theirUID],
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });

    document.getElementById('connect-input').value = '';
    toast('Connected! Their photos will appear on your map.');

  } catch(err) {
    var msgs = {
      'not-found':         'Code not found. Double-check it.',
      'expired':           'This code has expired. Ask them for a new one.',
      'own-code':          "That's your own code — send it to someone else.",
      'already-connected': "You're already connected with this person."
    };
    errorEl.textContent = msgs[err.message] || 'Something went wrong. Try again.';
  } finally {
    btn.disabled = false; btn.textContent = 'Connect';
  }
}

// ── Connections list ─────────────────────────────────────
async function renderConnectionsList() {
  var section = document.getElementById('connections-section');
  if (!connectedUIDs.length) { section.style.display = 'none'; return; }
  section.style.display = 'block';

  var list = document.getElementById('connections-list');
  list.innerHTML = '';

  var profiles = await Promise.all(connectedUIDs.map(function(uid) {
    return db.collection('users').doc(uid).get().then(function(doc) {
      return doc.exists
        ? Object.assign({ uid: uid }, doc.data())
        : { uid: uid, displayName: 'Unknown' };
    });
  }));

  profiles.forEach(function(p) {
    var item   = document.createElement('div');
    item.className = 'connection-item';
    var avatar = p.photoURL
      ? '<div class="conn-avatar"><img src="' + p.photoURL + '"/></div>'
      : '<div class="conn-avatar">' + (p.displayName[0] || '?').toUpperCase() + '</div>';
    item.innerHTML = avatar + '<span class="conn-name">' + (p.displayName || 'Unknown') + '</span>';
    list.appendChild(item);
  });
}
