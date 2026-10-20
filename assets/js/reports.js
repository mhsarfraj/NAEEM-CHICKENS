/* Reports view + CSV export + print. Loaded by admin.html. */
(function () {
  const NC = window.NC;
  NC.csv = (columns, rows) => {
    const cell = v => { let s = v == null ? '' : String(v); if (/^[=+\-@\t\r]/.test(s) && isNaN(Number(s))) s = "'" + s; return '"' + s.replace(/"/g, '""') + '"'; };
    return '\ufeff' + [columns].concat(rows).map(r => r.map(cell).join(',')).join('\r\n');
  };
  NC.download = (name, text) => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' })); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500); };
  const TYPES = [['sales_daily', 'Daily sales'], ['product_sales', 'Product-wise sales & profit'], ['retail_vs_bulk', 'Retail vs bulk/event'], ['orders', 'Orders list'], ['payments', 'Payments collected'], ['inventory', 'Inventory movement'], ['enquiries', 'Event enquiries & quotations']];
  const iso = d => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(d);
  NC.renderReports = function (view, A, esc, onErr) {
    const today = iso(new Date()), from30 = iso(new Date(Date.now() - 29 * 86400000));
    view.innerHTML = `<h1>Reports</h1><div class="filters noprint"><div class="field"><label for="rt">Report</label><select id="rt">${TYPES.map(t => `<option value="${t[0]}">${t[1]}</option>`).join('')}</select></div><div class="field"><label for="rf">From</label><input type="date" id="rf" value="${from30}"></div><div class="field"><label for="rto">To</label><input type="date" id="rto" value="${today}"></div><button class="btn primary sm" id="rrun">Run</button><button class="btn light sm" id="rcsv" disabled style="border:1.5px solid var(--line)">Export CSV</button><button class="btn light sm" id="rprint" disabled style="border:1.5px solid var(--line)">Print</button></div><div id="rmsg"></div><div id="rout"><div class="empty"><p>Choose a report and press Run.</p></div></div>`;
    let last = null; const $ = s => view.querySelector(s);
    async function run() {
      const btn = $('#rrun'); NC.busy(btn, true, 'Running…'); NC.alert($('#rmsg'), '');
      try {
        last = await A('report', { type: $('#rt').value, from: $('#rf').value, to: $('#rto').value });
        const fmt = v => (typeof v === 'number' ? v.toLocaleString('en-IN', { maximumFractionDigits: 3 }) : esc(v));
        $('#rout').innerHTML = `<h2 style="font-size:1.1rem">${esc(last.title)} <span class="mini">${esc(last.from)} → ${esc(last.to)}</span></h2><div class="tbl-wrap"><table class="t"><thead><tr>${last.columns.map(c => `<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>${last.rows.length ? last.rows.map(r => `<tr>${r.map(v => `<td class="${typeof v === 'number' ? 'num' : ''}">${fmt(v)}</td>`).join('')}</tr>`).join('') : `<tr><td colspan="${last.columns.length}"><div class="empty">No records in this period.</div></td></tr>`}</tbody></table></div><p class="mini">${esc(last.notes)}</p>`;
        $('#rcsv').disabled = $('#rprint').disabled = !last.rows.length;
      } catch (e) { onErr(e, $('#rmsg')); } finally { NC.busy(btn, false); }
    }
    $('#rrun').addEventListener('click', run);
    $('#rcsv').addEventListener('click', () => last && NC.download(`naeem-${last.type}-${last.from}_${last.to}.csv`, NC.csv(last.columns, last.rows)));
    $('#rprint').addEventListener('click', () => window.print());
  };
})();
