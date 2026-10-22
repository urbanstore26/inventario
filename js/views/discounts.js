'use strict';
/* Vista: Descuentos. Una promoción tiene nombre, tipo (porcentaje o monto), valor, vigencia opcional
   y la lista de productos a los que aplica. El precio con descuento se ve en el punto de venta
   y lo vuelve a calcular el servidor al vender. */

const DISCOUNT_STATE = {
  active:    {label: 'Vigente',    cls: 'b-ok'},
  scheduled: {label: 'Programado', cls: 'b-info'},
  expired:   {label: 'Vencido',    cls: 'b-neutral'},
  paused:    {label: 'Pausado',    cls: 'b-neutral'}
};
let dscDraft = null;   // selección en curso dentro del formulario: {ids: Set de productos}

const shortDate = s => s ? new Date(s + 'T12:00:00').toLocaleDateString('es', {day: 'numeric', month: 'short'}) : '';
const validityText = d => d.startsOn && d.endsOn ? `${shortDate(d.startsOn)} – ${shortDate(d.endsOn)}` : d.startsOn ? `Desde ${shortDate(d.startsOn)}` : d.endsOn ? `Hasta ${shortDate(d.endsOn)}` : 'Sin fecha límite';

function renderDiscounts() {
  $('#view').innerHTML = `
  <div class="toolbar">
    <input class="grow" id="dscQ" type="search" placeholder="Buscar descuento o producto…" value="${esc(ui.dsc.q)}">
    <button class="btn primary" data-action="newDiscount">+ Nuevo descuento</button>
  </div>
  <div id="dscTable"></div>
  <p class="muted">Los productos con un descuento vigente salen con el precio rebajado en el punto de venta. Si un producto está en varias ofertas, se aplica la de menor precio (no se suman).</p>`;
  drawDiscounts();
}

function drawDiscounts() {
  const q = ui.dsc.q.trim().toLowerCase();
  const names = d => d.productIds.map(id => getProduct(id)).filter(Boolean);
  const rows = state.discounts.filter(d => !q || d.name.toLowerCase().includes(q) || names(d).some(p => `${p.name} ${p.sku}`.toLowerCase().includes(q)))
    .sort((a, b) => ['active', 'scheduled', 'paused', 'expired'].indexOf(discountState(a)) - ['active', 'scheduled', 'paused', 'expired'].indexOf(discountState(b)) || a.name.localeCompare(b.name));
  if (!rows.length) { $('#dscTable').innerHTML = `<div class="card empty">${state.discounts.length ? 'Ningún descuento coincide con la búsqueda.' : 'Aún no hay descuentos. Crea el primero con “Nuevo descuento” y elige los productos.'}</div>`; return; }
  $('#dscTable').innerHTML = `<div class="tablewrap"><table>
    <thead><tr><th>Descuento</th><th>Valor</th><th>Productos</th><th>Vigencia</th><th>Estado</th><th></th></tr></thead>
    <tbody>${rows.map(d => {
      const st = DISCOUNT_STATE[discountState(d)], ps = names(d);
      return `<tr><td><div class="name">${esc(d.name)}</div></td>
        <td><span class="badge b-low">${esc(discountLabel(d))}</span></td>
        <td><div class="thumb-row">${ps.slice(0, 4).map(p => thumb(p, 'sm')).join('')}${ps.length > 4 ? `<span class="muted">+${ps.length - 4}</span>` : ''}</div><div class="meta">${ps.length} producto${ps.length === 1 ? '' : 's'}</div></td>
        <td>${esc(validityText(d))}</td>
        <td><span class="badge ${st.cls}">${st.label}</span></td>
        <td><div class="acts"><button class="btn sm" data-action="editDiscount" data-id="${esc(d.id)}">Editar</button><button class="btn sm" data-action="toggleDiscount" data-id="${esc(d.id)}">${d.active ? 'Pausar' : 'Activar'}</button><button class="btn sm danger" data-action="deleteDiscount" data-id="${esc(d.id)}">Eliminar</button></div></td></tr>`;
    }).join('')}</tbody></table></div>`;
}

