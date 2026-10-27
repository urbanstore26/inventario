'use strict';
/* Vista: Inversión social. Control de los bienes de la tienda (cámaras, muebles, sillas, espejos, computadoras,
   impresoras…) y de los gastos y pagos (sueldos de empleados, stickers para los precios…) organizados por plan de
   inversión social: cuánto se presupuestó, cuánto se invirtió y en qué.
   Pestañas: Bienes · Gastos y pagos (solo con permiso) · Planes de inversión · Historial (lo anota el sistema solo). */

let assetImage = null;   // foto pendiente del formulario: null (sin cambios) | 'remove' | {blob, dataUrl}

function renderAssets() {
  const tabs = [['bienes', 'Bienes'], ...(can('expenses.view') ? [['gastos', 'Gastos y pagos']] : []), ['planes', 'Planes de inversión'], ['historial', 'Historial']];
  if (!tabs.some(([k]) => k === ui.ast.tab)) ui.ast.tab = 'bienes';   // p. ej. la pestaña de gastos sin permiso
  const t = ui.ast.tab;
  $('#view').innerHTML = `
  <div class="seg" role="tablist">${tabs
    .map(([k, l]) => `<button class="${t === k ? 'on' : ''}" data-action="astTab" data-tab="${k}" role="tab" aria-selected="${t === k}">${l}</button>`).join('')}</div>
  ${assetsNotice()}
  <div id="astBody"></div>`;
  ({bienes: drawAssetsTab, gastos: drawExpensesTab, planes: drawPlansTab, historial: drawHistoryTab})[t]();
}

/* Aviso cuando la base de datos todavía no tiene las tablas (migración sin ejecutar) o falló la carga */
function assetsNotice() {
  const one = (e, what, file) => e ? `<div class="card notice"><b>No se pudo cargar ${what}.</b><br>${e === 'missing'
    ? `Falta ejecutar en Supabase la migración <code>${file}</code> (SQL Editor) y recargar la aplicación.` : esc(e)}</div>` : '';
  return one(state.assetsError, 'el mobiliario y equipo', '20261027100000_assets_plans.sql') + (ui.ast.tab === 'gastos' || ui.ast.tab === 'planes' ? one(state.expensesError, 'los gastos y pagos', '20261027110000_plan_expenses.sql') : '');
}

/* ---------- Pestaña Bienes ---------- */
function drawAssetsTab() {
  const f = ui.ast, A = state.assets, canEdit = can('assets.manage');
  const units = A.reduce((a, x) => a + x.quantity, 0), value = A.reduce((a, x) => a + assetValue(x), 0);
  const sumBy = (...keys) => A.filter(x => keys.includes(x.status)).reduce((a, x) => a + x.quantity, 0);
  const ok = sumBy('nuevo', 'bueno', 'regular'), bad = sumBy('danado', 'reparacion'), gone = sumBy('baja');
  const cats = [...new Set([...ASSET_CATEGORIES, ...A.map(x => x.category).filter(Boolean)])].sort((a, b) => a.localeCompare(b));
  $('#astBody').innerHTML = `
  <div class="grid kpis">
    <div class="card kpi hi"><div class="l">Bienes registrados</div><div class="v num">${units.toLocaleString('en-US')}</div><div class="s">${A.length} ${A.length === 1 ? 'tipo' : 'tipos'} de bien</div></div>
    <div class="card kpi"><div class="l">Valor invertido</div><div class="v num">${money(value)}</div><div class="s">${state.plans.length} ${state.plans.length === 1 ? 'plan' : 'planes'} de inversión</div></div>
    <div class="card kpi"><div class="l">En uso</div><div class="v num">${ok}</div><div class="s">nuevos, buenos o regulares</div></div>
    <div class="card kpi"><div class="l">Requieren atención</div><div class="v num">${bad}</div><div class="s">${gone} dado${gone === 1 ? '' : 's'} de baja</div></div>
  </div>
  <div class="toolbar">
    <input class="grow" id="astQ" type="search" placeholder="Buscar código, nombre, marca, serie, ubicación…" value="${esc(f.q)}">
    <select id="astCat"><option value="">Todas las categorías</option>${options(cats, f.cat)}</select>
    <select id="astStatus"><option value="">Todos los estados</option>${Object.entries(ASSET_STATUS).map(([k, v]) => `<option value="${k}"${f.status === k ? ' selected' : ''}>${v.label}</option>`).join('')}</select>
    <select id="astPlan"><option value="">Todos los planes</option><option value="none"${f.plan === 'none' ? ' selected' : ''}>Sin plan</option>${state.plans.map(p => `<option value="${esc(p.id)}"${f.plan === p.id ? ' selected' : ''}>${esc(p.name)}</option>`).join('')}</select>
    ${can('reports.export') ? '<button class="btn" data-action="exportAssets">Exportar Excel</button>' : ''}${canEdit ? '<button class="btn primary" data-action="newAsset">+ Nuevo bien</button>' : ''}
  </div>
  <div id="astTable"></div>`;
  drawAssetRows();
}

