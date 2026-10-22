'use strict';
/* Registro de vistas y navegación por hash */

const VIEWS = {
  dashboard: {title: 'Panel', render: renderDashboard},
  inventory: {title: 'Inventario', render: renderInventory},
  pos:       {title: 'Punto de venta', render: renderPOS},
  movements: {title: 'Movimientos de stock', render: renderMovements},
  sales:     {title: 'Ventas', render: renderSales},
  settings:  {title: 'Ajustes', render: renderSettings}
};
const NAV_LABELS = {dashboard: 'Panel', inventory: 'Inventario', pos: 'Vender', movements: 'Movimientos', sales: 'Ventas', settings: 'Ajustes'};

const ADMIN_ONLY = ['movements', 'settings'];

function route(opts) {
  if (!appReady) return;
  const allowed = Object.keys(VIEWS).filter(k => isAdmin() || !ADMIN_ONLY.includes(k));
  const r = location.hash.replace(/^#\/?/, '') || 'dashboard';
  const v = allowed.includes(r) ? r : 'dashboard';
  $('#nav').innerHTML = allowed.map(k => `<a href="#/${k}" class="${k === v ? 'on' : ''}"><svg viewBox="0 0 24 24">${ICONS[k]}</svg>${NAV_LABELS[k]}</a>`).join('');
  $('#title').textContent = VIEWS[v].title;
  $('#today').textContent = new Date().toLocaleDateString('es', {weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'});
  document.title = state.settings.storeName + ' · Inventario';
  VIEWS[v].render();
  if (!(opts && opts.keepScroll)) window.scrollTo(0, 0);
}
const refresh = () => route();
