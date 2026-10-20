// Runs the real .gs files in Node against a mock of Apps Script services. Usage: node tests/run-tests.js
const crypto = require('crypto');
const M = require('./mock-gas'); const { ctx, sheets, props, fmtIST, nowMs } = M;
const vm = require('vm');
const __unused = 0;

let pass = 0, failN = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✔', m); } else { failN++; console.log('  ✘ FAIL:', m); } };
const call = (action, data = {}) => JSON.parse(ctx.doPost({ postData: { contents: JSON.stringify({ action, ...data }) } }).s);
const get = action => JSON.parse(ctx.doGet({ parameter: { action } }).s);
const run = M.run;
const tomorrow = () => fmtIST(nowMs() + 86400000, 'yyyy-MM-dd');
const mkOrder = (o = {}) => ({ action: 'createOrder', requestId: 'req-' + crypto.randomUUID(), customerName: 'Test Customer', phone: '9876543210', fulfilment: 'PICKUP', paymentMethod: 'SHOP', date: tomorrow(), time: '12:00', items: [{ productId: 'P1', grams: 1000 }], ...o });
const order = o => call('createOrder', (({ action, ...r }) => r)(mkOrder(o)));

(async () => {
  console.log('Setup');
  run('setupDatabase()');
  ok(Object.keys(sheets).length === 16, '16 sheets created');
  run('PropertiesService.getScriptProperties().setProperty("INIT_OWNER_USER","Owner1")');
  props.INIT_OWNER_PASS = 'Correct-Horse-9';
  run('initOwnerAccount()');
  ok(!('INIT_OWNER_PASS' in props), 'temporary password property deleted');
  const hashCell = sheets.AdminUsers.get(2, 5);
  ok(hashCell && hashCell !== 'Correct-Horse-9' && !String(hashCell).includes('Correct'), 'password stored as hash, not plaintext');

  console.log('Public catalogue');
  let r = get('catalog');
  ok(r.ok && r.data.products.length === 9 && r.data.categories.length === 12, 'catalog returns 12 categories / 9 demo products');
  ok(!JSON.stringify(r).includes('Salt') && !JSON.stringify(r).includes('PasswordHash'), 'no admin data in public catalogue');
  ok(!('Phone' in r.data.settings && r.data.settings.Phone) , 'blank phone not invented');
  ok(get('catalog').ok, 'cached catalog works');
  ok(get('listOrders').ok === false, 'GET cannot reach admin actions');

  console.log('Pricing & orders');
  // set real prices via owner later; first login
  r = call('login', { username: 'owner1', password: 'wrong-password' });
  ok(!r.ok && r.error.code === 'BAD_LOGIN', 'wrong password rejected');
  r = call('login', { username: 'owner1', password: 'Correct-Horse-9' });
  ok(r.ok && r.data.token, 'owner login works');
  const T = r.data.token;
  const A = (a, d = {}) => call(a, { token: T, ...d });
  ok(call('dashboard').error.code === 'UNAUTHORIZED', 'admin action without token → UNAUTHORIZED');
  ok(call('dashboard', { token: T + 'x' }).error.code === 'UNAUTHORIZED', 'tampered token rejected');

  // price 399.99/kg -> check rounding using paise
  r = A('saveProduct', { productId: 'P1', name: 'Fresh Whole Chicken', categoryId: 'C1', pricePerKg: 199.99, minGrams: 500, costPerKg: 150, imageUrl: '', trackStock: false, isAvailable: true, isFeatured: true, cuts: 'Whole', description: 'x' });
  ok(r.ok, 'owner can update product price');
  r = A('saveProduct', { productId: 'P1', name: 'x', categoryId: 'C1', pricePerKg: -5, minGrams: 500 });
  ok(!r.ok && r.error.code === 'VALIDATION', 'negative price rejected');
  r = A('saveProduct', { productId: 'P1', name: 'Fresh Whole Chicken', categoryId: 'C1', pricePerKg: 199.99, minGrams: 500, costPerKg: 150, imageUrl: 'javascript:alert(1)' });
  ok(!r.ok, 'unsafe image URL rejected');
  A('saveSettings', { values: { AllowScheduledOrders: 'TRUE' } });
  r = order({ items: [{ productId: 'P1', grams: 1250 }] });
  ok(r.ok && r.data.total === 249.99, 'server total correct for 1.25 kg @ 199.99 → ' + (r.data && r.data.total));
  const firstId = r.data.orderId;
  ok(/^NC-\d{6}-001$/.test(firstId), 'order ID format ' + firstId);
  r = order({ items: [{ productId: 'P1', grams: 1000 }], phone: '9876543211' });
  ok(r.ok && r.data.total === 199.99, '1 kg → 199.99');
  ok(!order({ items: [{ productId: 'P1', grams: 0 }] }).ok, 'zero quantity rejected');
  ok(!order({ items: [{ productId: 'P1', grams: -500 }] }).ok, 'negative quantity rejected');
  ok(!order({ items: [{ productId: 'P1', grams: 1033 }] }).ok, 'non-50g quantity rejected');
  ok(!order({ items: [{ productId: 'P1', grams: 250 }] }).ok, 'below minimum quantity rejected');
  ok(!order({ items: [{ productId: 'NOPE', grams: 500 }] }).ok, 'unknown product rejected');
  ok(!order({ phone: '12345' }).ok, 'bad phone rejected');
  const client = mkOrder({ phone: '9000000001' }); delete client.action;
  client.total = 1; client.items[0].price = 1;   // client-supplied price must be ignored
  r = call('createOrder', client);
  ok(r.ok && r.data.total === 199.99, 'client-supplied total/price ignored');
  const r2 = call('createOrder', client);
  ok(r2.ok && r2.data.duplicate && r2.data.orderId === r.data.orderId && r2.data.items.length === 1 && r2.data.total === 199.99, 'same requestId → duplicate returns full original order, no new order');
  const fpOrder = (() => { const o = mkOrder({ phone: '9000000002' }); delete o.action; return o; })();
  const f1 = call('createOrder', fpOrder); fpOrder.requestId = 'req-' + crypto.randomUUID();
  const f2 = call('createOrder', fpOrder);
  ok(f1.ok && f2.ok && f2.data.duplicate && f2.data.orderId === f1.data.orderId, 'identical resubmission with new requestId detected as duplicate');
  const count = run('rows_("Orders").length');
  ok(count === 4, 'exactly 4 orders stored (' + count + ')');
  r = order({ fulfilment: 'DELIVERY', paymentMethod: 'COD', address: 'x', phone: '9000000003' });
  ok(!r.ok, 'delivery without address rejected');
  r = order({ paymentMethod: 'UPI', phone: '9000000004' });
  ok(!r.ok, 'UPI refused until owner configures UPI ID');

  console.log('Discount, delivery, min order');
  A('saveDiscount', { code: 'SAVE10', type: 'PERCENT', value: 10, minOrderAmount: 0, isActive: true });
  A('saveSettings', { values: { DefaultDeliveryCharge: '30', MinimumOrderAmount: '100' } });
  r = order({ fulfilment: 'DELIVERY', paymentMethod: 'COD', address: 'House 12, Main Road, Labdaha', discountCode: 'save10', phone: '9000000005' });
  ok(r.ok && r.data.discount === 19.99 && r.data.deliveryCharge === 30 && r.data.total === 210, 'discount 10% + ₹30 delivery → total ' + (r.data && r.data.total));
  ok(!order({ discountCode: 'BOGUS', phone: '9000000006' }).ok, 'invalid discount rejected');

  console.log('Order status & history');
  r = A('updateOrderStatus', { orderId: firstId, status: 'CONFIRMED' }); ok(r.ok, 'confirm order');
  r = A('updateOrderStatus', { orderId: firstId, status: 'RECEIVED' }); ok(!r.ok, 'cannot go backwards');
  r = A('updateOrderStatus', { orderId: firstId, status: 'OUT_FOR_DELIVERY' }); ok(!r.ok, 'pickup order cannot be dispatched');
  r = A('updateOrderStatus', { orderId: firstId, status: 'READY_FOR_PICKUP' }); ok(r.ok, 'mark ready');
  r = A('updateOrderStatus', { orderId: firstId, status: 'CANCELLED' }); ok(!r.ok, 'cancel needs reason');
  r = A('recordPayment', { orderId: firstId, amount: 100, method: 'CASH' }); ok(r.ok && r.data.paymentStatus === 'PARTIAL', 'partial payment recorded');
  r = A('recordPayment', { orderId: firstId, amount: 9999, method: 'CASH' }); ok(!r.ok, 'overpayment rejected');
  r = A('recordPayment', { orderId: firstId, amount: 149.99, method: 'UPI', reference: 'UTR123' }); ok(r.ok && r.data.paymentStatus === 'PAID', 'full payment → PAID');
  r = A('updateOrderStatus', { orderId: firstId, status: 'DELIVERED' }); ok(r.ok, 'delivered');
  r = A('updateOrderStatus', { orderId: firstId, status: 'CANCELLED', reason: 'x' }); ok(!r.ok, 'delivered order is final');
  r = A('getOrder', { orderId: firstId }); ok(r.ok && r.data.history.length === 4 && r.data.paid === 249.99, 'history has 4 entries, paid 249.99');
  r = call('trackOrder', { orderId: firstId, phone: '9876543210' });
  ok(r.ok && r.data.status === 'DELIVERED' && !('DeliveryAddress' in r.data) && !JSON.stringify(r.data).includes('9876543210'), 'tracking shows status without exposing phone/address');
  ok(!call('trackOrder', { orderId: firstId, phone: '9999999999' }).ok, 'tracking with wrong phone rejected');

  console.log('Cancelled orders excluded from revenue');
  const cOrder = order({ phone: '9000000007' }).data.orderId;
  const before = A('dashboard').data.kpi;
  A('updateOrderStatus', { orderId: cOrder, status: 'CANCELLED', reason: 'Customer request' });
  const after = A('dashboard').data.kpi;
  ok(after.cancelled === before.cancelled + 1 && after.bookedRevenue === before.bookedRevenue - 199.99, 'cancelled order removed from booked revenue');

  console.log('Dashboard definitions');
  const dash = A('dashboard').data;
  ok(dash.kpi.collected === 249.99, 'collected = verified payments only (' + dash.kpi.collected + ')');
  ok(dash.kpi.completedSales === 249.99, 'completed sales = delivered orders only');
  ok(dash.kpi.pending > 0 && dash.kpi.bookedRevenue > dash.kpi.collected, 'pending > 0 and booked ≠ collected');
  ok(dash.kpi.estGrossProfit !== null && dash.kpi.costCoveragePct === 100, 'profit shown because cost configured');
  const sum = dash.daily.reduce((a, d) => a + d.revenue, 0);
  ok(Math.abs(sum - dash.kpi.bookedRevenue) < 0.01, 'daily series sums to booked revenue');
  const noCost = A('dashboard', { categoryId: 'C2' }).data;
  ok(noCost.kpi.orders === 0, 'category filter works');
  ok(A('report', { type: 'sales_daily' }).ok && A('report', { type: 'orders' }).ok && A('report', { type: 'product_sales' }).data.rows.length >= 1, 'reports generate');

  console.log('Inventory');
  A('saveProduct', { productId: 'P3', name: 'Curry Cut Chicken', categoryId: 'C3', pricePerKg: 220, minGrams: 500, trackStock: true, isAvailable: true, lowStockGrams: 2000, cuts: '' });
  r = A('addInventory', { productId: 'P3', type: 'PURCHASE', quantityKg: 10, unitCost: 150 }); ok(r.ok && r.data.stockGrams === 10000, 'purchase +10 kg');
  r = A('addInventory', { productId: 'P3', type: 'WASTAGE', quantityKg: 1 }); ok(r.ok && r.data.stockGrams === 9000, 'wastage −1 kg');
  r = order({ items: [{ productId: 'P3', grams: 4000 }], phone: '9000000008' }); ok(r.ok, 'order 4 kg deducts stock');
  const inv = r.data.orderId;
  r = order({ items: [{ productId: 'P3', grams: 6000 }], phone: '9000000009' }); ok(!r.ok && r.error.code === 'UNAVAILABLE', 'cannot oversell (only 5 kg left)');
  r = A('addInventory', { productId: 'P3', type: 'ADJUSTMENT', quantityKg: -20 }); ok(!r.ok, 'negative stock blocked');
  r = A('listInventory'); const s = r.data.summary.find(x => x.productId === 'P3');
  ok(s.closingGrams === 5000 && s.closingGrams === s.openingGrams + s.incomingGrams - s.soldGrams - s.wastageGrams + s.adjustmentGrams, 'closing stock formula holds (' + s.closingGrams + ')');
  A('updateOrderStatus', { orderId: inv, status: 'CANCELLED', reason: 'test' });
  ok(run('rows_("Products").filter(p=>p.ProductID==="P3")[0].StockGrams') === 9000, 'cancel restores stock');

  console.log('Shop status');
  r = get('status'); ok(r.ok && ['OPEN', 'CLOSED'].includes(r.data.state), 'status computed: ' + r.data.state);
  r = A('setShopStatus', { manualStatus: 'CLOSED', acceptingOrders: true, message: 'Closed for Eid', overrideHours: 2 });
  ok(r.ok && r.data.state === 'CLOSED' && r.data.isManual && r.data.message === 'Closed for Eid', 'owner closes shop');
  ok(get('status').data.state === 'CLOSED', 'public status shows closed');
  A('saveSettings', { values: { AllowScheduledOrders: 'FALSE' } });
  r = order({ phone: '9000000010' }); ok(!r.ok && r.error.code === 'SHOP_CLOSED', 'checkout blocked when closed (scheduling off)');
  A('saveSettings', { values: { AllowScheduledOrders: 'TRUE' } });
  r = order({ phone: '9000000011', time: '03:00' }); ok(!r.ok, 'scheduled order outside opening hours rejected');
  r = order({ phone: '9000000012', time: '12:00' }); ok(r.ok, 'scheduled order inside hours allowed while closed');
  M.setClock(3 * 3600000);
  ok(get('status').data.isManual === false, 'manual override auto-expires after 2h');
  M.setClock(0);
  r = A('setShopStatus', { manualStatus: 'OPEN', acceptingOrders: false, message: 'Busy' });
  ok(!order({ phone: '9000000013' }).ok, 'not-accepting blocks orders');
  A('setShopStatus', { manualStatus: 'AUTO', acceptingOrders: true });
  ok(get('status').data.isManual === false, 'back to AUTO');

  console.log('Enquiries');
  const enq = { requestId: 'enq-' + crypto.randomUUID(), customerName: 'Rahim Caterers', phone: '9811111111', eventDate: tomorrow(), eventLocation: 'Wedding hall, Labdaha', quantityKg: 80, products: ['Curry cut', 'Keema'], supplyType: 'ONE_TIME', fulfilment: 'DELIVERY' };
  r = call('createEnquiry', enq); ok(r.ok && /^EN-/.test(r.data.enquiryId), 'enquiry saved ' + r.data.enquiryId);
  const eid = r.data.enquiryId; ok(call('createEnquiry', enq).data.duplicate === true, 'duplicate enquiry submit detected');
  ok(!call('createEnquiry', { ...enq, requestId: 'enq-' + crypto.randomUUID(), quantityKg: 0 }).ok, 'zero kg enquiry rejected');
  r = A('convertEnquiry', { enquiryId: eid }); ok(!r.ok, 'cannot convert before confirmed/quoted');
  ok(A('updateEnquiry', { enquiryId: eid, status: 'Negotiation', quotedAmount: 15000, notes: 'Asked discount', followUpDate: tomorrow() }).ok, 'negotiate + quote');
  ok(A('updateEnquiry', { enquiryId: eid, status: 'Confirmed', quotedAmount: 14500 }).ok, 'confirm with negotiated price');
  r = A('convertEnquiry', { enquiryId: eid }); ok(r.ok && /^NC-/.test(r.data.orderId), 'converted to order ' + r.data.orderId);
  r = A('listEnquiries'); const e = r.data.items.find(x => x.EnquiryID === eid);
  ok(e.Status === 'Converted to Order' && e.ConvertedOrderID === r.data.items[0].ConvertedOrderID && e.CustomerName === 'Rahim Caterers' && e.QuotedAmount === 14500, 'original enquiry details preserved');
  ok(!A('convertEnquiry', { enquiryId: eid }).ok, 'cannot convert twice');
  const bulk = A('listOrders', { type: 'BULK' }).data; ok(bulk.total === 1 && bulk.orders[0].amount === 14500, 'bulk order listed once with quote price');

  console.log('Roles & security');
  r = A('saveUser', { username: 'staff1', name: 'Staff One', role: 'STAFF', password: 'StaffPass-12345' }); ok(r.ok, 'owner creates staff');
  const S = call('login', { username: 'staff1', password: 'StaffPass-12345' }).data.token;
  const AS = (a, d = {}) => call(a, { token: S, ...d });
  ok(AS('listOrders').ok, 'staff can list orders');
  ok(AS('saveProduct', {}).error.code === 'FORBIDDEN', 'staff cannot edit products');
  ok(AS('saveSettings', {}).error.code === 'FORBIDDEN', 'staff cannot change settings');
  {
    const img = 'data:image/jpeg;base64,/9j/4AAQSkZJRg==';
    ok(A('getSettings').data.items.some(i => i.key === 'OwnerName'), 'owner profile keys exist');
    ok(!AS('saveSettings', { values: { OwnerName: 'x' } }).ok, 'staff cannot edit owner profile');
    ok(A('saveSettings', { values: { OwnerName: 'Test Owner', OwnerBio: 'Hello', OwnerPhotoData: img } }).ok, 'owner can save profile + photo');
    const pub = get('catalog').data.settings;
    ok(pub.OwnerName === 'Test Owner' && pub.OwnerPhotoVer && !('OwnerPhotoData' in pub), 'catalog exposes profile but not photo blob');
    ok(get('ownerPhoto').data.photo === img, 'public ownerPhoto endpoint returns photo');
    ok(!A('saveSettings', { values: { OwnerPhotoData: 'javascript:alert(1)' } }).ok, 'bad photo data rejected');
    ok(!A('saveSettings', { values: { OwnerPhotoURL: 'http://x/y.jpg' } }).ok, 'non-https photo URL rejected');
  }
  ok(AS('listUsers').error.code === 'FORBIDDEN', 'staff cannot list users');
  ok(AS('listAudit').error.code === 'FORBIDDEN', 'staff cannot read audit logs');
  ok(AS('recordPayment', { orderId: firstId, amount: 1, method: 'CASH', refund: true }).error.code !== undefined, 'staff refund blocked');
  ok(!AS('dashboard').data.recentActivity, 'staff dashboard hides admin activity');
  ok(AS('toggleProduct', { productId: 'P2', isAvailable: false }).ok, 'staff can toggle availability');
  ok(get('catalog').data.products.find(p => p.id === 'P2').available === false, 'availability change shows publicly (cache invalidated)');
  ok(AS('logout').ok && AS('dashboard').error.code === 'SESSION_EXPIRED', 'logout revokes session');
  for (let i = 0; i < 5; i++) call('login', { username: 'staff1', password: 'nope-nope-nope' });
  ok(call('login', { username: 'staff1', password: 'StaffPass-12345' }).error.code === 'LOCKED', 'brute-force lockout after 5 failures');
  M.setClock(7 * 3600000); ok(call('dashboard', { token: T }).error.code === 'SESSION_EXPIRED', 'session expires after 6h'); M.setClock(0);
  ok(call('createOrder', { requestId: 'x'.repeat(70000) }).error.code === 'TOO_LARGE', 'oversized request rejected');
  ok(call('nonsense').error.code === 'UNKNOWN_ACTION', 'unknown action rejected');
  ok(JSON.stringify(call('createOrder', {})).indexOf('stack') < 0, 'errors do not leak internals');

  console.log('Audit');
  const audit = A('listAudit').data.items.map(x => x.Action);
  ['LOGIN', 'LOGIN_FAILED', 'PRICE_CHANGE', 'ORDER_STATUS', 'PAYMENT', 'INVENTORY', 'SHOP_STATUS', 'ENQUIRY_CONVERT', 'SETTINGS', 'USER_CREATE', 'PRODUCT_AVAILABILITY'].forEach(a => ok(audit.includes(a), 'audit has ' + a));

  console.log('\nRESULT: ' + pass + ' passed, ' + failN + ' failed');
  process.exit(failN ? 1 : 0);
})();
