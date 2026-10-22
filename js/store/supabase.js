'use strict';
/* Backend SUPABASE: login (Auth), datos (PostgREST + RPC) y fotos (Storage).
   La lógica de stock y ventas vive en funciones SQL atómicas (supabase/migrations). */

const IMG_BUCKET = 'product-images';

function friendlyError(error) {
  const msg = (error && error.message) || String(error);
  if (error && error.code === '23505') return 'Ya existe un producto con ese SKU';
  if (error && error.code === '42501') return 'No tienes permiso para esta acción';
  if (/invalid login credentials/i.test(msg)) return 'Correo o contraseña incorrectos';
  if (/edge function|functions\/v1|FunctionsFetchError/i.test(msg)) return 'No se pudo contactar la función admin-users. ¿Está desplegada? (ver README)';
  if (/failed to fetch|networkerror|load failed/i.test(msg)) return 'Sin conexión con el servidor. Revisa tu internet.';
  if (/row-level security/i.test(msg)) return 'No tienes permiso para esta acción';
  return msg;
}
const must = ({data, error}) => { if (error) throw new Error(friendlyError(error)); return data; };

const SupabaseStore = {
  mode: 'supabase',
  imageMax: 1000,
  client: null,
  user: null,

  remember: true,

  /* remember = true guarda la sesión en localStorage; false, solo en sessionStorage (se pierde al cerrar la pestaña) */
  connect(remember = true) {
    this.remember = remember;
    this.client = window.supabase.createClient(window.APP_CONFIG.supabaseUrl, window.APP_CONFIG.supabaseAnonKey, {
      auth: {persistSession: true, autoRefreshToken: true, storage: remember ? window.localStorage : window.sessionStorage}
    });
  },

  /* Al elegir "no recordarme", borra una sesión guardada de un inicio anterior */
  forgetStored() {
    try { Object.keys(localStorage).filter(k => /^sb-.*-auth-token/.test(k)).forEach(k => localStorage.removeItem(k)); } catch (e) {}
  },

  async session() {
    const {data} = await this.client.auth.getSession();
    return data.session;
  },

  async signIn(email, password) {
    must(await this.client.auth.signInWithPassword({email, password}));
    await this.loadProfile();
  },

  async signOut() {
    await this.client.auth.signOut();
    this.user = null;
  },

  async loadProfile() {
    const {data: {user}} = await this.client.auth.getUser();
    if (!user) throw new Error('Tu sesión expiró. Inicia sesión de nuevo.');
    const {data, error} = await this.client.from('profiles').select('full_name, role, active').eq('id', user.id).maybeSingle();
    if (error) throw new Error(friendlyError(error));
    if (!data || !data.active) throw new Error('Tu cuenta no está activa. Pide a un administrador que la habilite.');
    this.user = {id: user.id, name: data.full_name || user.email, email: user.email, role: data.role};
  },

  publicUrl(path) {
    return this.client.storage.from(IMG_BUCKET).getPublicUrl(path).data.publicUrl;
  },

  async init() { await this.reload(); },

  async reload() {
    const c = this.client;
    const [settings, products, sales, movements, profiles] = await Promise.all([
      c.from('store_settings').select('*').eq('id', 1).single(),
      c.from('products').select('*, product_stock(size, qty)').order('name'),
      c.from('sales').select('*, sale_items(*)').order('created_at', {ascending: false}).limit(500),
      c.from('stock_movements').select('*').order('created_at', {ascending: false}).limit(1000),
      c.from('profiles').select('id, full_name, email, role, active, created_at').order('created_at')
    ]);
    const st = must(settings);
    state = {
      users: must(profiles).map(r => ({id: r.id, name: r.full_name || r.email || '', email: r.email || '', role: r.role, active: r.active, createdAt: r.created_at})),
      settings: {storeName: st.store_name, threshold: st.low_stock_threshold, sizes: st.sizes, nextSale: 0},
      products: must(products).map(r => ({
        id: r.id, sku: r.sku, name: r.name, brand: r.brand, category: r.category, gender: r.gender, color: r.color,
        cost: Number(r.cost), price: Number(r.price), minStock: r.min_stock ?? '', createdAt: r.created_at,
        imagePath: r.image_path, image: r.image_path ? this.publicUrl(r.image_path) : '',
        stock: Object.fromEntries((r.product_stock || []).filter(s => s.qty > 0).map(s => [s.size, s.qty]))
      })),
      sales: must(sales).map(r => ({
        id: r.id, num: r.num, date: r.created_at, customer: r.customer, method: r.method, status: r.status,
        subtotal: Number(r.subtotal), discount: Number(r.discount), total: Number(r.total), cost: Number(r.cost),
        paid: Number(r.paid), change: Number(r.change_amount),
        items: (r.sale_items || []).map(i => ({pid: i.product_id, sku: i.sku, name: i.name, size: i.size, qty: i.qty, price: Number(i.price), cost: Number(i.cost)}))
      })),
      movements: must(movements).map(r => ({
        id: r.id, date: r.created_at, productId: r.product_id, sku: r.sku, name: r.name, size: r.size,
        type: r.type, qty: r.qty, balance: r.balance, note: r.note, ref: r.sale_id || ''
      }))
    };
  },

  async saveProduct({id, data, stock, image}) {
    const c = this.client;
    const row = {sku: data.sku, name: data.name, brand: data.brand, category: data.category, gender: data.gender, color: data.color, cost: data.cost, price: data.price, min_stock: data.minStock === '' ? null : data.minStock};
    let pid = id, oldPath = id ? (getProduct(id) || {}).imagePath : null;
    try {
      if (id) must(await c.from('products').update(row).eq('id', id));
      else pid = must(await c.from('products').insert(row).select('id').single()).id;

      must(await c.rpc('set_product_stock', {p_product: pid, p_stock: stock, p_initial: !id}));

      if (image === 'remove' && oldPath) {
        must(await c.from('products').update({image_path: null}).eq('id', pid));
        await c.storage.from(IMG_BUCKET).remove([oldPath]);
      } else if (image && image.blob) {
        const path = `${pid}/${Date.now()}.jpg`;
        must(await c.storage.from(IMG_BUCKET).upload(path, image.blob, {contentType: 'image/jpeg', cacheControl: '31536000'}));
        must(await c.from('products').update({image_path: path}).eq('id', pid));
        if (oldPath) await c.storage.from(IMG_BUCKET).remove([oldPath]);
      }
    } finally {
      await this.reload().catch(() => {});   // la pantalla siempre refleja lo que realmente quedó guardado
    }
  },

  async deleteProduct(id) {
    const path = (getProduct(id) || {}).imagePath;
    must(await this.client.from('products').delete().eq('id', id));
    if (path) await this.client.storage.from(IMG_BUCKET).remove([path]);
    await this.reload();
  },

  async move({pid, size, type, qty, note}) {
    must(await this.client.rpc('adjust_stock', {p_product: pid, p_size: size, p_type: type, p_qty: qty, p_note: note || ''}));
    await this.reload();
  },

  async sell({items, method, discount, customer, paid}) {
    const sale = must(await this.client.rpc('register_sale', {
      p_items: items.map(i => ({product_id: i.pid, size: i.size, qty: i.qty})),
      p_method: method, p_discount: discount || 0, p_customer: customer || '', p_paid: paid || 0
    }));
    await this.reload();
    return state.sales.find(s => s.id === sale.id);
  },

  async voidSale(id) {
    must(await this.client.rpc('void_sale', {p_sale: id}));
    await this.reload();
  },

  async saveSettings({storeName, threshold, sizes}) {
    must(await this.client.from('store_settings').update({store_name: storeName, low_stock_threshold: threshold, sizes}).eq('id', 1));
    await this.reload();
  },

  /* ---- Usuarios: editar perfil va directo (RLS: solo admin); crear / contraseña / eliminar pasan por la Edge Function ---- */
  async callAdmin(body) {
    const {data, error} = await this.client.functions.invoke('admin-users', {body});
    if (error) {
      let msg = error.message;
      try { const j = await error.context.json(); if (j && j.error) msg = j.error; } catch (e) { /* sin cuerpo JSON */ }
      throw new Error(friendlyError({message: msg}));
    }
    if (data && data.error) throw new Error(data.error);
    return data;
  },

  async createUser({name, email, password, role}) {
    await this.callAdmin({action: 'create', name, email, password, role});
    await this.reload();
  },

  async updateUser(id, {name, role, active}) {
    must(await this.client.from('profiles').update({full_name: name, role, active}).eq('id', id));
    await this.reload();
  },

  async setUserPassword(id, password) {
    await this.callAdmin({action: 'set_password', user_id: id, password});
  },

  async deleteUser(id) {
    await this.callAdmin({action: 'delete', user_id: id});
    await this.reload();
  }
};
