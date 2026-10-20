# NAEEM CHICKENS LABDAHA — Online Shop & Admin Platform

Static website (HTML/CSS/JS) + Google Apps Script web app + Google Sheets database.
No servers, no Python/PHP/Node in production. Hosting: GitHub Pages (or any static host).

```
index.html  products.html  cart.html  checkout.html  track-order.html
bulk-orders.html  contact.html  admin.html  manifest.json  robots.txt
assets/css/   style.css  responsive.css  admin.css
assets/js/    config.js  api.js  app.js  products.js  cart.js  checkout.js  tracking.js  bulk.js
              admin.js  admin-sections.js  reports.js
assets/images/ logo.svg  favicon.svg  icon-180/192/512.png
google-apps-script/  Code.gs  Admin.gs  Reports.gs  Setup.gs  README.md (API reference)
tests/        mock-gas.js  run-tests.js  server.js  e2e_public.py  e2e_admin.py   (development only)
```

> **What YOU must do** (needs your Google account / real business details): steps 1–5 below. Nothing in this
> package contains your phone number, address, prices, UPI ID or map location — enter them in **Admin → Settings**.

---------------------------------------------------------------------------------------------------

## 1. Create the Google Sheet and install the backend (≈10 minutes)

1. Go to <https://sheets.new>, name it **NAEEM CHICKENS DB**.
2. **Extensions → Apps Script**. Delete the sample `Code.gs` content.
3. Create four script files with exactly these names and paste the contents from `google-apps-script/`:
   `Code.gs`, `Admin.gs`, `Reports.gs`, `Setup.gs`. (File order does not matter.)
4. Select function **`setupDatabase`** in the toolbar → **Run**. Approve the permissions
   (Google shows "unverified app" because it is your own script: *Advanced → Go to project*).
   This creates all 16 tabs with headers, validation, 12 categories, **9 DEMO products (prices ₹100 are placeholders)**,
   placeholder opening hours (07:00–21:00), and generates the secret password pepper + session-signing key in *Script Properties*.
5. **Create the first Owner account** (password never lives in code):
   *Project Settings (gear) → Script Properties → Add*: `INIT_OWNER_USER` = your username, `INIT_OWNER_PASS` = a strong
   password (10+ chars). Then run **`initOwnerAccount`**. Both properties are deleted automatically.
6. **Deploy → New deployment → Web app**: *Execute as:* **Me**, *Who has access:* **Anyone**. Copy the `/exec` URL.
   (Every change to the script needs **Deploy → Manage deployments → Edit → New version**.)

### Why "Anyone"?
The browser must be able to call the web app. Security does **not** depend on the URL being secret: the Sheet itself is
private (only you), and every sensitive action requires a signed session token checked server-side (see Security below).

## 2. Connect the website
Edit `assets/js/config.js` → set `API_URL` to your `/exec` URL. That is the only file you edit. It contains no secrets.

## 3. Publish on GitHub Pages
1. Create a GitHub repo, upload all files **except `tests/`** (keep them if you like; they are harmless).
2. *Settings → Pages → Deploy from branch → main / (root)*. Your site is at `https://<user>.github.io/<repo>/`.
3. Open the site, then `…/admin.html` and sign in.

## 4. Configure the business (Admin → Settings / Products / Shop status)
| What | Where |
|---|---|
| Phone, WhatsApp (`91XXXXXXXXXX`), address, Google Maps link / embed URL, delivery area | Settings |
| Real prices, product photos (https image URL), costs (enables profit), minimum quantities | Products |
| UPI ID (enable `PayUPI`), COD / Pay-at-shop, delivery charge, minimum order, prep time | Settings |
| Weekly hours, holiday hours, one-click Open/Closed/Paused | Shop status & hours |
| Turn off the "demo prices" banner | Settings → `DemoMode` = FALSE (after real prices are in) |
| Testimonials | Settings → `Testimonials` (`Name|Text;Name|Text`) — leave blank unless genuine |
| Logo / favicon / home-screen icon | Replace `assets/images/logo.svg`, `favicon.svg`, `icon-*.png` |

**Photos:** this package ships a branded SVG placeholder per product (no broken images) but *no stock photography* —
I can't source licensed photos. Paste your own `https://` image links in Admin → Products (e.g. from Google Photos/Imgur/Cloudinary,
or commit images to `assets/images/` and enter `assets/images/name.jpg`).

## 5. Go-live checklist
- [ ] Apps Script deployed as new version; `API_URL` set; site loads without a "PREVIEW MODE" banner
- [ ] Owner can sign in; **change the password** (header → Password); create Staff users
- [ ] Phone, WhatsApp, address, Maps link, hours entered; real prices entered; `DemoMode` = FALSE
- [ ] Place a real test order (pickup AND delivery) from a phone, track it, move it through every status, record a payment, print the invoice, cancel a second test order
- [ ] Submit a test event enquiry → quote → Confirmed → convert to order
- [ ] Close the shop from admin; confirm the public badge/checkout update (≤30 s)
- [ ] If you enabled UPI: confirm the UPI ID is yours, and remember payments are only "paid" after you record them
- [ ] Share the Google Sheet **only** with people who must see customer data
- [ ] Delete test orders from the Orders/OrderItems/Customers sheets (select rows → delete) and keep a backup copy of the Sheet (File → Make a copy)

---------------------------------------------------------------------------------------------------

