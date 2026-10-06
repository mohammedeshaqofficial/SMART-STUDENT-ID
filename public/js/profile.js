const view = document.getElementById('view');

function currentId() {
  const m = location.pathname.match(/\/profile\/([A-Za-z0-9]+)/);
  return (m && m[1]) || new URLSearchParams(location.search).get('id') || '';
}
function safeLink(url, label) {
  return /^https?:\/\//i.test(url || '') ? `<a class="btn alt" target="_blank" rel="noopener noreferrer" href="${esc(url)}">${label}</a>` : '';
}

function renderFinder(message) {
  view.innerHTML = `<div class="page-head"><div><p class="eyebrow">Digital identity</p><h1>Find a <em>profile</em></h1>
    <p class="sub">Every resident has a shareable profile linked to their NFC card. Enter a User ID to open it.</p></div></div>
    <form id="find" class="card" style="max-width:520px" novalidate><div class="field"><label for="uid">User ID</label>
    <div class="input-group"><input id="uid" class="mono" placeholder="USR001" autocomplete="off" spellcheck="false" maxlength="12"><button class="btn" type="submit">Open profile</button></div>
    <div class="err" id="find-err">${message ? esc(message) : ''}</div></div>
    <p style="font-size:.85rem">Or scan a resident's QR code on the <a href="/scanner.html?mode=qr">scanner</a>.</p></form>`;
  const input = document.getElementById('uid');
  input.focus();
  document.getElementById('find').addEventListener('submit', (e) => {
    e.preventDefault();
    const id = input.value.trim().toUpperCase();
    if (!/^USR\d{3,}$/.test(id)) { input.classList.add('invalid'); document.getElementById('find-err').textContent = 'User IDs look like USR001.'; return; }
    location.href = profileUrl(id);
  });
}

async function load() {
  const id = currentId().toUpperCase();
  if (!id) return renderFinder();
  view.innerHTML = `<div class="idcard"><div class="main"><span class="skel" style="width:64px;height:64px;border-radius:50%;margin-bottom:22px"></span>
    <span class="skel" style="width:60%;height:34px;margin-bottom:12px"></span><span class="skel" style="width:35%;height:16px;margin-bottom:34px"></span>
    <span class="skel" style="width:80%;margin-bottom:14px"></span><span class="skel" style="width:70%;margin-bottom:14px"></span><span class="skel" style="width:50%"></span></div>
    <div class="side"><span class="skel" style="width:194px;height:194px;border-radius:14px"></span></div></div>`;
  try {
    const { data: p } = await api('/profile/' + encodeURIComponent(id));
    document.title = p.student_name + ' — Smart NFC Hostel Access';
    view.innerHTML = `<div class="page-head reveal"><div><p class="eyebrow">Verified resident</p></div>
      <div class="actions"><button class="btn alt sm" type="button" id="copy">Copy link</button><a class="btn alt sm" href="/profile.html">Find another</a></div></div>
      <article class="idcard reveal d1"><div class="main">
        <div class="avatar" aria-hidden="true">${esc(initials(p.student_name))}</div>
        <h1>${esc(p.student_name)}</h1><div class="dept">${esc(p.department)}</div>
        <div class="kv-grid">
          <div><span>User ID</span><b class="mono">${esc(p.user_id)}</b></div>
          <div><span>Student ID</span><b class="mono">${esc(p.student_id)}</b></div>
          <div><span>Room</span><b>${esc(p.room_number)}</b></div>
          <div><span>Card status</span>${badge(p.card_status)}</div>
          <div><span>Email</span><b>${esc(p.email)}</b></div>
          <div><span>Resident since</span><b>${esc(fmtDate(p.created_at))}</b></div>
        </div>
        <div class="actions"><a class="btn" href="mailto:${esc(p.email)}">Contact</a>${safeLink(p.linkedin, 'LinkedIn')}${safeLink(p.instagram, 'Instagram')}</div>
      </div>
      <div class="side"><div class="qr-box" id="qrcode" role="img" aria-label="QR code linking to this profile"></div>
        <p class="eyebrow" style="margin:6px 0 0">Live QR &middot; scan to verify</p>
        <p class="muted qr-timer" id="qr-timer">Generating code&hellip;</p>
        <div class="qr-progress" aria-hidden="true"><i id="qr-bar"></i></div></div></article>`;
    startLiveQr(p.user_id);
    document.getElementById('copy').addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(profileUrl(p.user_id)); toast('Profile link copied', 'success'); }
      catch (e) { toast(profileUrl(p.user_id), 'info'); }
    });
  } catch (err) {
    renderFinder(err.message);
  }
}

// Dynamic QR: a fresh short-lived token every few seconds, so a screenshot of the code stops working.
const live = { qr: null, timer: null, tick: null, userId: '', until: 0, total: 20 };
function drawQr(text) {
  const el = document.getElementById('qrcode');
  if (!el) return;
  if (!window.QRCode) { el.style.cssText = 'line-height:1.4;padding:20px;color:#0f1412;max-width:194px'; el.textContent = 'QR code unavailable. Share the link instead.'; return; }
  if (!live.qr) live.qr = new QRCode(el, { text, width: 170, height: 170, colorDark: '#0f1412', colorLight: '#ece6d8', correctLevel: QRCode.CorrectLevel.M });
  else { live.qr.clear(); live.qr.makeCode(text); }
}
function showCountdown() {
  const label = document.getElementById('qr-timer');
  const bar = document.getElementById('qr-bar');
  if (!label) return clearInterval(live.tick);
  const left = Math.max(0, Math.ceil((live.until - Date.now()) / 1000));
  label.textContent = 'New code in ' + left + 's';
  if (bar) bar.style.transform = 'scaleX(' + Math.max(0, (live.until - Date.now()) / (live.total * 1000)) + ')';
}
async function refreshQr() {
  clearTimeout(live.timer);
  if (document.hidden) return;
  try {
    const d = await api('/qr-token', { method: 'POST', body: JSON.stringify({ user_id: live.userId }) });
    drawQr(profileUrl(live.userId) + '?t=' + encodeURIComponent(d.token));
    live.total = d.refresh_in || 20;
    live.until = Date.now() + live.total * 1000;
    document.getElementById('qrcode')?.classList.remove('stale');
    showCountdown();
    live.timer = setTimeout(refreshQr, live.total * 1000);
  } catch (err) {
    // Keep a usable code on screen; the scanner still recognises the plain profile link.
    if (!live.qr) drawQr(profileUrl(live.userId));
    document.getElementById('qrcode')?.classList.add('stale');
    const label = document.getElementById('qr-timer'); if (label) label.textContent = 'Live code unavailable, retrying...';
    live.timer = setTimeout(refreshQr, 5000);
  }
}
function startLiveQr(userId) {
  live.userId = userId;
  clearInterval(live.tick);
  live.tick = setInterval(showCountdown, 250);
  refreshQr();
}
document.addEventListener('visibilitychange', () => { if (!document.hidden && live.userId) refreshQr(); });

load();
