'use strict';
/* Vista: Usuarios (solo administrador): crear cuentas, rol, estado y contraseña */

const ROLE_INFO = {
  admin:    {label: 'Administrador', cls: 'b-admin'},
  vendedor: {label: 'Vendedor',      cls: 'b-seller'}
};
/* [permiso, administrador, vendedor] */
const PERMISSIONS = [
  ['Ver inventario y stock por talla', true, true],
  ['Registrar ventas e imprimir tickets', true, true],
  ['Ver el historial de ventas', true, true],
  ['Ver costos, utilidades y el panel', true, false],
  ['Crear y editar productos y fotos', true, false],
  ['Entradas, salidas y ajustes de stock', true, false],
  ['Anular ventas y exportar reportes', true, false],
  ['Ajustes de la tienda y usuarios', true, false]
];
const MIN_PASSWORD = 8;

function renderUsers() {
  $('#view').innerHTML = `
  <div class="toolbar">
    <input class="grow" id="usrQ" type="search" placeholder="Buscar por nombre o correo…" value="${esc(ui.usr.q)}">
    <button class="btn primary" data-action="newUser">+ Nuevo usuario</button>
  </div>
  <div id="usrTable"></div>
  <div class="card" style="margin-top:24px"><h3>Qué puede hacer cada rol</h3>
    <div class="tablewrap"><table class="perm"><thead><tr><th>Permiso</th><th>Administrador</th><th>Vendedor</th></tr></thead><tbody>
      ${PERMISSIONS.map(([t, a, v]) => `<tr><td>${t}</td><td>${a ? '<span class="yes" aria-label="Sí"></span>' : '<span class="muted" aria-label="No">—</span>'}</td><td>${v ? '<span class="yes" aria-label="Sí"></span>' : '<span class="muted" aria-label="No">—</span>'}</td></tr>`).join('')}
    </tbody></table></div></div>`;
  drawUsers();
}

function drawUsers() {
  const q = ui.usr.q.trim().toLowerCase(), me = store.user.id;
  const rows = state.users.filter(u => !q || `${u.name} ${u.email}`.toLowerCase().includes(q))
    .sort((a, b) => (a.role === b.role ? a.name.localeCompare(b.name) : a.role === 'admin' ? -1 : 1));
  if (!rows.length) { $('#usrTable').innerHTML = '<div class="card empty">No hay usuarios con esa búsqueda.</div>'; return; }
  const admins = state.users.filter(u => u.role === 'admin' && u.active).length;
  $('#usrTable').innerHTML = `<div class="tablewrap"><table>
    <thead><tr><th>Usuario</th><th>Correo</th><th>Rol</th><th>Estado</th><th>Creado</th><th></th></tr></thead>
    <tbody>${rows.map(u => {
      const mine = u.id === me, role = ROLE_INFO[u.role] || {label: u.role, cls: 'b-neutral'};
      const lastAdmin = u.role === 'admin' && u.active && admins <= 1;
      return `<tr><td><div class="name">${esc(u.name)}${mine ? ' <span class="muted">(tú)</span>' : ''}</div></td>
        <td>${esc(u.email)}</td>
        <td><span class="badge ${role.cls}">${esc(role.label)}</span></td>
        <td><span class="badge ${u.active ? 'b-ok' : 'b-neutral'}">${u.active ? 'Activo' : 'Inactivo'}</span></td>
        <td class="num">${u.createdAt ? new Date(u.createdAt).toLocaleDateString('es', {day: '2-digit', month: 'short', year: 'numeric'}) : '—'}</td>
        <td><div class="acts"><button class="btn sm" data-action="editUser" data-id="${esc(u.id)}">Editar</button><button class="btn sm" data-action="userPassword" data-id="${esc(u.id)}">Contraseña</button><button class="btn sm danger" data-action="deleteUser" data-id="${esc(u.id)}"${mine || lastAdmin ? ' disabled title="No se puede eliminar"' : ''}>Eliminar</button></div></td></tr>`;
    }).join('')}</tbody></table></div>
    <p class="muted">${rows.length} usuarios · ${admins} administrador${admins === 1 ? '' : 'es'} activo${admins === 1 ? '' : 's'}</p>`;
}

const roleOptions = sel => Object.entries(ROLE_INFO).map(([k, v]) => `<option value="${k}"${k === sel ? ' selected' : ''}>${v.label}</option>`).join('');

