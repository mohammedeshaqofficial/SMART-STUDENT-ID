// Scanner terminal: Web NFC taps, QR profile scanning, and manual UID entry.
const stage = document.getElementById('stage');
const verdict = document.getElementById('verdict');
const verdictInner = document.getElementById('verdict-inner');
const stateLabel = document.getElementById('state-label');
const modeLabel = document.getElementById('mode-label');
const feed = document.getElementById('feed');

const NFC_SUPPORTED = 'NDEFReader' in window;
const MODES = { nfc: 'NFC tap', qr: 'QR code', manual: 'Enter UID' };
const DEMO = [['Authorized', '04A7B29183'], ['Blocked', '04B1C2D3E4'], ['Unknown', 'DEADBEEF99']];

const state = { mode: null, nfcAbort: null, stream: null, timer: null, busy: false, last: { uid: '', at: 0 }, hideTimer: null };

function setStatus(text) { stateLabel.textContent = text; }

// ---------- result overlay ----------
function showVerdict(kind, html, autoHideMs) {
  clearTimeout(state.hideTimer);
  verdict.className = 'verdict show ' + kind;
  verdictInner.innerHTML = html;
  const again = verdictInner.querySelector('[data-again]');
  if (again) { again.addEventListener('click', hideVerdict); again.focus({ preventScroll: true }); }
  if (navigator.vibrate) navigator.vibrate(kind === 'ok' ? 80 : [60, 60, 60]);
  setStatus(kind === 'ok' ? 'Verified' : 'Check result');
  if (autoHideMs) state.hideTimer = setTimeout(hideVerdict, autoHideMs);
}
function hideVerdict(resume = true) {
  clearTimeout(state.hideTimer);
  verdict.className = 'verdict';
  if (!resume) return;
  if (state.mode === 'qr' && !state.stream && document.getElementById('qr-video')) startCamera();
  else setStatus(state.mode === 'nfc' && state.nfcAbort ? 'Listening' : 'Ready');
  const input = document.getElementById('uid-input');
  if (input) { input.value = ''; input.focus({ preventScroll: true }); }
}
const metaBlock = (pairs) => '<div class="meta">' + pairs.filter((p) => p[1]).map((p) => `<div>${esc(p[0])}<b>${esc(p[1])}</b></div>`).join('') + '</div>';
const againBtn = '<button class="btn alt" type="button" data-again>Scan again</button>';

// ---------- verification ----------
async function verifyUid(raw, source) {
  const uid = normalizeUid(raw);
  if (!validUid(uid)) {
    showVerdict('bad', `<div class="seal">${ICONS.cross}</div><div class="label">Invalid UID</div><h2>That doesn't look like a card</h2>
      <p class="muted">A UID is 8-20 hexadecimal characters, e.g. 04A7B29183 or 04:A7:B2:91:83.</p><div class="actions" style="margin-top:20px">${againBtn}</div>`);
    return;
  }
  const now = Date.now();
  if (state.busy || (uid === state.last.uid && now - state.last.at < 2500)) return;
  state.busy = true; state.last = { uid, at: now };
  setStatus('Checking');
  try {
    const res = await fetch(API_BASE_URL + '/verify-card', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ card_uid: uid, source }) });
    let d;
    try { d = await res.json(); } catch (e) { throw new Error('Unexpected response from server (' + res.status + ').'); }
    const auto = state.mode === 'nfc' ? 6000 : 0;
    if (d.authorized) {
      const first = String(d.name || 'Resident').split(' ')[0];
      showVerdict('ok', `<div class="seal">${ICONS.check}</div><div class="label">Access granted</div><h2>Welcome, <em>${esc(first)}</em></h2>
        ${metaBlock([['Resident', d.name], ['Room', d.room], ['User ID', d.user_id], ['Card', uid]])}
        <div class="actions"><a class="btn" href="${esc(profileUrl(d.user_id))}">View profile</a>${againBtn}</div>`, auto);
    } else {
      const reason = d.reason || 'ACCESS DENIED';
      const copy = reason === 'CARD BLOCKED' ? 'This card has been blocked by the warden. Ask the resident to collect a replacement.'
        : reason === 'UNKNOWN CARD' ? 'This card is not registered to any resident.' : 'The card could not be verified.';
      showVerdict('bad', `<div class="seal">${ICONS.cross}</div><div class="label">Access denied</div><h2>${esc(reason.charAt(0) + reason.slice(1).toLowerCase())}</h2>
        <p class="muted">${esc(copy)}</p>${metaBlock([['Resident', d.name], ['Room', d.room], ['Card', uid]])}
        <div class="actions">${reason === 'UNKNOWN CARD' ? `<a class="btn" href="/register.html?uid=${encodeURIComponent(uid)}">Register this card</a>` : ''}${againBtn}</div>`, auto);
    }
    loadFeed();
  } catch (err) {
    showVerdict('bad', `<div class="seal">${ICONS.cross}</div><div class="label">Connection problem</div><h2>Couldn't verify</h2><p class="muted">${esc(err.message)}</p><div class="actions" style="margin-top:20px">${againBtn}</div>`);
  } finally {
    state.busy = false;
  }
}

