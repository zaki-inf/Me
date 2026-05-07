'use strict';

// ══════════════════════════════════════════════════════════════
// CONTEXT STATE
// ══════════════════════════════════════════════════════════════
const ctx = { severity: 'stable', network: 'high', device: 'station' };

let running    = false;
let simTimer   = null;
let cycleCount = 0;
let alertCount = 0;
let adaptCount = 0;
let latencies  = [];
let stepMode   = false;
let stepResolve = null;
let prevConfig = null;

// ══════════════════════════════════════════════════════════════
// DATA TABLES
// ══════════════════════════════════════════════════════════════
const VITALS = {
  stable:   () => ({ hr: r(68,82),  spo2: r(97,99), temp: rf(36.4,37.0), sbp: r(112,125), dbp: r(72,80),  resp: r(14,18), score: rf(1,3)  }),
  moderate: () => ({ hr: r(100,115),spo2: r(93,96), temp: rf(38.2,38.9), sbp: r(145,162), dbp: r(92,102), resp: r(20,26), score: rf(5,6.5)}),
  critical: () => ({ hr: r(120,145),spo2: r(84,91), temp: rf(39.1,40.2), sbp: r(170,198), dbp: r(108,122),resp: r(28,36), score: rf(7.5,10)})
};

const NET_DATA = {
  high:   { label: 'WiFi / 5G',    bw: ()=>r(85,150), cpu: ()=>r(80,95) },
  medium: { label: '4G',           bw: ()=>r(25,60),  cpu: ()=>r(55,75) },
  low:    { label: 'Edge / 2G',    bw: ()=>r(4,15),   cpu: ()=>r(20,40) }
};

const DEV_DATA = {
  station: { label: 'Station clinique', cap: ()=>r(85,99),  modules: 6 },
  tablet:  { label: 'Tablette médicale',cap: ()=>r(55,75),  modules: 4 },
  iot:     { label: 'Capteur IoT',      cap: ()=>r(20,40),  modules: 2 }
};

// ══════════════════════════════════════════════════════════════
// ADAPTATION RULES (evaluated in order)
// ══════════════════════════════════════════════════════════════
const RULES = [
  {
    id: 'R1', priority: 1,
    cond: (s,n,d) => s==='critical',
    label: 'IF patient=CRITIQUE → Priorité absolue',
    result: 'Mode CRITIQUE — tous capteurs max',
    config: { ecgHz:'500 Hz', spo2:'1 s', temp:'5 s', bp:'30 s', resp:'1 s', compression:'Max', alert:'ALARME SALLE', adaptMode:'Critique' }
  },
  {
    id: 'R2', priority: 2,
    cond: (s,n,d) => s==='critical' && n==='low',
    label: 'IF patient=CRITIQUE AND réseau=Dégradé → Compression forcée',
    result: 'ECG compressé 250 Hz + modules non-vitaux suspendus',
    config: { ecgHz:'250 Hz*', spo2:'1 s', temp:'10 s', bp:'SUSPENDU', resp:'SUSPENDU', compression:'Maximale', alert:'ALARME SALLE + SMS', adaptMode:'Critique Dégradé' }
  },
  {
    id: 'R3', priority: 3,
    cond: (s,n,d) => s==='moderate' && d==='station',
    label: 'IF patient=Modéré AND dispositif=Station → Surveillance accrue',
    result: 'ECG 400 Hz, SpO₂ toutes 5 s, alertes SMS + Appel',
    config: { ecgHz:'400 Hz', spo2:'5 s', temp:'10 s', bp:'2 min', resp:'5 s', compression:'Élevée', alert:'SMS + Appel', adaptMode:'Modéré' }
  },
  {
    id: 'R4', priority: 4,
    cond: (s,n,d) => s==='moderate' && (d==='tablet'||d==='iot'),
    label: 'IF patient=Modéré AND dispositif=Tablette/IoT → Surveillance réduite',
    result: 'ECG 250 Hz, modules secondaires en veille',
    config: { ecgHz:'250 Hz', spo2:'10 s', temp:'30 s', bp:'5 min', resp:'RÉDUIT', compression:'Élevée', alert:'SMS', adaptMode:'Modéré Réduit' }
  },
  {
    id: 'R5', priority: 5,
    cond: (s,n,d) => s==='stable' && n==='low',
    label: 'IF patient=Stable AND réseau=Dégradé → Mode économie bande passante',
    result: 'ECG 125 Hz, PA et Resp suspendus',
    config: { ecgHz:'125 Hz', spo2:'60 s', temp:'120 s', bp:'SUSPENDU', resp:'SUSPENDU', compression:'Max', alert:'Aucune', adaptMode:'Dégradé' }
  },
  {
    id: 'R6', priority: 6,
    cond: (s,n,d) => s==='stable' && d==='iot',
    label: 'IF patient=Stable AND dispositif=IoT → Mode faible consommation',
    result: 'ECG 125 Hz, max 2 modules actifs simultanément',
    config: { ecgHz:'125 Hz', spo2:'30 s', temp:'60 s', bp:'SUSPENDU', resp:'SUSPENDU', compression:'Élevée', alert:'Aucune', adaptMode:'IoT Économie' }
  },
  {
    id: 'R7', priority: 7,
    cond: (s,n,d) => s==='stable' && n==='high',
    label: 'IF patient=Stable AND réseau=Haut débit → Mode optimal',
    result: 'Tous les modules actifs à pleine résolution',
    config: { ecgHz:'250 Hz', spo2:'30 s', temp:'60 s', bp:'5 min', resp:'15 s', compression:'Standard', alert:'Aucune', adaptMode:'Normal' }
  },
  {
    id: 'R8', priority: 8,
    cond: () => true,
    label: 'DEFAULT → Mode standard de base',
    result: 'Configuration par défaut (fallback)',
    config: { ecgHz:'250 Hz', spo2:'30 s', temp:'60 s', bp:'5 min', resp:'15 s', compression:'Standard', alert:'Aucune', adaptMode:'Standard' }
  }
];

