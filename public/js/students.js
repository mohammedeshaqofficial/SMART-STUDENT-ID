// Student Data backend: full CRUD over student records. Every write goes through the API,
// and onDataChange() keeps this table (and every other open page) in step with the database.
const tbody = document.getElementById('rows');
const filter = document.getElementById('filter');
const countEl = document.getElementById('count');
const dlg = document.getElementById('editor');
const form = document.getElementById('edForm');
const edErr = document.getElementById('ed-err');
const saveBtn = document.getElementById('ed-save');
const FIELDS = ['student_name', 'student_id', 'department', 'room_number', 'email', 'linkedin', 'instagram'];
let students = [];
let stamps = new Map(); // user_id -> updated_at, to highlight rows changed since the last load
let editing = null;     // user_id being edited, or null when adding

function renderRows(changed) {
  if (!students.length) {
    tbody.innerHTML = '<tr><td colspan="7"><div class="empty"><b>No students yet</b>Use <em>Add student</em> to create the first record.</div></td></tr>';
    countEl.textContent = '';
    return;
  }
  const q = filter.value.trim().toLowerCase();
  const list = q ? students.filter((s) => [s.student_name, s.user_id, s.student_id, s.department, s.room_number, s.email, s.card_uid]
    .some((v) => String(v || '').toLowerCase().includes(q))) : students;
  countEl.textContent = list.length === students.length ? students.length + ' students' : list.length + ' of ' + students.length + ' students';
  if (!list.length) { tbody.innerHTML = '<tr><td colspan="7"><div class="empty">No students match "' + esc(filter.value) + '".</div></td></tr>'; return; }
  tbody.innerHTML = list.map((s) => `<tr class="${changed && changed.has(s.user_id) ? 'flash' : ''}">
    <td><div class="who">${esc(s.student_name)}<small>${esc(s.department)} &middot; ${esc(s.email)}</small></div></td>
    <td class="mono">${esc(s.user_id)}</td><td class="mono">${esc(s.student_id)}</td><td>${esc(s.room_number)}</td>
    <td>${badge(s.card_status)}</td>
    <td title="${esc(fmtBoth(s.updated_at))}">${esc(fmtAgo(s.updated_at))}</td>
    <td><button class="btn sm alt" data-act="edit" data-id="${esc(s.user_id)}">Edit</button>
      <a class="btn sm alt" href="${esc(profileUrl(s.user_id))}" target="_blank" rel="noopener">Profile</a>
      <button class="btn sm danger" data-act="delete" data-id="${esc(s.user_id)}">Delete</button></td></tr>`).join('');
}

let loading = false, reload = false;
async function load() {
  if (loading) { reload = true; return; }
  loading = true;
  try {
    const { data } = await api('/users');
    const changed = new Set();
    if (stamps.size) data.forEach((s) => { if (stamps.get(s.user_id) !== String(s.updated_at)) changed.add(s.user_id); });
    stamps = new Map(data.map((s) => [s.user_id, String(s.updated_at)]));
    students = data;
    renderRows(changed);
    // Someone else deleted the record that is open in the editor.
    if (editing && !students.some((s) => s.user_id === editing)) {
      closeEditor();
      toast('That student was removed elsewhere.', 'info');
    }
  } catch (err) {
    if (!students.length) tbody.innerHTML = `<tr><td colspan="7"><div class="empty">${esc(err.message)}</div></td></tr>`;
    else toast(err.message, 'error');
  } finally {
    loading = false;
    if (reload) { reload = false; load(); }
  }
}

function openEditor(student) {
  editing = student ? student.user_id : null;
  form.reset();
  edErr.textContent = '';
  form.querySelectorAll('.invalid').forEach((el) => el.classList.remove('invalid'));
  document.getElementById('ed-eyebrow').textContent = student ? student.user_id : 'New record';
  document.getElementById('ed-title').textContent = student ? 'Edit student' : 'Add a student';
  // A card is required when creating; card changes for existing students go through the dashboard.
  document.getElementById('uid-field').hidden = !!student;
  if (student) FIELDS.forEach((k) => { form.elements[k].value = student[k] || ''; });
  dlg.showModal();
  form.elements.student_name.focus();
}
function closeEditor() { editing = null; if (dlg.open) dlg.close(); }

function validate(body) {
  const bad = [];
  if (body.student_name.length < 2) bad.push(['student_name', 'Enter the student name (at least 2 characters).']);
  if (!/^[A-Za-z0-9\-_/]{3,20}$/.test(body.student_id)) bad.push(['student_id', 'Student ID must be 3-20 letters or numbers.']);
  if (body.department.length < 2) bad.push(['department', 'Enter the department.']);
  if (!/^[A-Za-z0-9\-/ ]{1,10}$/.test(body.room_number)) bad.push(['room_number', 'Enter a valid room number.']);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email)) bad.push(['email', 'Enter a valid email address.']);
  ['linkedin', 'instagram'].forEach((k) => { if (body[k] && !/^https?:\/\//i.test(body[k])) bad.push([k, 'Links must start with http:// or https://.']); });
  if ('card_uid' in body && !validUid(body.card_uid)) bad.push(['card_uid', 'Card UID must be 8-20 hexadecimal characters.']);
  return bad;
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const body = {};
  FIELDS.forEach((k) => { body[k] = form.elements[k].value.trim(); });
  if (!editing) body.card_uid = normalizeUid(form.elements.card_uid.value);
  form.querySelectorAll('.invalid').forEach((el) => el.classList.remove('invalid'));
  const bad = validate(body);
  if (bad.length) {
    bad.forEach(([k]) => form.elements[k].classList.add('invalid'));
    edErr.textContent = bad[0][1];
    form.elements[bad[0][0]].focus();
    return;
  }
  edErr.textContent = '';
  saveBtn.disabled = true;
  try {
    const d = editing
      ? await api('/users/' + encodeURIComponent(editing), { method: 'PATCH', body: JSON.stringify(body) })
      : await api('/register', { method: 'POST', body: JSON.stringify(body) });
    toast(editing ? d.message : `Student added as ${d.user_id}`, 'success');
    closeEditor();
    await load();
  } catch (err) {
    edErr.textContent = err.message;
  } finally { saveBtn.disabled = false; }
});

tbody.addEventListener('click', async (e) => {
  const b = e.target.closest('button[data-act]');
  if (!b) return;
  const s = students.find((x) => x.user_id === b.dataset.id);
  if (!s) return;
  if (b.dataset.act === 'edit') return openEditor(s);
  if (!confirm(`Delete ${s.student_name} (${s.user_id})? Their profile and cards are removed; access history is kept.`)) return;
  b.disabled = true;
  try {
    const d = await api('/users/' + encodeURIComponent(s.user_id), { method: 'DELETE' });
    toast(d.message, 'success');
    await load();
  } catch (err) { toast(err.message, 'error'); b.disabled = false; }
});

document.getElementById('add').addEventListener('click', () => openEditor(null));
dlg.addEventListener('click', (e) => { if (e.target === dlg || e.target.closest('[data-close]')) closeEditor(); });
dlg.addEventListener('close', () => { editing = null; });
filter.addEventListener('input', () => renderRows());

onDataChange(load);
// Deep link from the dashboard: /students.html?edit=USR001
load().then(() => {
  const id = String(new URLSearchParams(location.search).get('edit') || '').toUpperCase();
  const s = id && students.find((x) => x.user_id === id);
  if (s) openEditor(s);
});
