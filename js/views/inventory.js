'use strict';
/* Vista: Inventario y formulario de producto (con foto del estilo) */

let productImage = null;   // foto pendiente del formulario: null (sin cambios) | 'remove' | {blob, dataUrl}

function renderInventory() {
  const f = ui.inv;
  $('#view').innerHTML = `
  <div class="toolbar">
    <input class="grow" id="invQ" type="search" placeholder="Buscar SKU, nombre, marca…" value="${esc(f.q)}">
    <select id="invCat"><option value="">Todas las categorías</option>${options(uniq('category'), f.cat)}</select>
    <select id="invBrand"><option value="">Todas las marcas</option>${options(uniq('brand'), f.brand)}</select>
    <select id="invStatus"><option value="">Todo el stock</option>
      <option value="ok"${f.status === 'ok' ? ' selected' : ''}>Disponible</option><option value="low"${f.status === 'low' ? ' selected' : ''}>Stock bajo</option><option value="out"${f.status === 'out' ? ' selected' : ''}>Agotado</option></select>
    ${can('reports.export') ? '<button class="btn" data-action="exportInv">Exportar Excel</button>' : ''}${can('products.manage') ? '<button class="btn primary" data-action="newProduct">+ Nuevo producto</button>' : ''}
  </div>
  <div id="invTable"></div>`;
  drawInv();
}
function drawInv() {
  const f = ui.inv, q = f.q.trim().toLowerCase(), canEdit = can('products.manage'), canStock = can('stock.adjust'), showCost = can('costs.view');
  const rows = state.products.filter(p =>
    (!q || `${p.sku} ${p.name} ${p.brand} ${p.color} ${p.category} ${p.gender}`.toLowerCase().includes(q)) &&
    (!f.cat || p.category === f.cat) && (!f.brand || p.brand === f.brand) && (!f.status || stockStatus(p).key === f.status)
  ).sort((a, b) => a.name.localeCompare(b.name));
  if (!rows.length) { $('#invTable').innerHTML = `<div class="card empty">${state.products.length ? 'Ningún producto coincide con los filtros.' : 'Aún no hay productos.' + (canEdit ? ' Crea el primero con “Nuevo producto”.' : '')}</div>`; return; }
  const units = rows.reduce((a, p) => a + totalStock(p), 0);
  $('#invTable').innerHTML = `<div class="tablewrap"><table>
    <thead><tr><th>SKU</th><th>Producto</th><th>Tallas (stock)</th><th class="right">Total</th><th class="right">Precio</th><th>Estado</th>${canEdit || canStock ? '<th></th>' : ''}</tr></thead>
    <tbody>${rows.map(p => {
      const st = stockStatus(p), sz = sortSizes(Object.keys(p.stock).filter(s => p.stock[s] > 0));
      const img = p.image ? `<button class="thumb-btn" data-action="viewImage" data-id="${p.id}" aria-label="Ampliar foto de ${esc(p.name)}">${thumb(p, 'md')}</button>` : thumb(p, 'md');
      return `<tr><td class="num">${esc(p.sku)}</td>
        <td><div class="prod">${img}<div><div class="name">${esc(p.name)}</div><div class="meta">${[p.brand, p.category, p.gender, p.color].filter(Boolean).map(esc).join(' · ')}</div></div></div></td>
        <td><div class="chips">${sz.length ? sz.map(s => `<span class="chip">${esc(s)}<b> ×${p.stock[s]}</b></span>`).join('') : '<span class="muted">—</span>'}</div></td>
        <td class="num right"><b>${totalStock(p)}</b></td><td class="num right">${priceHtml(p)}${offerBadge(p) ? '<div class="meta">' + offerBadge(p) + '</div>' : ''}${showCost ? `<div class="meta">Costo ${money(p.cost)}</div>` : ''}</td>
        <td><span class="badge ${st.cls}">${st.label}</span></td>
        ${canEdit || canStock ? `<td><div class="acts">${canStock ? `<button class="btn sm" data-action="addStock" data-id="${p.id}">+ Stock</button>` : ''}${canEdit ? `<button class="btn sm" data-action="editProduct" data-id="${p.id}">Editar</button><button class="btn sm danger" data-action="deleteProduct" data-id="${p.id}">Eliminar</button>` : ''}</div></td>` : ''}</tr>`;
    }).join('')}</tbody></table></div>
    <p class="muted">${rows.length} modelos · ${units} pares</p>`;
}

function viewImage(id) {
  const p = getProduct(id); if (!p || !p.image) return;
  openModal(`<img class="big-photo" src="${esc(p.image)}" alt="${esc(p.name)}">
    <div class="photo-cap"><b>${esc(p.name)}</b><span class="muted"> · ${[p.brand, p.sku].filter(Boolean).map(esc).join(' · ')}</span></div>
    <div class="foot"><button class="btn" data-action="closeModal">Cerrar</button></div>`);
}

