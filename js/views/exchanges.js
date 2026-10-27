'use strict';
/* Vista: Cambios y devoluciones (pestaña de Movimientos). Cuando un cliente vuelve por un cambio de talla, por otro
   producto o por un producto dañado, se registra aquí: el stock se mueve solo y queda el comprobante del cambio. */

const EXCHANGE_REASONS = {
  cambio_talla:     {label: 'Cambio de talla',                       cls: 'b-info',    gives: true,  same: true},
  cambio_producto:  {label: 'Cambio por otro producto',              cls: 'b-info',    gives: true,  same: false},
  danado_cambio:    {label: 'Producto dañado: cambio por uno igual', cls: 'b-low',     gives: true,  same: true},
  danado_reembolso: {label: 'Producto dañado: reembolso',            cls: 'b-out',     gives: false, same: false},
  devolucion:       {label: 'Devolución con reembolso',              cls: 'b-neutral', gives: false, same: false}
};
const PAY_METHODS = ['Efectivo', 'Tarjeta', 'Transferencia'];
const exCode = e => 'C-' + pad(e.num, 4);
const saleExchanges = saleId => state.exchanges.filter(e => e.saleId === saleId).sort((a, b) => a.num - b.num);
const exSummary = (e, dir) => e.items.filter(i => i.dir === dir).map(i => `${i.qty} × ${esc(i.name)} · T${esc(i.size)}${i.condition === 'danado' ? ' (dañado)' : ''}`).join('<br>') || '<span class="muted">—</span>';

/* ---------- Pestaña: lista de cambios ---------- */
function renderExchangesTab() {
  const f = ui.exc, now = dayKey(new Date()).slice(0, 7);
  const month = state.exchanges.filter(e => dayKey(e.date).slice(0, 7) === now);
  const bad = month.reduce((a, e) => a + e.items.filter(i => i.dir === 'devuelto' && i.condition === 'danado').reduce((n, i) => n + i.qty, 0), 0);
  const paid = month.filter(e => e.difference > 0).reduce((a, e) => a + e.difference, 0), back = month.filter(e => e.difference < 0).reduce((a, e) => a - e.difference, 0);
  $('#movBody').innerHTML = `
  ${state.exchangesError ? `<div class="card notice"><b>No se pudo cargar los cambios y devoluciones.</b><br>${state.exchangesError === 'missing' ? 'Falta ejecutar en Supabase la migración <code>20261028100000_exchanges.sql</code> (SQL Editor) y recargar la aplicación.' : esc(state.exchangesError)}</div>` : ''}
  <div class="grid kpis">
    <div class="card kpi hi"><div class="l">Cambios este mes</div><div class="v num">${month.length}</div><div class="s">${state.exchanges.length} en total</div></div>
    <div class="card kpi"><div class="l">Productos dañados</div><div class="v num">${bad}</div><div class="s">pares este mes</div></div>
    <div class="card kpi"><div class="l">Cobrado por diferencias</div><div class="v num">${money(paid)}</div><div class="s">este mes</div></div>
    <div class="card kpi"><div class="l">Devuelto a clientes</div><div class="v num">${money(back)}</div><div class="s">este mes</div></div>
  </div>
  <div class="toolbar">
    <input class="grow" id="xcQ" type="search" placeholder="Buscar cliente, producto, N.º de cambio o de venta…" value="${esc(f.q)}">
    <select id="xcReason"><option value="">Todos los motivos</option>${Object.entries(EXCHANGE_REASONS).map(([k, v]) => `<option value="${k}"${f.reason === k ? ' selected' : ''}>${v.label}</option>`).join('')}</select>
    ${can('reports.export') ? '<button class="btn" data-action="exportExchanges">Exportar CSV</button>' : ''}${can('exchanges.create') ? '<button class="btn primary" data-action="newExchange">+ Registrar cambio</button>' : ''}
  </div>
  <div id="xcTable"></div>`;
  drawExchangeRows();
}
function drawExchangeRows() {
  const f = ui.exc, q = f.q.trim().toLowerCase();
  const rows = state.exchanges.filter(e => (!f.reason || e.reason === f.reason) &&
    (!q || `${exCode(e)} ${e.saleNum ? 'v-' + pad(e.saleNum, 4) : ''} ${e.customer} ${e.note} ${e.by} ${e.items.map(i => i.name + ' ' + i.sku).join(' ')}`.toLowerCase().includes(q)));
  $('#xcTable').innerHTML = rows.length ? `<div class="tablewrap"><table>
    <thead><tr><th>N.º</th><th>Fecha</th><th>Motivo</th><th>Devuelve</th><th>Se lleva</th><th class="right">Diferencia</th><th>Venta</th><th></th></tr></thead>
    <tbody>${rows.slice(0, 300).map(e => {
      const r = EXCHANGE_REASONS[e.reason] || {label: e.reason, cls: 'b-neutral'};
      return `<tr><td class="num"><b>${exCode(e)}</b></td><td class="num">${fmtDate(e.date)}</td>
        <td><span class="badge ${r.cls}">${r.label}</span>${e.customer ? `<div class="meta">Cliente: ${esc(e.customer)}</div>` : ''}${e.note ? `<div class="meta">Obs.: ${esc(e.note)}</div>` : ''}</td>
        <td>${exSummary(e, 'devuelto')}</td><td>${exSummary(e, 'entregado')}</td>
        <td class="num right">${e.difference ? `<b>${e.difference > 0 ? '+' : '−'}${money(Math.abs(e.difference))}</b><div class="meta">${e.difference > 0 ? 'cobrado' : 'devuelto'}${e.method ? ' · ' + esc(e.method) : ''}</div>` : '<span class="muted">Sin diferencia</span>'}</td>
        <td class="num">${e.saleNum ? 'V-' + pad(e.saleNum, 4) : '<span class="muted">Sin venta</span>'}${e.by ? `<div class="meta">${esc(e.by)}</div>` : ''}</td>
        <td class="right"><button class="btn sm" data-action="viewExchange" data-id="${esc(e.id)}">Ver</button></td></tr>`;
    }).join('')}</tbody></table></div><p class="muted">${rows.length} ${rows.length === 1 ? 'cambio' : 'cambios'}</p>`
    : `<div class="card empty">${state.exchanges.length ? 'Ningún cambio coincide con los filtros.' : 'Aún no hay cambios ni devoluciones.' + (can('exchanges.create') ? ' Cuando un cliente venga por un cambio de talla o un producto dañado, regístralo con “Registrar cambio”.' : '')}</div>`;
}

