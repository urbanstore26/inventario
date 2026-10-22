'use strict';
/* Pantalla de inicio de sesión, arranque de la sesión y cierre */

const ROLE_LABELS = {admin: 'Administrador', vendedor: 'Vendedor'};

const AUTH_ICONS = {
  mail: '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/></svg>',
  lock: '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>',
  eye: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>',
  eyeOff: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 3l18 18"/><path d="M10.6 6.1A9.8 9.8 0 0 1 12 5c6 0 10 7 10 7a17 17 0 0 1-3.2 4M6.5 6.7C3.7 8.5 2 12 2 12s4 7 10 7c1.7 0 3.2-.4 4.5-1.1"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/></svg>'
};
const rememberPref = () => { try { return localStorage.getItem('pu_remember') !== '0'; } catch (e) { return true; } };

function showAuth({demo = false, message = ''} = {}) {
  appReady = false;
  $('#app').hidden = true;
  const form = `
      <p class="auth-sub">Ingresa con tu cuenta para continuar</p>
      <p class="auth-err" id="authErr" role="alert"${message ? '' : ' hidden'}>${esc(message)}</p>
      <form data-form="login" class="auth-form" autocomplete="on">
        <label class="field"><span class="sr">Correo</span>${AUTH_ICONS.mail}<input name="email" type="email" required autocomplete="username" placeholder="Correo electrónico"></label>
        <label class="field"><span class="sr">Contraseña</span>${AUTH_ICONS.lock}<input name="password" type="password" required autocomplete="current-password" placeholder="Contraseña">
          <button type="button" class="pw-toggle" data-action="togglePw" aria-label="Mostrar contraseña" aria-pressed="false">${AUTH_ICONS.eye}</button></label>
        <div class="auth-opts">
          <label class="chk"><input type="checkbox" name="remember"${rememberPref() ? ' checked' : ''}> Recordarme</label>
          <button type="button" class="auth-link" data-action="forgot">¿Olvidaste tu contraseña?</button>
        </div>
        <p class="auth-help" id="authHelp" hidden>Pide a un administrador que restablezca tu contraseña. Las cuentas las gestiona la tienda.</p>
        <button class="auth-btn">Entrar</button>
      </form>`;
  const demoBox = `
      <p class="auth-sub">Modo demostración</p>
      <p class="auth-err" id="authErr" role="alert"${message ? '' : ' hidden'}>${esc(message)}</p>
      <div class="auth-form">
        <p class="auth-text">Supabase no está configurado, así que la app funciona con datos de ejemplo guardados solo en este navegador. No hay cuentas de usuario.</p>
        <button class="auth-btn" data-action="enterDemo">Entrar a la demo</button>
        <p class="auth-text auth-small">Para activar el login real y la base de datos, completa <code>js/config.js</code> (ver README).</p>
      </div>`;
  $('#authRoot').innerHTML = `
    <div class="auth">
      <div class="auth-bg" aria-hidden="true"><i></i><i></i><i></i></div>
      <div class="auth-card">
        <div class="auth-badge"><img src="assets/logo-circle.png" alt="Plante Urban Store"></div>
        <h1>Bienvenido</h1>
        ${demo ? demoBox : form}
      </div>
      <p class="auth-foot">Plante Urban Store · Sistema de inventario</p>
    </div>`;
  const first = $('#authRoot input'); if (first) first.focus();
}
const authError = msg => { const e = $('#authErr'); if (e) { e.textContent = msg; e.hidden = !msg; } };

async function startApp() {
  await store.init();
  appReady = true;
  $('#authRoot').innerHTML = '';
  $('#app').hidden = false;
  renderUserBox();
  route();
}

function renderUserBox() {
  const u = store.user;
  $('#userBox').innerHTML = `<div class="u-name">${esc(u.name)}</div><div class="u-role">${esc(ROLE_LABELS[u.role] || u.role)}${store.mode === 'local' ? ' · datos locales' : ''}</div>
    <button class="btn sm" data-action="logout">Cerrar sesión</button>`;
}

async function doLogin(form) {
  authError('');
  try {
    if (store.mode === 'supabase') {
      const remember = form.elements.remember.checked;
      try { localStorage.setItem('pu_remember', remember ? '1' : '0'); } catch (e) {}
      if (remember !== store.remember) store.connect(remember);   // sesión en localStorage (recordar) o solo en esta pestaña
      if (!remember) store.forgetStored();
    }
    await store.signIn(form.elements.email.value.trim(), form.elements.password.value);
    await startApp();
  } catch (e) {
    authError(e.message);
    try { await store.signOut(); } catch (_) {}
  }
}

async function doLogout() {
  try { await store.signOut(); } catch (e) {}
  appReady = false; state = blank(); productImage = null;
  Object.assign(pos, {cart: [], sel: null, q: '', discount: '', paid: '', customer: ''});
  closeModal();
  showAuth({demo: store.mode === 'local'});
}

async function boot() {
  try { const t = localStorage.getItem('pu_theme'); if (t) document.documentElement.dataset.theme = t; } catch (e) {}
  const wantsSupabase = APP_CONFIG.supabaseUrl && APP_CONFIG.supabaseAnonKey;
  if (wantsSupabase) {
    if (!window.supabase) { store = SupabaseStore; return showAuth({message: 'No se pudo cargar la librería de Supabase. Revisa tu conexión a internet y recarga.'}); }
    store = SupabaseStore; store.connect(rememberPref());
    try {
      if (await store.session()) { await store.loadProfile(); await startApp(); return; }
    } catch (e) { try { await store.signOut(); } catch (_) {} return showAuth({message: e.message}); }
    return showAuth();
  }
  store = LocalStore;
  if (await store.session()) { await startApp(); return; }
  showAuth({demo: true});
}
