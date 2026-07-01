// Simple in-memory relay server — scorer POSTs state, viewers GET it
const http = require('http');

const store = {};

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  // URL format: /state/:matchId
  const matchId = req.url.replace('/state/', '').split('?')[0];
  if (!matchId || matchId === '/') { res.writeHead(404); res.end(); return; }

  if (req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(store[matchId] ? JSON.stringify(store[matchId]) : 'null');
    return;
  }

  if (req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try { store[matchId] = JSON.parse(body); } catch {}
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end('{"ok":true}');
    });
    return;
  }

  res.writeHead(405); res.end();
});

server.listen(5180, '0.0.0.0', () => {
  console.log('Relay server running on :5180');
});
