(function () {
  const NC = window.NC, $ = NC.$, $$ = NC.$$; let reqId = NC.uuid();
  NC.initBulk = function () {
    const form = $('#bf'), msg = $('#msg'); $('#edate').min = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
    if (!NC.configured()) NC.alert(msg, 'Preview mode: backend not connected. Use WhatsApp to enquire.', 'warn');
    $('#bwa').addEventListener('click', () => NC.openWA('Hello NAEEM CHICKENS LABDAHA, I want a quote for an event / bulk chicken order.'));
    const fe = (id, t) => { const f = $('#' + id).closest('.field'); f.classList.toggle('err', !!t); $('.errmsg', f).textContent = t || ''; return !t; };
    form.addEventListener('submit', async e => {
      e.preventDefault(); let ok = true; const ph = v => /^[6-9]\d{9}$/.test(v.replace(/[\s\-+]/g, '').replace(/^91(?=\d{10}$)/, ''));
      ok = fe('bname', $('#bname').value.trim().length < 2 ? 'Enter name or organisation.' : '') && ok;
      ok = fe('bphone', !ph($('#bphone').value) ? 'Enter a valid 10-digit mobile number.' : '') && ok;
      ok = fe('edate', !$('#edate').value ? 'Choose the event date.' : '') && ok;
      ok = fe('eloc', $('#eloc').value.trim().length < 3 ? 'Enter the event location.' : '') && ok;
      ok = fe('qty', !(Number($('#qty').value) > 0) ? 'Enter the quantity in kg.' : '') && ok;
      if (!ok) { $('.field.err input', form).focus(); return; }
      const btn = $('#bgo'); NC.busy(btn, true, 'Sending…'); NC.alert(msg, '');
      try {
        const r = await NC.api('createEnquiry', { requestId: reqId, customerName: $('#bname').value, organization: $('#org').value, phone: $('#bphone').value, whatsapp: $('#bwa2').value, eventDate: $('#edate').value, deliveryTime: $('#etime').value, eventLocation: $('#eloc').value, guestCount: $('#guests').value, quantityKg: $('#qty').value, products: $$('input[name=prod]:checked').map(c => c.value), instructions: $('#instr').value, supplyType: $('input[name=sup]:checked').value, fulfilment: $('input[name=bf]:checked').value, budgetNote: $('#budget').value, website: $('#website').value }, { timeout: 45000 });
        form.hidden = true; reqId = NC.uuid();
        $('#done').innerHTML = `<div class="card" style="padding:22px"><div class="alert ok"><div><strong>Enquiry received.</strong> Your reference is <strong>${NC.esc(r.enquiryId)}</strong>. The shop will contact you with a quotation.</div></div><button class="btn wa" id="dwa">${NC.icon('wa', 'width="18" height="18"')} Follow up on WhatsApp</button></div>`;
        $('#dwa').addEventListener('click', () => NC.openWA(`Hello NAEEM CHICKENS LABDAHA, I submitted enquiry ${r.enquiryId} for ${$('#qty').value} kg on ${$('#edate').value}.`));
        window.scrollTo({ top: 0, behavior: 'smooth' });
      } catch (err) { NC.busy(btn, false); NC.alert(msg, err.message, 'err'); }
    });
  };
})();
