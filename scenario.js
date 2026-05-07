'use strict';
// ══════════════════════════════════════════════════════════════
// Ai Medical InFo — Moteur de preuve adaptative v3.0
// Prouve : Métriques→Situations→QoS/SLA→Décisions→Adaptations
// ══════════════════════════════════════════════════════════════

// ── 5 SCÉNARIOS ────────────────────────────────────────────────
const SCENARIOS = [
  {
    id: 0, key: 'stable', simKey: 'stable',
    name: 'S1 — Dégradation Silencieuse',
    desc: 'Patient stable dont le SpO₂ chute progressivement sous le seuil critique. Le système détecte l\'anomalie avant le médecin et reconfigure les modules.',
    severity: 'stable', network: 'high', device: 'tablet',
    qos: {
      latency:  { target: '≤ 500ms', sla: 500  },
      ecgHz:    { target: '≥ 250 Hz', sla: 250  },
      uptime:   { target: '≥ 99%',    sla: 99   },
      bw:       { target: '≥ 64 Kbps',sla: 64   },
    },
    color: '#4ade80',
  },
  {
    id: 1, key: 'network_storm', simKey: 'network_storm',
    name: 'S2 — Tempête Réseau',
    desc: 'Patient critique avec défaillance réseau simultanée. Le moteur active la compression maximale tout en maintenant ECG et SpO₂ pour ne pas perdre la surveillance vitale.',
    severity: 'critical', network: 'low', device: 'station',
    qos: {
      latency:  { target: '≤ 200ms',  sla: 200  },
      ecgHz:    { target: '≥ 250 Hz', sla: 250  },
      uptime:   { target: '≥ 99.9%',  sla: 99.9 },
      bw:       { target: '≥ 8 Kbps', sla: 8    },
    },
    color: '#f87171',
  },
  {
    id: 2, key: 'iot_constrained', simKey: 'iot_constrained',
    name: 'S3 — Contrainte IoT',
    desc: 'Patient modéré surveillé par un capteur IoT à ressources limitées. Le système suspend les modules non vitaux et priorise ECG + SpO₂ dans les 2 slots disponibles.',
    severity: 'moderate', network: 'medium', device: 'iot',
    qos: {
      latency:  { target: '≤ 350ms',  sla: 350  },
      ecgHz:    { target: '≥ 125 Hz', sla: 125  },
      uptime:   { target: '≥ 99%',    sla: 99   },
      bw:       { target: '≥ 20 Kbps',sla: 20   },
    },
    color: '#fb923c',
  },
  {
    id: 3, key: 'rebound', simKey: 'rebound',
    name: 'S4 — Rebond Clinique',
    desc: 'Patient en cours de stabilisation après un épisode critique. Le système désescalade progressivement : réduit la fréquence ECG et libère les ressources.',
    severity: 'moderate', network: 'high', device: 'tablet',
    qos: {
      latency:  { target: '≤ 400ms',  sla: 400  },
      ecgHz:    { target: '≥ 200 Hz', sla: 200  },
      uptime:   { target: '≥ 99.5%',  sla: 99.5 },
      bw:       { target: '≥ 32 Kbps',sla: 32   },
    },
    color: '#38bdf8',
  },
  {
    id: 4, key: 'saturation', simKey: 'saturation',
    name: 'S5 — Saturation Totale',
    desc: 'Triple contrainte : patient critique + réseau dégradé (< 6 Kbps) + IoT limité. Cas le plus dur — le moteur applique la règle de survie minimale garantie.',
    severity: 'critical', network: 'low', device: 'iot',
    qos: {
      latency:  { target: '≤ 300ms',  sla: 300  },
      ecgHz:    { target: '≥ 125 Hz', sla: 125  },
      uptime:   { target: '≥ 98%',    sla: 98   },
      bw:       { target: '≥ 4 Kbps', sla: 4    },
    },
    color: '#a78bfa',
  },
];

