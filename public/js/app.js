// Shared helpers: API client, navigation, footer, formatting, icons, toasts.
const API_BASE_URL = '/api';

async function api(path, options) {
  let res;
  try {
    res = await fetch(API_BASE_URL + path, Object.assign({ headers: { 'Content-Type': 'application/json' } }, options));
  } catch (e) {
    throw new Error('Cannot reach the server. Check your connection and try again.');
  }
  let data;
  try { data = await res.json(); } catch (e) { throw new Error('Unexpected response from server (' + res.status + ').'); }
  if (!res.ok || data.success === false) {
    const err = new Error(data.message || data.reason || 'Request failed.');
    err.status = res.status;
    throw err;
  }
  const method = String((options && options.method) || 'GET').toUpperCase();
  if (method !== 'GET' && /^\/(users|cards|register)/.test(path)) notifyDataChanged();
  return data;
}

// Live sync: pages register callbacks with onDataChange() that run whenever student data changes.
// Writes from this browser reach other open tabs instantly (BroadcastChannel); changes made anywhere
// else are picked up by polling the cheap /api/changes version stamp.
const liveSync = { handlers: [], version: null, started: false, checking: false, again: false,
  channel: 'BroadcastChannel' in window ? new BroadcastChannel('student-data') : null };
function onDataChange(fn) {
  liveSync.handlers.push(fn);
  if (liveSync.started) return;
  liveSync.started = true;
  if (liveSync.channel) liveSync.channel.onmessage = () => checkForChanges();
  document.addEventListener('visibilitychange', () => { if (!document.hidden) checkForChanges(); });
  setInterval(checkForChanges, 4000);
  checkForChanges();
}
function notifyDataChanged() {
  if (liveSync.channel) liveSync.channel.postMessage('changed');
  checkForChanges();
}
async function checkForChanges() {
  if (!liveSync.started || document.hidden) return;
  if (liveSync.checking) { liveSync.again = true; return; }
  liveSync.checking = true;
  try {
    const { version } = await api('/changes');
    const first = liveSync.version === null;
    if (version !== liveSync.version) {
      liveSync.version = version;
      if (!first) liveSync.handlers.forEach((fn) => { try { fn(); } catch (e) { console.error(e); } });
    }
  } catch (e) { /* offline or server hiccup: try again on the next tick */ }
  finally {
    liveSync.checking = false;
    if (liveSync.again) { liveSync.again = false; checkForChanges(); }
  }
}

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function toDate(ts) { const d = ts ? new Date(ts) : null; return d && !isNaN(d) ? d : null; }
function fmtDate(ts) { const d = toDate(ts); return d ? d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '-'; }
function fmtTime(ts) { const d = toDate(ts); return d ? d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '-'; }
function fmtBoth(ts) { return toDate(ts) ? fmtDate(ts) + ', ' + fmtTime(ts) : 'Never'; }
function fmtAgo(ts) {
  const d = toDate(ts); if (!d) return '-';
  const s = Math.max(0, Math.round((Date.now() - d.getTime()) / 1000));
  if (s < 60) return s + 's ago';
  if (s < 3600) return Math.floor(s / 60) + 'm ago';
  if (s < 86400) return Math.floor(s / 3600) + 'h ago';
  return fmtDate(ts);
}
function profileUrl(id) { return location.origin + '/profile/' + encodeURIComponent(id); }
function normalizeUid(u) { return String(u == null ? '' : u).replace(/[\s:\-]/g, '').toUpperCase(); }
function validUid(u) { return /^[0-9A-F]{8,20}$/.test(u); }
function initials(name) { return String(name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join(''); }
function localMidnightISO() { const d = new Date(); d.setHours(0, 0, 0, 0); return d.toISOString(); }
function badge(status) {
  if (!status) return '<span class="badge none">NO CARD</span>';
  const good = status === 'ACTIVE' || status === 'GRANTED';
  return `<span class="badge ${good ? 'ok' : 'bad'}">${esc(status)}</span>`;
}

const ICONS = {
  nfc: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M6 8.5a7 7 0 0 1 0 7"/><path d="M9.5 6a11 11 0 0 1 0 12"/><path d="M13 3.5a15 15 0 0 1 0 17"/><circle cx="3" cy="12" r="1" fill="currentColor"/></svg>',
  id: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="11" r="2.2"/><path d="M5.8 16c.6-1.6 1.8-2.4 3.2-2.4s2.6.8 3.2 2.4M14.5 10h4M14.5 13h3"/></svg>',
  lock: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/><circle cx="12" cy="15.5" r="1.2" fill="currentColor"/></svg>',
  bolt: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"><path d="M13 3 5 13.5h6L10 21l8-10.5h-6L13 3Z"/></svg>',
  log: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M8 6h12M8 12h12M8 18h12"/><circle cx="4" cy="6" r=".8" fill="currentColor"/><circle cx="4" cy="12" r=".8" fill="currentColor"/><circle cx="4" cy="18" r=".8" fill="currentColor"/></svg>',
  shield: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"><path d="M12 3 4.5 6v5.5c0 4.6 3.1 8 7.5 9.5 4.4-1.5 7.5-4.9 7.5-9.5V6L12 3Z"/><path d="m9 12 2 2 4-4"/></svg>',
  scan: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M4 8V5.5A1.5 1.5 0 0 1 5.5 4H8M16 4h2.5A1.5 1.5 0 0 1 20 5.5V8M20 16v2.5a1.5 1.5 0 0 1-1.5 1.5H16M8 20H5.5A1.5 1.5 0 0 1 4 18.5V16M4 12h16"/></svg>',
  qr: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="4" y="4" width="6" height="6" rx="1"/><rect x="14" y="4" width="6" height="6" rx="1"/><rect x="4" y="14" width="6" height="6" rx="1"/><path d="M14 14h2v2h-2zM18 14h2M14 18h2M18 18h2v2M16 16h2v2"/></svg>',
  keyboard: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><rect x="3" y="6" width="18" height="12" rx="2"/><path d="M7 10h.01M11 10h.01M15 10h.01M7 14h10"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>',
  cross: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>',
  arrow: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
  edit: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"><path d="M4 20h4L19 9l-4-4L4 16v4Z"/><path d="m13.5 6.5 4 4"/></svg>',
  plus: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
  menu: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M4 7h16M4 12h16M4 17h16"/></svg>'
};

function toast(message, type) {
  let box = document.getElementById('toasts');
  if (!box) { box = document.createElement('div'); box.id = 'toasts'; box.setAttribute('role', 'status'); box.setAttribute('aria-live', 'polite'); document.body.appendChild(box); }
  const el = document.createElement('div');
  el.className = 'toast ' + (type || 'info');
  el.textContent = message;
  box.appendChild(el);
  setTimeout(() => el.remove(), 4200);
}

(function renderChrome() {
  document.querySelectorAll('[data-icon]').forEach((el) => { el.outerHTML = ICONS[el.dataset.icon] || ''; });
  const page = document.body.dataset.page;
  const links = [['index', '/', 'Home'], ['register', '/register.html', 'Register'], ['profile', '/profile.html', 'Profile'], ['students', '/students.html', 'Students'],
    ['admin', '/admin.html', 'Dashboard'], ['logs', '/access-logs.html', 'Access Logs']];
  const nav = document.getElementById('nav');
  if (nav) {
    nav.className = 'nav';
    nav.innerHTML = '<a class="brand" href="/" aria-label="Smart NFC Hostel home"><span class="brand-mark">' + ICONS.nfc + '</span>' +
      '<span class="brand-name">Smart <em>NFC</em> Hostel</span></a>' +
      '<button class="nav-toggle" type="button" aria-label="Toggle menu" aria-expanded="false">' + ICONS.menu + '</button>' +
      '<nav class="nav-links">' + links.map((l) => `<a href="${l[1]}" class="${l[0] === page ? 'active' : ''}">${l[2]}</a>`).join('') +
      `<a href="/scanner.html" class="cta ${page === 'scanner' ? 'active' : ''}">${ICONS.scan}Scanner</a></nav>`;
    const btn = nav.querySelector('.nav-toggle');
    btn.addEventListener('click', () => { const open = nav.classList.toggle('open'); btn.setAttribute('aria-expanded', String(open)); });
  }
  const foot = document.createElement('footer');
  foot.className = 'footer';
  foot.innerHTML = '<span><b>Smart NFC Hostel</b> &nbsp;Access + Digital Identity Card</span><span>One card. One identity. Secure access.</span>';
  document.body.appendChild(foot);
})();
