'use strict';
// ══════════════════════════════════════════════════════════════
// MODULE 2 — Monitoring Layer
// Collecte et enrichit les métriques :
// latency, SpO₂ drop, ECG Hz, CPU, bandwidth, error_rate,
// spo2_drop_rate, latency_trend
// ══════════════════════════════════════════════════════════════

window.MonitoringLayer = (function () {

  let _prevSpo2    = null;
  let _prevLatency = null;

  // ── Collect from Prometheus or simulation ─────────────────
  async function collect(scenario) {
    const raw = await PrometheusClient.getMetrics(scenario.simKey);
    return _enrich(raw, scenario);
  }

  function _enrich(raw, scenario) {
    // error_rate: derived from network quality × CPU load
    const errBase   = scenario.network === 'low'    ? _rf(8, 18)
                    : scenario.network === 'medium'  ? _rf(2, 8)
                    :                                  _rf(0.1, 2);
    const cpuFactor = raw.cpu_device > 85 ? 1.4 : raw.cpu_device > 60 ? 1.1 : 1.0;
    const error_rate = parseFloat(Math.min(25, errBase * cpuFactor).toFixed(1));

    // spo2_drop: approximate per-minute rate
    const spo2_drop = _prevSpo2 !== null
      ? parseFloat(((raw.spo2 - _prevSpo2) * 5).toFixed(1))
      : 0;
    _prevSpo2 = raw.spo2;

    // latency_trend
    const latency_trend = _prevLatency === null               ? 'stable'
      : raw.alert_latency_ms > _prevLatency * 1.15 ? 'up'
      : raw.alert_latency_ms < _prevLatency * 0.85 ? 'down'
      :                                               'stable';
    _prevLatency = raw.alert_latency_ms;

    return { ...raw, error_rate, spo2_drop, latency_trend };
  }

  // ── Interpret a single metric value ──────────────────────
  function interpret(key, value) {
    switch (key) {
      case 'heart_rate':
        return value > 120 ? { cls: 'crit', label: 'Tachycardie sévère' }
             : value > 100 ? { cls: 'warn', label: 'Tachycardie' }
             : value < 55  ? { cls: 'warn', label: 'Bradycardie' }
             :                { cls: 'ok',   label: 'Normal' };
      case 'spo2':
        return value < 88 ? { cls: 'crit', label: 'Hypoxie critique' }
             : value < 92 ? { cls: 'crit', label: 'Hypoxie' }
             : value < 95 ? { cls: 'warn', label: 'Limite' }
             :               { cls: 'ok',   label: 'Normal' };
      case 'temperature':
        return value > 39   ? { cls: 'crit', label: 'Hyperthermie' }
             : value > 38.2 ? { cls: 'warn', label: 'Fièvre' }
             :                 { cls: 'ok',   label: 'Normal' };
      case 'systolic_bp':
        return value > 165 ? { cls: 'crit', label: 'HTA grade 3' }
             : value > 140 ? { cls: 'warn', label: 'HTA grade 1' }
             :                { cls: 'ok',   label: 'Normal' };
      case 'respiratory_rate':
        return value > 28 ? { cls: 'crit', label: 'Détresse resp.' }
             : value > 20 ? { cls: 'warn', label: 'Tachypnée' }
             :               { cls: 'ok',   label: 'Normal' };
      case 'network_bw':
        return value < 10 ? { cls: 'crit', label: 'Réseau dégradé' }
             : value < 30 ? { cls: 'warn', label: 'Réseau faible' }
             :               { cls: 'ok',   label: 'Réseau nominal' };
      case 'error_rate':
        return value > 10 ? { cls: 'crit', label: "Taux d'erreur élevé" }
             : value > 4  ? { cls: 'warn', label: 'Erreurs détectées' }
             :               { cls: 'ok',   label: 'Stable' };
      default:
        return { cls: 'ok', label: '—' };
    }
  }

  // ── Render metrics in Col 2 ───────────────────────────────
  function render(metrics) {
    const rows = [
      { key: 'heart_rate',       label: 'Fréquence cardiaque', val: metrics.heart_rate,       unit: 'bpm',   pct: Math.min(100, (metrics.heart_rate / 160) * 100),        promq: 'heart_rate' },
      { key: 'spo2',             label: 'SpO₂',                val: metrics.spo2,             unit: '%',     pct: Math.max(0, (metrics.spo2 - 75) / 25 * 100),            promq: 'spo2' },
      { key: 'temperature',      label: 'Température',         val: metrics.temperature,      unit: '°C',    pct: Math.min(100, (metrics.temperature - 35) / 6 * 100),    promq: 'temperature' },
      { key: 'systolic_bp',      label: 'Pression systolique', val: metrics.systolic_bp,      unit: 'mmHg',  pct: Math.min(100, (metrics.systolic_bp - 80) / 130 * 100), promq: 'systolic_bp' },
      { key: 'respiratory_rate', label: 'Fr. respiratoire',    val: metrics.respiratory_rate, unit: 'r/min', pct: Math.min(100, (metrics.respiratory_rate / 40) * 100),  promq: 'respiratory_rate' },
      { key: 'network_bw',       label: 'Bande passante',      val: metrics.network_bw,       unit: 'Kbps',  pct: Math.min(100, (metrics.network_bw / 150) * 100),       promq: 'network_bw' },
      { key: 'error_rate',       label: "Taux d'erreur réseau",val: metrics.error_rate,       unit: '%',     pct: Math.min(100, metrics.error_rate * 5),                  promq: 'alert_latency_ms' },
    ];

    const container = document.getElementById('metricRows');
    if (container) container.innerHTML = rows.map(row => {
      const i = interpret(row.key, row.val);
      return `<div class="met-row mr-${i.cls}" id="mr-${row.key}">
        <div class="mr-top">
          <span class="mr-label">${row.label}</span>
          <span class="mr-interp ic-${i.cls}">${i.label}</span>
        </div>
        <div class="mr-val-line">
          <span class="mr-val">${row.val}</span><span class="mr-unit">${row.unit}</span>
          <div class="mr-bar"><div class="mr-fill mf-${i.cls}" style="width:${row.pct}%"></div></div>
        </div>
        <div class="mr-promq" onclick="showPromQL('${row.promq}')">
          <span class="promq-label">PromQL:</span>
          <code>${PrometheusClient.getPromQLForDisplay(row.promq).substring(0, 40)}…</code>
        </div>
      </div>`;
    }).join('');

    const critCount = rows.filter(r => interpret(r.key, r.val).cls === 'crit').length;
    const warnCount = rows.filter(r => interpret(r.key, r.val).cls === 'warn').length;
    const trend = metrics.latency_trend === 'up'   ? '↑ hausse'
                : metrics.latency_trend === 'down' ? '↓ baisse' : '→ stable';

    const ibLines = document.getElementById('ibLines');
    if (ibLines) ibLines.innerHTML = [
      `• ${critCount} métrique(s) critique(s), ${warnCount} en alerte`,
      critCount >= 2 ? `• Combinaison critique → OSM classifiera CRITIQUE`
        : warnCount >= 2 ? `• Anomalies multiples → OSM classifiera MODÉRÉ`
        : `• Paramètres normaux → OSM classifiera STABLE`,
      `• Taux d'erreur réseau : ${metrics.error_rate}%  ·  SpO₂ Δ/min : ${metrics.spo2_drop >= 0 ? '+' : ''}${metrics.spo2_drop}%`,
      `• Tendance latence : ${trend}  ·  CPU capteur : ${metrics.cpu_device}%`,
    ].map(l => `<div class="ibl">${l}</div>`).join('');
  }

  function _rf(a, b) { return parseFloat((Math.random() * (b - a) + a).toFixed(1)); }

  return { collect, interpret, render };
})();