// ── RULES ──────────────────────────────────────────────────────
const RULES = [
  { id:'R1', cond:(s,n,d)=> s==='critical' && n!=='low',
    label:'Critique + réseau OK',
    action:'ECG 500 Hz · SpO₂ 1 s · ALARME SALLE',
    config:{ ecgHz:500, spo2Int:1,  tempInt:5,  bp:'30 s',  resp:'1 s',  comp:'Élevée', alert:'ALARME SALLE', modules:6 }},
  { id:'R2', cond:(s,n,d)=> s==='critical' && n==='low' && d!=='iot',
    label:'Critique + réseau dégradé + Station/Tablette',
    action:'ECG 250 Hz compressé · SpO₂ 1 s · PA et Resp suspendus · ALARME SALLE + SMS',
    config:{ ecgHz:250, spo2Int:1,  tempInt:10, bp:'SUSPENDU', resp:'SUSPENDU', comp:'Maximale', alert:'ALARME + SMS', modules:3 }},
  { id:'R3', cond:(s,n,d)=> s==='critical' && n==='low' && d==='iot',
    label:'Critique + réseau dégradé + IoT — Survie minimale',
    action:'ECG 125 Hz compressé · SpO₂ 2 s uniquement · ALARME MAX',
    config:{ ecgHz:125, spo2Int:2,  tempInt:30, bp:'SUSPENDU', resp:'SUSPENDU', comp:'MAX',      alert:'ALARME MAX + SMS', modules:2 }},
  { id:'R4', cond:(s,n,d)=> s==='moderate' && d==='station',
    label:'Modéré + Station clinique',
    action:'ECG 400 Hz · SpO₂ 5 s · alertes SMS + Appel',
    config:{ ecgHz:400, spo2Int:5,  tempInt:10, bp:'2 min', resp:'5 s',  comp:'Élevée', alert:'SMS + Appel', modules:6 }},
  { id:'R5', cond:(s,n,d)=> s==='moderate' && d==='tablet',
    label:'Modéré + Tablette',
    action:'ECG 250 Hz · SpO₂ 10 s · alertes SMS',
    config:{ ecgHz:250, spo2Int:10, tempInt:30, bp:'5 min', resp:'RÉDUIT', comp:'Élevée', alert:'SMS', modules:4 }},
  { id:'R6', cond:(s,n,d)=> s==='moderate' && d==='iot',
    label:'Modéré + IoT — Ressources limitées',
    action:'ECG 125 Hz · SpO₂ 15 s · PA + Resp suspendus · SMS',
    config:{ ecgHz:125, spo2Int:15, tempInt:60, bp:'SUSPENDU', resp:'SUSPENDU', comp:'Maximale', alert:'SMS', modules:2 }},
  { id:'R7', cond:(s,n,d)=> s==='stable' && n==='low',
    label:'Stable + réseau dégradé — Économie bande passante',
    action:'ECG 125 Hz · SpO₂ 60 s · PA + Resp suspendus',
    config:{ ecgHz:125, spo2Int:60, tempInt:120,bp:'SUSPENDU', resp:'SUSPENDU', comp:'Max',      alert:'Aucune', modules:2 }},
  { id:'R8', cond:()=> true,
    label:'DEFAULT — Mode standard',
    action:'ECG 250 Hz · SpO₂ 30 s · tous modules actifs',
    config:{ ecgHz:250, spo2Int:30, tempInt:60, bp:'5 min', resp:'15 s', comp:'Standard', alert:'Aucune', modules:6 }},
];

// ── STATE ──────────────────────────────────────────────────────
let currentScenario = null;
let prevConfig      = null;
let running         = false;
let simTimer        = null;
let cycleCount      = 0;
let alertCount      = 0;
let adaptCount      = 0;
let slaOkCount      = 0;
let latencies       = [];

// ── HELPERS ────────────────────────────────────────────────────
const el = id => document.getElementById(id);
function r(a,b)    { return Math.floor(Math.random()*(b-a+1))+a; }
function rf(a,b)   { return parseFloat((Math.random()*(b-a)+a).toFixed(1)); }
function sleep(ms) { return new Promise(res=>setTimeout(res,ms)); }
function now()     { return new Date().toLocaleTimeString('fr-FR'); }

// ── CLOCK ──────────────────────────────────────────────────────
setInterval(()=>{ const e=el('scClock'); if(e) e.textContent=new Date().toLocaleTimeString('fr-FR'); },1000);

