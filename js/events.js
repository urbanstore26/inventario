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
    else if (f.dataset.form === 'user-new') await saveUserNew(f);
    else if (f.dataset.form === 'user-edit') await saveUserEdit(f);
    else if (f.dataset.form === 'user-pass') await saveUserPassword(f);
    else if (f.dataset.form === 'role') await saveRole(f);
    else if (f.dataset.form === 'discount') await saveDiscountForm(f);
    else if (f.dataset.form === 'asset') await saveAssetForm(f);
    else if (f.dataset.form === 'plan') await savePlanForm(f);
    else if (f.dataset.form === 'exchange') await saveExchangeForm();
    else if (f.dataset.form === 'expense') await saveExpenseForm(f);
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
  if (t.form && t.form.dataset.form === 'discount' && (t.name === 'dkind' || t.name === 'dvalue')) drawPick();   // vista previa de precios
  if (t.dataset && t.dataset.xf === 'qty') return xfField(t);      // cambios y devoluciones: cantidades
  if (t.dataset && t.dataset.xs) return xfSaleQty(t);
  switch (t.id) {
    case 'invQ': ui.inv.q = t.value; drawInv(); break;
    case 'movQ': ui.mov.q = t.value; drawMov(); break;
    case 'usrQ': ui.usr.q = t.value; drawUsers(); break;
    case 'dscQ': ui.dsc.q = t.value; drawDiscounts(); break;
    case 'astQ': ui.ast.q = t.value; drawAssetRows(); break;
    case 'evQ': ui.ast.evq = t.value; drawHistoryRows(); break;
    case 'exQ': ui.ast.exq = t.value; drawExpenseRows(); break;
    case 'xcQ': ui.exc.q = t.value; drawExchangeRows(); break;
    case 'xfCustomer': if (xf) xf.customer = t.value; break;
    case 'xfSq': case 'xfDate': case 'xfFrom': case 'xfTo': xfFind(t); break;
    case 'xfNote': if (xf) xf.note = t.value; break;
    case 'pickQ': drawPick(); break;
    case 'posQ': pos.q = t.value; drawPosResults(); break;
    case 'posDisc': pos.discount = t.value; updatePosTotals(); break;
    case 'posPaid': pos.paid = t.value; updatePosTotals(); break;
    case 'posCustomer': pos.customer = t.value; break;
    case 'posNote': pos.note = t.value; break;
    case 'mvType': $('#mvQtyLabel').textContent = t.value === 'ajuste' ? 'Nueva cantidad (conteo)' : 'Cantidad'; break;
  }
});
document.addEventListener('change', e => {
  const t = e.target, map = {invCat: ['inv', 'cat'], invBrand: ['inv', 'brand'], invStatus: ['inv', 'status'], movType: ['mov', 'type'], salFrom: ['sal', 'from'], salTo: ['sal', 'to'], salFromT: ['sal', 'fromT'], salToT: ['sal', 'toT'], salMethod: ['sal', 'method'], salStatus: ['sal', 'status']};
  if (map[t.id]) { ui[map[t.id][0]][map[t.id][1]] = t.value; ({inv: drawInv, mov: drawMov, sal: drawSales})[map[t.id][0]](); }
  else if (t.id === 'mvProduct') { ui.mov.pid = t.value; fillMoveSizes(); }
  else if (t.id === 'posMethod') { pos.method = t.value; drawCart(); }
  else if (t.id === 'posSeller') pos.seller = t.value;
  else if (t.dataset && t.dataset.pick) pickToggle(t.dataset.pick, t.checked);
  else if (t.id === 'pickCat') drawPick();
  else if (t.id === 'tkWidth') setTicketWidth(t.value);
  else if (t.dataset && t.dataset.xf) xfField(t);
  else if (['xfReason', 'xfMethod'].includes(t.id)) xfChoose(t.id, t.value);
  else if (t.id === 'xcReason') { ui.exc.reason = t.value; drawExchangeRows(); }
  else if (t.id === 'pImage') run(null, () => pickProductImage(t));
  else if (t.id === 'aImage') run(null, () => pickAssetImage(t));
  else if (t.id === 'astCat') { ui.ast.cat = t.value; drawAssetRows(); }
  else if (t.id === 'astStatus') { ui.ast.status = t.value; drawAssetRows(); }
  else if (t.id === 'astPlan') { ui.ast.plan = t.value; drawAssetRows(); }
  else if (t.id === 'evKind') { ui.ast.evkind = t.value; drawHistoryRows(); }
  else if (t.id === 'exKind') { ui.ast.exkind = t.value; drawExpenseRows(); }
  else if (t.id === 'exPlan') { ui.ast.explan = t.value; drawExpenseRows(); }
  else if (t.id === 'exMonth') { ui.ast.exmonth = t.value; drawExpenseRows(); }
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
