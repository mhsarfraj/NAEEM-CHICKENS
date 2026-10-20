/**
 * NAEEM CHICKENS LABDAHA — Code.gs  (core, auth, public API)
 * Deploy as Web App: Execute as ME, access ANYONE. All security is enforced here.
 * Transport: browser sends POST with Content-Type text/plain (JSON body) — avoids CORS preflight.
 * Response envelope: {ok:true,data:{...}} | {ok:false,error:{code,message}}
 */
var TZ = 'Asia/Kolkata';
var MAX_BODY = 60000;
var SESSION_SEC = 6 * 3600;                 // 6h (revocation list lives in a 6h cache)
var DAYS = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
var RANK = { RECEIVED: 0, CONFIRMED: 1, PREPARING: 2, READY_FOR_PICKUP: 3, OUT_FOR_DELIVERY: 3, DELIVERED: 4, CANCELLED: 9 };
var ENQUIRY_STATUSES = ['New Enquiry','Contacted','Quotation Sent','Negotiation','Confirmed','Converted to Order','Completed','Rejected'];
var OPEN_ENQUIRY = ['New Enquiry','Contacted','Quotation Sent','Negotiation'];

/* ---------- Action table: [authLevel, handler] (built lazily so file load order never matters) ---------- */
function actions_() { return {
  ping: ['public', function () { return { time: stamp_() }; }],
  catalog: ['public', catalog_],
  status: ['public', function () { return computeStatus_(); }],
  ownerPhoto: ['public', ownerPhoto_],
  quote: ['public', quote_],
  createOrder: ['public', createOrder_],
  trackOrder: ['public', trackOrder_],
  createEnquiry: ['public', createEnquiry_],
  login: ['public', login_],
  logout: ['staff', logout_],
  me: ['staff', me_],
  changePassword: ['staff', changePassword_],
  dashboard: ['staff', dashboard_],
  listOrders: ['staff', listOrders_],
  getOrder: ['staff', getOrder_],
  updateOrderStatus: ['staff', updateOrderStatus_],
  updateOrder: ['staff', updateOrder_],
  recordPayment: ['staff', recordPayment_],
  listEnquiries: ['staff', listEnquiries_],
  updateEnquiry: ['staff', updateEnquiry_],
  convertEnquiry: ['staff', convertEnquiry_],
  setShopStatus: ['staff', setShopStatus_],
  listProducts: ['staff', listProducts_],
  toggleProduct: ['staff', toggleProduct_],
  listInventory: ['staff', listInventory_],
  addInventory: ['staff', addInventory_],
  report: ['staff', report_],
  listSuppliers: ['staff', function () { return { items: rows_('Suppliers') }; }],
  saveProduct: ['owner', saveProduct_],
  archiveProduct: ['owner', archiveProduct_],
  saveCategory: ['owner', saveCategory_],
  archiveCategory: ['owner', archiveCategory_],
  listCategories: ['staff', function () { return { items: rows_('Categories').filter(function (c) { return !isTrue_(c.IsArchived); }) }; }],
  reorder: ['owner', reorder_],
  getSettings: ['owner', getSettings_],
  saveSettings: ['owner', saveSettings_],
  getHours: ['owner', function () { return { items: rows_('BusinessHours') }; }],
  saveHours: ['owner', saveHours_],
  listDiscounts: ['owner', function () { return { items: rows_('Discounts') }; }],
  saveDiscount: ['owner', saveDiscount_],
  saveSupplier: ['owner', saveSupplier_],
  listUsers: ['owner', listUsers_],
  saveUser: ['owner', saveUser_],
  listAudit: ['owner', listAudit_]
}; }

function doGet(e) {
  var out;
  try {
    var p = (e && e.parameter) || {};
    var a = actions_()[p.action];
    if (!a || a[0] !== 'public' || ['catalog', 'status', 'ping', 'ownerPhoto'].indexOf(p.action) < 0) fail_('UNKNOWN_ACTION', 'Unsupported GET action.');
    out = { ok: true, data: a[1]({}, null) };
  } catch (err) { out = errOut_(err); }
  return json_(out);
}

function doPost(e) {
  var out;
  try {
    var raw = (e && e.postData && e.postData.contents) || '';
    if (raw.length > MAX_BODY) fail_('TOO_LARGE', 'Request too large.');
    var req;
    try { req = JSON.parse(raw); } catch (x) { fail_('BAD_JSON', 'Invalid request.'); }
    if (!req || typeof req !== 'object') fail_('BAD_JSON', 'Invalid request.');
    var a = actions_()[req.action];
    if (!a) fail_('UNKNOWN_ACTION', 'Unknown action.');
    var user = null;
    if (a[0] !== 'public') {
      user = auth_(req.token);
      if (a[0] === 'owner' && user.role !== 'OWNER') fail_('FORBIDDEN', 'Owner permission required.');
    }
    out = { ok: true, data: a[1](req, user) };
  } catch (err) { out = errOut_(err); }
  return json_(out);
}