// ══════════════════════════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════════════════════════
function r(a,b)    { return Math.floor(Math.random()*(b-a+1))+a; }
function rf(a,b)   { return (Math.random()*(b-a)+a).toFixed(1); }
function sleep(ms) { return new Promise(res => setTimeout(res, ms)); }
function now()     { return new Date().toLocaleTimeString('fr-FR'); }
function el(id)    { return document.getElementById(id); }

// ══════════════════════════════════════════════════════════════
// CLOCK
// ══════════════════════════════════════════════════════════════
(function clock() {
  function tick() { const e = el('scClock'); if(e) e.textContent = new Date().toLocaleTimeString('fr-FR'); }
  tick(); setInterval(tick, 1000);
})();

// ══════════════════════════════════════════════════════════════
// CONTEXT SELECTION
// ══════════════════════════════════════════════════════════════
function setCtx(btn, dim, val) {
  ctx[dim] = val;
  document.querySelectorAll(`[data-ctx="${dim}"]`).forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  updateCtxSummary();
}

function updateCtxSummary() {
  const sLabel = { stable:'Stable', moderate:'Modérée', critical:'Critique' }[ctx.severity];
  const nLabel = { high:'WiFi/5G', medium:'4G', low:'Dégradé' }[ctx.network];
  const dLabel = { station:'Station', tablet:'Tablette', iot:'IoT' }[ctx.device];
  const col    = { stable:'#4ade80', moderate:'#fbbf24', critical:'#f87171' }[ctx.severity];
  el('ctxSummary').innerHTML =
    `Situation : <strong style="color:${col}">${sLabel}</strong> · Réseau : <strong>${nLabel}</strong> · Dispositif : <strong>${dLabel}</strong>`;
}
updateCtxSummary();

// ══════════════════════════════════════════════════════════════
// TERMINAL
// ══════════════════════════════════════════════════════════════
function log(type, msg) {
  const t = el('scTerminal'); if(!t) return;
  const d = document.createElement('div');
  d.className = `term-line term-${type}`;
  d.textContent = `${now()} ${msg}`;
  t.appendChild(d);
  t.scrollTop = t.scrollHeight;
  if(t.children.length > 200) t.removeChild(t.firstChild);
}
function clearTerm() { const t=el('scTerminal'); if(t){t.innerHTML='';} log('sys','[SYS] Journal vidé.'); }

