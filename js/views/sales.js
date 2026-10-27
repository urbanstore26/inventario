'use strict';
/* Vista: Historial de ventas */

function renderSales() {
  const f = ui.sal;
  $('#view').innerHTML = `
  <div class="toolbar">
    <label class="f">Desde<input type="date" id="salFrom" value="${esc(f.from)}"></label>
    <label class="f">Hasta<input type="date" id="salTo" value="${esc(f.to)}"></label>
    <label class="f">Hora desde<input type="time" id="salFromT" value="${esc(f.fromT)}"></label>
    <label class="f">Hora hasta<input type="time" id="salToT" value="${esc(f.toT)}"></label>
    <select id="salMethod"><option value="">Todos los pagos</option>${options(['Efectivo', 'Tarjeta', 'Transferencia'], f.method)}</select>
    <select id="salStatus"><option value="">Todas</option><option value="completada"${f.status === 'completada' ? ' selected' : ''}>Completadas</option><option value="anulada"${f.status === 'anulada' ? ' selected' : ''}>Anuladas</option></select>
    <span class="grow"></span>${can('reports.export') ? '<button class="btn" data-action="exportSales">Exportar CSV</button>' : ''}
  </div><div id="salTable"></div>`;
  drawSales();
}
function drawSales() {
  const f = ui.sal;
  const rows = state.sales.filter(s => (!f.from || dayKey(s.date) >= f.from) && (!f.to || dayKey(s.date) <= f.to) && timeInRange(s.date, f.fromT, f.toT) && (!f.method || s.method === f.method) && (!f.status || s.status === f.status));
  const ok = rows.filter(s => s.status === 'completada'), tot = ok.reduce((a, s) => a + s.total, 0), prof = ok.reduce((a, s) => a + s.total - s.cost, 0);
  $('#salTable').innerHTML = rows.length ? `<div class="tablewrap"><table><thead><tr><th>N.º</th><th>Fecha</th><th>Detalle</th><th>Pago</th><th class="right">Total</th>${can('costs.view') ? '<th class="right">Utilidad</th>' : ''}<th>Estado</th><th></th></tr></thead><tbody>
    ${rows.slice(0, 300).map(s => `<tr><td class="num"><b>V-${pad(s.num, 4)}</b></td><td class="num">${fmtDate(s.date)}</td>
      <td>${s.items.map(i => `${i.qty}× ${esc(i.name)} <span class="muted">T${esc(i.size)}</span>`).join('<br>')}${s.customer ? `<div class="meta">Cliente: ${esc(s.customer)}</div>` : ''}${s.note ? `<div class="meta">Obs.: ${esc(s.note)}</div>` : ''}${saleExchanges(s.id).length ? `<div class="meta">Cambios: ${saleExchanges(s.id).map(exCode).join(', ')}</div>` : ''}${s.seller ? `<div class="meta">Vendedor: ${esc(s.seller)}${s.cashier ? ' · Cajero: ' + esc(s.cashier) : ''}</div>` : ''}</td>
      <td>${esc(s.method)}</td><td class="num right"><b>${money(s.total)}</b></td>${can('costs.view') ? `<td class="num right">${money(s.total - s.cost)}</td>` : ''}
      <td><span class="badge ${s.status === 'completada' ? 'b-ok' : 'b-out'}">${s.status === 'completada' ? 'Completada' : 'Anulada'}</span></td>
      <td class="right"><button class="btn sm" data-action="viewSale" data-id="${s.id}">Ver</button></td></tr>`).join('')}</tbody></table></div>
    <p class="muted">${ok.length} ventas completadas · Total ${money(tot)}${can('costs.view') ? ` · Utilidad ${money(prof)}` : ''}</p>` : '<div class="card empty">No hay ventas con esos filtros.</div>';
}
async function voidSale(id) {
  const s = state.sales.find(x => x.id === id);
  if (!s || s.status !== 'completada' || !confirm(`¿Anular la venta V-${pad(s.num, 4)}? Los pares volverán al inventario.`)) return;
  await run(null, async () => { await store.voidSale(id); closeModal(); toast('Venta anulada'); refresh(); });
}
