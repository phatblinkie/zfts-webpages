/* =====================================================================
   ZFTS Admin Interface – App.js (Section 1 of 3)
   Initialization, Theme, Login, Dashboard Setup
   Tail columns: 83, 89, 105, 107
===================================================================== */
let pendingAction = null;
let isAuthenticated = false;
let csrfToken = null;
let loginCompleted = false;
let loginRequestId = 0;

const logAutoTimers = {};   // service → timer handle
const POLL_INTERVAL = 10000; // 10 seconds
const TAILS = ["83", "89", "105", "107"];
const SERVICES = [
  "zfts-83", "zcompd-83",
  "zfts-89", "zcompd-89",
  "zfts-105","zcompd-105",
  "zfts-107","zcompd-107"
];

/* ================= MODAL SYSTEM ================= */
function disableLogin(seconds) {
  const input = document.getElementById("loginPassword");
  const btn = document.querySelector("#loginBox button");

  if (!input || !btn) return;

  const originalText = btn.textContent;

  input.disabled = true;
  btn.disabled = true;

  let remaining = seconds;

  const interval = setInterval(() => {
    remaining--;

    if (remaining <= 0) {
      clearInterval(interval);
      input.disabled = false;
      btn.disabled = false;
      btn.textContent = originalText; // ✅ restore text
      return;
    }

    btn.textContent = `Wait (${remaining}s)`;

  }, 1000);
}

function showMessage(msg) {
  // ✅ block ALL stale login-related messages after success
  if (loginCompleted) return;

  const modal = document.getElementById("globalModal");
  const text = document.getElementById("modalText");
  const btns = document.getElementById("modalButtons");

  if (!modal || !text || !btns) return;

  text.textContent = msg;

  btns.innerHTML = "";
  const okBtn = document.createElement("button");
  okBtn.textContent = "OK";
  okBtn.onclick = closeModal;

  btns.appendChild(okBtn);

  modal.classList.remove("hidden");
}

function showConfirm(msg) {
  return new Promise(resolve => {
    const modal = document.getElementById("globalModal");

    // ✅ prevent stacking
    if (!modal.classList.contains("hidden")) {
      resolve(false);
      return;
    }

    const text = document.getElementById("modalText");
    const btns = document.getElementById("modalButtons");

    if (!modal || !text || !btns) {
      resolve(false);
      return;
    }

    text.textContent = msg;
    btns.innerHTML = "";

    const yesBtn = document.createElement("button");
    yesBtn.textContent = "Yes";

    const cancelBtn = document.createElement("button");
    cancelBtn.textContent = "Cancel";

    yesBtn.onclick = () => {
      closeModal();
      resolve(true);
    };

    cancelBtn.onclick = () => {
      closeModal();
      resolve(false);
    };

    btns.appendChild(yesBtn);
    btns.appendChild(cancelBtn);

    modal.classList.remove("hidden");
  });
}

function closeModal() {
  const modal = document.getElementById("globalModal");
  if (modal) modal.classList.add("hidden");
}

/* ---------------- Logout options ---------------- */
function updateAuthIndicator(isAuth) {
  isAuthenticated = isAuth;

  const el = document.getElementById("authIndicator");
  const btn = document.getElementById("authBtn");
  const pwBtn = document.getElementById("changePwBtn"); // ✅ NEW

  if (isAuth) {
    el.textContent = "🔓 Authenticated";
    el.style.color = "green";

    if (btn) btn.textContent = "Logout";
    if (pwBtn) pwBtn.classList.remove("hidden");   // ✅ SHOW

  } else {
    el.textContent = "🔒 Not Authenticated";
    el.style.color = "red";

    if (btn) btn.textContent = "Login";
    if (pwBtn) pwBtn.classList.add("hidden");      // ✅ HIDE
  }

  updateButtonStates();
}



