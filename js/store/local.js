'use strict';
/* Backend LOCAL (modo demostración): todo vive en localStorage. Misma interfaz que SupabaseStore. */

const LS_KEY = 'plante_urban_inventory_v1';
const LS_DEMO = 'pu_demo_session';

function loadLocal() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      const s = JSON.parse(raw), b = blank();
      return {...b, ...s, settings: {...b.settings, ...(s.settings || {})}};
    }
  } catch (e) { console.warn('No se pudo leer el almacenamiento', e); }
  const s = blank();
  seed(s);
  try { localStorage.setItem(LS_KEY, JSON.stringify(s)); } catch (e) {}
  return s;
}
function saveLocal() {
  try { localStorage.setItem(LS_KEY, JSON.stringify(state)); }
  catch (e) { throw new Error('No se pudo guardar: almacenamiento lleno o bloqueado (las fotos ocupan espacio)'); }
}
function moveStock(p, size, delta, type, note, ref) {
  const cur = p.stock[size] || 0, nv = cur + delta;
  if (nv < 0) throw new Error(`Stock insuficiente: ${p.name} talla ${size} (disponible ${cur})`);
  p.stock[size] = nv;
  if (type === 'inicial') { p.initial = p.initial || {}; p.initial[size] = (p.initial[size] || 0) + delta; }
  state.movements.unshift({id: uid(), date: new Date().toISOString(), productId: p.id, sku: p.sku, name: p.name, size, type, qty: delta, balance: nv, note: note || '', ref: ref || ''});
  if (state.movements.length > 5000) state.movements.length = 5000;
}

/* Datos guardados antes de existir el stock inicial: se reconstruye desde los movimientos 'inicial' */
function ensureInitial() {
  state.products.forEach(p => {
    if (p.initial) return;
    p.initial = {};
    state.movements.filter(m => m.productId === p.id && m.type === 'inicial').forEach(m => { p.initial[m.size] = (p.initial[m.size] || 0) + m.qty; });
  });
}

function ensureDiscounts() { if (!Array.isArray(state.discounts)) state.discounts = []; }

const demoRoles = () => [
  {id: 'admin', name: 'Administrador', description: 'Acceso total al sistema', isSystem: true, permissions: PERMISSION_CATALOG.map(p => p.key)},
  {id: 'vendedor', name: 'Vendedor', description: 'Ve el stock, vende e imprime tickets', isSystem: true, permissions: ['inventory.view', 'sales.create', 'sales.view']}
];
/* El rol Administrador siempre tiene todos los permisos; los datos antiguos sin roles reciben los del sistema */
function ensureRoles() {
  if (!Array.isArray(state.roles) || !state.roles.length) state.roles = demoRoles();
  state.roles.forEach(r => { if (r.id === 'admin') r.permissions = PERMISSION_CATALOG.map(p => p.key); });
  state.permissions = PERMISSION_CATALOG;
}
/* Roles disponibles para entrar a la demostración (antes de cargar los datos) */
function demoRoleList() {
  try {
    const s = JSON.parse(localStorage.getItem(LS_KEY));
    if (s && Array.isArray(s.roles) && s.roles.length) return s.roles.map(r => ({id: r.id, name: r.name}));
  } catch (e) { /* sin datos guardados */ }
  return demoRoles().map(r => ({id: r.id, name: r.name}));
}
const slugify = s => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 24) || 'rol';

const demoUsers = () => [
  {id: 'demo-admin', name: 'Administrador demo', email: 'admin@plante.demo', role: 'admin', active: true, createdAt: new Date().toISOString()},
  {id: 'demo-vendedor', name: 'Vendedor demo', email: 'vendedor@plante.demo', role: 'vendedor', active: true, createdAt: new Date().toISOString()}
];
function ensureUsers() {
  if (!Array.isArray(state.users) || !state.users.length) state.users = demoUsers();
  state.users.forEach(u => { if (!state.roles.some(r => r.id === u.role)) u.role = 'vendedor'; });
}

