const http = require('http');
const fs = require('fs');
const path = require('path');

const ASSETS = path.join(__dirname, '..', 'assets');

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') { res.writeHead(200); res.end(); return; }

  if (req.method === 'POST' && req.url === '/save') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const { filename, base64 } = JSON.parse(body);
        const buf = Buffer.from(base64, 'base64');
        const dest = path.join(ASSETS, filename);
        fs.writeFileSync(dest, buf);
        console.log('Saved', dest, buf.length, 'bytes');
        res.writeHead(200);
        res.end('ok');
      } catch (e) {
        res.writeHead(500);
        res.end(e.message);
      }
    });
    return;
  }

  res.writeHead(404); res.end();
});

server.listen(8100, () => console.log('Save server on :8100'));