function updateButtonStates() {
  const buttons = document.querySelectorAll(".svc-btn");
  // console.log("Found buttons:", buttons.length);

  buttons.forEach(btn => {
    if (isAuthenticated) {
      btn.disabled = false;
      btn.classList.remove("disabled");
    } else {
      btn.disabled = true;
      btn.classList.add("disabled");
    }
  });
}


/* ---------------- change pw ---------------- */
function openPassword() {
    if (!isAuthenticated) {
    requireLogin();
    return;
  }
  const el = document.getElementById("passwordSection");
  if (!el) return;
  el.classList.remove("hidden");
  el.scrollIntoView({ behavior: "smooth" });
}


function togglePassword() {
  const el = document.getElementById("passwordSection");
  if (!el) return;
  el.classList.toggle("hidden");
}

async function changePassword() {
  const current = document.getElementById("currentPassword").value;
  const nw = document.getElementById("newPassword").value;
  const confirm = document.getElementById("confirmPassword").value;

  if (!current || !nw || !confirm) {
    showMessage("All fields are required");
    return;
  }

  if (nw !== confirm) {
    showMessage("New passwords do not match");
    return;
  }

  try {
    const resp = await apiFetch("api/change_password.php", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body:
        `current_password=${encodeURIComponent(current)}` +
        `&new_password=${encodeURIComponent(nw)}` +
        `&confirm_password=${encodeURIComponent(confirm)}`
    });

    const js = await resp.json();

    if (js.ok) {
      showMessage("Password updated successfully");

      // clear fields
      document.getElementById("currentPassword").value = "";
      document.getElementById("newPassword").value = "";
      document.getElementById("confirmPassword").value = "";

      togglePassword();
    } else {
      showMessage(js.err || "Password update failed");
    }

  } catch (e) {
    console.error(e);
    showMessage("Request failed");
  }
}

/* ---------------- API wrapper ---------------- */
async function apiFetch(url, opts = {}) {
  opts.headers = opts.headers || {};

  // ✅ ensure CSRF token exists BEFORE request
  if (!csrfToken) {
    await checkAuth();
  }

  if (!csrfToken) {
    showMessage("Session expired. Please log in again.");
    requireLogin();
    throw new Error("Missing CSRF token");
  }

  opts.headers["X-CSRF-Token"] = csrfToken;

  const resp = await fetch(url, {
    credentials: "include",
    ...opts
  });

  if (resp.status === 401) {
    pendingAction = { url, opts };
    requireLogin();
    throw new Error("Not authenticated");
  }

  return resp;
}
/* -------------------------------------------------------------------
   Theme Toggle & Persistence
------------------------------------------------------------------- */
function setTheme(dark) {
  const btn = document.getElementById("themeToggle");
  if (dark) {
    document.body.classList.add("dark");
    localStorage.setItem("theme", "dark");
    btn.textContent = "☀️ Light Mode";
  } else {
    document.body.classList.remove("dark");
    localStorage.setItem("theme", "light");
    btn.textContent = "🌙 Dark Mode";
  }
}
function toggleTheme() {
  setTheme(!document.body.classList.contains("dark"));
}

/* -------------------------------------------------------------------
   Login Dialog
------------------------------------------------------------------- */




function requireLogin() {
  loginCompleted = false; // ✅ reset state

  const box = document.getElementById("loginBox");
  box.classList.remove("hidden");

  const input = document.getElementById("loginPassword");
  input.value = "";
  input.focus();
}



