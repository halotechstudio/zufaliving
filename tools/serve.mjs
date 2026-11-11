// Minimal static server for local preview: node tools/serve.mjs [port]
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const port = +process.argv[2] || 5173;
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.jpg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml', '.webp': 'image/webp' };

createServer(async (req, res) => {
  try {
    let p = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^([/\\])+/, '');
    if (p.includes('..')) throw 0;
    let f = join(root, p);
    if ((await stat(f).catch(() => null))?.isDirectory()) f = join(f, 'index.html');
    const data = await readFile(f);
    // Mirror the claude.ai artifact host's content-security policy, so anything it would block also fails locally.
    const csp = ["default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' blob: https://cdnjs.cloudflare.com https://cdn.jsdelivr.net/npm/ https://unpkg.com",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com", "img-src 'self' data: blob:", "font-src 'self' data: blob: https://fonts.gstatic.com",
      "media-src 'self' data: blob:", "connect-src 'self' blob: https://fonts.googleapis.com https://fonts.gstatic.com", "worker-src 'self' blob:"].join('; ');
    res.writeHead(200, { 'content-type': types[extname(f)] || 'application/octet-stream', 'cache-control': 'no-cache', 'content-security-policy': csp });
    res.end(data);
  } catch { res.writeHead(404); res.end('Not found'); }
}).listen(port, () => console.log(`ZUFA preview on http://localhost:${port}`));
