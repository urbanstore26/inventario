'use strict';
/* Vista: Punto de venta */

const pos = {cart: [], sel: null, q: '', discount: '', method: 'Efectivo', paid: '', customer: '', note: '', seller: ''};

function renderPOS() {
  $('#view').innerHTML = `
  <div class="pos">
    <div class="card"><h3>Buscar producto</h3>
      <input id="posQ" type="search" placeholder="Escribe o escanea SKU / nombre / marca…" value="${esc(pos.q)}" autocomplete="off">
      <div class="results" id="posResults"></div>
      <div id="posSizes"></div>
    </div>
    <div class="card"><h3>Carrito</h3><div id="posCart"></div></div>
  </div>`;
  drawPosResults(); drawPosSizes(); drawCart();
  $('#posQ').focus();
}
function drawPosResults() {
  const q = pos.q.trim().toLowerCase();
  const list = state.products.filter(p => totalStock(p) > 0 && (!q || `${p.sku} ${p.name} ${p.brand} ${p.color}`.toLowerCase().includes(q))).sort((a, b) => a.name.localeCompare(b.name)).slice(0, 6);
  $('#posResults').innerHTML = list.length ? list.map(p => `<button class="res${pos.sel === p.id ? ' sel' : ''}" data-action="posPick" data-id="${p.id}">
    <span class="prod">${thumb(p, 'sm')}<span><b>${esc(p.name)}</b><br><span class="meta muted">${[p.brand, p.sku, p.color].filter(Boolean).map(esc).join(' · ')}</span></span></span>
    <span class="right">${priceHtml(p)} ${offerBadge(p)}<br><span class="meta muted">${totalStock(p)} pares</span></span></button>`).join('') : '<div class="empty">Sin resultados con stock</div>';
}
function drawPosSizes() {
  const p = getProduct(pos.sel);
  if (!p) { $('#posSizes').innerHTML = ''; return; }
  $('#posSizes').innerHTML = `<h3 style="margin-top:16px">${esc(p.name)} · ${priceHtml(p)} · elige la talla</h3>
    <div class="sizes">${sizesFor(p).filter(s => p.stock[s] > 0).map(s => {
      const inCart = (pos.cart.find(i => i.pid === p.id && i.size === s) || {}).qty || 0, left = p.stock[s] - inCart;
      return `<button class="size num" data-action="posAdd" data-size="${esc(s)}" ${left <= 0 ? 'disabled' : ''}>${esc(s)}<small>${left} disp.</small></button>`;
    }).join('')}</div>`;
}
const cartTotals = () => {
  const sub = pos.cart.reduce((a, i) => a + i.price * i.qty, 0), disc = Math.min(Math.max(Number(pos.discount) || 0, 0), sub), total = sub - disc;
  const savings = pos.cart.reduce((a, i) => a + ((i.listPrice ?? i.price) - i.price) * i.qty, 0);   // ahorro por ofertas
  return {sub, disc, total, savings, paid: Number(pos.paid) || 0};
};
function drawCart() {
  const t = cartTotals();
  $('#posCart').innerHTML = pos.cart.length ? `
    ${pos.cart.map((i, n) => `<div class="line"><div class="prod">${thumb(getProduct(i.pid) || {name: i.name}, 'sm')}<div><b>${esc(i.name)}</b><div class="meta muted">Talla ${esc(i.size)} · ${i.offer ? `<s class="price-old">${money(i.listPrice)}</s> ` : ''}${money(i.price)}${i.offer ? ` · <span class="offer-name">${esc(i.offer)}</span>` : ''}</div></div></div>
      <div class="qty"><button data-action="posDec" data-i="${n}" aria-label="Menos">−</button><span class="num">${i.qty}</span><button data-action="posInc" data-i="${n}" aria-label="Más">+</button></div>
      <div class="num right" style="min-width:70px"><b>${money(i.price * i.qty)}</b> <button class="btn sm danger" data-action="posRm" data-i="${n}" aria-label="Quitar">Quitar</button></div></div>`).join('')}
    <div class="totals">
      <div class="r"><span class="muted">Subtotal</span><span class="num" id="tSub">${money(t.sub)}</span></div>
      ${t.savings > 0.004 ? `<div class="r"><span class="muted">Ahorro por ofertas</span><span class="num">-${money(t.savings)}</span></div>` : ''}
      <div class="r"><span class="muted">Descuento ($)</span><input id="posDisc" type="number" min="0" step="0.01" value="${esc(pos.discount)}" placeholder="0.00"></div>
      <div class="r grand"><span>Total</span><span class="num" id="tTotal">${money(t.total)}</span></div>
    </div>
    <div class="form-grid" style="margin-top:12px">
      <label class="f">Método de pago<select id="posMethod">${options(['Efectivo', 'Tarjeta', 'Transferencia'], pos.method)}</select></label>
      <label class="f" id="paidWrap" ${pos.method === 'Efectivo' ? '' : 'hidden'}>Recibido ($)<input id="posPaid" type="number" min="0" step="0.01" value="${esc(pos.paid)}"></label>
      ${can('sales.assign_seller') ? `<label class="f" style="grid-column:1/-1">Vendedor que realiza la venta<select id="posSeller">${sellerOptions()}</select>${sellerNote()}</label>` : ''}
      <label class="f" style="grid-column:1/-1">Cliente (opcional)<input id="posCustomer" value="${esc(pos.customer)}"></label>
      <label class="f" style="grid-column:1/-1">Observación (opcional)<input id="posNote" maxlength="200" value="${esc(pos.note)}" placeholder="Ej. cambio de talla, entrega pendiente…"></label>
    </div>
    <div class="r" id="changeRow" style="margin:10px 0;display:${pos.method === 'Efectivo' ? 'flex' : 'none'};justify-content:space-between"><span class="muted">Cambio</span><b class="num" id="tChange">${money(Math.max(0, t.paid - t.total))}</b></div>
    <button class="btn primary block" data-action="posCheckout">Cobrar ${money(t.total)}</button>
    <button class="btn block" style="margin-top:8px;padding:8px" data-action="posClear">Vaciar carrito</button>`
    : '<div class="empty">El carrito está vacío.<br>Busca un producto y elige la talla.</div>';
}
/* El administrador puede vender a su nombre ("Yo"); el cajero siempre debe elegir un vendedor */
function sellerOptions() {
  const first = isAdmin() ? `Yo (${store.user.name})` : 'Elige el vendedor…';
  return `<option value="">${esc(first)}</option>` + sellerList().map(s => `<option value="${esc(s.id)}"${pos.seller === s.id ? ' selected' : ''}>${esc(s.name)}</option>`).join('');
}
/* Aviso bajo el selector cuando la lista de vendedores no se pudo cargar o está vacía */
function sellerNote() {
  const err = state.sellersError;
  if (err === 'missing') return '<span class="meta warn">No se pudo cargar la lista de vendedores: falta ejecutar en Supabase la migración 20261023110000_cashier_role.sql.</span>';
  if (err) return `<span class="meta warn">No se pudo cargar la lista de vendedores: ${esc(err)}</span>`;
  if (!sellerList().length) return '<span class="meta warn">No hay otros vendedores activos. Crea cuentas con rol Vendedor en Usuarios.</span>';
  return '';
}
function updatePosTotals() {
  const t = cartTotals();
  $('#tTotal').textContent = money(t.total);
  $('#tChange').textContent = money(Math.max(0, t.paid - t.total));
  const b = $('[data-action=posCheckout]'); if (b) b.textContent = 'Cobrar ' + money(t.total);
}
async function checkout() {
  const t = cartTotals();
  if (!pos.cart.length) return;
  if (pos.method === 'Efectivo' && pos.paid !== '' && t.paid < t.total) return toast('El monto recibido es menor al total', true);
  if (can('sales.assign_seller') && !isAdmin() && !pos.seller) {
    const sel = $('#posSeller'); if (sel) sel.focus();
    return toast(sellerList().length ? 'Elige qué vendedor realizó la venta' : (state.sellersError ? 'No se pudo cargar la lista de vendedores (ver aviso bajo el selector)' : 'No hay vendedores activos para elegir. Crea uno en Usuarios.'), true);
  }
  await run($('[data-action=posCheckout]'), async () => {
    let sale;
    try {
      sale = await store.sell({items: pos.cart.map(i => ({pid: i.pid, size: i.size, qty: i.qty})), method: pos.method, discount: Number(pos.discount) || 0, customer: pos.customer, note: pos.note, paid: Number(pos.paid) || 0, seller: pos.seller});
    } catch (e) {
      await store.reload().catch(() => {});          // el stock pudo cambiar en otro equipo
      drawPosResults(); drawPosSizes(); drawCart();
      throw e;
    }
    Object.assign(pos, {cart: [], sel: null, q: '', discount: '', paid: '', customer: '', note: '', seller: ''});   // el vendedor se elige en cada venta
    toast('Venta registrada V-' + pad(sale.num, 4));
    refresh();
    showSale(sale.id);
  });
}
/* Ticket de punto de venta (rollo térmico). Ancho del papel por equipo: 80 mm (estándar) o 58 mm. */
const ticketMm = () => { try { return localStorage.getItem('pu_ticket_mm') === '58' ? '58' : '80'; } catch (e) { return '80'; } };