function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
function fail_(code, msg) { throw { apiError: true, code: code, message: msg }; }
function errOut_(err) {
  if (err && err.apiError) return { ok: false, error: { code: err.code, message: err.message } };
  var m = String((err && err.message) || err);
  try { console.error(err && err.stack ? err.stack : m); } catch (x) {}
  if (/too many times|quota|limit exceeded/i.test(m)) return { ok: false, error: { code: 'QUOTA', message: 'The server is busy right now. Please try again in a few minutes.' } };
  return { ok: false, error: { code: 'SERVER_ERROR', message: 'Something went wrong on the server. Please try again.' } };
}

/* ---------- Sheet helpers ---------- */
function ss_() {
  var id = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
  return id ? SpreadsheetApp.openById(id) : SpreadsheetApp.getActiveSpreadsheet();
}
function sheet_(n) { var s = ss_().getSheetByName(n); if (!s) fail_('SERVER_ERROR', 'Missing sheet: ' + n); return s; }
function cell_(v, h) {
  if (v instanceof Date) {
    var s = Utilities.formatDate(v, TZ, 'yyyy-MM-dd HH:mm:ss');
    return s.slice(11) === '00:00:00' ? s.slice(0, 10) : s;
  }
  return v;
}
function rows_(n) {
  var s = sheet_(n), v = s.getDataRange().getValues();
  if (v.length < 2) return [];
  var h = v[0], out = [];
  for (var i = 1; i < v.length; i++) {
    var o = { _row: i + 1 }, empty = true;
    for (var j = 0; j < h.length; j++) { o[h[j]] = cell_(v[i][j], h[j]); if (v[i][j] !== '' && v[i][j] !== null) empty = false; }
    if (!empty) out.push(o);
  }
  return out;
}
function headers_(s) { return s.getRange(1, 1, 1, s.getLastColumn()).getValues()[0]; }
function append_(n, obj) { appendMany_(n, [obj]); }
function appendMany_(n, objs) {
  if (!objs.length) return;
  var s = sheet_(n), h = headers_(s);
  var data = objs.map(function (o) { return h.map(function (c) { return o[c] === undefined ? '' : o[c]; }); });
  s.getRange(s.getLastRow() + 1, 1, data.length, h.length).setValues(data);
}
function update_(n, row, patch) {
  var s = sheet_(n), h = headers_(s);
  var cur = s.getRange(row, 1, 1, h.length).getValues()[0];
  h.forEach(function (c, i) { if (Object.prototype.hasOwnProperty.call(patch, c)) cur[i] = patch[c]; });
  s.getRange(row, 1, 1, h.length).setValues([cur]);
}
function withLock_(fn) {
  var l = LockService.getScriptLock();
  if (!l.tryLock(20000)) fail_('BUSY', 'The system is busy. Please try again in a moment.');
  try { return fn(); } finally { l.releaseLock(); }
}

/* ---------- Generic helpers ---------- */
function num_(v) { var n = Number(v); return isFinite(n) ? n : 0; }
function isTrue_(v) { return v === true || String(v).toUpperCase() === 'TRUE'; }
function paise_(rupees) { return Math.round(num_(rupees) * 100); }
function rupees_(p) { return Math.round(p) / 100; }
function stamp_(d) { return Utilities.formatDate(d || new Date(), TZ, 'yyyy-MM-dd HH:mm:ss'); }
function parseIST_(s) {
  s = String(s || '').trim(); if (!s) return null;
  if (s.length === 10) s += ' 00:00:00';
  if (s.length === 16) s += ':00';
  var d = new Date(s.replace(' ', 'T') + '+05:30');
  return isNaN(d.getTime()) ? null : d;
}
function cleanStr_(v, max) { return String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max || 200); }
function normPhone_(v) {
  var s = String(v == null ? '' : v).replace(/[\s\-+()]/g, '');
  if (/^91\d{10}$/.test(s)) s = s.slice(2);
  if (/^0\d{10}$/.test(s)) s = s.slice(1);
  return /^[6-9]\d{9}$/.test(s) ? s : '';
}
function uid_(prefix) { return prefix + Utilities.getUuid().replace(/-/g, '').slice(0, 10).toUpperCase(); }
function nextSeq_(key) {
  var P = PropertiesService.getScriptProperties(), k = 'seq_' + key, n = parseInt(P.getProperty(k) || '0', 10) + 1;
  P.setProperty(k, String(n)); return n;
}
function rateLimit_(key, max, ttl) {
  var c = CacheService.getScriptCache(), n = parseInt(c.get(key) || '0', 10);
  if (n >= max) fail_('RATE_LIMIT', 'Too many requests. Please wait a while and try again.');
  c.put(key, String(n + 1), ttl);
}
function dateOnly_(s) { return String(s || '').slice(0, 10); }
function pad2_(n) { return (n < 10 ? '0' : '') + n; }
function normTime_(t) { var m = /^(\d{1,2}):(\d{2})/.exec(String(t || '')); return m ? pad2_(+m[1]) + ':' + m[2] : ''; }
function audit_(user, action, entity, id, details) {
  try { append_('AuditLogs', { LogID: uid_('L'), Timestamp: stamp_(), User: user, Action: action, Entity: entity, EntityID: id, Details: String(details || '').slice(0, 500) }); } catch (e) {}
}
function invalidate_() { CacheService.getScriptCache().remove('catalog_v2'); }

