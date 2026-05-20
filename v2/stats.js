//--------------------------------------------------------------------
// ZFTS Dual Instance File Transfer Monitor
// Jan 2026 – Polling + Adjustable Frequency + Intelligent Buttons
// Adds: Air port selector (default 19712) + persist + safety guards
//--------------------------------------------------------------------

let airHost = null;
let airPort = 19712;
let airPingTimer = null, groundPingTimer = null;
let airUpdateTimer = null, groundUpdateTimer = null;
let airAvailable = true;
let groundAvailable = true;
let airPollInterval = 5000;
let groundPollInterval = 5000;

// Track per-file pending actions
const pendingActions = {};

// ---------- Generic utilities ----------
function formatFileSize(bytes){
  if(bytes>=1e9)return(bytes/1e9).toFixed(2)+" GB";
  if(bytes>=1e6)return(bytes/1e6).toFixed(2)+" MB";
  if(bytes>=1e3)return(bytes/1e3).toFixed(2)+" KB";
  return bytes+" B";
}
function getRateText(r){
  if(r/1e9>1)return(r/1e9).toFixed(3)+" GB/s";
  if(r/1e6>1)return(r/1e6).toFixed(3)+" MB/s";
  if(r/1e3>1)return(r/1e3).toFixed(3)+" KB/s";
  return r.toFixed(3)+" B/s";
}
function getRemainingTime(e){
  if(e.rate===0)return"∞";
  const s=(e.file_size-e.bytes_received)/e.rate;
  const d=new Date(null);d.setSeconds(s);
  return d.toISOString().substr(11,8);
}
function showTableError(id,msg){
  const t=document.getElementById(id);if(!t)return;
  const body=t.tBodies[0]||t.createTBody();
  body.innerHTML="";
  const r=body.insertRow();const c=r.insertCell();
  c.colSpan=9;c.textContent=msg;
  c.style.textAlign="center";c.style.color="#c00";c.style.fontWeight="bold";
}
function clearTable(id,label){
  const t=document.getElementById(id);if(!t)return;
  const body=t.tBodies[0]||t.createTBody();
  body.innerHTML="";
  const r=body.insertRow();const c=r.insertCell();
  c.colSpan=9;
  c.textContent=`${label} disconnected — no data`;
  c.style.textAlign="center";
  c.style.color="#777";c.style.fontStyle="italic";
}

// ---------- Health indicators ----------
function setAirHealth(st,txt){
  const i=document.getElementById("airHealth");
  i.textContent=txt;i.className="";
  i.classList.add(st==="idle"?"health-idle":
    st==="connecting"?"health-connecting":
    st==="ok"?"health-ok":"health-fail");
}
function setConnectBtn(enabled,text){
  const b=document.getElementById("setAirBtn");
  b.disabled=!enabled;b.textContent=text;
}
function setGroundHealth(st,txt){
  const g=document.getElementById("groundHealth");
  g.textContent=txt;g.className="";
  g.classList.add(st==="ok"?"health-ok":
    st==="fail"?"health-fail":"health-idle");
}

// ---------- Fetch & render ----------
function fetchInstance(base,tableId,label){
  fetch(base,{cache:"no-store"})
    .then(async r=>{
      if(!r.ok)throw new Error(`HTTP ${r.status}`);
      const raw=await r.json();
      const data=Array.isArray(raw)?{status:raw}:raw;
      renderInstance(data,tableId,label);
    })
    .catch(err=>{
      console.warn(`${label} fetch error:`,err);
      showTableError(tableId,`${label} service unreachable — displaying no data`);
    });
}

function renderInstance(d,tid,label){
  const t=document.getElementById(tid);
  if(!t)return;
  if(d.platform_name){
    let headerId=`${tid}_header`;
    let header=document.getElementById(headerId);
    if(!header){
      header=document.createElement("div");
      header.id=headerId;
      header.style.margin="6px 0";
      header.style.fontWeight="bold";
      header.style.color="#1589ff";
      t.insertAdjacentElement("beforebegin",header);
    }
    header.textContent=`Sending Platform Name: ${d.platform_name}`;
  }
  if(!t.tHead){
    const h=["FileID","File Name","State","Complete (%)","Transfer Rate","Time Remaining","File Size","Priority","Actions"];
    const thead=t.createTHead();const r=thead.insertRow();
    h.forEach(c=>{const th=document.createElement("th");th.textContent=c;r.appendChild(th);});
  }
  generateTable(t,d.status||[],label);
}

