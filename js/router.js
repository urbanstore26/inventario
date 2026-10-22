'use strict';
/* Registro de vistas, permisos por rol y navegación por hash */

const VIEWS = {
  dashboard: {title: 'Panel', render: renderDashboard},
  inventory: {title: 'Inventario', render: renderInventory},
  pos:       {title: 'Punto de venta', render: renderPOS},
  movements: {title: 'Movimientos de stock', render: renderMovements},
  sales:     {title: 'Ventas', render: renderSales},
  users:     {title: 'Usuarios', render: renderUsers},
  settings:  {title: 'Ajustes', render: renderSettings}
};
const NAV_LABELS = {dashboard: 'Panel', inventory: 'Inventario', pos: 'Vender', movements: 'Movimientos', sales: 'Ventas', users: 'Usuarios', settings: 'Ajustes'};

/* Vendedor: ver stock, vender e imprimir tickets (el historial de ventas sirve para reimprimirlos). Administrador: todo. */
const ROLE_VIEWS = {admin: Object.keys(VIEWS), vendedor: ['inventory', 'pos', 'sales']};
const DEFAULT_VIEW = {admin: 'dashboard', vendedor: 'pos'};

function route(opts) {
  if (!appReady) return;
  const role = isAdmin() ? 'admin' : 'vendedor', allowed = ROLE_VIEWS[role];
  const r = location.hash.replace(/^#\/?/, '') || DEFAULT_VIEW[role];
  const v = allowed.includes(r) ? r : DEFAULT_VIEW[role];
  $('#nav').innerHTML = allowed.map(k => `<a href="#/${k}" class="${k === v ? 'on' : ''}"><svg viewBox="0 0 24 24">${ICONS[k]}</svg>${NAV_LABELS[k]}</a>`).join('');
  $('#title').textContent = VIEWS[v].title;
  $('#today').textContent = new Date().toLocaleDateString('es', {weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'});
  document.title = state.settings.storeName + ' · Inventario';
  VIEWS[v].render();
  if (!(opts && opts.keepScroll)) window.scrollTo(0, 0);
}
const refresh = () => route();