function receiptHTML(s) {
  const name = state.settings.storeName, units = s.items.reduce((a, i) => a + i.qty, 0);
  const saved = s.items.reduce((a, i) => a + ((i.listPrice ?? i.price) - i.price) * i.qty, 0);   // ahorro por ofertas
  const row = (l, r, cls = '') => `<div class="tk-row ${cls}"><span>${l}</span><span>${r}</span></div>`;
  return `<div class="ticket" data-w="${ticketMm()}">
    <img class="tk-logo" src="assets/logo-wordmark.png" alt="${esc(name)}">
    <div class="tk-store">${esc(name.toUpperCase())}</div>
    <div class="tk-center">Comprobante V-${pad(s.num, 4)}<br>${fmtDate(s.date)}${s.status === 'anulada' ? '<br><b>*** ANULADA ***</b>' : ''}</div>
    <div class="tk-sep"></div>
    ${s.items.map(i => `<div class="tk-item"><div>${esc(i.name)}</div>${i.sku ? `<div class="tk-small tk-sku">Cód. ${esc(i.sku)}</div>` : ''}${row(`${i.qty} × ${money(i.price)} · T${esc(i.size)}`, money(i.qty * i.price))}${(i.listPrice ?? i.price) > i.price ? `<div class="tk-small tk-off">Antes ${money(i.listPrice)}${i.discountName ? ' · ' + esc(i.discountName) : ''}</div>` : ''}</div>`).join('')}
    <div class="tk-sep"></div>
    ${row('Artículos', units)}
    ${saved > 0.004 ? row('Ahorro en ofertas', money(saved)) : ''}
    ${row('Subtotal', money(s.subtotal))}
    ${s.discount ? row('Descuento', '-' + money(s.discount)) : ''}
    ${row('TOTAL', money(s.total), 'tk-total')}
    <div class="tk-sep"></div>
    ${row('Pago', esc(s.method))}
    ${s.change ? row('Recibido', money(s.paid)) + row('Cambio', money(s.change)) : ''}
    ${s.customer ? row('Cliente', esc(s.customer)) : ''}
    ${s.note ? `<div class="tk-small tk-note">Obs.: ${esc(s.note)}</div>` : ''}
    ${s.seller ? row('Vendedor', esc(s.seller)) : ''}
    ${s.cashier ? row('Cajero', esc(s.cashier)) : ''}
    <div class="tk-sep"></div>
    <div class="tk-center">¡Gracias por tu compra!</div>
    <div class="tk-center tk-small">Conserva este comprobante</div>
  </div>`;
}
function showSale(id) {
  const s = state.sales.find(x => x.id === id); if (!s) return;
  const mm = ticketMm();
  openModal(`<div class="tk-toolbar no-print"><label class="f">Papel de la impresora
      <select id="tkWidth"><option value="80"${mm === '80' ? ' selected' : ''}>Rollo de 80 mm (estándar)</option><option value="58"${mm === '58' ? ' selected' : ''}>Rollo de 58 mm (angosto)</option></select></label></div>
    <div class="ticket-wrap">${receiptHTML(s)}</div>
    <div class="foot no-print">
    ${s.status === 'completada' && can('sales.void') ? `<button class="btn danger" data-action="voidSale" data-id="${s.id}">Anular venta</button>` : ''}
    <button class="btn" data-action="closeModal">Cerrar</button><button class="btn primary" data-action="printReceipt">Imprimir ticket</button></div>`);
}

/* Imprime solo el ticket: la hoja se ajusta al ancho del rollo y a la altura exacta del ticket (sin hoja en blanco) */
function printTicket() {
  const t = $('.ticket'); if (!t) return;
  const mm = ticketMm(), h = Math.ceil(t.getBoundingClientRect().height * 25.4 / 96) + 4;
  let st = $('#pageStyle');
  if (!st) { st = document.createElement('style'); st.id = 'pageStyle'; document.head.appendChild(st); }
  st.textContent = `@page{size:${mm}mm ${h}mm;margin:0}`;
  document.body.classList.add('print-receipt');
  window.print();
  document.body.classList.remove('print-receipt');
}
function setTicketWidth(mm) {
  try { localStorage.setItem('pu_ticket_mm', mm === '58' ? '58' : '80'); } catch (e) {}
  const t = $('.ticket'); if (t) t.dataset.w = ticketMm();
}
