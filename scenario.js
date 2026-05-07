'use strict';

// ══════════════════════════════════════════════
// CONFIGURATION DES ÉTATS
// ══════════════════════════════════════════════
const STATES = {
  stable: {
    label: 'Normal',
    color: 'ok',
    ecgColor: '#00ff88',
    ecgAmplitude: 1,
    interval: 4000,
    vitals: () => ({
      hr:   rand(68, 82),
      spo2: rand(97, 99),
      temp: randF(36.4, 37.0),
      sbp:  rand(112, 125),
      dbp:  rand(72, 80),
      resp: rand(14, 18)
    }),
    ecgHz: '250 Hz',
    compression: 'Standard',
    network: 'WiFi 5G',
    adaptMode: 'Normal',
    alertChan: 'Aucune',
    alertMsg: '✅ Patient stable — constantes normales.',
    alertZone: 'az-ok',
    alertIcon: '✅',
    wsStatus: '201 Created',
    dbRepl: '✓ Synchronisé',
    apiCode: '200 OK',
  },
  moderate: {
    label: 'Modéré',
    color: 'warn',
    ecgColor: '#fbbf24',
    ecgAmplitude: 1.3,
    interval: 2500,
    vitals: () => ({
      hr:   rand(100, 115),
      spo2: rand(93, 96),
      temp: randF(38.2, 38.9),
      sbp:  rand(145, 160),
      dbp:  rand(92, 100),
      resp: rand(20, 26)
    }),
    ecgHz: '400 Hz',
    compression: 'Élevée',
    network: '4G',
    adaptMode: 'Modéré',
    alertChan: 'SMS + Appel',
    alertMsg: '⚠️ Surveillance accrue — FC et tension élevées.',
    alertZone: 'az-warn',
    alertIcon: '⚠️',
    wsStatus: '201 Created',
    dbRepl: '✓ Synchronisé',
    apiCode: '200 OK',
  },
  critical: {
    label: 'CRITIQUE',
    color: 'error',
    ecgColor: '#f87171',
    ecgAmplitude: 1.8,
    interval: 1200,
    vitals: () => ({
      hr:   rand(120, 145),
      spo2: rand(85, 91),
      temp: randF(39.2, 40.1),
      sbp:  rand(170, 195),
      dbp:  rand(108, 122),
      resp: rand(28, 36)
    }),
    ecgHz: '500 Hz',
    compression: 'Max (dégradé)',
    network: 'Edge / 2G',
    adaptMode: 'Critique',
    alertChan: 'ALARME SALLE',
    alertMsg: '🚨 ÉTAT CRITIQUE — Intervention immédiate requise !',
    alertZone: 'az-crit',
    alertIcon: '🚨',
    wsStatus: '201 Created',
    dbRepl: '✓ Réplication forcée',
    apiCode: '200 OK',
  }
};

// ══════════════════════════════════════════════
// STATE
// ══════════════════════════════════════════════
let simTimer     = null;
let currentState = 'stable';
let running      = false;
let cycleNum     = 0;
let alertCount   = 0;
let latencies    = [];
let totalDB      = 1840;
let clockTimer   = null;

// ══════════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════════
function rand(min, max)  { return Math.floor(Math.random() * (max - min + 1)) + min; }
function randF(min, max) { return (Math.random() * (max - min) + min).toFixed(1); }
function now() {
  return new Date().toLocaleTimeString('fr-FR', { hour12: false });
}
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ══════════════════════════════════════════════
// CLOCK
// ══════════════════════════════════════════════
function startClock() {
  function tick() {
    const el = document.getElementById('scenClock');
    if (el) el.textContent = new Date().toLocaleTimeString('fr-FR');
  }
  tick();
  clockTimer = setInterval(tick, 1000);
}
startClock();

// ══════════════════════════════════════════════
// ÉTAT DU PATIENT
// ══════════════════════════════════════════════
function setState(s) {
  currentState = s;
  ['stable', 'moderate', 'critical'].forEach(k => {
    document.getElementById('btn' + k.charAt(0).toUpperCase() + k.slice(1))
      ?.classList.toggle('active', k === s);
  });
  log('system', `État patient changé → ${STATES[s].label}`);
}

