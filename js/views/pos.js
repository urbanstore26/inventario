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
/* Administrador y cajero: venden a su nombre ("Yo") o eligen cualquier otra cuenta activa */
function sellerOptions() {
  return `<option value="">${esc(`Yo (${store.user.name})`)}</option>` + sellerList().map(s => `<option value="${esc(s.id)}"${pos.seller === s.id ? ' selected' : ''}>${esc(s.name)}${s.role ? ' · ' + esc(s.role) : ''}</option>`).join('');
}
/* Aviso bajo el selector cuando la lista de vendedores no se pudo cargar o está vacía */
function sellerNote() {
  const err = state.sellersError;
  if (err === 'missing') return '<span class="meta warn">No se pudo cargar la lista de vendedores: falta ejecutar en Supabase la migración 20261023110000_cashier_role.sql.</span>';
  if (err) return `<span class="meta warn">No se pudo cargar la lista de vendedores: ${esc(err)}</span>`;
  if (!sellerList().length) return '<span class="meta warn">No hay otras cuentas activas. Crea usuarios en Usuarios.</span>';
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
  return `<div class="ticket" data-w="${ticketMm()}" style="${ticketStyle()}">
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
    ${exchangesBlock(s)}
    <div class="tk-sep"></div>
    <div class="tk-center">¡Gracias por tu compra!</div>
    <div class="tk-center tk-small">Conserva este comprobante</div>
  </div>`;
}
function showSale(id) {
  const s = state.sales.find(x => x.id === id); if (!s) return;
  const mm = ticketMm();
  openModal(`${ticketToolbarHTML()}
    <div class="ticket-wrap">${receiptHTML(s)}</div>
    <div class="foot no-print">
    ${s.status === 'completada' && can('exchanges.create') ? `<button class="btn" data-action="newExchangeFor" data-id="${s.id}">Registrar cambio</button>` : ''}
    ${s.status === 'completada' && can('sales.void') && !saleExchanges(s.id).length ? `<button class="btn danger" data-action="voidSale" data-id="${s.id}">Anular venta</button>` : ''}
    <button class="btn" data-action="closeModal">Cerrar</button><button class="btn primary" data-action="printReceipt">Imprimir ticket</button></div>`);
}

/* ---------- Impresión del ticket ----------
   El ticket se imprime desde un documento aparte (un iframe oculto) que solo contiene el ticket, con la hoja definida
   en milímetros: ancho del rollo, alto exacto, márgenes en cero y orientación vertical. Así no dependen de la pantalla
   de la aplicación ni de sus márgenes. Los ajustes (ancho, margen izquierdo y tamaño del texto) se guardan en este equipo. */
const clampNum = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
function ticketCfg() {
  const mm = +ticketMm(), get = (k, d) => { try { const v = parseFloat(localStorage.getItem(k)); return isFinite(v) ? v : d; } catch (e) { return d; } };
  return {mm, w: clampNum(get('pu_tk_w_' + mm, mm === 58 ? 50 : 72), 30, mm), ml: clampNum(get('pu_tk_ml', 0), 0, 20), scale: clampNum(get('pu_tk_s', 100), 70, 160) / 100};
}
const ticketStyle = () => { const c = ticketCfg(); return `--tkw:${c.w}mm;--tks:${c.scale}`; };
function applyTicketCfg() {
  const c = ticketCfg();
  document.querySelectorAll('.ticket').forEach(t => { t.dataset.w = String(c.mm); t.style.setProperty('--tkw', c.w + 'mm'); t.style.setProperty('--tks', String(c.scale)); });
  const w = $('#tkW'), ml = $('#tkMl'), s = $('#tkS');
  if (w) w.value = c.w; if (ml) ml.value = c.ml; if (s) s.value = Math.round(c.scale * 100);
}
function setTicketWidth(mm) {
  try { localStorage.setItem('pu_ticket_mm', mm === '58' ? '58' : '80'); } catch (e) {}
  applyTicketCfg();
}
function setTicketCfg(id, value) {
  const v = parseFloat(value); if (!isFinite(v)) return;
  const mm = ticketMm();
  try { localStorage.setItem(id === 'tkW' ? 'pu_tk_w_' + mm : id === 'tkMl' ? 'pu_tk_ml' : 'pu_tk_s', String(v)); } catch (e) {}
  const c = ticketCfg();
  document.querySelectorAll('.ticket').forEach(t => { t.style.setProperty('--tkw', c.w + 'mm'); t.style.setProperty('--tks', String(c.scale)); });
}
function resetTicketCfg() {
  try { ['pu_tk_w_80', 'pu_tk_w_58', 'pu_tk_ml', 'pu_tk_s'].forEach(k => localStorage.removeItem(k)); } catch (e) {}
  applyTicketCfg(); toast('Ajustes de impresión restablecidos');
}

