/**
 * NAEEM CHICKENS LABDAHA — Setup.gs
 * Run setupDatabase() ONCE from the Apps Script editor, then initOwnerAccount().
 * Safe to re-run: existing sheets/data are never overwritten.
 */
var SCHEMA = {
  Settings: ['Key','Value','Description'],
  AdminUsers: ['Username','DisplayName','Role','Salt','PasswordHash','IsActive','CreatedAt','LastLoginAt'],
  Categories: ['CategoryID','Name','SortOrder','IsVisible','IsArchived'],
  Products: ['ProductID','Name','CategoryID','Description','ImageURL','PricePerKg','CostPerKg','MinimumQuantityGrams','StockGrams','LowStockThresholdGrams','TrackStock','IsAvailable','IsFeatured','IsArchived','SortOrder','CuttingOptions','IsDemo','CreatedAt','UpdatedAt'],
  Customers: ['CustomerID','Name','Phone','WhatsApp','TotalOrders','CreatedAt','LastOrderAt'],
  Orders: ['OrderID','RequestID','Fingerprint','CustomerID','CustomerName','Phone','OrderDate','OrderType','FulfilmentType','DeliveryAddress','Landmark','RequestedDateTime','Subtotal','Discount','DiscountCode','DeliveryCharge','TotalAmount','PaymentMethod','PaymentStatus','OrderStatus','AssignedTo','Notes','InternalNotes','CancelReason','EnquiryID','CreatedAt','UpdatedAt'],
  OrderItems: ['OrderItemID','OrderID','ProductID','ProductNameSnapshot','CategoryIDSnapshot','QuantityGrams','PricePerKgSnapshot','CostPerKgSnapshot','LineTotal','CuttingInstructions'],
  OrderStatusHistory: ['HistoryID','OrderID','Status','Note','ChangedBy','CreatedAt'],
  EventEnquiries: ['EnquiryID','CustomerName','Organization','Phone','WhatsApp','EventDate','DeliveryTime','EventLocation','GuestCount','RequestedQuantityKg','ProductRequirements','Instructions','SupplyType','FulfilmentType','BudgetNote','QuotedAmount','Status','Notes','FollowUpDate','ConvertedOrderID','CreatedAt','UpdatedAt'],
  InventoryTransactions: ['TransactionID','ProductID','TransactionType','QuantityGrams','UnitCost','ReferenceID','Notes','CreatedAt','CreatedBy'],
  Suppliers: ['SupplierID','Name','Phone','Notes','IsActive'],
  Payments: ['PaymentID','OrderID','Amount','Method','Reference','Verified','RecordedBy','CreatedAt'],
  BusinessHours: ['Day','OpenTime','CloseTime','IsClosed','Note'],
  ShopStatus: ['StatusID','ManualStatus','IsAcceptingOrders','StatusMessage','ExpectedReopeningTime','ManualOverrideExpiry','UpdatedAt'],
  Discounts: ['DiscountID','Code','Type','Value','MinOrderAmount','IsActive','ExpiresAt'],
  AuditLogs: ['LogID','Timestamp','User','Action','Entity','EntityID','Details']
};

// Columns forced to plain text so Sheets never converts phones/dates/times.
var TEXT_COLUMNS = ['Value','Phone','WhatsApp','CreatedAt','UpdatedAt','OrderDate','RequestedDateTime','EventDate','DeliveryTime','FollowUpDate','OpenTime','CloseTime','Day','ExpectedReopeningTime','ManualOverrideExpiry','ExpiresAt','Timestamp','LastLoginAt','LastOrderAt','Salt','PasswordHash','Fingerprint','RequestID','Details','Code'];