// ══════════════════════════════════════════════════════════════
// PIPELINE STEP HELPERS
// ══════════════════════════════════════════════════════════════
function setPipeStep(n, cls) {
  el(`pstep-${n}`).className = 'pipe-step ' + (cls ? 'ps-'+cls : '');
  el(`cntStep`).textContent = ['Objectif','Métrique','Situation','Décision','Adaptation'][n-1] || '—';
}
function resetPipe() {
  for(let i=1;i<=5;i++) setPipeStep(i,'');
  el(`cntStep`).textContent = '—';
}
function setPanelState(n, state) {
  el(`panel-${n}`).className = 'sc-panel ' + (state ? 'panel-'+state : '');
}
function fillProgress(n, pct) {
  el(`pf-${n}`).style.width = pct + '%';
}

async function flyPacket(n, color) {
  const pkt = el(`cpkt-${n}`);
  if(!pkt) return;
  pkt.className = 'conn-packet fly' + (color ? ' fly-'+color : '');
  await sleep(750);
  pkt.className = 'conn-packet';
}

function waitStep() {
  if(!stepMode) return Promise.resolve();
  return new Promise(res => { stepResolve = res; });
}

// ══════════════════════════════════════════════════════════════
// STEP 1 — OBJECTIF
// ══════════════════════════════════════════════════════════════
async function runObjectif(vitals, netD, devD, rule) {
  log('obj', '[OBJ] ── Étape 1 : Définition des objectifs');
  setPipeStep(1, 'active');
  setPanelState(1, 'active');

  // Animate progress bar
  for(let p=0;p<=100;p+=5) { fillProgress(1,p); await sleep(20); }

  const isCrit  = ctx.severity === 'critical';
  const isWarn  = ctx.severity === 'moderate';

  // Highlight relevant objective card
  document.querySelectorAll('.obj-card').forEach(c => c.classList.remove('oc-active'));
  const primary = isCrit ? 'obj-clinical' : (ctx.network==='low' ? 'obj-network' : 'obj-clinical');
  el(primary)?.classList.add('oc-active');

  el('oppVal').textContent = isCrit
    ? '🔴 CRITIQUE — Signalement immédiat, aucune donnée sacrifiée'
    : isWarn
    ? '🟡 MODÉRÉ — Surveillance accrue, optimisation bande passante'
    : '🟢 STANDARD — Équilibre qualité / consommation réseau';

  log('obj', `[OBJ] Objectif principal : ${rule.adaptMode} → ${rule.result}`);
  await sleep(400);
  await waitStep();

  setPipeStep(1, 'done');
  setPanelState(1, 'done');
  flyPacket(1, isCrit ? 'alert' : isWarn ? 'warn' : '');
  await sleep(300);
}