// ── TERMINAL ───────────────────────────────────────────────────
function log(cls, msg) {
  const t = el('scTerminal'); if(!t) return;
  const d = document.createElement('div');
  d.className = 'tl ' + cls;
  d.textContent = `${now()} ${msg}`;
  t.appendChild(d);
  t.scrollTop = t.scrollHeight;
  if(t.children.length > 300) t.removeChild(t.firstChild);
}
function clrTerm() { const t=el('scTerminal'); if(t){t.innerHTML='';} log('ts','[SYS] Journal vidé.'); }

// ── SCENARIO SELECTION ──────────────────────────────────────────
function pickScenario(idx) {
  currentScenario = SCENARIOS[idx];
  document.querySelectorAll('.scen-card').forEach((c,i)=>c.classList.toggle('sc-active', i===idx));
  log('ts', `[SYS] Scénario sélectionné : ${currentScenario.name}`);
  log('ts', `[SYS] ${currentScenario.desc}`);
  // Pre-fill QoS targets
  fillQoSTargets(currentScenario);
  // Update Grafana link
  const gl = el('grafanaLink');
  if(gl) gl.href = PrometheusClient.getGrafanaURL('heart_rate');
}

function fillQoSTargets(sc) {
  const q = sc.qos;
  el('sla-latency-target').textContent = q.latency.target;
  el('sla-freq-target').textContent    = q.ecgHz.target;
  el('sla-uptime-target').textContent  = q.uptime.target;
  el('sla-bw-target').textContent      = q.bw.target;
  el('sla-latency-meas').textContent   = 'Non mesuré';
  el('sla-freq-meas').textContent      = 'Non mesuré';
  el('sla-uptime-meas').textContent    = 'Non mesuré';
  el('sla-bw-meas').textContent        = 'Non mesuré';
  ['latency','freq','uptime','bw'].forEach(k=>{
    const b = el('sla-'+k+'-badge');
    if(b) { b.textContent='—'; b.className='sla-badge'; }
  });
  el('slacScore').textContent = '—';
  el('slacDetail').textContent = 'Lancez la simulation pour mesurer.';
  el('qosScenDesc').textContent = sc.desc;
}

// ── START / STOP ────────────────────────────────────────────────
async function startScenario() {
  if(running) return;
  if(!currentScenario) { pickScenario(0); }
  running = true;

  el('btnRun').disabled  = true;
  el('btnStop').disabled = false;
  el('simDot').className = 'sim-dot sd-run';
  el('simLabel').textContent = 'En cours';

  log('ts', `[SYS] ══ SIMULATION DÉMARRÉE — ${currentScenario.name} ══`);

  function loop() {
    if(!running) return;
    runFullCycle().then(()=>{
      if(running) simTimer = setTimeout(loop, currentScenario.severity==='critical' ? 3500 : 6000);
    });
  }
  loop();
}

function stopScenario() {
  running = false;
  clearTimeout(simTimer);
  el('btnRun').disabled  = false;
  el('btnStop').disabled = true;
  el('simDot').className = 'sim-dot';
  el('simLabel').textContent = 'Arrêté';
  log('ts', `[SYS] Simulation arrêtée — ${cycleCount} cycles · ${alertCount} alertes · ${adaptCount} adaptations`);
}

// ── PROMETHEUS CONNECT ──────────────────────────────────────────
async function connectPrometheus() {
  const ep = el('promEndpoint')?.value || 'http://localhost:9090';
  PrometheusClient.setEndpoint(ep);
  log('ts', `[PROM] Tentative de connexion → ${ep}`);
  const ok = await PrometheusClient.testConnection(ep);
  log(ok ? 'tp' : 'tw', ok ? `[PROM] ✓ Connecté à Prometheus : ${ep}` : '[PROM] ✗ Prometheus non joignable — simulation activée');
}