var DEFAULT_SETTINGS = [
  ['BusinessName','NAEEM CHICKENS LABDAHA','Display name'],
  ['Locality','Labdaha, Uttar Pradesh, India',''],
  ['Phone','','Public call number (10 digits). Leave blank until configured.'],
  ['WhatsAppNumber','','WhatsApp number with country code, e.g. 91XXXXXXXXXX'],
  ['Address','','Full shop address (enter exact address here)'],
  ['GoogleMapsURL','','Paste the Google Maps share link of the shop'],
  ['MapsEmbedURL','','Optional: Google Maps EMBED url (Share > Embed a map > copy the src URL)'],
  ['Currency','INR',''],
  ['TimeZone','Asia/Kolkata','Fixed - do not change'],
  ['UPIID','','Owner UPI ID (e.g. name@bank). Leave blank to disable UPI.'],
  ['UPIPayeeName','NAEEM CHICKENS LABDAHA',''],
  ['PayCOD','TRUE','Offer Cash on Delivery (TRUE/FALSE)'],
  ['PayShop','TRUE','Offer Pay at Shop (TRUE/FALSE)'],
  ['PayUPI','FALSE','Offer UPI (needs UPIID). Payment is only marked paid after staff verify it.'],
  ['DeliveryEnabled','TRUE','Offer home delivery'],
  ['DeliveryArea','Labdaha and nearby areas (edit)','Shown on site'],
  ['MinimumOrderAmount','0','Minimum subtotal in rupees (0 = none)'],
  ['DefaultDeliveryCharge','0','Delivery charge in rupees'],
  ['FreeDeliveryAbove','0','Free delivery when subtotal after discount >= this (0 = disabled)'],
  ['PrepMinutes','45','Minimum advance preparation time in minutes'],
  ['AllowScheduledOrders','TRUE','Allow orders for a later time while shop is closed'],
  ['AllowBackorders','FALSE','Allow ordering beyond tracked stock'],
  ['AcceptBulkWhenClosed','TRUE','Bulk enquiries accepted even when shop is closed'],
  ['ManualOverrideDefaultHours','12','Default expiry (hours) for manual open/close overrides'],
  ['LogoURL','assets/images/logo.svg',''],
  ['WebsiteAnnouncement','','Optional banner text on every page'],
  ['DemoMode','TRUE','TRUE shows a "demo prices" notice. Set FALSE after entering real prices.'],
  ['Testimonials','','Leave blank until you have genuine testimonials. Format: Name|Text;Name|Text'],
  ['OwnerName','','Owner name shown on the website (edit in Owner profile)'],
  ['OwnerRole','Owner','Title shown under the name'],
  ['OwnerQuote','','Short line shown beside the photo'],
  ['OwnerBio','','About the owner, shown on the home page'],
  ['OwnerPhotoURL','assets/images/owner.jpg','Photo file path or https link'],
  ['OwnerPhotoData','','Uploaded photo (managed from Owner profile)'],
  ['OwnerPhotoVer','','Auto-managed - do not edit']
];

function setupDatabase() {
  var ss = ss_();
  Object.keys(SCHEMA).forEach(function (name) {
    var sh = ss.getSheetByName(name) || ss.insertSheet(name);
    var headers = SCHEMA[name];
    if (sh.getLastRow() === 0) {
      sh.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold').setBackground('#1f2a24').setFontColor('#ffffff');
      sh.setFrozenRows(1);
    }
    headers.forEach(function (h, i) {
      if (TEXT_COLUMNS.indexOf(h) >= 0) sh.getRange(2, i + 1, Math.max(sh.getMaxRows() - 1, 1), 1).setNumberFormat('@');
    });
  });
  var del = ss.getSheetByName('Sheet1');
  if (del && ss.getSheets().length > 1 && del.getLastRow() === 0) ss.deleteSheet(del);

  var P = PropertiesService.getScriptProperties();
  if (!P.getProperty('PEPPER')) P.setProperty('PEPPER', randomSecret_());
  if (!P.getProperty('TOKEN_SECRET')) P.setProperty('TOKEN_SECRET', randomSecret_());
  if (!P.getProperty('SHEET_ID')) P.setProperty('SHEET_ID', ss.getId());

  seedIfEmpty_('Settings', DEFAULT_SETTINGS.map(function (r) { return { Key: r[0], Value: r[1], Description: r[2] }; }));
  var days = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
  seedIfEmpty_('BusinessHours', days.map(function (d) { return { Day: d, OpenTime: '07:00', CloseTime: '21:00', IsClosed: false, Note: 'PLACEHOLDER hours - edit in admin' }; }));
  seedIfEmpty_('ShopStatus', [{ StatusID: 'MAIN', ManualStatus: 'AUTO', IsAcceptingOrders: true, StatusMessage: '', ExpectedReopeningTime: '', ManualOverrideExpiry: '', UpdatedAt: stamp_() }]);

  var cats = ['Fresh Whole Chicken','Skinless Chicken','Curry Cut Chicken','Boneless Chicken','Chicken Breast','Chicken Leg Pieces','Chicken Wings','Chicken Liver & Organs','Chicken Keema (Minced)','Custom Chicken Cuts','Bulk Chicken for Events','Restaurant & Catering Supply'];
  seedIfEmpty_('Categories', cats.map(function (n, i) { return { CategoryID: 'C' + (i + 1), Name: n, SortOrder: (i + 1) * 10, IsVisible: true, IsArchived: false }; }));

  // DEMO products: prices are PLACEHOLDERS, not real business prices.
  var demo = [
    ['Fresh Whole Chicken (DEMO)','C1',1000,true,'With skin, cleaned. DEMO DATA - set real price.'],
    ['Skinless Chicken (DEMO)','C2',500,true,'Skin removed, cleaned. DEMO DATA.'],
    ['Curry Cut Chicken (DEMO)','C3',500,true,'Cut into curry pieces. DEMO DATA.'],
    ['Boneless Chicken (DEMO)','C4',500,false,'Boneless cubes. DEMO DATA.'],
    ['Chicken Breast (DEMO)','C5',500,false,'Lean breast pieces. DEMO DATA.'],
    ['Chicken Leg Pieces (DEMO)','C6',500,false,'Leg pieces. DEMO DATA.'],
    ['Chicken Wings (DEMO)','C7',500,false,'Fresh wings. DEMO DATA.'],
    ['Chicken Liver (DEMO)','C8',250,false,'Fresh liver. DEMO DATA.'],
    ['Chicken Keema (DEMO)','C9',250,true,'Freshly minced to order. DEMO DATA.']
  ];
  seedIfEmpty_('Products', demo.map(function (d, i) {
    return { ProductID: 'P' + (i + 1), Name: d[0], CategoryID: d[1], Description: d[4], ImageURL: '', PricePerKg: 100, CostPerKg: '', MinimumQuantityGrams: d[2], StockGrams: 0, LowStockThresholdGrams: 5000, TrackStock: false, IsAvailable: true, IsFeatured: d[3], IsArchived: false, SortOrder: (i + 1) * 10, CuttingOptions: 'Whole;Curry cut;Small pieces;Boneless;Keema', IsDemo: true, CreatedAt: stamp_(), UpdatedAt: stamp_() };
  }));
  applyValidation_();
  Logger.log('Database ready. Next: set INIT_OWNER_USER / INIT_OWNER_PASS in Script Properties and run initOwnerAccount().');
}