// ══════════════════════════════════════════════════════════════
// STEP 2 — MÉTRIQUE
// ══════════════════════════════════════════════════════════════
async function runMetrique(vitals, netD, devD) {
  log('met', '[MET] ── Étape 2 : Collecte des métriques');
  setPipeStep(2, 'active');
  setPanelState(2, 'active');

  const isCrit = ctx.severity === 'critical';
  const isWarn = ctx.severity === 'moderate';

  const setMV = (id, val, unit, pct, cls) => {
    el(`mv-${id}`).textContent  = val;
    el(`mf-${id}`).style.width  = pct + '%';
    el(`mf-${id}`).style.background = cls==='crit'?'#f87171':cls==='warn'?'#fbbf24':'#38bdf8';
    el(`met-${id}`).className   = `metric-box mb-${cls}`;
  };

  // Animate each metric appearing
  for(let p=0;p<=100;p+=10) { fillProgress(2,p); await sleep(15); }

  const hrPct   = Math.min(100, (vitals.hr / 160) * 100);
  const spoPct  = Math.max(0, (vitals.spo2 - 80) / 20 * 100);
  const tmpPct  = Math.min(100, ((vitals.temp - 35) / 6) * 100);
  const bpPct   = Math.min(100, ((vitals.sbp - 90) / 120) * 100);
  const rspPct  = Math.min(100, (vitals.resp / 40) * 100);
  const scoPct  = Math.min(100, (vitals.score / 10) * 100);

  const hcls  = isCrit?'crit':isWarn?'warn':'ok';
  const spcls = vitals.spo2 < 92 ? 'crit' : vitals.spo2 < 95 ? 'warn' : 'ok';
  const tcls  = parseFloat(vitals.temp)>39?'crit':parseFloat(vitals.temp)>38.2?'warn':'ok';

  setMV('hr',   vitals.hr,     'bpm',     hrPct,  hcls);
  setMV('spo2', vitals.spo2,   '%',       spoPct, spcls);
  setMV('temp', vitals.temp,   '°C',      tmpPct, tcls);
  setMV('bp',   `${vitals.sbp}/${vitals.dbp}`, 'mmHg', bpPct, hcls);
  setMV('resp', vitals.resp,   'r/min',   rspPct, hcls);
  setMV('score',vitals.score,  '/10',     scoPct, isCrit?'crit':isWarn?'warn':'ok');

  // Contextual metrics
  const nMeta = netD; const dMeta = devD;
  const bw = nMeta.bw();  const cpu = dMeta.cap();
  const nCls = ctx.network==='high'?'ok':ctx.network==='medium'?'warn':'low';
  const dCls = ctx.device==='station'?'ok':ctx.device==='tablet'?'warn':'low';

  el('cmv-net').textContent = nMeta.label; el('cms-net').textContent = ctx.network==='high'?'Excellent':ctx.network==='medium'?'Correct':'Dégradé';
  el('cmv-dev').textContent = dMeta.label; el('cms-dev').textContent = `${dMeta.modules} modules max`;
  el('cmv-bw').textContent  = bw;          el('cms-bw').textContent  = 'Kbps';
  el('cmv-cpu').textContent = cpu;
  ['ctxm-net','ctxm-dev','ctxm-bw','ctxm-cpu'].forEach((id,i) => {
    el(id).className = 'ctx-met-card ' + ['cmc-'+nCls,'cmc-'+dCls,'cmc-'+nCls,'cmc-ok'][i];
  });

  log('met', `[MET] Clinique → HR:${vitals.hr} SpO₂:${vitals.spo2}% T:${vitals.temp}°C PA:${vitals.sbp}/${vitals.dbp}`);
  log('met', `[MET] Contexte → Réseau:${nMeta.label} BW:${bw}Kbps  Dispositif:${dMeta.label} CPU:${cpu}%`);
  await sleep(400);
  await waitStep();

  setPipeStep(2, 'done');
  setPanelState(2, 'done');
  flyPacket(2, isCrit?'alert':isWarn?'warn':'');
  await sleep(300);
  return { bw, cpu };
}