/* ---------- Formulario ---------- */
let xf = null;   // borrador del formulario
const newXf = () => ({saleId: '', find: {date: '', from: '', to: '', q: ''}, reason: 'cambio_talla', saleQty: {}, returned: [{pid: '', size: '', qty: 1}], delivered: [{pid: '', size: '', qty: 1}], method: 'Efectivo', customer: '', note: ''});

function returnedBefore(saleId, pid, size) {
  return saleExchanges(saleId).reduce((a, e) => a + e.items.filter(i => i.dir === 'devuelto' && i.pid === pid && i.size === size).reduce((n, i) => n + i.qty, 0), 0);
}
/* Artículos de una venta, juntos por producto y talla, con lo que todavía se puede devolver */
function saleLines(sale) {
  const m = {};
  sale.items.forEach(i => {
    const k = i.pid + '|' + i.size, x = m[k] || (m[k] = {key: k, pid: i.pid, size: i.size, name: i.name, sku: i.sku, sold: 0, value: 0});
    x.sold += i.qty; x.value += i.qty * i.price;
  });
  return Object.values(m).map(x => ({...x, price: Math.round(x.value / x.sold * 100) / 100, left: x.sold - returnedBefore(sale.id, x.pid, x.size)}));
}
const xfSale = () => xf.saleId ? state.sales.find(s => s.id === xf.saleId) : null;
function xfReturnedLines() {
  const s = xfSale();
  if (s) return saleLines(s).map(l => ({pid: l.pid, size: l.size, qty: Math.floor(Number(xf.saleQty[l.key]) || 0), price: l.price, name: l.name})).filter(l => l.qty > 0);
  return xf.returned.map(l => ({...l, qty: Math.floor(Number(l.qty) || 0), p: getProduct(l.pid)})).filter(l => l.p && l.size && l.qty > 0).map(l => ({pid: l.pid, size: l.size, qty: l.qty, price: priceOf(l.p).price, name: l.p.name}));
}
function xfDeliveredLines() {
  if (!EXCHANGE_REASONS[xf.reason].gives) return [];
  return xf.delivered.map(l => ({...l, qty: Math.floor(Number(l.qty) || 0), p: getProduct(l.pid)})).filter(l => l.p && l.size && l.qty > 0).map(l => ({pid: l.pid, size: l.size, qty: l.qty, price: priceOf(l.p).price, name: l.p.name}));
}
const lineTotal = lines => Math.round(lines.reduce((a, l) => a + l.price * l.qty, 0) * 100) / 100;

