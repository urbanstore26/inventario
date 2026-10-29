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

/* ---- Mobiliario y equipo: datos de ejemplo la primera vez y utilidades (mismas reglas que las tablas SQL) ---- */
function ensureAssets() {
  ['plans', 'assets', 'assetLog', 'expenses', 'exchanges'].forEach(k => { if (!Array.isArray(state[k])) state[k] = []; });
  // el permiso de cambios y devoluciones se le da una vez a Vendedor y Cajero (si luego se quita, no vuelve)
  if (!state.exchangesSeeded) {
    state.exchangesSeeded = true;
    (state.roles || []).forEach(r => { if (['vendedor', 'cajero'].includes(r.id) && !r.permissions.includes('exchanges.create')) r.permissions.push('exchanges.create'); });
  }
  if (!state.assetsSeeded) {
    state.assetsSeeded = true;
    if (!state.plans.length && !state.assets.length) seedAssets(state);
  }
  // gastos de ejemplo, una sola vez, cargados al primer plan
  if (!state.expensesSeeded) {
    state.expensesSeeded = true;
    if (!state.expenses.length && state.plans.length) seedExpenses(state, state.plans[0].id);
  }
}
function seedExpenses(s, planId) {
  const now = new Date().toISOString();
  [['empleado', 'Salario de septiembre', 'María López', 350, '2026-09-30'], ['empleado', 'Salario de septiembre', 'Carlos Pérez', 320, '2026-09-30'],
   ['empleado', 'Salario de octubre', 'María López', 350, '2026-10-31'], ['empleado', 'Salario de octubre', 'Carlos Pérez', 320, '2026-10-31'],
   ['etiquetas', 'Stickers autoadhesivos para precios', 'Papelería Central', 45, '2026-10-05'], ['materiales', 'Bolsas y empaques', 'Distribuidora Norte', 38.5, '2026-10-12']]
    .forEach(([kind, concept, payee, amount, spentOn]) => s.expenses.push({id: uid(), planId, kind, concept, payee, amount, spentOn, notes: '', createdAt: now, updatedAt: now}));
}
function seedAssets(s) {
  const now = new Date().toISOString(), plan = {id: uid(), name: 'Plan de inversión social 2026', description: 'Equipamiento de la tienda', budget: 6000, startsOn: '2026-01-01', endsOn: '2026-12-31', active: true, createdAt: now};
  s.plans.push(plan);
  [['Cámara de seguridad', 'Cámaras', 'Hikvision', 'DS-2CD', 4, 85.5, 'Sala de ventas', 'nuevo', plan.id],
   ['Computadora de escritorio', 'Computadoras', 'Dell', 'OptiPlex 3000', 1, 520, 'Caja', 'bueno', plan.id],
   ['Impresora de tickets', 'Impresoras', 'Epson', 'TM-T20III', 1, 180, 'Caja', 'bueno', plan.id],
   ['Silla ejecutiva', 'Sillas', '', '', 6, 38, 'Sala de ventas', 'bueno', plan.id],
   ['Espejo de pared', 'Espejos', '', '', 3, 45, 'Sala de ventas', 'nuevo', plan.id],
   ['Escritorio de oficina', 'Muebles', '', '', 1, 210, 'Oficina', 'regular', plan.id],
   ['Vitrina de exhibición', 'Estantes y vitrinas', '', '', 2, 320, 'Sala de ventas', 'bueno', plan.id],
   ['Mesa de bodega', 'Muebles', '', '', 1, 90, 'Bodega', 'bueno', null]].forEach(([name, category, brand, model, quantity, unitCost, location, status, planId], i) => {
    const a = {id: uid(), code: 'AF-' + pad(i + 1, 4), name, category, brand, model, serial: '', quantity, unitCost, acquiredOn: '2026-03-15', location, responsible: '', status, planId, notes: '', createdAt: now, updatedAt: now};
    s.assets.push(a);
    s.assetLog.push({id: uid(), assetId: a.id, code: a.code, name: a.name, kind: 'alta', detail: quantity + ' × ' + location, date: now, actor: 'Datos de ejemplo'});
  });
}
const nextAssetCode = () => 'AF-' + pad(state.assets.reduce((m, a) => Math.max(m, parseInt((a.code.match(/(\d+)$/) || [])[1]) || 0), 0) + 1, 4);
/* Lo que cambió entre dos versiones de un bien, en texto (igual que el trigger log_asset de la base de datos) */
function assetChanges(o, n) {
  const ch = [], none = (v, w) => v || w, st = k => (ASSET_STATUS[k] || {}).label || k, plan = id => (getPlan(id) || {}).name;
  if (n.status !== o.status) ch.push(`Estado: ${st(o.status)} → ${st(n.status)}`);
  if (n.location !== o.location) ch.push(`Ubicación: ${none(o.location, 'ninguna')} → ${none(n.location, 'ninguna')}`);
  if (n.responsible !== o.responsible) ch.push(`Responsable: ${none(o.responsible, 'ninguno')} → ${none(n.responsible, 'ninguno')}`);
  if (n.quantity !== o.quantity) ch.push(`Cantidad: ${o.quantity} → ${n.quantity}`);
  if (n.unitCost !== o.unitCost) ch.push(`Costo unitario: $${o.unitCost} → $${n.unitCost}`);
  if ((n.planId || null) !== (o.planId || null)) ch.push(`Plan: ${none(plan(o.planId), 'ninguno')} → ${none(plan(n.planId), 'ninguno')}`);
  if (n.name !== o.name) ch.push(`Nombre: ${o.name} → ${n.name}`);
  if (n.category !== o.category) ch.push(`Categoría: ${none(o.category, 'ninguna')} → ${none(n.category, 'ninguna')}`);
  if (['serial', 'brand', 'model', 'acquiredOn', 'notes'].some(k => (n[k] || '') !== (o[k] || ''))) ch.push('Datos del bien actualizados');
  return ch;
}

