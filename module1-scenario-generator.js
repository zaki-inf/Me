'use strict';
// ══════════════════════════════════════════════════════════════
// MODULE 1 — Scenario Generator
// Génère les cas : patient critique, réseau faible, IoT limité,
// saturation — avec les objectifs QoS/SLA associés
// ══════════════════════════════════════════════════════════════

window.ScenarioGenerator = (function () {

  const SCENARIOS = [
    {
      id: 0, simKey: 'stable',
      name: 'S1 — Dégradation Silencieuse',
      desc: 'Patient stable dont le SpO₂ chute progressivement. Le système détecte l\'anomalie avant le médecin et reconfigure les modules.',
      severity: 'stable', network: 'high', device: 'tablet',
      qos: {
        latency: { target: '≤ 500ms',   sla: 500  },
        ecgHz:   { target: '≥ 250 Hz',  sla: 250  },
        uptime:  { target: '≥ 99%',     sla: 99   },
        bw:      { target: '≥ 64 Kbps', sla: 64   },
      },
      color: '#4ade80',
    },
    {
      id: 1, simKey: 'network_storm',
      name: 'S2 — Tempête Réseau',
      desc: 'Patient critique avec défaillance réseau simultanée. Le moteur active la compression maximale tout en maintenant ECG et SpO₂.',
      severity: 'critical', network: 'low', device: 'station',
      qos: {
        latency: { target: '≤ 200ms',   sla: 200  },
        ecgHz:   { target: '≥ 250 Hz',  sla: 250  },
        uptime:  { target: '≥ 99.9%',   sla: 99.9 },
        bw:      { target: '≥ 8 Kbps',  sla: 8    },
      },
      color: '#f87171',
    },
    {
      id: 2, simKey: 'iot_constrained',
      name: 'S3 — Contrainte IoT',
      desc: 'Patient modéré surveillé par un capteur IoT limité. Le système suspend les modules non vitaux et priorise ECG + SpO₂.',
      severity: 'moderate', network: 'medium', device: 'iot',
      qos: {
        latency: { target: '≤ 350ms',   sla: 350  },
        ecgHz:   { target: '≥ 125 Hz',  sla: 125  },
        uptime:  { target: '≥ 99%',     sla: 99   },
        bw:      { target: '≥ 20 Kbps', sla: 20   },
      },
      color: '#fb923c',
    },
    {
      id: 3, simKey: 'rebound',
      name: 'S4 — Rebond Clinique',
      desc: 'Patient en stabilisation après épisode critique. Désescalade progressive : réduction ECG Hz et libération des ressources.',
      severity: 'moderate', network: 'high', device: 'tablet',
      qos: {
        latency: { target: '≤ 400ms',   sla: 400  },
        ecgHz:   { target: '≥ 200 Hz',  sla: 200  },
        uptime:  { target: '≥ 99.5%',   sla: 99.5 },
        bw:      { target: '≥ 32 Kbps', sla: 32   },
      },
      color: '#38bdf8',
    },
    {
      id: 4, simKey: 'saturation',
      name: 'S5 — Saturation Totale',
      desc: 'Triple contrainte : critique + réseau < 6 Kbps + IoT limité. Mode survie minimale garantie.',
      severity: 'critical', network: 'low', device: 'iot',
      qos: {
        latency: { target: '≤ 300ms',  sla: 300  },
        ecgHz:   { target: '≥ 125 Hz', sla: 125  },
        uptime:  { target: '≥ 98%',    sla: 98   },
        bw:      { target: '≥ 4 Kbps', sla: 4    },
      },
      color: '#a78bfa',
    },
  ];

  const RULES = [
    {
      id: 'R1', cond: (s, n) => s === 'critical' && n !== 'low',
      label: 'Critique + réseau OK',
      action: 'ECG 500 Hz · SpO₂ 1 s · ALARME SALLE',
      adaptations: ['scale_service:up', 'activate_cache:vitals', 'reroute:priority'],
      config: { ecgHz: 500, spo2Int: 1,  tempInt: 5,  bp: '30 s',     resp: '1 s',     comp: 'Élevée',   alert: 'ALARME SALLE',    modules: 6 },
    },
    {
      id: 'R2', cond: (s, n, d) => s === 'critical' && n === 'low' && d !== 'iot',
      label: 'Critique + réseau dégradé + Station/Tablette',
      action: 'ECG 250 Hz compressé · SpO₂ 1 s · PA+Resp suspendus · ALARME+SMS',
      adaptations: ['compress_data:max', 'reduce_ecg_freq:250', 'reroute:sms'],
      config: { ecgHz: 250, spo2Int: 1,  tempInt: 10, bp: 'SUSPENDU', resp: 'SUSPENDU', comp: 'Maximale', alert: 'ALARME + SMS',   modules: 3 },
    },
    {
      id: 'R3', cond: (s, n, d) => s === 'critical' && n === 'low' && d === 'iot',
      label: 'Critique + réseau dégradé + IoT — Survie minimale',
      action: 'ECG 125 Hz compressé · SpO₂ 2 s uniquement · ALARME MAX',
      adaptations: ['compress_data:max', 'reduce_ecg_freq:125', 'activate_cache:local', 'reroute:emergency'],
      config: { ecgHz: 125, spo2Int: 2,  tempInt: 30, bp: 'SUSPENDU', resp: 'SUSPENDU', comp: 'MAX',      alert: 'ALARME MAX+SMS', modules: 2 },
    },
    {
      id: 'R4', cond: (s, n, d) => s === 'moderate' && d === 'station',
      label: 'Modéré + Station clinique',
      action: 'ECG 400 Hz · SpO₂ 5 s · SMS + Appel',
      adaptations: ['scale_service:medium', 'activate_cache:partial'],
      config: { ecgHz: 400, spo2Int: 5,  tempInt: 10, bp: '2 min',    resp: '5 s',     comp: 'Élevée',   alert: 'SMS + Appel',    modules: 6 },
    },
    {
      id: 'R5', cond: (s, n, d) => s === 'moderate' && d === 'tablet',
      label: 'Modéré + Tablette',
      action: 'ECG 250 Hz · SpO₂ 10 s · SMS',
      adaptations: ['scale_service:medium', 'compress_data:partial'],
      config: { ecgHz: 250, spo2Int: 10, tempInt: 30, bp: '5 min',    resp: 'RÉDUIT',  comp: 'Élevée',   alert: 'SMS',            modules: 4 },
    },
    {
      id: 'R6', cond: (s, n, d) => s === 'moderate' && d === 'iot',
      label: 'Modéré + IoT — Ressources limitées',
      action: 'ECG 125 Hz · SpO₂ 15 s · PA+Resp suspendus · SMS',
      adaptations: ['reduce_ecg_freq:125', 'compress_data:max', 'activate_cache:local'],
      config: { ecgHz: 125, spo2Int: 15, tempInt: 60, bp: 'SUSPENDU', resp: 'SUSPENDU', comp: 'Maximale', alert: 'SMS',            modules: 2 },
    },
    {
      id: 'R7', cond: (s, n) => s === 'stable' && n === 'low',
      label: 'Stable + réseau dégradé — Économie bande passante',
      action: 'ECG 125 Hz · SpO₂ 60 s · PA+Resp suspendus',
      adaptations: ['compress_data:max', 'reduce_ecg_freq:125'],
      config: { ecgHz: 125, spo2Int: 60, tempInt: 120, bp: 'SUSPENDU', resp: 'SUSPENDU', comp: 'Max',     alert: 'Aucune',         modules: 2 },
    },
    {
      id: 'R8', cond: () => true,
      label: 'DEFAULT — Mode standard',
      action: 'ECG 250 Hz · SpO₂ 30 s · tous modules actifs',
      adaptations: ['scale_service:standard'],
      config: { ecgHz: 250, spo2Int: 30, tempInt: 60, bp: '5 min',    resp: '15 s',    comp: 'Standard', alert: 'Aucune',         modules: 6 },
    },
  ];

  function getScenario(idx)      { return SCENARIOS[idx] || null; }
  function getAllScenarios()      { return SCENARIOS; }
  function getRules()            { return RULES; }

  function generateContext(scenario) {
    return {
      severity: scenario.severity,
      network:  scenario.network,
      device:   scenario.device,
      qos:      scenario.qos,
      simKey:   scenario.simKey,
    };
  }

  return { getScenario, getAllScenarios, getRules, generateContext };
})();