// ══════════════════════════════════════════════
// TERMINAL
// ══════════════════════════════════════════════
function log(type, msg) {
  const term = document.getElementById('terminal');
  if (!term) return;
  const line = document.createElement('div');
  const classes = {
    info: 'term-info', success: 'term-success', warn: 'term-warn',
    error: 'term-error', data: 'term-data', system: 'term-system',
    db: 'term-db', api: 'term-api'
  };
  line.className = 'term-line ' + (classes[type] || 'term-system');
  const prefix = {
    info: '[NET]', success: '[OK]', warn: '[WARN]', error: '[CRIT]',
    data: '[DATA]', system: '[SYS]', db: '[DB]', api: '[API]'
  };
  line.textContent = `${now()} ${prefix[type] || '[LOG]'} ${msg}`;
  term.appendChild(line);
  term.scrollTop = term.scrollHeight;
}

function clearLog() {
  const term = document.getElementById('terminal');
  if (term) term.innerHTML = '';
  log('system', 'Journal vidé.');
}

// ══════════════════════════════════════════════
// CARD STATUS HELPERS
// ══════════════════════════════════════════════
function setCardStatus(id, text, cls) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = text;
  el.className = 'card-status ' + (cls ? 'status-' + cls : '');
}

function setNode(id, cls) {
  const el = document.getElementById(id);
  if (!el) return;
  el.className = 'pipe-node ' + (cls ? cls + '-node' : '');
}

function setDetail(id, cls) {
  const el = document.getElementById(id);
  if (!el) return;
  el.className = 'pipe-detail ' + (cls ? cls + '-detail' : '');
}

function setPdVal(id, text, valCls) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = text;
  el.className = 'pd-val' + (valCls ? ' val-' + valCls : '');
}

// ══════════════════════════════════════════════
// ECG WAVEFORM GENERATOR
// ══════════════════════════════════════════════
function generateECGPoints(amp, color) {
  const w = 500, h = 80, mid = h / 2;
  const a = amp;
  // One full ECG cycle pattern (P,Q,R,S,T)
  const cycles = [];
  const cycleW = 120;
  const numCycles = Math.ceil(w / cycleW) + 1;
  for (let i = 0; i < numCycles; i++) {
    const x0 = i * cycleW;
    cycles.push(
      [x0, mid],
      [x0 + 10, mid],
      [x0 + 18, mid - 6 * a],
      [x0 + 22, mid + 2 * a],
      [x0 + 26, mid],
      [x0 + 35, mid],
      [x0 + 40, mid - 28 * a],
      [x0 + 44, mid + 18 * a],
      [x0 + 48, mid],
      [x0 + 55, mid],
      [x0 + 65, mid - 10 * a],
      [x0 + 75, mid],
      [x0 + 85, mid],
      [x0 + cycleW, mid]
    );
  }
  return cycles.map(p => `${Math.min(p[0], w)},${Math.max(2, Math.min(h - 2, p[1]))}`).join(' ');
}

let ecgOffset = 0;
let ecgAnimFrame = null;

function animateECG(cfg) {
  const path = document.getElementById('ecgPath');
  if (!path) return;

  path.setAttribute('stroke', cfg.ecgColor);
  const basePoints = generateECGPoints(cfg.ecgAmplitude, cfg.ecgColor);

  let offset = 0;
  function frame() {
    offset = (offset + 2) % 120;
    // Shift points left by offset
    const shifted = basePoints.split(' ').map(pt => {
      const [x, y] = pt.split(',').map(Number);
      const newX = ((x - offset + 500) % 500 + 500) % 500;
      return `${newX},${y}`;
    }).sort((a, b) => parseFloat(a) - parseFloat(b)).join(' ');
    path.setAttribute('points', shifted);
    if (running) ecgAnimFrame = requestAnimationFrame(frame);
  }
  if (ecgAnimFrame) cancelAnimationFrame(ecgAnimFrame);
  frame();
}

