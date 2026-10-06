const tbody = document.getElementById('rows');
const statusSel = document.getElementById('status');
const search = document.getElementById('q');
const countEl = document.getElementById('count');
const SOURCE_LABEL = { READER: 'Door reader', WEB_NFC: 'Phone NFC', MANUAL: 'Front desk', QR: 'Profile QR' };
let rows = [];
let seq = 0;

async function load() {
  if (document.hidden) return;
  const params = new URLSearchParams();
  if (statusSel.value) params.set('status', statusSel.value);
  if (search.value.trim()) params.set('q', search.value.trim());
  const mine = ++seq;
  try {
    const { data } = await api('/access-logs?' + params.toString());
    if (mine !== seq) return; // a newer search is in flight
    rows = data;
    countEl.textContent = data.length + (data.length === 1 ? ' event' : ' events');
    if (!data.length) {
      tbody.innerHTML = `<tr><td colspan="9"><div class="empty"><b>No events found</b>${params.toString() ? 'Try a different search or filter.' : 'Taps from the reader or scanner will appear here.'}</div></td></tr>`;
      return;
    }
    tbody.innerHTML = data.map((l) => `<tr><td><span class="who">${l.student_name ? esc(l.student_name) : '<span class="muted">Unknown card</span>'}</span></td>
      <td class="mono">${esc(l.user_id || '-')}</td><td class="mono">${esc(l.card_uid || '-')}</td><td>${esc(l.room_number || '-')}</td>
      <td>${badge(l.status)}</td><td>${esc(l.reason || '-')}</td><td><span class="tag-src">${esc(SOURCE_LABEL[l.source] || l.source || '-')}</span></td>
      <td>${esc(fmtDate(l.timestamp))}</td><td class="mono">${esc(fmtTime(l.timestamp))}</td></tr>`).join('');
  } catch (err) {
    if (mine !== seq) return;
    tbody.innerHTML = `<tr><td colspan="9"><div class="empty">${esc(err.message)}</div></td></tr>`;
  }
}

function exportCsv() {
  if (!rows.length) { toast('Nothing to export yet.', 'info'); return; }
  const cell = (v) => {
    let s = String(v == null ? '' : v);
    if (/^[=+\-@]/.test(s)) s = "'" + s; // block spreadsheet formula injection
    return '"' + s.replace(/"/g, '""') + '"';
  };
  const head = ['Resident', 'User ID', 'Card UID', 'Room', 'Result', 'Reason', 'Source', 'Timestamp'];
  const lines = rows.map((l) => [l.student_name || 'Unknown', l.user_id, l.card_uid, l.room_number, l.status, l.reason, SOURCE_LABEL[l.source] || l.source, l.timestamp].map(cell).join(','));
  const blob = new Blob([[head.map(cell).join(','), ...lines].join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'access-logs-' + new Date().toISOString().slice(0, 10) + '.csv';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

statusSel.addEventListener('change', load);
search.addEventListener('input', () => { clearTimeout(search._t); search._t = setTimeout(load, 300); });
document.getElementById('refresh').addEventListener('click', load);
document.getElementById('export').addEventListener('click', exportCsv);
document.addEventListener('visibilitychange', load);
load();
setInterval(load, 5000);