function exchangeForm(saleId) {
  xf = newXf();
  if (saleId) { xf.saleId = saleId; const s = xfSale(); if (s) { xf.customer = s.customer || ''; const l = saleLines(s).filter(x => x.left > 0); if (l.length === 1) xf.saleQty[l[0].key] = 1; } }
  openModal(`<h2>Registrar cambio o devolución</h2>
  <form data-form="exchange">
    <div class="form-grid">
      <label class="f" style="grid-column:1/-1">Motivo<select id="xfReason">${Object.entries(EXCHANGE_REASONS).map(([k, v]) => `<option value="${k}"${xf.reason === k ? ' selected' : ''}>${v.label}</option>`).join('')}</select></label>
    </div>
    <h3 class="xf-h">Venta original</h3>
    <div id="xfSaleBox"></div>
    <h3 class="xf-h">Devuelve el cliente</h3><div id="xfReturned"></div>
    <h3 class="xf-h" id="xfGivesHead">Se lleva a cambio</h3><div id="xfDelivered"></div>
    <div id="xfSummary"></div>
    <div class="form-grid" style="margin-top:12px">
      <label class="f">Cliente (opcional)<input id="xfCustomer" maxlength="120" value="${esc(xf.customer)}"></label>
      <label class="f">Observación (opcional)<input id="xfNote" maxlength="200" value="${esc(xf.note)}" placeholder="Ej. suela despegada, talla le quedó grande"></label>
    </div>
    <div class="foot"><button type="button" class="btn" data-action="closeModal">Cancelar</button><button class="btn primary">Registrar cambio</button></div>
  </form>`, true);
  drawXfSale(); drawXf();
}