// ══════════════════════════════════════════════════════════════
// STEP 3 — SITUATION
// ══════════════════════════════════════════════════════════════
async function runSituation(vitals, bw, cpu) {
  log('sit', '[SIT] ── Étape 3 : Évaluation de la situation globale');
  setPipeStep(3, isAlert()?'alert':isWarn()?'warn':'active');
  setPanelState(3, 'active');

  for(let p=0;p<=100;p+=8) { fillProgress(3,p); await sleep(18); }

  const isCrit = ctx.severity === 'critical';
  const isWrn  = ctx.severity === 'moderate';
  const netBad = ctx.network === 'low';
  const devWeak= ctx.device  === 'iot';

  // Clinical score
  const clinScore = isCrit ? r(78,95) : isWrn ? r(42,65) : r(10,28);
  const netScore  = ctx.network==='high' ? r(82,98) : ctx.network==='medium' ? r(45,68) : r(8,25);
  const devScore  = ctx.device==='station' ? r(85,99) : ctx.device==='tablet' ? r(50,75) : r(15,38);
  const totalPct  = Math.round((clinScore*0.6 + netScore*0.25 + devScore*0.15));

  // Animate bars
  const animate = async (fillId, targetPct, color) => {
    const fill = el(fillId); if(!fill) return;
    fill.style.background = color;
    for(let p=0;p<=targetPct;p+=3) { fill.style.width=p+'%'; await sleep(12); }
    fill.style.width = targetPct + '%';
  };
  await Promise.all([
    animate('smf-clinical', clinScore, isCrit?'#f87171':isWrn?'#fbbf24':'#4ade80'),
    animate('smf-network',  netScore,  netBad?'#f87171':ctx.network==='medium'?'#fbbf24':'#38bdf8'),
    animate('smf-device',   devScore,  devWeak?'#f87171':ctx.device==='tablet'?'#fbbf24':'#4ade80'),
    animate('smf-total',    totalPct,  isCrit?'#f87171':isWrn?'#fbbf24':'#4ade80'),
  ]);

  el('smr-clinical').textContent = clinScore+'%';
  el('smr-network').textContent  = netScore+'%';
  el('smr-device').textContent   = devScore+'%';
  el('smr-total').textContent    = totalPct+'%';

  // Global situation
  let sitName, sitDesc, sitCls;
  if(isCrit) {
    sitName = '🔴 Situation Critique';
    sitDesc = netBad
      ? 'Patient en danger immédiat + réseau dégradé → protocole d\'urgence maximal'
      : 'Patient en danger immédiat → intervention médicale requise sans délai';
    sitCls = 'sg-crit';
  } else if(isWrn) {
    sitName = devWeak ? '🟠 Situation Modérée Contrainte' : '🟡 Situation Modérée';
    sitDesc = devWeak
      ? 'Surveillance accrue nécessaire mais dispositif limité → compromis qualité/ressource'
      : 'État préoccupant nécessitant une surveillance renforcée et des alertes préventives';
    sitCls = 'sg-warn';
  } else {
    sitName = netBad ? '🟡 Situation Normale Dégradée' : '🟢 Situation Normale';
    sitDesc = netBad
      ? 'Patient stable mais connexion dégradée → adapter la collecte pour maintenir la surveillance'
      : 'Tous les paramètres sont dans les normes — fonctionnement optimal';
    sitCls = 'sg-ok';
  }

  el('sgName').textContent = sitName;
  el('sgDesc').textContent = sitDesc;
  el('sitGlobal').className = 'situation-global ' + sitCls;

  // Flags
  const flags = [];
  if(isCrit)   flags.push({t:'CRITIQUE : SpO₂ < 92%', c:'sf-crit'});
  if(isWrn)    flags.push({t:'MODÉRÉ : Paramètres anormaux', c:'sf-warn'});
  if(!isCrit&&!isWrn) flags.push({t:'Patient Stable', c:'sf-ok'});
  if(netBad)   flags.push({t:'Réseau dégradé < 20 Kbps', c:'sf-warn'});
  if(!netBad)  flags.push({t:'Réseau nominal', c:'sf-ok'});
  if(devWeak)  flags.push({t:'Dispositif IoT limité', c:'sf-warn'});
  if(!devWeak) flags.push({t:'Dispositif suffisant', c:'sf-ok'});

  el('sitFlags').innerHTML = flags.map(f=>`<span class="sf-flag ${f.c}">${f.t}</span>`).join('');

  log('sit', `[SIT] Situation : ${sitName} — Score global : ${totalPct}%`);
  log('sit', `[SIT] ${flags.map(f=>f.t).join(' | ')}`);
  await sleep(400);
  await waitStep();

  setPipeStep(3, isCrit?'alert':isWrn?'warn':'done');
  setPanelState(3, isCrit?'alert':isWrn?'warn':'done');
  flyPacket(3, isCrit?'alert':isWrn?'warn':'');
  await sleep(300);
}

