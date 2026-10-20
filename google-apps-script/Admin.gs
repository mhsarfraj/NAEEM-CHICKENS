/** NAEEM CHICKENS LABDAHA — Admin.gs (authorised actions; every handler receives the verified user) */

/* ---------- Orders ---------- */
function listOrders_(d) {
  var q = cleanStr_(d.q, 60).toLowerCase(), st = cleanStr_(d.status, 30), ful = cleanStr_(d.fulfilment, 12), type = cleanStr_(d.type, 10);
  var from = cleanStr_(d.from, 10), to = cleanStr_(d.to, 10), page = Math.max(1, parseInt(d.page, 10) || 1), size = Math.min(50, Math.max(5, parseInt(d.pageSize, 10) || 20));
  var items = {}; rows_('OrderItems').forEach(function (i) { (items[i.OrderID] = items[i.OrderID] || []).push(i); });
  var list = rows_('Orders').filter(function (o) {
    var day = dateOnly_(o.OrderDate);
    if (st && o.OrderStatus !== st) return false;
    if (ful && o.FulfilmentType !== ful) return false;
    if (type && o.OrderType !== type) return false;
    if (from && day < from) return false; if (to && day > to) return false;
    if (q && (String(o.OrderID) + ' ' + o.CustomerName + ' ' + o.Phone).toLowerCase().indexOf(q) < 0) return false;
    return true;
  }).sort(function (a, b) { return String(b.OrderDate).localeCompare(String(a.OrderDate)); });
  var total = list.length;
  var out = list.slice((page - 1) * size, page * size).map(function (o) {
    var its = items[o.OrderID] || [], g = 0;
    its.forEach(function (i) { g += num_(i.QuantityGrams); });
    return { orderId: o.OrderID, date: o.OrderDate, customer: o.CustomerName, phone: o.Phone, products: its.map(function (i) { return i.ProductNameSnapshot + ' ' + (num_(i.QuantityGrams) / 1000) + 'kg'; }).join(', '), totalKg: g / 1000, amount: num_(o.TotalAmount), paymentMethod: o.PaymentMethod, paymentStatus: o.PaymentStatus, fulfilment: o.FulfilmentType, type: o.OrderType, status: o.OrderStatus, assignedTo: o.AssignedTo, requestedAt: o.RequestedDateTime };
  });
  return { orders: out, total: total, page: page, pageSize: size };
}
function getOrder_(d) {
  var id = cleanStr_(d.orderId, 30), o = rows_('Orders').filter(function (r) { return r.OrderID === id; })[0];
  if (!o) fail_('NOT_FOUND', 'Order not found.');
  delete o._row; var pays = rows_('Payments').filter(function (p) { return p.OrderID === id; }), paid = 0;
  pays.forEach(function (p) { if (isTrue_(p.Verified)) paid += paise_(p.Amount); });
  return { order: o, items: rows_('OrderItems').filter(function (i) { return i.OrderID === id; }), history: rows_('OrderStatusHistory').filter(function (h) { return h.OrderID === id; }), payments: pays, paid: rupees_(paid), due: rupees_(Math.max(0, paise_(o.TotalAmount) - paid)) };
}
function updateOrderStatus_(d, user) {
  var id = cleanStr_(d.orderId, 30), ns = cleanStr_(d.status, 30).toUpperCase(), reason = cleanStr_(d.reason, 300);
  if (!(ns in RANK)) fail_('VALIDATION', 'Invalid status.');
  return withLock_(function () {
    var o = rows_('Orders').filter(function (r) { return r.OrderID === id; })[0];
    if (!o) fail_('NOT_FOUND', 'Order not found.');
    var cur = o.OrderStatus;
    if (cur === 'DELIVERED' || cur === 'CANCELLED') fail_('INVALID_TRANSITION', 'This order is already ' + cur.toLowerCase() + ' and cannot be changed.');
    if (ns === cur) fail_('INVALID_TRANSITION', 'Order is already ' + cur + '.');
    if (ns !== 'CANCELLED') {
      if (RANK[ns] <= RANK[cur] && !(RANK[ns] === 3 && RANK[cur] === 3)) fail_('INVALID_TRANSITION', 'Cannot move an order backwards.');
      if (ns === 'READY_FOR_PICKUP' && o.FulfilmentType !== 'PICKUP') fail_('INVALID_TRANSITION', 'Only pickup orders can be marked ready for pickup.');
      if (ns === 'OUT_FOR_DELIVERY' && o.FulfilmentType !== 'DELIVERY') fail_('INVALID_TRANSITION', 'Only delivery orders can be dispatched.');
    } else if (!reason) fail_('VALIDATION', 'A cancellation reason is required.');
    var now = stamp_(), patch = { OrderStatus: ns, UpdatedAt: now };
    if (ns === 'CANCELLED') {
      patch.CancelReason = reason;
      var prods = {}; rows_('Products').forEach(function (p) { prods[p.ProductID] = p; });
      var tx = [];
      rows_('OrderItems').filter(function (i) { return i.OrderID === id; }).forEach(function (i) {
        var p = prods[i.ProductID];
        if (p && isTrue_(p.TrackStock)) {
          p.StockGrams = num_(p.StockGrams) + num_(i.QuantityGrams); update_('Products', p._row, { StockGrams: p.StockGrams, UpdatedAt: now });
          tx.push({ TransactionID: uid_('T'), ProductID: p.ProductID, TransactionType: 'CANCEL_RESTORE', QuantityGrams: num_(i.QuantityGrams), UnitCost: '', ReferenceID: id, Notes: 'Order cancelled', CreatedAt: now, CreatedBy: user.username });
        }
      });
      appendMany_('InventoryTransactions', tx); invalidate_();
    }
    update_('Orders', o._row, patch);
    append_('OrderStatusHistory', { HistoryID: uid_('H'), OrderID: id, Status: ns, Note: reason || cleanStr_(d.note, 200), ChangedBy: user.username, CreatedAt: now });
    audit_(user.username, 'ORDER_STATUS', 'Orders', id, cur + ' -> ' + ns + (reason ? ' (' + reason + ')' : ''));
    return { orderId: id, status: ns };
  });
}
function updateOrder_(d, user) {
  var id = cleanStr_(d.orderId, 30);
  return withLock_(function () {
    var o = rows_('Orders').filter(function (r) { return r.OrderID === id; })[0];
    if (!o) fail_('NOT_FOUND', 'Order not found.');
    var patch = { UpdatedAt: stamp_() };
    if (d.internalNote) patch.InternalNotes = (o.InternalNotes ? o.InternalNotes + '\n' : '') + '[' + stamp_() + ' ' + user.username + '] ' + cleanStr_(d.internalNote, 400);
    if (d.assignedTo !== undefined) patch.AssignedTo = cleanStr_(d.assignedTo, 60);
    update_('Orders', o._row, patch);
    audit_(user.username, 'ORDER_UPDATE', 'Orders', id, Object.keys(patch).join(','));
    return { orderId: id };
  });
}
function recordPayment_(d, user) {
  var id = cleanStr_(d.orderId, 30), amtP = paise_(d.amount), refund = d.refund === true;
  if (!(amtP > 0) || amtP > 100000000) fail_('VALIDATION', 'Enter a valid amount.');
  if (refund && user.role !== 'OWNER') fail_('FORBIDDEN', 'Only the owner can record refunds.');
  var method = cleanStr_(d.method, 20).toUpperCase(); if (['CASH', 'UPI', 'CARD', 'OTHER'].indexOf(method) < 0) fail_('VALIDATION', 'Choose how the payment was received.');
  return withLock_(function () {
    var o = rows_('Orders').filter(function (r) { return r.OrderID === id; })[0];
    if (!o) fail_('NOT_FOUND', 'Order not found.');
    if (o.OrderStatus === 'CANCELLED' && !refund) fail_('INVALID_TRANSITION', 'Cannot record a payment on a cancelled order.');
    var paid = 0; rows_('Payments').forEach(function (p) { if (p.OrderID === id && isTrue_(p.Verified)) paid += paise_(p.Amount); });
    var signed = refund ? -amtP : amtP;
    if (!refund && paid + amtP > paise_(o.TotalAmount)) fail_('VALIDATION', 'Payment exceeds the amount due.');
    append_('Payments', { PaymentID: uid_('PAY'), OrderID: id, Amount: rupees_(signed), Method: method, Reference: cleanStr_(d.reference, 80), Verified: true, RecordedBy: user.username, CreatedAt: stamp_() });
    paid += signed;
    var ps = paid <= 0 ? 'UNPAID' : paid >= paise_(o.TotalAmount) ? 'PAID' : 'PARTIAL';
    update_('Orders', o._row, { PaymentStatus: ps, UpdatedAt: stamp_() });
    audit_(user.username, refund ? 'REFUND' : 'PAYMENT', 'Payments', id, method + ' ₹' + rupees_(amtP));
    return { orderId: id, paymentStatus: ps, paid: rupees_(paid) };
  });
}