/* ---------- Settings ---------- */
var MEMO = {};
function settingsMap_() {
  if (MEMO.settings) return MEMO.settings;
  var m = {}; rows_('Settings').forEach(function (r) { m[r.Key] = String(r.Value == null ? '' : r.Value); });
  return (MEMO.settings = m);
}
var PUBLIC_SETTING_KEYS = ['BusinessName','Locality','Phone','WhatsAppNumber','Address','GoogleMapsURL','MapsEmbedURL','Currency','UPIID','UPIPayeeName','PayCOD','PayShop','PayUPI','DeliveryEnabled','DeliveryArea','MinimumOrderAmount','DefaultDeliveryCharge','FreeDeliveryAbove','PrepMinutes','AllowScheduledOrders','AcceptBulkWhenClosed','LogoURL','WebsiteAnnouncement','DemoMode','Testimonials','OwnerName','OwnerRole','OwnerQuote','OwnerBio','OwnerPhotoURL','OwnerPhotoVer'];
function ownerPhoto_() { var S = settingsMap_(); return { photo: S.OwnerPhotoData || '', ver: S.OwnerPhotoVer || '' }; }

/* ---------- Passwords & sessions ---------- */
function prop_(k) { var v = PropertiesService.getScriptProperties().getProperty(k); if (!v) fail_('SERVER_ERROR', 'Server not configured (run setupDatabase).'); return v; }
function b64_(bytes) { return Utilities.base64Encode(bytes); }
function hash_(pw, salt) {
  var pepper = prop_('PEPPER'), h = salt + '|' + pw;
  for (var i = 0; i < 1000; i++) h = b64_(Utilities.computeHmacSha256Signature(h, pepper));
  return h;
}
function safeEq_(a, b) {
  a = String(a); b = String(b); if (a.length !== b.length) return false;
  var r = 0; for (var i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i); return r === 0;
}
function sign_(payload) { return Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(payload, prop_('TOKEN_SECRET'))); }
function makeToken_(u) {
  var p = Utilities.base64EncodeWebSafe(JSON.stringify({ u: u, e: Math.floor(Date.now() / 1000) + SESSION_SEC, n: Utilities.getUuid().slice(0, 8) }));
  return p + '.' + sign_(p);
}
function auth_(token) {
  token = String(token || ''); var parts = token.split('.');
  if (parts.length !== 2) fail_('UNAUTHORIZED', 'Please log in.');
  if (!safeEq_(sign_(parts[0]), parts[1])) fail_('UNAUTHORIZED', 'Please log in.');
  var p; try { p = JSON.parse(Utilities.newBlob(Utilities.base64DecodeWebSafe(parts[0])).getDataAsString()); } catch (e) { fail_('UNAUTHORIZED', 'Please log in.'); }
  if (!p || p.e < Math.floor(Date.now() / 1000)) fail_('SESSION_EXPIRED', 'Your session has expired. Please log in again.');
  if (CacheService.getScriptCache().get('rev_' + parts[1].slice(0, 40))) fail_('SESSION_EXPIRED', 'You are logged out.');
  var u = rows_('AdminUsers').filter(function (r) { return String(r.Username).toLowerCase() === p.u; })[0];
  if (!u || !isTrue_(u.IsActive)) fail_('UNAUTHORIZED', 'Account disabled.');
  return { username: p.u, name: u.DisplayName || p.u, role: String(u.Role).toUpperCase() === 'OWNER' ? 'OWNER' : 'STAFF', sig: parts[1], exp: p.e };
}
function login_(d) {
  var uname = cleanStr_(d.username, 60).toLowerCase(), pw = String(d.password || '');
  if (!uname || !pw || pw.length > 200) fail_('VALIDATION', 'Enter username and password.');
  var c = CacheService.getScriptCache(), k = 'lf_' + uname, kAll = 'lf_ALL';
  if (parseInt(c.get(k) || '0', 10) >= 5 || parseInt(c.get(kAll) || '0', 10) >= 40) fail_('LOCKED', 'Too many failed attempts. Try again in 15 minutes.');
  var u = rows_('AdminUsers').filter(function (r) { return String(r.Username).toLowerCase() === uname; })[0];
  var ok = u && isTrue_(u.IsActive) && safeEq_(hash_(pw, String(u.Salt)), String(u.PasswordHash));
  if (!ok) {
    c.put(k, String(parseInt(c.get(k) || '0', 10) + 1), 900); c.put(kAll, String(parseInt(c.get(kAll) || '0', 10) + 1), 900);
    Utilities.sleep(400); audit_(uname, 'LOGIN_FAILED', 'AdminUsers', uname, '');
    fail_('BAD_LOGIN', 'Incorrect username or password.');
  }
  c.remove(k);
  update_('AdminUsers', u._row, { LastLoginAt: stamp_() });
  audit_(uname, 'LOGIN', 'AdminUsers', uname, '');
  return { token: makeToken_(uname), expiresInSec: SESSION_SEC, user: { username: uname, name: u.DisplayName || uname, role: String(u.Role).toUpperCase() } };
}
function logout_(d, user) {
  CacheService.getScriptCache().put('rev_' + user.sig.slice(0, 40), '1', 21600);
  audit_(user.username, 'LOGOUT', 'AdminUsers', user.username, ''); return { loggedOut: true };
}
function me_(d, user) { return { user: { username: user.username, name: user.name, role: user.role }, status: computeStatus_(), serverTime: stamp_() }; }
function changePassword_(d, user) {
  var np = String(d.newPassword || ''); if (np.length < 10 || np.length > 200) fail_('VALIDATION', 'New password must be at least 10 characters.');
  return withLock_(function () {
    var u = rows_('AdminUsers').filter(function (r) { return String(r.Username).toLowerCase() === user.username; })[0];
    if (!safeEq_(hash_(String(d.oldPassword || ''), String(u.Salt)), String(u.PasswordHash))) fail_('BAD_LOGIN', 'Current password is incorrect.');
    var salt = randomSecret_().slice(0, 24);
    update_('AdminUsers', u._row, { Salt: salt, PasswordHash: hash_(np, salt) });
    audit_(user.username, 'PASSWORD_CHANGED', 'AdminUsers', user.username, ''); return { changed: true };
  });
}