// ══════════════════════════════════════════════
// PACKET ANIMATION
// ══════════════════════════════════════════════
async function firePacket(id, color) {
  const pkt = document.getElementById(id);
  if (!pkt) return;
  pkt.className = 'arrow-packet' + (color === 'alert' ? ' alert-packet' : color === 'warn' ? ' warn-packet' : '');
  pkt.classList.add('animate');
  await sleep(850);
  pkt.classList.remove('animate');
}

// ══════════════════════════════════════════════
// MAIN SIMULATION CYCLE
// ══════════════════════════════════════════════
async function runCycle() {
  if (!running) return;

  const cfg = STATES[currentState];
  const vitals = cfg.vitals();
  cycleNum++;
  totalDB++;

  const tStart = Date.now();
  const isAlert = currentState !== 'stable';
  const isCrit  = currentState === 'critical';

  // ─── Update info bars ───
  document.getElementById('networkType').textContent   = cfg.network;
  document.getElementById('ecgFreq').textContent       = cfg.ecgHz;
  document.getElementById('compressionLevel').textContent = cfg.compression;
  document.getElementById('packetCount').textContent   = cycleNum;
  document.getElementById('currentMode').textContent   = cfg.adaptMode;

  // ─── STEP 1 : Génération du paquet patient ───
  setNode('node-ws', '');
  setDetail('detail-ws', '');

  setCardStatus('status-patient', 'Actif', 'active');
  document.getElementById('card-patient').classList.add('active-card');
  document.getElementById('sendIndicator').classList.add('visible');

  // Update live vitals display
  document.getElementById('liveHR').textContent   = vitals.hr;
  document.getElementById('liveSPO2').textContent = vitals.spo2;
  document.getElementById('liveTemp').textContent = vitals.temp;

  // Build JSON packet
  const ts = new Date().toISOString();
  const packetObj = {
    patient_id: "P-0042",
    timestamp:  ts,
    device:     "BLE-IoT-v2",
    network:    cfg.network,
    ecg_hz:     cfg.ecgHz,
    vitals: {
      heart_rate: vitals.hr,
      spo2:       vitals.spo2,
      temperature: parseFloat(vitals.temp),
      blood_pressure: `${vitals.sbp}/${vitals.dbp}`,
      respiratory_rate: vitals.resp
    },
    severity:   cfg.adaptMode,
    compressed: cfg.compression !== 'Standard'
  };

  document.getElementById('packetJson').textContent = JSON.stringify(packetObj, null, 2);

  log('data', `Paquet ECG généré — HR:${vitals.hr} SpO₂:${vitals.spo2}% Temp:${vitals.temp}°C`);
  log('info', `Transmission → POST /api/v1/ecg [${cfg.network}] [${cfg.ecgHz}]`);

  animateECG(cfg);
  await sleep(600);

  // ─── STEP 2 : Web Service ───
  const pktColor = isCrit ? 'alert' : isAlert ? 'warn' : '';
  firePacket('pkt-ws-db', pktColor);

  setNode('node-ws', 'active');
  setDetail('detail-ws', 'active');
  document.getElementById('card-patient').classList.remove('active-card');

  const wsDelay = rand(45, 120);
  setPdVal('ws-status', cfg.wsStatus, 'ok');
  setPdVal('ws-valid', '✓ Schéma valide', 'ok');
  setPdVal('ws-adapt', `→ Mode ${cfg.adaptMode}`, isCrit ? 'error' : isAlert ? 'warn' : 'ok');
  setPdVal('ws-time', `${wsDelay}ms`, '');

  log('info', `Web Service reçoit — Validation OK — Mode détecté: ${cfg.adaptMode}`);
  if (isCrit) log('error', `ALERTE CRITIQUE déclenchée — Moteur d'adaptation: urgence`);
  else if (isAlert) log('warn', `Alerte modérée — Fréquence de collecte augmentée`);

  await sleep(700);
  setNode('node-ws', 'done');
  setDetail('detail-ws', 'done');

  // ─── STEP 3 : Base de données ───
  firePacket('pkt-db-api', pktColor);

  setNode('node-db', 'active');
  setDetail('detail-db', 'active');

  const dbDelay = rand(12, 35);
  setPdVal('db-count', totalDB.toLocaleString('fr'), '');
  setPdVal('db-repl', cfg.dbRepl, 'ok');

  log('db', `INSERT INTO vitals_stream — patient_id=P-0042 — severity=${cfg.adaptMode}`);
  log('db', `TimescaleDB OK — ${dbDelay}ms — partition 2026-05 — ${totalDB} entrées`);

  await sleep(600);
  setNode('node-db', 'done');
  setDetail('detail-db', 'done');

  // ─── STEP 4 : API ───
  firePacket('pkt-api-dash', pktColor);

  setNode('node-api', isCrit ? 'alert' : 'active');
  setDetail('detail-api', isCrit ? 'alert' : 'active');

  const apiDelay = rand(18, 55);

  const apiResp = {
    status: 200,
    data: {
      patient_id: "P-0042",
      name: "Ahmed Benali",
      timestamp: ts,
      vitals: {
        heart_rate:        vitals.hr,
        spo2:              vitals.spo2,
        temperature:       parseFloat(vitals.temp),
        blood_pressure:    `${vitals.sbp}/${vitals.dbp}`,
        respiratory_rate:  vitals.resp
      },
      severity:     cfg.adaptMode,
      alert:        isAlert,
      alert_level:  isCrit ? "CRITICAL" : isAlert ? "MODERATE" : "NONE",
      alert_channel: cfg.alertChan,
      adaptation: {
        mode:        cfg.adaptMode,
        ecg_hz:      cfg.ecgHz,
        compression: cfg.compression,
        network:     cfg.network
      },
      processed_in_ms: wsDelay + dbDelay + apiDelay
    }
  };

  document.getElementById('apiJsonDisplay').textContent = JSON.stringify(apiResp, null, 2);
  document.getElementById('status-api').textContent = '200 OK';
  document.getElementById('status-api').className   = 'card-status status-ok';

  setPdVal('api-code',    cfg.apiCode, 'ok');
  setPdVal('api-latency', `${apiDelay}ms`, '');
  setPdVal('api-alert',   isCrit ? 'CRITIQUE' : isAlert ? 'Modérée' : 'Aucune', isCrit ? 'error' : isAlert ? 'warn' : 'ok');
  setPdVal('api-mode',    cfg.adaptMode, isCrit ? 'error' : isAlert ? 'warn' : 'ok');

  log('api', `GET /api/v1/patients/P-0042/vitals — 200 OK — ${apiDelay}ms`);
  log('api', `Alerte: ${cfg.alertChan} — Canal notifié`);

  await sleep(600);
  setNode('node-api', 'done');
  setDetail('detail-api', 'done');

  // ─── STEP 5 : Dashboard ───
  setNode('node-dash', isCrit ? 'alert' : 'active');
  setDetail('detail-dash', isCrit ? 'alert' : 'active');

  const totalMs = Date.now() - tStart;
  latencies.push(totalMs);
  if (latencies.length > 20) latencies.shift();
  const avg = Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length);

  setPdVal('dash-doc',     'Dr. Sophie Martin', 'ok');
  setPdVal('dash-alert',   isCrit ? '🔴 Alarme active' : isAlert ? '🟡 Avertissement' : '🟢 Aucune', isCrit ? 'error' : isAlert ? 'warn' : 'ok');
  setPdVal('dash-channel', cfg.alertChan, isCrit ? 'error' : isAlert ? 'warn' : '');
  setPdVal('dash-total',   `${totalMs}ms`, totalMs > 200 ? 'warn' : 'ok');

  // Update mini dashboard
  updateMiniDashboard(vitals, cfg, isCrit, isAlert);

  log('success', `Dashboard mis à jour — Cycle #${cycleNum} — ${totalMs}ms total`);
  if (isCrit) {
    log('error', `⚠ ALARME SALLE activée — Dr. Martin notifiée IMMÉDIATEMENT`);
    alertCount++;
  } else if (isAlert) {
    log('warn', `SMS + Appel envoyés à Dr. Martin`);
    alertCount++;
  }

  // Counters
  document.getElementById('cycleCount').textContent  = cycleNum;
  document.getElementById('avgLatency').textContent  = avg + 'ms';
  document.getElementById('alertCount').textContent  = alertCount;

  document.getElementById('sendIndicator').classList.remove('visible');

  await sleep(400);
  setNode('node-dash', 'done');
  setDetail('detail-dash', 'done');

  // Legend info
  document.getElementById('legendInfo').innerHTML =
    `Cycle <strong>#${cycleNum}</strong> — ${cfg.label} — Latence totale : <strong>${totalMs}ms</strong>`;
}