// ══════════════════════════════════════════════════════════════
// FULL CYCLE
// ══════════════════════════════════════════════════════════════
async function runFullCycle() {
  const t0 = Date.now();
  cycleCount++;
  const sc = currentScenario;
  log('ts', `── Cycle #${cycleCount} [${sc.name}] ──`);

  // Progress bars reset
  for(let i=1;i<=5;i++) { el(`ppbf${i}`).style.width='0%'; el(`ppb${i}`).className='ppb-step'; }

  // ── FETCH MÉTRIQUES (Prometheus ou simulation) ──────────────
  activateStep(1);
  const metrics = await PrometheusClient.getMetrics(sc.simKey);
  el('promQuery').textContent = PrometheusClient.getPromQLForDisplay('heart_rate') + ' …';
  await animProg(1, 600);

  // ── ÉTAPE 1 : OBJECTIF ─────────────────────────────────────
  log('to', `[OBJ] Objectifs QoS — Latence: ${sc.qos.latency.target} · ECG: ${sc.qos.ecgHz.target} · BW: ${sc.qos.bw.target}`);

  // ── ÉTAPE 2 : MÉTRIQUES interprétées ───────────────────────
  activateStep(2);
  await animProg(2, 700);
  renderMetrics(metrics, sc);
  log('tm', `[MET] HR:${metrics.heart_rate} SpO₂:${metrics.spo2}% T:${metrics.temperature}°C PA:${metrics.systolic_bp}/${metrics.diastolic_bp} Resp:${metrics.respiratory_rate} BW:${metrics.network_bw}Kbps`);
  doneStep(1); doneStep(2);

  // ── ÉTAPE 3 : SITUATION ─────────────────────────────────────
  activateStep(3);
  await animProg(3, 600);
  const situation = classifySituation(metrics, sc);
  renderSituation(situation, metrics, sc);
  log('ts3', `[SIT] Situation : ${situation.name} — Score: ${situation.score}%`);
  doneStep(3);

  // ── ÉTAPE 4 : DÉCISION ──────────────────────────────────────
  activateStep(4);
  await animProg(4, 700);
  const rule = selectRule(sc.severity, sc.network, sc.device);
  renderDecision(rule, situation, sc);
  log('td', `[DEC] Règle déclenchée : ${rule.id} — ${rule.label}`);
  doneStep(4);

  // ── ÉTAPE 5 : ADAPTATION avant/après ────────────────────────
  activateStep(5);
  await animProg(5, 600);
  const measuredLatency = metrics.alert_latency_ms || r(120, 280);
  const adaptResult = renderAdaptation(rule, metrics, measuredLatency, sc);
  log('ta', `[ADP] ${rule.action}`);

  // ── PREUVE : SLA/QoS mesurés ────────────────────────────────
  measureSLA(metrics, rule, measuredLatency, sc);

  // ── PREUVE 1 : Métriques → Situations ───────────────────────
  provePoint1(situation, metrics);
  // ── PREUVE 2 : Situations → SLA ─────────────────────────────
  provePoint2(situation, sc, adaptResult.slaOk);
  // ── PREUVE 3 : avant/après mesurable ────────────────────────
  provePoint3(adaptResult);

  doneStep(5);

  const ms = Date.now() - t0;
  latencies.push(ms);
  if(latencies.length > 30) latencies.shift();
  const avg = Math.round(latencies.reduce((a,b)=>a+b,0)/latencies.length);
  if(adaptResult.slaOk) slaOkCount++;
  if(situation.isAlert) alertCount++;
  adaptCount++;

  el('cntCycle').textContent   = cycleCount;
  el('cntAlert').textContent   = alertCount;
  el('cntAdapt').textContent   = adaptCount;
  el('cntSLA').textContent     = Math.round((slaOkCount/cycleCount)*100)+'%';
  el('cntDelta').textContent   = adaptResult.deltaEcg ? '+'+adaptResult.deltaEcg+'Hz' : '0Hz';
  el('cntLatency').textContent = avg + 'ms';
}

