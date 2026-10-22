'use strict';
/* Vista: Usuarios y roles. Quien tiene "users.manage" gestiona cuentas; solo el rol Administrador gestiona roles. */

const MIN_PASSWORD = 8;

const roleBadge = id => `<span class="badge ${id === 'admin' ? 'b-admin' : 'b-seller'}">${esc(roleName(id))}</span>`;
/* Solo un Administrador puede tocar cuentas de administrador */
const canTouchUser = u => isAdmin() || u.role !== 'admin';
const assignableRoles = () => state.roles.filter(r => isAdmin() || r.id !== 'admin');

function renderUsers() {
  $('#view').innerHTML = `
  <div class="toolbar">
    <input class="grow" id="usrQ" type="search" placeholder="Buscar por nombre o correo…" value="${esc(ui.usr.q)}">
    <button class="btn primary" data-action="newUser">+ Nuevo usuario</button>
  </div>
  <div id="usrTable"></div>
  <div class="card" style="margin-top:24px">
    <div class="card-head"><h3>Roles y permisos</h3>${isAdmin() ? '<button class="btn sm primary" data-action="newRole">+ Nuevo rol</button>' : ''}</div>
    <div id="roleMatrix"></div>
  </div>`;
  drawUsers(); drawRoles();
}

function drawUsers() {
  const q = ui.usr.q.trim().toLowerCase(), me = store.user.id;
  const rows = state.users.filter(u => !q || `${u.name} ${u.email}`.toLowerCase().includes(q))
    .sort((a, b) => (a.role === b.role ? a.name.localeCompare(b.name) : a.role === 'admin' ? -1 : b.role === 'admin' ? 1 : a.role.localeCompare(b.role)));
  if (!rows.length) { $('#usrTable').innerHTML = '<div class="card empty">No hay usuarios con esa búsqueda.</div>'; return; }
  const admins = state.users.filter(u => u.role === 'admin' && u.active).length;
  $('#usrTable').innerHTML = `<div class="tablewrap"><table>
    <thead><tr><th>Usuario</th><th>Correo</th><th>Rol</th><th>Estado</th><th>Creado</th><th></th></tr></thead>
    <tbody>${rows.map(u => {
      const mine = u.id === me, lastAdmin = u.role === 'admin' && u.active && admins <= 1, locked = !canTouchUser(u);
      return `<tr><td><div class="name">${esc(u.name)}${mine ? ' <span class="muted">(tú)</span>' : ''}</div></td>
        <td>${esc(u.email)}</td>
        <td>${roleBadge(u.role)}</td>
        <td><span class="badge ${u.active ? 'b-ok' : 'b-neutral'}">${u.active ? 'Activo' : 'Inactivo'}</span></td>
        <td class="num">${u.createdAt ? new Date(u.createdAt).toLocaleDateString('es', {day: '2-digit', month: 'short', year: 'numeric'}) : '—'}</td>
        <td><div class="acts"><button class="btn sm" data-action="editUser" data-id="${esc(u.id)}"${locked ? ' disabled' : ''}>Editar</button><button class="btn sm" data-action="userPassword" data-id="${esc(u.id)}"${locked ? ' disabled' : ''}>Contraseña</button><button class="btn sm danger" data-action="deleteUser" data-id="${esc(u.id)}"${mine || lastAdmin || locked ? ' disabled title="No se puede eliminar"' : ''}>Eliminar</button></div></td></tr>`;
    }).join('')}</tbody></table></div>
    <p class="muted">${rows.length} usuarios · ${admins} administrador${admins === 1 ? '' : 'es'} activo${admins === 1 ? '' : 's'}</p>`;
}

