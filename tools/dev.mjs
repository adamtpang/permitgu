// Local dev server: static files + /api/ask, mirroring Vercel (cleanUrls).
// Usage: KEY_ENV_FILE=<env file with OPENROUTER_API_KEY> node tools/dev.mjs [port]
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const ROOT = path.join(REPO, 'public');
const PORT = Number(process.argv[2] || 4322);
if (!process.env.OPENROUTER_API_KEY && process.env.KEY_ENV_FILE) {
  const line = fs.readFileSync(process.env.KEY_ENV_FILE, 'utf8').split(/\r?\n/).find((l) => l.startsWith('OPENROUTER_API_KEY='));
  if (line) process.env.OPENROUTER_API_KEY = line.split('=').slice(1).join('=').trim().replace(/^["']|["']$/g, '');
}
const { POST } = await import('../api/ask.mjs');
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.mjs': 'text/javascript', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json', '.md': 'text/markdown', '.jpg': 'image/jpeg' };

http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  if (url.pathname === '/api/ask' && req.method === 'POST') {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const r = await POST(new Request(url, { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': req.socket.remoteAddress }, body: Buffer.concat(chunks) }));
    res.writeHead(r.status, Object.fromEntries(r.headers));
    if (r.body) for await (const c of r.body) res.write(c);
    return res.end();
  }
  let p = url.pathname === '/' ? '/index.html' : url.pathname;
  if (!path.extname(p)) p += '.html';
  const f = path.join(ROOT, p);
  const relative = path.relative(ROOT, f);
  const publicExtensions = new Set(['.html', '.css', '.js', '.png', '.svg', '.jpg']);
  if (relative.startsWith('..') || path.isAbsolute(relative) || relative.split(path.sep).some((part) => part.startsWith('.')) || relative.startsWith('api' + path.sep) || !publicExtensions.has(path.extname(f)) || !fs.existsSync(f) || !fs.statSync(f).isFile()) { res.writeHead(404); return res.end('not found'); }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
}).listen(PORT, '127.0.0.1', () => console.log(`dev on http://127.0.0.1:${PORT} (key ${process.env.OPENROUTER_API_KEY ? 'loaded' : 'missing'})`));
