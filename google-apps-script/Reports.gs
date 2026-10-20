/**
 * NAEEM CHICKENS LABDAHA — Reports.gs
 * DEFINITIONS (shown in the admin UI too):
 *  Booked revenue  = TotalAmount of non-cancelled orders (what customers owe; includes delivery, minus discounts).
 *  Completed sales = booked revenue of DELIVERED orders.
 *  Collected       = verified Payments (refunds are negative) recorded against those orders.
 *  Pending         = per order max(0, TotalAmount - collected), non-cancelled orders only.
 *  Product revenue = sum of OrderItems.LineTotal (before order-level discount/delivery).
 *  Est. gross profit = LineTotal - cost for items whose cost snapshot exists; shown only with cost coverage %.
 * Cancelled orders are excluded from every revenue/kg figure. Enquiries converted to orders are counted once, as orders.
 */
function shiftDate_(s, n) { return Utilities.formatDate(new Date(new Date(s + 'T12:00:00+05:30').getTime() + n * 86400000), TZ, 'yyyy-MM-dd'); }
function range_(d) {
  var today = nowParts_().date, to = cleanStr_(d.to, 10) || today, from = cleanStr_(d.from, 10) || shiftDate_(to, -29);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || from > to) fail_('VALIDATION', 'Choose a valid date range.');
  if (shiftDate_(from, 366) < to) fail_('VALIDATION', 'Date range is limited to one year.');
  return { from: from, to: to, today: today };
}
function itemsByOrder_() { var m = {}; rows_('OrderItems').forEach(function (i) { (m[i.OrderID] = m[i.OrderID] || []).push(i); }); return m; }
function paidByOrder_() { var m = {}; rows_('Payments').forEach(function (p) { if (isTrue_(p.Verified)) m[p.OrderID] = (m[p.OrderID] || 0) + paise_(p.Amount); }); return m; }

