'use strict';
// ══════════════════════════════════════════════════════════════
// Ai Medical InFo — Orchestrateur v4.0
// Coordonne les 5 modules dans l'ordre :
// M1 Generator → M2 Monitoring → M3 OSM → M4 Decision → M5 Evidence
// ══════════════════════════════════════════════════════════════

let currentScenario   = null;
let running           = false;
let simTimer          = null;
let cycleCount        = 0;
let alertCount        = 0;
let adaptCount        = 0;
let slaOkCount        = 0;
let latencies         = [];
window._lastSituation = null;

const el   = id => document.getElementById(id);
const sleep = ms => new Promise(res => setTimeout(res, ms));
const now   = ()  => new Date().toLocaleTimeString('fr-FR');

// ── Clock ──────────────────────────────────────────────────
setInterval(() => { const e = el('scClock'); if (e) e.textContent = now(); }, 1000);

// ── Terminal ───────────────────────────────────────────────
function log(cls, msg) {
  const t = el('scTerminal'); if (!t) return;
  const d = document.createElement('div');
  d.className   = 'tl ' + cls;
  d.textContent = `${now()} ${msg}`;
  t.appendChild(d);
  t.scrollTop = t.scrollHeight;
  if (t.children.length > 300) t.removeChild(t.firstChild);
}
function clrTerm() { const t = el('scTerminal'); if (t) t.innerHTML = ''; log('ts', '[SYS] Journal vidé.'); }

// ── Scenario selection ─────────────────────────────────────
function pickScenario(idx) {
  currentScenario = ScenarioGenerator.getScenario(idx);
  document.querySelectorAll('.scen-card').forEach((c, i) => c.classList.toggle('sc-active', i === idx));
  log('ts', `[M1] Scénario : ${currentScenario.name}`);
  log('ts', `[M1] ${currentScenario.desc}`);
  _fillQoSTargets(currentScenario);
  const gl = el('grafanaLink');
  if (gl) gl.href = PrometheusClient.getGrafanaURL('heart_rate');
}

function _fillQoSTargets(sc) {
  const q = sc.qos;
  el('sla-latency-target').textContent = q.latency.target;
  el('sla-freq-target').textContent    = q.ecgHz.target;
  el('sla-uptime-target').textContent  = q.uptime.target;
  el('sla-bw-target').textContent      = q.bw.target;
  ['latency', 'freq', 'uptime', 'bw'].forEach(k => {
    el(`sla-${k}-meas`).textContent = 'Non mesuré';
    const b = el(`sla-${k}-badge`);
    if (b) { b.textContent = '—'; b.className = 'sla-badge'; }
  });
  el('slacScore').textContent   = '—';
  el('slacDetail').textContent  = 'Lancez la simulation pour mesurer.';
  el('qosScenDesc').textContent = sc.desc;
}

// ── Start / Stop ───────────────────────────────────────────
async function startScenario() {
  if (running) return;
  if (!currentScenario) pickScenario(0);
  running = true;
  el('btnRun').disabled  = true;
  el('btnStop').disabled = false;
  el('simDot').className = 'sim-dot sd-run';
  el('simLabel').textContent = 'En cours';
  log('ts', `[SYS] ══ DÉMARRAGE — ${currentScenario.name} ══`);

  (function loop() {
    if (!running) return;
    runFullCycle().then(() => {
      if (running) simTimer = setTimeout(loop, currentScenario.severity === 'critical' ? 3500 : 6000);
    });
  })();
}

function stopScenario() {
  running = false;
  clearTimeout(simTimer);
  el('btnRun').disabled  = false;
  el('btnStop').disabled = true;
  el('simDot').className = 'sim-dot';
  el('simLabel').textContent = 'Arrêté';
  log('ts', `[SYS] Arrêt — ${cycleCount} cycles · ${alertCount} alertes · ${adaptCount} adaptations`);
}

// ── Prometheus connection ──────────────────────────────────
async function connectPrometheus() {
  const ep = el('promEndpoint')?.value || 'http://localhost:9090';
  PrometheusClient.setEndpoint(ep);
  log('ts', `[PROM] Connexion → ${ep}`);
  const ok = await PrometheusClient.testConnection(ep);
  log(ok ? 'tp' : 'tw', ok ? `[PROM] ✓ Connecté : ${ep}` : '[PROM] ✗ Prometheus absent — simulation locale');
}

function showPromQL(key) {
  const e = el('promQuery'); if (e) e.textContent = PrometheusClient.getPromQLForDisplay(key);
  const gl = el('grafanaLink'); if (gl) gl.href = PrometheusClient.getGrafanaURL(key);
  log('tp', `[PROM] Query: ${PrometheusClient.getPromQLForDisplay(key)}`);
}

