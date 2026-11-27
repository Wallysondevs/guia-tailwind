// servidor estático mínimo para testar as páginas como elas vão ao ar (http, não file://)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const raiz = process.cwd();
const porta = Number(process.argv[2] || 8788);
const tipos = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8'
};

http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p.endsWith('/')) p += 'index.html';
  const alvo = path.join(raiz, p);
  if (!alvo.startsWith(raiz)) { res.writeHead(403).end('fora'); return; }
  fs.readFile(alvo, (err, dados) => {
    if (err) { res.writeHead(404, {'content-type': 'text/plain; charset=utf-8'}).end('404 ' + p); return; }
    res.writeHead(200, { 'content-type': tipos[path.extname(alvo)] || 'application/octet-stream' });
    res.end(dados);
  });
}).listen(porta, () => console.log('servindo ' + raiz + ' em http://localhost:' + porta));