function dashboard_(d, user) {
  var R = range_(d), cat = cleanStr_(d.categoryId, 30);
  var items = itemsByOrder_(), paid = paidByOrder_(), orders = rows_('Orders');
  var k = { bookedP: 0, completedP: 0, collectedP: 0, pendingP: 0, grams: 0, orders: 0, cancelled: 0, profitP: 0, costedP: 0, itemRevP: 0, discP: 0, delP: 0 };
  var status = {}, daily = {}, monthly = {}, prod = {}, catPerf = {}, type = { RETAIL: { p: 0, n: 0 }, BULK: { p: 0, n: 0 } };
  for (var dt = R.from; dt <= R.to; dt = shiftDate_(dt, 1)) daily[dt] = { p: 0, n: 0, g: 0 };
  var catNames = {}; rows_('Categories').forEach(function (c) { catNames[c.CategoryID] = c.Name; }); catNames.BULK = 'Bulk / Event';
  var today = { salesP: 0, orders: 0, grams: 0, status: {} };

  orders.forEach(function (o) {
    var day = dateOnly_(o.OrderDate), cancelled = o.OrderStatus === 'CANCELLED';
    var all = items[o.OrderID] || [];
    if (day === R.today) { today.status[o.OrderStatus] = (today.status[o.OrderStatus] || 0) + 1; if (!cancelled) { today.orders++; today.salesP += paise_(o.TotalAmount); all.forEach(function (i) { today.grams += num_(i.QuantityGrams); }); } }
    if (day < R.from || day > R.to) return;
    var its = cat ? all.filter(function (i) { return i.CategoryIDSnapshot === cat; }) : all;
    if (cat && !its.length) return;
    status[o.OrderStatus] = (status[o.OrderStatus] || 0) + 1;
    if (cancelled) { k.cancelled++; return; }
    var lineSum = 0, gr = 0; its.forEach(function (i) { lineSum += paise_(i.LineTotal); gr += num_(i.QuantityGrams); });
    var revP = cat ? lineSum : paise_(o.TotalAmount), due = Math.max(0, paise_(o.TotalAmount) - (paid[o.OrderID] || 0));
    k.orders++; k.bookedP += revP; k.grams += gr; k.discP += paise_(o.Discount); k.delP += paise_(o.DeliveryCharge);
    if (o.OrderStatus === 'DELIVERED') k.completedP += revP;
    k.collectedP += paid[o.OrderID] || 0; k.pendingP += due;
    daily[day].p += revP; daily[day].n++; daily[day].g += gr;
    var mk = day.slice(0, 7); monthly[mk] = (monthly[mk] || 0) + revP;
    var t = o.OrderType === 'BULK' ? 'BULK' : 'RETAIL'; type[t].p += revP; type[t].n++;
    its.forEach(function (i) {
      var lp = paise_(i.LineTotal), g = num_(i.QuantityGrams);
      var pr = prod[i.ProductNameSnapshot] || (prod[i.ProductNameSnapshot] = { g: 0, p: 0 }); pr.g += g; pr.p += lp;
      var cn = catNames[i.CategoryIDSnapshot] || 'Other', cp = catPerf[cn] || (catPerf[cn] = { g: 0, p: 0 }); cp.g += g; cp.p += lp;
      k.itemRevP += lp;
      if (i.CostPerKgSnapshot !== '' && i.CostPerKgSnapshot !== null) { var cost = Math.round(num_(i.CostPerKgSnapshot) * 100 * g / 1000); k.costedP += lp; k.profitP += lp - cost; }
    });
  });

  var products = rows_('Products').filter(function (p) { return !isTrue_(p.IsArchived); });
  var low = products.filter(function (p) { return isTrue_(p.TrackStock) && num_(p.StockGrams) <= num_(p.LowStockThresholdGrams); }).map(function (p) { return { name: p.Name, stockKg: num_(p.StockGrams) / 1000, thresholdKg: num_(p.LowStockThresholdGrams) / 1000 }; });
  var pendingEnq = rows_('EventEnquiries').filter(function (e) { return OPEN_ENQUIRY.indexOf(e.Status) >= 0; }).length;
  var recent = orders.slice().sort(function (a, b) { return String(b.OrderDate).localeCompare(String(a.OrderDate)); }).slice(0, 8).map(function (o) { return { orderId: o.OrderID, customer: o.CustomerName, amount: num_(o.TotalAmount), status: o.OrderStatus, date: o.OrderDate }; });
  var out = {
    range: { from: R.from, to: R.to }, status: computeStatus_(),
    today: { sales: rupees_(today.salesP), orders: today.orders, kg: today.grams / 1000, byStatus: today.status },
    kpi: { bookedRevenue: rupees_(k.bookedP), completedSales: rupees_(k.completedP), collected: rupees_(k.collectedP), pending: rupees_(k.pendingP), kgSold: k.grams / 1000, orders: k.orders, cancelled: k.cancelled, discounts: rupees_(k.discP), deliveryCharges: rupees_(k.delP),
      estGrossProfit: k.costedP > 0 ? rupees_(k.profitP) : null, costCoveragePct: k.itemRevP > 0 ? Math.round(k.costedP * 100 / k.itemRevP) : 0 },
    statusCounts: status,
    daily: Object.keys(daily).map(function (x) { return { date: x, revenue: rupees_(daily[x].p), orders: daily[x].n, kg: daily[x].g / 1000 }; }),
    monthly: Object.keys(monthly).sort().map(function (m) { return { month: m, revenue: rupees_(monthly[m]) }; }),
    products: Object.keys(prod).map(function (n) { return { name: n, kg: prod[n].g / 1000, revenue: rupees_(prod[n].p) }; }).sort(function (a, b) { return b.revenue - a.revenue; }),
    categories: Object.keys(catPerf).map(function (n) { return { name: n, kg: catPerf[n].g / 1000, revenue: rupees_(catPerf[n].p) }; }).sort(function (a, b) { return b.revenue - a.revenue; }),
    retailVsBulk: { retail: { revenue: rupees_(type.RETAIL.p), orders: type.RETAIL.n }, bulk: { revenue: rupees_(type.BULK.p), orders: type.BULK.n } },
    pendingEnquiries: pendingEnq, lowStock: low, recentOrders: recent, serverTime: stamp_()
  };
  if (user.role === 'OWNER') out.recentActivity = rows_('AuditLogs').sort(function (a, b) { return String(b.Timestamp).localeCompare(String(a.Timestamp)); }).slice(0, 8).map(function (r) { return { at: r.Timestamp, user: r.User, action: r.Action, id: r.EntityID }; });
  return out;
}