function drawAssetRows() {
  const f = ui.ast, q = f.q.trim().toLowerCase(), canEdit = can('assets.manage');
  const rows = state.assets.filter(a =>
    (!q || `${a.code} ${a.name} ${a.brand} ${a.model} ${a.serial} ${a.location} ${a.responsible} ${a.category}`.toLowerCase().includes(q)) &&
    (!f.cat || a.category === f.cat) && (!f.status || a.status === f.status) &&
    (!f.plan || (f.plan === 'none' ? !a.planId : a.planId === f.plan))
  ).sort((a, b) => a.code.localeCompare(b.code, 'es', {numeric: true}));
  if (!rows.length) {
    $('#astTable').innerHTML = `<div class="card empty">${state.assets.length ? 'Ningún bien coincide con los filtros.' : 'Aún no hay bienes registrados.' + (canEdit ? ' Crea el primero con “Nuevo bien”.' : '')}</div>`;
    return;
  }
  const units = rows.reduce((a, x) => a + x.quantity, 0), total = rows.reduce((a, x) => a + assetValue(x), 0);
  $('#astTable').innerHTML = `<div class="tablewrap"><table>
    <thead><tr><th>Código</th><th>Bien</th><th>Ubicación y responsable</th><th class="right">Cant.</th><th class="right">Valor</th><th>Estado</th>${canEdit ? '<th></th>' : ''}</tr></thead>
    <tbody>${rows.map(a => {
      const st = ASSET_STATUS[a.status] || {label: a.status, cls: 'b-neutral'}, plan = getPlan(a.planId);
      const img = a.image ? `<button class="thumb-btn" data-action="viewAssetImage" data-id="${esc(a.id)}" aria-label="Ampliar foto de ${esc(a.name)}">${assetThumb(a, 'md')}</button>` : assetThumb(a, 'md');
      return `<tr><td class="num">${esc(a.code)}</td>
        <td><div class="prod">${img}<div><div class="name">${esc(a.name)}</div><div class="meta">${[a.category, a.brand, a.model, a.serial && 'N.º serie ' + a.serial].filter(Boolean).map(esc).join(' · ')}</div><div class="meta">${plan ? 'Plan: ' + esc(plan.name) : 'Sin plan'}</div></div></div></td>
        <td>${esc(a.location) || '<span class="muted">—</span>'}${a.responsible ? `<div class="meta">${esc(a.responsible)}</div>` : ''}</td>
        <td class="num right"><b>${a.quantity}</b></td>
        <td class="num right">${money(assetValue(a))}<div class="meta">${money(a.unitCost)} c/u</div></td>
        <td><span class="badge ${st.cls}">${st.label}</span></td>
        ${canEdit ? `<td><div class="acts"><button class="btn sm" data-action="editAsset" data-id="${esc(a.id)}">Editar</button><button class="btn sm danger" data-action="deleteAsset" data-id="${esc(a.id)}">Eliminar</button></div></td>` : ''}</tr>`;
    }).join('')}</tbody></table></div>
    <p class="muted">${rows.length} ${rows.length === 1 ? 'tipo' : 'tipos'} · ${units} unidades · ${money(total)}</p>`;
}

function viewAssetImage(id) {
  const a = getAsset(id); if (!a || !a.image) return;
  openModal(`<img class="big-photo" src="${esc(a.image)}" alt="${esc(a.name)}">
    <div class="photo-cap"><b>${esc(a.name)}</b><span class="muted"> · ${[a.code, a.location].filter(Boolean).map(esc).join(' · ')}</span></div>
    <div class="foot"><button class="btn" data-action="closeModal">Cerrar</button></div>`);
}