// ---------- Table generation ----------
function generateTable(table, data, label) {
  const body = table.tBodies[0] || table.createTBody();
  body.innerHTML = "";
  if (!data || !data.length) {
    const row = body.insertRow();
    const cell = row.insertCell();
    cell.colSpan = 9;
    cell.textContent = "No files currently in the transfer queue";
    cell.style.textAlign = "center";
    cell.style.color = "#666";
    cell.style.fontStyle = "italic";
    return;
  }

  data.forEach(e => {
    const fid = e.fileID;
    const key = `${label}_${fid}`;          // NEW unique key
    const row = body.insertRow();

    row.insertCell().textContent = fid;
    row.insertCell().textContent = e.file_name;
    const inProgress = Number(e.started) === 1;
    row.insertCell().textContent = inProgress ? "Running" : "Stopped";
    row.insertCell().textContent = e.percent_complete.toFixed(2) + " %";
    row.insertCell().textContent = getRateText(
      typeof e.rate === "object" ? parseFloat(e.rate.parsedValue || 0) : e.rate
    );
    row.insertCell().textContent = getRemainingTime(e);
    row.insertCell().textContent = formatFileSize(e.file_size);

    // Priority select
    const priCell = row.insertCell();
    const sel = document.createElement("select");
    sel.id = `${label}_${fid}_priSelect`;
    for (let i = 1; i <= 5; i++) {
      const o = document.createElement("option");
      o.value = i;
      o.text = i;
      if (i === e.priority) o.selected = true;
      sel.add(o);
    }
    const unavailable = (label === "Air" && !airAvailable) || (label === "Ground" && !groundAvailable);
    if (unavailable) { sel.disabled = true; sel.style.opacity = 0.5; }
    sel.onchange = () => handlePriorityChange(e, label);
    priCell.appendChild(sel);

    // Determine button states using prefixed key
    const action = pendingActions[key];
    const isStarting = action === "starting";
    const isStopping = action === "stopping";
    const isCancelling = action === "cancelling";

    const act = row.insertCell();
    const mk = (txt, dis) => {
      const b = document.createElement("button");
      b.textContent = txt;
      b.disabled = dis;
      b.onclick = () => handleAction(e, txt, label, b);
      return b;
    };

    const startB = mk(isStarting ? "Sending…" : "Start", inProgress || isStarting);
    if (isStarting) startB.classList.add("sending");
    act.appendChild(startB);

    const stopB = mk(isStopping ? "Stopping…" : "Stop", !inProgress || isStopping);
    if (isStopping) stopB.classList.add("stopping");
    act.appendChild(stopB);

    const cancelB = mk(isCancelling ? "Cancelling…" : "Cancel", isCancelling);
    if (isCancelling) cancelB.classList.add("cancelling");
    act.appendChild(cancelB);

    if (isStarting && inProgress) delete pendingActions[key];
    if (isStopping && !inProgress) delete pendingActions[key];
  });
}

// ---------- Air connect / disconnect ----------
function getOrCreatePingDisplay(){
  let el=document.getElementById("latencyDisplay");
  if(!el){
    el=document.createElement("span");
    el.id="latencyDisplay";
    el.style.marginLeft="12px";el.style.fontWeight="bold";
    document.getElementById("airControls").appendChild(el);
  }
  return el;
}