function applyValidation_() {
  var ss = ss_();
  function list(sheet, header, values) {
    var sh = ss.getSheetByName(sheet); var col = SCHEMA[sheet].indexOf(header) + 1;
    var rule = SpreadsheetApp.newDataValidation().requireValueInList(values, true).setAllowInvalid(false).build();
    sh.getRange(2, col, Math.max(sh.getMaxRows() - 1, 1), 1).setDataValidation(rule);
  }
  list('Orders', 'OrderStatus', ['RECEIVED','CONFIRMED','PREPARING','READY_FOR_PICKUP','OUT_FOR_DELIVERY','DELIVERED','CANCELLED']);
  list('Orders', 'PaymentStatus', ['UNPAID','PARTIAL','PAID']);
  list('Orders', 'FulfilmentType', ['PICKUP','DELIVERY']);
  list('Orders', 'OrderType', ['RETAIL','BULK']);
  list('AdminUsers', 'Role', ['OWNER','STAFF']);
  list('ShopStatus', 'ManualStatus', ['AUTO','OPEN','CLOSED','TEMP_CLOSED','PAUSED']);
  list('EventEnquiries', 'Status', ENQUIRY_STATUSES);
  list('Discounts', 'Type', ['PERCENT','FLAT']);
  list('InventoryTransactions', 'TransactionType', ['OPENING','PURCHASE','SALE','CANCEL_RESTORE','WASTAGE','ADJUSTMENT']);
}

/** Creates the first OWNER from Script Properties INIT_OWNER_USER / INIT_OWNER_PASS, then deletes them. */
function initOwnerAccount() {
  var P = PropertiesService.getScriptProperties();
  var u = P.getProperty('INIT_OWNER_USER'), pw = P.getProperty('INIT_OWNER_PASS');
  if (!u || !pw) throw new Error('Set INIT_OWNER_USER and INIT_OWNER_PASS in Project Settings > Script Properties first.');
  if (pw.length < 10) throw new Error('Password must be at least 10 characters.');
  u = u.toLowerCase().trim();
  if (rows_('AdminUsers').some(function (r) { return String(r.Username).toLowerCase() === u; })) throw new Error('User already exists.');
  var salt = randomSecret_().slice(0, 24);
  append_('AdminUsers', { Username: u, DisplayName: 'Owner', Role: 'OWNER', Salt: salt, PasswordHash: hash_(pw, salt), IsActive: true, CreatedAt: stamp_(), LastLoginAt: '' });
  P.deleteProperty('INIT_OWNER_USER'); P.deleteProperty('INIT_OWNER_PASS');
  audit_('system', 'INIT_OWNER', 'AdminUsers', u, 'Owner account created');
  Logger.log('Owner "' + u + '" created. Temporary properties removed.');
}

function seedIfEmpty_(name, objs) {
  var sh = sheet_(name);
  if (sh.getLastRow() > 1) return;
  var h = SCHEMA[name];
  sh.getRange(2, 1, objs.length, h.length).setValues(objs.map(function (o) { return h.map(function (c) { return o[c] === undefined ? '' : o[c]; }); }));
}
function randomSecret_() { return (Utilities.getUuid() + Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, ''); }