// ══════════════════════════════════════════════
// MINI DASHBOARD UPDATE
// ══════════════════════════════════════════════
function updateMiniDashboard(vitals, cfg, isCrit, isAlert) {
  const cls = isCrit ? 'vital-crit' : isAlert ? 'vital-warn' : 'vital-ok';

  document.getElementById('dashHR').textContent   = vitals.hr;
  document.getElementById('dashSPO2').textContent = vitals.spo2;
  document.getElementById('dashTemp').textContent = vitals.temp;
  document.getElementById('dashBP').textContent   = `${vitals.sbp}/${vitals.dbp}`;

  ['mdHR', 'mdSPO2', 'mdTemp', 'mdBP'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.className = 'md-vital ' + cls;
  });

  const az   = document.getElementById('mdAlertZone');
  const icon = document.getElementById('mdaIcon');
  const text = document.getElementById('mdaText');
  if (az)   az.className   = 'md-alert-zone ' + cfg.alertZone;
  if (icon) icon.textContent = cfg.alertIcon;
  if (text) text.textContent = cfg.alertMsg;

  document.getElementById('mdbMode').textContent = cfg.adaptMode;
  document.getElementById('mdbFreq').textContent = `ECG ${cfg.ecgHz} · ${cfg.network}`;
}

// ══════════════════════════════════════════════
// START / STOP
// ══════════════════════════════════════════════
function startSimulation() {
  if (running) return;
  running = true;

  document.getElementById('btnStart').disabled = true;
  document.getElementById('btnStop').disabled  = false;

  const dot  = document.querySelector('.sim-dot');
  const stxt = document.getElementById('simStatusText');
  dot.className  = 'sim-dot running';
  stxt.textContent = 'En cours';

  log('system', '═══ SIMULATION DÉMARRÉE ═══');
  log('system', `Patient P-0042 — Ahmed Benali — Dispositif BLE IoT v2`);
  log('system', `Moteur d'adaptation v2.3 — TimescaleDB — Kafka Stream actif`);

  function loop() {
    if (!running) return;
    runCycle().then(() => {
      const interval = STATES[currentState].interval;
      simTimer = setTimeout(loop, interval);
    });
  }
  loop();
}

function stopSimulation() {
  running = false;
  clearTimeout(simTimer);
  if (ecgAnimFrame) cancelAnimationFrame(ecgAnimFrame);

  document.getElementById('btnStart').disabled = false;
  document.getElementById('btnStop').disabled  = true;

  const dot  = document.querySelector('.sim-dot');
  const stxt = document.getElementById('simStatusText');
  dot.className  = 'sim-dot idle';
  stxt.textContent = 'Arrêté';

  document.getElementById('sendIndicator').classList.remove('visible');

  // Reset all nodes
  ['ws', 'db', 'api', 'dash'].forEach(n => {
    setNode('node-' + n, '');
    setDetail('detail-' + n, '');
  });

  log('system', `═══ SIMULATION ARRÊTÉE — ${cycleNum} cycles exécutés ═══`);
}