async function submitLogin() {
  const input = document.getElementById("loginPassword");
  const btn = document.querySelector("#loginBox button");

  if (!input || !btn) return;
  if (btn.disabled) return;

  const pw = input.value;
  const requestId = ++loginRequestId;

  btn.disabled = true;
  input.disabled = true;

  try {
    const resp = await fetch("api/login.php", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: `password=${encodeURIComponent(pw)}`,
      credentials: "include"
    });

    const text = await resp.text();

    let js;
    try {
      js = JSON.parse(text);
    } catch {
      if (requestId !== loginRequestId) return;

      showMessage("Invalid server response");
      btn.disabled = false;
      input.disabled = false;
      return;
    }

    if (requestId !== loginRequestId) return;

    if (js.ok) {
      loginCompleted = true;

      closeModal(); // ✅ clear stale messages

      document.getElementById("loginBox").classList.add("hidden");

      // ✅ CRITICAL: refresh CSRF token immediately
      await checkAuth();

      if (!csrfToken) {
        showMessage("Session error. Please refresh.");
        return;
      }

      updateAuthIndicator(true);
      return;
    }

    if (js.err === "Too many attempts") {
      const wait = js.retry_after || 10;

      showMessage(
        js.retry_after
          ? `Too many login attempts.\nTry again in ${wait} seconds.`
          : "Too many login attempts. Please wait before trying again."
      );

      disableLogin(wait);
      return;
    }

    showMessage(js.err || "Login failed");

  } catch (e) {
    if (requestId !== loginRequestId) return;

    console.error("FETCH ERROR:", e);
    showMessage("Login error");
  }

  if (requestId === loginRequestId) {
    btn.disabled = false;
    input.disabled = false;
  }
}
/* -------------------------------------------------------------------
   Dynamic Dashboard Table (columns per tail number)
------------------------------------------------------------------- */
function buildDashboard() {
  const container = document.getElementById("services");
  const section = document.createElement("section");
  section.classList.add("section");

  let html = `<h2>Service Controls</h2>
  <table id="tailDashboard" class="tailDashboard">
  <thead><tr>`;
  TAILS.forEach(t => {
    html += `<th class="tailHeader">TAIL&nbsp;${t}</th>`;
  });
  html += `</tr></thead><tbody>`;

  /* ---- Status Row ---- */
  html += `<tr id="statusRow">`;
  TAILS.forEach(t => {
    html += `<td id="tail-${t}-status">Loading…</td>`;
  });
  html += `</tr>`;

  /* ---- Manage Buttons Row ---- */
  html += `<tr id="manageRow">`;
  TAILS.forEach(t => {
    const zn = `zfts-${t}`, cn = `zcompd-${t}`;
    html += `<td>
      <button class="svc-btn" onclick="serviceAction('${zn}','start')">Start ZFTS</button>
      <button class="svc-btn" onclick="serviceAction('${zn}','stop')">Stop</button><br>
      <button class="svc-btn" onclick="serviceAction('${cn}','start')">Start ZCOMPD</button>
      <button class="svc-btn" onclick="serviceAction('${cn}','stop')">Stop</button>
    </td>`;
  });
  html += `</tr>`;

  /* ---- Log Buttons Row ---- */
  html += `<tr id="logRow">`;
  TAILS.forEach(t => {
    html += `<td>
      <button onclick="toggleLogs('zfts-${t}')">Logs ZFTS</button>
      <button onclick="toggleLogs('zcompd-${t}')">Logs ZCOMPD</button>
    </td>`;
  });
  html += `</tr>`;

  /* ---- Config Buttons Row ---- */
  html += `<tr id="cfgRow">`;
  TAILS.forEach(t => {
    html += `<td>
      <button class="svc-btn" onclick="openConfig('${t}')">View Config</button>
    </td>`;
  });
  html += `</tr>`;

  html += `</tbody></table>`;
  section.innerHTML = html;
  container.innerHTML = "";
  container.appendChild(section);
}

