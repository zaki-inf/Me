'use strict';
// ══════════════════════════════════════════════════════════════
// MODULE 3 — OSM Situation Engine
// Interprète métriques + contexte → classifie la situation :
// S_Normal, S_Degraded, S_Moderate, S_IoTConstraint,
// S_Critical, S_NetworkStorm, S_Saturation
// ══════════════════════════════════════════════════════════════

window.SituationEngine = (function () {

  const OSM_SITUATIONS = {
    S_Saturation:    { code: 'SIT-CRIT-5', name: 'Saturation Totale',        color: '#f87171' },
    S_NetworkStorm:  { code: 'SIT-CRIT-4', name: 'Critique Réseau Dégradé',  color: '#f87171' },
    S_Critical:      { code: 'SIT-CRIT-3', name: 'État Critique Pur',        color: '#ef4444' },
    S_IoTConstraint: { code: 'SIT-MOD-2',  name: 'Modéré Contraint IoT',     color: '#fb923c' },
    S_Moderate:      { code: 'SIT-MOD-1',  name: 'État Modéré Surveillé',    color: '#fbbf24' },
    S_Degraded:      { code: 'SIT-STB-2',  name: 'Stable Réseau Dégradé',    color: '#38bdf8' },
    S_Normal:        { code: 'SIT-STB-1',  name: 'Situation Normale',        color: '#4ade80' },
  };

  function _r(a, b) { return Math.floor(Math.random() * (b - a + 1)) + a; }

  // ── Classify situation from metrics + context ─────────────
  function classify(metrics, context) {
    const { severity, network, device } = context;
    const isCrit  = severity === 'critical';
    const isWarn  = severity === 'moderate';
    const netBad  = network  === 'low';
    const devWeak = device   === 'iot';

    let osmKey, score, reasons, isAlert;

    if (isCrit && netBad && devWeak) {
      osmKey = 'S_Saturation'; score = _r(92, 98); isAlert = true;
      reasons = [
        `SpO₂ ${metrics.spo2}% < 90% → hypoxie critique`,
        `Réseau ${metrics.network_bw} Kbps → compression forcée`,
        `IoT CPU ${metrics.cpu_device}% → max 2 modules actifs`,
        `Taux d'erreur ${metrics.error_rate}% → transmission dégradée`,
      ];
    } else if (isCrit && netBad) {
      osmKey = 'S_NetworkStorm'; score = _r(85, 95); isAlert = true;
      reasons = [
        `FC ${metrics.heart_rate} bpm / SpO₂ ${metrics.spo2}% → état critique`,
        `Réseau ${metrics.network_bw} Kbps < 10 → compression max activée`,
        `Err. réseau ${metrics.error_rate}% → PA + Resp. suspendus`,
      ];
    } else if (isCrit) {
      osmKey = 'S_Critical'; score = _r(80, 92); isAlert = true;
      reasons = [
        `Paramètres vitaux hors normes cliniques`,
        `Réseau disponible → ECG 500 Hz maintenu`,
        `Tous modules critiques actifs`,
      ];
    } else if (isWarn && devWeak) {
      osmKey = 'S_IoTConstraint'; score = _r(52, 68); isAlert = true;
      reasons = [
        `FC ${metrics.heart_rate} bpm / T° ${metrics.temperature}°C anormaux`,
        `Dispositif IoT → max 2 modules simultanés`,
        `Optimisation : ECG + SpO₂ uniquement`,
      ];
    } else if (isWarn) {
      osmKey = 'S_Moderate'; score = _r(42, 58); isAlert = true;
      reasons = [
        `FC ${metrics.heart_rate} bpm ou SpO₂ ${metrics.spo2}% hors norme standard`,
        `Ressources réseau suffisantes`,
        `Surveillance accrue déclenchée`,
      ];
    } else if (netBad) {
      osmKey = 'S_Degraded'; score = _r(22, 38); isAlert = false;
      reasons = [
        `Paramètres vitaux stables`,
        `Réseau faible ${metrics.network_bw} Kbps → réduction BW non-critiques`,
        `Mode économie activé`,
      ];
    } else {
      osmKey = 'S_Normal'; score = _r(5, 22); isAlert = false;
      reasons = [
        `Tous paramètres dans les normes`,
        `Réseau nominal ${metrics.network_bw} Kbps`,
        `Mode standard — tous modules actifs`,
      ];
    }

    return { ...OSM_SITUATIONS[osmKey], osmKey, score, reasons, isAlert };
  }

  // ── Render situation in Col 3 ─────────────────────────────
  function render(situation, metrics) {
    const nb = document.getElementById('sitNameBox');
    if (nb) { nb.style.borderColor = situation.color; nb.style.background = situation.color + '18'; }

    const snbName = document.getElementById('snbName');
    const snbCode = document.getElementById('snbCode');
    if (snbName) { snbName.textContent = situation.name; snbName.style.color = situation.color; }
    if (snbCode)   snbCode.textContent = situation.code;

    const sitFactors = document.getElementById('sitFactors');
    if (sitFactors) sitFactors.innerHTML = situation.reasons.map(r =>
      `<div class="sf-row">
        <span class="sf-bullet" style="color:${situation.color}">▸</span>
        <span class="sf-text">${r}</span>
      </div>`
    ).join('');

    const splBody = document.getElementById('splBody');
    if (splBody) splBody.innerHTML =
      `<code>${metrics.spo2}% SpO₂ + ${metrics.heart_rate} bpm + err:${metrics.error_rate}%</code><br/>
       → Clé OSM : <code>${situation.osmKey}</code><br/>
       → Classification : <strong style="color:${situation.color}">${situation.name}</strong><br/>
       → Score de risque composite : <strong>${situation.score}%</strong>`;
  }

  return { classify, render, OSM_SITUATIONS };
})();
