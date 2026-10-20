# Test report

All automated tests ran on 2026-10-17 against **a local Node mock of Apps Script/Sheets** (tests/mock-gas.js), which executes the
real `.gs` files unchanged, plus real headless Chromium for the website. They prove the logic and UI; they do **not** prove behaviour on
your Google account (permissions, quotas, deployment). Re-run: `node tests/run-tests.js`; `node tests/server.js` then
`python3 tests/e2e_public.py` / `e2e_admin.py` (needs Playwright; restart server between suites for a clean DB).

| Suite | Result |
|---|---|
| Backend logic (`run-tests.js`) | 106 / 106 |
| Public site e2e (390 px mobile + 1280 px desktop) | 26 / 26 |
| Admin e2e | 36 / 36 |

Bugs found and fixed by these tests: lazy action table (file-load-order), duplicate-order response lacked order details,
bottom nav covering the mobile checkout button (added sticky checkout bar), `hidden` attribute overridden by `.btn`
(would have shown a "Call" button with no number), error handler replacing the whole admin page.

## Your 23-point checklist
| # | Item | Status |
|---|---|---|
| 1 | Public site loads without console errors | ✅ tested (0 errors) |
| 2 | Logo, favicon, navigation | ✅ logo/favicon/icons render, nav works; **stock photos not included** (placeholder art + your URLs) |
| 3 | Products load from Google Sheets | ⚠ tested against mock Sheets; **verify on your Sheet after deployment** |
| 4 | Admin create/update/archive products | ✅ create/update/toggle tested via UI; archive tested in backend suite |
| 5 | Changes appear on public site | ✅ tested (cache invalidation) |
| 6 | kg/gram calculations | ✅ 1.25 kg @ ₹199.99 = ₹249.99 etc. |
| 7 | Cart totals & discounts | ✅ |
| 8 | Server recalculates totals | ✅ client-sent price/total ignored |
| 9 | No duplicate orders | ✅ same requestId and same phone+items within 3 min |
| 10 | Order confirmation | ✅ ID, summary, WhatsApp text (WhatsApp opens only if number configured) |
| 11 | Unauthorised admin access blocked | ✅ no/tampered/expired/revoked token, staff vs owner |
| 12 | Shop status reflected publicly | ✅ (≤30 s on open pages) |
| 13 | Closed-shop checkout restrictions | ✅ blocked / scheduled-within-hours / paused / not-accepting |
| 14 | Bulk enquiries saved & manageable | ✅ |
| 15 | Order statuses & history | ✅ |
| 16 | Inventory calculations | ✅ closing-stock identity, no oversell, cancel restores |
| 17 | Reports exclude cancelled | ✅ |
| 18 | Revenue vs collected distinguished | ✅ |
| 19 | CSV exports & print | ✅ CSV tested; ⚠ print/invoice pop-up not automated — try once |
| 20 | Desktop / Android-size / tablet | ✅ 390 px & 1280 px screenshots reviewed; ⚠ tablet width (768 px) uses the same responsive rules but wasn't visually reviewed; **test on your real phone** |
| 21 | Invalid input & API failure handling | ✅ inline errors, offline → message + Retry |
| 22 | No secrets/private data in frontend | ✅ `config.js` only holds the public URL |
| 23 | Audit records | ✅ 16 action types verified |

## Still needs YOU (cannot be done from here)
Authorising the script in your Google account · deployment & `API_URL` · real phone/WhatsApp/address/maps/UPI/prices/photos ·
a live end-to-end test on your phone · Chart.js rendering from the CDN (stubbed in tests) · confirming Google quotas suit your volume ·
Google Fonts load (site falls back to system fonts if blocked).