/* ---------- Buscar la venta original por fecha y hora ---------- */
const hm = d => { d = new Date(d); return pad(d.getHours()) + ':' + pad(d.getMinutes()); };
/* ¿la hora del día de la venta está dentro del rango? (rango vacío = cualquiera; si "desde" es mayor que "hasta", cruza la medianoche) */
function timeInRange(date, from, to) {
  if (!from && !to) return true;
  const t = hm(date);
  if (from && to && from > to) return t >= from || t <= to;
  return (!from || t >= from) && (!to || t <= to);
}
function xfFoundSales() {
  const f = xf.find, q = f.q.trim().toLowerCase();
  return state.sales.filter(s => s.status === 'completada' && (!f.date || dayKey(s.date) === f.date) && timeInRange(s.date, f.from, f.to) &&
    (!q || `v-${pad(s.num, 4)} ${s.num} ${s.customer} ${s.seller} ${s.items.map(i => i.name + ' ' + i.sku).join(' ')}`.toLowerCase().includes(q)));
}
function drawXfSale() {
  const box = $('#xfSaleBox'); if (!box) return;
  const s = xfSale();
  if (s) {
    box.innerHTML = `<div class="xf-sale"><div><b>V-${pad(s.num, 4)}</b> · ${esc(fmtDate(s.date))} · ${money(s.total)}<div class="meta">${s.items.map(i => `${i.qty} × ${esc(i.name)} T${esc(i.size)}`).join(' · ')}${s.customer ? ' · Cliente: ' + esc(s.customer) : ''}</div></div>
      <button type="button" class="btn sm" data-action="xfClearSale">Cambiar venta</button></div>`;
    return;
  }
  const f = xf.find;
  box.innerHTML = `<p class="muted" style="margin:0 0 8px">Busca la venta por el día y la hora en que se hizo, o por el número, el cliente o el producto. Sin venta, se usa el precio actual del producto.</p>
    <div class="form-grid xf-find">
      <label class="f">Día<input type="date" id="xfDate" value="${esc(f.date)}"></label>
      <label class="f">Hora desde<input type="time" id="xfFrom" value="${esc(f.from)}"></label>
      <label class="f">Hora hasta<input type="time" id="xfTo" value="${esc(f.to)}"></label>
      <label class="f">N.º, cliente o producto<input type="search" id="xfSq" value="${esc(f.q)}" placeholder="V-0026, Marta, Air Max…" autocomplete="off"></label>
    </div><div id="xfSales"></div>`;
  drawXfResults();
}
function drawXfResults() {
  const el = $('#xfSales'); if (!el) return;
  const all = xfFoundSales(), list = all.slice(0, 12);
  el.innerHTML = list.length ? `<div class="xf-results">${list.map(s => {
    const done = saleLines(s).every(l => l.left <= 0), n = saleExchanges(s.id).length;
    return `<button type="button" class="xf-res" data-action="xfPickSale" data-id="${esc(s.id)}"${done ? ' disabled' : ''}>
      <span><b>V-${pad(s.num, 4)}</b> · ${esc(fmtDate(s.date))}${n ? ` <span class="badge b-info">${n} ${n === 1 ? 'cambio' : 'cambios'}</span>` : ''}${done ? ' <span class="badge b-neutral">Ya devuelta</span>' : ''}<br>
        <span class="meta">${s.items.map(i => `${i.qty} × ${esc(i.name)} T${esc(i.size)}`).join(' · ')}${s.customer ? ' · ' + esc(s.customer) : ''}</span></span>
      <span class="num">${money(s.total)}</span></button>`;
  }).join('')}</div>${all.length > list.length ? `<p class="muted">Mostrando ${list.length} de ${all.length} ventas: afina el día o la hora.</p>` : ''}`
    : '<div class="card empty" style="margin:0">No hay ventas con ese día, hora o texto.</div>';
}
function xfFind(el) {
  if (!xf) return;
  xf.find[{xfDate: 'date', xfFrom: 'from', xfTo: 'to', xfSq: 'q'}[el.id]] = el.value;
  drawXfResults();
}
function xfPickSale(id) {
  if (!xf) return;
  xf.saleId = id; xf.saleQty = {};
  const s = xfSale();
  if (s) { if (s.customer) { xf.customer = s.customer; $('#xfCustomer').value = s.customer; } const l = saleLines(s).filter(x => x.left > 0); if (l.length === 1) xf.saleQty[l[0].key] = 1; }
  drawXfSale(); drawXf();
}
function xfClearSale() { if (!xf) return; xf.saleId = ''; xf.saleQty = {}; drawXfSale(); drawXf(); }

const productOptions = sel => '<option value="">Elige el producto…</option>' + [...state.products].sort((a, b) => a.name.localeCompare(b.name))
  .map(p => `<option value="${esc(p.id)}"${p.id === sel ? ' selected' : ''}>${esc(p.sku)} · ${esc(p.name)}${p.color ? ' · ' + esc(p.color) : ''}</option>`).join('');
