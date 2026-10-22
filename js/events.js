'use strict';
/* Listeners globales (click, submit, input, change, teclado) */

document.addEventListener('click', e => {
  const el = e.target.closest('[data-action]');
  if (el && ACTIONS[el.dataset.action]) ACTIONS[el.dataset.action](el, e);
});
document.addEventListener('submit', e => {
  const f = e.target.closest('form[data-form]'); if (!f) return;
  e.preventDefault();
  if (f.dataset.form === 'login') return doLogin(f);
  run(f.querySelector('button:not([type=button])'), async () => {
    if (f.dataset.form === 'product') await saveProduct(f);
    else if (f.dataset.form === 'move') await saveMove(f);
    else if (f.dataset.form === 'settings') {
      const sizes = sortSizes([...new Set(f.elements.sizes.value.split(',').map(s => s.trim()).filter(Boolean))]);
      if (!sizes.length) throw new Error('Indica al menos una talla');
      await store.saveSettings({storeName: f.elements.storeName.value.trim(), threshold: Number(f.elements.threshold.value), sizes});
      toast('Ajustes guardados'); refresh();
    }
  });
});
document.addEventListener('input', e => {
  const t = e.target;
  switch (t.id) {
    case 'invQ': ui.inv.q = t.value; drawInv(); break;
    case 'movQ': ui.mov.q = t.value; drawMov(); break;
    case 'posQ': pos.q = t.value; drawPosResults(); break;
    case 'posDisc': pos.discount = t.value; updatePosTotals(); break;
    case 'posPaid': pos.paid = t.value; updatePosTotals(); break;
    case 'posCustomer': pos.customer = t.value; break;
    case 'mvType': $('#mvQtyLabel').textContent = t.value === 'ajuste' ? 'Nueva cantidad (conteo)' : 'Cantidad'; break;
  }
});
document.addEventListener('change', e => {
  const t = e.target, map = {invCat: ['inv', 'cat'], invBrand: ['inv', 'brand'], invStatus: ['inv', 'status'], movType: ['mov', 'type'], salFrom: ['sal', 'from'], salTo: ['sal', 'to'], salMethod: ['sal', 'method'], salStatus: ['sal', 'status']};
  if (map[t.id]) { ui[map[t.id][0]][map[t.id][1]] = t.value; ({inv: drawInv, mov: drawMov, sal: drawSales})[map[t.id][0]](); }
  else if (t.id === 'mvProduct') { ui.mov.pid = t.value; fillMoveSizes(); }
  else if (t.id === 'posMethod') { pos.method = t.value; drawCart(); }
  else if (t.id === 'tkWidth') setTicketWidth(t.value);
  else if (t.id === 'pImage') run(null, () => pickProductImage(t));
  else if (t.id === 'restoreFile' && t.files[0]) {
    const rd = new FileReader();
    rd.onload = () => {
      try {
        const d = JSON.parse(rd.result);
        if (!Array.isArray(d.products) || !Array.isArray(d.sales) || !Array.isArray(d.movements)) throw 0;
        if (!confirm('Se reemplazarán todos los datos actuales por los del respaldo. ¿Continuar?')) return;
        run(null, async () => { await store.restore(d); Object.assign(pos, {cart: [], sel: null}); toast('Respaldo restaurado'); refresh(); });
      } catch (err) { toast('El archivo no es un respaldo válido', true); }
    };
    rd.readAsText(t.files[0]); t.value = '';
  }
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeModal();
  if (e.key === 'Enter' && e.target.id === 'posQ') {
    const q = pos.q.trim().toLowerCase(), p = state.products.find(x => x.sku.toLowerCase() === q) || (q && state.products.filter(x => totalStock(x) > 0 && `${x.sku} ${x.name} ${x.brand}`.toLowerCase().includes(q)).length === 1 ? state.products.find(x => totalStock(x) > 0 && `${x.sku} ${x.name} ${x.brand}`.toLowerCase().includes(q)) : null);
    if (p) { pos.sel = p.id; drawPosResults(); drawPosSizes(); }
  }
});
window.addEventListener('hashchange', () => route());

/* Al volver a la pestaña, trae los cambios hechos desde otros equipos (solo con Supabase) */
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible' || !appReady || !store || store.mode !== 'supabase') return;
  if ($('#modalRoot').children.length || (location.hash === '#/pos' && pos.cart.length)) return;
  store.reload().then(() => route({keepScroll: true})).catch(() => {});
});