/* Matriz roles × permisos, leída de las tablas roles y permissions */
function drawRoles() {
  const roles = state.roles, count = id => state.users.filter(u => u.role === id).length, yes = '<span class="yes" aria-label="Sí"></span>', no = '<span class="muted" aria-label="No">—</span>';
  $('#roleMatrix').innerHTML = `<div class="tablewrap"><table class="perm"><thead><tr><th>Permiso</th>${roles.map(r => `<th><div>${esc(r.name)}</div><div class="meta">${count(r.id)} usuario${count(r.id) === 1 ? '' : 's'}</div>${isAdmin() ? `<div class="acts" style="justify-content:center;margin:6px 0 0"><button class="btn sm" data-action="editRole" data-id="${esc(r.id)}">${r.id === 'admin' ? 'Ver' : 'Editar'}</button>${r.isSystem ? '' : `<button class="btn sm danger" data-action="deleteRole" data-id="${esc(r.id)}">Eliminar</button>`}</div>` : ''}</th>`).join('')}</tr></thead>
    <tbody>${state.permissions.map(p => `<tr><td><div class="name">${esc(p.label)}</div><div class="meta">${esc(p.description)}</div></td>${roles.map(r => `<td>${r.id === 'admin' || r.permissions.includes(p.key) ? yes : no}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}

const roleOptions = sel => assignableRoles().map(r => `<option value="${esc(r.id)}"${r.id === sel ? ' selected' : ''}>${esc(r.name)}</option>`).join('');

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
  if (id && (!u || !canTouchUser(u))) return;
  const mine = u && u.id === store.user.id;
  const lastAdmin = u && u.role === 'admin' && u.active && state.users.filter(x => x.role === 'admin' && x.active).length <= 1;
  const locked = mine || lastAdmin;
  const defaultRole = state.roles.some(r => r.id === 'vendedor') ? 'vendedor' : (assignableRoles()[0] || {}).id;
  openModal(`<h2>${u ? 'Editar usuario' : 'Nuevo usuario'}</h2>
  <form data-form="${u ? 'user-edit' : 'user-new'}" data-id="${u ? esc(u.id) : ''}">
    <div class="form-grid" style="grid-template-columns:1fr">
      <label class="f">Nombre completo<input name="uname" required maxlength="80" value="${u ? esc(u.name) : ''}" placeholder="Ej. María Hernández"></label>
      ${u ? `<label class="f">Correo<input value="${esc(u.email)}" disabled></label>`
          : `<label class="f">Correo<input name="email" type="email" required autocomplete="off" placeholder="usuario@correo.com"></label>${passwordField()}`}
      <label class="f">Rol<select name="role"${locked ? ' disabled' : ''}>${roleOptions(u ? u.role : defaultRole)}</select></label>
      ${u ? `<label class="chk-line"><input type="checkbox" name="active"${u.active ? ' checked' : ''}${locked ? ' disabled' : ''}> Cuenta activa (puede iniciar sesión)</label>` : ''}
    </div>
    ${locked ? `<p class="muted" style="margin:10px 0 0">${mine ? 'No puedes cambiar tu propio rol ni desactivarte.' : 'Es el único administrador activo: crea otro antes de cambiarlo.'}</p>` : ''}
    <p class="muted" style="margin:12px 0 0">El rol define qué puede hacer la cuenta (ver “Roles y permisos” al final de esta pantalla).</p>
    <div class="foot"><button type="button" class="btn" data-action="closeModal">Cancelar</button><button class="btn primary">${u ? 'Guardar' : 'Crear usuario'}</button></div>
  </form>`);
}

function userPasswordForm(id) {
  const u = state.users.find(x => x.id === id); if (!u || !canTouchUser(u)) return;
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

/* ---- Roles ---- */
function roleForm(id) {
  if (!isAdmin()) return;
  const r = id ? state.roles.find(x => x.id === id) : null;
  if (id && !r) return;
  const locked = !!r && r.id === 'admin';
  const has = k => !!r && (r.id === 'admin' || r.permissions.includes(k));
  openModal(`<h2>${!r ? 'Nuevo rol' : locked ? 'Rol Administrador' : 'Editar rol'}</h2>
  <form data-form="role" data-id="${r ? esc(r.id) : ''}">
    <div class="form-grid" style="grid-template-columns:1fr">
      <label class="f">Nombre del rol<input name="rname" required minlength="2" maxlength="40" value="${r ? esc(r.name) : ''}"${locked ? ' disabled' : ''} placeholder="Ej. Cajero"></label>
      <label class="f">Descripción (opcional)<input name="rdesc" maxlength="200" value="${r ? esc(r.description) : ''}"${locked ? ' disabled' : ''} placeholder="Qué hace este rol"></label>
    </div>
    <h3 style="margin:18px 0 8px">Permisos</h3>
    <div class="perm-list">${state.permissions.map(p => `<label class="perm-item"><input type="checkbox" name="perm" value="${esc(p.key)}"${has(p.key) ? ' checked' : ''}${locked ? ' disabled' : ''}><span><b>${esc(p.label)}</b><small>${esc(p.description)}</small></span></label>`).join('')}</div>
    <p class="muted" style="margin:12px 0 0">${locked ? 'El rol Administrador siempre tiene todos los permisos y no se puede modificar.' : 'Al guardar, el cambio se aplica de inmediato a todos los usuarios con este rol.'}</p>
    <div class="foot"><button type="button" class="btn" data-action="closeModal">${locked ? 'Cerrar' : 'Cancelar'}</button>${locked ? '' : '<button class="btn primary">Guardar rol</button>'}</div>
  </form>`, true);
}
async function saveRole(form) {
  const data = {name: form.elements.rname.value, description: form.elements.rdesc.value, permissions: [...form.querySelectorAll('input[name=perm]:checked')].map(i => i.value)};
  const id = form.dataset.id;
  if (id) await store.updateRole(id, data); else await store.createRole(data);
  closeModal(); toast('Rol guardado'); refresh();
}
async function removeRole(id) {
  const r = state.roles.find(x => x.id === id);
  if (!r || !confirm(`¿Eliminar el rol "${r.name}"?`)) return;
  await run(null, async () => { await store.deleteRole(id); toast('Rol eliminado'); refresh(); });
}
