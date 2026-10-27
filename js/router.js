'use strict';
/* Registro de vistas, permisos por pantalla y navegación por hash */

const VIEWS = {
  dashboard: {title: 'Panel', render: renderDashboard},
  inventory: {title: 'Inventario', render: renderInventory},
  pos:       {title: 'Punto de venta', render: renderPOS},
  movements: {title: 'Movimientos y cambios', render: renderMovements},
  sales:     {title: 'Ventas', render: renderSales},
  discounts: {title: 'Descuentos', render: renderDiscounts},
  assets:    {title: 'Inversión social', render: renderAssets},
  users:     {title: 'Usuarios', render: renderUsers},
  settings:  {title: 'Ajustes', render: renderSettings}
};
const NAV_LABELS = {dashboard: 'Panel', inventory: 'Inventario', pos: 'Vender', movements: 'Movimientos', sales: 'Ventas', discounts: 'Descuentos', assets: 'Inversión', users: 'Usuarios', settings: 'Ajustes'};

/* Permiso que da acceso a cada pantalla (los permisos se leen de la tabla de roles) */
const VIEW_PERMISSION = {dashboard: 'dashboard.view', inventory: 'inventory.view', pos: 'sales.create', movements: ['stock.adjust', 'exchanges.create'], sales: 'sales.view', discounts: 'discounts.manage', assets: 'assets.view', users: 'users.manage', settings: 'settings.manage'};
/* Pantalla de inicio: la primera de esta lista a la que tenga acceso */
const LANDING_ORDER = ['dashboard', 'pos', 'inventory', 'sales', 'discounts', 'assets', 'movements', 'users', 'settings'];

function route(opts) {
  if (!appReady) return;
  const allowed = Object.keys(VIEWS).filter(k => [].concat(VIEW_PERMISSION[k]).some(can));   // una pantalla puede abrirse con cualquiera de varios permisos
  $('#today').textContent = new Date().toLocaleDateString('es', {weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'});
  document.title = state.settings.storeName + ' · Inventario';
  if (!allowed.length) {
    $('#nav').innerHTML = '';
    $('#title').textContent = 'Sin permisos';
    $('#view').innerHTML = '<div class="card empty">Tu rol no tiene permisos asignados.<br>Pide a un administrador que te asigne uno.</div>';
    return;
  }
  const r = location.hash.replace(/^#\/?/, '');
  const v = allowed.includes(r) ? r : LANDING_ORDER.find(k => allowed.includes(k));
  $('#nav').innerHTML = allowed.map(k => `<a href="#/${k}" class="${k === v ? 'on' : ''}"><svg viewBox="0 0 24 24">${ICONS[k]}</svg>${NAV_LABELS[k]}</a>`).join('');
  $('#title').textContent = VIEWS[v].title;
  VIEWS[v].render();
  if (!(opts && opts.keepScroll)) window.scrollTo(0, 0);
}
const refresh = () => route();
