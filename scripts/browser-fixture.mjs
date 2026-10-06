import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('../tests/fixtures/login.html', import.meta.url));
const paths = new Set(['/', '/login', '/signup', '/password-change', '/iframe', '/passkey', '/passkey-iframe', '/passkey-email', '/passkey-generic']);
const server = createServer((request, response) => {
  const path = new URL(request.url ?? '/', 'http://127.0.0.1:4174').pathname;
  if (request.method !== 'GET' || !paths.has(path)) {
    response.writeHead(404).end('Not found');
    return;
  }
  response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
  response.end(html);
});
server.listen(4174, '127.0.0.1', () => {
  console.log('Dummy login fixtures: http://127.0.0.1:4174');
});