/* -------------------------------------------------------------------
   Placeholder for Config View – hooks into editor panel later
------------------------------------------------------------------- */
/* -------------------------------------------------------------------
   Load available config files for the Config Editor
------------------------------------------------------------------- */
/* -------------------------------------------------------------------
   Populate Config‑File Dropdown on Startup
------------------------------------------------------------------- */
async function loadConfigList() {
  try {
    const resp = await fetch("api/config.php");
    const data = await resp.json();
    const sel = document.getElementById("cfgFile");
    if (!sel) return;
    sel.innerHTML = "";

    if (data.ok && Array.isArray(data.files)) {
      data.files.forEach(f => {
        const opt = document.createElement("option");
        opt.value = f;
        opt.text = f;
        sel.appendChild(opt);
      });
    } else {
      const opt = document.createElement("option");
      opt.text = "(no configs found)";
      sel.appendChild(opt);
    }
  } catch (e) {
    console.error("Failed to load config list", e);
  }
}

function handleAuthClick() {
  if (isAuthenticated) {
    logout();
  } else {
    requireLogin();
  }
}



async function checkAuth() {
  try {
    const resp = await fetch("api/auth_check.php", {
      credentials: "include"
    });
    const js = await resp.json();

    updateAuthIndicator(js.authenticated);

    csrfToken = js.csrf_token; // store CSRF token for later use

  } catch {
    updateAuthIndicator(false);
  }
}

async function logout() {
  await fetch("api/logout.php", {
    credentials: "include"
  });

  // reset state
  pendingAction = null;

  // update UI
  updateAuthIndicator(false);

  // hide config editor if open
  document.getElementById("configEditor").classList.add("hidden");
  document.getElementById("passwordSection")?.classList.add("hidden");
  showMessage("Logged out");
}

function toggleConfig() {
  const editor = document.getElementById("configEditor");
  if (!editor) return;

  editor.classList.toggle("hidden");
}

function openConfig(tail) {
  const editor = document.getElementById("configEditor");
  if (!editor) return;

  // ✅ SHOW the config editor
  editor.classList.remove("hidden");

  const sel = document.getElementById("cfgFile");
  if (!sel) return showMessage("Configuration editor not loaded.");

  const match = Array.from(sel.options)
    .find(o => o.value.includes(`_${tail}`));

  if (match) {
    sel.value = match.value;
    loadConfigFile();

    // scroll into view AFTER showing
    editor.scrollIntoView({ behavior: "smooth" });
  } else {
    showMessage(`No config found for tail ${tail}`);
  }
}


/* =====================================================================
   ZFTS Admin Interface – App.js (Section 2 of 3)
   Service Control, Status Polling, and Log Windows
===================================================================== */

/* -------------------------------------------------------------------
   Service Control Actions – start / stop / restart
------------------------------------------------------------------- */
async function serviceAction(service, action) {
  const ok = await showConfirm(`Are you sure you want to ${action} ${service}?`);
  if (!ok) return;

  try {
    const resp = await apiFetch("api/control.php", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `service=${service}&action=${action}`
    });

    const js = await resp.json();

    if (!js.ok) {
      showMessage(js.err || js.output || "Action failed");
    } else {
      updateStatuses();
    }

  } catch (e) {
    // handled by apiFetch
  }
}


/* Give temporary visual feedback in dashboard */
function flashStatus(service, msg, cls) {
  const tail = service.split("-")[1];
  const cell = document.getElementById(`tail-${tail}-status`);
  if (!cell) return;
  const old = cell.innerHTML;
  cell.innerHTML = `<span class="${cls}">${msg}</span>`;
  setTimeout(() => cell.innerHTML = old, 2000);
}

/* -------------------------------------------------------------------
   Periodic Service Status Polling
------------------------------------------------------------------- */
async function updateStatuses() {
  try {
    const resp = await apiFetch("api/status.php");
    const js = await resp.json();
    const data = js.status || js;  // unified shape

    TAILS.forEach(t => {
      const zState = data[`zfts-${t}`] || "unknown";
      const cState = data[`zcompd-${t}`] || "unknown";
      const cell = document.getElementById(`tail-${t}-status`);
      if (!cell) return;

      function iconOf(v) {
        if (v === "active") return "🟢";
        if (v === "activating") return "🟡";
        if (v === "failed") return "🔴";
        return "⚫";
      }

      cell.innerHTML = `
        <div class="statCell"><b>ZFTS:</b> ${iconOf(zState)} ${zState}</div>
        <div class="statCell"><b>ZCOMPD:</b> ${iconOf(cState)} ${cState}</div>`;
    });
  } catch (err) {
    console.error("Status poll failed", err);
  } finally {
    clearTimeout(window.__statusTimer);
    window.__statusTimer = setTimeout(updateStatuses, POLL_INTERVAL);
  }
}

