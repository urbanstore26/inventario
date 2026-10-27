'use strict';
/* Fotos de los estilos: miniaturas, imagen de relleno y preparación (redimensionado) antes de guardar */

const SHOE_SVG = '<svg viewBox="0 0 64 44" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round">' +
  '<path d="M5 30c0-5 5-6 11-8l6-11c1.5-2.4 5-2 6 .6l2 5c5 1.8 14 3.4 20 8.6 2.4 2.1 2.6 5.8-.4 6.8H7c-1.2 0-2-.8-2-2z"/>' +
  '<path d="M4 33h56v3c0 1.6-1.2 3-3 3H7c-1.8 0-3-1.4-3-3z"/><path d="M24 17l3 3M29 19l3 3"/></svg>';

/* size: '' (48px) | 'sm' (40px) | 'md' (64px) | 'lg' (132px) */
function thumb(p, size = '') {
  const inner = p.image ? `<img src="${esc(p.image)}" alt="${esc(p.name)}" loading="lazy" decoding="async">` : SHOE_SVG;
  return `<span class="thumb ${size}">${inner}</span>`;
}

const blobToDataURL = blob => new Promise((ok, fail) => {
  const r = new FileReader();
  r.onload = () => ok(r.result); r.onerror = () => fail(new Error('No se pudo leer la imagen'));
  r.readAsDataURL(blob);
});

/* Valida, corrige orientación, reduce a `max` px y comprime a JPEG. Devuelve {blob, dataUrl}. */
async function prepareImage(file, max = 900) {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) throw new Error('Usa una imagen JPG, PNG o WEBP');
  if (file.size > 15 * 1024 * 1024) throw new Error('La imagen supera los 15 MB');
  let bmp;
  try { bmp = await createImageBitmap(file); } catch (e) { throw new Error('No se pudo abrir la imagen'); }
  const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(bmp.width * k)); c.height = Math.max(1, Math.round(bmp.height * k));
  const g = c.getContext('2d');
  g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);   // PNG transparentes → fondo blanco
  g.drawImage(bmp, 0, 0, c.width, c.height);
  if (bmp.close) bmp.close();
  const blob = await new Promise(ok => c.toBlob(ok, 'image/jpeg', 0.82));
  if (!blob) throw new Error('No se pudo procesar la imagen');
  return {blob, dataUrl: await blobToDataURL(blob)};
}

/* Bienes de la tienda: mismo marco que los zapatos, con un dibujo de equipo cuando no hay foto */
const ASSET_SVG = '<svg viewBox="0 0 64 44" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round">' +
  '<rect x="12" y="5" width="40" height="26" rx="3"/><path d="M24 39h16M32 31v8"/><path d="M18 12h28M18 18h18"/></svg>';
function assetThumb(a, size = '') {
  const inner = a.image ? `<img src="${esc(a.image)}" alt="${esc(a.name)}" loading="lazy" decoding="async">` : ASSET_SVG;
  return `<span class="thumb ${size}">${inner}</span>`;
}