/* Papel, ajustes y ayuda: va encima del ticket (lo comparten el ticket de venta y el comprobante de cambio) */
function ticketToolbarHTML() {
  const mm = ticketMm(), c = ticketCfg();
  return `<div class="tk-toolbar no-print"><label class="f">Papel de la impresora
      <select id="tkWidth"><option value="80"${mm === '80' ? ' selected' : ''}>Rollo de 80 mm (estándar)</option><option value="58"${mm === '58' ? ' selected' : ''}>Rollo de 58 mm (angosto)</option></select></label>
    <details class="print-adj"><summary>Ajustar la impresión / el ticket sale mal</summary><div class="pa-in">
      <div class="pa-grid">
        <label class="f">Ancho del ticket (mm)<input id="tkW" type="number" min="30" max="${mm}" step="1" value="${c.w}"></label>
        <label class="f">Margen izquierdo (mm)<input id="tkMl" type="number" min="0" max="20" step="1" value="${c.ml}"></label>
        <label class="f">Tamaño del texto (%)<input id="tkS" type="number" min="70" max="160" step="5" value="${Math.round(c.scale * 100)}"></label>
      </div>
      <div class="acts"><button type="button" class="btn sm" data-action="printTest">Imprimir página de prueba</button><button type="button" class="btn sm" data-action="tkReset">Restablecer</button></div>
      <div><b style="font-size:13px">En el cuadro de impresión del navegador:</b>
        <ol><li>Elige tu impresora de tickets (por ejemplo MHT-L80G-BT).</li>
          <li><b>Tamaño de papel:</b> rollo de 80 mm (o 58 mm). Si no aparece, créalo en Windows: Impresoras, tu impresora, Preferencias, Papel, tamaño personalizado de 80 × 297 mm.</li>
          <li><b>Orientación:</b> vertical. <b>Márgenes:</b> ninguno. <b>Escala:</b> 100 %.</li>
          <li>Desmarca <b>Encabezados y pies de página</b> (es lo que imprime “1/1”).</li></ol></div>
    </div></details></div>`;
}

/* Documento que se imprime: solo el ticket, en un papel de ancho exacto. Usa la misma hoja de estilos de la aplicación;
   el alto se mide con el ticket ya dibujado. */
