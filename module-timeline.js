'use strict';
// ══════════════════════════════════════════════════════════════
// MODULE — Timeline View
// Enregistre et affiche l'historique des transitions :
// t0→S_Normal  t30→S_Degraded  t80→S_Critical
// t100→ADAPT   t130→S_Stabilized
// ══════════════════════════════════════════════════════════════

window.TimelineView = (function () {

  const _events   = [];
  let   _startTime = null;
  let   _prevOsmKey = null;
  const MAX = 20;

  const CRITICAL_SET = new Set(['S_Critical', 'S_NetworkStorm', 'S_Saturation']);

  const SHORT_LABELS = {
    S_Normal:        'Normal',
    S_Degraded:      'Dégradé',
    S_Moderate:      'Modéré',
    S_IoTConstraint: 'IoT Cntrnt',
    S_Critical:      'Critique',
    S_NetworkStorm:  'Tempête',
    S_Saturation:    'Saturation',
  };

  // ── Reset on new scenario run ─────────────────────────────
  function start() {
    _events.length = 0;
    _startTime     = Date.now();
    _prevOsmKey    = null;
    _render();
  }

  // ── Record event after each full cycle ────────────────────
  function addEvent(situation, rule, deltaEcg) {
    if (!_startTime) _startTime = Date.now();
    const t = Math.round((Date.now() - _startTime) / 1000);

    const sitChanged = situation.osmKey !== _prevOsmKey;
    const adapted    = deltaEcg !== 0;

    // Situation transition
    if (sitChanged || _events.length === 0) {
      let label = SHORT_LABELS[situation.osmKey] || situation.osmKey;
      // Stabilization: critical → normal
      if (CRITICAL_SET.has(_prevOsmKey) && situation.osmKey === 'S_Normal') {
        label = 'Stabilisé';
      }
      _events.push({
        t, type: 'sit', label,
        code:  situation.code,
        color: situation.color,
        osmKey: situation.osmKey,
      });
      _prevOsmKey = situation.osmKey;
    }

    // Adaptation event (rule changed config)
    if (adapted) {
      _events.push({
        t, type: 'adapt',
        label:  'ADAPT',
        code:   rule.id + ' · Δ' + (deltaEcg > 0 ? '+' : '') + deltaEcg + 'Hz',
        color:  '#f97316',
        osmKey: 'ADAPT',
      });
    }

    if (_events.length > MAX) _events.splice(0, _events.length - MAX);
    _render();
  }

  // ── Render the track ──────────────────────────────────────
  function _render() {
    const track = document.getElementById('tlvTrack');
    if (!track) return;

    if (_events.length === 0) {
      track.innerHTML = '<span class="tlv-empty">Lancez un scénario pour voir la timeline</span>';
      return;
    }

    track.innerHTML = _events.map((ev, i) => {
      const isFirst  = i === 0;
      const isLast   = i === _events.length - 1;
      const isAdapt  = ev.type === 'adapt';
      const labelAbove = (i % 2 === 0);

      return `<div class="tev ${isAdapt ? 'tev-adapt' : 'tev-sit'}">
        <div class="tev-label ${labelAbove ? 'tev-label-top' : 'tev-label-hide'}">
          <div class="tev-name" style="color:${ev.color}">${isAdapt ? '⚡ ' : ''}${ev.label}</div>
          <div class="tev-code">${ev.code}</div>
        </div>
        <div class="tev-axis-row">
          <div class="tev-conn ${isFirst ? 'tev-conn-none' : ''}"
               style="background:linear-gradient(90deg,transparent,${ev.color}55)"></div>
          <div class="tev-dot ${isAdapt ? 'tev-dot-sq' : ''}"
               style="background:${ev.color};box-shadow:0 0 10px ${ev.color}55"
               title="${ev.label} — ${ev.code}"></div>
          <div class="tev-conn ${isLast ? 'tev-conn-none' : ''}"
               style="background:linear-gradient(90deg,${ev.color}55,transparent)"></div>
        </div>
        <div class="tev-label ${labelAbove ? 'tev-label-hide' : 'tev-label-bot'}">
          <div class="tev-name" style="color:${ev.color}">${isAdapt ? '⚡ ' : ''}${ev.label}</div>
          <div class="tev-code">${ev.code}</div>
        </div>
        <div class="tev-time">t${ev.t}s</div>
      </div>`;
    }).join('');

    // Auto-scroll to latest event
    const wrap = document.getElementById('tlvWrap');
    if (wrap) setTimeout(() => { wrap.scrollLeft = wrap.scrollWidth; }, 60);
  }

  function clear() {
    _events.length = 0;
    _startTime     = null;
    _prevOsmKey    = null;
    _render();
  }

  return { start, addEvent, clear };
})();