/* ---------- Formulario de bien ---------- */
function assetForm(id) {
  const a = id ? getAsset(id) : {code: '', name: '', category: '', brand: '', model: '', serial: '', quantity: 1, unitCost: '', acquiredOn: '', location: '', responsible: '', status: 'nuevo', planId: '', notes: '', image: ''};
  if (id && !a) return;
  assetImage = null;
  const locations = [...new Set(state.assets.map(x => x.location).filter(Boolean))].sort((x, y) => x.localeCompare(y));
  const cats = [...new Set([...ASSET_CATEGORIES, ...state.assets.map(x => x.category).filter(Boolean)])].sort((x, y) => x.localeCompare(y));
  openModal(`<h2>${id ? 'Editar bien' : 'Nuevo bien'}</h2>
  <form data-form="asset" data-id="${id ? esc(id) : ''}">
    <div class="photo-row">
      <div id="aImgPreview">${assetThumb(a, 'lg')}</div>
      <div class="photo-ctrl">
        <b>Foto del bien</b>
        <span class="muted">JPG, PNG o WEBP. Se ajusta y comprime sola.</span>
        <div class="acts" style="justify-content:flex-start">
          <label class="btn sm" style="cursor:pointer">Elegir foto<input id="aImage" type="file" accept="image/jpeg,image/png,image/webp" hidden></label>
          <button type="button" class="btn sm" data-action="removeAssetImage">Quitar foto</button>
        </div>
      </div>
    </div>
    <div class="form-grid">
      <label class="f">Código${id ? '' : ' (opcional)'}<input name="acode" maxlength="30" value="${esc(a.code)}"${id ? ' disabled' : ''} placeholder="Automático (AF-0001…)"></label>
      <label class="f">Nombre del bien<input name="aname" required minlength="2" maxlength="100" value="${esc(a.name)}" placeholder="Ej. Cámara de seguridad"></label>
      <label class="f">Categoría<input name="acat" list="dlAstCat" maxlength="60" value="${esc(a.category)}" placeholder="Ej. Cámaras"></label>
      <label class="f">Estado<select name="astatus">${Object.entries(ASSET_STATUS).map(([k, v]) => `<option value="${k}"${a.status === k ? ' selected' : ''}>${v.label}</option>`).join('')}</select></label>
      <label class="f">Marca<input name="abrand" maxlength="60" value="${esc(a.brand)}"></label>
      <label class="f">Modelo<input name="amodel" maxlength="60" value="${esc(a.model)}"></label>
      <label class="f">N.º de serie<input name="aserial" maxlength="80" value="${esc(a.serial)}"></label>
      <label class="f">Fecha de adquisición<input name="adate" type="date" value="${esc(a.acquiredOn || '')}"></label>
      <label class="f">Cantidad<input name="aqty" type="number" min="0" step="1" required value="${esc(a.quantity)}"></label>
      <label class="f">Costo unitario (USD)<input name="acost" type="number" min="0" step="0.01" required value="${esc(a.unitCost)}"></label>
      <label class="f">Ubicación<input name="aloc" list="dlAstLoc" maxlength="80" value="${esc(a.location)}" placeholder="Ej. Sala de ventas"></label>
      <label class="f">Responsable<input name="aresp" maxlength="80" value="${esc(a.responsible)}" placeholder="Quién lo tiene a su cargo"></label>
      <label class="f" style="grid-column:1/-1">Plan de inversión<select name="aplan"><option value="">Sin plan</option>${state.plans.map(p => `<option value="${esc(p.id)}"${a.planId === p.id ? ' selected' : ''}>${esc(p.name)}</option>`).join('')}</select></label>
      <label class="f" style="grid-column:1/-1">Observaciones<textarea name="anotes" rows="2" maxlength="500" placeholder="Garantía, factura, detalles…">${esc(a.notes)}</textarea></label>
    </div>
    <datalist id="dlAstCat">${cats.map(c => `<option value="${esc(c)}">`).join('')}</datalist>
    <datalist id="dlAstLoc">${locations.map(c => `<option value="${esc(c)}">`).join('')}</datalist>
    <div class="foot"><button type="button" class="btn" data-action="closeModal">Cancelar</button><button class="btn primary">Guardar</button></div>
  </form>`, true);
}

async function pickAssetImage(input) {
  const file = input.files[0]; input.value = '';
  if (!file) return;
  assetImage = await prepareImage(file, store.imageMax);
  $('#aImgPreview').innerHTML = `<span class="thumb lg"><img src="${esc(assetImage.dataUrl)}" alt="Vista previa"></span>`;
}
function removeAssetImage() {
  assetImage = 'remove';
  $('#aImgPreview').innerHTML = assetThumb({image: '', name: ''}, 'lg');
}