/* ---------- Shop status (Asia/Kolkata, server time) ---------- */
function nowParts_(d) {
  d = d || new Date();
  return { date: Utilities.formatDate(d, TZ, 'yyyy-MM-dd'), time: Utilities.formatDate(d, TZ, 'HH:mm'), day: DAYS[parseInt(Utilities.formatDate(d, TZ, 'u'), 10) - 1] };
}
function dayOf_(dateStr) { return DAYS[parseInt(Utilities.formatDate(new Date(dateStr + 'T12:00:00+05:30'), TZ, 'u'), 10) - 1]; }
function hoursFor_(dateStr) {
  var rows = MEMO.hours || (MEMO.hours = rows_('BusinessHours')), day = dayOf_(dateStr);
  var sp = rows.filter(function (r) { return String(r.Day) === dateStr; })[0];
  var r = sp || rows.filter(function (x) { return String(x.Day) === day; })[0];
  if (!r || isTrue_(r.IsClosed) || !normTime_(r.OpenTime) || !normTime_(r.CloseTime)) return { closed: true, note: r ? r.Note : '' };
  return { closed: false, open: normTime_(r.OpenTime), close: normTime_(r.CloseTime), note: r.Note, special: !!sp };
}
function withinHours_(dateObj) {
  var p = nowParts_(dateObj), h = hoursFor_(p.date);
  return !h.closed && p.time >= h.open && p.time < h.close;
}
function nextOpen_(from) {
  for (var i = 0; i < 9; i++) {
    var d = new Date(from.getTime() + i * 86400000), p = nowParts_(d), h = hoursFor_(p.date);
    if (h.closed) continue;
    var openAt = parseIST_(p.date + ' ' + h.open + ':00');
    if (openAt > from) return { at: stamp_(openAt), label: (i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : p.day) + ' ' + h.open };
  }
  return null;
}
function shopStatusRow_() {
  var r = rows_('ShopStatus')[0];
  return r || { ManualStatus: 'AUTO', IsAcceptingOrders: true, StatusMessage: '', ExpectedReopeningTime: '', ManualOverrideExpiry: '' };
}
function computeStatus_() {
  var st = shopStatusRow_(), now = new Date(), p = nowParts_(now);
  var manual = String(st.ManualStatus || 'AUTO').toUpperCase();
  var exp = parseIST_(st.ManualOverrideExpiry);
  var manualActive = manual !== 'AUTO' && (!exp || exp > now);
  var hrs = hoursFor_(p.date);
  var autoOpen = !hrs.closed && p.time >= hrs.open && p.time < hrs.close;
  var state = manualActive ? manual : (autoOpen ? 'OPEN' : 'CLOSED');
  var accepting = st.IsAcceptingOrders === '' || isTrue_(st.IsAcceptingOrders);
  var no = state === 'OPEN' ? null : nextOpen_(now);
  var labels = { OPEN: 'OPEN NOW', CLOSED: 'CLOSED NOW', TEMP_CLOSED: 'TEMPORARILY CLOSED', PAUSED: 'PAUSED FOR PREPARATION' };
  return {
    state: state, label: labels[state] || 'CLOSED NOW', acceptingOrders: accepting, isManual: manualActive,
    message: manualActive || !accepting ? String(st.StatusMessage || '') : '',
    expectedReopening: manualActive && st.ExpectedReopeningTime ? String(st.ExpectedReopeningTime) : '',
    overrideExpiry: manualActive && exp ? String(st.ManualOverrideExpiry) : '',
    today: { closed: hrs.closed, open: hrs.open || '', close: hrs.close || '', note: hrs.note || '' },
    nextOpen: no ? no.label : '', nextOpenAt: no ? no.at : '', serverTime: stamp_(now), tz: TZ,
    week: DAYS.map(function (dn) { var r = (MEMO.hours || (MEMO.hours = rows_('BusinessHours'))).filter(function (x) { return String(x.Day) === dn; })[0]; return { day: dn, closed: !r || isTrue_(r.IsClosed) || !normTime_(r.OpenTime), open: r ? normTime_(r.OpenTime) : '', close: r ? normTime_(r.CloseTime) : '' }; })
  };
}
/** Can an order for requestedAt be accepted right now? Throws fail_ with a friendly message. */
function assertCanOrder_(status, requestedAt, S) {
  if (!status.acceptingOrders) fail_('SHOP_CLOSED', status.message || 'We are not accepting orders right now.');
  if (status.state === 'OPEN') return;
  if (status.state === 'PAUSED') fail_('SHOP_CLOSED', status.message || 'Orders are paused for preparation. Please try again shortly.');
  if (!isTrue_(S.AllowScheduledOrders)) fail_('SHOP_CLOSED', (status.message ? status.message + ' ' : '') + 'The shop is closed and not taking scheduled orders. ' + (status.nextOpen ? 'Opens ' + status.nextOpen + '.' : ''));
  if (status.expectedReopening) { var er = parseIST_(status.expectedReopening); if (er && requestedAt < er) fail_('SHOP_CLOSED', 'The shop reopens at ' + status.expectedReopening + '. Choose a later time.'); }
  if (!withinHours_(requestedAt)) fail_('OUTSIDE_HOURS', 'The shop is closed now. Please choose a time within opening hours.');
}

