'use strict';
/* Utilidades generales y helpers de interfaz (toast, modal, descargas, CSV) */

const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money = n => '$' + (Number(n) || 0).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2});
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const pad = (n, l = 2) => String(n).padStart(l, '0');
const dayKey = d => { d = new Date(d); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const fmtDate = d => new Date(d).toLocaleString('es', {dateStyle: 'short', timeStyle: 'short'});
const sortSizes = a => a.sort((x, y) => parseFloat(x) - parseFloat(y) || String(x).localeCompare(String(y)));

const ICONS = {
  dashboard: '<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>',
  inventory: '<path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/>',
  pos: '<circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>',
  movements: '<polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>',
  sales: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>',
  settings: '<line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/>'
};
function toast(msg, err) {
  const t = document.createElement('div');
  t.className = 'toast' + (err ? ' err' : ''); t.textContent = msg;
  $('#toasts').appendChild(t);
  setTimeout(() => t.remove(), err ? 5000 : 2800);
}
function openModal(html, wide) {
  $('#modalRoot').innerHTML = `<div class="backdrop" data-action="backdrop"><div class="modal${wide ? ' wide' : ''}" role="dialog" aria-modal="true">${html}</div></div>`;
  const first = $('#modalRoot input:not([type=hidden]),#modalRoot select');
  if (first) first.focus();
}
const closeModal = () => { $('#modalRoot').innerHTML = ''; };
function download(name, content, type) {
  const url = URL.createObjectURL(new Blob([content], {type}));
  const a = Object.assign(document.createElement('a'), {href: url, download: name});
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const toCSV = rows => '﻿' + rows.map(r => r.map(c => { c = String(c ?? ''); return /[",\n\r]/.test(c) ? '"' + c.replace(/"/g, '""') + '"' : c; }).join(',')).join('\r\n');
const options = (arr, sel) => arr.map(v => `<option value="${esc(v)}"${v === sel ? ' selected' : ''}>${esc(v)}</option>`).join('');
const uniq = k => [...new Set(state.products.map(p => p[k]).filter(Boolean))].sort((a, b) => a.localeCompare(b));

/* Ejecuta una acción asíncrona: bloquea el botón mientras corre y muestra el error como aviso */
async function run(btn, fn) {
  if (btn) btn.disabled = true;
  try { return await fn(); }
  catch (err) { toast((err && err.message) || 'Ocurrió un error', true); }
  finally { if (btn) btn.disabled = false; }
}