async function saveAssetForm(form) {
  const el = form.elements, id = form.dataset.id;
  const qty = Number(el.aqty.value), cost = Number(el.acost.value);
  if (!Number.isInteger(qty) || qty < 0) throw new Error('La cantidad debe ser un número entero, 0 o mayor');
  if (!(cost >= 0)) throw new Error('El costo unitario no puede ser negativo');
  const data = {code: id ? undefined : el.acode.value.trim(), name: el.aname.value.trim(), category: el.acat.value.trim(), brand: el.abrand.value.trim(), model: el.amodel.value.trim(),
    serial: el.aserial.value.trim(), quantity: qty, unitCost: Math.round(cost * 100) / 100, acquiredOn: el.adate.value || null, location: el.aloc.value.trim(),
    responsible: el.aresp.value.trim(), status: el.astatus.value, planId: el.aplan.value || null, notes: el.anotes.value.trim()};
  await store.saveAsset({id: id || null, data, image: assetImage});
  assetImage = null;
  closeModal(); toast('Bien guardado'); refresh();
}
async function removeAsset(id) {
  const a = getAsset(id);
  if (!a || !confirm(`¿Eliminar "${a.name}" (${a.code})? Si solo ya no lo usan, es mejor cambiar su estado a "Dado de baja": así queda registrado. Se conserva una línea en el historial.`)) return;
  await run(null, async () => { await store.deleteAsset(id); toast('Bien eliminado'); refresh(); });
}

/* ---------- Pestaña Planes de inversión ---------- */
const PLAN_STATE = {
  active:    {label: 'Vigente',    cls: 'b-ok'},
  scheduled: {label: 'Programado', cls: 'b-info'},
  closed:    {label: 'Cerrado',    cls: 'b-neutral'}
};
const planPeriod = p => p.startsOn && p.endsOn ? `${shortDate(p.startsOn)} – ${shortDate(p.endsOn)}` : p.startsOn ? `Desde ${shortDate(p.startsOn)}` : p.endsOn ? `Hasta ${shortDate(p.endsOn)}` : 'Sin fechas';

function drawPlansTab() {
  const P = state.plans, canEdit = can('assets.manage');
  const budget = P.reduce((a, p) => a + p.budget, 0), invested = P.reduce((a, p) => a + planStats(p.id).invested, 0), free = planStats('');
  $('#astBody').innerHTML = `
  <div class="grid kpis">
    <div class="card kpi hi"><div class="l">Presupuesto total</div><div class="v num">${money(budget)}</div><div class="s">${P.length} ${P.length === 1 ? 'plan' : 'planes'}</div></div>
    <div class="card kpi"><div class="l">Invertido en los planes</div><div class="v num">${money(invested)}</div><div class="s">${budget > 0 ? Math.round(invested / budget * 100) + ' % del presupuesto' : 'sin presupuesto'}</div></div>
    <div class="card kpi"><div class="l">Saldo disponible</div><div class="v num">${money(budget - invested)}</div><div class="s">${budget - invested < 0 ? 'presupuesto excedido' : 'por invertir'}</div></div>
    <div class="card kpi"><div class="l">Sin plan asignado</div><div class="v num">${money(free.invested)}</div><div class="s">${free.units} ${free.units === 1 ? 'bien' : 'bienes'}${free.payroll + free.other > 0 ? ' y gastos' : ''}</div></div>
  </div>
  <div class="toolbar"><span class="grow"></span>${can('reports.export') ? '<button class="btn" data-action="exportPlans">Exportar Excel</button>' : ''}${canEdit ? '<button class="btn primary" data-action="newPlan">+ Nuevo plan</button>' : ''}</div>
  ${P.length ? `<div class="tablewrap"><table>
    <thead><tr><th>Plan</th><th>Vigencia</th><th class="right">Presupuesto</th><th class="right">Invertido</th><th class="right">Saldo</th><th>Avance</th><th>Bienes</th><th>Estado</th>${canEdit ? '<th></th>' : ''}</tr></thead>
    <tbody>${[...P].sort((a, b) => a.name.localeCompare(b.name)).map(p => {
      const s = planStats(p.id), left = p.budget - s.invested, pct = p.budget > 0 ? s.invested / p.budget * 100 : 0, st = PLAN_STATE[planState(p)];
      return `<tr><td><div class="name">${esc(p.name)}</div>${p.description ? `<div class="meta">${esc(p.description)}</div>` : ''}</td>
        <td>${esc(planPeriod(p))}</td>
        <td class="num right">${money(p.budget)}</td><td class="right"><span class="num">${money(s.invested)}</span><div class="meta">Bienes ${money(s.assets)}${can('expenses.view') ? ` · Pagos ${money(s.payroll)} · Otros ${money(s.other)}` : ''}</div></td>
        <td class="num right${left < 0 ? ' over-text' : ''}"><b>${money(left)}</b>${left < 0 ? '<div class="meta">Excedido</div>' : ''}</td>
        <td style="min-width:130px"><div class="meter${pct > 100 ? ' over' : ''}" role="img" aria-label="${Math.round(pct)} % invertido"><i style="width:${Math.min(100, pct)}%"></i></div><div class="meta">${p.budget > 0 ? Math.round(pct) + ' %' : '—'}</div></td>
        <td class="num">${s.units}<div class="meta">${s.items} ${s.items === 1 ? 'tipo' : 'tipos'}</div></td>
        <td><span class="badge ${st.cls}">${st.label}</span></td>
        ${canEdit ? `<td><div class="acts"><button class="btn sm" data-action="editPlan" data-id="${esc(p.id)}">Editar</button><button class="btn sm danger" data-action="deletePlan" data-id="${esc(p.id)}">Eliminar</button></div></td>` : ''}</tr>`;
    }).join('')}</tbody></table></div>
    <p class="muted">Invertido = costo de los bienes asignados al plan (cantidad × costo unitario, incluidos los dados de baja)${can('expenses.view') ? ' + pagos de empleados y otros gastos cargados al plan' : ''}.${can('expenses.view') ? '' : ' Los gastos y pagos no se incluyen porque tu rol no puede verlos.'}</p>`
  : `<div class="card empty">Aún no hay planes de inversión.${canEdit ? ' Crea el primero con “Nuevo plan” y asígnale bienes desde la pestaña Bienes.' : ''}</div>`}`;
}