/* ---------- Public: catalogue ---------- */
function catalog_() {
  var cache = CacheService.getScriptCache(), c = cache.get('catalog_v2'), body;
  if (c) { body = JSON.parse(c); } else {
    var S = settingsMap_(), backorder = isTrue_(S.AllowBackorders), pub = {};
    PUBLIC_SETTING_KEYS.forEach(function (k) { pub[k] = S[k] === undefined ? '' : S[k]; });
    if (!isTrue_(S.PayUPI) || !S.UPIID) { pub.UPIID = ''; }
    var cats = rows_('Categories').filter(function (x) { return isTrue_(x.IsVisible) && !isTrue_(x.IsArchived); })
      .sort(function (a, b) { return num_(a.SortOrder) - num_(b.SortOrder); })
      .map(function (x) { return { id: x.CategoryID, name: x.Name }; });
    var catIds = cats.map(function (x) { return x.id; });
    var prods = rows_('Products').filter(function (x) { return !isTrue_(x.IsArchived) && catIds.indexOf(x.CategoryID) >= 0; })
      .sort(function (a, b) { return num_(a.SortOrder) - num_(b.SortOrder); })
      .map(function (x) {
        var track = isTrue_(x.TrackStock), stock = num_(x.StockGrams), min = num_(x.MinimumQuantityGrams) || 250;
        var avail = isTrue_(x.IsAvailable) && (!track || backorder || stock >= min);
        var label = !isTrue_(x.IsAvailable) ? 'Unavailable' : (track && !backorder && stock < min) ? 'Out of stock' : (track && stock <= num_(x.LowStockThresholdGrams)) ? 'Low stock' : 'In stock';
        return { id: x.ProductID, name: x.Name, categoryId: x.CategoryID, description: x.Description, imageUrl: x.ImageURL, pricePerKg: num_(x.PricePerKg), minGrams: min, available: avail, featured: isTrue_(x.IsFeatured), stockLabel: label, demo: isTrue_(x.IsDemo), cuts: String(x.CuttingOptions || '').split(';').map(function (s) { return s.trim(); }).filter(Boolean) };
      });
    body = { categories: cats, products: prods, settings: pub };
    cache.put('catalog_v2', JSON.stringify(body), 60);
  }
  body.status = computeStatus_();
  return body;
}

