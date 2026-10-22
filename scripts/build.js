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
fs.copyFileSync(path.join(ROOT, 'index.html'), path.join(DIST, 'index.html'));
for (const dir of ['css', 'js', 'assets']) fs.cpSync(path.join(ROOT, dir), path.join(DIST, dir), {recursive: true});
// assets/logo-original.jpg es solo el archivo fuente del logo: no se publica
fs.rmSync(path.join(DIST, 'assets', 'logo-original.jpg'), {force: true});

try {
  const r = writeConfig(path.join(DIST, 'js', 'config.js'));
  console.log('dist/ listo.', r.configured ? 'Supabase configurado.' : 'Sin claves: modo demostración.');
  if (r.warn) console.warn('Aviso: ' + r.warn);
} catch (e) {
  fs.rmSync(DIST, {recursive: true, force: true});   // nunca dejar un dist/ a medias para publicar
  console.error('Error: ' + e.message);
  process.exit(1);
}