async function lookupProfile(userId) {
  setStatus('Checking');
  try {
    const { data: p } = await api('/profile/' + encodeURIComponent(userId));
    const active = p.card_status === 'ACTIVE';
    showVerdict(active ? 'ok' : 'bad', profileVerdict(p, active ? 'Resident found' : 'Card not active', 'Static link \u00b7 not a live code'));
  } catch (err) {
    showVerdict('bad', `<div class="seal">${ICONS.cross}</div><div class="label">Not recognised</div><h2>No such resident</h2><p class="muted">${esc(err.message)}</p><div class="actions" style="margin-top:20px">${againBtn}</div>`);
  }
}

// Full resident card shown after a QR scan.
function profileVerdict(p, label, note) {
  return `<div class="avatar" aria-hidden="true">${esc(initials(p.student_name))}</div>
    <div class="label">${esc(label)}</div><h2>${esc(p.student_name)}</h2><p class="muted" style="margin:0">${esc(p.department)}</p>
    ${note ? `<span class="chip">${esc(note)}</span>` : ''}
    ${metaBlock([['Room', p.room_number], ['User ID', p.user_id], ['Student ID', p.student_id], ['Card', p.card_status || 'NO CARD'], ['Email', p.email]])}
    <div class="actions"><a class="btn" href="${esc(profileUrl(p.user_id))}">Open full profile</a>${againBtn}</div>`;
}

async function verifyQrToken(token) {
  if (state.busy) return;
  state.busy = true;
  setStatus('Checking');
  try {
    const res = await fetch(API_BASE_URL + '/verify-qr', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token }) });
    let d;
    try { d = await res.json(); } catch (e) { throw new Error('Unexpected response from server (' + res.status + ').'); }
    const p = d.data;
    if (d.valid && d.authorized) {
      showVerdict('ok', profileVerdict(p, 'Identity verified', 'Live QR \u00b7 card active'));
    } else if (d.valid) {
      showVerdict('bad', profileVerdict(p, 'Access denied', d.reason === 'NO CARD' ? 'No card issued' : 'Card blocked'));
    } else if (p) {
      showVerdict('bad', profileVerdict(p, 'QR code expired', 'Ask for the live code'));
    } else {
      showVerdict('bad', `<div class="seal">${ICONS.cross}</div><div class="label">Not recognised</div><h2>Invalid QR code</h2>
        <p class="muted">${esc(d.message || 'This QR code was not issued by this hostel.')}</p><div class="actions" style="margin-top:20px">${againBtn}</div>`);
    }
    loadFeed();
  } catch (err) {
    showVerdict('bad', `<div class="seal">${ICONS.cross}</div><div class="label">Connection problem</div><h2>Couldn't verify</h2><p class="muted">${esc(err.message)}</p><div class="actions" style="margin-top:20px">${againBtn}</div>`);
  } finally {
    state.busy = false;
  }
}