function report_(d, user) {
  var R = range_(d), type = cleanStr_(d.type, 30), items = itemsByOrder_(), paid = paidByOrder_();
  var orders = rows_('Orders').filter(function (o) { var x = dateOnly_(o.OrderDate); return x >= R.from && x <= R.to; });
  var financial = ['sales_daily', 'product_sales', 'retail_vs_bulk', 'payments'].indexOf(type) >= 0;
  var res = { type: type, from: R.from, to: R.to, columns: [], rows: [], notes: 'Cancelled orders are excluded from sales and kg figures.' };
  if (type === 'sales_daily') {
    res.title = 'Daily sales'; res.columns = ['Date', 'Orders', 'Cancelled', 'Booked revenue (₹)', 'Discounts (₹)', 'Delivery charges (₹)', 'Kg sold', 'Payments collected that day (₹)'];
    var days = {}; for (var dt = R.from; dt <= R.to; dt = shiftDate_(dt, 1)) days[dt] = { n: 0, c: 0, r: 0, di: 0, de: 0, g: 0, col: 0 };
    orders.forEach(function (o) { var x = dateOnly_(o.OrderDate), m = days[x]; if (o.OrderStatus === 'CANCELLED') { m.c++; return; } m.n++; m.r += paise_(o.TotalAmount); m.di += paise_(o.Discount); m.de += paise_(o.DeliveryCharge); (items[o.OrderID] || []).forEach(function (i) { m.g += num_(i.QuantityGrams); }); });
    rows_('Payments').forEach(function (p) { var x = dateOnly_(p.CreatedAt); if (days[x] && isTrue_(p.Verified)) days[x].col += paise_(p.Amount); });
    Object.keys(days).forEach(function (x) { var m = days[x]; res.rows.push([x, m.n, m.c, rupees_(m.r), rupees_(m.di), rupees_(m.de), m.g / 1000, rupees_(m.col)]); });
    res.notes += ' "Payments collected that day" is by payment date, so it can differ from booked revenue.';
  } else if (type === 'product_sales') {
    res.title = 'Product-wise sales'; res.columns = ['Product', 'Orders', 'Kg sold', 'Revenue (₹)', 'Est. cost (₹)', 'Est. gross profit (₹)'];
    var pr = {};
    orders.forEach(function (o) { if (o.OrderStatus === 'CANCELLED') return; (items[o.OrderID] || []).forEach(function (i) { var m = pr[i.ProductNameSnapshot] || (pr[i.ProductNameSnapshot] = { n: 0, g: 0, r: 0, c: 0, hasCost: true }); m.n++; m.g += num_(i.QuantityGrams); m.r += paise_(i.LineTotal); if (i.CostPerKgSnapshot === '') m.hasCost = false; else m.c += Math.round(num_(i.CostPerKgSnapshot) * 100 * num_(i.QuantityGrams) / 1000); }); });
    Object.keys(pr).forEach(function (n) { var m = pr[n]; res.rows.push([n, m.n, m.g / 1000, rupees_(m.r), m.hasCost ? rupees_(m.c) : '', m.hasCost ? rupees_(m.r - m.c) : '']); });
    res.notes += ' Cost/profit appear only where product cost was configured for every sale of that product.';
  } else if (type === 'retail_vs_bulk') {
    res.title = 'Retail vs bulk/event'; res.columns = ['Type', 'Orders', 'Kg', 'Booked revenue (₹)'];
    var t = { RETAIL: [0, 0, 0], BULK: [0, 0, 0] };
    orders.forEach(function (o) { if (o.OrderStatus === 'CANCELLED') return; var m = t[o.OrderType === 'BULK' ? 'BULK' : 'RETAIL']; m[0]++; (items[o.OrderID] || []).forEach(function (i) { m[1] += num_(i.QuantityGrams); }); m[2] += paise_(o.TotalAmount); });
    Object.keys(t).forEach(function (n) { res.rows.push([n, t[n][0], t[n][1] / 1000, rupees_(t[n][2])]); });
  } else if (type === 'orders') {
    res.title = 'Orders'; res.columns = ['Order ID', 'Date', 'Customer', 'Phone', 'Type', 'Fulfilment', 'Status', 'Payment method', 'Payment status', 'Total (₹)', 'Collected (₹)'];
    orders.forEach(function (o) { res.rows.push([o.OrderID, o.OrderDate, o.CustomerName, o.Phone, o.OrderType, o.FulfilmentType, o.OrderStatus, o.PaymentMethod, o.PaymentStatus, num_(o.TotalAmount), rupees_(paid[o.OrderID] || 0)]); });
    res.notes = 'Includes cancelled orders (status shown). Contains customer contact data - handle privately.';
  } else if (type === 'payments') {
    res.title = 'Payments'; res.columns = ['Payment ID', 'Order ID', 'Date', 'Method', 'Amount (₹)', 'Reference', 'Recorded by'];
    rows_('Payments').forEach(function (p) { var x = dateOnly_(p.CreatedAt); if (x >= R.from && x <= R.to && isTrue_(p.Verified)) res.rows.push([p.PaymentID, p.OrderID, p.CreatedAt, p.Method, num_(p.Amount), p.Reference, p.RecordedBy]); });
    res.notes = 'Verified payments only; refunds are negative.';
  } else if (type === 'inventory') {
    res.title = 'Inventory movement'; res.columns = ['Product', 'Opening kg', 'Incoming kg', 'Sold kg', 'Wastage kg', 'Adjustments kg', 'Closing kg'];
    inventorySummary_(R.from, R.to).forEach(function (s) { res.rows.push([s.name, s.openingGrams / 1000, s.incomingGrams / 1000, s.soldGrams / 1000, s.wastageGrams / 1000, s.adjustmentGrams / 1000, s.closingGrams / 1000]); });
    res.notes = 'Closing = Opening + Incoming - Sold - Wastage + Adjustments (sold is net of cancellations).';
  } else if (type === 'enquiries') {
    res.title = 'Event / bulk enquiries'; res.columns = ['Enquiry', 'Created', 'Customer', 'Phone', 'Event date', 'Kg', 'Status', 'Quote (₹)', 'Follow-up', 'Order'];
    rows_('EventEnquiries').forEach(function (e) { var x = dateOnly_(e.CreatedAt); if (x >= R.from && x <= R.to) res.rows.push([e.EnquiryID, e.CreatedAt, e.CustomerName, e.Phone, e.EventDate, num_(e.RequestedQuantityKg), e.Status, e.QuotedAmount === '' ? '' : num_(e.QuotedAmount), e.FollowUpDate, e.ConvertedOrderID]); });
    res.notes = 'Outstanding quotations = status Quotation Sent or Negotiation. Converted enquiries are counted as orders, not twice.';
  } else fail_('VALIDATION', 'Unknown report type.');
  return res;
}