function ticketPrintHTML(bodyHtml, c) {
  const link = document.querySelector('link[rel=stylesheet][href*="style.css"]'), css = link ? new URL(link.getAttribute('href'), location.href).href : '';
  const abs = bodyHtml.replace(/(src=")([^"]+)(")/g, (m, a, u, z) => a + new URL(u, location.href).href + z);   // el logo con ruta completa
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Ticket</title>${css ? `<link rel="stylesheet" href="${css}">` : ''}<style>
    @page{size:${c.mm}mm 200mm;margin:0}
    *{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact}
    html,body{margin:0;padding:0;background:#fff;color:#000;width:${c.mm}mm}
    .ticket{box-shadow:none;margin:0 0 0 ${c.ml}mm;padding-top:3mm;width:${c.w}mm}
    .tk-logo{filter:grayscale(1) contrast(1.35)}
  </style></head><body>${abs}</body></html>`;
}
/* Prepara el iframe oculto: espera el logo, mide el alto y fija la hoja (ancho × alto, vertical) */
async function preparePrintFrame(html, c) {
  const fr = document.createElement('iframe');
  fr.setAttribute('aria-hidden', 'true');
  fr.style.cssText = `position:fixed;left:-9999px;top:0;width:${c.mm}mm;height:1500px;border:0;opacity:0`;
  document.body.appendChild(fr);
  try {
    await new Promise((ok, fail) => { fr.onload = ok; fr.onerror = fail; fr.srcdoc = html; });
    const d = fr.contentDocument;
    await Promise.all([...d.querySelectorAll('link[rel=stylesheet]')].map(l => l.sheet ? 0 : new Promise(r => { l.onload = l.onerror = r; })));
    await Promise.all([...d.images].map(i => i.complete ? 0 : new Promise(r => { i.onload = i.onerror = r; })));
    if (d.fonts && d.fonts.ready) await d.fonts.ready;
    const h = Math.max(Math.ceil(d.body.scrollHeight * 25.4 / 96) + 6, c.mm + 20);   // siempre más alto que ancho: hoja vertical
    d.head.insertAdjacentHTML('beforeend', `<style>@page{size:${c.mm}mm ${h}mm;margin:0}</style>`);
    return {fr, h};
  } catch (e) { fr.remove(); throw e; }
}
async function printDocument(html, c) {
  const {fr} = await preparePrintFrame(html, c);
  fr.contentWindow.focus(); fr.contentWindow.print();
  setTimeout(() => fr.remove(), 60000);
}
async function printTicket() {
  const t = $('.ticket'); if (!t) return;
  const c = ticketCfg();
  try { await printDocument(ticketPrintHTML(t.outerHTML, c), c); }
  catch (e) { console.error(e); toast('No se pudo preparar la impresión', true); }
}
/* Página de prueba: regla de 0 a 80 mm y bordes, para ver el tamaño del papel, la orientación y los márgenes de la impresora */
async function printTestPage() {
  const c = ticketCfg(), ticks = Array.from({length: Math.floor(c.mm / 10) + 1}, (_, i) => `<i style="left:${i * 10}mm"><b>${i * 10}</b></i>`).join('');
  const body = `<div class="ticket tk-test" style="--tkw:${c.w}mm;--tks:${c.scale}">
    <div class="tk-store">PRUEBA DE IMPRESIÓN</div>
    <div class="tk-center tk-small">Papel ${c.mm} mm · ticket ${c.w} mm · margen ${c.ml} mm · texto ${Math.round(c.scale * 100)} %</div>
    <div class="tk-sep"></div>
    <div class="tk-ruler">${ticks}</div>
    <div class="tk-row"><span>◄ IZQUIERDA</span><span>DERECHA ►</span></div>
    <div class="tk-sep"></div>
    <div>Texto normal 12345 ABC</div><div class="tk-small">Texto pequeño 12345 ABC</div><div class="tk-total">TOTAL $12.34</div>
    <div class="tk-sep"></div>
    <div class="tk-center tk-small">Si lees esto derecho, con el rollo saliendo hacia abajo, la orientación es correcta. Debe verse la regla completa y la línea IZQUIERDA/DERECHA sin cortar. Sin “1/1” ni fecha arriba o abajo.</div>
  </div>`;
  const extra = `.tk-ruler{position:relative;height:9mm;border-top:.4mm solid #000;margin-bottom:2mm}.tk-ruler i{position:absolute;top:0;height:3mm;border-left:.3mm solid #000}.tk-ruler b{position:absolute;top:3.2mm;left:-1.5mm;font:9px var(--font-mono);font-style:normal}`;
  const html = ticketPrintHTML(body, c).replace('</style></head>', extra + '</style></head>');
  try { await printDocument(html, c); } catch (e) { console.error(e); toast('No se pudo preparar la página de prueba', true); }
}