const LocalStore = {
  mode: 'local',
  imageMax: 640,   // más pequeño: localStorage tiene ~5 MB
  user: {id: 'demo-admin', name: 'Administrador demo', email: 'admin@plante.demo', role: 'admin', roleName: 'Administrador', permissions: []},

  /* Entra como el rol elegido: usa la cuenta demo de ese rol, otra cuenta activa con ese rol, o una ficticia */
  _setUser(roleId) {
    const role = state.roles.find(r => r.id === roleId) || state.roles.find(r => r.id === 'admin');
    const u = state.users.find(x => x.id === 'demo-' + role.id) || state.users.find(x => x.role === role.id && x.active)
      || {id: 'demo-' + role.id, name: role.name + ' demo', email: role.id + '@plante.demo'};
    this.user = {id: u.id, name: u.name, email: u.email, role: role.id, roleName: role.name, permissions: role.permissions.slice()};
  },

  async session() { return !!sessionStorage.getItem(LS_DEMO); },
  async signIn(roleId) { sessionStorage.setItem(LS_DEMO, roleId || 'admin'); },   // en demostración se elige el rol para probarlo
  async signOut() { sessionStorage.removeItem(LS_DEMO); },
  async init() {
    state = loadLocal(); ensureRoles(); ensureUsers(); ensureInitial(); ensureDiscounts();
    const v = sessionStorage.getItem(LS_DEMO);
    this._setUser(v && v !== '1' ? v : 'admin');
  },
  async reload() {},

  async saveProduct({id, data, stock, image}) {
    if (state.products.some(p => p.sku.toLowerCase() === data.sku.toLowerCase() && p.id !== id)) throw new Error('Ya existe un producto con ese SKU');
    let p = id && getProduct(id);
    if (p) {
      const old = {...p.stock}; Object.assign(p, data); p.stock = old;
      new Set([...Object.keys(old), ...Object.keys(stock)]).forEach(s => { const d = (stock[s] || 0) - (old[s] || 0); if (d) moveStock(p, s, d, 'ajuste', 'Edición del producto'); });
    } else {
      p = {id: uid(), ...data, stock: {}, createdAt: new Date().toISOString()};
      state.products.push(p);
      Object.entries(stock).forEach(([s, q]) => moveStock(p, s, q, 'inicial', 'Stock inicial'));
    }
    if (image === 'remove') delete p.image;
    else if (image && image.dataUrl) p.image = image.dataUrl;
    saveLocal();
  },

  async deleteProduct(id) {
    state.products = state.products.filter(x => x.id !== id);
    state.discounts.forEach(d => { d.productIds = d.productIds.filter(pid => pid !== id); });
    saveLocal();
  },

  async move({pid, size, type, qty, note}) {
    const p = getProduct(pid);
    if (!p) throw new Error('El producto no existe');
    const cur = p.stock[size] || 0, delta = type === 'entrada' ? qty : type === 'salida' ? -qty : qty - cur;
    if (delta === 0) throw new Error('El movimiento no cambia el stock');
    moveStock(p, size, delta, type, note);
    saveLocal();
  },

  async sell({items, method, discount, customer, paid}) {
    const snapshot = JSON.stringify(state);
    try {
      const num = state.settings.nextSale++, id = 'S' + uid();
      const lines = items.map(i => {
        const p = getProduct(i.pid);
        if (!p) throw new Error('Un producto del carrito ya no existe');
        moveStock(p, i.size, -i.qty, 'venta', 'Venta V-' + pad(num, 4), id);
        const e = priceOf(p);   // precio con la mejor oferta vigente
        return {pid: p.id, sku: p.sku, name: p.name, size: i.size, qty: i.qty, price: e.price, listPrice: e.list, discountName: e.name, cost: p.cost};
      });
      const r2 = n => Math.round(n * 100) / 100;     // montos siempre a centavos
      const sub = r2(lines.reduce((a, i) => a + i.price * i.qty, 0)), disc = r2(Math.min(Math.max(Number(discount) || 0, 0), sub)), total = r2(sub - disc);
      const cash = method === 'Efectivo' && paid > 0;
      if (cash && paid < total) throw new Error('El monto recibido es menor al total');
      const sale = {id, num, date: new Date().toISOString(), customer: (customer || '').trim(), method, items: lines, subtotal: sub, discount: disc, total, cost: r2(lines.reduce((a, i) => a + i.cost * i.qty, 0)), paid: cash ? paid : total, change: cash ? r2(paid - total) : 0, status: 'completada'};
      state.sales.unshift(sale);
      saveLocal();
      return sale;
    } catch (e) { state = JSON.parse(snapshot); throw e; }
  },

  async voidSale(id) {
    const s = state.sales.find(x => x.id === id);
    if (!s || s.status !== 'completada') throw new Error('La venta ya está anulada');
    s.items.forEach(i => { const p = getProduct(i.pid); if (p) moveStock(p, i.size, i.qty, 'devolucion', 'Anulación V-' + pad(s.num, 4), s.id); });
    s.status = 'anulada'; s.voidedAt = new Date().toISOString();
    saveLocal();
  },

  async saveSettings({storeName, threshold, sizes}) {
    Object.assign(state.settings, {storeName, threshold, sizes});
    saveLocal();
  },


  /* Reporte por talla con las columnas de la hoja de Excel (misma forma que la vista inventory_variants) */
  async variantReport() {
    const r2 = n => Math.round(n * 100) / 100, sold = {};
    state.sales.filter(s => s.status === 'completada').forEach(s => s.items.forEach(i => { const k = i.pid + '|' + i.size; sold[k] = (sold[k] || 0) + i.qty; }));
    const rows = [];
    state.products.forEach(p => Object.keys(p.stock).forEach(size => {
      const stock = p.stock[size] || 0, status = stock === 0 ? 'Agotado' : stock <= minOf(p) ? 'Stock bajo' : 'Disponible';
      rows.push({sku: p.sku, model: p.name, color: p.color || '', size, cost: p.cost, price: p.price, initial: (p.initial || {})[size] || 0, sold: sold[p.id + '|' + size] || 0,
        stock, unitProfit: r2(p.price - p.cost), inventoryValue: r2(stock * p.cost), retailValue: r2(stock * p.price), status});
    }));
    return rows;
  },

  /* ---- Usuarios y roles (modo demostración: viven en este navegador; reglas iguales a las de la base de datos) ---- */
  _admins(exceptId) { return state.users.filter(x => x.id !== exceptId && x.role === 'admin' && x.active).length; },
  _onlyAdminMayTouchAdmins(...roles) {
    if (roles.includes('admin') && this.user.role !== 'admin') throw new Error('Solo un administrador puede asignar o modificar el rol Administrador');
  },

  async createUser({name, email, password, role}) {
    if (!String(name).trim()) throw new Error('El nombre es obligatorio');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Correo no válido');
    if (String(password).length < 8) throw new Error('La contraseña debe tener al menos 8 caracteres');
    if (!state.roles.some(r => r.id === role)) throw new Error('Rol no válido');
    this._onlyAdminMayTouchAdmins(role);
    if (state.users.some(u => u.email.toLowerCase() === String(email).toLowerCase())) throw new Error('Ya existe un usuario con ese correo');
    state.users.push({id: uid(), name: String(name).trim(), email, role, active: true, createdAt: new Date().toISOString()});
    saveLocal();   // la contraseña no se guarda: en demostración no se inicia sesión con cuentas
  },

  async updateUser(id, {name, role, active}) {
    const u = state.users.find(x => x.id === id);
    if (!u) throw new Error('El usuario ya no existe');
    if (!state.roles.some(r => r.id === role)) throw new Error('Rol no válido');
    if (role !== u.role || active !== u.active) {
      if (id === this.user.id) throw new Error('No puedes cambiar tu propio rol ni desactivarte');
      this._onlyAdminMayTouchAdmins(u.role, role);
      if (u.role === 'admin' && u.active && (role !== 'admin' || !active) && this._admins(id) === 0) throw new Error('Debe quedar al menos un administrador activo');
    }
    Object.assign(u, {name, role, active});
    saveLocal();
    if (u.id === this.user.id) this.user = {...this.user, name: u.name};
  },

  async setUserPassword(id, password) {
    const u = state.users.find(x => x.id === id);
    if (!u) throw new Error('El usuario ya no existe');
    if (String(password).length < 8) throw new Error('La contraseña debe tener al menos 8 caracteres');
    this._onlyAdminMayTouchAdmins(u.role);
  },

  async deleteUser(id) {
    const u = state.users.find(x => x.id === id);
    if (!u) throw new Error('El usuario ya no existe');
    if (id === this.user.id) throw new Error('No puedes eliminar tu propia cuenta');
    this._onlyAdminMayTouchAdmins(u.role);
    if (u.role === 'admin' && u.active && this._admins(id) === 0) throw new Error('No se puede eliminar al último administrador activo');
    state.users = state.users.filter(x => x.id !== id);
    saveLocal();
  },

  /* ---- Descuentos (reglas iguales a las de la función SQL save_discount) ---- */
  async saveDiscount({id, name, kind, value, startsOn, endsOn, active, productIds}) {
    if (!can('discounts.manage')) throw new Error('No tienes permiso para esta acción');
    const n = String(name || '').trim(), v = Number(value);
    if (n.length < 2 || n.length > 60) throw new Error('El nombre debe tener entre 2 y 60 caracteres');
    if (!['percent', 'amount'].includes(kind)) throw new Error('Tipo de descuento inválido');
    if (!(v > 0)) throw new Error('El valor del descuento debe ser mayor a 0');
    if (kind === 'percent' && v > 100) throw new Error('El porcentaje no puede ser mayor a 100');
    if (startsOn && endsOn && endsOn < startsOn) throw new Error('La fecha final no puede ser anterior a la inicial');
    const ids = [...new Set(productIds || [])];
    if (ids.some(pid => !getProduct(pid))) throw new Error('Hay un producto que ya no existe');
    const d = id ? state.discounts.find(x => x.id === id) : null;
    if (id && !d) throw new Error('El descuento no existe');
    const data = {name: n, kind, value: v, startsOn: startsOn || null, endsOn: endsOn || null, active: active !== false, productIds: ids};
    if (d) Object.assign(d, data); else state.discounts.push({id: uid(), ...data, createdAt: new Date().toISOString()});
    saveLocal();
  },

  async deleteDiscount(id) {
    if (!can('discounts.manage')) throw new Error('No tienes permiso para esta acción');
    if (!state.discounts.some(d => d.id === id)) throw new Error('El descuento no existe');
    state.discounts = state.discounts.filter(d => d.id !== id);
    saveLocal();
  },

  _needAdminRole() { if (this.user.role !== 'admin') throw new Error('Solo un administrador puede gestionar roles'); },
  _checkRole({name, description, permissions}, exceptId) {
    const n = String(name || '').trim();
    if (n.length < 2 || n.length > 40) throw new Error('El nombre del rol debe tener entre 2 y 40 caracteres');
    if (state.roles.some(r => r.id !== exceptId && r.name.trim().toLowerCase() === n.toLowerCase())) throw new Error('Ya existe un rol con ese nombre');
    const perms = [...new Set(permissions || [])];
    if (perms.some(k => !PERMISSION_CATALOG.some(p => p.key === k))) throw new Error('Hay un permiso no válido');
    return {name: n, description: String(description || '').slice(0, 200), permissions: perms};
  },

  async createRole(data) {
    this._needAdminRole();
    const r = this._checkRole(data), base = slugify(r.name);
    let id = base, n = 1;
    while (state.roles.some(x => x.id === id)) id = base + '_' + (++n);
    state.roles.push({id, ...r, isSystem: false});
    saveLocal();
    return id;
  },

  async updateRole(id, data) {
    this._needAdminRole();
    if (id === 'admin') throw new Error('El rol Administrador no se puede modificar');
    const role = state.roles.find(r => r.id === id);
    if (!role) throw new Error('El rol no existe');
    Object.assign(role, this._checkRole(data, id));
    saveLocal();
  },

  async deleteRole(id) {
    this._needAdminRole();
    const role = state.roles.find(r => r.id === id);
    if (!role) throw new Error('El rol no existe');
    if (role.isSystem) throw new Error('Los roles del sistema no se pueden eliminar');
    const n = state.users.filter(u => u.role === id).length;
    if (n) throw new Error(`Hay ${n} usuario(s) con este rol; cámbialos de rol antes de eliminarlo`);
    state.roles = state.roles.filter(r => r.id !== id);
    saveLocal();
  },

  /* Solo existen en modo local (los usuarios y roles se conservan al reiniciar los datos) */
  async resetDemo() { const {users, roles} = state; state = blank(); seed(state); Object.assign(state, {users, roles}); ensureRoles(); saveLocal(); },
  async clearAll() { const {settings, users, roles} = state; state = blank(); Object.assign(state, {settings: {...settings, nextSale: 1}, users, roles}); ensureRoles(); saveLocal(); },
  async restore(d) {
    const {users, roles} = state;
    state = {...blank(), ...d, settings: {...blank().settings, ...(d.settings || {})}};
    if (!Array.isArray(d.users) || !d.users.length) state.users = users;
    if (!Array.isArray(d.roles) || !d.roles.length) state.roles = roles;
    ensureRoles(); ensureUsers(); ensureInitial(); ensureDiscounts(); saveLocal();
  }
};
