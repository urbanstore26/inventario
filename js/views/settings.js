'use strict';
/* Vista: Ajustes */

function renderSettings() {
  const st = state.settings;
  $('#view').innerHTML = `
  <div class="grid cols-2">
    <div class="card"><h3>General</h3>
      <form data-form="settings" class="grid">
        <label class="f">Nombre de la tienda<input name="storeName" required value="${esc(st.storeName)}"></label>
        <label class="f">Alerta de stock bajo (pares por defecto)<input name="threshold" type="number" min="0" step="1" required value="${st.threshold}"></label>
        <label class="f">Tallas disponibles (separadas por coma)<input name="sizes" required value="${esc(st.sizes.join(', '))}"></label>
        <div><button class="btn primary">Guardar ajustes</button></div>
      </form></div>
    <div class="card"><h3>Datos</h3>
      ${store.mode === 'local' ? `
      <p class="muted" style="margin-top:0">Modo demostración: los datos (y las fotos) se guardan solo en este navegador. Haz respaldos con frecuencia.</p>
      <div class="grid">
        <button class="btn" data-action="exportInv">Exportar inventario (CSV)</button>
        <button class="btn" data-action="backup">Descargar respaldo completo (JSON)</button>
        <button class="btn" data-action="restore">Restaurar respaldo…</button>
        <hr style="border:0;border-top:1px solid var(--line);width:100%">
        <button class="btn danger" data-action="resetDemo">Cargar datos de ejemplo</button>
        <button class="btn danger" data-action="clearAll">Borrar todo y empezar de cero</button>
      </div>` : `
      <p class="muted" style="margin-top:0">Conectado a Supabase como <b>${esc(store.user.email)}</b>. Los datos están en la base de datos y los respalda Supabase.</p>
      <div class="grid">
        <button class="btn" data-action="exportInv">Exportar inventario (CSV)</button>
        <button class="btn" data-action="exportSales">Exportar ventas (CSV)</button>
        <button class="btn" data-action="exportMov">Exportar movimientos (CSV)</button>
      </div>`}
    </div>
  </div>`;
}