/* -------------------------------------------------------------------
   Log Window Management
------------------------------------------------------------------- */
const logWindows = {};

function toggleLogs(service) {
  if (logWindows[service]) {
    logWindows[service].remove();
    delete logWindows[service];
  } else {
    openLogWindow(service);
  }
}

function openLogWindow(service) {
  const win = document.createElement("div");
  win.className = "logWindow";
  win.dataset.reverse = "false";   // track state
  win.innerHTML = `
    <div class="logHeader" onmousedown="startDrag(event,'${service}')">
      <span class="logTitle">Service Logs — ${service}</span>
      <button class="closeLog" onclick="closeLogWindow('${service}')">✖</button>
    </div>
    <input type="text" class="logSearch" placeholder="Search…">
    <div style="margin:6px 10px;">
        <label><input type="checkbox" class="autoChk" checked
         onchange="toggleAutoUpdate('${service}')"> Auto‑update</label>
      <button class="reverseBtn" onclick="toggleReverse('${service}')">⬆️ Reverse Order</button>
    </div>
    <pre class="logContent" id="logBody-${service}">Loading…</pre>
    <div class="resizeHandle"></div>
  `;
  document.body.appendChild(win);
  logWindows[service] = win;
  dragConfig[service] = { active: false, dx: 0, dy: 0 };

  refreshLogs(service); // load initial logs

  // start auto‑refresh every 8 seconds
  const intervalMs = 5000;
  if (logAutoTimers[service]) clearInterval(logAutoTimers[service]);
  logAutoTimers[service] = setInterval(() => {
    refreshLogs(service);
  }, intervalMs);
}

function toggleAutoUpdate(service) {
  const win = logWindows[service];
  if (!win) return;
  const chk = win.querySelector(".autoChk");
  const enabled = chk.checked;

  if (enabled) {
    // restart
    if (logAutoTimers[service]) clearInterval(logAutoTimers[service]);
    logAutoTimers[service] = setInterval(() => refreshLogs(service), 5000);
  } else {
    // pause
    clearInterval(logAutoTimers[service]);
    delete logAutoTimers[service];
  }
}

/* -------------------------------------------------------------------
   Log Search / Filter Feature
------------------------------------------------------------------- */
document.addEventListener("input", e => {
  if (!e.target.classList.contains("logSearch")) return;
  const query = e.target.value.trim().toLowerCase();
  const win = e.target.closest(".logWindow");
  const pre = win.querySelector(".logContent");
  if (!pre || !pre.dataset.fullText) return;

  if (!query) {
    //pre.innerHTML = pre.dataset.fullText; // show full log again
    pre.textContent = pre.dataset.fullText;
    return;
  }

  const lines = pre.dataset.fullText.split(/\n/);
  const filtered = lines.filter(l => l.toLowerCase().includes(query));
  //pre.innerHTML = filtered.join("\n") || "(no matches)";
  pre.textContent = filtered.join("\n") || "(no matches)";
});

function toggleReverse(service) {
  const win = logWindows[service];
  if (!win) return;

  const pre = win.querySelector(".logContent");
  if (!pre) return;

  // flip state
  const isReversed = win.dataset.reverse === "true";
  const newState = !isReversed;
  win.dataset.reverse = newState ? "true" : "false";

  // update button text
  const btn = win.querySelector(".reverseBtn");
  if (btn) {
    btn.textContent = newState ? "⬇️ Normal Order" : "⬆️ Reverse Order";
  }

  // re-render using stored full text
  if (pre.dataset.fullText) {
    applyOrder(pre, newState);
  }
}

