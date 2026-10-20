/* Admin panel. All authorisation is enforced by the backend; the UI only hides what a role cannot use. */
(function () {
  const NC = window.NC, $ = NC.$, $$ = NC.$$, esc = NC.esc, view = $('#view');
  const SKEY = 'nc_admin_session';   // sessionStorage: cleared when the tab closes; token expires after 6h server-side
  let session = null, pub = {}, charts = {}, syncing = 0;
  const OWNER = () => session && session.user.role === 'OWNER';
  const LABEL = { RECEIVED: 'Received', CONFIRMED: 'Confirmed', PREPARING: 'Preparing', READY_FOR_PICKUP: 'Ready for pickup', OUT_FOR_DELIVERY: 'Out for delivery', DELIVERED: 'Delivered', CANCELLED: 'Cancelled' };
  const iso = d => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(d);
  const tag = (s, l) => `<span class="tag ${esc(s)}">${esc(l || LABEL[s] || s)}</span>`;
  const num = (n, d) => Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: d == null ? 2 : d });

  function setSync(state, msg) { const s = $('#sync'); s.className = 'sync' + (state === 'err' ? ' err' : ''); s.textContent = state === 'busy' ? 'Syncing with Google Sheets…' : state === 'err' ? 'Sync failed: ' + msg : 'Synced ' + new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }); }
  async function A(action, data, opts) {
    syncing++; setSync('busy');
    try { const r = await NC.api(action, Object.assign({ token: session && session.token }, data || {}), opts); syncing--; if (!syncing) setSync('ok'); return r; }
    catch (e) { syncing--; setSync('err', e.message); if (['UNAUTHORIZED', 'SESSION_EXPIRED'].includes(e.code) && session) signOut(e.message); throw e; }
  }
  function onErr(e, el) { if (['UNAUTHORIZED', 'SESSION_EXPIRED'].includes(e.code)) return; if (el) NC.alert(el, e.message, 'err'); NC.toast(e.message, 'err'); }
  const save = (btn, fn, ok) => async () => { NC.busy(btn, true, 'Saving…'); try { await fn(); if (ok) NC.toast(ok, 'ok'); } catch (e) { onErr(e, null); } finally { NC.busy(btn, false); } };

  /* ---------- auth ---------- */
  function showLogin(msg) { $('#boot').hidden = true; $('#app').hidden = true; $('#login').hidden = false; NC.alert($('#lmsg'), msg || (!NC.configured() ? 'Backend not connected: set API_URL in assets/js/config.js.' : ''), msg ? 'warn' : 'err'); }
  function signOut(msg) { if (session) { const t = session.token; session = null; sessionStorage.removeItem(SKEY); NC.api('logout', { token: t }).catch(() => {}); } Object.values(charts).forEach(c => c && c.destroy()); charts = {}; showLogin(typeof msg === 'string' ? msg : 'You have been signed out.'); }
  $('#lf').addEventListener('submit', async e => {
    e.preventDefault(); const b = $('#lgo'); NC.busy(b, true, 'Signing in…'); NC.alert($('#lmsg'), '');
    try { const r = await NC.api('login', { username: $('#u').value, password: $('#p').value }); $('#p').value = ''; session = { token: r.token, user: r.user }; sessionStorage.setItem(SKEY, JSON.stringify(session)); await start(); }
    catch (err) { NC.alert($('#lmsg'), err.message, 'err'); } finally { NC.busy(b, false); }
  });
  $('#logout').addEventListener('click', () => signOut('You have been signed out.'));
  $('#menu').addEventListener('click', () => { const n = $('#nav'); n.classList.toggle('open'); $('#menu').setAttribute('aria-expanded', n.classList.contains('open')); });
  $('#refresh').addEventListener('click', () => route());
  $('#chpw').addEventListener('click', () => {
    const bg = document.createElement('div'); bg.className = 'modal-bg';
    bg.innerHTML = `<div class="modal"><h3>Change password</h3><div id="pm"></div><div class="field"><label for="op">Current password</label><input id="op" type="password" autocomplete="current-password"></div><div class="field"><label for="np">New password (10+ characters)</label><input id="np" type="password" autocomplete="new-password"></div><div class="acts"><button class="btn ghost sm" data-c>Cancel</button><button class="btn primary sm" data-s>Change</button></div></div>`;
    document.body.appendChild(bg);
    bg.addEventListener('click', async e => { if (e.target === bg || e.target.dataset.c !== undefined) bg.remove(); if (e.target.dataset.s !== undefined) { try { NC.busy(e.target, true); await A('changePassword', { oldPassword: $('#op', bg).value, newPassword: $('#np', bg).value }); bg.remove(); NC.toast('Password changed', 'ok'); } catch (err) { NC.busy(e.target, false); NC.alert($('#pm', bg), err.message); } } });
  });

  /* ---------- navigation ---------- */
  const PAGES = [['dashboard', 'Dashboard'], ['orders', 'Orders'], ['enquiries', 'Event enquiries'], ['products', 'Products'], ['categories', 'Categories', 'o'], ['inventory', 'Inventory'], ['reports', 'Reports'], ['shop', 'Shop status & hours'], ['owner', 'Owner profile', 'o'], ['settings', 'Settings & discounts', 'o'], ['users', 'Users', 'o'], ['audit', 'Audit log', 'o']];
  function buildNav() { $('#nav').innerHTML = PAGES.filter(p => !p[2] || OWNER()).map(p => `<a href="#/${p[0]}" data-p="${p[0]}">${p[1]}</a>`).join(''); }
  function paintShopPill(s) { const p = $('#shopPill'); if (!s) return; p.className = 'pill ' + NC.statusClass(s); p.textContent = s.label; }
  async function route() {
    const page = (location.hash.replace('#/', '') || 'dashboard').split('?')[0], ok = PAGES.some(p => p[0] === page && (!p[2] || OWNER()));
    const cur = ok ? page : 'dashboard';
    $$('#nav a').forEach(a => { if (a.dataset.p === cur) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
    $('#nav').classList.remove('open'); view.innerHTML = '<div class="empty"><span class="spinner dark"></span><p>Loading…</p></div>';
    Object.values(charts).forEach(c => c && c.destroy()); charts = {};
    try { await R[cur](); } catch (e) { if (!['UNAUTHORIZED', 'SESSION_EXPIRED'].includes(e.code)) NC.alert(view, e.message, 'err', route); }
    view.focus({ preventScroll: true });
  }
  window.addEventListener('hashchange', () => session && route());
  async function start() {
    try { const me = await A('me'); session.user = me.user; paintShopPill(me.status); } catch (e) { return showLogin(); }
    try { pub = (await NC.apiGet('catalog')).settings || {}; } catch (e) {}
    $('#boot').hidden = true; $('#login').hidden = true; $('#app').hidden = false; $('#who').textContent = session.user.name + ' (' + session.user.role.toLowerCase() + ')';
    buildNav(); route();
  }

  /* ---------- Dashboard ---------- */
  function chart(id, type, labels, sets, opt) { const c = $('#' + id); if (!c || !window.Chart) { if (c) c.parentNode.innerHTML = '<p class="mini">Chart library unavailable (offline). Tables below still work.</p>'; return; } charts[id] = new Chart(c, { type, data: { labels, datasets: sets }, options: Object.assign({ responsive: true, maintainAspectRatio: false, plugins: { legend: { display: sets.length > 1 || type === 'doughnut' } } }, opt || {}) }); }
  const PAL = ['#3f8f55', '#e0a526', '#b3392f', '#1f2a24', '#6a9bd1', '#8e6bbf', '#d97b3a', '#7fb79a'];
  var R_dash_state = { from: iso(new Date(Date.now() - 29 * 86400000)), to: iso(new Date()), cat: '' };
  const R = {};
  R.dashboard = async function () {
    const st = R_dash_state; let cats = [];
    try { cats = (await A('listCategories')).items; } catch (e) {}
    const d = await A('dashboard', { from: st.from, to: st.to, categoryId: st.cat });
    paintShopPill(d.status); const k = d.kpi, t = d.today, sc = d.statusCounts;
    const K = (l, v, s, w) => `<div class="kpi ${w ? 'warn' : ''}"><div class="l">${l}</div><div class="v">${v}</div>${s ? `<div class="s">${s}</div>` : ''}</div>`;
    view.innerHTML = `<h1>Dashboard</h1>
    <div class="filters"><div class="field"><label for="df">From</label><input type="date" id="df" value="${st.from}"></div><div class="field"><label for="dt">To</label><input type="date" id="dt" value="${st.to}"></div><div class="field"><label for="dc">Category</label><select id="dc"><option value="">All categories</option>${cats.map(c => `<option value="${esc(c.CategoryID)}" ${st.cat === c.CategoryID ? 'selected' : ''}>${esc(c.Name)}</option>`).join('')}</select></div><button class="btn sm light" data-d="7" style="border:1.5px solid var(--line)">7 days</button><button class="btn sm light" data-d="30" style="border:1.5px solid var(--line)">30 days</button><button class="btn sm primary" id="dgo">Apply</button><button class="btn sm light" id="dcsv" style="border:1.5px solid var(--line)">Export CSV</button></div>
    <h2 style="font-size:1rem">Today</h2><div class="kpis">${K("Today's sales", '₹' + num(t.sales), 'Booked, excl. cancelled')}${K("Today's orders", t.orders)}${K('Kg sold today', num(t.kg, 2))}${K('Pending (received)', t.byStatus.RECEIVED || 0, 'need confirmation', (t.byStatus.RECEIVED || 0) > 0)}${K('Confirmed', t.byStatus.CONFIRMED || 0)}${K('Preparing', t.byStatus.PREPARING || 0)}${K('Completed', t.byStatus.DELIVERED || 0)}${K('Cancelled', t.byStatus.CANCELLED || 0)}${K('Shop', esc(d.status.label), esc(NC.statusLine(d.status)))}</div>
    <h2 style="font-size:1rem">${esc(d.range.from)} → ${esc(d.range.to)}</h2><div class="kpis">${K('Booked revenue', '₹' + num(k.bookedRevenue), 'Non-cancelled orders')}${K('Completed sales', '₹' + num(k.completedSales), 'Delivered orders')}${K('Collected', '₹' + num(k.collected), 'Verified payments')}${K('Pending payments', '₹' + num(k.pending), 'Booked − collected', k.pending > 0)}${K('Kg sold', num(k.kgSold, 2))}${K('Orders', k.orders, k.cancelled + ' cancelled')}${K('Est. gross profit', k.estGrossProfit == null ? '—' : '₹' + num(k.estGrossProfit), k.estGrossProfit == null ? 'Add product costs to see profit' : 'Costed items only (' + k.costCoveragePct + '% of item revenue)')}${K('Discounts / delivery', '₹' + num(k.discounts) + ' / ₹' + num(k.deliveryCharges))}${K('Open enquiries', d.pendingEnquiries, 'awaiting action', d.pendingEnquiries > 0)}${K('Low-stock items', d.lowStock.length, d.lowStock.map(x => esc(x.name)).join(', ') || 'None', d.lowStock.length > 0)}</div>
    <div class="charts"><div class="chart"><h3>Daily sales (₹)</h3><div class="box"><canvas id="c1"></canvas></div></div><div class="chart"><h3>Order volume</h3><div class="box"><canvas id="c2"></canvas></div></div><div class="chart"><h3>Monthly revenue (₹)</h3><div class="box"><canvas id="c3"></canvas></div></div><div class="chart"><h3>Best-selling products (₹)</h3><div class="box"><canvas id="c4"></canvas></div></div><div class="chart"><h3>Category performance (₹)</h3><div class="box"><canvas id="c5"></canvas></div></div><div class="chart"><h3>Kilograms sold by product</h3><div class="box"><canvas id="c6"></canvas></div></div><div class="chart"><h3>Retail vs bulk/event (₹)</h3><div class="box"><canvas id="c7"></canvas></div></div><div class="chart"><h3>Order status</h3><div class="box"><canvas id="c8"></canvas></div></div></div>
    ${!d.products.length ? '<div class="empty"><p>No sales in this period yet. Charts will fill in as orders arrive.</p></div>' : ''}
    <div class="grid2" style="margin-top:14px"><div><h2 style="font-size:1rem">Recent orders</h2><div class="tbl-wrap"><table class="t"><tbody>${d.recentOrders.map(o => `<tr><td><a href="#/orders" data-open="${esc(o.orderId)}">${esc(o.orderId)}</a><div class="mini">${esc(NC.fmtDT(o.date))}</div></td><td>${esc(o.customer)}</td><td class="num">₹${num(o.amount)}</td><td>${tag(o.status)}</td></tr>`).join('') || '<tr><td>No orders yet</td></tr>'}</tbody></table></div></div>${d.recentActivity ? `<div><h2 style="font-size:1rem">Recent admin activity</h2><div class="tbl-wrap"><table class="t"><tbody>${d.recentActivity.map(a => `<tr><td>${esc(a.action)}<div class="mini">${esc(a.id)}</div></td><td>${esc(a.user)}</td><td class="mini">${esc(NC.fmtDT(a.at))}</td></tr>`).join('') || '<tr><td>None</td></tr>'}</tbody></table></div></div>` : ''}</div>
    <div class="defs"><strong>Definitions.</strong> <em>Booked revenue</em> = total of non-cancelled orders (incl. delivery, less discounts). <em>Completed sales</em> = delivered orders. <em>Collected</em> = payments staff verified. <em>Pending</em> = booked − collected. <em>Profit</em> is an estimate that only counts items with a product cost set. Cancelled orders are excluded everywhere. Last refreshed ${esc(NC.fmtDT(d.serverTime))}.</div>`;
    const labels = d.daily.map(x => x.date.slice(5));
    chart('c1', 'bar', labels, [{ label: 'Revenue', data: d.daily.map(x => x.revenue), backgroundColor: '#3f8f55' }]);
    chart('c2', 'line', labels, [{ label: 'Orders', data: d.daily.map(x => x.orders), borderColor: '#e0a526', tension: .3 }, { label: 'Kg', data: d.daily.map(x => x.kg), borderColor: '#1f2a24', tension: .3 }]);
    chart('c3', 'bar', d.monthly.map(x => x.month), [{ label: 'Revenue', data: d.monthly.map(x => x.revenue), backgroundColor: '#1f2a24' }]);
    chart('c4', 'bar', d.products.slice(0, 8).map(x => x.name), [{ label: '₹', data: d.products.slice(0, 8).map(x => x.revenue), backgroundColor: '#3f8f55' }], { indexAxis: 'y' });
    chart('c5', 'bar', d.categories.map(x => x.name), [{ label: '₹', data: d.categories.map(x => x.revenue), backgroundColor: '#e0a526' }]);
    chart('c6', 'bar', d.products.slice(0, 8).map(x => x.name), [{ label: 'kg', data: d.products.slice(0, 8).map(x => x.kg), backgroundColor: '#6a9bd1' }], { indexAxis: 'y' });
    chart('c7', 'doughnut', ['Retail', 'Bulk / event'], [{ data: [d.retailVsBulk.retail.revenue, d.retailVsBulk.bulk.revenue], backgroundColor: PAL }]);
    chart('c8', 'doughnut', Object.keys(sc).map(s => LABEL[s] || s), [{ data: Object.values(sc), backgroundColor: PAL }]);
    const go = () => { st.from = $('#df').value; st.to = $('#dt').value; st.cat = $('#dc').value; route(); };
    $('#dgo').onclick = go;
    $$('[data-d]').forEach(b => b.onclick = () => { st.to = iso(new Date()); st.from = iso(new Date(Date.now() - (Number(b.dataset.d) - 1) * 86400000)); route(); });
    $('#dcsv').onclick = () => NC.download(`naeem-dashboard-${d.range.from}_${d.range.to}.csv`, NC.csv(['Date', 'Booked revenue (₹)', 'Orders', 'Kg'], d.daily.map(x => [x.date, x.revenue, x.orders, x.kg])));
    $$('[data-open]', view).forEach(a => a.addEventListener('click', () => { sessionStorage.setItem('nc_open_order', a.dataset.open); }));
  };

  /* ---------- Orders ---------- */
  const OS = { page: 1, q: '', status: '', fulfilment: '', type: '', from: '', to: '' };
  const NEXT = o => { const flow = ['CONFIRMED', 'PREPARING', o.FulfilmentType === 'DELIVERY' ? 'OUT_FOR_DELIVERY' : 'READY_FOR_PICKUP', 'DELIVERED'], rank = { RECEIVED: 0, CONFIRMED: 1, PREPARING: 2, READY_FOR_PICKUP: 3, OUT_FOR_DELIVERY: 3, DELIVERED: 4 }; return flow.filter(s => rank[s] > rank[o.OrderStatus]); };
  R.orders = async function () {
    const r = await A('listOrders', OS), pages = Math.max(1, Math.ceil(r.total / r.pageSize));
    view.innerHTML = `<h1>Orders <span class="mini">${r.total} found</span></h1>
    <div class="filters"><div class="field"><label for="oq">Search</label><input id="oq" placeholder="Order ID, phone, customer" value="${esc(OS.q)}"></div><div class="field"><label for="os">Status</label><select id="os"><option value="">All</option>${Object.keys(LABEL).map(s => `<option value="${s}" ${OS.status === s ? 'selected' : ''}>${LABEL[s]}</option>`).join('')}</select></div><div class="field"><label for="of">Fulfilment</label><select id="of"><option value="">All</option><option value="PICKUP" ${OS.fulfilment === 'PICKUP' ? 'selected' : ''}>Pickup</option><option value="DELIVERY" ${OS.fulfilment === 'DELIVERY' ? 'selected' : ''}>Delivery</option></select></div><div class="field"><label for="ot">Type</label><select id="ot"><option value="">All</option><option value="RETAIL" ${OS.type === 'RETAIL' ? 'selected' : ''}>Retail</option><option value="BULK" ${OS.type === 'BULK' ? 'selected' : ''}>Bulk / event</option></select></div><div class="field"><label for="ofr">From</label><input type="date" id="ofr" value="${OS.from}"></div><div class="field"><label for="oto">To</label><input type="date" id="oto" value="${OS.to}"></div><button class="btn primary sm" id="ogo">Filter</button><button class="btn light sm" id="oclr" style="border:1.5px solid var(--line)">Clear</button></div>
    <div class="tbl-wrap"><table class="t"><thead><tr><th>Order</th><th>Date</th><th>Customer</th><th>Products</th><th class="num">Kg</th><th class="num">Amount</th><th>Payment</th><th>Fulfilment</th><th>Status</th><th>Staff</th><th></th></tr></thead><tbody>${r.orders.map(o => `<tr><td><strong>${esc(o.orderId)}</strong>${o.type === 'BULK' ? '<div class="mini">Bulk</div>' : ''}</td><td class="mini">${esc(NC.fmtDT(o.date))}<div>For: ${esc(NC.fmtDT(o.requestedAt))}</div></td><td>${esc(o.customer)}<div class="mini">${esc(o.phone)}</div></td><td style="min-width:180px">${esc(o.products)}</td><td class="num">${num(o.totalKg, 2)}</td><td class="num">₹${num(o.amount)}</td><td>${esc(o.paymentMethod)}<div>${tag(o.paymentStatus, o.paymentStatus)}</div></td><td>${esc(o.fulfilment)}</td><td>${tag(o.status)}</td><td class="mini">${esc(o.assignedTo)}</td><td><button class="btn sm primary" data-o="${esc(o.orderId)}">Open</button></td></tr>`).join('') || `<tr><td colspan="11"><div class="empty"><p>No orders match these filters.</p></div></td></tr>`}</tbody></table></div>
    <div class="pager"><button class="btn sm light" id="pp" ${OS.page <= 1 ? 'disabled' : ''}>← Prev</button><span>Page ${r.page} / ${pages}</span><button class="btn sm light" id="pn" ${OS.page >= pages ? 'disabled' : ''}>Next →</button></div>`;
    const apply = () => { Object.assign(OS, { page: 1, q: $('#oq').value, status: $('#os').value, fulfilment: $('#of').value, type: $('#ot').value, from: $('#ofr').value, to: $('#oto').value }); route(); };
    $('#ogo').onclick = apply; $('#oq').onkeydown = e => { if (e.key === 'Enter') apply(); };
    $('#oclr').onclick = () => { Object.assign(OS, { page: 1, q: '', status: '', fulfilment: '', type: '', from: '', to: '' }); route(); };
    $('#pp').onclick = () => { OS.page--; route(); }; $('#pn').onclick = () => { OS.page++; route(); };
    $$('[data-o]', view).forEach(b => b.onclick = () => orderModal(b.dataset.o));
    const pend = sessionStorage.getItem('nc_open_order'); if (pend) { sessionStorage.removeItem('nc_open_order'); orderModal(pend); }
  };
  async function orderModal(id) {
    let d; try { d = await A('getOrder', { orderId: id }); } catch (e) { return onErr(e); }
    const o = d.order, bg = document.createElement('div'); bg.className = 'modal-bg';
    const done = ['DELIVERED', 'CANCELLED'].includes(o.OrderStatus), nxt = NEXT(o), ph = String(o.Phone).replace(/\D/g, '');
    bg.innerHTML = `<div class="modal wide" role="dialog" aria-modal="true" aria-label="Order ${esc(id)}"><div style="display:flex;justify-content:space-between;gap:8px"><h3>Order ${esc(id)} ${tag(o.OrderStatus)}</h3><button class="btn sm ghost" data-close style="color:var(--ink)">✕</button></div><div id="om"></div>
    <dl class="kv"><dt>Customer</dt><dd>${esc(o.CustomerName)} · <a href="tel:+91${ph}">${esc(o.Phone)}</a></dd><dt>Type</dt><dd>${esc(o.OrderType)} · ${esc(o.FulfilmentType)}</dd><dt>Requested</dt><dd>${esc(NC.fmtDT(o.RequestedDateTime))}</dd>${o.FulfilmentType === 'DELIVERY' ? `<dt>Address</dt><dd>${esc(o.DeliveryAddress)}${o.Landmark ? ' — ' + esc(o.Landmark) : ''}</dd>` : ''}<dt>Customer notes</dt><dd>${esc(o.Notes) || '—'}</dd><dt>Payment</dt><dd>${esc(o.PaymentMethod)} · ${tag(o.PaymentStatus, o.PaymentStatus)} · paid ₹${num(d.paid)} · due ₹${num(d.due)}</dd>${o.CancelReason ? `<dt>Cancel reason</dt><dd>${esc(o.CancelReason)}</dd>` : ''}${o.EnquiryID ? `<dt>From enquiry</dt><dd>${esc(o.EnquiryID)}</dd>` : ''}</dl>
    <div class="tbl-wrap"><table class="t"><thead><tr><th>Item</th><th class="num">Qty</th><th class="num">₹/kg</th><th class="num">Line</th></tr></thead><tbody>${d.items.map(i => `<tr><td>${esc(i.ProductNameSnapshot)}${i.CuttingInstructions ? `<div class="mini">${esc(i.CuttingInstructions)}</div>` : ''}</td><td class="num">${esc(NC.fmtG(Number(i.QuantityGrams)))}</td><td class="num">${num(i.PricePerKgSnapshot)}</td><td class="num">₹${num(i.LineTotal)}</td></tr>`).join('')}<tr><td colspan="3" class="num">Subtotal</td><td class="num">₹${num(o.Subtotal)}</td></tr>${Number(o.Discount) ? `<tr><td colspan="3" class="num">Discount ${esc(o.DiscountCode)}</td><td class="num">− ₹${num(o.Discount)}</td></tr>` : ''}${Number(o.DeliveryCharge) ? `<tr><td colspan="3" class="num">Delivery</td><td class="num">₹${num(o.DeliveryCharge)}</td></tr>` : ''}<tr><td colspan="3" class="num"><strong>Total</strong></td><td class="num"><strong>₹${num(o.TotalAmount)}</strong></td></tr></tbody></table></div>
    ${done ? '' : `<h3 style="margin-top:14px">Update status</h3><div class="acts-row">${nxt.map(s => `<button class="btn sm primary" data-st="${s}">${LABEL[s]}</button>`).join('')}<button class="btn sm danger" data-cancel>Cancel order…</button></div>`}
    <h3>Record verified payment</h3><div class="filters"><div class="field"><label for="pa">Amount ₹</label><input id="pa" type="number" min="0" step="0.01" value="${d.due || ''}"></div><div class="field"><label for="pm2">Received via</label><select id="pm2"><option>CASH</option><option>UPI</option><option>CARD</option><option>OTHER</option></select></div><div class="field"><label for="pr">Reference</label><input id="pr" maxlength="80" placeholder="UPI ref (optional)"></div><button class="btn sm primary" data-pay ${d.due <= 0 || o.OrderStatus === 'CANCELLED' ? 'disabled' : ''}>Record payment</button></div>
    <h3>Internal note / assignment</h3><div class="filters"><div class="field" style="flex:1"><label for="nt">Note</label><input id="nt" maxlength="400"></div><div class="field"><label for="as">Assigned to</label><input id="as" value="${esc(o.AssignedTo)}" maxlength="60"></div><button class="btn sm light" data-note style="border:1.5px solid var(--line)">Save</button></div>${o.InternalNotes ? `<pre class="mini" style="white-space:pre-wrap">${esc(o.InternalNotes)}</pre>` : ''}
    <h3>History</h3><ul class="timeline">${d.history.map(h => `<li><strong>${esc(LABEL[h.Status] || h.Status)}</strong> <span class="mini">by ${esc(h.ChangedBy)}</span><small>${esc(NC.fmtDT(h.CreatedAt))}${h.Note ? ' — ' + esc(h.Note) : ''}</small></li>`).join('')}</ul>
    <div class="acts"><button class="btn sm wa" data-wa>WhatsApp customer</button><button class="btn sm light" data-print style="border:1.5px solid var(--line)">Print invoice</button><button class="btn sm ghost" data-close style="color:var(--ink)">Close</button></div></div>`;
    document.body.appendChild(bg);
    const reload = async () => { bg.remove(); await route(); orderModal(id); };
    bg.addEventListener('click', async e => {
      const t = e.target; if (t === bg || t.dataset.close !== undefined) { bg.remove(); route(); return; }
      try {
        if (t.dataset.st) { await A('updateOrderStatus', { orderId: id, status: t.dataset.st }); NC.toast('Status updated', 'ok'); reload(); }
        else if (t.dataset.cancel !== undefined) { const reason = await NC.confirm('This will cancel the order and return any tracked stock.', { title: 'Cancel order ' + id, input: 'Reason for cancellation (required)', danger: true, ok: 'Cancel order', cancel: 'Keep order' }); if (reason) { await A('updateOrderStatus', { orderId: id, status: 'CANCELLED', reason }); NC.toast('Order cancelled', 'ok'); reload(); } }
        else if (t.dataset.pay !== undefined) { NC.busy(t, true); try { await A('recordPayment', { orderId: id, amount: Number($('#pa', bg).value), method: $('#pm2', bg).value, reference: $('#pr', bg).value }); NC.toast('Payment recorded', 'ok'); reload(); } finally { NC.busy(t, false); } }
        else if (t.dataset.note !== undefined) { await A('updateOrder', { orderId: id, internalNote: $('#nt', bg).value, assignedTo: $('#as', bg).value }); NC.toast('Saved', 'ok'); reload(); }
        else if (t.dataset.wa !== undefined) { window.open(`https://wa.me/91${ph}?text=${encodeURIComponent(`Hello ${o.CustomerName}, this is NAEEM CHICKENS LABDAHA about your order ${id} (status: ${LABEL[o.OrderStatus]}).`)}`, '_blank', 'noopener'); }
        else if (t.dataset.print !== undefined) invoice(d);
      } catch (err) { onErr(err, $('#om', bg)); }
    });
  }
  function invoice(d) {
    const o = d.order, w = window.open('', '_blank'); if (!w) { NC.toast('Allow pop-ups to print the invoice.', 'err'); return; }
    const rows = d.items.map(i => `<tr><td>${esc(i.ProductNameSnapshot)}</td><td style="text-align:right">${esc(NC.fmtG(Number(i.QuantityGrams)))}</td><td style="text-align:right">₹${num(i.PricePerKgSnapshot)}</td><td style="text-align:right">₹${num(i.LineTotal)}</td></tr>`).join('');
    w.document.write(`<!doctype html><title>Invoice ${esc(o.OrderID)}</title><style>body{font:14px system-ui;max-width:700px;margin:24px auto;color:#111}table{width:100%;border-collapse:collapse}td,th{padding:6px;border-bottom:1px solid #ddd;text-align:left}h1{margin:0}.r{text-align:right}</style><h1>${esc(pub.BusinessName || 'NAEEM CHICKENS LABDAHA')}</h1><p>${esc(pub.Address || pub.Locality || '')}<br>${esc(pub.Phone || '')}</p><h2>Invoice / Order ${esc(o.OrderID)}</h2><p>Date: ${esc(NC.fmtDT(o.OrderDate))}<br>Customer: ${esc(o.CustomerName)} (${esc(o.Phone)})<br>${o.FulfilmentType === 'DELIVERY' ? 'Delivery to: ' + esc(o.DeliveryAddress) : 'Pickup'}</p><table><tr><th>Item</th><th class="r">Qty</th><th class="r">Rate/kg</th><th class="r">Amount</th></tr>${rows}<tr><td colspan="3" class="r">Subtotal</td><td class="r">₹${num(o.Subtotal)}</td></tr>${Number(o.Discount) ? `<tr><td colspan="3" class="r">Discount</td><td class="r">−₹${num(o.Discount)}</td></tr>` : ''}${Number(o.DeliveryCharge) ? `<tr><td colspan="3" class="r">Delivery</td><td class="r">₹${num(o.DeliveryCharge)}</td></tr>` : ''}<tr><td colspan="3" class="r"><b>Total</b></td><td class="r"><b>₹${num(o.TotalAmount)}</b></td></tr><tr><td colspan="3" class="r">Paid (verified)</td><td class="r">₹${num(d.paid)}</td></tr><tr><td colspan="3" class="r">Balance due</td><td class="r">₹${num(d.due)}</td></tr></table><p>Thank you!</p><script>onload=()=>print()<\/script>`); w.document.close();
  }
  if (window.NC_ADMIN_EXT) window.NC_ADMIN_EXT(R, { view, A, onErr, save, tag, num, LABEL, iso, OWNER, route, paintShopPill, getSession: () => session });

  /* ---------- boot ---------- */
  (async function () {
    session = (() => { try { return JSON.parse(sessionStorage.getItem(SKEY)); } catch (e) { return null; } })();
    if (!NC.configured()) { showLogin(); return; }
    if (session && session.token) await start(); else showLogin('');
  })();
})();
