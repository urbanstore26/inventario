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
  state.movements.unshift({id: uid(), date: new Date().toISOString(), productId: p.id, sku: p.sku, name: p.name, size, type, qty: delta, balance: nv, note: note || '', ref: ref || ''});
  if (state.movements.length > 5000) state.movements.length = 5000;
}

const demoUsers = () => [
  {id: 'demo-admin', name: 'Administrador demo', email: 'admin@plante.demo', role: 'admin', active: true, createdAt: new Date().toISOString()},
  {id: 'demo-vendedor', name: 'Vendedor demo', email: 'vendedor@plante.demo', role: 'vendedor', active: true, createdAt: new Date().toISOString()}
];
function ensureUsers() { if (!Array.isArray(state.users) || !state.users.length) state.users = demoUsers(); }

const LocalStore = {
  mode: 'local',
  imageMax: 640,   // más pequeño: localStorage tiene ~5 MB
  user: {id: 'demo-admin', name: 'Administrador demo', email: 'admin@plante.demo', role: 'admin'},
  _setUser(role) {
    const id = 'demo-' + role, u = state.users.find(x => x.id === id) || demoUsers().find(x => x.id === id);
    this.user = {id: u.id, name: u.name, email: u.email, role: u.role};
  },

  async session() { const v = sessionStorage.getItem(LS_DEMO); return v === 'admin' || v === 'vendedor' || v === '1'; },
  async signIn(role) { sessionStorage.setItem(LS_DEMO, role === 'vendedor' ? 'vendedor' : 'admin'); },   // en demostración se elige el rol para probarlo
  async signOut() { sessionStorage.removeItem(LS_DEMO); },
  async init() { state = loadLocal(); ensureUsers(); this._setUser(sessionStorage.getItem(LS_DEMO) === 'vendedor' ? 'vendedor' : 'admin'); },
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
        return {pid: p.id, sku: p.sku, name: p.name, size: i.size, qty: i.qty, price: p.price, cost: p.cost};
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


  /* ---- Usuarios (modo demostración: la lista vive en este navegador; no hay contraseñas reales) ---- */
  async createUser({name, email, password, role}) {
    if (!String(name).trim()) throw new Error('El nombre es obligatorio');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Correo no válido');
    if (String(password).length < 8) throw new Error('La contraseña debe tener al menos 8 caracteres');
    if (state.users.some(u => u.email.toLowerCase() === String(email).toLowerCase())) throw new Error('Ya existe un usuario con ese correo');
    state.users.push({id: uid(), name: String(name).trim(), email, role: role === 'admin' ? 'admin' : 'vendedor', active: true, createdAt: new Date().toISOString()});
    saveLocal();   // la contraseña no se guarda: en demostración no se inicia sesión con cuentas
  },

  async updateUser(id, {name, role, active}) {
    const u = state.users.find(x => x.id === id);
    if (!u) throw new Error('El usuario ya no existe');
    const others = state.users.filter(x => x.id !== id && x.role === 'admin' && x.active).length;
    if (u.role === 'admin' && u.active && (role !== 'admin' || !active) && others === 0) throw new Error('Debe quedar al menos un administrador activo');
    Object.assign(u, {name, role, active});
    saveLocal();
    if (u.id === this.user.id) this.user = {...this.user, name: u.name};
  },

  async setUserPassword(id, password) {
    if (String(password).length < 8) throw new Error('La contraseña debe tener al menos 8 caracteres');
    if (!state.users.some(u => u.id === id)) throw new Error('El usuario ya no existe');
  },

  async deleteUser(id) {
    const u = state.users.find(x => x.id === id);
    if (!u) throw new Error('El usuario ya no existe');
    if (id === this.user.id) throw new Error('No puedes eliminar tu propia cuenta');
    if (u.role === 'admin' && u.active && !state.users.some(x => x.id !== id && x.role === 'admin' && x.active)) throw new Error('No se puede eliminar al último administrador activo');
    state.users = state.users.filter(x => x.id !== id);
    saveLocal();
  },

  /* Solo existen en modo local */
  async resetDemo() { const users = state.users; state = blank(); seed(state); state.users = users; saveLocal(); },
  async clearAll() { const keep = state.settings, users = state.users; state = blank(); state.settings = {...keep, nextSale: 1}; state.users = users; saveLocal(); },
  async restore(d) { const users = state.users; state = {...blank(), ...d, settings: {...blank().settings, ...(d.settings || {})}}; if (!Array.isArray(d.users) || !d.users.length) state.users = users; ensureUsers(); saveLocal(); }
};