// ══════════════════════════════════════════════════════════════
// FULL CYCLE — M1 → M2 → M3 → M4 → M5
// ══════════════════════════════════════════════════════════════
async function runFullCycle() {
  const t0 = Date.now();
  cycleCount++;
  const sc = currentScenario;
  log('ts', `── Cycle #${cycleCount} [${sc.name}] ──`);

  for (let i = 1; i <= 5; i++) {
    el(`ppbf${i}`).style.width = '0%';
    el(`ppb${i}`).className = 'ppb-step';
  }

  // ── M1 : Scenario Generator ────────────────────────────
  activateStep(1);
  const context = ScenarioGenerator.generateContext(sc);
  log('to', `[M1] Contexte généré : sévérité=${context.severity} · réseau=${context.network} · device=${context.device}`);
  await animProg(1, 350);
  doneStep(1);

  // ── M2 : Monitoring Layer ──────────────────────────────
  activateStep(2);
  const metrics = await MonitoringLayer.collect(sc);
  el('promQuery').textContent = PrometheusClient.getPromQLForDisplay('heart_rate') + ' …';
  MonitoringLayer.render(metrics);
  log('tm', `[M2] HR:${metrics.heart_rate} SpO₂:${metrics.spo2}% T:${metrics.temperature}°C ` +
            `BW:${metrics.network_bw}Kbps Err:${metrics.error_rate}% CPU:${metrics.cpu_device}%`);
  await animProg(2, 550);
  doneStep(2);

  // ── M3 : OSM Situation Engine ──────────────────────────
  activateStep(3);
  const situation = SituationEngine.classify(metrics, context);
  window._lastSituation = situation;
  SituationEngine.render(situation, metrics);
  log('ts3', `[M3] OSM → ${situation.osmKey}  "${situation.name}"  score:${situation.score}%`);
  if (situation.isAlert) alertCount++;
  await animProg(3, 450);
  doneStep(3);

  // ── M4 : Decision Engine ───────────────────────────────
  activateStep(4);
  const rule = DecisionEngine.selectRule(context.severity, context.network, context.device);
  DecisionEngine.render(rule, situation, sc);
  log('td', `[M4] Règle ${rule.id} déclenchée — ${rule.action}`);
  await animProg(4, 550);
  doneStep(4);

  // ── M5 : Evidence & Evaluation ─────────────────────────
  activateStep(5);
  const latency     = metrics.alert_latency_ms || (Math.floor(Math.random() * 161) + 120);
  const adaptResult = EvidenceLayer.render(rule, metrics, latency, sc);
  EvidenceLayer.provePoints(situation, sc, adaptResult.slaOk, adaptResult.deltaEcg);
  log('ta', `[M5] Δ ECG:${adaptResult.deltaEcg > 0 ? '+' : ''}${adaptResult.deltaEcg}Hz · ` +
            `SLA:${adaptResult.slaOk ? '✅ respecté' : '⚠ violé'}`);
  await animProg(5, 450);
  doneStep(5);

  // ── Update counters ────────────────────────────────────
  const elapsed = Date.now() - t0;
  latencies.push(elapsed);
  if (latencies.length > 30) latencies.shift();
  const avg = Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length);
  if (adaptResult.slaOk) slaOkCount++;
  adaptCount++;

  el('cntCycle').textContent   = cycleCount;
  el('cntAlert').textContent   = alertCount;
  el('cntAdapt').textContent   = adaptCount;
  el('cntSLA').textContent     = Math.round((slaOkCount / cycleCount) * 100) + '%';
  el('cntDelta').textContent   = adaptResult.deltaEcg ? (adaptResult.deltaEcg > 0 ? '+' : '') + adaptResult.deltaEcg + 'Hz' : '0Hz';
  el('cntLatency').textContent = avg + 'ms';
}

// ── Progress bar helpers ───────────────────────────────────
function activateStep(n) { const s = el(`ppb${n}`); if (s) s.classList.add('ppb-active'); }
function doneStep(n)     { const s = el(`ppb${n}`); if (s) { s.classList.remove('ppb-active'); s.classList.add('ppb-done'); } }
async function animProg(n, ms) {
  const fill = el(`ppbf${n}`); if (!fill) return;
  const steps = 20; const dt = ms / steps;
  for (let i = 0; i <= steps; i++) { fill.style.width = (i / steps * 100) + '%'; await sleep(dt); }
}
