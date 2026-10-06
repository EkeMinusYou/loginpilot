import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';

const fixture = await readFile(new URL('./login.html', import.meta.url));
for (const port of [4175, 4176]) {
  createServer((_request, response) => {
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    response.end(fixture);
  }).listen(port, '127.0.0.1');
}
