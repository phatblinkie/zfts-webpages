//--------------------------------------------------------------------
// ZFTS Ground Instance Monitor — v2
// Three ground instances: ZFTS-105, ZFTS-107, DOPS-P2
// Polling + stall detection + summary bar + collapsible sections
// + Completed Files modal (feeds from per-service JSON files)
//--------------------------------------------------------------------

// ============================================================
//  Instance configuration
//  apiBase    — nginx proxy location prefix (fetch targets)
//  jsonFile   — path to collector output file (completed modal)
// ============================================================
const INSTANCES = [
  { id: 'zfts105', label: 'ZFTS-105', apiBase: '/api/zfts105', jsonFile: '/transfers-105.json' },
  { id: 'zfts107', label: 'ZFTS-107', apiBase: '/api/zfts107', jsonFile: '/transfers-107.json' },
  { id: 'dopsp2',  label: 'DOPS-P2',  apiBase: '/api/dopsp2',  jsonFile: '/transfers-dops-p2.json' },
];

// ============================================================
//  Per-instance runtime state
// ============================================================
const state = {};
INSTANCES.forEach(inst => {
  state[inst.id] = {
    available:    false,
    pollInterval: 5000,
    pollTimer:    null,
    pingTimer:    null,
  };
});

// Per-file pending button actions — key: `${instId}_${fileID}`
const pendingActions = {};

// ============================================================
//  Utility functions
// ============================================================
function formatFileSize(bytes) {
  if (bytes >= 1e9) return (bytes / 1e9).toFixed(2) + ' GB';
  if (bytes >= 1e6) return (bytes / 1e6).toFixed(2) + ' MB';
  if (bytes >= 1e3) return (bytes / 1e3).toFixed(2) + ' KB';
  return bytes + ' B';
}

function getRateText(r) {
  if (r / 1e9 > 1) return (r / 1e9).toFixed(3) + ' GB/s';
  if (r / 1e6 > 1) return (r / 1e6).toFixed(3) + ' MB/s';
  if (r / 1e3 > 1) return (r / 1e3).toFixed(3) + ' KB/s';
  return r.toFixed(3) + ' B/s';
}

function getRemainingTime(e) {
  if (e.rate === 0) return '∞';
  const s = (e.file_size - e.bytes_received) / e.rate;
  const d = new Date(null);
  d.setSeconds(s);
  return d.toISOString().substr(11, 8);
}

function getInstById(id) {
  return INSTANCES.find(i => i.id === id);
}

// ============================================================
//  Health badge — updates section header + summary bar together
// ============================================================
function setHealth(id, st, txt) {
  ['health-', 'sumHealth-'].forEach(prefix => {
    const el = document.getElementById(prefix + id);
    if (!el) return;
    el.textContent = txt;
    el.className = 'health-badge ' + (
      st === 'ok'   ? 'health-ok'   :
      st === 'fail' ? 'health-fail' : 'health-idle'
    );
  });
}

// ============================================================
//  Summary bar helpers
// ============================================================
function updateSummaryPing(id, pingMs) {
  const el = document.getElementById('sumPing-' + id);
  if (el) el.textContent = pingMs != null ? pingMs + ' ms' : '—';
}

function updateSummaryQueue(id, count, platformName) {
  const qEl = document.getElementById('sumQueue-' + id);
  const pEl = document.getElementById('sumPlatform-' + id);
  if (qEl) qEl.textContent = count != null ? count + ' file' + (count !== 1 ? 's' : '') : '—';
  if (pEl) pEl.textContent = platformName || '—';
}

// ============================================================
//  Table error / clear helpers
// ============================================================
function showTableError(tableId, msg) {
  const t = document.getElementById(tableId);
  if (!t) return;
  const body = t.tBodies[0] || t.createTBody();
  body.innerHTML = '';
  const r = body.insertRow();
  const c = r.insertCell();
  c.colSpan = 9;
  c.textContent = msg;
  c.style.cssText = 'text-align:center;color:#c00;font-weight:bold;padding:10px;';
}

function clearTable(tableId, label) {
  const t = document.getElementById(tableId);
  if (!t) return;
  const body = t.tBodies[0] || t.createTBody();
  body.innerHTML = '';
  const r = body.insertRow();
  const c = r.insertCell();
  c.colSpan = 9;
  c.textContent = label + ' disconnected — no data';
  c.style.cssText = 'text-align:center;color:#777;font-style:italic;padding:10px;';
}

