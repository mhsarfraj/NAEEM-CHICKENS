// Mock of Apps Script services + loader for the real .gs files.
const fs = require('fs'), vm = require('vm'), crypto = require('crypto'), path = require('path');
const dir = path.join(__dirname, '..', 'google-apps-script');

/* ---------- Mocks ---------- */
class Range {
  constructor(sh, r, c, nr, nc) { Object.assign(this, { sh, r, c, nr, nc }); }
  getValues() { const o = []; for (let i = 0; i < this.nr; i++) { const row = []; for (let j = 0; j < this.nc; j++) row.push(this.sh.get(this.r + i, this.c + j)); o.push(row); } return o; }
  setValues(v) { for (let i = 0; i < v.length; i++) for (let j = 0; j < v[i].length; j++) this.sh.set(this.r + i, this.c + j, v[i][j]); return this; }
  clearContent() { for (let i = 0; i < this.nr; i++) for (let j = 0; j < this.nc; j++) this.sh.set(this.r + i, this.c + j, ''); return this; }
  setNumberFormat() { return this; } setFontWeight() { return this; } setBackground() { return this; } setFontColor() { return this; } setDataValidation() { return this; }
  getValue() { return this.sh.get(this.r, this.c); }
}
class Sheet {
  constructor(name) { this.name = name; this.d = []; }
  get(r, c) { const v = (this.d[r - 1] || [])[c - 1]; return v === undefined ? '' : v; }
  set(r, c, v) { while (this.d.length < r) this.d.push([]); this.d[r - 1][c - 1] = v; }
  getLastRow() { let n = 0; this.d.forEach((row, i) => { if (row.some(x => x !== '' && x !== undefined)) n = i + 1; }); return n; }
  getLastColumn() { return Math.max(0, ...this.d.map(r => r.length)); }
  getMaxRows() { return 1000; }
  getDataRange() { return new Range(this, 1, 1, this.getLastRow(), this.getLastColumn()); }
  getRange(r, c, nr = 1, nc = 1) { return new Range(this, r, c, nr, nc); }
  setFrozenRows() {}
}
const sheets = {};
const SpreadsheetApp = {
  getActiveSpreadsheet: () => ({
    getSheetByName: n => sheets[n] || null,
    insertSheet: n => (sheets[n] = new Sheet(n)),
    getSheets: () => Object.values(sheets), deleteSheet() {}, getId: () => 'MOCK', getSpreadsheetId: () => 'MOCK'
  }),
  openById() { return SpreadsheetApp.getActiveSpreadsheet(); },
  newDataValidation: () => ({ requireValueInList() { return this; }, setAllowInvalid() { return this; }, build() { return {}; } })
};
const props = {};
const PropertiesService = { getScriptProperties: () => ({ getProperty: k => (k in props ? props[k] : null), setProperty: (k, v) => { props[k] = String(v); }, deleteProperty: k => { delete props[k]; } }) };
const cacheStore = {};
const CacheService = { getScriptCache: () => ({ get: k => cacheStore[k] ?? null, put: (k, v) => { cacheStore[k] = v; }, remove: k => { delete cacheStore[k]; } }) };
const LockService = { getScriptLock: () => ({ tryLock: () => true, releaseLock() {} }) };
let clockOffset = 0; const nowMs = () => Date.now() + clockOffset;
const toBytes = v => (typeof v === 'string' ? Buffer.from(v, 'utf8') : Buffer.from(v.map(x => (x + 256) % 256)));
const sbytes = b => Array.from(b).map(x => (x > 127 ? x - 256 : x));
const fmtIST = (ms, pat) => {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(new Date(ms)).map(x => [x.type, x.value]));
  const dow = new Date(Date.UTC(+p.year, +p.month - 1, +p.day)).getUTCDay() || 7;
  return pat.replace('yyyy', p.year).replace('MM', p.month).replace('dd', p.day).replace('HH', p.hour).replace('mm', p.minute).replace('ss', p.second).replace(/^u$/, String(dow));
};
const Utilities = {
  formatDate: (d, tz, pat) => fmtIST(d.getTime(), pat),
  computeHmacSha256Signature: (v, k) => sbytes(crypto.createHmac('sha256', toBytes(k)).update(toBytes(v)).digest()),
  base64Encode: v => toBytes(v).toString('base64'),
  base64EncodeWebSafe: v => toBytes(v).toString('base64url'),
  base64DecodeWebSafe: s => sbytes(Buffer.from(s, 'base64url')),
  newBlob: bytes => ({ getDataAsString: () => Buffer.from(bytes.map(x => (x + 256) % 256)).toString('utf8') }),
  getUuid: () => crypto.randomUUID(), sleep() {}
};
const ContentService = { createTextOutput: s => ({ s, setMimeType() { return this; }, getContent() { return s; } }), MimeType: { JSON: 'json' } };
const Logger = { log() {} };
// Date.now offset for time travel
const RealDate = Date;
class FakeDate extends RealDate { constructor(...a) { if (a.length) super(...a); else super(nowMs()); } static now() { return nowMs(); } }
const ctx = { SpreadsheetApp, PropertiesService, CacheService, LockService, Utilities, ContentService, Logger, console, Date: FakeDate };
vm.createContext(ctx);
['Setup.gs', 'Code.gs', 'Admin.gs', 'Reports.gs'].forEach(f => vm.runInContext(fs.readFileSync(path.join(dir, f), 'utf8'), ctx, { filename: f }));


module.exports = { ctx, sheets, props, fmtIST, nowMs, setClock: v => { clockOffset = v; }, run: code => vm.runInContext(code, ctx), fmtIST };