/* ---------- Public: orders ---------- */
function validateItems_(items) {
  if (!Array.isArray(items) || !items.length || items.length > 30) fail_('VALIDATION', 'Your cart is empty or too large.');
  var merged = {};
  items.forEach(function (it) {
    var id = cleanStr_(it && it.productId, 30), g = it && it.grams;
    if (!id || typeof g !== 'number' || !isFinite(g) || Math.floor(g) !== g || g <= 0) fail_('VALIDATION', 'Invalid quantity in cart.');
    if (g % 50 !== 0) fail_('VALIDATION', 'Quantities must be in steps of 50 g.');
    if (g > 200000) fail_('VALIDATION', 'Quantity too large. Use the Bulk / Event page.');
    var m = merged[id] || (merged[id] = { productId: id, grams: 0, cuts: [] });
    m.grams += g; var cut = cleanStr_(it.cut, 120); if (cut && m.cuts.indexOf(cut) < 0) m.cuts.push(cut);
  });
  return Object.keys(merged).map(function (k) { return merged[k]; });
}
function findDiscount_(code, subtotalP) {
  code = cleanStr_(code, 30).toUpperCase(); if (!code) return null;
  var d = rows_('Discounts').filter(function (r) { return String(r.Code).toUpperCase() === code && isTrue_(r.IsActive); })[0];
  if (!d) fail_('VALIDATION', 'Discount code is not valid.');
  var ex = parseIST_(d.ExpiresAt); if (ex && ex < new Date()) fail_('VALIDATION', 'Discount code has expired.');
  if (subtotalP < paise_(d.MinOrderAmount)) fail_('VALIDATION', 'Minimum order of ₹' + num_(d.MinOrderAmount) + ' needed for this code.');
  var amt = String(d.Type).toUpperCase() === 'PERCENT' ? Math.floor(subtotalP * Math.min(num_(d.Value), 100) / 100) : Math.min(paise_(d.Value), subtotalP);
  return { code: code, amountP: amt };
}
function createOrder_(d) {
  if (d.website) return { orderId: 'NC-OK', ignored: true };   // honeypot
  var S = settingsMap_();
  var name = cleanStr_(d.customerName, 80), phone = normPhone_(d.phone), wa = d.whatsapp ? normPhone_(d.whatsapp) : '';
  if (name.length < 2) fail_('VALIDATION', 'Please enter your full name.');
  if (!phone) fail_('VALIDATION', 'Enter a valid 10-digit mobile number.');
  if (d.whatsapp && !wa) fail_('VALIDATION', 'WhatsApp number is not valid.');
  var ful = String(d.fulfilment || '').toUpperCase();
  if (ful !== 'PICKUP' && ful !== 'DELIVERY') fail_('VALIDATION', 'Choose pickup or delivery.');
  var address = cleanStr_(d.address, 300), landmark = cleanStr_(d.landmark, 120);
  if (ful === 'DELIVERY') {
    if (!isTrue_(S.DeliveryEnabled)) fail_('VALIDATION', 'Delivery is not available. Please choose pickup.');
    if (address.length < 10) fail_('VALIDATION', 'Please enter your full delivery address.');
  }
  var pm = String(d.paymentMethod || '').toUpperCase();
  var pmOk = { COD: isTrue_(S.PayCOD) && ful === 'DELIVERY', SHOP: isTrue_(S.PayShop) && ful === 'PICKUP', UPI: isTrue_(S.PayUPI) && !!S.UPIID };
  if (!pmOk[pm]) fail_('VALIDATION', 'Selected payment method is not available for this order.');
  var reqAt = parseIST_(cleanStr_(d.date, 10) + ' ' + normTime_(d.time) + ':00');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(d.date || '')) || !normTime_(d.time) || !reqAt) fail_('VALIDATION', 'Choose a valid date and time.');
  var prep = Math.max(num_(S.PrepMinutes), 0);
  if (reqAt.getTime() < Date.now() + prep * 60000 - 60000) fail_('VALIDATION', 'Please choose a time at least ' + prep + ' minutes from now.');
  if (reqAt.getTime() > Date.now() + 30 * 86400000) fail_('VALIDATION', 'Please choose a date within the next 30 days.');
  var reqId = cleanStr_(d.requestId, 64);
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(reqId)) fail_('VALIDATION', 'Invalid request. Please reload the page.');
  var items = validateItems_(d.items);
  var notes = cleanStr_(d.notes, 400);
  rateLimit_('ord_' + phone, 10, 3600);

  var result = withLock_(function () {
    MEMO = {};  S = settingsMap_();
    var orders = rows_('Orders');
    var fp = phone + '|' + items.map(function (i) { return i.productId + ':' + i.grams; }).sort().join(',');
    var nowMs = Date.now();
    var dup = orders.filter(function (o) {
      if (String(o.RequestID) === reqId) return true;
      var t = parseIST_(o.CreatedAt);
      return String(o.Fingerprint) === fp && String(o.OrderStatus) !== 'CANCELLED' && t && nowMs - t.getTime() < 180000;
    })[0];
    if (dup) return orderSummary_(dup, true);

    assertCanOrder_(computeStatus_(), reqAt, S);

    var prodRows = rows_('Products'), byId = {};
    prodRows.forEach(function (p) { byId[p.ProductID] = p; });
    var backorder = isTrue_(S.AllowBackorders), lines = [], subP = 0, kg = 0;
    items.forEach(function (it) {
      var p = byId[it.productId];
      if (!p || isTrue_(p.IsArchived) || !isTrue_(p.IsAvailable)) fail_('UNAVAILABLE', 'Sorry, an item in your cart is no longer available. Please review your cart.');
      var min = num_(p.MinimumQuantityGrams) || 250;
      if (it.grams < min) fail_('VALIDATION', p.Name + ': minimum order is ' + min + ' g.');
      if (isTrue_(p.TrackStock) && !backorder && num_(p.StockGrams) < it.grams) fail_('UNAVAILABLE', p.Name + ' has only ' + (num_(p.StockGrams) / 1000) + ' kg left.');
      var priceP = paise_(p.PricePerKg); if (priceP <= 0) fail_('UNAVAILABLE', p.Name + ' price is not set yet.');
      var lineP = Math.round(priceP * it.grams / 1000);
      subP += lineP; kg += it.grams;
      lines.push({ p: p, it: it, priceP: priceP, lineP: lineP });
    });
    if (subP < paise_(S.MinimumOrderAmount)) fail_('MIN_ORDER', 'Minimum order amount is ₹' + num_(S.MinimumOrderAmount) + '.');
    var disc = findDiscount_(d.discountCode, subP), discP = disc ? disc.amountP : 0;
    var delP = 0;
    if (ful === 'DELIVERY') {
      delP = paise_(S.DefaultDeliveryCharge);
      var free = paise_(S.FreeDeliveryAbove); if (free > 0 && subP - discP >= free) delP = 0;
    }
    var totalP = subP - discP + delP;

    var now = stamp_(), ymd = nowParts_().date;
    var orderId = 'NC-' + ymd.slice(2).replace(/-/g, '') + '-' + ('00' + nextSeq_(ymd)).slice(-3);
    // customer upsert
    var cust = rows_('Customers').filter(function (c) { return String(c.Phone) === phone; })[0], custId;
    if (cust) { custId = cust.CustomerID; update_('Customers', cust._row, { Name: name, WhatsApp: wa || cust.WhatsApp, TotalOrders: num_(cust.TotalOrders) + 1, LastOrderAt: now }); }
    else { custId = uid_('CU'); append_('Customers', { CustomerID: custId, Name: name, Phone: phone, WhatsApp: wa, TotalOrders: 1, CreatedAt: now, LastOrderAt: now }); }

    append_('Orders', { OrderID: orderId, RequestID: reqId, Fingerprint: fp, CustomerID: custId, CustomerName: name, Phone: phone, OrderDate: now, OrderType: 'RETAIL', FulfilmentType: ful, DeliveryAddress: address, Landmark: landmark, RequestedDateTime: stamp_(reqAt), Subtotal: rupees_(subP), Discount: rupees_(discP), DiscountCode: disc ? disc.code : '', DeliveryCharge: rupees_(delP), TotalAmount: rupees_(totalP), PaymentMethod: pm, PaymentStatus: 'UNPAID', OrderStatus: 'RECEIVED', AssignedTo: '', Notes: notes, InternalNotes: '', CancelReason: '', EnquiryID: '', CreatedAt: now, UpdatedAt: now });
    appendMany_('OrderItems', lines.map(function (l) {
      return { OrderItemID: uid_('OI'), OrderID: orderId, ProductID: l.p.ProductID, ProductNameSnapshot: l.p.Name, CategoryIDSnapshot: l.p.CategoryID, QuantityGrams: l.it.grams, PricePerKgSnapshot: rupees_(l.priceP), CostPerKgSnapshot: l.p.CostPerKg === '' ? '' : num_(l.p.CostPerKg), LineTotal: rupees_(l.lineP), CuttingInstructions: l.it.cuts.join('; ') };
    }));
    appendMany_('OrderStatusHistory', [{ HistoryID: uid_('H'), OrderID: orderId, Status: 'RECEIVED', Note: 'Order placed by customer', ChangedBy: 'customer', CreatedAt: now }]);
    var tx = [];
    lines.forEach(function (l) {
      if (isTrue_(l.p.TrackStock)) {
        update_('Products', l.p._row, { StockGrams: num_(l.p.StockGrams) - l.it.grams, UpdatedAt: now });
        tx.push({ TransactionID: uid_('T'), ProductID: l.p.ProductID, TransactionType: 'SALE', QuantityGrams: -l.it.grams, UnitCost: '', ReferenceID: orderId, Notes: '', CreatedAt: now, CreatedBy: 'system' });
      }
    });
    appendMany_('InventoryTransactions', tx);
    invalidate_();
    return { orderId: orderId, subtotal: rupees_(subP), discount: rupees_(discP), deliveryCharge: rupees_(delP), total: rupees_(totalP), fulfilment: ful, paymentMethod: pm, requestedAt: stamp_(reqAt), status: 'RECEIVED', totalKg: kg / 1000,
      items: lines.map(function (l) { return { name: l.p.Name, grams: l.it.grams, pricePerKg: rupees_(l.priceP), line: rupees_(l.lineP), cut: l.it.cuts.join('; ') }; }) };
  });
  return result;
}