function planForm(id) {
  const p = id ? getPlan(id) : {name: '', description: '', budget: '', startsOn: '', endsOn: '', active: true};
  if (id && !p) return;
  openModal(`<h2>${id ? 'Editar plan' : 'Nuevo plan de inversión'}</h2>
  <form data-form="plan" data-id="${id ? esc(id) : ''}">
    <div class="form-grid">
      <label class="f" style="grid-column:1/-1">Nombre del plan<input name="pname" required minlength="2" maxlength="80" value="${esc(p.name)}" placeholder="Ej. Plan de inversión social 2026"></label>
      <label class="f" style="grid-column:1/-1">Descripción (opcional)<input name="pdesc" maxlength="300" value="${esc(p.description)}" placeholder="Para qué es o quién lo financia"></label>
      <label class="f">Presupuesto (USD)<input name="pbudget" type="number" min="0" step="0.01" required value="${esc(p.budget)}"></label>
      <label class="f">&nbsp;<span class="chk-line" style="margin-top:8px"><input type="checkbox" name="pactive"${p.active ? ' checked' : ''}> Plan abierto (si lo desmarcas queda cerrado)</span></label>
      <label class="f">Desde (opcional)<input name="pstart" type="date" value="${esc(p.startsOn || '')}"></label>
      <label class="f">Hasta (opcional)<input name="pend" type="date" value="${esc(p.endsOn || '')}"></label>
    </div>
    <div class="foot"><button type="button" class="btn" data-action="closeModal">Cancelar</button><button class="btn primary">Guardar plan</button></div>
  </form>`);
}
async function savePlanForm(form) {
  const el = form.elements, id = form.dataset.id, budget = Number(el.pbudget.value);
  if (!(budget >= 0)) throw new Error('El presupuesto no puede ser negativo');
  const data = {name: el.pname.value.trim(), description: el.pdesc.value.trim(), budget: Math.round(budget * 100) / 100, startsOn: el.pstart.value || null, endsOn: el.pend.value || null, active: el.pactive.checked};
  if (data.startsOn && data.endsOn && data.endsOn < data.startsOn) throw new Error('La fecha final no puede ser anterior a la inicial');
  await store.savePlan({id: id || null, data});
  closeModal(); toast('Plan guardado'); refresh();
}
async function removePlan(id) {
  const p = getPlan(id), n = planStats(id).items;
  if (!p || !confirm(`¿Eliminar el plan "${p.name}"?${n ? ` Sus ${n} ${n === 1 ? 'bien quedará' : 'bienes quedarán'} sin plan (no se borran).` : ''}`)) return;
  await run(null, async () => { await store.deletePlan(id); toast('Plan eliminado'); refresh(); });
}

/* ---------- Pestaña Historial ---------- */
const EVENT_KIND = {alta: {label: 'Alta', cls: 'b-ok'}, cambio: {label: 'Cambio', cls: 'b-info'}, baja: {label: 'Baja', cls: 'b-low'}, eliminado: {label: 'Eliminado', cls: 'b-out'}};