/* ---- Formulario con selector de productos ---- */
function discountForm(id) {
  const d = id ? state.discounts.find(x => x.id === id) : null;
  if (id && !d) return;
  dscDraft = {ids: new Set(d ? d.productIds.filter(pid => getProduct(pid)) : [])};
  openModal(`<h2>${d ? 'Editar descuento' : 'Nuevo descuento'}</h2>
  <form data-form="discount" data-id="${d ? esc(d.id) : ''}">
    <div class="form-grid">
      <label class="f" style="grid-column:1/-1">Nombre de la oferta<input name="dname" required minlength="2" maxlength="60" value="${d ? esc(d.name) : ''}" placeholder="Ej. Liquidación de temporada"></label>
      <label class="f">Tipo<select name="dkind"><option value="percent"${!d || d.kind === 'percent' ? ' selected' : ''}>Porcentaje (%)</option><option value="amount"${d && d.kind === 'amount' ? ' selected' : ''}>Monto fijo ($ menos)</option></select></label>
      <label class="f">Valor<input name="dvalue" type="number" min="0.01" step="0.01" required value="${d ? +d.value : ''}" placeholder="Ej. 20"></label>
      <label class="f">Desde (opcional)<input name="dstart" type="date" value="${d && d.startsOn ? esc(d.startsOn) : ''}"></label>
      <label class="f">Hasta (opcional)<input name="dend" type="date" value="${d && d.endsOn ? esc(d.endsOn) : ''}"></label>
    </div>
    <label class="chk-line" style="margin-top:12px"><input type="checkbox" name="dactive"${!d || d.active ? ' checked' : ''}> Descuento activo (si lo desmarcas queda en pausa)</label>
    <div class="pick-head"><h3>Productos con este descuento</h3><span class="muted" id="pickCount"></span></div>
    <div class="toolbar" style="margin-bottom:8px">
      <input class="grow" id="pickQ" type="search" placeholder="Buscar producto o SKU…" autocomplete="off">
      <select id="pickCat"><option value="">Todas las categorías</option>${options(uniq('category'), '')}</select>
      <button type="button" class="btn sm" data-action="pickAll">Seleccionar los visibles</button>
      <button type="button" class="btn sm" data-action="pickNone">Quitar los visibles</button>
    </div>
    <div class="pick-list" id="pickList"></div>
    <div class="foot"><button type="button" class="btn" data-action="closeModal">Cancelar</button><button class="btn primary">Guardar descuento</button></div>
  </form>`, true);
  drawPick();
}

const pickVisible = () => {
  const q = ($('#pickQ') || {value: ''}).value.trim().toLowerCase(), cat = ($('#pickCat') || {value: ''}).value;
  return state.products.filter(p => (!q || `${p.sku} ${p.name} ${p.brand} ${p.color}`.toLowerCase().includes(q)) && (!cat || p.category === cat))
    .sort((a, b) => a.name.localeCompare(b.name));
};
/* Precio que quedaría con los valores que se están escribiendo en el formulario */
function draftPrice(price) {
  const f = $('form[data-form=discount]'); if (!f) return null;
  const v = parseFloat(f.elements.dvalue.value);
  return v > 0 ? discountedPrice(price, {kind: f.elements.dkind.value, value: v}) : null;
}
function drawPick() {
  const list = $('#pickList'); if (!list || !dscDraft) return;
  const rows = pickVisible(), showCost = can('costs.view');
  list.innerHTML = rows.length ? rows.map(p => {
    const np = draftPrice(p.price), below = np !== null && showCost && np < p.cost;
    return `<label class="pick-item"><input type="checkbox" data-pick="${esc(p.id)}"${dscDraft.ids.has(p.id) ? ' checked' : ''}>
      <span class="prod">${thumb(p, 'sm')}<span><b>${esc(p.name)}</b><br><span class="meta muted">${[p.sku, p.brand, p.color].filter(Boolean).map(esc).join(' · ')}</span></span></span>
      <span class="pick-price">${np !== null && np < p.price ? `<s class="price-old">${money(p.price)}</s> <b>${money(np)}</b>` : `<b>${money(p.price)}</b>`}${below ? '<div class="meta warn">Por debajo del costo</div>' : ''}</span></label>`;
  }).join('') : '<div class="empty">Ningún producto coincide.</div>';
  $('#pickCount').textContent = `${dscDraft.ids.size} seleccionado${dscDraft.ids.size === 1 ? '' : 's'}`;
}
function pickToggle(id, on) { if (!dscDraft) return; on ? dscDraft.ids.add(id) : dscDraft.ids.delete(id); $('#pickCount').textContent = `${dscDraft.ids.size} seleccionado${dscDraft.ids.size === 1 ? '' : 's'}`; }
function pickSet(on) { if (!dscDraft) return; pickVisible().forEach(p => on ? dscDraft.ids.add(p.id) : dscDraft.ids.delete(p.id)); drawPick(); }

async function saveDiscountForm(form) {
  const el = form.elements;
  const data = {id: form.dataset.id || null, name: el.dname.value.trim(), kind: el.dkind.value, value: Number(el.dvalue.value),
    startsOn: el.dstart.value || null, endsOn: el.dend.value || null, active: el.dactive.checked, productIds: dscDraft ? [...dscDraft.ids] : []};
  if (!data.productIds.length) throw new Error('Selecciona al menos un producto');
  await store.saveDiscount(data);
  dscDraft = null; closeModal(); toast('Descuento guardado'); refresh();
}
async function toggleDiscount(id) {
  const d = state.discounts.find(x => x.id === id); if (!d) return;
  await run(null, async () => { await store.saveDiscount({...d, active: !d.active}); toast(d.active ? 'Descuento en pausa' : 'Descuento activado'); refresh(); });
}
async function removeDiscount(id) {
  const d = state.discounts.find(x => x.id === id);
  if (!d || !confirm(`¿Eliminar el descuento "${d.name}"? Los productos vuelven a su precio normal. Las ventas ya hechas no cambian.`)) return;
  await run(null, async () => { await store.deleteDiscount(id); toast('Descuento eliminado'); refresh(); });
}
