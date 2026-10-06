const form = document.getElementById('regForm');
const btn = document.getElementById('submitBtn');
const out = document.getElementById('result');
const readBtn = document.getElementById('readBtn');

// Mirrors the server-side rules so mistakes show inline before submitting.
const isUrl = (v) => { try { return ['http:', 'https:'].includes(new URL(v).protocol); } catch (e) { return false; } };
const RULES = {
  student_name: (v) => (v.length >= 2 && v.length <= 80) || 'Enter 2-80 characters',
  student_id: (v) => /^[A-Za-z0-9\-_/]{3,20}$/.test(v) || '3-20 letters, numbers, - _ or /',
  department: (v) => (v.length >= 2 && v.length <= 80) || 'Department is required',
  room_number: (v) => /^[A-Za-z0-9\-/ ]{1,10}$/.test(v) || 'Up to 10 letters or numbers',
  email: (v) => (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) && v.length <= 120) || 'Enter a valid email',
  card_uid: (v) => validUid(normalizeUid(v)) || '8-20 hexadecimal characters',
  linkedin: (v) => !v || isUrl(v) || 'Must start with https://',
  instagram: (v) => !v || isUrl(v) || 'Must start with https://'
};
function check(name) {
  const input = form.elements[name];
  const res = RULES[name](input.value.trim());
  const err = input.closest('.field').querySelector('.err');
  const ok = res === true;
  input.classList.toggle('invalid', !ok);
  input.setAttribute('aria-invalid', String(!ok));
  err.textContent = ok ? '' : res;
  return ok;
}
Object.keys(RULES).forEach((n) => {
  form.elements[n].addEventListener('blur', () => { if (form.elements[n].value) check(n); });
  form.elements[n].addEventListener('input', () => { if (form.elements[n].classList.contains('invalid')) check(n); });
});

const preset = new URLSearchParams(location.search).get('uid');
if (preset) form.elements.card_uid.value = normalizeUid(preset).slice(0, 20);

// Phones with Web NFC can read the UID straight from the card.
if ('NDEFReader' in window) {
  readBtn.hidden = false;
  readBtn.addEventListener('click', async () => {
    const ctrl = new AbortController();
    try {
      const reader = new NDEFReader();
      reader.onreading = (e) => {
        if (e.serialNumber) { form.elements.card_uid.value = normalizeUid(e.serialNumber); check('card_uid'); toast('Card UID captured', 'success'); }
        ctrl.abort(); readBtn.disabled = false;
      };
      await reader.scan({ signal: ctrl.signal });
      readBtn.disabled = true;
      toast('Hold the card to the back of your phone', 'info');
      setTimeout(() => { ctrl.abort(); readBtn.disabled = false; }, 20000);
    } catch (err) { toast('Could not start NFC: ' + (err.message || err.name), 'error'); readBtn.disabled = false; }
  });
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const bad = Object.keys(RULES).filter((n) => !check(n));
  if (bad.length) { form.elements[bad[0]].focus(); return; }
  const body = Object.fromEntries(new FormData(form).entries());
  Object.keys(body).forEach((k) => { body[k] = String(body[k]).trim(); });
  btn.disabled = true; btn.textContent = 'Registering...'; out.innerHTML = '';
  try {
    const data = await api('/register', { method: 'POST', body: JSON.stringify(body) });
    toast(data.message, 'success');
    out.innerHTML = `<div class="card success-card"><p class="eyebrow">Registration complete</p>
      <p>${esc(body.student_name)} is now a resident. Their User ID is</p><div class="big">${esc(data.user_id)}</div>
      <p class="mono" style="font-size:.85rem">Card ${esc(data.card_uid)} &middot; ACTIVE</p>
      <div class="actions" style="margin-top:18px"><a class="btn" href="${esc(profileUrl(data.user_id))}">View digital profile</a>
      <a class="btn alt" href="/scanner.html?mode=manual">Test on scanner</a></div></div>`;
    out.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    form.reset();
  } catch (err) {
    toast(err.message, 'error');
    out.innerHTML = `<div class="card success-card" style="border-color:#d0705a66"><p class="eyebrow" style="color:var(--clay)">Could not register</p><p>${esc(err.message)}</p></div>`;
  } finally {
    btn.disabled = false; btn.textContent = 'Register card';
  }
});
