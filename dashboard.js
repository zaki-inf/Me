// Auth guard
const role     = sessionStorage.getItem('ami_role');
const username = sessionStorage.getItem('ami_username');

if (!role || !username) {
  window.location.href = 'login.html';
}

// Set sidebar name & initials
const nameEl   = document.getElementById('sidebarName');
const avatarEl = document.getElementById('sidebarAvatar');
if (nameEl && username) {
  nameEl.textContent = username;
  const parts = username.replace('Dr. ', '').split(' ');
  if (avatarEl) avatarEl.textContent = parts.map(p => p[0]).join('').slice(0, 2).toUpperCase();
}

// Welcome message for patient
const welcomeEl = document.getElementById('welcomeTitle');
if (welcomeEl && username) {
  const firstName = username.split(' ')[0];
  welcomeEl.textContent = `Bonjour, ${firstName} 👋`;
}

// Panel navigation
function showPanel(id) {
  document.querySelectorAll('.dash-panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.sidebar-link').forEach(l => l.classList.remove('active'));

  const panel = document.getElementById('panel-' + id);
  if (panel) panel.classList.add('active');

  const link = document.querySelector(`[onclick="showPanel('${id}')"]`);
  if (link) link.classList.add('active');

  const titles = {
    accueil: 'Tableau de bord', constantes: 'Mes Constantes',
    'rendez-vous': 'Rendez-vous', messages: 'Messages',
    ordonnances: 'Ordonnances', historique: 'Historique',
    tableau: 'Vue d\'ensemble', patients: 'Mes Patients',
    alertes: 'Alertes', consultations: 'Consultations',
    prescriptions: 'Prescriptions', rapports: 'Rapports',
    vue: 'Vue Globale', performance: 'Performance',
    ressources: 'Ressources', statistiques: 'Statistiques',
    conformite: 'Conformité',
    systeme: 'État Système', utilisateurs: 'Utilisateurs',
    roles: 'Rôles & Accès', serveurs: 'Serveurs',
    logs: 'Journaux', parametres: 'Paramètres'
  };
  const tb = document.getElementById('topbarTitle');
  if (tb && titles[id]) tb.textContent = titles[id];
}

// Logout
function logout() {
  sessionStorage.removeItem('ami_role');
  sessionStorage.removeItem('ami_username');
  window.location.href = 'login.html';
}

// Live vitals simulation (patient dashboard only)
function animateVitals() {
  const fields = {
    'vt-hr':   { base: 72,    range: 4,   decimals: 0 },
    'vt-spo2': { base: 98,    range: 1,   decimals: 0 },
    'vt-temp': { base: 36.8,  range: 0.1, decimals: 1 },
    'vt-resp': { base: 16,    range: 2,   decimals: 0 }
  };
  setInterval(() => {
    Object.entries(fields).forEach(([id, cfg]) => {
      const el = document.getElementById(id);
      if (!el) return;
      const val = cfg.base + (Math.random() - 0.5) * cfg.range * 2;
      el.textContent = val.toFixed(cfg.decimals);
    });
  }, 3000);
}
animateVitals();
