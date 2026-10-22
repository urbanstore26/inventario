'use strict';
/* Acciones disparadas desde data-action en el HTML */

const ACTIONS = {
  toggleTheme() {
    const t = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = t;
    try { localStorage.setItem('pu_theme', t); } catch (e) {}
  },
  closeModal,
  backdrop(el, e) { if (e.target === el) closeModal(); },
  newProduct: () => productForm(),
  editProduct: el => productForm(el.dataset.id),
  addStock(el) {
    ui.mov.pid = el.dataset.id;
    if (location.hash === '#/movements') refresh(); else location.hash = '#/movements';
  },
  viewImage: el => viewImage(el.dataset.id),
  removeImage: removeProductImage,
  enterDemo: () => run(null, async () => { await store.signIn(); await startApp(); }),
  logout: doLogout,
  togglePw(el) {
    const input = el.closest('.field').querySelector('input'), show = input.type === 'password';
    input.type = show ? 'text' : 'password';
    el.innerHTML = show ? AUTH_ICONS.eyeOff : AUTH_ICONS.eye;
    el.setAttribute('aria-pressed', String(show)); el.setAttribute('aria-label', show ? 'Ocultar contraseña' : 'Mostrar contraseña');
  },
  forgot() { const h = $('#authHelp'); if (h) h.hidden = !h.hidden; },
  deleteProduct(el) {
    const p = getProduct(el.dataset.id);
    if (!p || !confirm(`¿Eliminar "${p.name}" (${p.sku})? El historial de movimientos y ventas se conserva.`)) return;
    return run(el, async () => { await store.deleteProduct(p.id); toast('Producto eliminado'); refresh(); });
  },
  posPick(el) { pos.sel = el.dataset.id; drawPosResults(); drawPosSizes(); },
  posAdd(el) {
    const p = getProduct(pos.sel), size = el.dataset.size; if (!p) return;
    const it = pos.cart.find(i => i.pid === p.id && i.size === size);
    if ((it ? it.qty : 0) + 1 > (p.stock[size] || 0)) return toast('No hay más stock de esa talla', true);
    if (it) it.qty++; else pos.cart.push({pid: p.id, name: p.name, size, qty: 1, price: p.price});
    drawCart(); drawPosSizes();
  },
  posInc(el) {
    const i = pos.cart[el.dataset.i], p = getProduct(i.pid);
    if (i.qty + 1 > (p.stock[i.size] || 0)) return toast('No hay más stock de esa talla', true);
    i.qty++; drawCart(); drawPosSizes();
  },
  posDec(el) { const i = pos.cart[el.dataset.i]; if (--i.qty <= 0) pos.cart.splice(el.dataset.i, 1); drawCart(); drawPosSizes(); },
  posRm(el) { pos.cart.splice(el.dataset.i, 1); drawCart(); drawPosSizes(); },
  posClear() { pos.cart = []; pos.discount = pos.paid = ''; drawCart(); drawPosSizes(); },
  posCheckout: checkout,
  viewSale: el => showSale(el.dataset.id),
  voidSale: el => voidSale(el.dataset.id),
  printReceipt: printTicket,
  exportInv() {
    const rows = [['SKU', 'Producto', 'Marca', 'Categoría', 'Género', 'Color', 'Costo', 'Precio', 'Talla', 'Stock']];
    state.products.forEach(p => { const sz = sortSizes(Object.keys(p.stock)); (sz.length ? sz : ['']).forEach(s => rows.push([p.sku, p.name, p.brand, p.category, p.gender, p.color, p.cost, p.price, s, s ? p.stock[s] : 0])); });
    download(`inventario-${dayKey(new Date())}.csv`, toCSV(rows), 'text/csv;charset=utf-8');
  },
  exportSales() {
    const rows = [['N.º', 'Fecha', 'Cliente', 'Pago', 'Estado', 'SKU', 'Producto', 'Talla', 'Cantidad', 'Precio', 'Total venta', 'Descuento']];
    state.sales.forEach(s => s.items.forEach(i => rows.push(['V-' + pad(s.num, 4), fmtDate(s.date), s.customer, s.method, s.status, i.sku, i.name, i.size, i.qty, i.price, s.total, s.discount])));
    download(`ventas-${dayKey(new Date())}.csv`, toCSV(rows), 'text/csv;charset=utf-8');
  },
  exportMov() {
    const rows = [['Fecha', 'SKU', 'Producto', 'Talla', 'Tipo', 'Cantidad', 'Saldo', 'Nota']];
    state.movements.forEach(m => rows.push([fmtDate(m.date), m.sku, m.name, m.size, MOVE_TYPES[m.type].label, m.qty, m.balance, m.note]));
    download(`movimientos-${dayKey(new Date())}.csv`, toCSV(rows), 'text/csv;charset=utf-8');
  },
  backup: () => download(`respaldo-plante-urban-${dayKey(new Date())}.json`, JSON.stringify(state, null, 2), 'application/json'),
  restore: () => $('#restoreFile').click(),
  resetDemo() {
    if (store.mode !== 'local' || !confirm('Esto reemplaza TODOS los datos actuales por datos de ejemplo. ¿Continuar?')) return;
    return run(null, async () => { await store.resetDemo(); Object.assign(pos, {cart: [], sel: null}); toast('Datos de ejemplo cargados'); refresh(); });
  },
  clearAll() {
    if (store.mode !== 'local' || !confirm('Esto borra productos, movimientos y ventas. Descarga un respaldo antes. ¿Borrar todo?')) return;
    return run(null, async () => { await store.clearAll(); Object.assign(pos, {cart: [], sel: null}); toast('Inventario vacío'); refresh(); });
  }
};
