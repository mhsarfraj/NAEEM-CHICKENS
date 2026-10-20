/* Cart page: local estimate immediately, authoritative server quote after. */
(function () {
  const NC = window.NC, $ = NC.$;
  let quoteT, lastQuote = null, discountCode = sessionStorage.getItem('nc_disc') || '', ful = sessionStorage.getItem('nc_ful') || 'PICKUP';
  NC.currentQuote = () => lastQuote;
  const local = (items, by) => { let s = 0; items.forEach(i => { const p = by[i.id]; if (p) s += Math.round(NC.paise(p.pricePerKg) * i.grams / 1000); }); return s; };
  NC.initCart = async function () {
    const list = $('#lines'), sum = $('#sum'), msg = $('#msg');
    if (NC.initError && NC.configured()) NC.alert(msg, NC.initError.message, 'err', () => location.reload());
    const by = NC.productsById();
    function draw() {
      const items = NC.cart.get();
      if (!items.length) { list.innerHTML = `<div class="empty">${NC.icon('cart')}<h3>Your cart is empty</h3><p>Add fresh chicken by weight to get started.</p><a class="btn primary" href="products.html">Browse products</a></div>`; sum.hidden = true; $('#sc').hidden = true; return; }
      sum.hidden = false; $('#sc').hidden = false;
      list.innerHTML = items.map(i => { const p = by[i.id]; if (!p) return `<div class="cart-line"><div><div class="nm">Item no longer listed</div></div><button class="btn sm ghost" data-rm="${NC.esc(i.id)}">Remove</button></div>`;
        const bad = !p.available;
        return `<div class="cart-line" data-id="${NC.esc(i.id)}"><div><div class="nm">${NC.esc(p.name)}</div><div class="sub">${NC.inr(p.pricePerKg)}/kg · min ${NC.fmtG(p.minGrams)}${i.cut ? ' · ' + NC.esc(i.cut) : ''}</div>${bad ? '<div class="errmsg">Currently unavailable — remove to continue</div>' : ''}</div><strong data-lt>${NC.inr(Math.round(NC.paise(p.pricePerKg) * i.grams / 1000) / 100)}</strong><div class="ctl"><label class="sr-only" for="q-${NC.esc(i.id)}">Weight in kg</label><input id="q-${NC.esc(i.id)}" inputmode="decimal" value="${i.grams / 1000}" data-q> <span class="hint">kg</span><button class="btn sm ghost" data-rm="${NC.esc(i.id)}">Remove</button></div><div class="errmsg" data-e></div></div>`; }).join('');
      requestQuote();
    }
    function totals(q, est) {
      const items = NC.cart.get(), s = local(items, by);
      const t = q || { subtotal: s / 100, discount: 0, deliveryCharge: 0, total: s / 100 };
      $('#t-sub').textContent = NC.inr(t.subtotal);
      $('#r-disc').hidden = !(t.discount > 0); $('#t-disc').textContent = '− ' + NC.inr(t.discount);
      $('#r-del').hidden = ful !== 'DELIVERY'; $('#t-del').textContent = t.deliveryCharge > 0 ? NC.inr(t.deliveryCharge) : 'Free';
      $('#t-total').textContent = NC.inr(t.total); $('#sc-total').textContent = NC.inr(t.total); $('#est').hidden = !est;
      const w = $('#warn'); const probs = q ? q.problems : []; let h = '';
      if (q && q.belowMinimum) h += `Minimum order amount is ${NC.inr(q.minOrderAmount)}. `;
      if (probs.length) h += probs.map(p => ((by[p.productId] || {}).name || 'Item') + ': ' + p.message).join('. ');
      NC.alert(w, h, 'warn'); (function(){ const bad = !!(q && (q.belowMinimum || probs.length)); $('#go').toggleAttribute('disabled', bad); $('#sgo').toggleAttribute('disabled', bad); $('#go').style.pointerEvents = $('#sgo').style.pointerEvents = bad ? 'none' : ''; })();
      const de = $('#d-err'); de.textContent = q && q.discountError ? q.discountError : '';
    }
    function requestQuote() {
      totals(null, true); clearTimeout(quoteT);
      quoteT = setTimeout(async () => {
        const items = NC.cart.get(); if (!items.length || !NC.configured()) { if (!NC.configured()) { $('#go').setAttribute('disabled', ''); $('#sgo').setAttribute('disabled', ''); } return; }
        try { lastQuote = await NC.api('quote', { items: items.map(i => ({ productId: i.id, grams: i.grams })), discountCode, fulfilment: ful }, { retries: 1 }); totals(lastQuote, false); }
        catch (e) { NC.alert($('#warn'), 'Could not confirm prices: ' + e.message + ' Showing an estimate.', 'warn', requestQuote); }
      }, 350);
    }
    list.addEventListener('click', e => { const r = e.target.closest('[data-rm]'); if (r) { NC.cart.remove(r.dataset.rm); draw(); NC.toast('Removed from cart'); } });
    list.addEventListener('change', e => {
      if (!e.target.matches('[data-q]')) return; const line = e.target.closest('.cart-line'), id = line.dataset.id, p = by[id], err = $('[data-e]', line);
      const g = NC.kgToGrams(e.target.value);
      if (!g) { err.textContent = 'Enter a weight like 0.75 or 2 kg (steps of 50 g).'; return; }
      if (p && g < p.minGrams) { err.textContent = 'Minimum is ' + NC.fmtG(p.minGrams) + '.'; return; }
      err.textContent = ''; NC.cart.set(id, g); $('[data-lt]', line).textContent = NC.inr(Math.round(NC.paise(p.pricePerKg) * g / 1000) / 100); requestQuote();
    });
    $('#disc').value = discountCode;
    $('#apply').addEventListener('click', () => { discountCode = $('#disc').value.trim().toUpperCase(); sessionStorage.setItem('nc_disc', discountCode); requestQuote(); });
    document.querySelectorAll('input[name=ful]').forEach(r => { r.checked = r.value === ful; r.addEventListener('change', () => { ful = r.value; sessionStorage.setItem('nc_ful', ful); requestQuote(); }); });
    $('#clear').addEventListener('click', async () => { if (await NC.confirm('Remove everything from your cart?', { danger: true, ok: 'Clear cart' })) { NC.cart.clear(); draw(); } });
    draw();
  };
})();