function drawHistoryTab() {
  const f = ui.ast;
  $('#astBody').innerHTML = `
  <div class="toolbar">
    <input class="grow" id="evQ" type="search" placeholder="Buscar en el historial…" value="${esc(f.evq)}">
    <select id="evKind"><option value="">Todos los eventos</option>${Object.entries(EVENT_KIND).map(([k, v]) => `<option value="${k}"${f.evkind === k ? ' selected' : ''}>${v.label}</option>`).join('')}</select>
  </div>
  <div id="evTable"></div>`;
  drawHistoryRows();
}
function drawHistoryRows() {
  const f = ui.ast, q = f.evq.trim().toLowerCase();
  const rows = state.assetLog.filter(e => (!f.evkind || e.kind === f.evkind) && (!q || `${e.code} ${e.name} ${e.detail} ${e.actor}`.toLowerCase().includes(q)));
  $('#evTable').innerHTML = rows.length ? `<div class="tablewrap"><table><thead><tr><th>Fecha</th><th>Bien</th><th>Evento</th><th>Detalle</th><th>Usuario</th></tr></thead><tbody>
    ${rows.slice(0, 300).map(e => `<tr><td class="num">${fmtDate(e.date)}</td><td><div class="name">${esc(e.name)}</div><div class="meta">${esc(e.code)}</div></td>
      <td><span class="badge ${(EVENT_KIND[e.kind] || {cls: 'b-neutral'}).cls}">${(EVENT_KIND[e.kind] || {label: e.kind}).label}</span></td>
      <td>${esc(e.detail)}</td><td class="muted">${esc(e.actor) || '—'}</td></tr>`).join('')}</tbody></table></div>${rows.length > 300 ? `<p class="muted">Mostrando 300 de ${rows.length}.</p>` : ''}`
    : '<div class="card empty">Sin eventos todavía. Aquí se anotan solos las altas, traslados, cambios de estado y bajas.</div>';
}

/* ---------- Exportar ---------- */
function exportAssets() {
  const rows = [['Código', 'Bien', 'Categoría', 'Marca', 'Modelo', 'N.º serie', 'Cantidad', 'Costo unitario', 'Valor', 'Fecha de adquisición', 'Ubicación', 'Responsable', 'Estado', 'Plan de inversión', 'Observaciones']];
  [...state.assets].sort((a, b) => a.code.localeCompare(b.code, 'es', {numeric: true})).forEach(a => {
    const plan = getPlan(a.planId);
    rows.push([a.code, a.name, a.category, a.brand, a.model, a.serial, a.quantity, a.unitCost, assetValue(a), a.acquiredOn || '', a.location, a.responsible, (ASSET_STATUS[a.status] || {}).label || a.status, plan ? plan.name : '', a.notes]);
  });
  download(`mobiliario-y-equipo-${dayKey(new Date())}.csv`, toCSV(rows), 'text/csv;charset=utf-8');
}
function exportPlans() {
  const rows = [['Plan', 'Descripción', 'Desde', 'Hasta', 'Estado', 'Presupuesto', 'Invertido', 'Bienes', 'Pagos de empleados', 'Otros gastos', 'Saldo', 'Avance %', 'Tipos de bien', 'Unidades']];
  state.plans.forEach(p => {
    const s = planStats(p.id);
    rows.push([p.name, p.description, p.startsOn || '', p.endsOn || '', PLAN_STATE[planState(p)].label, p.budget, s.invested, s.assets, s.payroll, s.other, round2(p.budget - s.invested), p.budget > 0 ? Math.round(s.invested / p.budget * 1000) / 10 : '', s.items, s.units]);
  });
  const free = planStats('');
  rows.push(['Sin plan', '', '', '', '', '', free.invested, free.assets, free.payroll, free.other, '', '', free.items, free.units]);
  download(`planes-de-inversion-${dayKey(new Date())}.csv`, toCSV(rows), 'text/csv;charset=utf-8');
}

/* ---------- Pestaña Gastos y pagos ---------- */
const EXPENSE_IDEAS = ['Salario del mes', 'Pago quincenal', 'Bonificación', 'Stickers autoadhesivos para precios', 'Etiquetas de precio', 'Rollo de etiquetas', 'Cinta adhesiva', 'Bolsas y empaques'];