function productForm(id) {
  const p = id ? getProduct(id) : {sku: nextSku(), name: '', brand: '', category: '', gender: 'Unisex', color: '', cost: '', price: '', minStock: '', stock: {}, image: ''};
  productImage = null;
  openModal(`<h2>${id ? 'Editar producto' : 'Nuevo producto'}</h2>
  <form data-form="product" data-id="${id || ''}">
    <div class="photo-row">
      <div id="pImgPreview">${thumb(p, 'lg')}</div>
      <div class="photo-ctrl">
        <b>Foto del estilo</b>
        <span class="muted">JPG, PNG o WEBP. Se ajusta y comprime sola.</span>
        <div class="acts" style="justify-content:flex-start">
          <label class="btn sm" style="cursor:pointer">Elegir foto<input id="pImage" type="file" accept="image/jpeg,image/png,image/webp" hidden></label>
          <button type="button" class="btn sm" data-action="removeImage">Quitar foto</button>
        </div>
      </div>
    </div>
    <div class="form-grid">
      <label class="f">SKU<input name="sku" required value="${esc(p.sku)}"></label>
      <label class="f">Nombre / modelo<input name="pname" required value="${esc(p.name)}" placeholder="Ej. Air Max 90"></label>
      <label class="f">Marca<input name="brand" list="dlBrand" value="${esc(p.brand)}"></label>
      <label class="f">Categoría<input name="category" list="dlCat" value="${esc(p.category)}"></label>
      <label class="f">Género<select name="gender">${options(['Hombre', 'Mujer', 'Unisex', 'Niño', 'Niña'], p.gender)}</select></label>
      <label class="f">Color<input name="color" value="${esc(p.color)}"></label>
      <label class="f">Costo (USD)<input name="cost" type="number" min="0" step="0.01" required value="${esc(p.cost)}"></label>
      <label class="f">Precio de venta (USD)<input name="price" type="number" min="0" step="0.01" required value="${esc(p.price)}"></label>
      <label class="f">Mínimo para alerta<input name="minStock" type="number" min="0" step="1" value="${esc(p.minStock)}" placeholder="Por defecto: ${state.settings.threshold}"></label>
    </div>
    <datalist id="dlBrand">${uniq('brand').map(b => `<option value="${esc(b)}">`).join('')}</datalist>
    <datalist id="dlCat">${[...new Set([...CATEGORIES, ...uniq('category')])].map(b => `<option value="${esc(b)}">`).join('')}</datalist>
    <h3 style="margin:16px 0 8px">Stock por talla</h3>
    <div class="szgrid">${sizesFor(p).map(s => `<label class="sz">${esc(s)}<input type="number" min="0" step="1" data-size="${esc(s)}" value="${p.stock[s] || ''}" placeholder="0"></label>`).join('')}</div>
    <div class="foot"><button type="button" class="btn" data-action="closeModal">Cancelar</button><button class="btn primary">Guardar</button></div>
  </form>`, true);
}

/* Foto elegida en el formulario: se prepara y se muestra la vista previa */
async function pickProductImage(input) {
  const file = input.files[0]; input.value = '';
  if (!file) return;
  productImage = await prepareImage(file, store.imageMax);
  $('#pImgPreview').innerHTML = `<span class="thumb lg"><img src="${esc(productImage.dataUrl)}" alt="Vista previa"></span>`;
}
function removeProductImage() {
  productImage = 'remove';
  $('#pImgPreview').innerHTML = thumb({image: '', name: ''}, 'lg');
}

async function saveProduct(form) {
  const el = form.elements, id = form.dataset.id;
  const sku = el.sku.value.trim();
  if (state.products.some(p => p.sku.toLowerCase() === sku.toLowerCase() && p.id !== id)) throw new Error('Ya existe un producto con ese SKU');
  const stock = {};
  form.querySelectorAll('[data-size]').forEach(i => { const q = Math.max(0, Math.floor(Number(i.value) || 0)); if (q > 0) stock[i.dataset.size] = q; });
  const data = {sku, name: el.pname.value.trim(), brand: el.brand.value.trim(), category: el.category.value.trim(), gender: el.gender.value, color: el.color.value.trim(), cost: Number(el.cost.value), price: Number(el.price.value), minStock: el.minStock.value === '' ? '' : Number(el.minStock.value)};
  await store.saveProduct({id, data, stock, image: productImage});
  productImage = null;
  closeModal(); toast('Producto guardado'); refresh();
}