function trackOrder_(d) {
  var id = cleanStr_(d.orderId, 30).toUpperCase(), phone = normPhone_(d.phone);
  if (!id || !phone) fail_('VALIDATION', 'Enter your order ID and the mobile number used for the order.');
  rateLimit_('trk_' + phone, 20, 900);
  var o = rows_('Orders').filter(function (r) { return String(r.OrderID).toUpperCase() === id && String(r.Phone) === phone; })[0];
  if (!o) fail_('NOT_FOUND', 'No order found with those details.');
  return {
    orderId: o.OrderID, status: o.OrderStatus, fulfilment: o.FulfilmentType, requestedAt: o.RequestedDateTime, total: num_(o.TotalAmount),
    paymentMethod: o.PaymentMethod, paymentStatus: o.PaymentStatus, placedAt: o.OrderDate, cancelReason: o.OrderStatus === 'CANCELLED' ? o.CancelReason : '',
    items: rows_('OrderItems').filter(function (i) { return i.OrderID === o.OrderID; }).map(function (i) { return { name: i.ProductNameSnapshot, grams: num_(i.QuantityGrams), line: num_(i.LineTotal) }; }),
    history: rows_('OrderStatusHistory').filter(function (h) { return h.OrderID === o.OrderID; }).map(function (h) { return { status: h.Status, at: h.CreatedAt }; })
  };
}

