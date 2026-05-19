'use strict';
// ══════════════════════════════════════════════════════════════
// MODULE 5 — Evidence & Evaluation Layer
// Enregistre avant/après, calcule et prouve :
// Δ latency · Δ error_rate · Δ bandwidth · SLA compliance
// Détection fausse adaptation (over-escalation / under-reaction)
// ══════════════════════════════════════════════════════════════

window.EvidenceLayer = (function () {

  let _prevConfig  = null;
  const _history   = [];

  function _r(a, b) { return Math.floor(Math.random() * (b - a + 1)) + a; }

  // ── Compute before/after deltas ───────────────────────────
  function computeDeltas(rule, metrics, latency) {
    const def = _prevConfig || {
      ecgHz: 250, spo2Int: 30, tempInt: 60,
      comp: 'Standard', alert: 'Aucune', modules: 6,
      _latency: latency, _bw: metrics.network_bw, _errRate: metrics.error_rate,
    };
    const cfg = rule.config;
    return {
      deltaEcg:      typeof cfg.ecgHz === 'number' ? cfg.ecgHz - (def.ecgHz || 250) : 0,
      deltaLatency:  latency - (def._latency || latency),
      deltaBw:       metrics.network_bw - (def._bw || metrics.network_bw),
      deltaErrRate:  parseFloat((metrics.error_rate - (def._errRate || metrics.error_rate)).toFixed(1)),
      prev: def,
    };
  }

  // ── SLA compliance across 4 dimensions ───────────────────
  function measureSLA(metrics, rule, latency, scenario) {
    const q   = scenario.qos;
    const cfg = rule.config;
    const uptimeMeas = _r(990, 999) / 10;

    const checks = [
      { k: 'latency', meas: latency,            sla: q.latency.sla, label: latency + ' ms',              ok: latency <= q.latency.sla },
      { k: 'freq',    meas: cfg.ecgHz,          sla: q.ecgHz.sla,   label: cfg.ecgHz + ' Hz',            ok: typeof cfg.ecgHz === 'number' && cfg.ecgHz >= q.ecgHz.sla },
      { k: 'uptime',  meas: uptimeMeas,         sla: q.uptime.sla,  label: uptimeMeas.toFixed(1) + '%',  ok: uptimeMeas >= q.uptime.sla },
      { k: 'bw',      meas: metrics.network_bw, sla: q.bw.sla,      label: metrics.network_bw + ' Kbps', ok: metrics.network_bw >= q.bw.sla },
    ];

    const okCount = checks.filter(c => c.ok).length;
    return { checks, okCount, pct: Math.round((okCount / checks.length) * 100) };
  }

  // ── Detect false / incoherent adaptation ─────────────────
  function detectFalseAdaptation(situation, rule, scenario) {
    if (situation.osmKey === 'S_Normal' && rule.config.ecgHz >= 400)
      return { detected: true, type: 'over-escalation',
               reason: `Config ${rule.config.ecgHz} Hz appliquée sur situation normale` };

    if ((situation.osmKey === 'S_Critical' || situation.osmKey === 'S_Saturation')
        && typeof rule.config.ecgHz === 'number' && rule.config.ecgHz <= 125
        && scenario.network !== 'low')
      return { detected: true, type: 'under-reaction',
               reason: `ECG limité à ${rule.config.ecgHz} Hz malgré état critique` };

    if (scenario.network === 'high' && rule.config.comp === 'Maximale')
      return { detected: true, type: 'unnecessary-compression',
               reason: 'Compression maximale appliquée sur réseau nominal' };

    return { detected: false, type: null, reason: 'Adaptation cohérente avec la situation' };
  }

  // ── Main render in Col 5 ──────────────────────────────────
  function render(rule, metrics, latency, scenario) {
    const situation = window._lastSituation || { osmKey: 'S_Normal', name: '—', color: '#4ade80' };
    const deltas    = computeDeltas(rule, metrics, latency);
    const sla       = measureSLA(metrics, rule, latency, scenario);
    const falseAdap = detectFalseAdaptation(situation, rule, scenario);

    _renderDeltaTable(rule, deltas);
    _renderKPIDeltas(deltas, latency, sla, falseAdap, scenario);
    _renderSLACards(sla);
    _renderNotification(rule, scenario);

    // Persist state for next cycle
    _prevConfig = { ...rule.config, _latency: latency, _bw: metrics.network_bw, _errRate: metrics.error_rate };

    const result = { deltaEcg: deltas.deltaEcg, slaOk: sla.pct >= 75 };

    _history.push({
      ts: Date.now(), scenario: scenario.name, situation: situation.name,
      rule: rule.id, ...result, slaPct: sla.pct, falseAdapt: falseAdap.detected,
    });
    if (_history.length > 100) _history.shift();

    return result;
  }

  function _renderDeltaTable(rule, deltas) {
    const def = deltas.prev;
    const cfg = rule.config;
    const rows = [
      { k: 'ECG Hz',         b: def.ecgHz,   a: cfg.ecgHz,   unit: 'Hz' },
      { k: 'SpO₂ interval',  b: def.spo2Int, a: cfg.spo2Int, unit: 's'  },
      { k: 'Temp. interval', b: def.tempInt, a: cfg.tempInt, unit: 's'  },
      { k: 'Compression',    b: def.comp,    a: cfg.comp,    unit: ''   },
      { k: 'Canal alerte',   b: def.alert,   a: cfg.alert,   unit: ''   },
      { k: 'Modules actifs', b: def.modules, a: cfg.modules, unit: ''   },
    ];

    const dtRows = document.getElementById('dtRows');
    if (!dtRows) return;
    dtRows.innerHTML = rows.map(row => {
      const changed = row.b !== row.a;
      const delta   = typeof row.b === 'number' && typeof row.a === 'number' ? row.a - row.b : '—';
      const dStr    = delta !== '—' ? (delta > 0 ? '+' : '') + delta + (row.unit || '') : '—';
      const dCls    = delta !== '—' ? (delta > 0 ? 'dpos' : 'dneg') : '';
      return `<div class="dt-row ${changed ? 'dtr-changed' : 'dtr-same'}">
        <span class="dtr-k">${row.k}</span>
        <span class="dtr-b">${row.b}${row.unit}</span>
        <span class="dtr-a ${changed ? 'dtra-changed' : ''}">${row.a}${row.unit}</span>
        <span class="dtr-d ${dCls}">${changed ? dStr : '='}</span>
      </div>`;
    }).join('');
  }

  function _renderKPIDeltas(deltas, latency, sla, falseAdap, scenario) {
    const kpiDeltas = document.getElementById('kpiDeltas');
    if (!kpiDeltas) return;
    kpiDeltas.innerHTML = `
      <div class="kpid ${deltas.deltaEcg > 0 ? 'kpid-pos' : deltas.deltaEcg < 0 ? 'kpid-neg' : 'kpid-zero'}">
        <span>Δ ECG :</span><strong>${deltas.deltaEcg > 0 ? '+' : ''}${deltas.deltaEcg} Hz</strong>
      </div>
      <div class="kpid ${deltas.deltaErrRate <= 0 ? 'kpid-pos' : 'kpid-neg'}">
        <span>Δ Err. rate :</span><strong>${deltas.deltaErrRate > 0 ? '+' : ''}${deltas.deltaErrRate}%</strong>
      </div>
      <div class="kpid ${deltas.deltaBw >= 0 ? 'kpid-pos' : 'kpid-neg'}">
        <span>Δ Bandwidth :</span><strong>${deltas.deltaBw >= 0 ? '+' : ''}${deltas.deltaBw} Kbps</strong>
      </div>
      <div class="kpid ${latency <= scenario.qos.latency.sla ? 'kpid-pos' : 'kpid-neg'}">
        <span>Δ Latence :</span><strong>${deltas.deltaLatency >= 0 ? '+' : ''}${deltas.deltaLatency} ms</strong>
        <span class="kpid-target">(mesurée: ${latency} ms · SLA: ${scenario.qos.latency.target})</span>
      </div>
      <div class="kpid ${sla.pct >= 75 ? 'kpid-pos' : 'kpid-neg'}">
        <span>SLA global :</span><strong>${sla.pct}% (${sla.okCount}/${sla.checks.length})</strong>
      </div>
      <div class="kpid ${falseAdap.detected ? 'kpid-neg' : 'kpid-pos'} kpid-fa">
        <span>Fausse adapt. :</span>
        <strong>${falseAdap.detected ? '⚠ ' + falseAdap.type : '✅ Conforme'}</strong>
        ${falseAdap.detected ? `<div class="fa-reason">${falseAdap.reason}</div>` : ''}
      </div>`;
  }

  function _renderSLACards(sla) {
    sla.checks.forEach(c => {
      const measEl  = document.getElementById(`sla-${c.k}-meas`);
      const badgeEl = document.getElementById(`sla-${c.k}-badge`);
      const cardEl  = document.getElementById(`sla-${c.k}`);
      if (measEl)  measEl.textContent  = c.label;
      if (badgeEl) { badgeEl.textContent = c.ok ? '✅ OK' : '⚠ VIOLÉ'; badgeEl.className = 'sla-badge ' + (c.ok ? 'sb-ok' : 'sb-fail'); }
      if (cardEl)  cardEl.className    = 'sla-card ' + (c.ok ? 'slac-ok' : 'slac-fail');
    });
    const score = document.getElementById('slacScore');
    if (score) { score.textContent = sla.pct + '%'; score.style.color = sla.pct >= 75 ? '#4ade80' : sla.pct >= 50 ? '#fbbf24' : '#f87171'; }
    const detail = document.getElementById('slacDetail');
    if (detail) detail.textContent = `${sla.okCount}/${sla.checks.length} SLA respectés — ${sla.pct >= 75 ? 'Conforme' : 'Non conforme'}`;
  }

  function _renderNotification(rule, scenario) {
    const isCrit   = scenario.severity === 'critical';
    const isWarn   = scenario.severity === 'moderate';
    const notifCls = isCrit ? 'nb-crit' : isWarn ? 'nb-warn' : 'nb-ok';
    const notifBox = document.getElementById('notifBox');
    const nbIcon   = document.getElementById('nbIcon');
    const nbTitle  = document.getElementById('nbTitle');
    const nbChan   = document.getElementById('nbChan');
    if (notifBox) notifBox.className = 'notif-box ' + notifCls;
    if (nbIcon)   nbIcon.textContent  = isCrit ? '🚨' : isWarn ? '⚠️' : '✅';
    if (nbTitle)  nbTitle.textContent = isCrit ? 'ALARME CRITIQUE — Dr. Martin notifiée'
                                      : isWarn ? 'Alerte modérée envoyée' : 'Surveillance normale';
    if (nbChan)   nbChan.textContent  = rule.config.alert;
  }

  // ── Update proof bar indicators ───────────────────────────
  function provePoints(situation, scenario, slaOk, deltaEcg) {
    const p1 = document.getElementById('pi1');
    if (p1) p1.innerHTML = `<span style="color:${situation.color};font-weight:700">${situation.name}</span>`;
    const pr1 = document.getElementById('proof1');
    if (pr1) pr1.style.borderColor = situation.color;

    const p2 = document.getElementById('pi2');
    if (p2) p2.innerHTML = `<span style="color:${slaOk ? '#4ade80' : '#f87171'};font-weight:700">${slaOk ? 'SLA ✅' : 'SLA ⚠'}</span>`;
    const pr2 = document.getElementById('proof2');
    if (pr2) pr2.style.borderColor = slaOk ? '#4ade80' : '#f87171';

    const txt = deltaEcg !== 0 ? `Δ ECG ${deltaEcg > 0 ? '+' : ''}${deltaEcg}Hz` : 'Config inchangée';
    const p3 = document.getElementById('pi3');
    if (p3) p3.innerHTML = `<span style="color:${slaOk ? '#4ade80' : '#f87171'};font-weight:700">${txt}</span>`;
    const pr3 = document.getElementById('proof3');
    if (pr3) pr3.style.borderColor = slaOk ? '#4ade80' : '#f87171';
  }

  function getHistory() { return _history; }

  return { render, measureSLA, detectFalseAdaptation, computeDeltas, provePoints, getHistory };
})();