function randomPassword(len = 12) {
  const chars = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const buf = new Uint32Array(len); crypto.getRandomValues(buf);
  return [...buf].map(n => chars[n % chars.length]).join('');
}
const passwordField = (label = 'Contraseña') => `
  <label class="f">${label} (mínimo ${MIN_PASSWORD} caracteres)
    <div class="pw-row"><input name="password" type="password" required minlength="${MIN_PASSWORD}" maxlength="72" autocomplete="new-password">
      <button type="button" class="btn sm" data-action="genPassword">Generar</button></div></label>`;

function userForm(id) {
  const u = id ? state.users.find(x => x.id === id) : null;
  if (id && !u) return;
  const mine = u && u.id === store.user.id;
  const lastAdmin = u && u.role === 'admin' && u.active && state.users.filter(x => x.role === 'admin' && x.active).length <= 1;
  const locked = mine || lastAdmin;
  openModal(`<h2>${u ? 'Editar usuario' : 'Nuevo usuario'}</h2>
  <form data-form="${u ? 'user-edit' : 'user-new'}" data-id="${u ? esc(u.id) : ''}">
    <div class="form-grid" style="grid-template-columns:1fr">
      <label class="f">Nombre completo<input name="uname" required maxlength="80" value="${u ? esc(u.name) : ''}" placeholder="Ej. María Hernández"></label>
      ${u ? `<label class="f">Correo<input value="${esc(u.email)}" disabled></label>`
          : `<label class="f">Correo<input name="email" type="email" required autocomplete="off" placeholder="usuario@correo.com"></label>${passwordField()}`}
      <label class="f">Rol<select name="role"${locked ? ' disabled' : ''}>${roleOptions(u ? u.role : 'vendedor')}</select></label>
      ${u ? `<label class="chk-line"><input type="checkbox" name="active"${u.active ? ' checked' : ''}${locked ? ' disabled' : ''}> Cuenta activa (puede iniciar sesión)</label>` : ''}
    </div>
    ${locked ? `<p class="muted" style="margin:10px 0 0">${mine ? 'No puedes cambiar tu propio rol ni desactivarte.' : 'Es el único administrador activo: crea otro antes de cambiarlo.'}</p>` : ''}
    <p class="muted" style="margin:12px 0 0">Administrador: acceso total. Vendedor: ve el stock, vende e imprime tickets.</p>
    <div class="foot"><button type="button" class="btn" data-action="closeModal">Cancelar</button><button class="btn primary">${u ? 'Guardar' : 'Crear usuario'}</button></div>
  </form>`);
}

function userPasswordForm(id) {
  const u = state.users.find(x => x.id === id); if (!u) return;
  openModal(`<h2>Cambiar contraseña</h2>
  <form data-form="user-pass" data-id="${esc(u.id)}">
    <p class="muted" style="margin-top:0">Nueva contraseña para <b>${esc(u.name)}</b> (${esc(u.email)}). Entrégasela por un medio seguro.</p>
    <div class="form-grid" style="grid-template-columns:1fr">${passwordField('Nueva contraseña')}</div>
    <div class="foot"><button type="button" class="btn" data-action="closeModal">Cancelar</button><button class="btn primary">Cambiar contraseña</button></div>
  </form>`);
}

const checkPassword = pw => { if (pw.length < MIN_PASSWORD) throw new Error(`La contraseña debe tener al menos ${MIN_PASSWORD} caracteres`); };

async function saveUserNew(form) {
  const el = form.elements, pw = el.password.value;
  checkPassword(pw);
  await store.createUser({name: el.uname.value.trim(), email: el.email.value.trim().toLowerCase(), password: pw, role: el.role.value});
  closeModal(); toast('Usuario creado'); refresh();
}
async function saveUserEdit(form) {
  const el = form.elements, id = form.dataset.id;
  const u = state.users.find(x => x.id === id); if (!u) throw new Error('El usuario ya no existe');
  await store.updateUser(id, {name: el.uname.value.trim(), role: el.role.disabled ? u.role : el.role.value, active: el.active.disabled ? u.active : el.active.checked});
  closeModal(); toast('Usuario actualizado'); refresh();
}
async function saveUserPassword(form) {
  const pw = form.elements.password.value;
  checkPassword(pw);
  await store.setUserPassword(form.dataset.id, pw);
  closeModal(); toast('Contraseña actualizada');
}
async function removeUser(id) {
  const u = state.users.find(x => x.id === id);
  if (!u || !confirm(`¿Eliminar a ${u.name} (${u.email})? Perderá el acceso de inmediato. Sus ventas anteriores se conservan.`)) return;
  await run(null, async () => { await store.deleteUser(id); toast('Usuario eliminado'); refresh(); });
}