/* ---------- Enquiries ---------- */
function listEnquiries_(d) {
  var st = cleanStr_(d.status, 30);
  var list = rows_('EventEnquiries').filter(function (e) { return !st || e.Status === st; }).sort(function (a, b) { return String(b.CreatedAt).localeCompare(String(a.CreatedAt)); }).slice(0, 300);
  return { items: list.map(function (e) { delete e._row; e.Notes = String(e.Notes).replace(/^\[req:[^\]]*\]\s*/, ''); return e; }), statuses: ENQUIRY_STATUSES };
}
function updateEnquiry_(d, user) {
  var id = cleanStr_(d.enquiryId, 30);
  return withLock_(function () {
    var e = rows_('EventEnquiries').filter(function (r) { return r.EnquiryID === id; })[0];
    if (!e) fail_('NOT_FOUND', 'Enquiry not found.');
    if (e.Status === 'Converted to Order') fail_('INVALID_TRANSITION', 'Already converted to an order.');
    var patch = { UpdatedAt: stamp_() };
    if (d.status !== undefined) {
      if (ENQUIRY_STATUSES.indexOf(d.status) < 0 || d.status === 'Converted to Order') fail_('VALIDATION', 'Invalid status.');
      patch.Status = d.status;
    }
    if (d.quotedAmount !== undefined && d.quotedAmount !== '') { var q = num_(d.quotedAmount); if (q < 0 || q > 10000000) fail_('VALIDATION', 'Invalid quote amount.'); patch.QuotedAmount = q; }
    if (d.followUpDate !== undefined) { var f = cleanStr_(d.followUpDate, 10); if (f && !/^\d{4}-\d{2}-\d{2}$/.test(f)) fail_('VALIDATION', 'Invalid follow-up date.'); patch.FollowUpDate = f; }
    if (d.notes !== undefined) { var pre = (/^\[req:[^\]]*\]/.exec(String(e.Notes)) || [''])[0]; patch.Notes = (pre ? pre + ' ' : '') + cleanStr_(d.notes, 800); }
    update_('EventEnquiries', e._row, patch);
    audit_(user.username, 'ENQUIRY_UPDATE', 'EventEnquiries', id, JSON.stringify({ s: patch.Status, q: patch.QuotedAmount }));
    return { enquiryId: id };
  });
}
function convertEnquiry_(d, user) {
  var id = cleanStr_(d.enquiryId, 30);
  return withLock_(function () {
    var e = rows_('EventEnquiries').filter(function (r) { return r.EnquiryID === id; })[0];
    if (!e) fail_('NOT_FOUND', 'Enquiry not found.');
    if (e.Status === 'Converted to Order') fail_('INVALID_TRANSITION', 'Already converted.');
    if (e.Status !== 'Confirmed') fail_('INVALID_TRANSITION', 'Set the enquiry to Confirmed (with a quote) before converting.');
    var qP = paise_(e.QuotedAmount); if (qP <= 0) fail_('VALIDATION', 'Add the negotiated quote amount first.');
    var kg = num_(e.RequestedQuantityKg), now = stamp_(), ymd = nowParts_().date;
    var orderId = 'NC-' + ymd.slice(2).replace(/-/g, '') + '-' + ('00' + nextSeq_(ymd)).slice(-3);
    var phone = String(e.Phone), cust = rows_('Customers').filter(function (c) { return String(c.Phone) === phone; })[0], cid;
    if (cust) { cid = cust.CustomerID; update_('Customers', cust._row, { TotalOrders: num_(cust.TotalOrders) + 1, LastOrderAt: now }); }
    else { cid = uid_('CU'); append_('Customers', { CustomerID: cid, Name: e.CustomerName, Phone: phone, WhatsApp: e.WhatsApp, TotalOrders: 1, CreatedAt: now, LastOrderAt: now }); }
    var when = e.EventDate + ' ' + (normTime_(e.DeliveryTime) || '09:00') + ':00';
    append_('Orders', { OrderID: orderId, RequestID: 'enq-' + id, Fingerprint: '', CustomerID: cid, CustomerName: e.CustomerName, Phone: phone, OrderDate: now, OrderType: 'BULK', FulfilmentType: e.FulfilmentType || 'DELIVERY', DeliveryAddress: e.EventLocation, Landmark: '', RequestedDateTime: when, Subtotal: rupees_(qP), Discount: 0, DiscountCode: '', DeliveryCharge: 0, TotalAmount: rupees_(qP), PaymentMethod: 'COD', PaymentStatus: 'UNPAID', OrderStatus: 'CONFIRMED', AssignedTo: '', Notes: 'Converted from enquiry ' + id + '. ' + (e.ProductRequirements || '') + ' ' + (e.Instructions || ''), InternalNotes: '', CancelReason: '', EnquiryID: id, CreatedAt: now, UpdatedAt: now });
    append_('OrderItems', { OrderItemID: uid_('OI'), OrderID: orderId, ProductID: 'BULK', ProductNameSnapshot: 'Bulk / event supply (' + (e.ProductRequirements || 'as quoted') + ')', CategoryIDSnapshot: 'BULK', QuantityGrams: Math.round(kg * 1000), PricePerKgSnapshot: kg > 0 ? rupees_(Math.round(qP / kg)) : 0, CostPerKgSnapshot: '', LineTotal: rupees_(qP), CuttingInstructions: e.Instructions || '' });
    append_('OrderStatusHistory', { HistoryID: uid_('H'), OrderID: orderId, Status: 'CONFIRMED', Note: 'Converted from enquiry ' + id, ChangedBy: user.username, CreatedAt: now });
    update_('EventEnquiries', e._row, { Status: 'Converted to Order', ConvertedOrderID: orderId, UpdatedAt: now });
    audit_(user.username, 'ENQUIRY_CONVERT', 'EventEnquiries', id, orderId);
    return { enquiryId: id, orderId: orderId };
  });
}