function sizeOptions(pid, sel, onlyStock) {
  const p = getProduct(pid); if (!p) return '<option value="">Talla</option>';
  const sizes = onlyStock ? sizesFor(p).filter(s => (p.stock[s] || 0) > 0) : sizesFor(p);
  if (!sizes.length) return '<option value="">Sin stock</option>';
  return '<option value="">Talla</option>' + sizes.map(s => `<option value="${esc(s)}"${s === sel ? ' selected' : ''}>${esc(s)}${onlyStock ? ` (${p.stock[s]})` : ''}</option>`).join('');
}
function lineEditor(kind) {
  const list = xf[kind], onlyStock = kind === 'delivered';
  return list.map((l, i) => `<div class="xl" data-k="${kind}" data-i="${i}">
    <select data-xf="pid" aria-label="Producto">${productOptions(l.pid)}</select>
    <select data-xf="size" aria-label="Talla">${sizeOptions(l.pid, l.size, onlyStock)}</select>
    <input data-xf="qty" type="number" min="1" step="1" value="${esc(l.qty)}" aria-label="Cantidad">
    ${list.length > 1 ? `<button type="button" class="btn sm danger" data-action="xfRemove" data-k="${kind}" data-i="${i}">Quitar</button>` : '<span></span>'}
  </div>`).join('') + `<button type="button" class="btn sm" data-action="xfAdd" data-k="${kind}">+ Agregar otro artículo</button>`;
}
function drawXf() {
  const s = xfSale(), gives = EXCHANGE_REASONS[xf.reason].gives;
  $('#xfReturned').innerHTML = s ? `<div class="tablewrap" style="margin:0"><table><thead><tr><th>Artículo de la venta V-${pad(s.num, 4)}</th><th class="right">Vendidos</th><th class="right">Ya devueltos</th><th class="right">Devuelve</th></tr></thead><tbody>
      ${saleLines(s).map(l => `<tr><td><div class="name">${esc(l.name)}</div><div class="meta">Talla ${esc(l.size)} · pagó ${money(l.price)}</div></td><td class="num right">${l.sold}</td><td class="num right">${l.sold - l.left}</td>
        <td class="right">${l.left > 0 ? `<input class="xs" data-xs="${esc(l.key)}" type="number" min="0" max="${l.left}" step="1" value="${esc(xf.saleQty[l.key] || 0)}" aria-label="Pares que devuelve">` : '<span class="muted">Ya devuelto</span>'}</td></tr>`).join('')}</tbody></table></div>`
    : lineEditor('returned');
  $('#xfGivesHead').hidden = !gives; $('#xfDelivered').hidden = !gives;
  if (gives) $('#xfDelivered').innerHTML = lineEditor('delivered');
  drawXfSummary();
}
function drawXfSummary() {
  const ret = xfReturnedLines(), del = xfDeliveredLines(), rv = lineTotal(ret), dv = lineTotal(del), diff = Math.round((dv - rv) * 100) / 100;
  $('#xfSummary').innerHTML = `<div class="xf-sum">
    <div class="r"><span class="muted">Valor de lo que devuelve</span><span class="num">${money(rv)}</span></div>
    ${EXCHANGE_REASONS[xf.reason].gives ? `<div class="r"><span class="muted">Valor de lo que se lleva</span><span class="num">${money(dv)}</span></div>` : ''}
    <div class="r grand"><span>${diff > 0 ? 'El cliente paga' : diff < 0 ? 'Se devuelve al cliente' : 'Diferencia'}</span><span class="num">${diff === 0 ? 'Sin diferencia' : money(Math.abs(diff))}</span></div>
    ${diff !== 0 ? `<label class="f" style="margin-top:8px">${diff > 0 ? 'Cómo paga la diferencia' : 'Cómo se le devuelve el dinero'}<select id="xfMethod">${PAY_METHODS.map(m => `<option${xf.method === m ? ' selected' : ''}>${m}</option>`).join('')}</select></label>` : ''}
  </div>`;
}