// ══════════════════════════════════════════════════════════════
// STEP 4 — DÉCISION
// ══════════════════════════════════════════════════════════════
async function runDecision(rule) {
  log('dec', '[DEC] ── Étape 4 : Évaluation du moteur de règles');
  setPipeStep(4, isAlert()?'alert':isWarn()?'warn':'active');
  setPanelState(4, 'active');

  el('rulesTotal').textContent = RULES.length;

  // Build rules list HTML
  el('rulesList').innerHTML = RULES.map(rl => `
    <div class="rule-item" id="ri-${rl.id}">
      <span class="ri-icon">⬜</span>
      <div class="ri-body">
        <div class="ri-cond">${rl.label}</div>
        <div class="ri-result">${rl.result}</div>
      </div>
      <span class="ri-badge" id="rib-${rl.id}">—</span>
    </div>`).join('');

  let evalCount = 0;
  let firedRule = null;

  for(const rl of RULES) {
    if(!running && !stepMode) break;
    const item   = el(`ri-${rl.id}`);
    const badge  = el(`rib-${rl.id}`);
    item.className = 'rule-item ri-checking';
    item.querySelector('.ri-icon').textContent = '🔍';
    el('rulesEval').textContent = ++evalCount;
    fillProgress(4, Math.round((evalCount/RULES.length)*100));
    await sleep(220);

    const pass = rl.cond(ctx.severity, ctx.network, ctx.device);
    if(pass && !firedRule) {
      firedRule = rl;
      item.className  = 'rule-item ri-fired';
      item.querySelector('.ri-icon').textContent = '✅';
      badge.className = 'ri-badge rb-fire';
      badge.textContent = 'DÉCLENCHÉ';
    } else if(pass) {
      item.className  = 'rule-item ri-pass';
      item.querySelector('.ri-icon').textContent = '✓';
      badge.className = 'ri-badge rb-pass';
      badge.textContent = 'Vrai';
    } else {
      item.className  = 'rule-item ri-fail';
      item.querySelector('.ri-icon').textContent = '✗';
      badge.className = 'ri-badge rb-fail';
      badge.textContent = 'Faux';
    }
  }

  const fired = firedRule || RULES[RULES.length-1];
  el('dfRule').textContent = `[${fired.id}] ${fired.label}`;
  el('dfRationale').textContent = fired.result;

  log('dec', `[DEC] ${evalCount} règles évaluées — Règle sélectionnée : ${fired.id}`);
  log('dec', `[DEC] ${fired.label}`);
  await sleep(400);
  await waitStep();

  setPipeStep(4, isAlert()?'alert':isWarn()?'warn':'done');
  setPanelState(4, isAlert()?'alert':isWarn()?'warn':'done');
  flyPacket(4, isAlert()?'alert':isWarn()?'warn':'');
  await sleep(300);
  return fired;
}

