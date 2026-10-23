'use strict';
/* Prepara la carpeta dist/ para publicar: copia solo lo que usa el navegador y genera dist/js/config.js
   desde .env o desde variables de entorno del hosting (SUPABASE_URL, SUPABASE_ANON_KEY).
   Publica el contenido de dist/, nunca la raíz del proyecto. */

const fs = require('fs');
const path = require('path');
const {ROOT, writeConfig} = require('./env');

const DIST = path.join(ROOT, 'dist');
fs.rmSync(DIST, {recursive: true, force: true});
fs.mkdirSync(DIST, {recursive: true});
for (const f of ['index.html', 'sw.js', 'manifest.webmanifest']) fs.copyFileSync(path.join(ROOT, f), path.join(DIST, f));
for (const dir of ['css', 'js', 'assets']) fs.cpSync(path.join(ROOT, dir), path.join(DIST, dir), {recursive: true});
// assets/logo-original.jpg es solo el archivo fuente del logo: no se publica
fs.rmSync(path.join(DIST, 'assets', 'logo-original.jpg'), {force: true});

/* sw.js: lista de archivos para tener sin conexión + huella (cambia con cualquier archivo, así los navegadores actualizan la app) */
function stampServiceWorker() {
  const files = [];
  (function walk(dir) {
    for (const e of fs.readdirSync(dir, {withFileTypes: true})) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p); else files.push(path.relative(DIST, p).split(path.sep).join('/'));
    }
  })(DIST);
  const shell = files.filter(f => f !== 'sw.js' && f !== 'js/config.js').sort();
  const hash = require('crypto').createHash('sha1');
  shell.forEach(f => hash.update(f).update(fs.readFileSync(path.join(DIST, f))));
  const sw = path.join(DIST, 'sw.js');
  let src = fs.readFileSync(sw, 'utf8');
  if (!src.includes(`'__BUILD__'`) || !src.includes(`'__SHELL__'`)) throw new Error('sw.js no tiene los marcadores __BUILD__ y __SHELL__');
  src = src.replace(`'__BUILD__'`, () => JSON.stringify(hash.digest('hex').slice(0, 12)))
           .replace(`['__SHELL__']`, () => JSON.stringify(['./', ...shell, 'js/config.js']));
  fs.writeFileSync(sw, src);
  return shell.length;
}

try {
  const r = writeConfig(path.join(DIST, 'js', 'config.js'));
  const n = stampServiceWorker();
  console.log('dist/ listo (' + n + ' archivos para uso sin conexión).', r.configured ? 'Supabase configurado.' : 'Sin claves: modo demostración.');
  if (r.warn) console.warn('Aviso: ' + r.warn);
} catch (e) {
  fs.rmSync(DIST, {recursive: true, force: true});   // nunca dejar un dist/ a medias para publicar
  console.error('Error: ' + e.message);
  process.exit(1);
}
