'use strict';
/* Vista: Panel */

function renderDashboard() {
  const P = state.products, units = P.reduce((a, p) => a + totalStock(p), 0);
  const cost = P.reduce((a, p) => a + totalStock(p) * p.cost, 0), retail = P.reduce((a, p) => a + totalStock(p) * p.price, 0);
  const sales = validSales(), now = new Date(), tk = dayKey(now), mk = tk.slice(0, 7);
  const todaySales = sales.filter(s => dayKey(s.date) === tk), monthSales = sales.filter(s => dayKey(s.date).slice(0, 7) === mk);
  const sum = (a, f) => a.reduce((x, s) => x + f(s), 0);
  const alerts = P.map(p => ({p, st: stockStatus(p), t: totalStock(p)})).filter(x => x.st.key !== 'ok').sort((a, b) => a.t - b.t);
  const cats = {}; P.forEach(p => cats[p.category || 'Sin categoría'] = (cats[p.category || 'Sin categoría'] || 0) + totalStock(p));
  const catRows = Object.entries(cats).sort((a, b) => b[1] - a[1]), catMax = Math.max(1, ...catRows.map(c => c[1]));
  const days = [...Array(7)].map((_, i) => { const d = new Date(); d.setDate(d.getDate() - (6 - i)); return d; });
  const dayTot = days.map(d => sum(sales.filter(s => dayKey(s.date) === dayKey(d)), s => s.total)), dayMax = Math.max(1, ...dayTot);
  const since = new Date(); since.setDate(since.getDate() - 30);
  const top = {}; sales.filter(s => new Date(s.date) >= since).forEach(s => s.items.forEach(i => { const t = top[i.sku] || (top[i.sku] = {name: i.name, qty: 0, rev: 0}); t.qty += i.qty; t.rev += i.qty * i.price; }));
  const topRows = Object.values(top).sort((a, b) => b.qty - a.qty).slice(0, 5);

  $('#view').innerHTML = `
  <div class="grid kpis">
    <div class="card kpi hi"><div class="l">Ventas de hoy</div><div class="v num">${money(sum(todaySales, s => s.total))}</div><div class="s">${todaySales.length} transacciones</div></div>
    <div class="card kpi"><div class="l">Ventas del mes</div><div class="v num">${money(sum(monthSales, s => s.total))}</div><div class="s">${can('costs.view') ? 'Utilidad ' + money(sum(monthSales, s => s.total - s.cost)) : monthSales.length + ' ventas'}</div></div>
    <div class="card kpi"><div class="l">Pares en stock</div><div class="v num">${units.toLocaleString('en-US')}</div><div class="s">${P.length} modelos</div></div>
    <div class="card kpi"><div class="l">${can('costs.view') ? 'Valor del inventario' : 'Inventario a precio de venta'}</div><div class="v num">${money(can('costs.view') ? cost : retail)}</div><div class="s">${can('costs.view') ? 'A precio de venta ' + money(retail) : units + ' pares'}</div></div>
  </div>
  <div class="grid cols-2">
    <div class="card"><h3>Ventas · últimos 7 días</h3>
      <div class="vbars">${days.map((d, i) => `<div class="c"><em class="num">${dayTot[i] ? '$' + Math.round(dayTot[i]) : ''}</em><i style="height:${dayTot[i] / dayMax * 100 * .8}%"></i><small>${d.toLocaleDateString('es', {weekday: 'short'})}</small></div>`).join('')}</div></div>
    <div class="card"><h3>Pares por categoría</h3>
      ${catRows.length ? catRows.map(([c, q]) => `<div class="hbar"><span>${esc(c)}</span><div class="t"><i style="width:${q / catMax * 100}%"></i></div><b class="num right">${q}</b></div>`).join('') : '<div class="empty">Sin productos</div>'}</div>
    <div class="card"><h3>Alertas de reposición (${alerts.length})</h3>
      ${alerts.length ? `<div class="tablewrap" style="border:0"><table><tbody>${alerts.slice(0, 8).map(a => `<tr><td><div class="name">${esc(a.p.name)}</div><div class="meta">${[a.p.brand, a.p.sku].filter(Boolean).map(esc).join(' · ')}</div></td><td class="num">${a.t} pares</td><td><span class="badge ${a.st.cls}">${a.st.label}</span></td><td class="right"><button class="btn sm" data-action="addStock" data-id="${a.p.id}">Reponer</button></td></tr>`).join('')}</tbody></table></div>` : '<div class="empty">Todo el inventario está sobre el mínimo</div>'}</div>
    <div class="card"><h3>Más vendidos · 30 días</h3>
      ${topRows.length ? `<div class="tablewrap" style="border:0"><table><tbody>${topRows.map((t, i) => `<tr><td class="muted num">${i + 1}</td><td class="name">${esc(t.name)}</td><td class="num">${t.qty} pares</td><td class="num right">${money(t.rev)}</td></tr>`).join('')}</tbody></table></div>` : '<div class="empty">Aún no hay ventas</div>'}</div>
  </div>`;
}