/* ---------- Shop status ---------- */
function setShopStatus_(d, user) {
  var ms = cleanStr_(d.manualStatus || 'AUTO', 20).toUpperCase();
  if (['AUTO', 'OPEN', 'CLOSED', 'TEMP_CLOSED', 'PAUSED'].indexOf(ms) < 0) fail_('VALIDATION', 'Invalid status.');
  var accepting = d.acceptingOrders !== false, S = settingsMap_();
  var hours = d.overrideHours === undefined || d.overrideHours === '' ? num_(S.ManualOverrideDefaultHours || 12) : num_(d.overrideHours);
  if (hours < 0 || hours > 24 * 14) fail_('VALIDATION', 'Override duration must be 0–336 hours (0 = until changed).');
  var exp = '';
  if (ms !== 'AUTO' && hours > 0) exp = stamp_(new Date(Date.now() + hours * 3600000));
  var er = cleanStr_(d.expectedReopening, 19); if (er && !parseIST_(er)) fail_('VALIDATION', 'Invalid reopening time.');
  return withLock_(function () {
    var r = rows_('ShopStatus')[0];
    var obj = { StatusID: 'MAIN', ManualStatus: ms, IsAcceptingOrders: accepting, StatusMessage: cleanStr_(d.message, 200), ExpectedReopeningTime: ms === 'AUTO' ? '' : er, ManualOverrideExpiry: exp, UpdatedAt: stamp_() };
    if (r) update_('ShopStatus', r._row, obj); else append_('ShopStatus', obj);
    audit_(user.username, 'SHOP_STATUS', 'ShopStatus', 'MAIN', ms + (accepting ? '' : ' (not accepting)') + (exp ? ' until ' + exp : ''));
    MEMO = {}; return computeStatus_();
  });
}