// ══════════════════════════════════════════════════════════════
// STEP 5 — ADAPTATION
// ══════════════════════════════════════════════════════════════
async function runAdaptation(rule) {
  log('adp', '[ADP] ── Étape 5 : Application de la reconfiguration');
  setPipeStep(5, isAlert()?'alert':isWarn()?'warn':'active');
  setPanelState(5, 'active');

  const newCfg = rule.config;
  const defCfg = prevConfig || { ecgHz:'250 Hz', spo2:'30 s', temp:'60 s', bp:'5 min', resp:'15 s', compression:'Standard', alert:'Aucune', adaptMode:'Standard' };

  // Before / After comparison
  const keys = ['ecgHz','spo2','temp','bp','resp','compression','alert'];
  const labels= { ecgHz:'ECG', spo2:'SpO₂', temp:'Température', bp:'Pression art.', resp:'Respiration', compression:'Compression', alert:'Alerte' };

  for(let p=0;p<=100;p+=6) { fillProgress(5,p); await sleep(15); }

  el('configBefore').innerHTML = keys.map(k=>{
    const changed = defCfg[k] !== newCfg[k];
    return `<div class="ac-item ${changed?'ai-changed':'ai-same'}">
      <span class="ai-key">${labels[k]}</span>
      <span class="ai-val">${defCfg[k]||'—'}</span>
    </div>`;
  }).join('');

  el('configAfter').innerHTML = keys.map(k=>{
    const changed = defCfg[k] !== newCfg[k];
    const valCls  = newCfg[k]==='SUSPENDU'?'val-warn':isAlert()?'val-crit':isWarn()?'val-warn':'';
    return `<div class="ac-item ${changed?'ai-changed':'ai-same'}">
      <span class="ai-key">${labels[k]}</span>
      <span class="ai-val ${valCls}">${newCfg[k]}</span>
    </div>`;
  }).join('');

  // Modules status
  const modules = [
    { name:'ECG', freq: newCfg.ecgHz, status: newCfg.ecgHz==='SUSPENDU'?'off':'on', cls: isAlert()?'crit':'on' },
    { name:'SpO₂', freq: newCfg.spo2, status: 'on', cls:'on' },
    { name:'Température', freq: newCfg.temp, status: 'on', cls:'on' },
    { name:'Pression art.', freq: newCfg.bp, status: newCfg.bp==='SUSPENDU'?'off':newCfg.bp==='RÉDUIT'?'reduced':'on', cls: newCfg.bp==='SUSPENDU'?'off':newCfg.bp==='RÉDUIT'?'reduced':'on' },
    { name:'Respiration', freq: newCfg.resp, status: newCfg.resp==='SUSPENDU'?'off':newCfg.resp==='RÉDUIT'?'reduced':'on', cls: newCfg.resp==='SUSPENDU'?'off':newCfg.resp==='RÉDUIT'?'reduced':'on' },
    { name:'Moteur d\'alertes', freq: newCfg.alert, status: newCfg.alert==='Aucune'?'off':'on', cls: isAlert()?'crit':newCfg.alert==='Aucune'?'off':'on' }
  ];

  const statusLabel = { on:'Actif', off:'Suspendu', reduced:'Réduit', crit:'Actif MAX' };
  el('amGrid').innerHTML = modules.map(m => `
    <div class="am-row amr-${m.cls}">
      <span class="am-name">${m.name}</span>
      <span class="am-status">${statusLabel[m.cls]||'Actif'}</span>
      <span class="am-freq">${m.freq}</span>
    </div>`).join('');

  // Notification zone
  const isCrit = ctx.severity==='critical';
  const isWrn  = ctx.severity==='moderate';
  const notifCls = isCrit?'an-crit':isWrn?'an-warn':'an-ok';
  const notifIcon = isCrit?'🚨':isWrn?'⚠️':'✅';
  const notifTitle = isCrit?'ALARME CRITIQUE — Médecin notifié immédiatement':isWrn?'Alerte modérée — SMS + Appel envoyés':'Surveillance normale — Aucune alerte';
  const notifDetail = `Mode : ${newCfg.adaptMode} · ECG ${newCfg.ecgHz} · Compression : ${newCfg.compression}`;

  el('adaptNotif').className   = `adapt-notification ${notifCls}`;
  el('anIcon').textContent     = notifIcon;
  el('anTitle').textContent    = notifTitle;
  el('anDetail').textContent   = notifDetail;
  el('anChannel').textContent  = newCfg.alert;

  el('loopCycleNum').textContent = cycleCount;

  if(isCrit) alertCount++;
  adaptCount++;

  prevConfig = { ...newCfg };

  log('adp', `[ADP] Mode ${newCfg.adaptMode} appliqué — ECG:${newCfg.ecgHz} Compression:${newCfg.compression}`);
  log('adp', `[ADP] Canal alerte : ${newCfg.alert}`);
  if(isCrit) log('crit','[CRIT] ⚠ ALARME SALLE déclenchée — Dr. Martin notifiée');

  await sleep(400);
  await waitStep();

  setPipeStep(5, isCrit?'alert':isWrn?'warn':'done');
  setPanelState(5, isCrit?'alert':isWrn?'warn':'done');
  await sleep(300);
}

// ══════════════════════════════════════════════════════════════
// COUNTERS
// ══════════════════════════════════════════════════════════════
function updateCounters(ms) {
  latencies.push(ms);
  if(latencies.length>30) latencies.shift();
  const avg = Math.round(latencies.reduce((a,b)=>a+b,0)/latencies.length);
  el('cntCycles').textContent  = cycleCount;
  el('cntLatency').textContent = avg + 'ms';
  el('cntAlerts').textContent  = alertCount;
  el('cntAdapt').textContent   = adaptCount;
}

// ══════════════════════════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════════════════════════
function isAlert() { return ctx.severity === 'critical'; }
function isWarn()  { return ctx.severity === 'moderate'; }

function getBestRule() {
  for(const rl of RULES) {
    if(rl.cond(ctx.severity, ctx.network, ctx.device)) return rl;
  }
  return RULES[RULES.length-1];
}

