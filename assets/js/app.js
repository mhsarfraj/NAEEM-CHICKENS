/* Shared UI: layout, status badge, cart store, toasts, modals, catalog loader. */
(function () {
  const NC = (window.NC = window.NC || {});
  const cfg = window.NC_CONFIG;
  const $ = (s, r) => (r || document).querySelector(s), $$ = (s, r) => [...(r || document).querySelectorAll(s)];
  NC.$ = $; NC.$$ = $$;
  NC.esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  NC.inr = n => '₹' + Number(n).toLocaleString('en-IN', { minimumFractionDigits: Number.isInteger(Number(n)) ? 0 : 2, maximumFractionDigits: 2 });
  NC.paise = r => Math.round(Number(r) * 100);
  NC.fmtG = g => (g >= 1000 ? (g / 1000) + ' kg' : g + ' g');
  NC.uuid = () => (crypto.randomUUID ? crypto.randomUUID() : 'r' + Date.now().toString(36) + Math.random().toString(36).slice(2, 12));
  NC.fmtDT = s => { if (!s) return ''; const d = new Date(String(s).replace(' ', 'T') + '+05:30'); return isNaN(d) ? s : d.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true }); };

  const I = {
    cart: '<path d="M6 6h15l-2 9H8L6 6zm0 0L5 3H2M9 20a1 1 0 100-2 1 1 0 000 2zm9 0a1 1 0 100-2 1 1 0 000 2z"/>',
    home: '<path d="M3 11l9-8 9 8M5 10v10h5v-6h4v6h5V10"/>',
    grid: '<path d="M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z"/>',
    truck: '<path d="M2 6h12v10H2zM14 9h4l4 4v3h-8zM6 19a2 2 0 100-4 2 2 0 000 4zm11 0a2 2 0 100-4 2 2 0 000 4z"/>',
    pin: '<path d="M12 22s7-6.5 7-12a7 7 0 10-14 0c0 5.5 7 12 7 12zM12 12a2.5 2.5 0 100-5 2.5 2.5 0 000 5z"/>',
    track: '<path d="M3 12h4l3-8 4 16 3-8h4"/>',
    leaf: '<path d="M5 19c0-9 6-14 15-14 0 9-5 15-14 15M5 19l8-8"/>',
    shield: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M9 12l2 2 4-4"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    users: '<circle cx="9" cy="8" r="3.5"/><path d="M2 20c0-4 3-6 7-6s7 2 7 6M17 5a3.5 3.5 0 010 7M22 20c0-3-2-5-4-5.6"/>',
    wa: '<path d="M20.5 3.5A11 11 0 003.4 17.3L2 22l4.8-1.3A11 11 0 1020.5 3.5zM8.5 7.5c.3-.6.6-.6.9-.6h.7c.2 0 .5.1.6.5l.9 2.1c.1.3 0 .5-.1.7l-.6.8c-.1.2-.2.4 0 .6.6 1.1 1.600 2 2.800 2.600.3.1.5.1.6-.1l.9-1c.2-.2.4-.2.6-.1l2 1c.3.1.4.3.4.5 0 .8-.6 1.800-1.700 2.100-2.900.8-8-2.100-9.100-6.200-.3-1.100.1-2.200.5-2.800z" fill="currentColor" stroke="none"/>',
    box: '<path d="M3 7l9-4 9 4v10l-9 4-9-4zM3 7l9 4 9-4M12 11v10"/>',
    phone: '<path d="M5 3h4l2 5-2.500 1.500a11 11 0 006 6L16 13l5 2v4a2 2 0 01-2 2A16 16 0 013 5a2 2 0 012-2z"/>'
  };
  NC.icon = (n, extra) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ${extra || ''}>${I[n] || ''}</svg>`;

  /* ---------- toast / confirm ---------- */
  NC.toast = (msg, type) => {
    let box = $('#toasts'); if (!box) { box = document.createElement('div'); box.id = 'toasts'; box.setAttribute('role', 'status'); box.setAttribute('aria-live', 'polite'); document.body.appendChild(box); }
    const t = document.createElement('div'); t.className = 'toast ' + (type || ''); t.textContent = msg; box.appendChild(t);
    setTimeout(() => t.remove(), type === 'err' ? 6500 : 3500);
  };
  NC.confirm = (msg, o) => new Promise(res => {
    o = o || {};
    const bg = document.createElement('div'); bg.className = 'modal-bg';
    bg.innerHTML = `<div class="modal" role="alertdialog" aria-modal="true" aria-labelledby="cm-t"><h3 id="cm-t">${NC.esc(o.title || 'Please confirm')}</h3><p>${NC.esc(msg)}</p>${o.input ? `<div class="field"><label for="cm-i">${NC.esc(o.input)}</label><input id="cm-i" maxlength="200"></div>` : ''}<div class="acts"><button class="btn ghost sm" data-x="0">${NC.esc(o.cancel || 'Cancel')}</button><button class="btn ${o.danger ? 'danger' : 'primary'} sm" data-x="1">${NC.esc(o.ok || 'Confirm')}</button></div></div>`;
    const done = v => { bg.remove(); document.removeEventListener('keydown', esc); res(v); };
    const esc = e => { if (e.key === 'Escape') done(false); };
    bg.addEventListener('click', e => { const x = e.target.dataset && e.target.dataset.x; if (x === '1') { if (o.input) { const v = $('#cm-i', bg).value.trim(); if (!v) { $('#cm-i', bg).focus(); return; } return done(v); } done(true); } else if (x === '0' || e.target === bg) done(false); });
    document.addEventListener('keydown', esc); document.body.appendChild(bg); (($('#cm-i', bg) || $('[data-x="1"]', bg))).focus();
  });
  NC.busy = (btn, on, label) => { if (!btn) return; if (on) { btn.dataset.l = btn.innerHTML; btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> ' + NC.esc(label || 'Please wait…'); } else { btn.disabled = false; if (btn.dataset.l) btn.innerHTML = btn.dataset.l; } };
  NC.alert = (el, msg, type, retry) => { el.innerHTML = msg ? `<div class="alert ${type || 'err'}" role="alert"><div style="flex:1">${NC.esc(msg)}</div>${retry ? '<button class="btn sm light" data-retry>Retry</button>' : ''}</div>` : ''; if (retry) { const b = $('[data-retry]', el); b && b.addEventListener('click', retry); } };

  /* ---------- cart (localStorage: only productId + grams + cut; nothing sensitive) ---------- */
  const KEY = 'nc_cart_v1';
  const load = () => { try { const c = JSON.parse(localStorage.getItem(KEY) || '[]'); return Array.isArray(c) ? c.filter(x => x && x.id && Number.isInteger(x.grams) && x.grams > 0) : []; } catch (e) { return []; } };
  const save = c => { try { localStorage.setItem(KEY, JSON.stringify(c)); } catch (e) {} NC.updateCartBadge(); document.dispatchEvent(new CustomEvent('nc:cart')); };
  NC.cart = {
    get: load,
    count: () => load().length,
    add(id, grams, cut) { const c = load(), x = c.find(i => i.id === id); if (x) { x.grams += grams; if (cut) x.cut = cut; } else c.push({ id, grams, cut: cut || '' }); save(c); },
    set(id, grams) { const c = load(), x = c.find(i => i.id === id); if (x) { x.grams = grams; save(c); } },
    cut(id, cut) { const c = load(), x = c.find(i => i.id === id); if (x) { x.cut = cut; save(c); } },
    remove(id) { save(load().filter(i => i.id !== id)); },
    clear() { save([]); }
  };
  NC.updateCartBadge = () => { const n = NC.cart.count(); $$('[data-cart-n]').forEach(e => { e.textContent = n; e.style.display = n ? '' : 'none'; }); };
  /** Parse "1.25" kg text → integer grams or null. Steps of 50 g. */
  NC.kgToGrams = v => { const n = Number(String(v).replace(',', '.')); if (!isFinite(n) || n <= 0) return null; const g = Math.round(n * 1000); return g % 50 === 0 && g <= 200000 ? g : null; };

  /* ---------- catalog & status ---------- */
  NC.catalog = null; NC.status = null; NC.offline = false;
  const DEMO = { categories: [{ id: 'C1', name: 'Fresh Whole Chicken' }, { id: 'C3', name: 'Curry Cut Chicken' }, { id: 'C9', name: 'Chicken Keema (Minced)' }], products: [
    { id: 'P1', name: 'Fresh Whole Chicken (PREVIEW)', categoryId: 'C1', description: 'Preview only - backend not connected.', imageUrl: '', pricePerKg: 100, minGrams: 1000, available: true, featured: true, stockLabel: 'In stock', demo: true, cuts: ['Whole', 'Curry cut'] },
    { id: 'P3', name: 'Curry Cut Chicken (PREVIEW)', categoryId: 'C3', description: 'Preview only - backend not connected.', imageUrl: '', pricePerKg: 100, minGrams: 500, available: true, featured: true, stockLabel: 'In stock', demo: true, cuts: ['Curry cut'] },
    { id: 'P9', name: 'Chicken Keema (PREVIEW)', categoryId: 'C9', description: 'Preview only - backend not connected.', imageUrl: '', pricePerKg: 100, minGrams: 250, available: true, featured: true, stockLabel: 'In stock', demo: true, cuts: ['Keema'] }
  ], settings: { BusinessName: 'NAEEM CHICKENS LABDAHA', Locality: 'Labdaha, Uttar Pradesh, India', DemoMode: 'TRUE', PayShop: 'TRUE', PayCOD: 'TRUE', DeliveryEnabled: 'TRUE' },
    status: { state: 'CLOSED', label: 'NOT CONNECTED', acceptingOrders: false, message: 'Backend not connected yet.', today: {}, week: [] } };
  NC.loadCatalog = async function (force) {
    const now = Date.now();
    if (!force && NC.catalog && now - NC.catalogAt < cfg.CATALOG_CACHE_MS) return NC.catalog;
    if (!NC.configured()) { NC.offline = true; NC.catalog = DEMO; NC.catalogAt = now; NC.status = DEMO.status; return DEMO; }
    const d = await NC.apiGet('catalog'); NC.offline = false; NC.catalog = d; NC.catalogAt = now; NC.status = d.status; NC.paintStatus(); return d;
  };
  NC.setting = k => (NC.catalog && NC.catalog.settings && NC.catalog.settings[k]) || '';
  NC.isOn = k => String(NC.setting(k)).toUpperCase() === 'TRUE';
  NC.productsById = () => Object.fromEntries(((NC.catalog && NC.catalog.products) || []).map(p => [p.id, p]));
  NC.wa = (text) => { const n = String(NC.setting('WhatsAppNumber')).replace(/\D/g, ''); return n ? `https://wa.me/${n}?text=${encodeURIComponent(text || 'Hello NAEEM CHICKENS LABDAHA')}` : ''; };
  NC.openWA = (text) => { const u = NC.wa(text); if (!u) { NC.toast('WhatsApp number is not configured yet. Please call the shop.', 'err'); return; } window.open(u, '_blank', 'noopener'); };

  NC.statusClass = s => (s.state === 'OPEN' ? 'open' : s.state === 'PAUSED' ? 'paused' : 'closed');
  NC.statusLine = s => {
    if (!s) return '';
    const bits = [];
    if (s.state === 'OPEN') { if (s.today && s.today.close) bits.push('Open today until ' + s.today.close); }
    else { if (s.expectedReopening) bits.push('Expected reopening: ' + NC.fmtDT(s.expectedReopening)); else if (s.nextOpen) bits.push('Opens ' + s.nextOpen); }
    if (s.message) bits.unshift(s.message);
    if (!s.acceptingOrders) bits.push('Not accepting orders right now');
    return bits.join(' · ');
  };
  NC.paintStatus = () => {
    const s = NC.status; if (!s) return;
    $$('[data-status-pill]').forEach(e => { e.className = 'pill ' + NC.statusClass(s); e.textContent = s.label; e.setAttribute('aria-label', 'Shop status: ' + s.label); });
    $$('[data-status-line]').forEach(e => { e.textContent = NC.statusLine(s); });
    document.dispatchEvent(new CustomEvent('nc:status', { detail: s }));
  };
  NC.refreshStatus = async () => { if (!NC.configured()) return; try { NC.status = await NC.apiGet('status'); NC.paintStatus(); } catch (e) { /* keep last known status */ } };

  /* ---------- layout ---------- */
  const NAV = [['index.html', 'Home', 'home'], ['products.html', 'Products', 'grid'], ['bulk-orders.html', 'Events & Bulk', 'truck'], ['track-order.html', 'Track Order', 'track'], ['contact.html', 'Contact', 'pin']];
  NC.layout = function () {
    const cur = (location.pathname.split('/').pop() || 'index.html');
    document.body.insertAdjacentHTML('afterbegin', '<a class="skip" href="#main">Skip to content</a>');
    const h = $('#site-header'); if (h) h.innerHTML = `<div id="ann"></div><header class="hdr"><div class="container row"><a class="brand" href="index.html"><img src="assets/images/logo.svg" alt="" width="42" height="42"><span>NAEEM CHICKENS<small>LABDAHA</small></span></a><nav class="nav" aria-label="Main">${NAV.map(n => `<a href="${n[0]}" ${cur === n[0] ? 'aria-current="page"' : ''}>${n[1]}</a>`).join('')}</nav><div class="right"><span class="pill loading" data-status-pill>CHECKING…</span><a class="cart-btn" href="cart.html" aria-label="Cart">${NC.icon('cart', 'width="18" height="18"')} Cart <span class="n" data-cart-n>0</span></a></div></div></header>`;
    const f = $('#site-footer'); if (f) f.innerHTML = `<footer class="ftr"><div class="container"><div class="cols"><div><h3>NAEEM CHICKENS LABDAHA</h3><p>Fresh chicken by the kilo, keema, custom cuts and event supply.<br><span data-bind="Locality"></span></p><span class="pill loading" data-status-pill>CHECKING…</span><p><small data-status-line></small></p></div><div><h3>Contact</h3><p data-contact></p></div><div><h3>Quick links</h3><p>${NAV.map(n => `<a href="${n[0]}">${n[1]}</a>`).join('<br>')}<br><a href="cart.html">Cart</a></p></div></div><p><small>© <span id="yr"></span> NAEEM CHICKENS LABDAHA. Prices and availability are set by the shop.</small></p></div></footer>`;
    const y = $('#yr'); if (y) y.textContent = new Date().getFullYear();
    document.body.insertAdjacentHTML('beforeend', `<a class="wa-float" href="#" data-wa aria-label="Chat on WhatsApp">${NC.icon('wa')}</a><nav class="bnav" aria-label="Mobile">${[NAV[0], NAV[1], ['cart.html', 'Cart', 'cart'], NAV[3], NAV[4]].map(n => `<a href="${n[0]}" ${cur === n[0] ? 'aria-current="page"' : ''}>${NC.icon(n[2])}${n[1].replace('Events & Bulk', 'Events').replace('Track Order', 'Track')}${n[2] === 'cart' ? '<span class="n" data-cart-n>0</span>' : ''}</a>`).join('')}</nav>`);
    document.addEventListener('click', e => { const a = e.target.closest('[data-wa]'); if (a) { e.preventDefault(); NC.openWA('Hello NAEEM CHICKENS LABDAHA, I would like to place an order.'); } });
    NC.updateCartBadge();
  };
  NC.bindContact = () => {
    const s = (NC.catalog && NC.catalog.settings) || {};
    $$('[data-bind]').forEach(e => { e.textContent = s[e.dataset.bind] || ''; });
    const ph = String(s.Phone || '').replace(/\D/g, '');
    $$('[data-contact]').forEach(e => { e.innerHTML = [ph ? `Call: <a href="tel:+91${ph}">${NC.esc(ph)}</a>` : '', s.WhatsAppNumber ? `<a href="#" data-wa>WhatsApp us</a>` : '', s.Address ? NC.esc(s.Address) : '', !ph && !s.WhatsAppNumber && !s.Address ? 'Contact details coming soon.' : ''].filter(Boolean).join('<br>'); });
    $$('[data-call]').forEach(e => { if (ph) { e.href = 'tel:+91' + ph; e.hidden = false; } else e.hidden = true; });
    const ann = $('#ann'); if (ann) { let h = ''; if (NC.offline) h += '<div class="ann demo">PREVIEW MODE: backend not connected. Set API_URL in assets/js/config.js.</div>'; else if (NC.isOn('DemoMode')) h += '<div class="ann demo">Demo prices are shown. The shop has not published final prices yet.</div>'; if (s.WebsiteAnnouncement) h += `<div class="ann">${NC.esc(s.WebsiteAnnouncement)}</div>`; ann.innerHTML = h; }
    NC.paintStatus();
  };
  /* ---------- owner profile (public) ---------- */
  NC.ownerPhoto = async () => {
    const ver = NC.setting('OwnerPhotoVer');
    if (ver) {
      const k = 'nc_owner_photo_' + ver;
      try { const c = sessionStorage.getItem(k); if (c) return c; } catch (e) {}
      try { const d = await NC.apiGet('ownerPhoto'); if (d && d.photo) { try { sessionStorage.setItem(k, d.photo); } catch (e) {} return d.photo; } } catch (e) {}
    }
    return NC.setting('OwnerPhotoURL') || 'assets/images/owner.jpg';
  };
  NC.renderOwner = async root => {
    if (!root) return;
    const name = NC.setting('OwnerName'), role = NC.setting('OwnerRole') || 'Owner', quote = NC.setting('OwnerQuote'), bio = NC.setting('OwnerBio');
    const biz = NC.setting('BusinessName') || 'NAEEM CHICKENS LABDAHA';
    const fallback = 'Every order is cut fresh and packed with care. Message us directly for custom cuts, keema, or supply for weddings, parties and restaurants.';
    const src = await NC.ownerPhoto();
    root.innerHTML = `<div class="owner-photo"><img src="${NC.esc(src)}" alt="${NC.esc(name ? name + ', ' + role : 'Owner of ' + biz)}" width="640" height="800" loading="lazy" onerror="this.onerror=null;this.src='assets/images/owner.jpg'"></div>
      <div class="owner-copy"><div class="eyebrow">Meet the owner</div><h2>${NC.esc(name || 'The people behind your chicken')}</h2><p class="owner-role">${NC.esc(role)} · ${NC.esc(biz)}</p>
      ${quote ? `<blockquote class="owner-quote">“${NC.esc(quote)}”</blockquote>` : ''}<p class="owner-bio">${NC.esc(bio || fallback)}</p>
      <div class="cta"><button class="btn primary" data-wa>${NC.icon('wa', 'width="18" height="18"')} Chat with us</button><a class="btn light" href="products.html">Browse products</a></div></div>`;
  };

  NC.placeholder = name => { const t = (name || 'Chicken').replace(/\(.*\)/, '').trim().slice(0, 28); return 'data:image/svg+xml;utf8,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300"><rect width="400" height="300" fill="#efe6d0"/><circle cx="200" cy="120" r="62" fill="#1f2a24"/><ellipse cx="200" cy="132" rx="34" ry="25" fill="#f7f1e3"/><circle cx="226" cy="102" r="15" fill="#f7f1e3"/><path d="M240 100l15 6-15 6z" fill="#e0a526"/><circle cx="222" cy="98" r="3" fill="#1f2a24"/><circle cx="214" cy="88" r="6" fill="#b3392f"/><text x="200" y="240" text-anchor="middle" font-family="Georgia,serif" font-size="22" fill="#1f2a24">${t.replace(/[<&]/g, '')}</text><text x="200" y="265" text-anchor="middle" font-family="sans-serif" font-size="12" fill="#6b756f">Add a product photo in admin</text></svg>`); };

  NC.init = async function (after) {
    NC.layout();
    try { await NC.loadCatalog(); NC.bindContact(); } catch (e) { NC.bindContact(); NC.initError = e; }
    if (after) { try { await after(); } catch (e) { console.error(e); } }
    setInterval(NC.refreshStatus, cfg.STATUS_REFRESH_MS);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) NC.refreshStatus(); });
    window.addEventListener('online', NC.refreshStatus);
    if ('serviceWorker' in navigator && false) navigator.serviceWorker.register('sw.js');
  };
})();