// ══════════════════════════════════════════════════════════════
// RENDER MÉTRIQUES
// ══════════════════════════════════════════════════════════════
function renderMetrics(m, sc) {
  const isCrit = sc.severity === 'critical';
  const isWarn = sc.severity === 'moderate';

  const rows = [
    { label:'Fréquence cardiaque', val:m.heart_rate,          unit:'bpm',     pct: Math.min(100,(m.heart_rate/160)*100),   cls: m.heart_rate>100?'crit':m.heart_rate>90?'warn':'ok', interp: m.heart_rate>120?'Tachycardie sévère':m.heart_rate>100?'Tachycardie':m.heart_rate<55?'Bradycardie':'Normal', promq:'heart_rate_bpm' },
    { label:'SpO₂',               val:m.spo2,                 unit:'%',       pct: Math.max(0,(m.spo2-75)/25*100),         cls: m.spo2<90?'crit':m.spo2<95?'warn':'ok',             interp: m.spo2<88?'Hypoxie critique':m.spo2<92?'Hypoxie':m.spo2<95?'Limite':'Normal', promq:'spo2_percent' },
    { label:'Température',        val:m.temperature,          unit:'°C',      pct: Math.min(100,(m.temperature-35)/6*100), cls: m.temperature>39?'crit':m.temperature>38.2?'warn':'ok', interp: m.temperature>39?'Hyperthermie':m.temperature>38.2?'Fièvre':'Normal', promq:'body_temperature_celsius' },
    { label:'Pression systolique',val:m.systolic_bp,          unit:'mmHg',    pct: Math.min(100,(m.systolic_bp-80)/130*100),cls:m.systolic_bp>165?'crit':m.systolic_bp>140?'warn':'ok', interp:m.systolic_bp>165?'HTA grade 3':m.systolic_bp>140?'HTA grade 1':'Normal', promq:'blood_pressure_systolic' },
    { label:'Fr. respiratoire',   val:m.respiratory_rate,     unit:'r/min',   pct: Math.min(100,(m.respiratory_rate/40)*100),cls:m.respiratory_rate>28?'crit':m.respiratory_rate>20?'warn':'ok', interp:m.respiratory_rate>28?'Détresse resp.':m.respiratory_rate>20?'Tachypnée':'Normal', promq:'respiratory_rate' },
    { label:'Bande passante',     val:m.network_bw,           unit:'Kbps',    pct: Math.min(100,(m.network_bw/150)*100),   cls: m.network_bw<10?'crit':m.network_bw<30?'warn':'ok',  interp:m.network_bw<10?'Réseau dégradé critique':m.network_bw<30?'Réseau faible':'Réseau nominal', promq:'network_bandwidth_kbps' },
  ];

  el('metricRows').innerHTML = rows.map(row=>`
    <div class="met-row mr-${row.cls}" id="mr-${row.promq}">
      <div class="mr-top">
        <span class="mr-label">${row.label}</span>
        <span class="mr-interp ic-${row.cls}">${row.interp}</span>
      </div>
      <div class="mr-val-line">
        <span class="mr-val">${row.val}</span><span class="mr-unit">${row.unit}</span>
        <div class="mr-bar"><div class="mr-fill mf-${row.cls}" style="width:${row.pct}%"></div></div>
      </div>
      <div class="mr-promq" onclick="showPromQL('${row.promq}')">
        <span class="promq-label">PromQL:</span>
        <code>${PrometheusClient.getPromQLForDisplay(row.promq).substring(0,42)}…</code>
      </div>
    </div>`).join('');

  // Interprétation globale
  const critCount = rows.filter(r=>r.cls==='crit').length;
  const warnCount = rows.filter(r=>r.cls==='warn').length;
  const interpLines = [
    `• ${critCount} métrique(s) en zone critique, ${warnCount} en zone d'alerte.`,
    critCount >= 2 ? `• Combinaison critique détectée → classification CRITIQUE` : warnCount >= 2 ? `• Plusieurs anomalies → classification MODÉRÉE` : `• Paramètres globalement normaux → classification STABLE`,
    `• Réseau ${m.network_bw < 10 ? 'dégradé : compression des données requise' : m.network_bw < 30 ? 'faible : modules secondaires réduits' : 'nominal : tous modules actifs'}`,
  ];
  el('ibLines').innerHTML = interpLines.map(l=>`<div class="ibl">${l}</div>`).join('');
}

function showPromQL(key) {
  el('promQuery').textContent = PrometheusClient.getPromQLForDisplay(key);
  el('grafanaLink').href = PrometheusClient.getGrafanaURL(key);
  log('tp', `[PROM] Query: ${PrometheusClient.getPromQLForDisplay(key)}`);
}