function createEnquiry_(d) {
  if (d.website) return { enquiryId: 'EN-OK', ignored: true };
  var S = settingsMap_();
  var name = cleanStr_(d.customerName, 100), phone = normPhone_(d.phone), wa = d.whatsapp ? normPhone_(d.whatsapp) : '';
  if (name.length < 2) fail_('VALIDATION', 'Please enter your name or organisation.');
  if (!phone) fail_('VALIDATION', 'Enter a valid 10-digit mobile number.');
  var date = cleanStr_(d.eventDate, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date < nowParts_().date) fail_('VALIDATION', 'Choose a valid event date (today or later).');
  var qty = num_(d.quantityKg); if (!(qty > 0) || qty > 5000) fail_('VALIDATION', 'Enter the required chicken quantity in kg.');
  var loc = cleanStr_(d.eventLocation, 300); if (loc.length < 3) fail_('VALIDATION', 'Enter the event location.');
  var reqId = cleanStr_(d.requestId, 64); if (!/^[A-Za-z0-9_-]{8,64}$/.test(reqId)) fail_('VALIDATION', 'Invalid request. Please reload the page.');
  if (!isTrue_(S.AcceptBulkWhenClosed) && computeStatus_().state !== 'OPEN') fail_('SHOP_CLOSED', 'Enquiries are paused while the shop is closed.');
  rateLimit_('enq_' + phone, 5, 3600);
  return withLock_(function () {
    var ex = rows_('EventEnquiries').filter(function (r) { return String(r.Notes).indexOf('[req:' + reqId + ']') === 0; })[0];
    if (ex) return { enquiryId: ex.EnquiryID, duplicate: true };
    var ymd = nowParts_().date, id = 'EN-' + ymd.slice(2).replace(/-/g, '') + '-' + ('00' + nextSeq_('EN' + ymd)).slice(-3), now = stamp_();
    append_('EventEnquiries', { EnquiryID: id, CustomerName: name, Organization: cleanStr_(d.organization, 100), Phone: phone, WhatsApp: wa, EventDate: date, DeliveryTime: normTime_(d.deliveryTime), EventLocation: loc, GuestCount: Math.max(0, Math.floor(num_(d.guestCount))), RequestedQuantityKg: qty, ProductRequirements: cleanStr_((d.products || []).join ? d.products.join(', ') : d.products, 200), Instructions: cleanStr_(d.instructions, 500), SupplyType: String(d.supplyType) === 'RECURRING' ? 'RECURRING' : 'ONE_TIME', FulfilmentType: String(d.fulfilment).toUpperCase() === 'PICKUP' ? 'PICKUP' : 'DELIVERY', BudgetNote: cleanStr_(d.budgetNote, 200), QuotedAmount: '', Status: 'New Enquiry', Notes: '[req:' + reqId + ']', FollowUpDate: '', ConvertedOrderID: '', CreatedAt: now, UpdatedAt: now });
    return { enquiryId: id };
  });
}

/** Authoritative price preview used by the cart page. Never writes anything. */
function quote_(d) {
  var S = settingsMap_(), items = validateItems_(d.items), byId = {};
  rows_('Products').forEach(function (p) { byId[p.ProductID] = p; });
  var subP = 0, lines = [], problems = [];
  items.forEach(function (it) {
    var p = byId[it.productId];
    if (!p || isTrue_(p.IsArchived) || !isTrue_(p.IsAvailable)) { problems.push({ productId: it.productId, message: 'No longer available' }); return; }
    var min = num_(p.MinimumQuantityGrams) || 250;
    if (it.grams < min) problems.push({ productId: it.productId, message: 'Minimum ' + min + ' g' });
    if (isTrue_(p.TrackStock) && !isTrue_(S.AllowBackorders) && num_(p.StockGrams) < it.grams) problems.push({ productId: it.productId, message: 'Only ' + (num_(p.StockGrams) / 1000) + ' kg left' });
    var priceP = paise_(p.PricePerKg), lineP = Math.round(priceP * it.grams / 1000);
    subP += lineP; lines.push({ productId: p.ProductID, name: p.Name, grams: it.grams, pricePerKg: rupees_(priceP), line: rupees_(lineP) });
  });
  var disc = null, discountError = '';
  try { disc = findDiscount_(d.discountCode, subP); } catch (e) { if (e && e.apiError) discountError = e.message; else throw e; }
  var discP = disc ? disc.amountP : 0, delP = 0, ful = String(d.fulfilment || '').toUpperCase();
  if (ful === 'DELIVERY') { delP = paise_(S.DefaultDeliveryCharge); var free = paise_(S.FreeDeliveryAbove); if (free > 0 && subP - discP >= free) delP = 0; }
  var minP = paise_(S.MinimumOrderAmount);
  return { lines: lines, subtotal: rupees_(subP), discount: rupees_(discP), discountCode: disc ? disc.code : '', discountError: discountError, deliveryCharge: rupees_(delP), total: rupees_(subP - discP + delP), minOrderAmount: rupees_(minP), belowMinimum: subP < minP, problems: problems };
}

/** Full customer-facing summary of a stored order (used for duplicate submissions). */
function orderSummary_(o, duplicate) {
  var its = rows_('OrderItems').filter(function (i) { return i.OrderID === o.OrderID; }), kg = 0;
  its.forEach(function (i) { kg += num_(i.QuantityGrams); });
  return { duplicate: !!duplicate, orderId: o.OrderID, subtotal: num_(o.Subtotal), discount: num_(o.Discount), deliveryCharge: num_(o.DeliveryCharge), total: num_(o.TotalAmount), fulfilment: o.FulfilmentType, paymentMethod: o.PaymentMethod, requestedAt: o.RequestedDateTime, status: o.OrderStatus, totalKg: kg / 1000,
    items: its.map(function (i) { return { name: i.ProductNameSnapshot, grams: num_(i.QuantityGrams), pricePerKg: num_(i.PricePerKgSnapshot), line: num_(i.LineTotal), cut: i.CuttingInstructions }; }) };
}
