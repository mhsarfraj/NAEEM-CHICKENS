// Local test server: serves the static site AND exposes the mock Apps Script backend at /exec.
const http = require('http'), fs = require('fs'), path = require('path');
const M = require('./mock-gas'); const { ctx } = M;
const root = path.join(__dirname, '..');
M.run('setupDatabase()'); M.props.INIT_OWNER_USER = 'owner'; M.props.INIT_OWNER_PASS = 'Correct-Horse-9'; M.run('initOwnerAccount()');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json', '.txt': 'text/plain' };
http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  if (u.pathname === '/exec') {
    const cors = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };
    if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end(); }
    if (req.method === 'GET') { res.writeHead(200, cors); return res.end(ctx.doGet({ parameter: Object.fromEntries(u.searchParams) }).s); }
    let b = ''; req.on('data', c => b += c); req.on('end', () => { setTimeout(() => { res.writeHead(200, cors); res.end(ctx.doPost({ postData: { contents: b } }).s); }, 120); }); return;
  }
  if (u.pathname === '/__admin_clock') { M.setClock(Number(u.searchParams.get('ms') || 0)); res.end('ok'); return; }
  let f = path.join(root, u.pathname === '/' ? 'index.html' : u.pathname);
  if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end('nf'); }
  res.writeHead(200, { 'Content-Type': types[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
}).listen(Number(process.env.PORT || 8099), () => console.log('test server up'));