function handleQr(text) {
  const t = String(text || '').trim();
  const tok = t.match(/[?&#]t=([A-Za-z0-9_-]{16,64})/);
  if (tok) return verifyQrToken(tok[1]);
  const m = t.match(/\/profile(?:\.html\?id=|\/)(USR\d{3,})/i) || t.match(/^(USR\d{3,})$/i);
  if (m) return lookupProfile(m[1].toUpperCase());
  if (validUid(normalizeUid(t))) return verifyUid(t, 'MANUAL');
  showVerdict('info', `<div class="seal">${ICONS.qr.replace('class="icon"', '')}</div><div class="label">Unrecognised code</div><h2>Not a resident QR</h2>
    <p class="muted">Scan the QR code shown on a digital profile page.</p><div class="actions" style="margin-top:20px">${againBtn}</div>`);
}

// ---------- NFC mode ----------
function renderNfc() {
  stage.innerHTML = `<div><div class="pad" id="pad"><div class="rings"><i></i><i></i><i></i></div>${ICONS.nfc}</div>
    <div class="stage-copy"><h3 id="nfc-title">${NFC_SUPPORTED ? 'Ready to read' : 'NFC not available here'}</h3>
    <p id="nfc-copy">${NFC_SUPPORTED ? 'Start scanning, then hold a card to the back of this phone.' : 'Web NFC works in Chrome on Android over HTTPS. On this device, use the QR code or Enter UID modes, or the ESP32 reader at the door.'}</p>
    <div class="actions" style="justify-content:center;margin-top:20px">${NFC_SUPPORTED ? '<button class="btn" id="nfc-start" type="button">Start NFC scanning</button>' : '<button class="btn alt" type="button" data-goto="manual">Enter a UID instead</button>'}</div></div></div>`;
  const start = document.getElementById('nfc-start');
  if (start) start.addEventListener('click', startNfc);
}

async function startNfc() {
  const btn = document.getElementById('nfc-start');
  if (state.nfcAbort) { stopNfc(); return; }
  try {
    const reader = new NDEFReader();
    const ctrl = new AbortController();
    reader.onreading = (e) => { if (e.serialNumber) verifyUid(e.serialNumber, 'WEB_NFC'); else toast('This card did not report a UID.', 'error'); };
    reader.onreadingerror = () => toast('Could not read that card. Hold it still and try again.', 'error');
    await reader.scan({ signal: ctrl.signal });
    state.nfcAbort = ctrl;
    document.getElementById('pad').classList.add('listening');
    document.getElementById('nfc-title').textContent = 'Listening for a card';
    document.getElementById('nfc-copy').textContent = 'Hold the card flat against the back of the phone for a moment.';
    if (btn) { btn.textContent = 'Stop scanning'; btn.className = 'btn alt'; }
    setStatus('Listening');
  } catch (err) {
    const msg = err && err.name === 'NotAllowedError' ? 'NFC permission was denied. Allow NFC for this site in Chrome settings.'
      : err && err.name === 'NotSupportedError' ? 'This phone has no NFC reader, or NFC is switched off.' : 'Could not start NFC: ' + ((err && err.message) || 'unknown error');
    toast(msg, 'error');
    setStatus('Ready');
  }
}
function stopNfc() {
  if (state.nfcAbort) { state.nfcAbort.abort(); state.nfcAbort = null; }
  const pad = document.getElementById('pad'); if (pad) pad.classList.remove('listening');
  const btn = document.getElementById('nfc-start'); if (btn) { btn.textContent = 'Start NFC scanning'; btn.className = 'btn'; }
  const title = document.getElementById('nfc-title'); if (title) title.textContent = 'Ready to read';
}

// ---------- QR mode ----------
function renderQr() {
  stage.innerHTML = `<div style="width:100%;display:grid;place-items:center">
    <div class="video-wrap"><video id="qr-video" playsinline muted></video><div class="frame"></div><div class="scanline" id="scanline" hidden></div></div>
    <div class="stage-copy"><h3 id="qr-title">Scan a profile QR code</h3><p id="qr-copy">Point the camera at the QR code on a resident's digital profile.</p>
    <div class="actions" style="justify-content:center;margin-top:18px"><button class="btn" id="qr-start" type="button">Start camera</button>
    <label class="btn alt scan-upload">Upload a photo<input type="file" id="qr-file" accept="image/*"></label></div></div></div>`;
  document.getElementById('qr-start').addEventListener('click', () => (state.stream ? stopCamera() : startCamera()));
  loadJsQr().catch(() => {});
  document.getElementById('qr-file').addEventListener('change', (e) => { const f = e.target.files && e.target.files[0]; e.target.value = ''; if (f) scanImageFile(f); });
}

let detector = null;
let jsQrLoading = null;
function loadJsQr() {
  if (window.jsQR) return Promise.resolve();
  if (!jsQrLoading) {
    jsQrLoading = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = '/vendor/jsQR.js';
      s.onload = resolve; s.onerror = () => { jsQrLoading = null; reject(new Error('QR decoder failed to load. Reload the page and try again.')); };
      document.head.appendChild(s);
    });
  }
  return jsQrLoading;
}
// Native BarcodeDetector when available, with jsQR on every other frame: some browsers advertise
// qr_code support but never return a result, so relying on the native detector alone can hang.
async function getDetector() {
  if (detector) return detector;
  let native = null;
  if ('BarcodeDetector' in window) {
    try {
      const formats = await window.BarcodeDetector.getSupportedFormats();
      if (formats.includes('qr_code')) native = new window.BarcodeDetector({ formats: ['qr_code'] });
    } catch (e) { /* fall back to jsQR */ }
  }
  try { await loadJsQr(); } catch (e) { if (!native) throw e; }
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  let frame = 0;
  detector = {
    async detect(video) {
      const w = video.videoWidth, h = video.videoHeight;
      if (!w || !h || video.readyState < 2) return [];
      frame++;
      if (native && (!window.jsQR || frame % 2)) {
        const codes = await native.detect(video);
        if (codes.length) return codes;
        if (!window.jsQR) return [];
      }
      if (!window.jsQR) return [];
      const scale = Math.min(1, 720 / Math.max(w, h));
      canvas.width = Math.round(w * scale); canvas.height = Math.round(h * scale);
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const text = decodeCanvas(canvas, ctx);
      return text ? [{ rawValue: text }] : [];
    }
  };
  return detector;
}