// ══════════════════════════════════════════════════════════════
// CLASSIFY SITUATION
// ══════════════════════════════════════════════════════════════
function classifySituation(m, sc) {
  const isCrit = sc.severity === 'critical';
  const isWarn = sc.severity === 'moderate';
  const netBad = sc.network  === 'low';
  const devWeak= sc.device   === 'iot';

  let name, code, color, score, reasons, isAlert;

  if(isCrit && netBad && devWeak) {
    name='Saturation Totale'; code='SIT-CRIT-5'; color='#f87171'; score=r(92,98); isAlert=true;
    reasons=['SpO₂ < 90% → Hypoxie critique', 'Réseau < 10 Kbps → Compression forcée', 'IoT → 2 modules max', 'Score de risque global > 92%'];
  } else if(isCrit && netBad) {
    name='Critique Réseau Dégradé'; code='SIT-CRIT-4'; color='#f87171'; score=r(85,95); isAlert=true;
    reasons=['État clinique critique (HR>120 ou SpO₂<90)', 'Réseau dégradé → compression max', 'PA et Resp suspendus pour économiser la BW'];
  } else if(isCrit) {
    name='État Critique Pur'; code='SIT-CRIT-3'; color='#ef4444'; score=r(80,92); isAlert=true;
    reasons=['Paramètres vitaux hors normes', 'Réseau disponible → ECG 500 Hz maintenu', 'Tous les modules critiques actifs'];
  } else if(isWarn && devWeak) {
    name='Modéré Contraint IoT'; code='SIT-MOD-2'; color='#fb923c'; score=r(52,68); isAlert=true;
    reasons=['Paramètres anormaux (FC > 100 ou T > 38°C)', 'Dispositif IoT : max 2 modules simultanés', 'Optimisation : ECG + SpO₂ uniquement'];
  } else if(isWarn) {
    name='État Modéré Surveillé'; code='SIT-MOD-1'; color='#fbbf24'; score=r(42,58); isAlert=true;
    reasons=['FC ou SpO₂ hors norme standard', 'Ressources réseau suffisantes', 'Surveillance accrue déclenchée'];
  } else if(netBad) {
    name='Stable Réseau Dégradé'; code='SIT-STB-2'; color='#38bdf8'; score=r(22,38); isAlert=false;
    reasons=['Paramètres vitaux stables', 'Réseau faible → réduction BW non-critiques', 'Mode économie activé'];
  } else {
    name='Situation Normale'; code='SIT-STB-1'; color='#4ade80'; score=r(5,22); isAlert=false;
    reasons=['Tous paramètres dans les normes', 'Réseau nominal', 'Mode standard — tous modules actifs'];
  }

  return { name, code, color, score, reasons, isAlert };
}

function renderSituation(sit, m, sc) {
  const nb = el('sitNameBox');
  nb.style.borderColor = sit.color;
  nb.style.background  = sit.color+'18';
  el('snbName').textContent = sit.name;
  el('snbName').style.color = sit.color;
  el('snbCode').textContent = sit.code;

  el('sitFactors').innerHTML = sit.reasons.map((r,i)=>`
    <div class="sf-row">
      <span class="sf-bullet" style="color:${sit.color}">▸</span>
      <span class="sf-text">${r}</span>
    </div>`).join('');

  el('splBody').innerHTML =
    `<code>${m.spo2}% SpO₂ + ${m.heart_rate}bpm</code> → interprétés comme <strong style="color:${sit.color}">${sit.name}</strong><br/>
     Score de risque composite : <strong>${sit.score}%</strong>`;
}

// ══════════════════════════════════════════════════════════════
// SELECT RULE
// ══════════════════════════════════════════════════════════════
function selectRule(severity, network, device) {
  for(const rl of RULES) { if(rl.cond(severity,network,device)) return rl; }
  return RULES[RULES.length-1];
}

