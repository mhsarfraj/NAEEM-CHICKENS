(function () {
  const NC = window.NC, $ = NC.$; let timer;
  const LABEL = { RECEIVED: 'Received', CONFIRMED: 'Confirmed', PREPARING: 'Preparing', READY_FOR_PICKUP: 'Ready for pickup', OUT_FOR_DELIVERY: 'Out for delivery', DELIVERED: 'Delivered', CANCELLED: 'Cancelled' };
  NC.initTracking = function () {
    const form = $('#tf'), out = $('#result'), msg = $('#msg'), id = new URLSearchParams(location.search).get('id') || localStorage.getItem('nc_last_order') || '';
    $('#oid').value = id;
    async function go(silent) {
      const orderId = $('#oid').value.trim(), phone = $('#ph').value.trim();
      if (!orderId || !phone) { NC.alert(msg, 'Enter your order ID and mobile number.'); return; }
      const btn = $('#tgo'); if (!silent) { NC.busy(btn, true, 'Checking…'); NC.alert(msg, ''); }
      try { const r = await NC.api('trackOrder', { orderId, phone }, { retries: 1 }); draw(r); clearInterval(timer); timer = setInterval(() => { if (!document.hidden && !['DELIVERED', 'CANCELLED'].includes(r.status)) go(true); }, 30000); }
      catch (e) { if (!silent) { out.innerHTML = ''; NC.alert(msg, e.message); } } finally { if (!silent) NC.busy(btn, false); }
    }
    function draw(r) {
      const flow = ['RECEIVED', 'CONFIRMED', 'PREPARING', r.fulfilment === 'DELIVERY' ? 'OUT_FOR_DELIVERY' : 'READY_FOR_PICKUP', 'DELIVERED'], cancelled = r.status === 'CANCELLED';
      const idx = flow.indexOf(r.status);
      out.innerHTML = `<div class="card" style="padding:18px"><h2 style="font-size:1.25rem">Order ${NC.esc(r.orderId)}</h2><p><strong>Status: ${NC.esc(LABEL[r.status] || r.status)}</strong> · ${r.fulfilment === 'DELIVERY' ? 'Delivery' : 'Pickup'} at ${NC.esc(NC.fmtDT(r.requestedAt))}</p>
      ${cancelled ? `<div class="alert err"><div>This order was cancelled.${r.cancelReason ? ' Reason: ' + NC.esc(r.cancelReason) : ''}</div></div>` : `<div class="steps" aria-label="Order progress">${flow.map((s, i) => `<div class="step ${i <= idx ? 'done' : ''} ${i === idx ? 'cur' : ''}">${LABEL[s]}</div>`).join('')}</div>`}
      <h3>Items</h3><div class="summary">${r.items.map(i => `<div class="r"><span>${NC.esc(i.name)} · ${NC.fmtG(i.grams)}</span><span>${NC.inr(i.line)}</span></div>`).join('')}<div class="r total"><span>Total</span><span>${NC.inr(r.total)}</span></div></div>
      <p class="hint">Payment: ${NC.esc(r.paymentMethod)} · ${r.paymentStatus === 'PAID' ? 'Paid (verified)' : r.paymentStatus === 'PARTIAL' ? 'Partly paid' : 'Not yet paid'}</p>
      <h3>History</h3><ul class="timeline">${r.history.map(h => `<li><strong>${NC.esc(LABEL[h.status] || h.status)}</strong><small>${NC.esc(NC.fmtDT(h.at))}</small></li>`).join('')}</ul></div>`;
    }
    form.addEventListener('submit', e => { e.preventDefault(); go(false); });
  };
})();