function decodeCanvas(canvas, ctx) {
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const code = window.jsQR(img.data, img.width, img.height, { inversionAttempts: 'attemptBoth' });
  return code ? code.data : '';
}
async function scanImageFile(file) {
  setStatus('Reading photo');
  try {
    await loadJsQr();
    const url = URL.createObjectURL(file);
    const img = await new Promise((resolve, reject) => { const i = new Image(); i.onload = () => resolve(i); i.onerror = () => reject(new Error('That file is not an image.')); i.src = url; });
    URL.revokeObjectURL(url);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    let text = '';
    // Try a couple of sizes: large photos decode better downscaled, small screenshots at full size.
    for (const max of [1024, 1600, 640]) {
      const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
      canvas.width = Math.round(img.naturalWidth * scale); canvas.height = Math.round(img.naturalHeight * scale);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      text = decodeCanvas(canvas, ctx);
      if (text) break;
    }
    if (!text) { setStatus('Ready'); toast('No QR code found in that photo. Try a sharper, closer shot.', 'error'); return; }
    stopCamera();
    handleQr(text);
  } catch (err) {
    setStatus('Ready');
    toast(err.message || 'Could not read that photo.', 'error');
  }
}

async function startCamera() {
  const video = document.getElementById('qr-video');
  const btn = document.getElementById('qr-start');
  if (!video) return;
  if (!window.isSecureContext) { toast('The camera only works over HTTPS. Use Upload a photo instead.', 'error'); return; }
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { toast('Camera access is not available in this browser. Use Upload a photo instead.', 'error'); return; }
  try {
    btn.disabled = true;
    const det = await getDetector();
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
    } catch (e) {
      if (e && (e.name === 'NotAllowedError' || e.name === 'SecurityError')) throw e;
      stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
    }
    if (state.mode !== 'qr') { stream.getTracks().forEach((t) => t.stop()); return; }
    state.stream = stream;
    video.muted = true;
    video.setAttribute('playsinline', '');
    video.srcObject = stream;
    await video.play();
    document.getElementById('scanline').hidden = false;
    document.getElementById('qr-title').textContent = 'Looking for a code';
    btn.textContent = 'Stop camera'; btn.className = 'btn alt';
    setStatus('Camera on');
    const tick = async () => {
      if (!state.stream) return;
      try {
        const codes = await det.detect(video);
        if (codes.length && codes[0].rawValue) { stopCamera(); handleQr(codes[0].rawValue); return; }
      } catch (e) { /* frame not ready */ }
      state.timer = setTimeout(tick, 220);
    };
    tick();
  } catch (err) {
    const msg = err && err.name === 'NotAllowedError' ? 'Camera permission was denied. Allow camera access for this site and try again.'
      : err && err.name === 'NotFoundError' ? 'No camera was found on this device.' : (err && err.message) || 'Could not start the camera.';
    toast(msg, 'error');
    setStatus('Ready');
  } finally {
    if (btn) btn.disabled = false;
  }
}
function stopCamera() {
  clearTimeout(state.timer);
  if (state.stream) { state.stream.getTracks().forEach((t) => t.stop()); state.stream = null; }
  const video = document.getElementById('qr-video'); if (video) video.srcObject = null;
  const line = document.getElementById('scanline'); if (line) line.hidden = true;
  const btn = document.getElementById('qr-start'); if (btn) { btn.textContent = 'Start camera'; btn.className = 'btn'; }
  const title = document.getElementById('qr-title'); if (title) title.textContent = 'Scan a profile QR code';
  setStatus('Ready');
}