/* ---------- Products / categories ---------- */
function listProducts_() {
  return { items: rows_('Products').filter(function (p) { return !isTrue_(p.IsArchived); }).sort(function (a, b) { return num_(a.SortOrder) - num_(b.SortOrder); }).map(function (p) { delete p._row; return p; }), categories: rows_('Categories').filter(function (c) { return !isTrue_(c.IsArchived); }).sort(function (a, b) { return num_(a.SortOrder) - num_(b.SortOrder); }).map(function (c) { delete c._row; return c; }) };
}
function validImg_(u) { u = String(u || '').trim(); return u === '' || /^https:\/\/\S+$/i.test(u) || /^assets\/images\/[\w\-./]+$/.test(u); }
function saveProduct_(d, user) {
  var name = cleanStr_(d.name, 100); if (name.length < 2) fail_('VALIDATION', 'Product name is required.');
  var price = Number(d.pricePerKg); if (!isFinite(price) || price <= 0 || price > 100000) fail_('VALIDATION', 'Enter a valid price per kg.');
  var min = parseInt(d.minGrams, 10); if (!(min >= 50) || min % 50 !== 0 || min > 100000) fail_('VALIDATION', 'Minimum quantity must be a multiple of 50 g.');
  if (!validImg_(d.imageUrl)) fail_('VALIDATION', 'Image URL must start with https://');
  var cost = d.costPerKg === '' || d.costPerKg == null ? '' : Number(d.costPerKg); if (cost !== '' && (!isFinite(cost) || cost < 0)) fail_('VALIDATION', 'Invalid cost.');
  var disc = d.discountPercent;  // optional "sale price": stored as lower price by owner; kept simple
  return withLock_(function () {
    var cats = rows_('Categories'); if (!cats.some(function (c) { return c.CategoryID === d.categoryId && !isTrue_(c.IsArchived); })) fail_('VALIDATION', 'Choose a valid category.');
    var now = stamp_(), existing = d.productId ? rows_('Products').filter(function (p) { return p.ProductID === d.productId; })[0] : null;
    var obj = { Name: name, CategoryID: d.categoryId, Description: cleanStr_(d.description, 600), ImageURL: String(d.imageUrl || '').trim(), PricePerKg: price, CostPerKg: cost, MinimumQuantityGrams: min, LowStockThresholdGrams: Math.max(0, parseInt(d.lowStockGrams, 10) || 0), TrackStock: d.trackStock === true, IsAvailable: d.isAvailable !== false, IsFeatured: d.isFeatured === true, CuttingOptions: cleanStr_(d.cuts, 300), IsDemo: false, UpdatedAt: now };
    if (existing) {
      obj.IsDemo = isTrue_(existing.IsDemo) && existing.Name === name && num_(existing.PricePerKg) === price;
      update_('Products', existing._row, obj);
      if (num_(existing.PricePerKg) !== price) audit_(user.username, 'PRICE_CHANGE', 'Products', existing.ProductID, existing.PricePerKg + ' -> ' + price);
      audit_(user.username, 'PRODUCT_UPDATE', 'Products', existing.ProductID, name); invalidate_(); return { productId: existing.ProductID };
    }
    obj.ProductID = uid_('P'); obj.StockGrams = 0; obj.IsArchived = false; obj.SortOrder = (rows_('Products').length + 1) * 10; obj.CreatedAt = now;
    append_('Products', obj); audit_(user.username, 'PRODUCT_CREATE', 'Products', obj.ProductID, name); invalidate_();
    return { productId: obj.ProductID };
  });
}
function toggleProduct_(d, user) {
  return withLock_(function () {
    var p = rows_('Products').filter(function (r) { return r.ProductID === d.productId; })[0]; if (!p) fail_('NOT_FOUND', 'Product not found.');
    update_('Products', p._row, { IsAvailable: d.isAvailable === true, UpdatedAt: stamp_() });
    audit_(user.username, 'PRODUCT_AVAILABILITY', 'Products', p.ProductID, String(d.isAvailable === true)); invalidate_(); return { productId: p.ProductID, isAvailable: d.isAvailable === true };
  });
}
function archiveProduct_(d, user) {
  return withLock_(function () {
    var p = rows_('Products').filter(function (r) { return r.ProductID === d.productId; })[0]; if (!p) fail_('NOT_FOUND', 'Product not found.');
    update_('Products', p._row, { IsArchived: true, IsAvailable: false, UpdatedAt: stamp_() });
    audit_(user.username, 'PRODUCT_ARCHIVE', 'Products', p.ProductID, p.Name); invalidate_(); return { productId: p.ProductID };
  });
}
function saveCategory_(d, user) {
  var name = cleanStr_(d.name, 60); if (name.length < 2) fail_('VALIDATION', 'Category name is required.');
  return withLock_(function () {
    var c = d.categoryId ? rows_('Categories').filter(function (r) { return r.CategoryID === d.categoryId; })[0] : null;
    if (c) { update_('Categories', c._row, { Name: name, IsVisible: d.isVisible !== false }); audit_(user.username, 'CATEGORY_UPDATE', 'Categories', c.CategoryID, name); invalidate_(); return { categoryId: c.CategoryID }; }
    var id = uid_('C'); append_('Categories', { CategoryID: id, Name: name, SortOrder: (rows_('Categories').length + 1) * 10, IsVisible: d.isVisible !== false, IsArchived: false });
    audit_(user.username, 'CATEGORY_CREATE', 'Categories', id, name); invalidate_(); return { categoryId: id };
  });
}
function archiveCategory_(d, user) {
  return withLock_(function () {
    var c = rows_('Categories').filter(function (r) { return r.CategoryID === d.categoryId; })[0]; if (!c) fail_('NOT_FOUND', 'Category not found.');
    if (rows_('Products').some(function (p) { return p.CategoryID === c.CategoryID && !isTrue_(p.IsArchived); })) fail_('IN_USE', 'Move or archive the products in this category first.');
    update_('Categories', c._row, { IsArchived: true, IsVisible: false }); audit_(user.username, 'CATEGORY_ARCHIVE', 'Categories', c.CategoryID, c.Name); invalidate_(); return { categoryId: c.CategoryID };
  });
}
function reorder_(d, user) {
  var ent = d.entity === 'categories' ? ['Categories', 'CategoryID'] : d.entity === 'products' ? ['Products', 'ProductID'] : null;
  if (!ent || !Array.isArray(d.ids) || d.ids.length > 500) fail_('VALIDATION', 'Invalid reorder request.');
  return withLock_(function () {
    var rows = rows_(ent[0]), map = {}; rows.forEach(function (r) { map[r[ent[1]]] = r; });
    d.ids.forEach(function (id, i) { if (map[id]) update_(ent[0], map[id]._row, { SortOrder: (i + 1) * 10 }); });
    audit_(user.username, 'REORDER', ent[0], '', d.ids.length + ' items'); invalidate_(); return { count: d.ids.length };
  });
}