function drawExpensesTab() {
  const f = ui.ast, X = state.expenses, canEdit = can('expenses.manage');
  const sum = (...kinds) => round2(X.filter(x => !kinds.length || kinds.includes(x.kind)).reduce((a, x) => a + x.amount, 0));
  $('#astBody').innerHTML = `
  <div class="grid kpis">
    <div class="card kpi hi"><div class="l">Total gastado</div><div class="v num">${money(sum())}</div><div class="s">${X.length} ${X.length === 1 ? 'registro' : 'registros'}</div></div>
    <div class="card kpi"><div class="l">Pagos de empleados</div><div class="v num">${money(sum('empleado'))}</div><div class="s">${new Set(X.filter(x => x.kind === 'empleado' && x.payee).map(x => x.payee)).size} empleados</div></div>
    <div class="card kpi"><div class="l">Etiquetas y stickers</div><div class="v num">${money(sum('etiquetas'))}</div><div class="s">para poner precio</div></div>
    <div class="card kpi"><div class="l">Otros gastos</div><div class="v num">${money(sum('materiales', 'servicios', 'otro'))}</div><div class="s">materiales, servicios y otros</div></div>
  </div>
  <div class="toolbar">
    <input class="grow" id="exQ" type="search" placeholder="Buscar concepto, empleado o proveedor…" value="${esc(f.exq)}">
    <select id="exKind"><option value="">Todos los tipos</option>${Object.entries(EXPENSE_KINDS).map(([k, v]) => `<option value="${k}"${f.exkind === k ? ' selected' : ''}>${v.label}</option>`).join('')}</select>
    <select id="exPlan"><option value="">Todos los planes</option><option value="none"${f.explan === 'none' ? ' selected' : ''}>Sin plan</option>${state.plans.map(p => `<option value="${esc(p.id)}"${f.explan === p.id ? ' selected' : ''}>${esc(p.name)}</option>`).join('')}</select>
    <input type="month" id="exMonth" value="${esc(f.exmonth)}" aria-label="Mes">
    ${can('reports.export') ? '<button class="btn" data-action="exportExpenses">Exportar Excel</button>' : ''}${canEdit ? '<button class="btn primary" data-action="newExpense">+ Nuevo gasto</button>' : ''}
  </div>
  <div id="exTable"></div>`;
  drawExpenseRows();
}

function drawExpenseRows() {
  const f = ui.ast, q = f.exq.trim().toLowerCase(), canEdit = can('expenses.manage');
  const rows = state.expenses.filter(x =>
    (!q || `${x.concept} ${x.payee} ${x.notes}`.toLowerCase().includes(q)) && (!f.exkind || x.kind === f.exkind) &&
    (!f.explan || (f.explan === 'none' ? !x.planId : x.planId === f.explan)) && (!f.exmonth || (x.spentOn || '').slice(0, 7) === f.exmonth)
  ).sort((a, b) => (b.spentOn || '').localeCompare(a.spentOn || '') || (b.createdAt || '').localeCompare(a.createdAt || ''));
  if (!rows.length) {
    $('#exTable').innerHTML = `<div class="card empty">${state.expenses.length ? 'Ningún gasto coincide con los filtros.' : 'Aún no hay gastos ni pagos registrados.' + (canEdit ? ' Registra el primero con “Nuevo gasto”: pagos de empleados, stickers para los precios, materiales…' : '')}</div>`;
    return;
  }
  const total = round2(rows.reduce((a, x) => a + x.amount, 0));
  const staff = {}; rows.filter(x => x.kind === 'empleado').forEach(x => { const k = x.payee || 'Sin nombre'; staff[k] = round2((staff[k] || 0) + x.amount); });
  $('#exTable').innerHTML = `<div class="tablewrap"><table>
    <thead><tr><th>Fecha</th><th>Concepto</th><th>Tipo</th><th>Plan</th><th class="right">Monto</th>${canEdit ? '<th></th>' : ''}</tr></thead>
    <tbody>${rows.slice(0, 300).map(x => {
      const k = EXPENSE_KINDS[x.kind] || {label: x.kind, cls: 'b-neutral'}, plan = getPlan(x.planId);
      return `<tr><td class="num">${esc(x.spentOn || '')}</td>
        <td><div class="name">${esc(x.concept)}</div><div class="meta">${[x.payee, x.notes].filter(Boolean).map(esc).join(' · ')}</div></td>
        <td><span class="badge ${k.cls}">${k.label}</span></td>
        <td>${plan ? esc(plan.name) : '<span class="muted">Sin plan</span>'}</td>
        <td class="num right"><b>${money(x.amount)}</b></td>
        ${canEdit ? `<td><div class="acts"><button class="btn sm" data-action="editExpense" data-id="${esc(x.id)}">Editar</button><button class="btn sm danger" data-action="deleteExpense" data-id="${esc(x.id)}">Eliminar</button></div></td>` : ''}</tr>`;
    }).join('')}</tbody></table></div>
    <p class="muted">${rows.length} ${rows.length === 1 ? 'registro' : 'registros'} · ${money(total)}${rows.length > 300 ? ' · se muestran los 300 más recientes' : ''}</p>
    ${Object.keys(staff).length ? `<div class="card" style="margin-top:14px"><h3>Pagos por empleado</h3><div class="tablewrap" style="border:0;margin:0"><table><tbody>${Object.entries(staff).sort((a, b) => b[1] - a[1])
      .map(([n, v]) => `<tr><td>${esc(n)}</td><td class="num right"><b>${money(v)}</b></td></tr>`).join('')}</tbody></table></div></div>` : ''}`;
}

