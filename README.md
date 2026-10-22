# Plante Urban Store · Inventario

Sistema de inventario y punto de venta para una tienda de zapatos. HTML + CSS + JavaScript, sin compilación.

## Estructura

```
index.html              estructura de la página
css/style.css           estilos
assets/                 logo (original, círculo, versiones con fondo transparente para tema claro/oscuro) y favicon
js/
  config.js             URL y clave pública de Supabase (vacío = modo demostración)
  utils.js, images.js   utilidades y manejo de fotos
  data.js               estado en memoria y reglas de negocio
  store/local.js        backend local (modo demostración, localStorage)
  store/supabase.js     backend Supabase (login, base de datos, fotos)
  auth.js               pantalla de login y sesión
  router.js, actions.js, events.js, main.js
  views/                una pantalla por archivo
supabase/migrations/    esquema SQL (tablas, funciones, seguridad, bucket de fotos)
```

Las pantallas solo hablan con `store`, así que funcionan igual con cualquiera de los dos backends.

## Identidad visual

La paleta sale del logo (muestreada de los cordones) y vive como variables al inicio de `css/style.css`:

| Color | Valor | Uso |
|---|---|---|
| Naranja | `#F7A208` | stock bajo, acentos |
| Turquesa | `#08A9C1` | disponible / completado, gráficos |
| Rosa | `#E90B5B` | acción principal, agotado / anulado, errores |

La base es neutra (crema, negro y gris cálido). `--lace` es el degradado naranja·turquesa·rosa que se repite como detalle de marca.

## Modo demostración (sin configurar nada)

Abre `index.html`. Con `js/config.js` vacío, el botón "Entrar en modo demostración" abre la app con datos de ejemplo guardados en el navegador. **No hay cuentas ni seguridad real** en este modo.

## Activar login y base de datos reales (Supabase)

1. Crea un proyecto en [supabase.com](https://supabase.com).
2. Aplica las migraciones, en orden. Con el CLI: `supabase link` y `supabase db push`. O pega cada archivo de `supabase/migrations/` en **SQL Editor** y ejecútalo.
3. En **Authentication → Providers → Email**, desactiva **Allow new users to sign up** (las cuentas las crea un administrador).
4. En **Authentication → Users → Add user**, crea tu cuenta (con **Auto Confirm User**). **El primer usuario que se crea queda como administrador.** Los siguientes quedan como vendedores; cambia el rol en la tabla `profiles` (columna `role`: `admin` o `vendedor`; `active = false` desactiva a alguien).
5. Copia la **Project URL** y la clave **anon / publishable** (Project Settings → API) en `js/config.js`. Nunca pongas la `service_role` key ahí.
6. Abre `index.html` e inicia sesión. Para uso en varios equipos, publícalo en cualquier hosting estático.

## Qué crea la base de datos

| Tabla | Contenido |
|---|---|
| `profiles` | usuario, nombre, rol (`admin`/`vendedor`), activo |
| `store_settings` | nombre de la tienda, alerta de stock bajo, tallas (una sola fila) |
| `products` | SKU único, marca, categoría, género, color, costo, precio, mínimo, ruta de la foto |
| `product_stock` | pares por producto y talla (nunca negativo) |
| `sales`, `sale_items` | ventas con número correlativo y sus líneas (con precio y costo del momento) |
| `stock_movements` | libro de movimientos: inicial, entrada, salida, ajuste, venta, devolución |

Las fotos van al bucket público `product-images` (máx. 2 MB, JPG/PNG/WEBP).

**Reglas de stock y ventas en el servidor** (funciones SQL, atómicas): `register_sale`, `void_sale`, `adjust_stock`, `set_product_stock`. El navegador no puede escribir directamente en stock, ventas ni movimientos, y el precio de una venta se toma de la base de datos, no del navegador.

| | admin | vendedor |
|---|---|---|
| Ver inventario, ventas, movimientos | sí | sí |
| Registrar ventas | sí | sí |
| Crear/editar/eliminar productos y fotos | sí | no |
| Entradas, salidas y ajustes de stock | sí | no |
| Anular ventas, cambiar ajustes y roles | sí | no |

## Limitaciones conocidas

- El vendedor no ve costos en pantalla, pero el costo es un dato del producto y podría leerse consultando la API directamente. Si eso importa, hay que mover el costo a una tabla separada solo para admin.
- La app carga las últimas 500 ventas y 1000 movimientos; el CSV exporta lo cargado.
- Los datos del modo demostración no se migran solos a Supabase.
