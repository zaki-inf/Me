'use strict';
// ══════════════════════════════════════════════════════════════
// MODULE 4 — Decision Engine
// Lie Situation → Règle → Plan d'adaptation concret :
// compress_data, reduce_ecg_freq, activate_cache,
// reroute, scale_service
// ══════════════════════════════════════════════════════════════

window.DecisionEngine = (function () {

  const ACTION_LABELS = {
    'compress_data:max':      { icon: '🗜', label: 'Compression maximale des données ECG' },
    'compress_data:partial':  { icon: '🗜', label: 'Compression partielle activée' },
    'reduce_ecg_freq:125':    { icon: '📉', label: 'Fréquence ECG réduite → 125 Hz' },
    'reduce_ecg_freq:250':    { icon: '📉', label: 'Fréquence ECG réduite → 250 Hz' },
    'activate_cache:vitals':  { icon: '💾', label: 'Cache local — constantes vitales uniquement' },
    'activate_cache:partial': { icon: '💾', label: 'Cache local partiel activé' },
    'activate_cache:local':   { icon: '💾', label: 'Cache edge complet activé' },
    'reroute:priority':       { icon: '↪️', label: 'Rerouting vers canal prioritaire' },
    'reroute:sms':            { icon: '↪️', label: 'Basculement vers SMS / canal fallback' },
    'reroute:emergency':      { icon: '🆘', label: "Canal d'urgence dédié activé" },
    'scale_service:up':       { icon: '⬆️', label: 'Montée en charge des micro-services' },
    'scale_service:medium':   { icon: '⚖️', label: 'Capacité service ajustée (niveau moyen)' },
    'scale_service:standard': { icon: '✅', label: 'Service maintenu en mode standard' },
  };

  // ── Select first matching rule ────────────────────────────
  function selectRule(severity, network, device) {
    const rules = ScenarioGenerator.getRules();
    for (const rule of rules) {
      if (rule.cond(severity, network, device)) return rule;
    }
    return rules[rules.length - 1];
  }

  // ── Build human-readable adaptation plan ─────────────────
  function buildAdaptationPlan(rule) {
    return (rule.adaptations || []).map(key =>
      ACTION_LABELS[key] || { icon: '⚙️', label: key }
    );
  }

  // ── Render decision in Col 4 ──────────────────────────────
  function render(rule, situation, scenario) {
    const rfbId     = document.getElementById('rfbId');
    const rfbCond   = document.getElementById('rfbCond');
    const rfbAction = document.getElementById('rfbAction');
    if (rfbId)     { rfbId.textContent = rule.id; rfbId.style.color = situation.color; }
    if (rfbCond)   rfbCond.textContent = rule.label;
    if (rfbAction) rfbAction.textContent = rule.action;

    const plan   = buildAdaptationPlan(rule);
    const planEl = document.getElementById('adaptPlan');
    if (planEl) planEl.innerHTML = plan.map(a =>
      `<div class="ap-row">
        <span class="ap-icon">${a.icon}</span>
        <span class="ap-label">${a.label}</span>
      </div>`
    ).join('');

    const ruleChain = document.getElementById('ruleChain');
    if (ruleChain) ruleChain.innerHTML = ScenarioGenerator.getRules().map(rl => {
      const fired  = rl.id === rule.id;
      const passed = rl.cond(scenario.severity, scenario.network, scenario.device);
      return `<div class="rc-row ${fired ? 'rc-fired' : passed ? 'rc-pass' : 'rc-fail'}">
        <span class="rc-id">${rl.id}</span>
        <span class="rc-lbl">${rl.label}</span>
        <span class="rc-badge">${fired ? '✅ DÉCLENCHÉ' : passed ? '✓' : '✗'}</span>
      </div>`;
    }).join('');

    const decProofBody = document.getElementById('decProofBody');
    if (decProofBody) decProofBody.innerHTML =
      `Situation <strong>${situation.name}</strong><br/>
       → SLA latence cible : <strong>${scenario.qos.latency.target}</strong><br/>
       → SLA ECG cible : <strong>${scenario.qos.ecgHz.target}</strong><br/>
       → Règle <strong>${rule.id}</strong> garantit le respect des SLA`;
  }

  return { selectRule, buildAdaptationPlan, render };
})();