function expenseForm(id) {
  const x = id ? state.expenses.find(e => e.id === id) : {concept: '', kind: 'empleado', payee: '', amount: '', spentOn: dayKey(new Date()), planId: (state.plans.filter(p => planState(p) === 'active')[0] || {}).id || '', notes: ''};
  if (id && !x) return;
  const staff = [...new Set(state.expenses.filter(e => e.kind === 'empleado' && e.payee).map(e => e.payee))].sort((a, b) => a.localeCompare(b));
  openModal(`<h2>${id ? 'Editar gasto' : 'Nuevo gasto o pago'}</h2>
  <form data-form="expense" data-id="${id ? esc(id) : ''}">
    <div class="form-grid">
      <label class="f">Tipo<select name="xkind">${Object.entries(EXPENSE_KINDS).map(([k, v]) => `<option value="${k}"${x.kind === k ? ' selected' : ''}>${v.label}</option>`).join('')}</select></label>
      <label class="f">Fecha<input name="xdate" type="date" required value="${esc(x.spentOn)}"></label>
      <label class="f" style="grid-column:1/-1">Concepto<input name="xconcept" list="dlExIdeas" required minlength="2" maxlength="120" value="${esc(x.concept)}" placeholder="Ej. Salario de octubre, stickers para precios"></label>
      <label class="f">Empleado o proveedor<input name="xpayee" list="dlExStaff" maxlength="80" value="${esc(x.payee)}" placeholder="Quién recibe el pago"></label>
      <label class="f">Monto (USD)<input name="xamount" type="number" min="0.01" step="0.01" required value="${esc(x.amount)}"></label>
      <label class="f" style="grid-column:1/-1">Plan de inversión<select name="xplan"><option value="">Sin plan</option>${state.plans.map(p => `<option value="${esc(p.id)}"${x.planId === p.id ? ' selected' : ''}>${esc(p.name)}</option>`).join('')}</select></label>
      <label class="f" style="grid-column:1/-1">Observaciones<input name="xnotes" maxlength="300" value="${esc(x.notes)}" placeholder="Factura, periodo pagado…"></label>
    </div>
    <datalist id="dlExIdeas">${EXPENSE_IDEAS.map(c => `<option value="${esc(c)}">`).join('')}</datalist>
    <datalist id="dlExStaff">${staff.map(c => `<option value="${esc(c)}">`).join('')}</datalist>
    <div class="foot"><button type="button" class="btn" data-action="closeModal">Cancelar</button><button class="btn primary">Guardar</button></div>
  </form>`);
}
async function saveExpenseForm(form) {
  const el = form.elements, id = form.dataset.id, amount = Number(el.xamount.value);
  if (!(amount > 0)) throw new Error('El monto debe ser mayor a 0');
  const data = {kind: el.xkind.value, spentOn: el.xdate.value, concept: el.xconcept.value.trim(), payee: el.xpayee.value.trim(), amount: round2(amount), planId: el.xplan.value || null, notes: el.xnotes.value.trim()};
  await store.saveExpense({id: id || null, data});
  closeModal(); toast('Gasto guardado'); refresh();
}
async function removeExpense(id) {
  const x = state.expenses.find(e => e.id === id);
  if (!x || !confirm(`¿Eliminar "${x.concept}" (${money(x.amount)})? El monto deja de contar en la inversión del plan.`)) return;
  await run(null, async () => { await store.deleteExpense(id); toast('Gasto eliminado'); refresh(); });
}
function exportExpenses() {
  const rows = [['Fecha', 'Tipo', 'Concepto', 'Empleado o proveedor', 'Monto', 'Plan de inversión', 'Observaciones']];
  [...state.expenses].sort((a, b) => (a.spentOn || '').localeCompare(b.spentOn || '')).forEach(x => {
    const plan = getPlan(x.planId);
    rows.push([x.spentOn, (EXPENSE_KINDS[x.kind] || {}).label || x.kind, x.concept, x.payee, x.amount, plan ? plan.name : '', x.notes]);
  });
  download(`gastos-y-pagos-${dayKey(new Date())}.csv`, toCSV(rows), 'text/csv;charset=utf-8');
}