/* Helper to apply order */
function applyOrder(pre, reversed) {
  const lines = pre.dataset.fullText.split("\n");
  const ordered = reversed ? [...lines].reverse() : lines;
  pre.textContent = ordered.join("\n");
}
/* Close and clean up */
function closeLogWindow(service) {
  const win = logWindows[service];
  if (win) win.remove();
  delete logWindows[service];
  delete dragConfig[service];
  if (logAutoTimers[service]) {
    clearInterval(logAutoTimers[service]);
    delete logAutoTimers[service];
  }
}
/* Fetch logs from backend (last 100 lines) */

async function refreshLogs(service) {
  const pre = document.getElementById(`logBody-${service}`);
  if (!pre) return;

  try {
    const resp = await apiFetch(`api/logs.php?service=${service}`);
    const js = await resp.json();

    if (!js.ok || !Array.isArray(js.lines)) {
      throw new Error("Invalid log response");
    }

    // store full text
    pre.dataset.fullText = js.lines.join("\n");

    // respect reverse state
    const win = logWindows[service];
    const reversed = win && win.dataset.reverse === "true";

    // render once (correct way)
    applyOrder(pre, reversed);

  } catch (err) {
    pre.dataset.fullText = "";
    pre.textContent = "Error fetching logs.";
  }
}
/* Scroll helper */
function scrollBottom(service) {
  const body = document.getElementById(`logBody-${service}`);
  if (body) body.scrollTop = body.scrollHeight;
}

/* -------------------------------------------------------------------
   Dragging / Moving Logic for Log Windows
------------------------------------------------------------------- */
const dragConfig = {};
function startDrag(e, service) {
  e.preventDefault();
  const win = logWindows[service];
  if (!win) return;
  dragConfig[service].active = true;
  dragConfig[service].dx = e.clientX - win.offsetLeft;
  dragConfig[service].dy = e.clientY - win.offsetTop;
  document.addEventListener("mousemove", dragMove);
  document.addEventListener("mouseup", stopDrag);
}
function dragMove(e) {
  Object.entries(dragConfig).forEach(([svc, cfg]) => {
    if (!cfg.active) return;
    const win = logWindows[svc];
    if (!win) return;
    win.style.left = (e.clientX - cfg.dx) + "px";
    win.style.top  = (e.clientY - cfg.dy) + "px";
  });
}
function stopDrag() {
  Object.values(dragConfig).forEach(cfg => (cfg.active = false));
  document.removeEventListener("mousemove", dragMove);
  document.removeEventListener("mouseup", stopDrag);
}

/* -------------------------------------------------------------------
   Basic Resize Handles (optional)
------------------------------------------------------------------- */
window.addEventListener("mousedown", e => {
  if (!e.target.classList.contains("resizeHandle")) return;
  const win = e.target.parentElement;
  let startX = e.clientX, startY = e.clientY;
  let startW = win.offsetWidth, startH = win.offsetHeight;
  function move(ev) {
    win.style.width  = startW + (ev.clientX - startX) + "px";
    win.style.height = startH + (ev.clientY - startY) + "px";
  }
  function up() {
    window.removeEventListener("mousemove", move);
    window.removeEventListener("mouseup", up);
  }
  window.addEventListener("mousemove", move);
  window.addEventListener("mouseup", up);
});


/* =====================================================================
   ZFTS Admin – App.js (Section 3 of 3)
   Configuration Editor • Full File Modal • Final Bootstrap
===================================================================== */

