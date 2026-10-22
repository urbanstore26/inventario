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
const isAdmin = () => !!store && !!store.user && store.user.role === 'admin';

function blank() {
  return {products: [], movements: [], sales: [], settings: {storeName: 'Plante Urban Store', threshold: 3, sizes: DEFAULT_SIZES.slice(), nextSale: 1}};
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
const ui = {inv: {q: '', cat: '', brand: '', status: ''}, mov: {q: '', type: '', pid: ''}, sal: {from: '', to: '', method: '', status: ''}};