## Architecture & data model
Browser → `fetch(POST text/plain JSON)` → Apps Script `doPost` → Google Sheets. Using `text/plain` avoids the CORS preflight that
Apps Script cannot answer; replies are JSON `{ok,data}|{ok:false,error:{code,message}}`. Public reads (`catalog`, `status`) also work via GET.

Sheets (stable text IDs, never row numbers): **Settings** (key/value) · **AdminUsers** (salted hash) · **Categories** → **Products**
(CategoryID) · **Customers** (by phone) · **Orders** (CustomerID) → **OrderItems** (OrderID, ProductID, *name & price snapshots*) ·
**OrderStatusHistory** (OrderID) · **EventEnquiries** (ConvertedOrderID → Orders.EnquiryID) · **InventoryTransactions** (ProductID, signed grams) ·
**Suppliers** · **Payments** (OrderID, verified) · **BusinessHours** (Mon–Sun + date overrides) · **ShopStatus** (single row) · **Discounts** · **AuditLogs**.
Money is stored in rupees but **all arithmetic is done in integer paise** server-side (`Math.round(pricePaise × grams / 1000)`), quantities in integer grams.
Orders keep price/name snapshots, so later price changes never rewrite history.

## Security design
- **Passwords**: 1000-round HMAC-SHA256 with per-user salt + a server-only pepper in Script Properties. Never plaintext, never in the frontend. *(Apps Script has no bcrypt/argon2; this is the strongest practical option there — use long passwords.)*
- **Sessions**: HMAC-signed token (user + expiry), 6 h lifetime, server re-checks the user is active and re-reads the role from the sheet on **every** request; logout puts the token on a revocation list. Stored in `sessionStorage` (cleared on tab close), not `localStorage`.
- **Brute force**: 5 failed logins per username (40 global) → 15-minute lock. Public endpoints are rate-limited per phone (orders 10/h, enquiries 5/h, tracking 20/15 min). Honeypot fields on public forms.
- **Authorization**: each action is tagged public / staff / owner in `Code.gs`; staff cannot edit products/prices/settings/users or read audit logs; only owners can refund.
- **Never trusted from the browser**: prices, totals, discounts, stock, shop status, roles. The server recomputes everything and rejects closed-shop/unavailable/out-of-stock orders.
- Validation + size limits (60 KB request), length-capped sanitised strings, safe HTML escaping in the UI, CSV exports neutralise spreadsheet-formula injection.
- **Customer privacy**: public endpoints expose only the catalogue, status, and (with order ID **and** phone) that order's status/items — never address, phone of others, or order lists.
- Audit log entries for logins, price/product/settings/status/inventory/payment/user changes.

## Business rules implemented
Unique order IDs (`NC-yymmdd-###`) · duplicate protection (idempotency `requestId` **and** same phone+items within 3 min) · cancelled orders excluded from revenue/kg ·
collected = verified payments only · profit shown only when costs exist (with coverage %) · minimum order, delivery charge, free-delivery threshold, discount codes ·
shop closed / paused / not-accepting enforced server-side, optional scheduled orders inside opening hours · manual status override **auto-expires** (default 12 h) ·
all times Asia/Kolkata from the server clock · enquiries convert to orders without losing the enquiry · UPI/COD/Pay-at-shop (never collects PINs; payment is "paid" only after staff record it).

## Known limitations (please read)
1. **Google Sheets is not a transactional database.** Writes are serialised with `LockService` (20 s wait) so concurrent orders cannot oversell tracked stock, but there is no rollback: if the script is killed mid-write (quota/timeout) a partial order is possible — the next duplicate check (same `requestId`) returns the stored order. Expect roughly dozens of orders/hour comfortably; a very busy shop should move to a real database.
2. **Quotas**: consumer Google accounts have daily Apps Script limits (e.g. execution time, URL fetch, triggers). The API returns a friendly `QUOTA` error and the site shows Retry.
3. Each request reads whole sheets: fine for thousands of rows; archive old orders yearly (copy the Sheet) to stay fast.
4. **Not real-time**: a static page cannot be pushed updates. Public pages refresh the shop badge every 30 s and when the tab becomes visible; catalogue data is cached up to 60 s server-side (invalidated on admin changes) and the checkout always reloads fresh prices.
5. First request after idle can take 1–3 s (Apps Script cold start); the UI shows skeletons/spinners.
6. Chart.js is loaded from cdnjs in the admin; offline the admin shows tables without charts.
7. No online payment gateway: UPI shows your UPI ID / a pay link and you verify payments manually.
8. Edits made by hand in the Sheet bypass validation/audit — prefer the admin panel. Don't rename headers or tabs.
9. No SMS/email notifications (WhatsApp links only).

## Test results (see TESTING.md)
Backend logic: 106/106 checks · Public site in headless Chromium: 26/26 · Admin panel in headless Chromium: 36/36 —
**against a local mock of Google's services**, not your live Google deployment. See TESTING.md for what still needs your manual check.

## Update: owner profile + public theme refresh
- New **Owner profile** page in the admin panel (owner role only): name, title, quote, bio, photo upload. Shown in "Meet the owner" on the home page.
- Default owner photo: `assets/images/owner.jpg`.
- **Re-deploy the Apps Script** (Deploy > Manage deployments > Edit > New version). New settings rows (OwnerName, OwnerRole, OwnerQuote, OwnerBio, OwnerPhotoURL, OwnerPhotoData, OwnerPhotoVer) are added automatically the first time you open Owner profile; no manual sheet edits needed.
- Public site colours/contrast reworked (hero text was white on a light background).
