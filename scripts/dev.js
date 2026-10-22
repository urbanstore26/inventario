'use strict';
/* Servidor local de desarrollo: genera js/config.js desde .env y sirve SOLO la app
   (index.html, css/, js/, assets/). Nunca sirve .env, .git, scripts/ ni supabase/. */

const http = require('http');
const fs = require('fs');
const path = require('path');
const {ROOT, writeConfig} = require('./env');

try {
  const r = writeConfig(path.join(ROOT, 'js', 'config.js'));
  console.log(r.configured ? 'Supabase: configurado desde .env' : 'Supabase: sin claves en .env → modo demostración');
  if (r.warn) console.warn('Aviso: ' + r.warn);
} catch (e) { console.error('Error: ' + e.message); process.exit(1); }

const MIME = {'.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.webp': 'image/webp'};
const ALLOWED = [/^\/index\.html$/, /^\/(css|js|assets)\/[^\0]+$/];

const server = http.createServer((req, res) => {
  let p;
  try { p = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch (e) { res.writeHead(400).end('Bad request'); return; }
  if (p === '/') p = '/index.html';
  const file = path.resolve(ROOT, '.' + p);
  const inside = file.startsWith(ROOT + path.sep);
  if (!inside || !ALLOWED.some(re => re.test(p.replace(/\\/g, '/'))) || p.split('/').some(s => s.startsWith('.'))) {
    res.writeHead(404, {'Content-Type': 'text/plain; charset=utf-8'}).end('No encontrado');
    return;
  }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404, {'Content-Type': 'text/plain; charset=utf-8'}).end('No encontrado'); return; }
    res.writeHead(200, {'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store'});
    res.end(data);
  });
});

let port = Number(process.env.PORT) || 3000;
server.on('error', e => {
  if (e.code === 'EADDRINUSE' && port < (Number(process.env.PORT) || 3000) + 10) { port++; server.listen(port, '127.0.0.1'); }
  else { console.error(e.message); process.exit(1); }
});
server.on('listening', () => console.log(`Plante Urban Store → http://localhost:${port}`));
server.listen(port, '127.0.0.1');
