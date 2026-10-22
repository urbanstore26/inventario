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
  return {products: [], movements: [], sales: [], users: [], roles: [], permissions: [], settings: {storeName: 'Plante Urban Store', threshold: 3, sizes: DEFAULT_SIZES.slice(), nextSale: 1}};
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
const ui = {inv: {q: '', cat: '', brand: '', status: ''}, mov: {q: '', type: '', pid: ''}, sal: {from: '', to: '', method: '', status: ''}, usr: {q: ''}};