// ============================================================
//  Fetch + render (live queue)
// ============================================================
function fetchInstance(inst) {
  const url = inst.apiBase + '/files';
  fetch(url, { cache: 'no-store' })
    .then(async r => {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const raw = await r.json();
      const data = Array.isArray(raw) ? { status: raw } : raw;
      renderInstance(data, inst);
    })
    .catch(err => {
      console.warn(inst.label + ' fetch error:', err);
      showTableError('table-' + inst.id, inst.label + ' service unreachable');
      state[inst.id].available = false;
      setHealth(inst.id, 'fail', '🔴 Error');
      updateSummaryQueue(inst.id, 0, null);
      const qc = document.getElementById('qcount-' + inst.id);
      if (qc) qc.textContent = '0 files';
    });
}

function renderInstance(d, inst) {
  const tableId = 'table-' + inst.id;
  const t = document.getElementById(tableId);
  if (!t) return;

  const platformName = d.platform_name || null;
  const pl = document.getElementById('platform-' + inst.id);
  if (pl) pl.textContent = platformName ? 'Sending Platform: ' + platformName : '';

  if (!t.tHead) {
    const cols = [
      'FileID', 'File Name', 'State', 'Complete (%)',
      'Transfer Rate', 'Time Remaining', 'File Size', 'Priority', 'Actions'
    ];
    const thead = t.createTHead();
    const r = thead.insertRow();
    cols.forEach(c => {
      const th = document.createElement('th');
      th.textContent = c;
      r.appendChild(th);
    });
  }

  const queue = d.status || [];
  generateTable(t, queue, inst);

  const qc = document.getElementById('qcount-' + inst.id);
  if (qc) qc.textContent = queue.length + ' file' + (queue.length !== 1 ? 's' : '');

  updateSummaryQueue(inst.id, queue.length, platformName);
  state[inst.id].available = true;
  setHealth(inst.id, 'ok', '🟢 Active');
}

// ============================================================
//  Table generation
// ============================================================
function generateTable(table, data, inst) {
  const body = table.tBodies[0] || table.createTBody();
  body.innerHTML = '';

  if (!data || !data.length) {
    const row = body.insertRow();
    const cell = row.insertCell();
    cell.colSpan = 9;
    cell.textContent = 'No files currently in the transfer queue';
    cell.style.cssText = 'text-align:center;color:#666;font-style:italic;padding:10px;';
    return;
  }

  data.forEach(e => {
    const fid = e.fileID;
    const key = inst.id + '_' + fid;
    const row = body.insertRow();

    row.insertCell().textContent = fid;
    row.insertCell().textContent = e.file_name;

    const inProgress = Number(e.started) === 1;
    row.insertCell().textContent = inProgress ? 'Running' : 'Stopped';
    row.insertCell().textContent = e.percent_complete.toFixed(2) + ' %';
    row.insertCell().textContent = getRateText(
      typeof e.rate === 'object' ? parseFloat(e.rate.parsedValue || 0) : e.rate
    );
    row.insertCell().textContent = getRemainingTime(e);
    row.insertCell().textContent = formatFileSize(e.file_size);

    const priCell = row.insertCell();
    const sel = document.createElement('select');
    sel.id = inst.id + '_' + fid + '_priSelect';
    for (let i = 1; i <= 5; i++) {
      const o = document.createElement('option');
      o.value = i; o.text = i;
      if (i === e.priority) o.selected = true;
      sel.add(o);
    }
    if (!state[inst.id].available) { sel.disabled = true; sel.style.opacity = '0.5'; }
    sel.onchange = () => handlePriorityChange(e, inst);
    priCell.appendChild(sel);

    const action      = pendingActions[key];
    const isStarting   = action === 'starting';
    const isStopping   = action === 'stopping';
    const isCancelling = action === 'cancelling';

    const act = row.insertCell();
    const mk = (txt, dis) => {
      const b = document.createElement('button');
      b.textContent = txt; b.disabled = dis;
      b.onclick = () => handleAction(e, txt, inst, b);
      return b;
    };

    const startB = mk(isStarting ? 'Sending…' : 'Start', inProgress || isStarting);
    if (isStarting) startB.classList.add('sending');
    act.appendChild(startB);

    const stopB = mk(isStopping ? 'Stopping…' : 'Stop', !inProgress || isStopping);
    if (isStopping) stopB.classList.add('stopping');
    act.appendChild(stopB);

    const cancelB = mk(isCancelling ? 'Cancelling…' : 'Cancel', isCancelling);
    if (isCancelling) cancelB.classList.add('cancelling');
    act.appendChild(cancelB);

    if (isStarting  && inProgress)  delete pendingActions[key];
    if (isStopping  && !inProgress) delete pendingActions[key];
  });
}

// ============================================================
//  Polling
// ============================================================
function startUpdater(inst) {
  const s = state[inst.id];
  if (s.pollTimer) clearInterval(s.pollTimer);
  s.pollTimer = setInterval(() => fetchInstance(inst), s.pollInterval);
}

