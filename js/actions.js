'use strict';
/* Acciones disparadas desde data-action en el HTML */

const ACTIONS = {
  toggleTheme() {
    const t = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = t;
    try { localStorage.setItem('pu_theme', t); } catch (e) {}
  },
  async pwaInstall() {
    if (!pwa.prompt) return;
    pwa.prompt.prompt();
    const r = await pwa.prompt.userChoice.catch(() => null);
    pwa.prompt = null; pwaInstallButton(); pwaClose();
    if (r && r.outcome === 'dismissed') pwaSet('later:' + Date.now());
  },
  pwaUpdate() { if (pwa.worker) pwa.worker.postMessage('SKIP_WAITING'); },
  pwaUpdateLater: pwaUpdateBar,
  pwaLater() { pwaSet('later:' + Date.now()); pwaClose(); },
  pwaNever() { pwaSet('never'); pwaClose(); },
  closeModal,
  backdrop(el, e) { if (e.target === el) closeModal(); },
  newProduct: () => productForm(),
  editProduct: el => productForm(el.dataset.id),
  movTab(el) { ui.mov.tab = el.dataset.tab; renderMovements(); },
  newExchange: () => exchangeForm(),
  newExchangeFor: el => exchangeForm(el.dataset.id),
  xfPickSale: el => xfPickSale(el.dataset.id),
  xfClearSale: () => xfClearSale(),
  viewExchange: el => showExchange(el.dataset.id),
  xfAdd: el => xfAddLine(el.dataset.k),
  xfRemove: el => xfRemoveLine(el.dataset.k, +el.dataset.i),
  exportExchanges,
  addStock(el) {
    ui.mov.tab = 'movimientos';
    ui.mov.pid = el.dataset.id;
    if (location.hash === '#/movements') refresh(); else location.hash = '#/movements';
  },
  viewImage: el => viewImage(el.dataset.id),
  removeImage: removeProductImage,
  enterDemo: () => run(null, async () => { await store.signIn(($('#demoRole') || {}).value); await startApp(); }),
  newUser: () => userForm(),
  editUser: el => userForm(el.dataset.id),
  userPassword: el => userPasswordForm(el.dataset.id),
  deleteUser: el => removeUser(el.dataset.id),
  newRole: () => roleForm(),
  editRole: el => roleForm(el.dataset.id),
  deleteRole: el => removeRole(el.dataset.id),
  astTab(el) { ui.ast.tab = el.dataset.tab; renderAssets(); },
  newAsset: () => assetForm(),
  editAsset: el => assetForm(el.dataset.id),
  deleteAsset: el => removeAsset(el.dataset.id),
  viewAssetImage: el => viewAssetImage(el.dataset.id),
  removeAssetImage,
  newPlan: () => planForm(),
  editPlan: el => planForm(el.dataset.id),
  deletePlan: el => removePlan(el.dataset.id),
  exportAssets,
  exportPlans,
  newExpense: () => expenseForm(),
  editExpense: el => expenseForm(el.dataset.id),
  deleteExpense: el => removeExpense(el.dataset.id),
  exportExpenses,
  newDiscount: () => discountForm(),
  editDiscount: el => discountForm(el.dataset.id),
  toggleDiscount: el => toggleDiscount(el.dataset.id),
  deleteDiscount: el => removeDiscount(el.dataset.id),
  pickAll: () => pickSet(true),
  pickNone: () => pickSet(false),
  genPassword(el) { const i = el.closest('.pw-row').querySelector('input'); i.type = 'text'; i.value = randomPassword(); i.focus(); i.select(); },
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
    const e = priceOf(p);   // el precio con descuento (el servidor lo vuelve a calcular al vender)
    if (it) it.qty++; else pos.cart.push({pid: p.id, name: p.name, size, qty: 1, price: e.price, listPrice: e.list, offer: e.name});
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
  /* Misma estructura que la hoja de Excel: SKU · Modelo · Color · Talla · Costo · Precio venta · Stock Inicial · Vendidos · Stock actual · Ganancia unidad · Valor Inventario · Estado */
  exportInv: () => run(null, async () => {
    const data = (await store.variantReport()).sort((a, b) => a.sku.localeCompare(b.sku, 'es', {numeric: true}) || parseFloat(a.size) - parseFloat(b.size));
    const rows = [['SKU', 'Modelo', 'Color', 'Talla', 'Costo', 'Precio venta', 'Stock Inicial', 'Vendidos', 'Stock actual', 'Ganancia unidad', 'Valor Inventario', 'Estado']];
    data.forEach(r => rows.push([r.sku, r.model, r.color, r.size, r.cost, r.price, r.initial, r.sold, r.stock, r.unitProfit, r.inventoryValue, r.status]));
    download(`inventario-${dayKey(new Date())}.csv`, toCSV(rows), 'text/csv;charset=utf-8');
  }),
  exportSales() {
    const rows = [['N.º', 'Fecha', 'Cliente', 'Observación', 'Vendedor', 'Cajero', 'Pago', 'Estado', 'SKU', 'Producto', 'Talla', 'Cantidad', 'Precio', 'Precio lista', 'Oferta', 'Total venta', 'Descuento']];
    state.sales.forEach(s => s.items.forEach(i => rows.push(['V-' + pad(s.num, 4), fmtDate(s.date), s.customer, s.note || '', s.seller || '', s.cashier || '', s.method, s.status, i.sku, i.name, i.size, i.qty, i.price, i.listPrice ?? i.price, i.discountName || '', s.total, s.discount])));
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
