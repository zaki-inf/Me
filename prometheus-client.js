'use strict';
// ══════════════════════════════════════════════════════════════
// PROMETHEUS CLIENT — Ai Medical InFo
// Tente de se connecter à Prometheus; bascule en simulation si absent.
// ══════════════════════════════════════════════════════════════

window.PrometheusClient = (function () {

  let endpoint   = 'http://localhost:9090';
  let connected  = false;
  let lastQuery  = '—';

  // ── PromQL queries pour chaque métrique ───────────────────
  const QUERIES = {
    heart_rate:       'heart_rate_bpm{patient_id="P-0042",job="ecg_monitor"}',
    spo2:             'spo2_percent{patient_id="P-0042",job="ecg_monitor"}',
    temperature:      'body_temperature_celsius{patient_id="P-0042",job="ecg_monitor"}',
    systolic_bp:      'blood_pressure_systolic{patient_id="P-0042",job="ecg_monitor"}',
    diastolic_bp:     'blood_pressure_diastolic{patient_id="P-0042",job="ecg_monitor"}',
    respiratory_rate: 'respiratory_rate{patient_id="P-0042",job="ecg_monitor"}',
    network_bw:       'network_bandwidth_kbps{gateway_id="GW-01",job="gateway_monitor"}',
    ecg_hz:           'ecg_sampling_hz{device_id="BLE-0042",job="device_monitor"}',
    alert_latency_ms: 'alert_dispatch_latency_ms{patient_id="P-0042"}',
    cpu_device:       'device_cpu_percent{device_id="BLE-0042",job="device_monitor"}',
  };

  // ── Grafana panel IDs (ajustez selon votre dashboard) ─────
  const GRAFANA_BASE  = 'http://localhost:3000';
  const GRAFANA_DASH  = 'ami-esante-monitoring';
  const GRAFANA_PANELS = {
    heart_rate:       2,
    spo2:             3,
    temperature:      4,
    network_bw:       8,
    alert_latency_ms: 12,
  };

  // ── Simulation fallback ────────────────────────────────────
  const SIM = {
    stable: () => ({
      heart_rate: _r(68, 82),      spo2: _r(97, 99),
      temperature: _rf(36.4, 37.0), systolic_bp: _r(110, 125),
      diastolic_bp: _r(70, 80),    respiratory_rate: _r(13, 18),
      network_bw: _r(80, 150),     ecg_hz: 250,
      alert_latency_ms: _r(120, 180), cpu_device: _r(25, 45),
    }),
    moderate: () => ({
      heart_rate: _r(100, 115),    spo2: _r(93, 96),
      temperature: _rf(38.1, 38.9),systolic_bp: _r(145, 162),
      diastolic_bp: _r(90, 102),   respiratory_rate: _r(20, 26),
      network_bw: _r(28, 60),      ecg_hz: 400,
      alert_latency_ms: _r(140, 200), cpu_device: _r(50, 70),
    }),
    critical: () => ({
      heart_rate: _r(118, 145),    spo2: _r(84, 91),
      temperature: _rf(39.1, 40.2),systolic_bp: _r(168, 198),
      diastolic_bp: _r(108, 122),  respiratory_rate: _r(28, 36),
      network_bw: _r(4, 18),       ecg_hz: 500,
      alert_latency_ms: _r(80, 160),  cpu_device: _r(15, 38),
    }),
    network_storm: () => ({
      ...SIM.critical(),
      network_bw: _r(2, 8),
      ecg_hz: 250,
      alert_latency_ms: _r(180, 280),
    }),
    iot_constrained: () => ({
      ...SIM.moderate(),
      network_bw: _r(18, 35),
      cpu_device: _r(85, 98),
      ecg_hz: 125,
    }),
    rebound: () => ({
      heart_rate: _r(72, 88),      spo2: _r(95, 98),
      temperature: _rf(37.0, 37.8),systolic_bp: _r(128, 142),
      diastolic_bp: _r(82, 92),    respiratory_rate: _r(16, 22),
      network_bw: _r(50, 100),     ecg_hz: 250,
      alert_latency_ms: _r(130, 190), cpu_device: _r(40, 60),
    }),
    saturation: () => ({
      ...SIM.critical(),
      network_bw: _r(2, 6),
      cpu_device: _r(88, 98),
      ecg_hz: 250,
      alert_latency_ms: _r(200, 320),
    }),
  };

  function _r(a,b)  { return Math.floor(Math.random()*(b-a+1))+a; }
  function _rf(a,b) { return parseFloat((Math.random()*(b-a)+a).toFixed(1)); }

  // ── Fetch from real Prometheus ─────────────────────────────
  async function fetchMetric(metricKey) {
    const query = QUERIES[metricKey];
    if (!query) return null;
    try {
      const url = `${endpoint}/api/v1/query?query=${encodeURIComponent(query)}`;
      const res = await fetch(url, { signal: AbortSignal.timeout(1500) });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      if (data.status === 'success' && data.data.result.length > 0) {
        return parseFloat(data.data.result[0].value[1]);
      }
    } catch (_) { /* fallback */ }
    return null;
  }

  // ── Public API ─────────────────────────────────────────────
  async function getMetrics(simKey) {
    // Try live Prometheus for every metric
    const live = {};
    let anyLive = false;

    await Promise.allSettled(
      Object.keys(QUERIES).map(async k => {
        const v = await fetchMetric(k);
        if (v !== null) { live[k] = v; anyLive = true; }
      })
    );

    if (anyLive) {
      connected = true;
      _updateUI(true);
      // Fill missing with simulation
      const sim = SIM[simKey] ? SIM[simKey]() : SIM.stable();
      return { ...sim, ...live, _source: 'prometheus' };
    }

    connected = false;
    _updateUI(false);
    const sim = SIM[simKey] ? SIM[simKey]() : SIM.stable();
    return { ...sim, _source: 'simulation' };
  }

  async function testConnection(ep) {
    endpoint = ep || endpoint;
    try {
      const res = await fetch(`${endpoint}/api/v1/query?query=up`,
        { signal: AbortSignal.timeout(2000) });
      connected = res.ok;
    } catch(_) { connected = false; }
    _updateUI(connected);
    return connected;
  }

  function setEndpoint(ep) { endpoint = ep; }

  function getPromQLForDisplay(metricKey) {
    return QUERIES[metricKey] || '—';
  }

  function getGrafanaURL(metricKey) {
    const panelId = GRAFANA_PANELS[metricKey] || 1;
    return `${GRAFANA_BASE}/d/${GRAFANA_DASH}?viewPanel=${panelId}`;
  }

  function getExampleDashboardYAML() {
    return `# grafana/provisioning/dashboards/ami-esante.yaml
apiVersion: 1
providers:
  - name: 'Ai Medical InFo'
    folder: 'e-Santé'
    type: file
    options:
      path: /etc/grafana/dashboards

# Panels suggérés :
# - Panel 2  : heart_rate_bpm{patient_id="P-0042"}
# - Panel 3  : spo2_percent{patient_id="P-0042"}
# - Panel 4  : body_temperature_celsius{patient_id="P-0042"}
# - Panel 8  : network_bandwidth_kbps{gateway_id="GW-01"}
# - Panel 12 : alert_dispatch_latency_ms{patient_id="P-0042"}`;
  }

  function _updateUI(live) {
    const dot   = document.getElementById('promDot');
    const label = document.getElementById('promLabel');
    const badge = document.getElementById('promSourceBadge');
    if (dot)   dot.className   = 'prom-dot ' + (live ? 'pd-live' : 'pd-sim');
    if (label) label.textContent = live
      ? `Prometheus : connecté — ${endpoint}`
      : 'Prometheus : simulation locale (Prometheus non joignable)';
    if (badge) badge.textContent = live ? '⚡ Source : Prometheus live' : '🔵 Source : simulation';
    if (badge) badge.className   = 'prom-source-badge ' + (live ? 'psb-live' : 'psb-sim');
  }

  function isConnected() { return connected; }

  return { getMetrics, testConnection, setEndpoint, getPromQLForDisplay, getGrafanaURL, getExampleDashboardYAML, isConnected, QUERIES };
})();