// ---------- manual mode ----------
function renderManual() {
  stage.innerHTML = `<form class="manual" id="manual-form" novalidate>
    <div class="field"><label for="uid-input">Card UID</label>
    <div class="input-group"><input id="uid-input" class="mono" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="04A7B29183 or 04:A7:B2:91:83" maxlength="40">
    <button class="btn" type="submit">Verify</button></div><div class="err" id="uid-err"></div></div>
    <p class="muted" style="font-size:.85rem;margin:0">Demo cards</p>
    <div class="demo-chips">${DEMO.map((d) => `<button type="button" class="chip-btn" data-uid="${d[1]}"><i>${d[0]}</i>${d[1]}</button>`).join('')}</div>
    <div class="notice">Using a USB reader that types the UID? Click the field and tap the card; most readers press Enter for you.</div></form>`;
  const form = document.getElementById('manual-form');
  const input = document.getElementById('uid-input');
  const err = document.getElementById('uid-err');
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const uid = normalizeUid(input.value);
    if (!validUid(uid)) { input.classList.add('invalid'); err.textContent = 'Enter 8-20 hexadecimal characters.'; return; }
    input.classList.remove('invalid'); err.textContent = '';
    state.last.uid = '';
    verifyUid(uid, 'MANUAL');
  });
  input.addEventListener('input', () => { input.classList.remove('invalid'); err.textContent = ''; });
  form.querySelectorAll('[data-uid]').forEach((b) => b.addEventListener('click', () => { state.last.uid = ''; input.value = b.dataset.uid; verifyUid(b.dataset.uid, 'MANUAL'); }));
  input.focus({ preventScroll: true });
}

// ---------- mode switching ----------
function setMode(mode) {
  if (!MODES[mode]) mode = NFC_SUPPORTED ? 'nfc' : 'manual';
  if (state.mode === mode) return;
  stopNfc(); stopCamera(); hideVerdict(false);
  state.mode = mode;
  modeLabel.textContent = MODES[mode];
  document.querySelectorAll('[data-mode]').forEach((b) => {
    const on = b.dataset.mode === mode;
    b.classList.toggle('on', on); b.setAttribute('aria-selected', String(on));
  });
  ({ nfc: renderNfc, qr: renderQr, manual: renderManual })[mode]();
  const url = new URL(location.href); url.searchParams.set('mode', mode); history.replaceState(null, '', url);
  setStatus('Ready');
}
document.querySelectorAll('[data-mode]').forEach((b) => b.addEventListener('click', () => setMode(b.dataset.mode)));
stage.addEventListener('click', (e) => { const g = e.target.closest('[data-goto]'); if (g) setMode(g.dataset.goto); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && verdict.classList.contains('show')) hideVerdict(); });

// ---------- live feed ----------
async function loadFeed() {
  if (document.hidden) return;
  try {
    const { data } = await api('/access-logs?limit=12');
    if (!data.length) { feed.innerHTML = '<li style="display:block"><div class="empty"><b>No taps yet</b>Scans will appear here as they happen.</div></li>'; return; }
    feed.innerHTML = data.map((l) => `<li><span class="dot ${l.status === 'GRANTED' ? 'ok' : 'bad'}"></span>
      <div><div class="t">${esc(l.student_name || 'Unknown card')}</div><div class="s">${esc(l.card_uid || '-')} &middot; ${esc(l.status === 'GRANTED' ? 'Room ' + (l.room_number || '-') : l.reason || 'Denied')}</div></div>
      <time datetime="${esc(l.timestamp)}" title="${esc(fmtBoth(l.timestamp))}">${esc(fmtAgo(l.timestamp))}</time></li>`).join('');
  } catch (err) {
    feed.innerHTML = `<li style="display:block"><div class="empty">${esc(err.message)}</div></li>`;
  }
}

window.addEventListener('pagehide', () => { stopNfc(); stopCamera(); });
document.addEventListener('visibilitychange', () => { if (document.hidden && state.stream) stopCamera(); if (!document.hidden) loadFeed(); });

setMode(new URLSearchParams(location.search).get('mode'));
loadFeed();
setInterval(loadFeed, 5000);
