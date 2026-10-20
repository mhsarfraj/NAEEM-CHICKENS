/* Product cards, catalogue page and homepage featured list. */
(function () {
  const NC = window.NC, $ = NC.$, $$ = NC.$$;
  const lineP = (price, g) => Math.round(NC.paise(price) * g / 1000);
  NC.productCard = p => {
    const quick = [250, 500, 1000, 2000].filter(g => g >= p.minGrams);
    const first = quick[0] || p.minGrams;
    const out = !p.available;
    const stockCls = /out|unavail/i.test(p.stockLabel) ? 'out' : /low/i.test(p.stockLabel) ? 'low' : '';
    return `<article class="card pcard" data-id="${NC.esc(p.id)}" data-g="${first}">
      <div class="img"><img loading="lazy" src="${NC.esc(p.imageUrl || NC.placeholder(p.name))}" alt="${NC.esc(p.name)}" onerror="this.onerror=null;this.src=NC.placeholder(this.alt)">${p.featured ? '<span class="badge">Featured</span>' : ''}<span class="badge stock ${stockCls}">${NC.esc(p.stockLabel)}</span></div>
      <div class="body"><h3>${NC.esc(p.name)}</h3><p class="desc">${NC.esc(p.description)}</p>
      <div class="price">${NC.inr(p.pricePerKg)}<small> / kg</small> ${p.demo ? '<span class="demo-tag">DEMO PRICE</span>' : ''}</div>
      <div class="hint">Minimum order: ${NC.fmtG(p.minGrams)}</div>
      ${out ? '<button class="btn sm" disabled>Currently unavailable</button>' : `
      <div class="qty" role="group" aria-label="Quantity for ${NC.esc(p.name)}">${quick.map((g, i) => `<button type="button" class="chip" data-g="${g}" aria-pressed="${i === 0}">${NC.fmtG(g)}</button>`).join('')}</div>
      <div class="qty-row"><input inputmode="decimal" aria-label="Custom weight in kg" placeholder="e.g. 1.25" data-custom><span class="hint">kg (steps of 50 g)</span></div>
      ${p.cuts && p.cuts.length ? `<select aria-label="Cutting style" data-cut><option value="">Cutting style (optional)</option>${p.cuts.map(c => `<option>${NC.esc(c)}</option>`).join('')}</select>` : ''}
      <div class="line-total" data-lt>${NC.inr(lineP(p.pricePerKg, first) / 100)} for ${NC.fmtG(first)}</div><div class="errmsg" role="alert"></div>
      <button class="btn primary" data-add>${NC.icon('cart', 'width="18" height="18"')} Add to cart</button>
      ${NC.setting('WhatsAppNumber') ? '<button class="btn wa sm" data-wa-order>Order on WhatsApp</button>' : ''}`}
      </div></article>`;
  };
  function cardGrams(card, p) {
    const c = $('[data-custom]', card); const err = $('.errmsg', card);
    if (c && c.value.trim()) { const g = NC.kgToGrams(c.value); if (!g) { err.textContent = 'Enter a weight like 0.75 or 1.5 kg (steps of 50 g).'; return null; } if (g < p.minGrams) { err.textContent = 'Minimum is ' + NC.fmtG(p.minGrams) + '.'; return null; } err.textContent = ''; return g; }
    err.textContent = ''; return Number(card.dataset.g);
  }
  function refreshLine(card, p) { const g = cardGrams(card, p), lt = $('[data-lt]', card); if (lt && g) lt.textContent = NC.inr(lineP(p.pricePerKg, g) / 100) + ' for ' + NC.fmtG(g); else if (lt) lt.textContent = ''; }
  NC.bindCards = root => {
    const by = NC.productsById();
    root.addEventListener('click', e => {
      const card = e.target.closest('.pcard'); if (!card) return; const p = by[card.dataset.id]; if (!p) return;
      const chip = e.target.closest('.chip');
      if (chip) { $$('.chip', card).forEach(c => c.setAttribute('aria-pressed', c === chip)); card.dataset.g = chip.dataset.g; $('[data-custom]', card).value = ''; refreshLine(card, p); }
      if (e.target.closest('[data-add]')) { const g = cardGrams(card, p); if (!g) return; const cut = ($('[data-cut]', card) || {}).value || ''; NC.cart.add(p.id, g, cut); NC.toast(`${NC.fmtG(g)} ${p.name} added to cart`, 'ok'); }
      if (e.target.closest('[data-wa-order]')) { const g = cardGrams(card, p); if (!g) return; NC.openWA(`Hello NAEEM CHICKENS LABDAHA, I want to order ${NC.fmtG(g)} of ${p.name}.`); }
    });
    root.addEventListener('input', e => { if (e.target.matches('[data-custom]')) { const card = e.target.closest('.pcard'); if (e.target.value) $$('.chip', card).forEach(c => c.setAttribute('aria-pressed', 'false')); refreshLine(card, by[card.dataset.id]); } });
  };
  const empty = (t, s) => `<div class="empty">${NC.icon('box')}<h3>${t}</h3><p>${s || ''}</p></div>`;

  NC.initCatalogPage = async function () {
    const grid = $('#grid'), msg = $('#msg'); let cat = new URLSearchParams(location.search).get('cat') || '', sort = 'featured', q = '';
    grid.innerHTML = '<div class="sk sk-card"></div>'.repeat(6);
    async function ready() { try { await NC.loadCatalog(true); NC.bindContact(); } catch (e) { grid.innerHTML = ''; NC.alert(msg, e.message, 'err', () => { msg.innerHTML = ''; NC.initCatalogPage(); }); return false; } return true; }
    if (!(await ready())) return;
    const cats = NC.catalog.categories;
    $('#cats').innerHTML = `<button class="chip" data-c="" aria-pressed="${!cat}">All</button>` + cats.map(c => `<button class="chip" data-c="${NC.esc(c.id)}" aria-pressed="${cat === c.id}">${NC.esc(c.name)}</button>`).join('');
    function render() {
      let list = NC.catalog.products.filter(p => (!cat || p.categoryId === cat) && (!q || (p.name + ' ' + p.description).toLowerCase().includes(q)));
      if (sort === 'low') list.sort((a, b) => a.pricePerKg - b.pricePerKg); else if (sort === 'high') list.sort((a, b) => b.pricePerKg - a.pricePerKg); else if (sort === 'name') list.sort((a, b) => a.name.localeCompare(b.name)); else list.sort((a, b) => Number(b.featured) - Number(a.featured));
      grid.innerHTML = list.length ? list.map(NC.productCard).join('') : empty('No products found', 'Try another category or search word.');
    }
    $('#cats').addEventListener('click', e => { const b = e.target.closest('[data-c]'); if (!b) return; cat = b.dataset.c; $$('#cats .chip').forEach(c => c.setAttribute('aria-pressed', c === b)); render(); });
    $('#q').addEventListener('input', e => { q = e.target.value.trim().toLowerCase(); render(); });
    $('#sort').addEventListener('change', e => { sort = e.target.value; render(); });
    NC.bindCards(grid); render();
    document.addEventListener('nc:status', () => {});
  };
  NC.initHome = async function () {
    const box = $('#featured'); if (!box) return;
    if (NC.initError) { NC.alert($('#fmsg'), NC.initError.message, 'err', () => location.reload()); box.innerHTML = ''; return; }
    const list = NC.catalog.products.filter(p => p.featured && p.available).slice(0, 6);
    box.innerHTML = list.length ? list.map(NC.productCard).join('') : empty('Products coming soon', 'The shop is still adding its products.');
    NC.bindCards(box);
    NC.renderOwner($('#owner-card'));
    const t = NC.setting('Testimonials').split(';').map(s => s.split('|')).filter(a => a[0] && a[1]);
    const tb = $('#testimonials'); if (tb) { if (t.length) { tb.hidden = false; $('#tlist', tb).innerHTML = t.map(a => `<figure class="card" style="padding:16px;margin:0"><blockquote style="margin:0">“${NC.esc(a[1].trim())}”</blockquote><figcaption style="margin-top:8px;font-weight:600">— ${NC.esc(a[0].trim())}</figcaption></figure>`).join(''); } else tb.hidden = true; }
  };
})();
