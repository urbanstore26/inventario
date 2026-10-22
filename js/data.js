'use strict';
/* Estado en memoria y reglas de dominio (la persistencia está en js/store/) */

const DEFAULT_SIZES = ['35','36','37','38','39','40','41','42','43','44','45','46'];
const CATEGORIES = ['Tenis deportivos', 'Casual urbano', 'Botas', 'Sandalias y slides', 'Formal'];
const MOVE_TYPES = {
  inicial:    {label: 'Stock inicial', cls: 'b-info'},
  entrada:    {label: 'Entrada',       cls: 'b-ok'},
  salida:     {label: 'Salida',        cls: 'b-low'},
  ajuste:     {label: 'Ajuste',        cls: 'b-neutral'},
  venta:      {label: 'Venta',         cls: 'b-info'},
  devolucion: {label: 'Devolución',    cls: 'b-ok'}
};
let state = blank();      // lo llena el store activo (local o Supabase) al iniciar sesión
let store = null;         // LocalStore | SupabaseStore
let appReady = false;
const isAdmin = () => !!store && !!store.user && store.user.role === 'admin';   // el rol Administrador (siempre tiene todo)

/* Catálogo de permisos (mismas claves que la tabla public.permissions). En Supabase se lee de la base de datos. */
const PERMISSION_CATALOG = [
  {key: 'dashboard.view',  label: 'Ver el panel',                         description: 'Indicadores de ventas e inventario'},
  {key: 'inventory.view',  label: 'Ver inventario y stock',               description: 'Consultar productos, fotos y stock por talla'},
  {key: 'sales.create',    label: 'Registrar ventas e imprimir tickets',  description: 'Usar el punto de venta'},
  {key: 'sales.view',      label: 'Ver el historial de ventas',           description: 'Consultar ventas y reimprimir tickets'},
  {key: 'costs.view',      label: 'Ver costos y utilidades',              description: 'Costo de los productos y ganancias (solo en pantalla)'},
  {key: 'products.manage', label: 'Crear y editar productos',             description: 'Incluye precios, fotos y eliminar'},
  {key: 'discounts.manage', label: 'Administrar descuentos',               description: 'Crear promociones y elegir a qué productos aplican'},
  {key: 'stock.adjust',    label: 'Entradas, salidas y ajustes de stock', description: 'Movimientos de inventario y su historial'},
  {key: 'sales.void',      label: 'Anular ventas',                        description: 'Devuelve los pares al inventario'},
  {key: 'reports.export',  label: 'Exportar reportes',                    description: 'Descargar el inventario y las ventas en CSV'},
  {key: 'settings.manage', label: 'Ajustes de la tienda',                 description: 'Nombre, tallas y alertas de stock'},
  {key: 'users.manage',    label: 'Gestionar usuarios',                   description: 'Crear cuentas, cambiar contraseñas, activar o desactivar'}
];
/* ¿La sesión actual tiene este permiso? (el rol Administrador los tiene todos) */
const can = key => !!store && !!store.user && (store.user.role === 'admin' || (store.user.permissions || []).includes(key));
const roleName = id => (state.roles.find(r => r.id === id) || {}).name || id;

function blank() {
  return {products: [], movements: [], sales: [], users: [], roles: [], permissions: [], discounts: [], settings: {storeName: 'Plante Urban Store', threshold: 3, sizes: DEFAULT_SIZES.slice(), nextSale: 1}};
}

const totalStock = p => Object.values(p.stock).reduce((a, q) => a + (q || 0), 0);
const minOf = p => (p.minStock === '' || p.minStock == null) ? Number(state.settings.threshold) : Number(p.minStock);
function stockStatus(p) {
  const t = totalStock(p);
  if (t === 0) return {key: 'out', label: 'Agotado', cls: 'b-out'};
  if (t <= minOf(p)) return {key: 'low', label: 'Stock bajo', cls: 'b-low'};
  return {key: 'ok', label: 'Disponible', cls: 'b-ok'};
}
function sizesFor(p) {
  const set = new Set(state.settings.sizes);
  if (p) Object.entries(p.stock).forEach(([s, q]) => q > 0 && set.add(s));
  return sortSizes([...set]);
}
const getProduct = id => state.products.find(p => p.id === id);
const validSales = () => state.sales.filter(s => s.status === 'completada');
function nextSku() {
  const max = state.products.reduce((m, p) => { const n = parseInt((p.sku.match(/(\d+)$/) || [])[1]); return n > m ? n : m; }, 0);
  return 'PU-' + pad(max + 1, 4);
}
/* Estado de la interfaz (filtros por vista) */
const ui = {inv: {q: '', cat: '', brand: '', status: ''}, mov: {q: '', type: '', pid: ''}, sal: {from: '', to: '', method: '', status: ''}, usr: {q: ''}, dsc: {q: ''}};


/* ---- Descuentos: una oferta aplica a los productos elegidos; si hay varias, gana el precio más bajo ---- */
const discountLabel = d => d.kind === 'percent' ? '-' + (+d.value) + '%' : '-' + money(d.value);
/* active | scheduled (aún no empieza) | expired (ya terminó) | paused */
const discountState = (d, day = dayKey(new Date())) => !d.active ? 'paused' : (d.startsOn && d.startsOn > day) ? 'scheduled' : (d.endsOn && d.endsOn < day) ? 'expired' : 'active';
/* Cálculo en centavos enteros, con redondeo "mitad hacia arriba", igual que round(…, 2) de la base de datos:
   así lo que se muestra coincide al centavo con lo que cobra el servidor (p. ej. 50% de 74.99 = 37.50). */
function discountedPrice(price, d) {
  const pc = Math.round(price * 100), vc = Math.round(d.value * 100);
  const cents = d.kind === 'percent' ? Math.floor((pc * (10000 - vc) + 5000) / 10000) : pc - vc;
  return Math.max(0, cents) / 100;
}
/* Precio vigente de un producto: {price, list, name, discount}. Sin oferta, price === list. */
function priceOf(p) {
  let best = null;
  (state.discounts || []).forEach(d => {
    if (discountState(d) !== 'active' || !d.productIds.includes(p.id)) return;
    const np = discountedPrice(p.price, d);
    if (np < p.price && (!best || np < best.price || (np === best.price && d.name < best.name))) best = {price: np, name: d.name, discount: d};
  });
  return best ? {price: best.price, list: p.price, name: best.name, discount: best.discount} : {price: p.price, list: p.price, name: '', discount: null};
}
function priceHtml(p) {
  const e = priceOf(p);
  return e.discount ? `<s class="price-old num">${money(e.list)}</s> <b class="num">${money(e.price)}</b>` : `<b class="num">${money(p.price)}</b>`;
}
function offerBadge(p) {
  const e = priceOf(p);
  return e.discount ? `<span class="badge b-low offer" title="${esc(e.name)}">${esc(discountLabel(e.discount))}</span>` : '';
}
