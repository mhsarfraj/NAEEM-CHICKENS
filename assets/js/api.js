/* API client: POST text/plain JSON (no CORS preflight) to the Apps Script web app. */
(function () {
  const NC = (window.NC = window.NC || {});
  const cfg = window.NC_CONFIG;
  NC.configured = () => cfg.API_URL && /^https:\/\/script\.google(usercontent)?\.com\//.test(cfg.API_URL);
  const friendly = {
    NETWORK: 'Could not reach the server. Check your internet connection and try again.',
    TIMEOUT: 'The server is taking too long to respond. Please try again.',
    NOT_CONFIGURED: 'The website is not connected to its backend yet.'
  };
  function mkErr(code, message) { const e = new Error(message || friendly[code] || 'Something went wrong.'); e.code = code; return e; }
  async function request(url, init, timeout) {
    const ctrl = new AbortController(), t = setTimeout(() => ctrl.abort(), timeout || 30000);
    try {
      const res = await fetch(url, Object.assign({ signal: ctrl.signal, redirect: 'follow' }, init));
      let json; try { json = await res.json(); } catch (e) { throw mkErr('BAD_RESPONSE', 'The server sent an unexpected response.'); }
      if (!json.ok) throw mkErr(json.error.code, json.error.message);
      return json.data;
    } catch (e) {
      if (e.code) throw e;
      throw mkErr(e.name === 'AbortError' ? 'TIMEOUT' : 'NETWORK');
    } finally { clearTimeout(t); }
  }
  /** POST action. opts.retries only for idempotent reads. */
  NC.api = async function (action, data, opts) {
    opts = opts || {};
    if (!NC.configured()) throw mkErr('NOT_CONFIGURED');
    const body = JSON.stringify(Object.assign({ action }, data || {}));
    let last;
    for (let i = 0; i <= (opts.retries || 0); i++) {
      try { return await request(cfg.API_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body }, opts.timeout); }
      catch (e) { last = e; if (!['NETWORK', 'TIMEOUT', 'QUOTA', 'BUSY'].includes(e.code)) throw e; await new Promise(r => setTimeout(r, 800 * (i + 1))); }
    }
    throw last;
  };
  NC.apiGet = async function (action) {
    if (!NC.configured()) throw mkErr('NOT_CONFIGURED');
    let last;
    for (let i = 0; i < 2; i++) {
      try { return await request(cfg.API_URL + '?action=' + encodeURIComponent(action) + '&_=' + Date.now(), { method: 'GET' }); }
      catch (e) { last = e; if (!['NETWORK', 'TIMEOUT'].includes(e.code)) throw e; }
    }
    throw last;
  };
})();