function setPoll(id, seconds) {
  const inst = getInstById(id);
  if (!inst) return;
  state[id].pollInterval = parseInt(seconds) * 1000;
  startUpdater(inst);
}

// ============================================================
//  Ping (every 10 s, independent of poll)
// ============================================================
function startPinger(inst) {
  const s = state[inst.id];
  if (s.pingTimer) clearInterval(s.pingTimer);
  let active = false;

  s.pingTimer = setInterval(async () => {
    if (active) return;
    active = true;
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), 8000);

    try {
      const t0 = performance.now();
      const r  = await fetch(inst.apiBase + '/files', { cache: 'no-store', signal: ctrl.signal });
      clearTimeout(to);
      const ms = Math.round(performance.now() - t0);
      if (!r.ok) throw new Error();

      const pingEl = document.getElementById('ping-' + inst.id);
      if (pingEl) pingEl.textContent = 'Ping: ' + ms + ' ms';
      updateSummaryPing(inst.id, ms);

      state[inst.id].available = true;
      setHealth(inst.id, 'ok', '🟢 Active');

    } catch {
      clearTimeout(to);
      const pingEl = document.getElementById('ping-' + inst.id);
      if (pingEl) pingEl.textContent = 'Ping: ❌';

      const sp = document.getElementById('sumPing-' + inst.id);
      if (sp) sp.textContent = '❌';

      state[inst.id].available = false;
      setHealth(inst.id, 'fail', '🔴 Error');
      clearTable('table-' + inst.id, inst.label);
      updateSummaryQueue(inst.id, 0, null);
      const qc = document.getElementById('qcount-' + inst.id);
      if (qc) qc.textContent = '0 files';

    } finally {
      active = false;
    }
  }, 10000);
}

// ============================================================
//  Actions — Start / Stop / Cancel
// ============================================================
async function handleAction(e, action, inst, btn) {
  if (!state[inst.id].available) {
    alert(inst.label + ' service not available.');
    return;
  }

  const fid = e.fileID;
  const key = inst.id + '_' + fid;
  const url = inst.apiBase + '/files/' + fid;

  const priSel = document.getElementById(inst.id + '_' + fid + '_priSelect');
  const p = priSel ? parseInt(priSel.value) : e.priority;

  const payload =
    action === 'Start'  ? { started: 'true',  priority: p }      :
    action === 'Stop'   ? { started: 'false',  cancel: 'false' } :
                          { started: 'false',  cancel: 'true'  };

  pendingActions[key] = action.toLowerCase() + 'ing';
  btn.classList.remove('sending', 'stopping', 'cancelling');
  btn.classList.add(
    action === 'Start' ? 'sending' :
    action === 'Stop'  ? 'stopping' : 'cancelling'
  );
  btn.disabled = true;
  btn.textContent =
    action === 'Start'  ? 'Sending…'  :
    action === 'Stop'   ? 'Stopping…' : 'Cancelling…';

  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    console.warn(inst.label + ' ' + action + ' failed:', err);
  }
}

// ============================================================
//  Priority change
// ============================================================
async function handlePriorityChange(e, inst) {
  const url = inst.apiBase + '/files/' + e.fileID;
  const s   = document.getElementById(inst.id + '_' + e.fileID + '_priSelect');
  const p   = parseInt(s.value);
  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ started: 'true', priority: p }),
    });
  } catch (err) {
    console.warn(inst.label + ' priority change failed:', err);
  }
}

// ============================================================
//  Completed Files Modal
// ============================================================
let _modalInstId   = null;   // which instance is currently open
let _modalInstLabel = null;
let _modalAllRows  = [];     // full dataset for search filtering

function openCompletedModal(instId, label) {
  _modalInstId    = instId;
  _modalInstLabel = label;

  const modal = document.getElementById('completedModal');
  document.getElementById('modalTitle').textContent = label + ' — Completed Transfers';
  document.getElementById('modalSearch').value = '';
  document.getElementById('modalCount').textContent = '';
  _setModalLoading();
  modal.classList.add('open');

  // Focus search box after animation
  setTimeout(() => document.getElementById('modalSearch').focus(), 80);

  _loadModalData();
}

function _setModalLoading() {
  const body = document.getElementById('modalBody');
  body.innerHTML = '';
  const r = body.insertRow();
  const c = r.insertCell();
  c.colSpan = 5;
  c.textContent = 'Loading…';
  c.style.cssText = 'text-align:center;padding:24px;color:#888;font-style:italic;';
}