const CASHIER_ROLE = () => ({id: 'cajero', name: 'Cajero', description: 'Cobra, imprime tickets y elige qué vendedor realizó la venta', isSystem: false, permissions: ['inventory.view', 'sales.create', 'sales.view', 'sales.assign_seller']});
const demoRoles = () => [
  {id: 'admin', name: 'Administrador', description: 'Acceso total al sistema', isSystem: true, permissions: PERMISSION_CATALOG.map(p => p.key)},
  {id: 'vendedor', name: 'Vendedor', description: 'Ve el stock, vende e imprime tickets', isSystem: true, permissions: ['inventory.view', 'sales.create', 'sales.view']},
  CASHIER_ROLE()
];
/* El rol Administrador siempre tiene todos los permisos; los datos antiguos sin roles reciben los del sistema */
function ensureRoles() {
  if (!Array.isArray(state.roles) || !state.roles.length) state.roles = demoRoles();
  state.roles.forEach(r => { if (r.id === 'admin') r.permissions = PERMISSION_CATALOG.map(p => p.key); });
  // datos guardados antes del rol Cajero: se agrega una sola vez (si luego se elimina, no vuelve)
  if (!state.cashierSeeded && !state.roles.some(r => r.id === 'cajero')) state.roles.push(CASHIER_ROLE());
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
  {id: 'demo-vendedor', name: 'Vendedor demo', email: 'vendedor@plante.demo', role: 'vendedor', active: true, createdAt: new Date().toISOString()},
  {id: 'demo-vendedora', name: 'Vendedora demo', email: 'vendedora@plante.demo', role: 'vendedor', active: true, createdAt: new Date().toISOString()},
  {id: 'demo-cajero', name: 'Cajero demo', email: 'cajero@plante.demo', role: 'cajero', active: true, createdAt: new Date().toISOString()}
];
function ensureUsers() {
  if (!Array.isArray(state.users) || !state.users.length) state.users = demoUsers();
  state.users.forEach(u => { if (!state.roles.some(r => r.id === u.role)) u.role = 'vendedor'; });
  if (!state.cashierSeeded) {   // cuentas de ejemplo del rol Cajero, una sola vez
    demoUsers().filter(d => ['demo-vendedora', 'demo-cajero'].includes(d.id) && !state.users.some(u => u.id === d.id) && state.roles.some(r => r.id === d.role)).forEach(d => state.users.push(d));
    state.cashierSeeded = true;
  }
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
    state = loadLocal(); ensureRoles(); ensureUsers(); ensureInitial(); ensureDiscounts(); ensureAssets();
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

  async sell({items, method, discount, customer, note, paid, seller}) {
    // vender a nombre de otra persona: solo con el permiso y solo a un vendedor activo
    const by = this.user;
    let who = {id: by.id, name: by.name}, cashier = '';
    if (seller && seller !== by.id) {
      if (!can('sales.assign_seller')) throw new Error('No tienes permiso para elegir el vendedor');
      const s = sellerList().find(x => x.id === seller);
      if (!s) throw new Error('El vendedor elegido no es válido o está inactivo');
      who = s; cashier = by.name;
    }
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
      const sale = {id, num, date: new Date().toISOString(), customer: (customer || '').trim(), note: (note || '').trim().slice(0, 200), seller: who.name, sellerId: who.id, cashier, method, items: lines, subtotal: sub, discount: disc, total, cost: r2(lines.reduce((a, i) => a + i.cost * i.qty, 0)), paid: cash ? paid : total, change: cash ? r2(paid - total) : 0, status: 'completada'};
      state.sales.unshift(sale);
      saveLocal();
      return sale;
    } catch (e) { state = JSON.parse(snapshot); throw e; }
  },

  async voidSale(id) {
    const s = state.sales.find(x => x.id === id);
    if (!s || s.status !== 'completada') throw new Error('La venta ya está anulada');
    if (state.exchanges.some(e => e.saleId === id)) throw new Error('La venta tiene cambios o devoluciones registrados: no se puede anular');
    s.items.forEach(i => { const p = getProduct(i.pid); if (p) moveStock(p, i.size, i.qty, 'devolucion', 'Anulación V-' + pad(s.num, 4), s.id); });
    s.status = 'anulada'; s.voidedAt = new Date().toISOString();
    saveLocal();
  },

  /* ---- Cambios y devoluciones (mismas reglas que la función SQL register_exchange) ---- */
  async registerExchange({saleId, reason, returned, delivered, method, customer, note}) {
    if (!can('exchanges.create')) throw new Error('No tienes permiso para esta acción');
    const R = EXCHANGE_REASONS[reason];
    if (!R) throw new Error('Motivo inválido');
    if (!Array.isArray(returned) || !returned.length) throw new Error('Indica qué devuelve el cliente');
    delivered = delivered || [];
    if (R.gives && !delivered.length) throw new Error('Indica qué se lleva el cliente a cambio');
    if (!R.gives && delivered.length) throw new Error('Una devolución con reembolso no lleva producto a cambio');
    const sale = saleId ? state.sales.find(s => s.id === saleId) : null;
    if (saleId && !sale) throw new Error('La venta no existe');
    if (sale && sale.status !== 'completada') throw new Error('La venta está anulada');
    const snapshot = JSON.stringify(state);
    try {
      const num = state.exchanges.reduce((m, e) => Math.max(m, e.num), 0) + 1, tag = 'Cambio C-' + pad(num, 4), cond = reason.startsWith('danado') ? 'danado' : 'bueno', r2 = n => Math.round(n * 100) / 100;
      const items = [], ids = []; let ret = 0, del = 0;
      for (const l of returned) {
        const p = getProduct(l.pid), q = Number(l.qty);
        if (!p) throw new Error('Un producto ya no existe');
        if (!Number.isInteger(q) || q <= 0) throw new Error('Cantidad inválida');
        ids.push(p.id);
        let price;
        if (sale) {
          const rows = sale.items.filter(i => i.pid === p.id && i.size === l.size), sold = rows.reduce((a, i) => a + i.qty, 0);
          if (!sold) throw new Error(`El artículo ${p.name} talla ${l.size} no está en esa venta`);
          const back = returnedBefore(sale.id, p.id, l.size);
          if (q + back > sold) throw new Error(`De ${p.name} talla ${l.size} se vendieron ${sold} y ya se devolvieron ${back} (quedan ${sold - back})`);
          price = r2(rows.reduce((a, i) => a + i.price * i.qty, 0) / sold);
        } else price = priceOf(p).price;
        items.push({dir: 'devuelto', pid: p.id, sku: p.sku, name: p.name, size: l.size, qty: q, price, condition: cond});
        ret += price * q;
        moveStock(p, l.size, q, 'devolucion', tag + ': devuelve', '');
        if (cond === 'danado') moveStock(p, l.size, -q, 'danado', tag + ': producto dañado', '');
      }
      for (const l of delivered) {
        const p = getProduct(l.pid), q = Number(l.qty);
        if (!p) throw new Error('Un producto ya no existe');
        if (!Number.isInteger(q) || q <= 0) throw new Error('Cantidad inválida');
        if (R.same && !ids.includes(p.id)) throw new Error('En este tipo de cambio el producto entregado debe ser el mismo que se devuelve');
        const price = priceOf(p).price;
        items.push({dir: 'entregado', pid: p.id, sku: p.sku, name: p.name, size: l.size, qty: q, price, condition: null});
        del += price * q;
        moveStock(p, l.size, -q, 'cambio', tag + ': entrega', '');
      }
      const diff = r2(del - ret);
      if (diff !== 0 && !PAY_METHODS.includes(method)) throw new Error('Indica cómo se paga o se devuelve la diferencia de ' + money(Math.abs(diff)));
      const ex = {id: 'X' + uid(), num, date: new Date().toISOString(), saleId: sale ? sale.id : null, saleNum: sale ? sale.num : null, reason, customer: String(customer || '').trim().slice(0, 120),
        note: String(note || '').trim().slice(0, 200), difference: diff, method: diff !== 0 ? method : null, by: this.user ? this.user.name : '', items};
      state.exchanges.unshift(ex);
      saveLocal();
      return ex;
    } catch (e) { state = JSON.parse(snapshot); throw e; }
  },

  async saveSettings({storeName, threshold, sizes}) {
    Object.assign(state.settings, {storeName, threshold, sizes});
    saveLocal();
  },


  /* Reporte por talla con las columnas de la hoja de Excel (misma forma que la vista inventory_variants) */
  async variantReport() {
    const r2 = n => Math.round(n * 100) / 100, sold = {};
    state.sales.filter(s => s.status === 'completada').forEach(s => s.items.forEach(i => { const k = i.pid + '|' + i.size; sold[k] = (sold[k] || 0) + i.qty; }));
    // "Vendidos" neto: menos lo devuelto y más lo entregado a cambio
    state.exchanges.forEach(e => e.items.forEach(i => { const k = i.pid + '|' + i.size; sold[k] = (sold[k] || 0) + (i.dir === 'devuelto' ? -i.qty : i.qty); }));
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

  /* ---- Mobiliario y equipo y planes de inversión ---- */
  _needAssets() { if (!can('assets.manage')) throw new Error('No tienes permiso para esta acción'); },
  _logAsset(a, kind, detail) {
    state.assetLog.unshift({id: uid(), assetId: a.id, code: a.code, name: a.name, kind, detail, date: new Date().toISOString(), actor: this.user ? this.user.name : ''});
    if (state.assetLog.length > 1000) state.assetLog.length = 1000;
  },
  /* Factura dentro del propio bien (solo demostración). Devuelve el texto para el historial. */
  _applyInvoice(a, invoice) {
    if (invoice === 'remove' && a.invoice) { delete a.invoice; return 'Factura quitada'; }
    if (invoice && invoice !== 'remove' && invoice.dataUrl) { const had = !!a.invoice; a.invoice = {name: invoice.name, type: invoice.type, dataUrl: invoice.dataUrl}; return had ? 'Factura reemplazada' : 'Factura adjuntada'; }
    return '';
  },
  async invoiceUrl(a) {
    if (!a.invoice) throw new Error('Este bien no tiene factura');
    return URL.createObjectURL(await (await fetch(a.invoice.dataUrl)).blob());
  },
  async saveAsset({id, data, image, invoice}) {
    this._needAssets();
    const name = String(data.name || '').trim(), qty = Number(data.quantity), cost = Number(data.unitCost);
    if (name.length < 2 || name.length > 100) throw new Error('El nombre debe tener entre 2 y 100 caracteres');
    if (!Number.isInteger(qty) || qty < 0) throw new Error('La cantidad debe ser un número entero, 0 o mayor');
    if (!(cost >= 0)) throw new Error('El costo unitario no puede ser negativo');
    if (!ASSET_STATUS[data.status]) throw new Error('Estado inválido');
    if (data.planId && !getPlan(data.planId)) throw new Error('El plan elegido ya no existe');
    const t = k => String(data[k] || '').trim();
    const fields = {name, category: t('category'), brand: t('brand'), model: t('model'), serial: t('serial'), quantity: qty, unitCost: Math.round(cost * 100) / 100, acquiredOn: data.acquiredOn || null,
      location: t('location'), responsible: t('responsible'), status: data.status, planId: data.planId || null, notes: t('notes')};
    if (fields.notes.length > 500) throw new Error('Las observaciones no pueden superar los 500 caracteres');
    let a = id ? getAsset(id) : null;
    if (id && !a) throw new Error('El bien ya no existe');
    if (a) {
      const old = {...a}; Object.assign(a, fields, {updatedAt: new Date().toISOString()});
      const ch = assetChanges(old, a), inv = this._applyInvoice(a, invoice);
      if (inv) ch.push(inv);
      if (ch.length) this._logAsset(a, a.status === 'baja' && old.status !== 'baja' ? 'baja' : 'cambio', ch.join('; '));
    } else {
      const code = t('code') || nextAssetCode();
      if (state.assets.some(x => x.code.toLowerCase() === code.toLowerCase())) throw new Error('Ya existe un bien con ese código');
      a = {id: uid(), code, ...fields, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()};
      state.assets.push(a);
      this._applyInvoice(a, invoice);
      this._logAsset(a, 'alta', a.quantity + ' × ' + (a.location || 'sin ubicación') + (a.invoice ? ' · con factura' : ''));
    }
    if (image === 'remove') delete a.image;
    else if (image && image.dataUrl) a.image = image.dataUrl;
    saveLocal();
  },
  async deleteAsset(id) {
    this._needAssets();
    const a = getAsset(id); if (!a) throw new Error('El bien ya no existe');
    this._logAsset({id: null, code: a.code, name: a.name}, 'eliminado', a.quantity + ' × ' + (a.location || 'sin ubicación'));
    state.assets = state.assets.filter(x => x.id !== id);
    saveLocal();
  },
  async savePlan({id, data}) {
    this._needAssets();
    const name = String(data.name || '').trim(), budget = Number(data.budget), desc = String(data.description || '').trim();
    if (name.length < 2 || name.length > 80) throw new Error('El nombre debe tener entre 2 y 80 caracteres');
    if (!(budget >= 0)) throw new Error('El presupuesto no puede ser negativo');
    if (desc.length > 300) throw new Error('La descripción no puede superar los 300 caracteres');
    if (data.startsOn && data.endsOn && data.endsOn < data.startsOn) throw new Error('La fecha final no puede ser anterior a la inicial');
    if (state.plans.some(p => p.id !== id && p.name.trim().toLowerCase() === name.toLowerCase())) throw new Error('Ya existe un plan con ese nombre');
    const p = id ? getPlan(id) : null;
    if (id && !p) throw new Error('El plan ya no existe');
    const fields = {name, description: desc, budget: Math.round(budget * 100) / 100, startsOn: data.startsOn || null, endsOn: data.endsOn || null, active: data.active !== false};
    if (p) Object.assign(p, fields); else state.plans.push({id: uid(), ...fields, createdAt: new Date().toISOString()});
    saveLocal();
  },
  async deletePlan(id) {
    this._needAssets();
    const p = getPlan(id); if (!p) throw new Error('El plan ya no existe');
    state.assets.filter(a => a.planId === id).forEach(a => { this._logAsset(a, 'cambio', 'Plan: ' + p.name + ' → ninguno (plan eliminado)'); a.planId = null; });
    state.plans = state.plans.filter(x => x.id !== id);
    state.expenses.forEach(e => { if (e.planId === id) e.planId = null; });   // los gastos se conservan, sin plan
    saveLocal();
  },
  async saveExpense({id, data}) {
    if (!can('expenses.manage')) throw new Error('No tienes permiso para esta acción');
    const concept = String(data.concept || '').trim(), amount = Number(data.amount), t = k => String(data[k] || '').trim();
    if (concept.length < 2 || concept.length > 120) throw new Error('El concepto debe tener entre 2 y 120 caracteres');
    if (!(amount > 0)) throw new Error('El monto debe ser mayor a 0');
    if (!EXPENSE_KINDS[data.kind]) throw new Error('Tipo de gasto inválido');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data.spentOn || '')) throw new Error('Indica la fecha del gasto');
    if (data.planId && !getPlan(data.planId)) throw new Error('El plan elegido ya no existe');
    if (t('payee').length > 80 || t('notes').length > 300) throw new Error('Hay un texto demasiado largo');
    const fields = {planId: data.planId || null, kind: data.kind, concept, payee: t('payee'), amount: Math.round(amount * 100) / 100, spentOn: data.spentOn, notes: t('notes'), updatedAt: new Date().toISOString()};
    const x = id ? state.expenses.find(e => e.id === id) : null;
    if (id && !x) throw new Error('El gasto ya no existe');
    if (x) Object.assign(x, fields); else state.expenses.push({id: uid(), ...fields, createdAt: new Date().toISOString()});
    saveLocal();
  },
  async deleteExpense(id) {
    if (!can('expenses.manage')) throw new Error('No tienes permiso para esta acción');
    if (!state.expenses.some(e => e.id === id)) throw new Error('El gasto ya no existe');
    state.expenses = state.expenses.filter(e => e.id !== id);
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
  async resetDemo() { const {users, roles, cashierSeeded} = state; state = blank(); seed(state); Object.assign(state, {users, roles, cashierSeeded}); ensureRoles(); ensureAssets(); saveLocal(); },
  async clearAll() { const {settings, users, roles, cashierSeeded} = state; state = blank(); Object.assign(state, {settings: {...settings, nextSale: 1}, users, roles, cashierSeeded, assetsSeeded: true, expensesSeeded: true}); ensureRoles(); saveLocal(); },
  async restore(d) {
    const {users, roles} = state;
    state = {...blank(), ...d, settings: {...blank().settings, ...(d.settings || {})}};
    if (!Array.isArray(d.users) || !d.users.length) state.users = users;
    if (!Array.isArray(d.roles) || !d.roles.length) state.roles = roles;
    ensureRoles(); ensureUsers(); ensureInitial(); ensureDiscounts(); ensureAssets(); saveLocal();
  }
};