/* ---------- Settings, hours, discounts, suppliers, users, audit ---------- */
function missingSettings_() {
  var have = {}; rows_('Settings').forEach(function (r) { have[r.Key] = true; });
  return DEFAULT_SETTINGS.filter(function (r) { return !have[r[0]]; });
}
function ensureSettings_() {   // adds new default keys to a sheet created by an older version (never overwrites)
  var add = missingSettings_().map(function (r) { return { Key: r[0], Value: r[1], Description: r[2] }; });
  if (add.length) { appendMany_('Settings', add); MEMO = {}; invalidate_(); }
}
function getSettings_() {
  if (missingSettings_().length) withLock_(ensureSettings_);
  return { items: rows_('Settings').map(function (r) { return { key: r.Key, value: String(r.Value), description: r.Description }; }) };
}
function saveSettings_(d, user) {
  if (!d.values || typeof d.values !== 'object') fail_('VALIDATION', 'No settings supplied.');
  var BOOL = ['PayCOD','PayShop','PayUPI','DeliveryEnabled','AllowScheduledOrders','AllowBackorders','AcceptBulkWhenClosed','DemoMode'];
  var NUM = ['MinimumOrderAmount','DefaultDeliveryCharge','FreeDeliveryAbove','PrepMinutes','ManualOverrideDefaultHours'];
  return withLock_(function () {
    ensureSettings_();
    var rows = rows_('Settings'), changed = [];
    var LONG = { OwnerBio: 1200, OwnerQuote: 200, OwnerName: 80, OwnerRole: 80, OwnerPhotoData: 48000 };
    Object.keys(d.values).forEach(function (k) {
      if (k === 'TimeZone' || k === 'Currency' || k === 'OwnerPhotoVer') return;
      if (k === 'OwnerPhotoData') {
        var raw = String(d.values[k] || '');
        if (raw && (raw.length > 48000 || !/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+\/=]+$/.test(raw))) fail_('VALIDATION', 'Photo must be a JPEG, PNG or WebP image under about 35 KB. Try a smaller photo.');
      }
      var v = cleanStr_(d.values[k], LONG[k] || 600), row = rows.filter(function (r) { return r.Key === k; })[0];
      if (!row) fail_('VALIDATION', 'Unknown setting: ' + k);
      if (BOOL.indexOf(k) >= 0) v = isTrue_(v) ? 'TRUE' : 'FALSE';
      if (NUM.indexOf(k) >= 0 && (!isFinite(Number(v)) || Number(v) < 0)) fail_('VALIDATION', k + ' must be a positive number.');
      if (k === 'Phone' && v && !normPhone_(v)) fail_('VALIDATION', 'Phone must be a valid 10-digit number.');
      if (k === 'WhatsAppNumber' && v && !/^\d{10,13}$/.test(v)) fail_('VALIDATION', 'WhatsApp number must be digits with country code, e.g. 919876543210.');
      if (k === 'UPIID' && v && !/^[\w.\-]{2,}@[\w]{2,}$/.test(v)) fail_('VALIDATION', 'UPI ID looks invalid.');
      if (k === 'OwnerPhotoURL' && v && !/^https:\/\//.test(v) && !/^assets\/images\/[\w.\-]+$/.test(v)) fail_('VALIDATION', 'Photo link must start with https:// or be an assets/images/ file.');
      if ((k === 'GoogleMapsURL' || k === 'MapsEmbedURL') && v && !/^https:\/\//.test(v)) fail_('VALIDATION', k + ' must start with https://');
      if (String(row.Value) !== v) { update_('Settings', row._row, { Value: v }); changed.push(k); }
    });
    if (changed.indexOf('OwnerPhotoData') >= 0) {
      var vr = rows.filter(function (r) { return r.Key === 'OwnerPhotoVer'; })[0];
      if (vr) update_('Settings', vr._row, { Value: String(Date.now()) });
    }
    if (changed.length) audit_(user.username, 'SETTINGS', 'Settings', '', changed.join(', ')); invalidate_(); MEMO = {}; return { changed: changed };
  });
}
function saveHours_(d, user) {
  if (!Array.isArray(d.rows) || d.rows.length > 120) fail_('VALIDATION', 'Invalid hours.');
  var clean = d.rows.map(function (r) {
    var day = cleanStr_(r.day, 10), ok = DAYS.indexOf(day) >= 0 || /^\d{4}-\d{2}-\d{2}$/.test(day);
    if (!ok) fail_('VALIDATION', 'Day must be Mon–Sun or a date (YYYY-MM-DD).');
    var closed = r.isClosed === true, o = normTime_(r.open), c = normTime_(r.close);
    if (!closed && (!o || !c || o >= c)) fail_('VALIDATION', day + ': opening time must be before closing time.');
    return { Day: day, OpenTime: closed ? '' : o, CloseTime: closed ? '' : c, IsClosed: closed, Note: cleanStr_(r.note, 100) };
  });
  DAYS.forEach(function (x) { if (!clean.some(function (r) { return r.Day === x; })) fail_('VALIDATION', 'Missing row for ' + x); });
  return withLock_(function () {
    var sh = sheet_('BusinessHours'); if (sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, 5).clearContent();
    var h = SCHEMA.BusinessHours; sh.getRange(2, 1, clean.length, 5).setValues(clean.map(function (o) { return h.map(function (c) { return o[c]; }); }));
    audit_(user.username, 'HOURS', 'BusinessHours', '', clean.length + ' rows'); MEMO = {}; return { saved: clean.length };
  });
}
function saveDiscount_(d, user) {
  var code = cleanStr_(d.code, 30).toUpperCase().replace(/[^A-Z0-9_-]/g, ''); if (code.length < 3) fail_('VALIDATION', 'Code must be 3+ letters/numbers.');
  var type = String(d.type).toUpperCase() === 'FLAT' ? 'FLAT' : 'PERCENT', val = Number(d.value);
  if (!isFinite(val) || val <= 0 || (type === 'PERCENT' && val > 100)) fail_('VALIDATION', 'Invalid discount value.');
  return withLock_(function () {
    var ex = rows_('Discounts').filter(function (r) { return String(r.Code).toUpperCase() === code; })[0];
    var obj = { Code: code, Type: type, Value: val, MinOrderAmount: Math.max(0, num_(d.minOrderAmount)), IsActive: d.isActive !== false, ExpiresAt: cleanStr_(d.expiresAt, 19) };
    if (ex) update_('Discounts', ex._row, obj); else { obj.DiscountID = uid_('D'); append_('Discounts', obj); }
    audit_(user.username, 'DISCOUNT', 'Discounts', code, type + ' ' + val); return { code: code };
  });
}
function saveSupplier_(d, user) {
  var name = cleanStr_(d.name, 80); if (name.length < 2) fail_('VALIDATION', 'Supplier name required.');
  return withLock_(function () {
    var ex = d.supplierId ? rows_('Suppliers').filter(function (r) { return r.SupplierID === d.supplierId; })[0] : null;
    var obj = { Name: name, Phone: cleanStr_(d.phone, 20), Notes: cleanStr_(d.notes, 200), IsActive: d.isActive !== false };
    if (ex) update_('Suppliers', ex._row, obj); else { obj.SupplierID = uid_('S'); append_('Suppliers', obj); }
    audit_(user.username, 'SUPPLIER', 'Suppliers', obj.SupplierID || ex.SupplierID, name); return { saved: true };
  });
}
function listUsers_() { return { items: rows_('AdminUsers').map(function (u) { return { username: u.Username, name: u.DisplayName, role: u.Role, isActive: isTrue_(u.IsActive), lastLogin: u.LastLoginAt }; }) }; }
function saveUser_(d, user) {
  var uname = cleanStr_(d.username, 40).toLowerCase(); if (!/^[a-z0-9._@-]{3,40}$/.test(uname)) fail_('VALIDATION', 'Username: 3–40 letters, numbers, . _ - @');
  var role = String(d.role).toUpperCase() === 'OWNER' ? 'OWNER' : 'STAFF', pw = d.password ? String(d.password) : '';
  if (pw && (pw.length < 10 || pw.length > 200)) fail_('VALIDATION', 'Password must be at least 10 characters.');
  return withLock_(function () {
    var all = rows_('AdminUsers'), ex = all.filter(function (r) { return String(r.Username).toLowerCase() === uname; })[0];
    var active = d.isActive !== false;
    if (ex) {
      var owners = all.filter(function (r) { return String(r.Role).toUpperCase() === 'OWNER' && isTrue_(r.IsActive); });
      var losing = String(ex.Role).toUpperCase() === 'OWNER' && isTrue_(ex.IsActive) && (role !== 'OWNER' || !active);
      if (losing && owners.length <= 1) fail_('VALIDATION', 'There must be at least one active owner.');
      if (uname === user.username && !active) fail_('VALIDATION', 'You cannot disable your own account.');
      var patch = { DisplayName: cleanStr_(d.name, 60) || ex.DisplayName, Role: role, IsActive: active };
      if (pw) { var s = randomSecret_().slice(0, 24); patch.Salt = s; patch.PasswordHash = hash_(pw, s); }
      update_('AdminUsers', ex._row, patch);
    } else {
      if (!pw) fail_('VALIDATION', 'Password is required for new users.');
      var salt = randomSecret_().slice(0, 24);
      append_('AdminUsers', { Username: uname, DisplayName: cleanStr_(d.name, 60) || uname, Role: role, Salt: salt, PasswordHash: hash_(pw, salt), IsActive: active, CreatedAt: stamp_(), LastLoginAt: '' });
    }
    audit_(user.username, ex ? 'USER_UPDATE' : 'USER_CREATE', 'AdminUsers', uname, role + (active ? '' : ' disabled')); return { username: uname };
  });
}
function listAudit_(d) {
  var q = cleanStr_(d.q, 40).toLowerCase();
  var l = rows_('AuditLogs').filter(function (r) { return !q || (r.User + ' ' + r.Action + ' ' + r.EntityID).toLowerCase().indexOf(q) >= 0; }).sort(function (a, b) { return String(b.Timestamp).localeCompare(String(a.Timestamp)); }).slice(0, 300);
  return { items: l.map(function (r) { delete r._row; return r; }) };
}

/* ---------- Inventory ---------- */
var INV_TYPES = { OPENING: 1, PURCHASE: 1, WASTAGE: -1, ADJUSTMENT: 0 };
function addInventory_(d, user) {
  var type = cleanStr_(d.type, 20).toUpperCase(); if (!(type in INV_TYPES)) fail_('VALIDATION', 'Invalid transaction type.');
  var g = Math.round(num_(d.quantityKg) * 1000); if (!g || Math.abs(g) > 1000000) fail_('VALIDATION', 'Enter a valid quantity in kg.');
  if (type !== 'ADJUSTMENT' && g < 0) fail_('VALIDATION', 'Quantity must be positive for this type.');
  var signed = INV_TYPES[type] === 0 ? g : INV_TYPES[type] * Math.abs(g);
  return withLock_(function () {
    var p = rows_('Products').filter(function (r) { return r.ProductID === d.productId; })[0]; if (!p) fail_('NOT_FOUND', 'Product not found.');
    var ns = num_(p.StockGrams) + signed;
    if (ns < 0 && !isTrue_(settingsMap_().AllowBackorders)) fail_('VALIDATION', 'This would make stock negative (' + (ns / 1000) + ' kg).');
    var now = stamp_();
    update_('Products', p._row, { StockGrams: ns, TrackStock: true, UpdatedAt: now });
    append_('InventoryTransactions', { TransactionID: uid_('T'), ProductID: p.ProductID, TransactionType: type, QuantityGrams: signed, UnitCost: d.unitCost === '' || d.unitCost == null ? '' : Math.max(0, num_(d.unitCost)), ReferenceID: cleanStr_(d.supplierId, 20), Notes: cleanStr_(d.notes, 200), CreatedAt: now, CreatedBy: user.username });
    audit_(user.username, 'INVENTORY', 'Products', p.ProductID, type + ' ' + (signed / 1000) + 'kg'); invalidate_();
    return { productId: p.ProductID, stockGrams: ns };
  });
}
/** Closing = Opening + Incoming - Sold - Wastage + Adjustments  (all derived from InventoryTransactions) */
function inventorySummary_(from, to) {
  var tx = rows_('InventoryTransactions'), out = [];
  rows_('Products').filter(function (p) { return isTrue_(p.TrackStock) && !isTrue_(p.IsArchived); }).forEach(function (p) {
    var cur = num_(p.StockGrams), since = 0, after = 0, inc = 0, sold = 0, waste = 0, adj = 0;
    tx.forEach(function (t) {
      if (t.ProductID !== p.ProductID) return; var day = dateOnly_(t.CreatedAt), q = num_(t.QuantityGrams);
      if (day >= from) since += q; if (day > to) after += q;
      if (day >= from && day <= to) {
        if (t.TransactionType === 'OPENING' || t.TransactionType === 'PURCHASE') inc += q;
        else if (t.TransactionType === 'SALE' || t.TransactionType === 'CANCEL_RESTORE') sold += -q;
        else if (t.TransactionType === 'WASTAGE') waste += -q; else adj += q;
      }
    });
    var opening = cur - since, closing = cur - after;
    out.push({ productId: p.ProductID, name: p.Name, openingGrams: opening, incomingGrams: inc, soldGrams: sold, wastageGrams: waste, adjustmentGrams: adj, closingGrams: closing, thresholdGrams: num_(p.LowStockThresholdGrams), low: cur <= num_(p.LowStockThresholdGrams) });
  });
  return out;
}
function listInventory_(d) {
  var to = cleanStr_(d.to, 10) || nowParts_().date, from = cleanStr_(d.from, 10) || to;
  var names = {}; rows_('Products').forEach(function (p) { names[p.ProductID] = p.Name; });
  var tx = rows_('InventoryTransactions').sort(function (a, b) { return String(b.CreatedAt).localeCompare(String(a.CreatedAt)); }).slice(0, 200).map(function (t) { delete t._row; t.ProductName = names[t.ProductID] || t.ProductID; return t; });
  return { summary: inventorySummary_(from, to), transactions: tx, suppliers: rows_('Suppliers').filter(function (s) { return isTrue_(s.IsActive); }), from: from, to: to };
}