/* Cambios que hacen los campos del formulario (los llama events.js) */
function xfField(el) {
  if (!xf) return;
  const row = el.closest('.xl'), k = row.dataset.k, i = +row.dataset.i, f = el.dataset.xf, l = xf[k][i];
  l[f] = el.value;
  if (f === 'pid') { l.size = ''; const p = getProduct(el.value), sizes = p ? (k === 'delivered' ? sizesFor(p).filter(s => (p.stock[s] || 0) > 0) : sizesFor(p)) : []; if (sizes.length === 1) l.size = sizes[0]; }
  if (f === 'qty') return drawXfSummary();   // al escribir la cantidad no se redibuja el campo
  $('#xf' + (k === 'returned' ? 'Returned' : 'Delivered')).innerHTML = lineEditor(k); drawXfSummary();
}
function xfSaleQty(el) { if (!xf) return; xf.saleQty[el.dataset.xs] = el.value; drawXfSummary(); }
function xfAddLine(k) { xf[k].push({pid: '', size: '', qty: 1}); $('#xf' + (k === 'returned' ? 'Returned' : 'Delivered')).innerHTML = lineEditor(k); }
function xfRemoveLine(k, i) { xf[k].splice(i, 1); $('#xf' + (k === 'returned' ? 'Returned' : 'Delivered')).innerHTML = lineEditor(k); drawXfSummary(); }
function xfChoose(id, value) {
  if (!xf) return;
  if (id === 'xfReason') { xf.reason = value; drawXf(); }
  else if (id === 'xfMethod') xf.method = value;
}

async function saveExchangeForm() {
  const ret = xfReturnedLines(), del = xfDeliveredLines(), r = EXCHANGE_REASONS[xf.reason];
  if (!ret.length) throw new Error('Indica qué devuelve el cliente (producto, talla y cantidad)');
  if (r.gives && !del.length) throw new Error('Indica qué se lleva el cliente a cambio');
  if (r.same && del.some(d => !ret.some(x => x.pid === d.pid))) throw new Error('En este tipo de cambio el producto que se lleva debe ser el mismo que devuelve');
  const need = {}; del.forEach(d => { const k = d.pid + '|' + d.size; need[k] = (need[k] || 0) + d.qty; });
  for (const [k, q] of Object.entries(need)) { const [pid, size] = k.split('|'), p = getProduct(pid); if ((p.stock[size] || 0) < q) throw new Error(`No hay stock suficiente de ${p.name} talla ${size} (disponible ${p.stock[size] || 0})`); }
  const diff = Math.round((lineTotal(del) - lineTotal(ret)) * 100) / 100;
  const ex = await store.registerExchange({saleId: xf.saleId || null, reason: xf.reason, returned: ret.map(l => ({pid: l.pid, size: l.size, qty: l.qty})), delivered: del.map(l => ({pid: l.pid, size: l.size, qty: l.qty})),
    method: diff !== 0 ? xf.method : null, customer: xf.customer, note: xf.note});
  xf = null; closeModal(); toast('Cambio registrado ' + exCode(ex)); refresh();
  showExchange(ex.id);
}

/* ---------- El ticket de la venta refleja sus cambios ---------- */
function exchangesBlock(s) {
  const exs = saleExchanges(s.id);
  if (!exs.length) return '';
  const row = (l, r, cls = '') => `<div class="tk-row ${cls}"><span>${l}</span><span>${r}</span></div>`;
  const net = Math.round(exs.reduce((a, e) => a + e.difference, 0) * 100) / 100;
  return `<div class="tk-sep"></div><div class="tk-small"><b>CAMBIOS REGISTRADOS</b></div>` + exs.map(e => `<div class="tk-item">
      <div class="tk-small">${exCode(e)} · ${fmtDate(e.date)}</div><div class="tk-small">${esc((EXCHANGE_REASONS[e.reason] || {}).label || e.reason)}</div>
      ${e.items.map(i => `<div class="tk-small">${i.dir === 'devuelto' ? 'Devolvió' : 'Se llevó'}: ${i.qty} × ${esc(i.name)} · T${esc(i.size)}${i.condition === 'danado' ? ' (dañado)' : ''}</div>`).join('')}
      ${e.difference ? row(e.difference > 0 ? 'Diferencia cobrada' : 'Reembolso', (e.difference > 0 ? '' : '-') + money(Math.abs(e.difference))) : ''}</div>`).join('')
    + (net ? `<div class="tk-sep"></div>${row('Total original', money(s.total))}${row('Ajuste por cambios', (net > 0 ? '+' : '-') + money(Math.abs(net)))}${row('TOTAL NETO', money(s.total + net), 'tk-total')}` : '');
}