function _loadModalData() {
  const inst = getInstById(_modalInstId);
  if (!inst) return;

  fetch(inst.jsonFile + '?_=' + Date.now(), { cache: 'no-store' })
    .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
    .then(data => {
      _modalAllRows = data.completed || [];
      _renderModalTable(_modalAllRows);
    })
    .catch(err => {
      console.warn('Completed fetch error:', err);
      const body = document.getElementById('modalBody');
      body.innerHTML = '';
      const r = body.insertRow();
      const c = r.insertCell();
      c.colSpan = 5;
      c.textContent = 'Could not load completed transfer data — collector may not be running yet.';
      c.style.cssText = 'text-align:center;padding:24px;color:#c00;';
      document.getElementById('modalCount').textContent = '';
    });
}

function refreshModal() {
  document.getElementById('modalSearch').value = '';
  _setModalLoading();
  _loadModalData();
}

function closeModal() {
  document.getElementById('completedModal').classList.remove('open');
  _modalAllRows  = [];
  _modalInstId   = null;
  _modalInstLabel = null;
}

function closeModalOnBackdrop(evt) {
  if (evt.target === document.getElementById('completedModal')) closeModal();
}

// Escape key closes modal
document.addEventListener('keydown', evt => {
  if (evt.key === 'Escape') closeModal();
});

// Live search filter
function filterModal() {
  const q = document.getElementById('modalSearch').value.toLowerCase().trim();
  const filtered = q
    ? _modalAllRows.filter(row => (row.file || '').toLowerCase().includes(q))
    : _modalAllRows;
  _renderModalTable(filtered, q ? _modalAllRows.length : null);
}

function _renderModalTable(rows, totalCount) {
  const body    = document.getElementById('modalBody');
  const countEl = document.getElementById('modalCount');
  body.innerHTML = '';

  if (!rows || !rows.length) {
    const r = body.insertRow();
    const c = r.insertCell();
    c.colSpan = 5;
    c.textContent = totalCount != null
      ? 'No results match your search.'
      : 'No completed transfers recorded yet.';
    c.style.cssText = 'text-align:center;padding:24px;color:#888;font-style:italic;';
    countEl.textContent = '';
    return;
  }

  rows.forEach(entry => {
    const r = body.insertRow();
    r.insertCell().textContent = entry.file || '—';

    const sizeCell = r.insertCell();
    sizeCell.className = 'col-size';
    sizeCell.textContent = entry.size ? formatFileSize(entry.size) : '—';

    const durCell = r.insertCell();
    durCell.className = 'col-dur';
    durCell.textContent = _formatDuration(entry.duration);

    const spdCell = r.insertCell();
    spdCell.className = 'col-speed';
    spdCell.textContent = entry.speed_kbps ? entry.speed_kbps.toLocaleString() + ' kbps' : '—';

    const tsCell = r.insertCell();
    tsCell.className = 'col-time';
    tsCell.textContent = _formatTimestamp(entry.completed_at);
  });

  if (totalCount != null) {
    countEl.textContent = 'Showing ' + rows.length + ' of ' + totalCount + ' results';
  } else {
    countEl.textContent = rows.length + ' record' + (rows.length !== 1 ? 's' : '');
  }
}

function _formatDuration(seconds) {
  if (!seconds && seconds !== 0) return '—';
  if (seconds < 60) return seconds.toFixed(1) + 's';
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60).toString().padStart(2, '0');
  if (m < 60) return m + 'm ' + s + 's';
  const h = Math.floor(m / 60);
  const rm = (m % 60).toString().padStart(2, '0');
  return h + 'h ' + rm + 'm ' + s + 's';
}

function _formatTimestamp(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

// ============================================================
//  User info (CAC / PKI CN display)
// ============================================================
function loadUserInfo() {
  fetch('/userinfo', { cache: 'no-store' })
    .then(r => { if (!r.ok) throw new Error(); return r.json(); })
    .then(u => {
      const un = document.getElementById('username');
      let clean = u.cn || '';
      clean = clean.replace(/\.\d+$/, '');
      const parts = clean.split('.').filter(p => p && !/^\d+$/.test(p));
      let disp = clean;
      if (parts.length >= 2) {
        const first = parts[1], last = parts[0];
        disp =
          first.charAt(0).toUpperCase() + first.slice(1).toLowerCase() + ' ' +
          last.charAt(0).toUpperCase()  + last.slice(1).toLowerCase();
      }
      if (un) { un.textContent = disp || 'Unknown User'; un.title = u.dn || ''; }
    })
    .catch(() => {
      const un = document.getElementById('username');
      if (un) un.textContent = 'Unknown User';
    });
}

// ============================================================
//  Startup
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
  loadUserInfo();
  INSTANCES.forEach(inst => {
    fetchInstance(inst);
    startUpdater(inst);
    startPinger(inst);
  });
});

