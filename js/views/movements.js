'use strict';
/* Vista: Movimientos de stock */

function renderMovements() {
  const f = ui.mov, prods = [...state.products].sort((a, b) => a.name.localeCompare(b.name));
  $('#view').innerHTML = `
  <div class="card" style="margin-bottom:14px"><h3>Registrar movimiento</h3>
    <form data-form="move"><div class="form-grid">
      <label class="f">Producto<select id="mvProduct" name="pid" required><option value="">Selecciona…</option>${prods.map(p => `<option value="${p.id}"${p.id === f.pid ? ' selected' : ''}>${esc(p.sku)} — ${esc(p.name)} (${esc(p.brand)})</option>`).join('')}</select></label>
      <label class="f">Talla<select id="mvSize" name="size" required></select></label>
      <label class="f">Tipo<select id="mvType" name="type"><option value="entrada">Entrada (compra / reposición)</option><option value="salida">Salida (merma, daño, obsequio)</option><option value="ajuste">Ajuste (conteo físico)</option></select></label>
      <label class="f"><span id="mvQtyLabel">Cantidad</span><input name="qty" type="number" min="0" step="1" required></label>
      <label class="f" style="grid-column:1/-1">Nota<input name="note" placeholder="Ej. Factura proveedor #123"></label>
    </div><div style="margin-top:12px"><button class="btn primary">Registrar</button></div></form></div>
  <div class="toolbar">
    <input class="grow" id="movQ" type="search" placeholder="Buscar en el historial…" value="${esc(f.q)}">
    <select id="movType"><option value="">Todos los tipos</option>${Object.entries(MOVE_TYPES).map(([k, v]) => `<option value="${k}"${f.type === k ? ' selected' : ''}>${v.label}</option>`).join('')}</select>
    <button class="btn" data-action="exportMov">Exportar CSV</button>
  </div>
  <div id="movTable"></div>`;
  fillMoveSizes(); drawMov();
}
function fillMoveSizes() {
  const p = getProduct($('#mvProduct').value);
  $('#mvSize').innerHTML = p ? sizesFor(p).map(s => `<option value="${esc(s)}">${esc(s)} (stock ${p.stock[s] || 0})</option>`).join('') : '<option value="">—</option>';
}
function drawMov() {
  const f = ui.mov, q = f.q.trim().toLowerCase();
  const rows = state.movements.filter(m => (!f.type || m.type === f.type) && (!q || `${m.sku} ${m.name} ${m.note} ${m.size}`.toLowerCase().includes(q)));
  $('#movTable').innerHTML = rows.length ? `<div class="tablewrap"><table><thead><tr><th>Fecha</th><th>Producto</th><th>Talla</th><th>Tipo</th><th class="right">Cantidad</th><th class="right">Saldo</th><th>Nota</th></tr></thead><tbody>
    ${rows.slice(0, 200).map(m => `<tr><td class="num">${fmtDate(m.date)}</td><td><div class="name">${esc(m.name)}</div><div class="meta">${esc(m.sku)}</div></td><td class="num">${esc(m.size)}</td>
    <td><span class="badge ${MOVE_TYPES[m.type].cls}">${MOVE_TYPES[m.type].label}</span></td><td class="num right"><b>${m.qty > 0 ? '+' : ''}${m.qty}</b></td><td class="num right">${m.balance}</td><td class="muted">${esc(m.note)}</td></tr>`).join('')}
    </tbody></table></div>${rows.length > 200 ? `<p class="muted">Mostrando 200 de ${rows.length}. Exporta el CSV para ver todo.</p>` : ''}` : '<div class="card empty">Sin movimientos.</div>';
}
async function saveMove(form) {
  const p = getProduct(form.elements.pid.value), type = form.elements.type.value, size = form.elements.size.value, q = Math.floor(Number(form.elements.qty.value));
  if (!p || !size || isNaN(q) || q < 0) throw new Error('Completa producto, talla y cantidad');
  if (type !== 'ajuste' && q === 0) throw new Error('La cantidad debe ser mayor a 0');
  await store.move({pid: p.id, size, type, qty: q, note: form.elements.note.value.trim()});
  ui.mov.pid = p.id; toast('Movimiento registrado'); refresh();
}