/* ---------- Comprobante ---------- */
function exchangeReceiptHTML(e) {
  const name = state.settings.storeName, row = (l, r, cls = '') => `<div class="tk-row ${cls}"><span>${l}</span><span>${r}</span></div>`;
  const lines = dir => e.items.filter(i => i.dir === dir).map(i => `<div class="tk-item"><div>${esc(i.name)}</div>${i.sku ? `<div class="tk-small tk-sku">Cód. ${esc(i.sku)}</div>` : ''}${row(`${i.qty} × ${money(i.price)} · T${esc(i.size)}${i.condition === 'danado' ? ' · dañado' : ''}`, money(i.qty * i.price))}</div>`).join('');
  return `<div class="ticket" data-w="${ticketMm()}">
    <img class="tk-logo" src="assets/logo-wordmark.png" alt="${esc(name)}">
    <div class="tk-store">${esc(name.toUpperCase())}</div>
    <div class="tk-center">Comprobante de cambio ${exCode(e)}<br>${fmtDate(e.date)}</div>
    <div class="tk-center"><b>${esc((EXCHANGE_REASONS[e.reason] || {}).label || e.reason)}</b></div>
    ${e.saleNum ? `<div class="tk-center tk-small">Venta original V-${pad(e.saleNum, 4)}</div>` : ''}
    <div class="tk-sep"></div>
    <div class="tk-small"><b>DEVUELVE</b></div>${lines('devuelto')}
    ${e.items.some(i => i.dir === 'entregado') ? `<div class="tk-sep"></div><div class="tk-small"><b>SE LLEVA</b></div>${lines('entregado')}` : ''}
    <div class="tk-sep"></div>
    ${e.difference ? row(e.difference > 0 ? 'Cliente paga' : 'Se devuelve', money(Math.abs(e.difference)), 'tk-total') + (e.method ? row('Forma', esc(e.method)) : '') : row('Diferencia', 'Sin diferencia')}
    ${e.customer ? row('Cliente', esc(e.customer)) : ''}
    ${e.note ? `<div class="tk-small tk-note">Obs.: ${esc(e.note)}</div>` : ''}
    ${e.by ? row('Atendió', esc(e.by)) : ''}
    <div class="tk-sep"></div>
    <div class="tk-center tk-small">Conserva este comprobante</div>
  </div>`;
}
function showExchange(id) {
  const e = state.exchanges.find(x => x.id === id); if (!e) return;
  const mm = ticketMm();
  openModal(`<div class="tk-toolbar no-print"><label class="f">Papel de la impresora
      <select id="tkWidth"><option value="80"${mm === '80' ? ' selected' : ''}>Rollo de 80 mm (estándar)</option><option value="58"${mm === '58' ? ' selected' : ''}>Rollo de 58 mm (angosto)</option></select></label></div>
    <div class="ticket-wrap">${exchangeReceiptHTML(e)}</div>
    <div class="foot no-print"><button class="btn" data-action="closeModal">Cerrar</button>${e.saleId ? `<button class="btn" data-action="viewSale" data-id="${esc(e.saleId)}">Ver ticket de la venta</button>` : ''}<button class="btn primary" data-action="printReceipt">Imprimir comprobante</button></div>`);
}

function exportExchanges() {
  const rows = [['N.º', 'Fecha', 'Motivo', 'Venta original', 'Cliente', 'Devuelve', 'Se lleva', 'Diferencia', 'Forma de pago', 'Atendió', 'Observación']];
  [...state.exchanges].sort((a, b) => a.num - b.num).forEach(e => {
    const txt = dir => e.items.filter(i => i.dir === dir).map(i => `${i.qty} x ${i.name} T${i.size}${i.condition === 'danado' ? ' (dañado)' : ''}`).join('; ');
    rows.push([exCode(e), fmtDate(e.date), (EXCHANGE_REASONS[e.reason] || {}).label || e.reason, e.saleNum ? 'V-' + pad(e.saleNum, 4) : '', e.customer, txt('devuelto'), txt('entregado'), e.difference, e.method || '', e.by, e.note]);
  });
  download(`cambios-y-devoluciones-${dayKey(new Date())}.csv`, toCSV(rows), 'text/csv;charset=utf-8');
}