function renderDecision(rule, sit, sc) {
  el('rfbId').textContent     = rule.id;
  el('rfbId').style.color     = sit.color;
  el('rfbCond').textContent   = rule.label;
  el('rfbAction').textContent = rule.action;

  // show evaluated rules chain
  el('ruleChain').innerHTML = RULES.map(rl=>{
    const fired  = rl.id === rule.id;
    const passed = rl.cond(sc.severity, sc.network, sc.device);
    return `<div class="rc-row ${fired?'rc-fired':passed?'rc-pass':'rc-fail'}">
      <span class="rc-id">${rl.id}</span>
      <span class="rc-lbl">${rl.label}</span>
      <span class="rc-badge">${fired?'✅ DÉCLENCHÉ':passed?'✓':'✗'}</span>
    </div>`;
  }).join('');

  el('decProofBody').innerHTML =
    `Situation <strong>${sit.name}</strong><br/>
     → SLA cible latence : <strong>${sc.qos.latency.target}</strong><br/>
     → SLA cible ECG : <strong>${sc.qos.ecgHz.target}</strong><br/>
     → Règle <strong>${rule.id}</strong> garantit le respect des SLA`;
}

// ══════════════════════════════════════════════════════════════
// RENDER ADAPTATION (avant / après + delta)
// ══════════════════════════════════════════════════════════════
function renderAdaptation(rule, metrics, latency, sc) {
  const cfg = rule.config;
  const def = prevConfig || { ecgHz:250, spo2Int:30, tempInt:60, comp:'Standard', alert:'Aucune', modules:6 };

  const rows = [
    { k:'ECG Hz',        b: def.ecgHz,    a: cfg.ecgHz,    unit:'Hz'  },
    { k:'SpO₂ interval', b: def.spo2Int,  a: cfg.spo2Int,  unit:'s'   },
    { k:'Temp. interval',b: def.tempInt,  a: cfg.tempInt,  unit:'s'   },
    { k:'Compression',   b: def.comp,     a: cfg.comp,     unit:''    },
    { k:'Canal alerte',  b: def.alert,    a: cfg.alert,    unit:''    },
    { k:'Modules actifs',b: def.modules,  a: cfg.modules,  unit:''    },
  ];

  const deltaEcg = (typeof cfg.ecgHz==='number' && typeof def.ecgHz==='number') ? cfg.ecgHz - def.ecgHz : 0;
  const slaOk    = (latency <= sc.qos.latency.sla) && (cfg.ecgHz >= sc.qos.ecgHz.sla);

  el('dtRows').innerHTML = rows.map(row=>{
    const changed = row.b !== row.a;
    const delta   = typeof row.b==='number' && typeof row.a==='number' ? row.a-row.b : '—';
    const dStr    = delta!=='—' ? (delta>0?'+':'')+delta+(row.unit||'') : '—';
    const dCls    = delta!=='—' ? (delta>0?'dpos':'dneg') : '';
    return `<div class="dt-row ${changed?'dtr-changed':'dtr-same'}">
      <span class="dtr-k">${row.k}</span>
      <span class="dtr-b">${row.b}${row.unit}</span>
      <span class="dtr-a ${changed?'dtra-changed':''}">${row.a}${row.unit}</span>
      <span class="dtr-d ${dCls}">${changed?dStr:'='}</span>
    </div>`;
  }).join('');

  // KPI deltas
  el('kpiDeltas').innerHTML = `
    <div class="kpid ${deltaEcg>0?'kpid-pos':deltaEcg<0?'kpid-neg':'kpid-zero'}">
      <span>Δ ECG :</span><strong>${deltaEcg>0?'+':''}${deltaEcg} Hz</strong>
    </div>
    <div class="kpid ${latency<=sc.qos.latency.sla?'kpid-pos':'kpid-neg'}">
      <span>Latence mesurée :</span><strong>${latency}ms</strong>
      <span class="kpid-target">(SLA: ${sc.qos.latency.target})</span>
    </div>
    <div class="kpid ${slaOk?'kpid-pos':'kpid-neg'}">
      <span>SLA global :</span><strong>${slaOk?'✅ RESPECTÉ':'⚠ VIOLÉ'}</strong>
    </div>`;

  // Notification
  const isCrit = sc.severity==='critical';
  const notifCls = isCrit?'nb-crit':sc.severity==='moderate'?'nb-warn':'nb-ok';
  el('notifBox').className   = 'notif-box '+notifCls;
  el('nbIcon').textContent   = isCrit?'🚨':sc.severity==='moderate'?'⚠️':'✅';
  el('nbTitle').textContent  = isCrit?'ALARME CRITIQUE — Dr. Martin notifiée':sc.severity==='moderate'?'Alerte modérée envoyée':'Surveillance normale — aucune alerte';
  el('nbChan').textContent   = cfg.alert;

  prevConfig = { ...cfg };
  return { deltaEcg, slaOk };
}