/* -------------------------------------------------------------------
   Load Configuration File into Table Editor
------------------------------------------------------------------- */
async function loadConfigFile() {
  const select = document.getElementById("cfgFile");
  const fn = select.value;
  if (!fn) return;

  const table = document.getElementById("cfgTable");
  table.innerHTML = "<tr><td>Loading...</td></tr>";

  try {
    const resp = await apiFetch(`api/config.php?file=${encodeURIComponent(fn)}`);
    const js = await resp.json();

  if (js.ok && js.raw) {
    // Editable <textarea> for raw config text
    table.innerHTML = `
      <tr><td colspan="2">
        <textarea id="cfgEditorArea"
          style="width:98%;height:60vh;font-family:monospace;background:#111;color:#0f0;
                 border:1px solid #555;padding:8px;resize:vertical;">${js.raw}</textarea>
        <div style="text-align:center;margin-top:6px;">
          <button id="saveCfgBtn" onclick="saveConfigFile('${fn}')">💾 Save Changes</button>
        </div>
      </td></tr>`;
  } else {
    table.innerHTML = `<tr><td colspan="2">Error reading file: ${js.err || "unknown"}</td></tr>`;
  }

  } catch (err) {
    table.innerHTML = `<tr><td colspan="2">Fetch error: ${err}</td></tr>`;
  }
}


/* -------------------------------------------------------------------
   Save Current Configuration Changes
------------------------------------------------------------------- */

async function saveConfigFile(filename) {

  const ok = await showConfirm(`Save changes to ${filename}?`);
  if (!ok) return;

  const area = document.getElementById("cfgEditorArea");
  if (!area) return showMessage("No editor open");

  const form = new URLSearchParams();
  form.append("file", filename);
  form.append("content", area.value);

  try {
    const resp = await apiFetch("api/config_save.php", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form.toString()
    });

    const js = await resp.json();

    if (js.ok) {
      showMessage("Configuration saved successfully.");
    } else {
      showMessage("Save failed: " + (js.err || "unknown"));
    }

  } catch (e) {
    // handled by apiFetch
  }
}

/* -------------------------------------------------------------------
   View Full Config File Modal
------------------------------------------------------------------- */
async function openFullFile() {
  const select = document.getElementById("cfgFile");
  const fn = select.value;
  if (!fn) return;
  const modal = document.getElementById("fullFileModal");
  const area = document.getElementById("fullFileText");
  area.value = "Loading…";
  modal.classList.remove("hidden");

  try {
    const resp = await apiFetch(`api/config_raw.php?file=${encodeURIComponent(fn)}`);
    const text = await resp.text();
    area.value = text;
  } catch (err) {
    area.value = "Error loading file: " + err;
  }
}
function closeFullFile() {
  document.getElementById("fullFileModal").classList.add("hidden");
}

/* -------------------------------------------------------------------
   Initialize Event Listeners and Restore Info
------------------------------------------------------------------- */
document.addEventListener("DOMContentLoaded", () => {
  // Hook buttons
  const saveBtn = document.getElementById("saveCfgBtn");
  if (saveBtn) saveBtn.addEventListener("click", saveConfigFile);
  const viewBtn = document.getElementById("viewFullBtn");
  if (viewBtn) viewBtn.addEventListener("click", openFullFile);
  const closeModal = document.getElementById("closeModalBtn");
  if (closeModal) closeModal.addEventListener("click", closeFullFile);

  // Ensure dashboard polling continues (redundant safety)
  if (!window.__statusTimer) setTimeout(updateStatuses, 1000);

  loadConfigList();   // populate cfgFile
  updateAuthIndicator(false); //default buttons are locked
  checkAuth();  //check auth state update button
  updateButtonStates(); //disable if not authedticated
  // Theme restore
  const saved = localStorage.getItem("theme");
  setTheme(saved === "dark");

  // Build Tail Dashboard
  buildDashboard();
  // First poll after short delay – rest handled later in Section 2
  setTimeout(updateStatuses, 500);

});



/* -------------------------------------------------------------------
   Populate configuration file list at page load
------------------------------------------------------------------- */

/* =====================================================================
   End of app.js
===================================================================== */
