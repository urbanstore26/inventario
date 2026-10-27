'use strict';
/* Backend SUPABASE: login (Auth), datos (PostgREST + RPC) y fotos (Storage).
   La lógica de stock y ventas vive en funciones SQL atómicas (supabase/migrations). */

const IMG_BUCKET = 'product-images';

function friendlyError(error) {
  const msg = (error && error.message) || String(error);
  if (/assets_code_key/.test(msg)) return 'Ya existe un bien con ese código';
  if (/investment_plans_name_key/.test(msg)) return 'Ya existe un plan con ese nombre';
  if (error && error.code === '23505') return 'Ya existe un producto con ese SKU';
  if (error && error.code === '42501') return 'No tienes permiso para esta acción';
  if (/invalid login credentials/i.test(msg)) return 'Correo o contraseña incorrectos';
  if (/edge function|functions\/v1|FunctionsFetchError/i.test(msg)) return 'No se pudo contactar la función admin-users. ¿Está desplegada? (ver README)';
  if (/failed to fetch|networkerror|load failed/i.test(msg)) return 'Sin conexión con el servidor. Revisa tu internet.';
  if (/PGRST202|could not find the function/i.test((error && error.code) + ' ' + msg)) return 'Falta actualizar la base de datos: ejecuta la migración pendiente en Supabase (ver README)';
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
    // nombre del rol y permisos (se leen de las tablas roles y role_permissions)
    const [role, perms] = await Promise.all([
      this.client.from('roles').select('name').eq('id', data.role).maybeSingle(),
      this.client.from('role_permissions').select('permission').eq('role_id', data.role)
    ]);
    this.user = {id: user.id, name: data.full_name || user.email, email: user.email, role: data.role,
      roleName: (role.data || {}).name || data.role, permissions: (perms.data || []).map(x => x.permission)};
  },

  publicUrl(path) {
    return this.client.storage.from(IMG_BUCKET).getPublicUrl(path).data.publicUrl;
  },

  async init() { await this.reload(); },

  async reload() {
    const c = this.client;
    // la lista de vendedores a elegir solo la piden quienes tienen ese permiso
    // mobiliario y equipo: solo se pide a quien tiene permiso para verlo
    const canAssets = this.user && (this.user.role === 'admin' || ['assets.view', 'assets.manage'].some(k => (this.user.permissions || []).includes(k)));
    const canExpenses = this.user && (this.user.role === 'admin' || ['expenses.view', 'expenses.manage'].some(k => (this.user.permissions || []).includes(k)));
    const canExch = this.user && (this.user.role === 'admin' || ['exchanges.create', 'stock.adjust', 'sales.view', 'reports.export', 'dashboard.view'].some(k => (this.user.permissions || []).includes(k)));
    const none = Promise.resolve({data: [], error: null});
    const canPick = this.user && (this.user.role === 'admin' || (this.user.permissions || []).includes('sales.assign_seller'));
    const [settings, products, sales, movements, profiles, roles, permissions, rolePerms, discounts, discountProducts, sellers, plansRes, assetsRes, eventsRes, expensesRes, exchangesRes] = await Promise.all([
      c.from('store_settings').select('*').eq('id', 1).single(),
      c.from('products').select('*, product_stock(size, qty)').order('name'),
      c.from('sales').select('*, sale_items(*)').order('created_at', {ascending: false}).limit(500),
      c.from('stock_movements').select('*').order('created_at', {ascending: false}).limit(1000),
      c.from('profiles').select('id, full_name, email, role, active, created_at').order('created_at'),
      c.from('roles').select('id, name, description, is_system').order('created_at'),
      c.from('permissions').select('key, label, description').order('sort'),
      c.from('role_permissions').select('role_id, permission'),
      c.from('discounts').select('*').order('created_at'),
      c.from('discount_products').select('discount_id, product_id'),
      canPick ? c.rpc('list_sellers') : Promise.resolve({data: [], error: null}),
      canAssets ? c.from('investment_plans').select('*').order('created_at') : none,
      canAssets ? c.from('assets').select('*').order('code') : none,
      canAssets ? c.from('asset_events').select('*').order('created_at', {ascending: false}).limit(500) : none,
      canExpenses ? c.from('plan_expenses').select('*').order('spent_on', {ascending: false}).limit(1000) : none,
      canExch ? c.from('exchanges').select('*, exchange_items(*)').order('created_at', {ascending: false}).limit(500) : none
    ]);
    const aerr = [plansRes, assetsRes, eventsRes].find(r => r.error);
    const rp = must(rolePerms), dp = must(discountProducts);
    const st = must(settings);
    state = {
      // si faltan las tablas (migración sin ejecutar) o falla la carga, la app sigue funcionando y la pantalla lo explica
      plans: aerr ? [] : (plansRes.data || []).map(r => ({id: r.id, name: r.name, description: r.description, budget: Number(r.budget), startsOn: r.starts_on, endsOn: r.ends_on, active: r.active, createdAt: r.created_at})),
      assets: aerr ? [] : (assetsRes.data || []).map(r => ({id: r.id, code: r.code, name: r.name, category: r.category, brand: r.brand, model: r.model, serial: r.serial, quantity: r.quantity, unitCost: Number(r.unit_cost),
        acquiredOn: r.acquired_on, location: r.location, responsible: r.responsible, status: r.status, planId: r.plan_id, notes: r.notes, createdAt: r.created_at, updatedAt: r.updated_at,
        imagePath: r.image_path, image: r.image_path ? this.publicUrl(r.image_path) : ''})),
      assetLog: aerr ? [] : (eventsRes.data || []).map(r => ({id: r.id, assetId: r.asset_id, code: r.asset_code, name: r.asset_name, kind: r.kind, detail: r.detail, date: r.created_at, actor: r.actor_name})),
      exchanges: exchangesRes.error ? [] : (exchangesRes.data || []).map(r => ({id: r.id, num: r.num, date: r.created_at, saleId: r.sale_id, saleNum: r.sale_num, reason: r.reason, customer: r.customer, note: r.note,
        difference: Number(r.difference), method: r.method, by: r.created_name,
        items: (r.exchange_items || []).map(i => ({dir: i.direction, pid: i.product_id, sku: i.sku, name: i.name, size: i.size, qty: i.qty, price: Number(i.price), condition: i.condition}))})),
      exchangesError: !exchangesRes.error ? '' : (/PGRST205|PGRST202|42P01|does not exist|schema cache/i.test(exchangesRes.error.code + ' ' + exchangesRes.error.message) ? 'missing' : friendlyError(exchangesRes.error)),
      expenses: expensesRes.error ? [] : (expensesRes.data || []).map(r => ({id: r.id, planId: r.plan_id, kind: r.kind, concept: r.concept, payee: r.payee, amount: Number(r.amount), spentOn: r.spent_on, notes: r.notes, createdAt: r.created_at, updatedAt: r.updated_at})),
      expensesError: !expensesRes.error ? '' : (/PGRST205|PGRST202|42P01|does not exist|schema cache/i.test(expensesRes.error.code + ' ' + expensesRes.error.message) ? 'missing' : friendlyError(expensesRes.error)),
      assetsError: !aerr ? '' : (/PGRST205|PGRST202|42P01|does not exist|schema cache/i.test(aerr.error.code + ' ' + aerr.error.message) ? 'missing' : friendlyError(aerr.error)),
      sellers: sellers.error ? [] : (sellers.data || []).map(r => ({id: r.id, name: r.name, role: r.role_name || ''})),
      // si la lista no carga (p. ej. falta la migración del Cajero) la app sigue funcionando y la pantalla de venta lo explica
      sellersError: !sellers.error ? '' : (/PGRST202|42883|does not exist|schema cache/i.test(sellers.error.code + ' ' + sellers.error.message) ? 'missing' : friendlyError(sellers.error)),
      discounts: must(discounts).map(r => ({id: r.id, name: r.name, kind: r.kind, value: Number(r.value), startsOn: r.starts_on, endsOn: r.ends_on, active: r.active, createdAt: r.created_at, productIds: dp.filter(x => x.discount_id === r.id).map(x => x.product_id)})),
      roles: must(roles).map(r => ({id: r.id, name: r.name, description: r.description, isSystem: r.is_system, permissions: rp.filter(x => x.role_id === r.id).map(x => x.permission)})),
      permissions: must(permissions).map(p => ({key: p.key, label: p.label, description: p.description})),
      users: must(profiles).map(r => ({id: r.id, name: r.full_name || r.email || '', email: r.email || '', role: r.role, active: r.active, createdAt: r.created_at})),
      settings: {storeName: st.store_name, threshold: st.low_stock_threshold, sizes: st.sizes, nextSale: 0},
      products: must(products).map(r => ({
        id: r.id, sku: r.sku, name: r.name, brand: r.brand, category: r.category, gender: r.gender, color: r.color,
        cost: Number(r.cost), price: Number(r.price), minStock: r.min_stock ?? '', createdAt: r.created_at,
        imagePath: r.image_path, image: r.image_path ? this.publicUrl(r.image_path) : '',
        stock: Object.fromEntries((r.product_stock || []).filter(s => s.qty > 0).map(s => [s.size, s.qty]))
      })),
      sales: must(sales).map(r => ({
        id: r.id, num: r.num, date: r.created_at, customer: r.customer, note: r.note || '', seller: r.seller_name || '', sellerId: r.seller_id || '', cashier: r.cashier_name || '', method: r.method, status: r.status,
        subtotal: Number(r.subtotal), discount: Number(r.discount), total: Number(r.total), cost: Number(r.cost),
        paid: Number(r.paid), change: Number(r.change_amount),
        items: (r.sale_items || []).map(i => ({pid: i.product_id, sku: i.sku, name: i.name, size: i.size, qty: i.qty, price: Number(i.price), listPrice: Number(i.list_price ?? i.price), discountName: i.discount_name || '', cost: Number(i.cost)}))
      })),
      movements: must(movements).map(r => ({
        id: r.id, date: r.created_at, productId: r.product_id, sku: r.sku, name: r.name, size: r.size,
        type: r.type, qty: r.qty, balance: r.balance, note: r.note, ref: r.sale_id || ''
      }))
    };
    // si cambiaron los permisos de mi rol, se aplican sin volver a iniciar sesión
    const mine = this.user && state.roles.find(r => r.id === this.user.role);
    if (mine) this.user = {...this.user, roleName: mine.name, permissions: mine.permissions};
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

  async sell({items, method, discount, customer, note, paid, seller}) {
    const args = {
      p_items: items.map(i => ({product_id: i.pid, size: i.size, qty: i.qty})),
      p_method: method, p_discount: discount || 0, p_customer: customer || '', p_paid: paid || 0
    };
    if ((note || '').trim()) args.p_note = note.trim().slice(0, 200);   // solo si se escribió: sin observación funciona aunque falte la migración
    if (seller) args.p_seller = seller;   // solo se envía si se eligió: el servidor valida el permiso y que sea un vendedor activo
    const sale = must(await this.client.rpc('register_sale', args));
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
  },

  /* Reporte por talla: la vista inventory_variants calcula Vendidos, Ganancia, Valor y Estado en el servidor
     (con TODAS las ventas, no solo las 500 cargadas en pantalla). Se pagina porque la API limita filas por consulta. */
  async variantReport() {
    const rows = [], page = 1000;
    for (let from = 0; ; from += page) {
      const data = must(await this.client.from('inventory_variants').select('*').order('sku').order('size').range(from, from + page - 1));
      rows.push(...data);
      if (data.length < page) break;
    }
    return rows.map(r => ({
      sku: r.sku, model: r.model, color: r.color || '', size: r.size, cost: Number(r.cost), price: Number(r.price), initial: r.initial_stock, sold: r.sold,
      stock: r.current_stock, unitProfit: Number(r.unit_profit), inventoryValue: Number(r.inventory_value), retailValue: Number(r.retail_value), status: r.status
    }));
  },

  /* ---- Roles y permisos: solo el rol Administrador; lo aplican las funciones SQL create_role / update_role / delete_role ---- */
  async createRole({name, description, permissions}) {
    const id = must(await this.client.rpc('create_role', {p_name: name, p_description: description || '', p_permissions: permissions}));
    await this.reload();
    return id;
  },

  async updateRole(id, {name, description, permissions}) {
    must(await this.client.rpc('update_role', {p_id: id, p_name: name, p_description: description || '', p_permissions: permissions}));
    await this.reload();
  },

  async deleteRole(id) {
    must(await this.client.rpc('delete_role', {p_id: id}));
    await this.reload();
  },

  /* ---- Descuentos: se guardan con la función SQL save_discount (atómica); el precio al vender lo calcula el servidor ---- */
  async saveDiscount({id, name, kind, value, startsOn, endsOn, active, productIds}) {
    must(await this.client.rpc('save_discount', {p_id: id || null, p_name: name, p_kind: kind, p_value: value, p_starts_on: startsOn || null, p_ends_on: endsOn || null, p_active: active !== false, p_products: productIds}));
    await this.reload();
  },

  async deleteDiscount(id) {
    must(await this.client.from('discounts').delete().eq('id', id));
    await this.reload();
  },

  /* ---- Mobiliario y equipo y planes de inversión: tablas con RLS; el historial lo escribe un trigger ---- */
  async saveAsset({id, data, image}) {
    const c = this.client;
    const row = {name: data.name, category: data.category, brand: data.brand, model: data.model, serial: data.serial, quantity: data.quantity, unit_cost: data.unitCost,
      acquired_on: data.acquiredOn || null, location: data.location, responsible: data.responsible, status: data.status, plan_id: data.planId || null, notes: data.notes};
    if (!id && data.code) row.code = data.code;   // sin código, la base genera AF-0001, AF-0002…
    let aid = id, oldPath = id ? (getAsset(id) || {}).imagePath : null;
    try {
      if (id) must(await c.from('assets').update(row).eq('id', id));
      else aid = must(await c.from('assets').insert(row).select('id').single()).id;
      if (image === 'remove' && oldPath) {
        must(await c.from('assets').update({image_path: null}).eq('id', aid));
        await c.storage.from(IMG_BUCKET).remove([oldPath]);
      } else if (image && image.blob) {
        const path = `assets/${aid}/${Date.now()}.jpg`;
        must(await c.storage.from(IMG_BUCKET).upload(path, image.blob, {contentType: 'image/jpeg', cacheControl: '31536000'}));
        must(await c.from('assets').update({image_path: path}).eq('id', aid));
        if (oldPath) await c.storage.from(IMG_BUCKET).remove([oldPath]);
      }
    } finally {
      await this.reload().catch(() => {});   // la pantalla siempre refleja lo que realmente quedó guardado
    }
  },
  async deleteAsset(id) {
    const path = (getAsset(id) || {}).imagePath;
    must(await this.client.from('assets').delete().eq('id', id));
    if (path) await this.client.storage.from(IMG_BUCKET).remove([path]);
    await this.reload();
  },
  async savePlan({id, data}) {
    const row = {name: data.name, description: data.description, budget: data.budget, starts_on: data.startsOn || null, ends_on: data.endsOn || null, active: data.active !== false};
    if (id) must(await this.client.from('investment_plans').update(row).eq('id', id)); else must(await this.client.from('investment_plans').insert(row));
    await this.reload();
  },
  async deletePlan(id) {
    must(await this.client.from('investment_plans').delete().eq('id', id));
    await this.reload();
  },
  /* ---- Cambios y devoluciones: la función SQL register_exchange mueve el stock y valida todo (atómica) ---- */
  async registerExchange({saleId, reason, returned, delivered, method, customer, note}) {
    const toRow = l => ({product_id: l.pid, size: l.size, qty: l.qty});
    const ex = must(await this.client.rpc('register_exchange', {p_sale: saleId || null, p_reason: reason, p_returned: returned.map(toRow), p_delivered: (delivered || []).map(toRow),
      p_method: method || null, p_customer: customer || '', p_note: note || ''}));
    await this.reload();
    return state.exchanges.find(e => e.id === ex.id) || {id: ex.id, num: ex.num, date: ex.created_at, saleId: ex.sale_id, saleNum: ex.sale_num, reason, customer: ex.customer, note: ex.note, difference: Number(ex.difference), method: ex.method, by: '', items: []};
  },

  async saveExpense({id, data}) {
    const row = {plan_id: data.planId || null, kind: data.kind, concept: data.concept, payee: data.payee, amount: data.amount, spent_on: data.spentOn, notes: data.notes};
    if (id) must(await this.client.from('plan_expenses').update(row).eq('id', id)); else must(await this.client.from('plan_expenses').insert(row));
    await this.reload();
  },
  async deleteExpense(id) {
    must(await this.client.from('plan_expenses').delete().eq('id', id));
    await this.reload();
  }
};