// ══════════════════════════════════════════════════════════════
// MAIN CYCLE
// ══════════════════════════════════════════════════════════════
async function runCycle() {
  const tStart = Date.now();
  cycleCount++;

  log('sys', `══ Cycle #${cycleCount} — Contexte: ${ctx.severity}/${ctx.network}/${ctx.device} ══`);

  resetPipe();
  [1,2,3,4,5].forEach(n => { fillProgress(n,0); setPanelState(n,''); });

  const vitals = VITALS[ctx.severity]();
  const netD   = NET_DATA[ctx.network];
  const devD   = DEV_DATA[ctx.device];
  const rule   = getBestRule();

  await runObjectif(vitals, netD, devD, rule);
  if(!running && !stepMode) return;

  const { bw, cpu } = await runMetrique(vitals, netD, devD);
  if(!running && !stepMode) return;

  await runSituation(vitals, bw, cpu);
  if(!running && !stepMode) return;

  const firedRule = await runDecision(rule);
  if(!running && !stepMode) return;

  await runAdaptation(firedRule);

  const ms = Date.now() - tStart;
  updateCounters(ms);
  log('sys', `══ Cycle #${cycleCount} terminé — ${ms}ms total ══`);
}

// ══════════════════════════════════════════════════════════════
// START / STOP / STEP
// ══════════════════════════════════════════════════════════════
function startSim() {
  if(running) return;
  running   = true;
  stepMode  = false;

  el('btnRun').disabled  = true;
  el('btnStop').disabled = false;
  el('btnStep').disabled = true;

  const dot = document.querySelector('.sim-dot');
  dot.className = 'sim-dot running';
  el('simLabel').textContent = 'En cours';

  log('sys','[SYS] ══ SIMULATION DÉMARRÉE ══');
  updateCtxSummary();

  const interval = ctx.severity==='critical' ? 3000 : ctx.severity==='moderate' ? 5000 : 7000;

  function loop() {
    if(!running) return;
    runCycle().then(() => {
      if(running) simTimer = setTimeout(loop, interval);
    });
  }
  loop();
}

function stopSim() {
  running = false;
  clearTimeout(simTimer);
  if(stepResolve) { stepResolve(); stepResolve = null; }

  el('btnRun').disabled  = false;
  el('btnStop').disabled = true;
  el('btnStep').disabled = false;

  const dot = document.querySelector('.sim-dot');
  dot.className = 'sim-dot idle';
  el('simLabel').textContent = 'Arrêté';

  log('sys',`[SYS] Simulation arrêtée — ${cycleCount} cycles — ${alertCount} alertes — ${adaptCount} adaptations`);
}

async function stepOnce() {
  if(running) return;
  stepMode  = true;

  el('btnRun').disabled  = true;
  el('btnStop').disabled = false;
  el('btnStep').textContent = '⏭ Étape suivante';

  const dot = document.querySelector('.sim-dot');
  dot.className = 'sim-dot running';
  el('simLabel').textContent = 'Pas à pas';

  // One full cycle, step by step
  stepResolve = null;
  const tStart = Date.now();
  cycleCount++;

  log('sys',`══ Cycle #${cycleCount} [PAS À PAS] ══`);

  resetPipe();
  [1,2,3,4,5].forEach(n => { fillProgress(n,0); setPanelState(n,''); });

  const vitals = VITALS[ctx.severity]();
  const netD   = NET_DATA[ctx.network];
  const devD   = DEV_DATA[ctx.device];
  const rule   = getBestRule();

  // Create a step-by-step runner
  const steps = [
    () => runObjectif(vitals, netD, devD, rule),
    () => runMetrique(vitals, netD, devD),
    () => runSituation(vitals, 0, 0),
    () => runDecision(rule),
    async () => {
      const firedRule = getBestRule();
      await runAdaptation(firedRule);
      updateCounters(Date.now()-tStart);
      log('sys',`══ Cycle #${cycleCount} terminé ══`);
      el('btnRun').disabled  = false;
      el('btnStop').disabled = true;
      el('btnStep').textContent = '⏭ Étape par étape';
      dot.className = 'sim-dot idle';
      el('simLabel').textContent = 'Prêt';
      stepMode = false;
    }
  ];

  let stepIdx = 0;
  el('btnStep').onclick = async () => {
    if(stepResolve) { stepResolve(); stepResolve = null; }
    else if(stepIdx < steps.length) { await steps[stepIdx++](); }
  };
  // Kick off first step
  el('btnStep').click();
}
