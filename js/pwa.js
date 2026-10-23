'use strict';
/* PWA: service worker, ventana de versión nueva, instalación (botón y ventana en tablets y móviles) y aviso de conexión */

const pwa = {prompt: null, worker: null, reg: null, offered: false, waited: false, updateShown: false};
const PWA_KEY = 'pu_pwa';   // localStorage: 'installed' | 'never' | 'later:<fecha en ms>'
const PWA_LATER_MS = 3 * 24 * 3600 * 1000;
const pwaGet = () => { try { return localStorage.getItem(PWA_KEY) || ''; } catch (e) { return ''; } };
const pwaSet = v => { try { localStorage.setItem(PWA_KEY, v); } catch (e) {} };

const isStandalone = () => (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;
const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
/* móvil o tablet (incluye iPad y tablets Android con "sitio de escritorio") */
const isTouchDevice = () => isIOS() || /android|mobile|tablet/i.test(navigator.userAgent)
  || (navigator.maxTouchPoints > 1 && window.matchMedia && matchMedia('(pointer: coarse)').matches && !matchMedia('(hover: hover)').matches);
const pwaDeviceName = () => (/ipad|tablet/i.test(navigator.userAgent) || (isIOS() && !/iphone|ipod/i.test(navigator.userAgent))
  || (/android/i.test(navigator.userAgent) && !/mobile/i.test(navigator.userAgent))) ? 'tablet' : 'teléfono';

/* ¿Está instalada? Abierta como app es seguro; si alguna vez se abrió como app en este navegador queda anotado.
   Si el navegador ofrece instalar (beforeinstallprompt), es que no lo está. */
function pwaInstalled() {
  if (isStandalone()) { pwaSet('installed'); return true; }
  return !pwa.prompt && pwaGet() === 'installed';
}

const PWA_SHARE_ICON = '<svg class="pwa-share" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v12"/><path d="M8 7l4-4 4 4"/><path d="M6 11H5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-1"/></svg>';

function pwaDialog(html) {
  $('#pwaRoot').innerHTML = `<div class="backdrop pwa-back"><div class="modal pwa-modal" role="dialog" aria-modal="true" aria-labelledby="pwaTitle">
    <img class="pwa-logo" src="assets/icon-192.png" alt="" width="64" height="64">${html}</div></div>`;
  const b = $('#pwaRoot .btn.primary'); if (b) b.focus();
}
const pwaClose = () => { $('#pwaRoot').innerHTML = ''; };

function pwaInstallButton() {
  const b = $('#installBtn');
  if (b) b.hidden = !pwa.prompt || isStandalone();
}

/* ---- Versión nueva: ventana con el botón Actualizar; "Después" la deja como una barra pequeña ---- */
function pwaUpdateDialog(worker) {
  pwa.worker = worker;
  if (pwa.updateShown) return;
  pwa.updateShown = true;
  const items = (typeof pos !== 'undefined' && pos.cart) ? pos.cart.length : 0;
  pwaDialog(`<h2 id="pwaTitle">Hay una versión nueva</h2>
    <p>Se publicaron mejoras de la aplicación. Al actualizar, la pantalla se recarga.</p>
    ${items ? `<p class="pwa-warn">Tienes ${items} ${items === 1 ? 'artículo' : 'artículos'} en una venta sin terminar. Se vaciará al actualizar: cobra primero o actualiza después.</p>` : ''}
    <div class="foot"><button class="btn" data-action="pwaUpdateLater">Después</button><button class="btn primary" data-action="pwaUpdate">Actualizar ahora</button></div>`);
}
function pwaUpdateBar() {
  pwaClose();
  if ($('#updateBar')) return;
  const bar = document.createElement('div');
  bar.id = 'updateBar'; bar.className = 'update-bar no-print';
  bar.innerHTML = '<span>Hay una versión nueva de la aplicación.</span><button class="btn sm primary" data-action="pwaUpdate">Actualizar</button>';
  document.body.appendChild(bar);
}

/* ---- Instalación: en tablets y móviles, si no está instalada, se ofrece instalarla ---- */
function pwaOffer() {
  if (pwa.offered || !appReady || $('#pwaRoot').children.length || !isTouchDevice() || pwaInstalled()) return;
  const v = pwaGet();
  if (v === 'never' || (v.startsWith('later:') && Date.now() - Number(v.slice(6)) < PWA_LATER_MS)) return;
  // en iOS no hay evento de instalación; en los demás se espera un momento a que el navegador lo ofrezca
  if (!pwa.prompt && !isIOS() && !pwa.waited) return;
  pwa.offered = true;
  const dev = pwaDeviceName();
  let body, primary;
  if (pwa.prompt) {
    body = `<p>Instala Plante en tu ${dev} para abrirla como una app: pantalla completa, acceso desde el inicio y abre aunque no haya internet.</p>`;
    primary = '<button class="btn primary" data-action="pwaInstall">Instalar la aplicación</button>';
  } else if (isIOS()) {
    body = `<p>La aplicación aún no está instalada en este ${dev}. Para instalarla:</p>
      <ol class="pwa-steps"><li>Toca el botón <b>Compartir</b> ${PWA_SHARE_ICON} del navegador (abajo o arriba).</li>
      <li>Elige <b>Añadir a pantalla de inicio</b>.</li><li>Toca <b>Añadir</b>.</li></ol>`;
    primary = '<button class="btn primary" data-action="pwaLater">Entendido</button>';
  } else {
    body = `<p>La aplicación aún no está instalada en este ${dev}. Para instalarla:</p>
      <ol class="pwa-steps"><li>Abre el <b>menú</b> del navegador (los tres puntos).</li>
      <li>Elige <b>Instalar aplicación</b> o <b>Añadir a la pantalla de inicio</b>.</li><li>Confirma.</li></ol>`;
    primary = '<button class="btn primary" data-action="pwaLater">Entendido</button>';
  }
  pwaDialog(`<h2 id="pwaTitle">Instala la aplicación</h2>${body}
    <div class="foot pwa-foot"><button class="btn quiet" data-action="pwaNever">No volver a mostrar</button><button class="btn" data-action="pwaLater">Más tarde</button>${primary}</div>`);
}

function initPWA() {
  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault(); pwa.prompt = e;
    if (pwaGet() === 'installed') pwaSet('');   // el navegador la ofrece: ya no está instalada
    pwaInstallButton(); pwaOffer();
  });
  window.addEventListener('appinstalled', () => { pwa.prompt = null; pwaSet('installed'); pwaClose(); pwaInstallButton(); toast('Aplicación instalada'); });
  // en modo demostración todo es local y funciona sin internet; con Supabase, las ventas y cambios lo necesitan
  window.addEventListener('offline', () => { if (store && store.mode === 'supabase') toast('Sin conexión. Las ventas y cambios necesitan internet.', true); });
  window.addEventListener('online', () => { if (store && store.mode === 'supabase') toast('Conexión restablecida'); });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && $('#pwaRoot').children.length) ACTIONS[$('#pwaRoot [data-action=pwaUpdate]') ? 'pwaUpdateLater' : 'pwaLater']();
  });
  pwaInstalled();   // si se abre como app, queda anotado
  setTimeout(() => { pwa.waited = true; pwaOffer(); }, 4000);

  // el service worker solo funciona con https (o localhost)
  if (!('serviceWorker' in navigator) || !(location.protocol === 'https:' || ['localhost', '127.0.0.1'].includes(location.hostname))) return;
  navigator.serviceWorker.register('sw.js').then(reg => {
    pwa.reg = reg;
    if (reg.waiting && navigator.serviceWorker.controller) pwaUpdateDialog(reg.waiting);
    reg.addEventListener('updatefound', () => {
      const w = reg.installing;
      if (w) w.addEventListener('statechange', () => { if (w.state === 'installed' && navigator.serviceWorker.controller) pwaUpdateDialog(w); });
    });
    // busca versiones nuevas al volver a la app y cada 10 minutos
    const check = () => reg.update().catch(() => {});
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') check(); });
    setInterval(check, 10 * 60 * 1000);
  }).catch(() => {});
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (pwa.worker && !reloading) { reloading = true; location.reload(); } });
}
