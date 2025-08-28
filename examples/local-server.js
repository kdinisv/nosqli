const http = require('http');

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost:3005');
  const q = url.searchParams.get('q');
  let body = '';
  req.on('data', c => body += c);
  req.on('end', () => {
    res.setHeader('Content-Type', 'text/plain');
    if (q && q.includes('$ne')) {
      res.statusCode = 500;
      return res.end('MongoError: simulated');
    }
    try {
      const json = body ? JSON.parse(body) : {};
      if (json && typeof json.username === 'object') {
        res.statusCode = 500;
        return res.end('CastError simulated');
      }
    } catch {}
    res.end('ok');
  });
});

server.listen(3005, () => console.log('Local test server on http://localhost:3005'));
