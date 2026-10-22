'use strict';
/* Datos de ejemplo para el primer uso */

function seed(s) {
  let r = 20240611;
  const rnd = () => { r |= 0; r = r + 0x6D2B79F5 | 0; let t = Math.imul(r ^ r >>> 15, 1 | r); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  const defs = [
    ['Air Max 90','Nike','Tenis deportivos','Hombre','Blanco/Negro',62,129.99,39,45],
    ['Superstar','Adidas','Casual urbano','Unisex','Blanco',48,99.99,36,44],
    ['Old Skool','Vans','Casual urbano','Unisex','Negro',34,74.99,36,45],
    ['Chuck Taylor All Star','Converse','Casual urbano','Unisex','Negro',28,64.99,35,44],
    ['RS-X','Puma','Tenis deportivos','Hombre','Azul',52,109.99,39,45],
    ['574 Classic','New Balance','Casual urbano','Mujer','Gris',46,94.99,35,41],
    ['Classic Leather','Reebok','Tenis deportivos','Unisex','Blanco',40,84.99,36,44],
    ['6-Inch Premium','Timberland','Botas','Hombre','Trigo',98,189.99,40,46,{42:1,43:1}],
    ['Go Walk','Skechers','Casual urbano','Mujer','Rosado',30,69.99,35,41],
    ['Classic Clog','Crocs','Sandalias y slides','Unisex','Negro',22,49.99,36,45],
    ['Oxford Cuero','Plante Urban','Formal','Hombre','Café',36,79.99,39,45],
    ['Slide Urban Pro','Plante Urban','Sandalias y slides','Unisex','Negro',9,24.99,36,45,{}]
  ];
  const t0 = new Date(); t0.setDate(t0.getDate() - 30);
  defs.forEach((d, i) => {
    const p = {id: uid() + i, sku: 'PU-' + pad(i + 1, 4), name: d[0], brand: d[1], category: d[2], gender: d[3], color: d[4], cost: d[5], price: d[6], minStock: '', stock: {}, createdAt: t0.toISOString()};
    for (let z = d[7]; z <= d[8]; z++) p.stock[z] = d[9] ? (d[9][z] || 0) : Math.floor(rnd() * 8) + 2;
    s.products.push(p);
    Object.entries(p.stock).forEach(([sz, q]) => q > 0 && s.movements.push({id: uid() + sz + i, date: t0.toISOString(), productId: p.id, sku: p.sku, name: p.name, size: sz, type: 'inicial', qty: q, balance: q, note: 'Stock inicial', ref: ''}));
  });
  const sales = [];
  for (let k = 0; k < 30; k++) {
    const dt = new Date(); dt.setDate(dt.getDate() - Math.floor(rnd() * 10)); dt.setHours(9 + Math.floor(rnd() * 10), Math.floor(rnd() * 60), 0, 0);
    sales.push(dt);
  }
  sales.sort((a, b) => a - b).forEach(dt => {
    const items = [];
    for (let n = 1 + Math.floor(rnd() * 2); n > 0; n--) {
      const p = s.products[Math.floor(rnd() * s.products.length)];
      const avail = Object.entries(p.stock).filter(([, q]) => q > 1);
      if (!avail.length) continue;
      const [sz] = avail[Math.floor(rnd() * avail.length)];
      const it = items.find(x => x.pid === p.id && x.size === sz);
      if (it) continue;
      items.push({pid: p.id, sku: p.sku, name: p.name, size: sz, qty: 1, price: p.price, cost: p.cost});
    }
    if (!items.length) return;
    const num = s.settings.nextSale++;
    const id = 'S' + uid() + num;
    const subtotal = items.reduce((a, i) => a + i.price * i.qty, 0);
    const method = ['Efectivo', 'Efectivo', 'Tarjeta', 'Transferencia'][Math.floor(rnd() * 4)];
    items.forEach(i => {
      const p = s.products.find(x => x.id === i.pid); p.stock[i.size] -= i.qty;
      s.movements.push({id: uid() + i.sku + i.size, date: dt.toISOString(), productId: p.id, sku: p.sku, name: p.name, size: i.size, type: 'venta', qty: -i.qty, balance: p.stock[i.size], note: 'Venta V-' + pad(num, 4), ref: id});
    });
    s.sales.push({id, num, date: dt.toISOString(), customer: '', method, items, subtotal, discount: 0, total: subtotal, cost: items.reduce((a, i) => a + i.cost * i.qty, 0), paid: subtotal, change: 0, status: 'completada'});
  });
  s.movements.sort((a, b) => new Date(b.date) - new Date(a.date));
  s.sales.sort((a, b) => new Date(b.date) - new Date(a.date));
}
