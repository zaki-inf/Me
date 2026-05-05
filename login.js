const CREDENTIALS = {
  patient:        { user: 'patient01',  pass: 'patient123',  name: 'Ahmed Benali',      page: 'dashboard-patient.html' },
  medecin:        { user: 'dr.martin',  pass: 'medecin123',  name: 'Dr. Sophie Martin', page: 'dashboard-medecin.html' },
  directeur:      { user: 'directeur',  pass: 'dir2026',     name: 'M. Karim Oussama',  page: 'dashboard-directeur.html' },
  administration: { user: 'admin',      pass: 'admin2026',   name: 'Admin Système',     page: 'dashboard-admin.html' }
};

const ROLE_LABELS = {
  patient:        '👤 Patient',
  medecin:        '👨‍⚕️ Médecin',
  directeur:      '👔 Directeur',
  administration: '⚙️ Administration'
};

let currentRole = null;

function selectRole(role) {
  currentRole = role;
  document.querySelectorAll('.role-card').forEach(c => c.classList.remove('selected'));
  document.querySelector(`[data-role="${role}"]`).classList.add('selected');

  const banner = document.getElementById('roleBanner');
  banner.textContent = `Rôle sélectionné : ${ROLE_LABELS[role]}`;
  banner.classList.add('visible');

  const cred = CREDENTIALS[role];
  const hint = document.getElementById('demoHint');
  hint.innerHTML = `<strong>Accès démo :</strong><br>Identifiant : <code>${cred.user}</code> &nbsp;|&nbsp; Mot de passe : <code>${cred.pass}</code>`;
  hint.classList.add('visible');

  document.getElementById('loginError').classList.remove('visible');
  document.getElementById('username').value = '';
  document.getElementById('password').value = '';
  document.getElementById('username').focus();
}

function handleLogin(e) {
  e.preventDefault();

  if (!currentRole) {
    showError('Veuillez sélectionner un rôle avant de vous connecter.');
    return;
  }

  const user = document.getElementById('username').value.trim();
  const pass = document.getElementById('password').value;
  const cred = CREDENTIALS[currentRole];

  const btn = document.getElementById('loginBtn');
  btn.disabled = true;
  btn.innerHTML = '<div class="spinner"></div> Connexion...';

  setTimeout(() => {
    if (user === cred.user && pass === cred.pass) {
      sessionStorage.setItem('ami_role',     currentRole);
      sessionStorage.setItem('ami_username', cred.name);
      window.location.href = cred.page;
    } else {
      btn.disabled = false;
      btn.textContent = 'Se connecter';
      showError('Identifiant ou mot de passe incorrect. Vérifiez les accès démo ci-dessus.');
    }
  }, 900);
}

function showError(msg) {
  const el = document.getElementById('loginError');
  el.textContent = msg;
  el.classList.add('visible');
}

function togglePw() {
  const inp = document.getElementById('password');
  inp.type = inp.type === 'password' ? 'text' : 'password';
}
