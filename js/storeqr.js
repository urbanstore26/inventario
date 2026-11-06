'use strict';
/* Pie de los tickets: redes sociales + código QR de la ubicación de la tienda.
   El QR se genera aquí mismo (librería js/vendor/qrcode.js): es un QR estático con el enlace escrito dentro,
   no depende de ningún servicio externo y no caduca. Si el enlace queda vacío, no se imprime. */

const STORE_MAP_URL = 'https://maps.app.goo.gl/epKHV1jkAKQrzvWK8';
const STORE_MAP_TEXT = 'Escanea para ubicarnos';

/* SVG vectorial del QR. Cada cuadrito mide 7 puntos de la impresora térmica (203 ppp = 0,875 mm): sale nítido y fácil de leer. */
function qrSvg(text) {
  if (typeof qrcode !== 'function' || !String(text).trim()) return '';
  const qr = qrcode(0, 'M');
  qr.addData(String(text).trim(), 'Byte');
  qr.make();
  const n = qr.getModuleCount();
  let d = '';
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (!qr.isDark(r, c)) continue;
      let w = 1;
      while (c + w < n && qr.isDark(r, c + w)) w++;
      d += `M${c} ${r}h${w}v1h-${w}z`;
      c += w - 1;
    }
  }
  const mm = +(n * 0.875).toFixed(2);
  return `<svg class="tk-qr" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n} ${n}" width="${mm}mm" height="${mm}mm" shape-rendering="crispEdges"><path d="${d}" fill="#000"/></svg>`;
}

function mapQrBlock() {
  const svg = qrSvg(STORE_MAP_URL);
  return svg ? `<div class="tk-qrbox"><div class="tk-center tk-small">${esc(STORE_MAP_TEXT)}</div>${svg}</div>` : '';
}

/* Todo lo que va al final del ticket, después de "Conserva este comprobante" */
function ticketFooter() {
  return socialsBlock() + mapQrBlock();
}