function setAirHost(){
  const btn=document.getElementById("setAirBtn");
  if(btn.textContent==="Disconnect"){disconnectAir();return;}

  const host=document.getElementById("airHost").value.trim();
  const portVal=document.getElementById("airPort").value||19712;
  const msg=document.getElementById("airStatus");
  const ping=getOrCreatePingDisplay();

  if(!host){
    msg.textContent="⚠ Enter hostname/IP";
    setAirHealth("idle","🟦 Idle");
    ping.textContent="Ping: N/A";return;
  }

  airHost=host;airPort=portVal;
  localStorage.setItem("airHost",host);
  localStorage.setItem("airPort",portVal);

  msg.textContent="Connecting…";
  setAirHealth("connecting","🟨 Connecting…");
  setConnectBtn(false,"Connecting…");
  ping.textContent="Ping: ...";

  const base=`/airproxy?target=${airHost}:${airPort}&path=files`;
  const startT=performance.now();

  fetch(base)
    .then(r=>{if(!r.ok)throw new Error();return r.json();})
    .then(data=>{
      ping.textContent=`Ping: ${Math.round(performance.now()-startT)} ms`;
      msg.textContent="✅ Connected";
      setAirHealth("ok","🟩 Connected");
      setConnectBtn(true,"Disconnect");
      renderInstance(data,"airTable","Air");
      airAvailable=true;
      startAirUpdater(base);
      startAirPinger(base,ping);
    })
    .catch(()=>{
      msg.textContent="❌ Connection failed";
      setAirHealth("fail","🟥 Unreachable");
      setConnectBtn(true,"Connect");
      ping.textContent="Ping: N/A";
      airAvailable=false;
      showTableError("airTable","Air service unreachable — displaying no data");
    });
}

function disconnectAir(){
  document.getElementById("airStatus").textContent="Disconnected";
  setAirHealth("idle","🟦 Idle");
  airAvailable=false;
  [airPingTimer,airUpdateTimer].forEach(t=>{if(t)clearInterval(t);});
  airPingTimer=airUpdateTimer=null;
  airHost=null;
  clearTable("airTable","Air");
  const p=document.getElementById("latencyDisplay");
  if(p)p.textContent="Ping: N/A";
  setConnectBtn(true,"Connect");
}

// ---------- Polling updaters ----------
function startAirUpdater(base){
  if(airUpdateTimer)clearInterval(airUpdateTimer);
  airUpdateTimer=setInterval(()=>fetchInstance(base,"airTable","Air"),airPollInterval);
}
function startGroundUpdater(){
  if(groundUpdateTimer)clearInterval(groundUpdateTimer);
  groundUpdateTimer=setInterval(()=>fetchInstance("../api/files","groundTable","Ground"),groundPollInterval);
}

// ---------- Dropdown change listeners ----------
document.addEventListener("change",e=>{
  if(e.target.id==="airPoll"){
    airPollInterval=parseInt(e.target.value)*1000;
    if(airHost){
      const port=document.getElementById("airPort").value||19712;
      startAirUpdater(`/airproxy?target=${airHost}:${port}&path=files`);
    }
  }
  if(e.target.id==="groundPoll"){
    groundPollInterval=parseInt(e.target.value)*1000;
    startGroundUpdater();
  }
});

// ---------- Pingers ----------
function startAirPinger(base,pingEl){
  if(airPingTimer)clearInterval(airPingTimer);
  let act=false;
  airPingTimer=setInterval(async()=>{
    if(act)return;act=true;
    const ctrl=new AbortController();
    const to=setTimeout(()=>ctrl.abort(),8000);
    try{
      const t0=performance.now();
      const r=await fetch(base,{cache:"no-store",signal:ctrl.signal});
      clearTimeout(to);
      const ms=Math.round(performance.now()-t0);
      if(!r.ok)throw new Error();
      pingEl.textContent=`Ping: ${ms} ms`;
      airAvailable=true;setAirHealth("ok","🟢 Live");
    }catch{
      clearTimeout(to);
      pingEl.textContent="Ping: ❌";
      airAvailable=false;setAirHealth("fail","🔴 Lost");
      clearTable("airTable","Air");
    }finally{act=false;}
  },10000);
}
function startGroundPinger(){
  if(groundPingTimer)clearInterval(groundPingTimer);
  let act=false;
  const gPing=document.getElementById("groundLatency");
  const gStatus=document.getElementById("groundStatus");
  groundPingTimer=setInterval(async()=>{
    if(act)return;act=true;
    const ctrl=new AbortController();
    const to=setTimeout(()=>ctrl.abort(),8000);
    try{
      const t0=performance.now();
      const r=await fetch("../api/files",{cache:"no-store",signal:ctrl.signal});
      clearTimeout(to);
      const ms=Math.round(performance.now()-t0);
      if(!r.ok)throw new Error();
      gPing.textContent=`Ping: ${ms} ms`;
      gStatus.textContent="Ready";
      setGroundHealth("ok","🟢 Active");
      groundAvailable=true;
    }catch{
      clearTimeout(to);
      gPing.textContent="Ping: ❌";
      gStatus.textContent="Error reaching Ground";
      setGroundHealth("fail","🔴 Error");
      groundAvailable=false;
      clearTable("groundTable","Ground");
    }finally{act=false;}
  },10000);
}

