# Apps Script backend — API reference

Endpoint: your Web App `/exec` URL. **POST** body = JSON string (send header `Content-Type: text/plain;charset=utf-8`).
`{ "action": "...", ...fields, "token": "<session token, staff/owner actions>" }`
Success `{ "ok": true, "data": {...} }` · Error `{ "ok": false, "error": { "code": "...", "message": "..." } }`.
GET works only for `catalog`, `status`, `ping`.

Error codes: `VALIDATION, UNAUTHORIZED, SESSION_EXPIRED, FORBIDDEN, BAD_LOGIN, LOCKED, RATE_LIMIT, SHOP_CLOSED, OUTSIDE_HOURS, UNAVAILABLE, MIN_ORDER, NOT_FOUND, INVALID_TRANSITION, IN_USE, BUSY, QUOTA, TOO_LARGE, BAD_JSON, UNKNOWN_ACTION, SERVER_ERROR`.

Auth levels: **public** · **staff** (Staff or Owner) · **owner**.

## Public
| action | request fields | validation / behaviour | success data |
|---|---|---|---|
| `catalog` | – | cached 60 s; hides archived/hidden; no stock numbers; UPI shown only if enabled | `categories, products, settings(public subset), status` |
| `status` | – | computed live on server time (IST) | `state, label, acceptingOrders, message, expectedReopening, today, nextOpen, week` |
| `quote` | `items[{productId,grams}], discountCode?, fulfilment?` | grams int, multiple of 50, ≤200000; read-only | `lines, subtotal, discount, deliveryCharge, total, belowMinimum, problems[]` |
| `createOrder` | `requestId, customerName, phone, whatsapp?, fulfilment(PICKUP/DELIVERY), address?, landmark?, date, time, paymentMethod(COD/SHOP/UPI), notes?, discountCode?, items[{productId,grams,cut?}], website(honeypot, leave empty)` | 10-digit Indian mobile; address ≥10 chars for delivery; time ≥ now+PrepMinutes, ≤30 days; shop must accept orders (or schedule inside hours); stock/min-qty/availability rechecked; **prices recomputed**; duplicates detected | `orderId, subtotal, discount, deliveryCharge, total, items[], duplicate?` |
| `trackOrder` | `orderId, phone` | both must match; rate-limited | `status, items, history, total, paymentStatus` (no address/phone) |
| `createEnquiry` | `requestId, customerName, organization?, phone, whatsapp?, eventDate, deliveryTime?, eventLocation, guestCount?, quantityKg, products[], instructions?, supplyType, fulfilment, budgetNote?` | date ≥ today; kg 0–5000 | `enquiryId` |
| `login` | `username, password` | lockout after 5 failures | `token, expiresInSec, user` |

## Staff (token required)
`logout` · `me` · `changePassword{oldPassword,newPassword≥10}` · `dashboard{from,to,categoryId?}` · `listOrders{q,status,fulfilment,type,from,to,page,pageSize≤50}` · `getOrder{orderId}` ·
`updateOrderStatus{orderId,status,reason?}` (forward-only; cancel needs reason; cancel restores tracked stock; delivered/cancelled are final) · `updateOrder{orderId,internalNote?,assignedTo?}` ·
`recordPayment{orderId,amount,method(CASH/UPI/CARD/OTHER),reference?}` (no overpayment; sets PaymentStatus) · `listEnquiries{status?}` · `updateEnquiry{enquiryId,status?,quotedAmount?,followUpDate?,notes?}` ·
`convertEnquiry{enquiryId}` (must be *Confirmed* with a quote) · `setShopStatus{manualStatus(AUTO/OPEN/CLOSED/TEMP_CLOSED/PAUSED),acceptingOrders,message,expectedReopening?,overrideHours(0=until changed)}` ·
`listProducts` · `listCategories` · `toggleProduct{productId,isAvailable}` · `listInventory{from,to}` · `addInventory{productId,type(PURCHASE/OPENING/WASTAGE/ADJUSTMENT),quantityKg,unitCost?,supplierId?,notes?}` (never negative unless backorders on) ·
`report{type,from,to}` (`sales_daily, product_sales, retail_vs_bulk, orders, payments, inventory, enquiries`; range ≤ 1 year) · `listSuppliers`.

## Owner only
`saveProduct{productId?,name,categoryId,pricePerKg,costPerKg?,minGrams,lowStockGrams,imageUrl,description,cuts,isAvailable,isFeatured,trackStock}` · `archiveProduct` · `saveCategory` · `archiveCategory` ·
`reorder{entity:products|categories,ids[]}` · `getSettings` · `saveSettings{values{Key:Value}}` (validated per key) · `getHours` · `saveHours{rows[{day,open,close,isClosed,note}]}` ·
`listDiscounts` · `saveDiscount{code,type,value,minOrderAmount,expiresAt,isActive}` · `saveSupplier` · `listUsers` · `saveUser{username,name,role,password?,isActive}` (≥1 active owner enforced) · `listAudit{q?}`.

## Definitions used by dashboard & reports
Booked revenue = TotalAmount of non-cancelled orders · Completed sales = delivered orders · Collected = verified payments · Pending = booked − collected ·
Product revenue = Σ LineTotal · Est. gross profit = LineTotal − cost snapshot (only costed items). Cancelled orders are excluded everywhere; converted enquiries count once as orders.
