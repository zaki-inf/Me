// ── Mobile nav ──────────────────────────────────────────────
const navToggle = document.getElementById('navToggle');
const header = document.querySelector('.site-header');
const nav = document.querySelector('.main-nav');

navToggle.addEventListener('click', () => {
  header.classList.toggle('nav-open');
  nav.classList.toggle('open');
});
document.querySelectorAll('.main-nav a').forEach(l => l.addEventListener('click', () => {
  header.classList.remove('nav-open');
  nav.classList.remove('open');
}));

// ── Active nav on scroll ─────────────────────────────────────
const sections = document.querySelectorAll('section[id]');
const navLinks = document.querySelectorAll('.main-nav a');
new IntersectionObserver(entries => {
  entries.forEach(e => {
    if (e.isIntersecting) {
      navLinks.forEach(l => l.classList.remove('active'));
      const a = document.querySelector(`.main-nav a[href="#${e.target.id}"]`);
      if (a) a.classList.add('active');
    }
  });
}, { rootMargin: '-40% 0px -55% 0px' }).observe && sections.forEach(s =>
  new IntersectionObserver(entries => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        navLinks.forEach(l => l.classList.remove('active'));
        const a = document.querySelector(`.main-nav a[href="#${e.target.id}"]`);
        if (a) a.classList.add('active');
      }
    });
  }, { rootMargin: '-40% 0px -55% 0px' }).observe(s)
);

// ── Adaptation simulator ─────────────────────────────────────
const configs = {
  // [severity][network][device]
  stable: {
    high:   { station: 'normal',   tablet: 'normal',   iot: 'normal'   },
    medium: { station: 'normal',   tablet: 'normal',   iot: 'degraded' },
    low:    { station: 'degraded', tablet: 'degraded', iot: 'degraded' }
  },
  moderate: {
    high:   { station: 'moderate', tablet: 'moderate', iot: 'degraded' },
    medium: { station: 'moderate', tablet: 'moderate', iot: 'degraded' },
    low:    { station: 'moderate', tablet: 'degraded', iot: 'degraded' }
  },
  critical: {
    high:   { station: 'critical', tablet: 'critical', iot: 'critical' },
    medium: { station: 'critical', tablet: 'critical', iot: 'critical' },
    low:    { station: 'critical', tablet: 'critical', iot: 'critical' }
  }
};

const modeData = {
  normal: {
    label: 'Mode Normal',
    badge: '',
    summary: 'Patient stable, bonne connectivité. Tous les modules actifs à fréquence standard. Consommation réseau optimale.',
    modules: [
      { name: 'ECG', val: '250 Hz', cls: 'rm-on' },
      { name: 'SpO₂', val: '30 s', cls: 'rm-on' },
      { name: 'Température', val: '60 s', cls: 'rm-on' },
      { name: 'Pression artérielle', val: '5 min', cls: 'rm-on' },
      { name: 'Fréquence respiratoire', val: '15 s', cls: 'rm-on' },
      { name: 'Alertes', val: 'SMS', cls: 'rm-on' }
    ]
  },
  moderate: {
    label: 'Mode Modéré',
    badge: 'badge-moderate',
    summary: 'Vigilance accrue. Fréquence de collecte augmentée, alertes SMS + appel automatique activés. Modules non-critiques réduits.',
    modules: [
      { name: 'ECG', val: '400 Hz', cls: 'rm-warn' },
      { name: 'SpO₂', val: '5 s', cls: 'rm-warn' },
      { name: 'Température', val: '10 s', cls: 'rm-warn' },
      { name: 'Pression artérielle', val: '2 min', cls: 'rm-on' },
      { name: 'Fréquence respiratoire', val: '5 s', cls: 'rm-warn' },
      { name: 'Alertes', val: 'SMS + Appel', cls: 'rm-warn' }
    ]
  },
  critical: {
    label: '⚠ Mode Critique',
    badge: 'badge-critical',
    summary: 'ÉTAT CRITIQUE — tous les modules à fréquence maximale, alarme salle activée, médecin notifié immédiatement.',
    modules: [
      { name: 'ECG', val: '500 Hz', cls: 'rm-crit' },
      { name: 'SpO₂', val: '1 s', cls: 'rm-crit' },
      { name: 'Température', val: '5 s', cls: 'rm-crit' },
      { name: 'Pression artérielle', val: '30 s', cls: 'rm-crit' },
      { name: 'Fréquence respiratoire', val: '1 s', cls: 'rm-crit' },
      { name: 'Alertes', val: 'Alarme salle', cls: 'rm-crit' }
    ]
  },
  degraded: {
    label: 'Mode Dégradé',
    badge: 'badge-degraded',
    summary: 'Réseau limité ou dispositif bas de gamme. Modules non-essentiels suspendus, compression maximale activée pour les données vitales.',
    modules: [
      { name: 'ECG', val: '125 Hz*', cls: 'rm-on' },
      { name: 'SpO₂', val: '60 s', cls: 'rm-on' },
      { name: 'Température', val: '120 s', cls: 'rm-on' },
      { name: 'Pression artérielle', val: 'Suspendu', cls: 'rm-off' },
      { name: 'Fréquence respiratoire', val: 'Suspendu', cls: 'rm-off' },
      { name: 'Alertes', val: 'SMS', cls: 'rm-on' }
    ]
  }
};

function getSelection(name) {
  return document.querySelector(`input[name="${name}"]:checked`)?.value;
}

function updateAdaptResult() {
  const sev = getSelection('severity') || 'stable';
  const net = getSelection('network')  || 'high';
  const dev = getSelection('device')   || 'station';

  const modeKey = configs[sev]?.[net]?.[dev] || 'normal';
  const mode = modeData[modeKey];

  const badge = document.getElementById('resultBadge');
  badge.textContent = mode.label;
  badge.className = 'result-badge ' + (mode.badge || '');

  const modulesEl = document.getElementById('resultModules');
  modulesEl.innerHTML = mode.modules.map(m =>
    `<div class="rm-row ${m.cls}">
       <span class="rm-name">${m.name}</span>
       <span class="rm-val">${m.val}</span>
     </div>`
  ).join('');

  document.getElementById('resultSummary').textContent = mode.summary;
}

document.querySelectorAll('input[name="severity"], input[name="network"], input[name="device"]')
  .forEach(r => r.addEventListener('change', updateAdaptResult));

updateAdaptResult();

// ── Smooth scroll ────────────────────────────────────────────
document.querySelectorAll('a[href^="#"]').forEach(a => {
  a.addEventListener('click', e => {
    const t = document.querySelector(a.getAttribute('href'));
    if (t) { e.preventDefault(); t.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
  });
});
