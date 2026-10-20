/* Checkout: validates, submits with idempotency key, shows confirmation + WhatsApp summary. */
(function () {
  const NC = window.NC, $ = NC.$, $$ = NC.$$;
  const istDate = (offsetMin) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date(Date.now() + (offsetMin || 0) * 60000));
  const istTime = (offsetMin) => new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(Date.now() + (offsetMin || 0) * 60000));
  const phoneOk = v => /^[6-9]\d{9}$/.test(String(v).replace(/[\s\-+]/g, '').replace(/^91(?=\d{10}$)/, '').replace(/^0(?=\d{10}$)/, ''));
  let quote = null, reqId = sessionStorage.getItem('nc_reqid') || (sessionStorage.setItem('nc_reqid', NC.uuid()), sessionStorage.getItem('nc_reqid'));

  NC.initCheckout = async function () {
    const form = $('#co'), msg = $('#msg'), items = NC.cart.get();
    if (!items.length) { $('#wrap').innerHTML = `<div class="empty">${NC.icon('cart')}<h3>Your cart is empty</h3><a class="btn primary" href="products.html">Browse products</a></div>`; return; }
    if (!NC.configured()) { NC.alert(msg, 'This preview is not connected to the shop backend, so orders cannot be placed yet.', 'warn'); }
    try { await NC.loadCatalog(true); NC.bindContact(); } catch (e) { NC.alert(msg, e.message, 'err', () => location.reload()); return; }   // never checkout on stale prices
    const prep = Number(NC.setting('PrepMinutes')) || 0;
    const dateIn = $('#date'), timeIn = $('#time'); dateIn.min = istDate(0); dateIn.max = istDate(30 * 1440); dateIn.value = istDate(prep + 15); timeIn.value = istTime(prep + 15);
    const fulSaved = sessionStorage.getItem('nc_ful') || 'PICKUP';
    $$('input[name=ful]', form).forEach(r => { r.checked = r.value === fulSaved; });
    if (!NC.isOn('DeliveryEnabled')) { const d = $('input[name=ful][value=DELIVERY]', form); d.disabled = true; d.closest('label').style.opacity = .5; $('input[name=ful][value=PICKUP]', form).checked = true; }
    const ful = () => ($('input[name=ful]:checked', form) || {}).value || 'PICKUP';

    function payments() {
      const f = ful(), opts = [];
      if (f === 'DELIVERY' && NC.isOn('PayCOD')) opts.push(['COD', 'Cash on Delivery', 'Pay in cash when your order arrives.']);
      if (f === 'PICKUP' && NC.isOn('PayShop')) opts.push(['SHOP', 'Pay at Shop', 'Pay when you collect your order.']);
      if (NC.isOn('PayUPI') && NC.setting('UPIID')) opts.push(['UPI', 'UPI', 'Pay by UPI. The shop confirms once the payment is received.']);
      const cur = ($('input[name=pay]:checked', form) || {}).value;
      $('#pays').innerHTML = opts.length ? opts.map((o, i) => `<label><input type="radio" name="pay" value="${o[0]}" ${o[0] === cur || (!cur && i === 0) ? 'checked' : ''}><span><strong>${o[1]}</strong><br><span class="hint">${o[2]}</span></span></label>`).join('') : '<div class="alert warn">No payment option is available for this fulfilment type. Please contact the shop.</div>';
    }
    async function refreshQuote() {
      $('#addr-wrap').hidden = ful() !== 'DELIVERY'; payments(); sessionStorage.setItem('nc_ful', ful());
      try { quote = await NC.api('quote', { items: items.map(i => ({ productId: i.id, grams: i.grams })), discountCode: sessionStorage.getItem('nc_disc') || '', fulfilment: ful() }, { retries: 1 }); } catch (e) { NC.alert($('#qmsg'), 'Could not confirm prices: ' + e.message, 'err', refreshQuote); return; }
      NC.alert($('#qmsg'), '');
      const by = NC.productsById();
      $('#osum').innerHTML = quote.lines.map(l => `<div class="r"><span>${NC.esc(l.name)} · ${NC.fmtG(l.grams)}</span><span>${NC.inr(l.line)}</span></div>`).join('') + `<div class="r"><span>Subtotal</span><span>${NC.inr(quote.subtotal)}</span></div>` + (quote.discount > 0 ? `<div class="r"><span>Discount (${NC.esc(quote.discountCode)})</span><span>− ${NC.inr(quote.discount)}</span></div>` : '') + (ful() === 'DELIVERY' ? `<div class="r"><span>Delivery</span><span>${quote.deliveryCharge > 0 ? NC.inr(quote.deliveryCharge) : 'Free'}</span></div>` : '') + `<div class="r total"><span>Total</span><span>${NC.inr(quote.total)}</span></div><p class="hint">Final total is confirmed by the shop's server when you place the order.</p>`;
      gate();
    }
    function gate() {
      const s = NC.status || {}, btn = $('#place'); let m = '', block = false;
      if (!NC.configured()) { block = true; }
      else if (!s.acceptingOrders) { block = true; m = s.message || 'We are not accepting orders right now.'; }
      else if (s.state === 'PAUSED') { block = true; m = s.message || 'Orders are paused for preparation. Please try again shortly.'; }
      else if (s.state !== 'OPEN') { if (NC.isOn('AllowScheduledOrders')) m = 'The shop is closed now. You can schedule your order for a time within opening hours' + (s.nextOpen ? ' (opens ' + s.nextOpen + ')' : '') + '.'; else { block = true; m = 'The shop is closed and not taking scheduled orders. ' + (s.nextOpen ? 'Opens ' + s.nextOpen + '.' : ''); } }
      if (quote && (quote.belowMinimum || quote.problems.length)) { block = true; m += ' ' + (quote.belowMinimum ? 'Minimum order is ' + NC.inr(quote.minOrderAmount) + '. ' : '') + quote.problems.map(p => p.message).join('. '); }
      NC.alert($('#gate'), m.trim(), block ? 'err' : 'info'); btn.disabled = block || !quote;
    }
    document.addEventListener('nc:status', gate);
    $$('input[name=ful]', form).forEach(r => r.addEventListener('change', refreshQuote));
    await refreshQuote();

    const fe = (id, t) => { const f = $('#' + id).closest('.field'); f.classList.toggle('err', !!t); $('.errmsg', f).textContent = t || ''; return !t; };
    function validate() {
      let ok = true;
      ok = fe('name', $('#name').value.trim().length < 2 ? 'Enter your full name.' : '') && ok;
      ok = fe('phone', !phoneOk($('#phone').value) ? 'Enter a valid 10-digit mobile number.' : '') && ok;
      ok = fe('wa', $('#wa').value && !phoneOk($('#wa').value) ? 'WhatsApp number is not valid.' : '') && ok;
      ok = fe('address', ful() === 'DELIVERY' && $('#address').value.trim().length < 10 ? 'Enter your full delivery address.' : '') && ok;
      const when = new Date(`${dateIn.value}T${timeIn.value}:00+05:30`);
      ok = fe('time', !dateIn.value || !timeIn.value || isNaN(when) ? 'Choose date and time.' : when.getTime() < Date.now() + prep * 60000 - 60000 ? `Choose a time at least ${prep} minutes from now.` : '') && ok;
      if (!$('input[name=pay]:checked', form)) { NC.toast('Choose a payment method.', 'err'); ok = false; }
      return ok;
    }
    form.addEventListener('submit', async e => {
      e.preventDefault(); if (!validate()) { const f = $('.field.err', form); f && f.querySelector('input,select,textarea').focus(); return; }
      const btn = $('#place'); NC.busy(btn, true, 'Placing order…'); NC.alert(msg, '');
      const cuts = items.filter(i => i.cut);
      const payload = { requestId: reqId, customerName: $('#name').value, phone: $('#phone').value, whatsapp: $('#wa').value, fulfilment: ful(), address: $('#address').value, landmark: $('#landmark').value, date: dateIn.value, time: timeIn.value, paymentMethod: $('input[name=pay]:checked', form).value, notes: $('#notes').value, discountCode: sessionStorage.getItem('nc_disc') || '', website: $('#website').value, items: items.map(i => ({ productId: i.id, grams: i.grams, cut: i.cut || '' })) };
      try {
        const r = await NC.api('createOrder', payload, { timeout: 45000 });
        sessionStorage.removeItem('nc_reqid'); NC.cart.clear(); sessionStorage.removeItem('nc_disc');
        try { localStorage.setItem('nc_last_order', r.orderId); } catch (x) {}
        confirmation(r, payload);
      } catch (err) {
        NC.busy(btn, false);
        const net = ['NETWORK', 'TIMEOUT', 'QUOTA', 'BUSY'].includes(err.code);
        NC.alert(msg, err.message + (net ? ' Your order may or may not have been received. It is safe to press "Place order" again — duplicates are prevented.' : ''), 'err');
        msg.scrollIntoView({ behavior: 'smooth', block: 'center' });
        if (['SHOP_CLOSED', 'OUTSIDE_HOURS', 'UNAVAILABLE'].includes(err.code)) { await NC.refreshStatus(); NC.loadCatalog(true).then(refreshQuote).catch(() => {}); }
      }
    });
  };
  function confirmation(r, p) {
    const lines = r.items.map(i => `• ${i.name}: ${NC.fmtG(i.grams)} × ${NC.inr(i.pricePerKg)}/kg = ${NC.inr(i.line)}${i.cut ? ' (' + i.cut + ')' : ''}`).join('\n');
    const txt = `*Order ${r.orderId}* - NAEEM CHICKENS LABDAHA\n${lines}\nEstimated total: ${NC.inr(r.total)}\n${r.fulfilment === 'DELIVERY' ? 'Delivery' : 'Pickup'}: ${NC.fmtDT(r.requestedAt)}\nName: ${p.customerName}\nPayment: ${r.paymentMethod === 'COD' ? 'Cash on Delivery' : r.paymentMethod === 'SHOP' ? 'Pay at Shop' : 'UPI'}`;
    const upi = r.paymentMethod === 'UPI' && NC.setting('UPIID') ? `upi://pay?pa=${encodeURIComponent(NC.setting('UPIID'))}&pn=${encodeURIComponent(NC.setting('UPIPayeeName') || 'NAEEM CHICKENS LABDAHA')}&am=${r.total.toFixed(2)}&cu=INR&tn=${encodeURIComponent(r.orderId)}` : '';
    $('#wrap').innerHTML = `<div class="card" style="padding:22px;max-width:640px;margin:auto"><div class="alert ok"><div><strong>Order received!</strong> Your order ID is <strong style="font-size:1.2em">${NC.esc(r.orderId)}</strong>. Save it to track your order.</div></div>
      ${r.duplicate ? '<div class="alert info">This order was already placed — no duplicate was created.</div>' : ''}
      <div class="summary">${r.items.map(i => `<div class="r"><span>${NC.esc(i.name)} · ${NC.fmtG(i.grams)}</span><span>${NC.inr(i.line)}</span></div>`).join('')}${r.discount > 0 ? `<div class="r"><span>Discount</span><span>− ${NC.inr(r.discount)}</span></div>` : ''}${r.deliveryCharge > 0 ? `<div class="r"><span>Delivery</span><span>${NC.inr(r.deliveryCharge)}</span></div>` : ''}<div class="r total"><span>Total</span><span>${NC.inr(r.total)}</span></div></div>
      <p><strong>${r.fulfilment === 'DELIVERY' ? 'Delivery' : 'Pickup'} time:</strong> ${NC.esc(NC.fmtDT(r.requestedAt))}<br><strong>Status:</strong> Received — the shop will confirm shortly.</p>
      <div class="alert warn"><div>Payment is <strong>not yet marked paid</strong>. It is recorded only after the shop verifies it. We never ask for your UPI PIN, card PIN or bank password.</div></div>
      <div class="cta"><button class="btn wa" id="sendwa">${NC.icon('wa', 'width="18" height="18"')} Send summary on WhatsApp</button>${upi ? `<a class="btn primary" href="${NC.esc(upi)}">Open UPI app to pay</a>` : ''}<a class="btn ghost" style="color:var(--ink)" href="track-order.html?id=${encodeURIComponent(r.orderId)}">Track order</a></div></div>`;
    $('#sendwa').addEventListener('click', () => NC.openWA(txt)); window.scrollTo({ top: 0, behavior: 'smooth' });
  }
})();