// ---------- Init ----------
function initGround(){
  fetchInstance("../api/files","groundTable","Ground");
  startGroundPinger();
  startGroundUpdater();
}

// ---------- Actions ----------
async function handleAction(e, action, label, btn) {
  if (label === "Air" && !airHost) {
    alert("Air connection not active — reconnect first."); return;
  }
  if (label === "Ground" && !groundAvailable) {
    alert("Ground service not available."); return;
  }

  const fid = e.fileID;
  const key = `${label}_${fid}`;                // unique key
  const isAir = label === "Air" && airHost;
  const port = document.getElementById("airPort").value || 19712;

  let base, url;
  if (isAir) {
    base = `/airproxy?target=${airHost}:${port}`;
    url  = `${base}&path=files/${fid}`;
  } else {
    base = "/api/files";
    url  = `${base}/${fid}`;
  }

  const priSel = document.getElementById(`${label}_${fid}_priSelect`);
  const p = priSel ? parseInt(priSel.value) : e.priority;

  const payload =
    action === "Start" ? { started: "true", priority: p } :
    action === "Stop"  ? { started: "false", cancel: "false" } :
                         { started: "false", cancel: "true" };

  pendingActions[key] = action.toLowerCase() + "ing";
  btn.classList.remove("sending","stopping","cancelling");
  btn.classList.add(action === "Start" ? "sending" : action === "Stop" ? "stopping" : "cancelling");
  btn.disabled = true;
  btn.textContent =
    action === "Start" ? "Sending…" :
    action === "Stop"  ? "Stopping…" : "Cancelling…";

  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
  } catch (err) {
    console.warn(`${label} ${action} failed:`, err);
  }
}

async function handlePriorityChange(e, label) {
  const isAir = label === "Air" && airHost;
  const port = document.getElementById("airPort").value || 19712;

  const url = isAir
    ? `/airproxy?target=${airHost}:${port}&path=files/${e.fileID}`
    : `/api/files/${e.fileID}`;

  const s = document.getElementById(`${label}_${e.fileID}_priSelect`);
  const p = parseInt(s.value);
  await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ started: "true", priority: p })
  });
}

// ---------- User info ----------
function loadUserInfo(){
  fetch("/userinfo",{cache:"no-store"})
    .then(r=>{if(!r.ok)throw new Error();return r.json();})
    .then(u=>{
      const un=document.getElementById("username");
      const dn=document.getElementById("userdn");
      let clean=u.cn||"";clean=clean.replace(/\.\d+$/,"");
      const parts=clean.split(".").filter(p=>p&&!/^\d+$/.test(p));
      let disp=clean;
      if(parts.length>=2){
        const first=parts[1],last=parts[0];
        disp=first.charAt(0).toUpperCase()+first.slice(1).toLowerCase()+" "+last.charAt(0).toUpperCase()+last.slice(1).toLowerCase();
      }
      un.textContent=disp||"Unknown User";
      un.title=u.dn||"";dn.textContent="";
    })
    .catch(()=>{
      document.getElementById("username").textContent="Unknown User";
      document.getElementById("userdn").textContent="";
    });
}

// ---------- Startup ----------
document.addEventListener("DOMContentLoaded",loadUserInfo);
document.addEventListener("DOMContentLoaded",initGround);
document.addEventListener("DOMContentLoaded",()=>{
  const savedH=localStorage.getItem("airHost");
  const savedP=localStorage.getItem("airPort");
  if(savedH){document.getElementById("airHost").value=savedH;}
  if(savedP){document.getElementById("airPort").value=savedP;}
  if(savedH){setTimeout(()=>setAirHost(),600);}
});
