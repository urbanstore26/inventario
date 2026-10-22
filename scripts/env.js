'use strict';
/* Lee las claves de Supabase desde .env (o variables de entorno), las valida y genera js/config.js.
   Sin dependencias. Uso directo: `node scripts/env.js` (o `npm run config`). */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

function parseEnv(text) {
  const out = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const i = line.indexOf('=');
    if (i < 1) continue;
    let v = line.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    out[line.slice(0, i).trim()] = v;
  }
  return out;
}

/* Las variables del sistema (hosting / CI) tienen prioridad sobre el archivo .env */
function loadEnv() {
  let file = {};
  try { file = parseEnv(fs.readFileSync(path.join(ROOT, '.env'), 'utf8')); } catch (e) { /* sin .env: modo demostración */ }
  const pick = k => String(process.env[k] ?? file[k] ?? '').trim();
  return {url: pick('SUPABASE_URL').replace(/\/+$/, ''), key: pick('SUPABASE_ANON_KEY')};
}

function jwtRole(key) {
  try {
    const payload = key.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(Buffer.from(payload, 'base64').toString('utf8')).role || null;
  } catch (e) { return null; }
}

/* Devuelve {error} si algo está mal, {warn} si conviene avisar, o {} si todo bien */
function validate({url, key}) {
  if (!url && !key) return {};
  if (!url || !key) return {error: 'Define SUPABASE_URL y SUPABASE_ANON_KEY juntas (o déjalas vacías para el modo demostración).'};
  if (!/^https?:\/\//i.test(url)) return {error: 'SUPABASE_URL debe empezar con https://'};
  // Una clave secreta en el navegador daría acceso total a la base de datos: se rechaza siempre.
  if (key.startsWith('sb_secret_') || jwtRole(key) === 'service_role') {
    return {error: 'Esa es una clave SECRETA (service_role). Nunca debe ir en una app de navegador. Usa la clave pública: "anon" o "publishable" (Project Settings → API).'};
  }
  const role = jwtRole(key);
  if (role && role !== 'anon') return {warn: `La clave tiene rol "${role}"; se esperaba "anon".`};
  return {};
}

function writeConfig(target) {
  const env = loadEnv();
  const check = validate(env);
  if (check.error) { const e = new Error(check.error); e.code = 'BAD_ENV'; throw e; }
  const cfg = {supabaseUrl: env.url, supabaseAnonKey: env.key};
  fs.mkdirSync(path.dirname(target), {recursive: true});
  fs.writeFileSync(target,
`'use strict';
/* GENERADO por scripts/ a partir de .env — no editar y no subir a git (está en .gitignore).
   Vacío = modo demostración. */
window.APP_CONFIG = ${JSON.stringify(cfg, null, 2)};
`);
  return {configured: !!(env.url && env.key), warn: check.warn};
}

module.exports = {ROOT, loadEnv, validate, writeConfig, parseEnv};

if (require.main === module) {
  try {
    const r = writeConfig(path.join(ROOT, 'js', 'config.js'));
    console.log(r.configured ? 'js/config.js generado con Supabase configurado.' : 'js/config.js generado en modo demostración (sin claves en .env).');
    if (r.warn) console.warn('Aviso: ' + r.warn);
  } catch (e) { console.error('Error: ' + e.message); process.exit(1); }
}
