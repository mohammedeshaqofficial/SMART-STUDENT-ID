const tbody = document.getElementById('rows');
const filter = document.getElementById('filter');
const repForm = document.getElementById('replaceForm');
const repUser = document.getElementById('rep-user');
let users = [];

async function loadStats() {
  const { data } = await api('/dashboard/stats?since=' + encodeURIComponent(localMidnightISO()));
  document.getElementById('s-users').textContent = data.total_users;
  document.getElementById('s-cards').textContent = data.authorized_cards;
  document.getElementById('s-scans').textContent = data.todays_scans;
  document.getElementById('s-denied').textContent = data.denied_attempts;
}

function renderUsers() {
  if (!users.length) {
    tbody.innerHTML = '<tr><td colspan="7"><div class="empty"><b>No residents yet</b><a href="/register.html">Register the first card</a> to get started.</div></td></tr>';
    return;
  }
  const q = filter.value.trim().toLowerCase();
  const list = q ? users.filter((u) => [u.student_name, u.user_id, u.room_number, u.card_uid, u.student_id, u.department].some((v) => String(v || '').toLowerCase().includes(q))) : users;
  if (!list.length) { tbody.innerHTML = '<tr><td colspan="7"><div class="empty">No residents match "' + esc(filter.value) + '".</div></td></tr>'; return; }
  tbody.innerHTML = list.map((u) => `<tr>
    <td><div class="who">${esc(u.student_name)}<small>${esc(u.department)}</small></div></td>
    <td class="mono">${esc(u.user_id)}</td><td>${esc(u.room_number)}</td><td class="mono">${esc(u.card_uid || '-')}</td>
    <td>${badge(u.card_status)}</td><td title="${esc(fmtBoth(u.last_access))}">${u.last_access ? esc(fmtAgo(u.last_access)) : '<span class="muted">Never</span>'}</td>
    <td><a class="btn sm alt" href="${esc(profileUrl(u.user_id))}">Profile</a>
    <button class="btn sm alt" data-act="edit" data-id="${esc(u.user_id)}">Edit</button>
    ${u.card_uid ? (u.card_status === 'ACTIVE'
      ? `<button class="btn sm danger" data-act="block" data-uid="${esc(u.card_uid)}" data-name="${esc(u.student_name)}">Block</button>`
      : `<button class="btn sm good" data-act="activate" data-uid="${esc(u.card_uid)}">Activate</button>`) : ''}</td></tr>`).join('');
}

async function loadUsers() {
  const { data } = await api('/users');
  users = data;
  renderUsers();
  const selected = repUser.value;
  repUser.innerHTML = '<option value="">Select a resident</option>' + users.map((u) => `<option value="${esc(u.user_id)}">${esc(u.student_name)} (${esc(u.user_id)}, room ${esc(u.room_number)})</option>`).join('');
  repUser.value = selected;
}

let refreshing = false;
async function refresh() {
  if (refreshing || document.hidden) return;
  refreshing = true;
  try { await Promise.all([loadStats(), loadUsers()]); }
  catch (err) { tbody.innerHTML = `<tr><td colspan="7"><div class="empty">${esc(err.message)}</div></td></tr>`; }
  finally { refreshing = false; }
}

filter.addEventListener('input', renderUsers);

tbody.addEventListener('click', async (e) => {
  const b = e.target.closest('button[data-act]');
  if (!b) return;
  if (b.dataset.act === 'edit') {
    const u = users.find((x) => x.user_id === b.dataset.id);
    if (!u) return;
    const fields = [
      ['student_name', 'Student name', u.student_name],
      ['student_id', 'Student ID', u.student_id],
      ['department', 'Department', u.department],
      ['room_number', 'Room number', u.room_number],
      ['email', 'Email', u.email],
      ['linkedin', 'LinkedIn URL', u.linkedin || ''],
      ['instagram', 'Instagram URL', u.instagram || '']
    ];
    const body = {};
    for (const [key, label, value] of fields) {
      const next = prompt(label + ':', value);
      if (next === null) return;
      body[key] = next.trim();
    }
    b.disabled = true;
    try {
      const d = await api('/users/' + encodeURIComponent(u.user_id), { method: 'PATCH', body: JSON.stringify(body) });
      toast(d.message, 'success');
      await refresh();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      b.disabled = false;
    }
    return;
  }
  if (b.dataset.act === 'block' && !confirm(`Block ${b.dataset.name}'s card ${b.dataset.uid}? It will stop opening doors immediately.`)) return;
  b.disabled = true;
  try {
    const d = await api(`/cards/${encodeURIComponent(b.dataset.uid)}/${b.dataset.act}`, { method: 'PATCH' });
    toast(d.message, 'success');
    await refresh();
  } catch (err) { toast(err.message, 'error'); b.disabled = false; }
});

repForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const err = document.getElementById('rep-err');
  const uidInput = document.getElementById('rep-uid');
  const uid = normalizeUid(uidInput.value);
  if (!repUser.value) { err.textContent = 'Choose a resident first.'; repUser.focus(); return; }
  if (!validUid(uid)) { err.textContent = 'Enter 8-20 hexadecimal characters.'; uidInput.classList.add('invalid'); uidInput.focus(); return; }
  err.textContent = ''; uidInput.classList.remove('invalid');
  const btn = document.getElementById('rep-btn');
  btn.disabled = true;
  try {
    const d = await api('/cards', { method: 'POST', body: JSON.stringify({ user_id: repUser.value, card_uid: uid }) });
    toast(d.message, 'success');
    repForm.reset();
    await refresh();
  } catch (e2) { err.textContent = e2.message; toast(e2.message, 'error'); }
  finally { btn.disabled = false; }
});

document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
refresh();
setInterval(refresh, 10000);