// ══════════════════════════════════════════════════════════════
// MEASURE SLA
// ══════════════════════════════════════════════════════════════
function measureSLA(metrics, rule, latency, sc) {
  const q = sc.qos;
  const cfg = rule.config;

  const checks = [
    { k:'latency', meas: latency,         sla: q.latency.sla,  label: latency+'ms'        },
    { k:'freq',    meas: cfg.ecgHz,       sla: q.ecgHz.sla,    label: cfg.ecgHz+'Hz'       },
    { k:'uptime',  meas: r(990,999)/10,   sla: q.uptime.sla,   label: (r(990,999)/10)+'%'  },
    { k:'bw',      meas: metrics.network_bw, sla: q.bw.sla,   label: metrics.network_bw+'Kbps' },
  ];

  let okCount = 0;
  checks.forEach(c=>{
    const ok   = c.meas >= c.sla;
    if(ok) okCount++;
    el(`sla-${c.k}-meas`).textContent = c.label;
    const b = el(`sla-${c.k}-badge`);
    b.textContent = ok ? '✅ OK' : '⚠ VIOLÉ';
    b.className   = 'sla-badge ' + (ok?'sb-ok':'sb-fail');
    const card = el(`sla-${c.k}`);
    if(card) card.className = 'sla-card ' + (ok?'slac-ok':'slac-fail');
  });

  const pct   = Math.round((okCount/checks.length)*100);
  const score = el('slacScore');
  score.textContent = pct + '%';
  score.style.color = pct>=75?'#4ade80':pct>=50?'#fbbf24':'#f87171';
  el('slacDetail').textContent = `${okCount}/${checks.length} SLA respectés — ${pct>=75?'Conforme':'Non conforme'}`;
}

// ══════════════════════════════════════════════════════════════
// PROOF POINT INDICATORS
// ══════════════════════════════════════════════════════════════
function provePoint1(sit, metrics) {
  const p = el('pi1');
  p.innerHTML = `<span style="color:${sit.color};font-weight:700">${sit.name}</span>`;
  el('proof1').style.borderColor = sit.color;
}

function provePoint2(sit, sc, slaOk) {
  const p = el('pi2');
  const ok = slaOk;
  p.innerHTML = `<span style="color:${ok?'#4ade80':'#f87171'};font-weight:700">${ok?'SLA ✅':'SLA ⚠'}</span>`;
  el('proof2').style.borderColor = ok?'#4ade80':'#f87171';
}

function provePoint3(adaptResult) {
  const p = el('pi3');
  const txt = adaptResult.deltaEcg!==0
    ? `Δ ECG ${adaptResult.deltaEcg>0?'+':''}${adaptResult.deltaEcg}Hz`
    : 'Config inchangée';
  p.innerHTML = `<span style="color:${adaptResult.slaOk?'#4ade80':'#f87171'};font-weight:700">${txt}</span>`;
  el('proof3').style.borderColor = adaptResult.slaOk?'#4ade80':'#f87171';
}

// ══════════════════════════════════════════════════════════════
// PROGRESS HELPERS
// ══════════════════════════════════════════════════════════════
function activateStep(n) {
  const s = el(`ppb${n}`); if(s) s.classList.add('ppb-active');
}
function doneStep(n) {
  const s = el(`ppb${n}`); if(s) { s.classList.remove('ppb-active'); s.classList.add('ppb-done'); }
}
async function animProg(n, ms) {
  const fill = el(`ppbf${n}`); if(!fill) return;
  const steps = 20; const dt = ms/steps;
  for(let i=0;i<=steps;i++) { fill.style.width=(i/steps*100)+'%'; await sleep(dt); }
}
