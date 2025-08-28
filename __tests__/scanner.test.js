const http = require('http');
const { Scanner } = require('../src/scanner');

function startTestServer(port = 0) {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, `http://localhost:${port}`);

    // naive behavior: if q contains JSON operator, change length and echo keyword
    const q = url.searchParams.get('q');
    let body = '';

    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      res.setHeader('Content-Type', 'text/plain');
      if (q && q.includes('$ne')) {
        res.statusCode = 500;
        return res.end('MongoError: simulated');
      }
      try {
        const json = body ? JSON.parse(body) : null;
        if (json && (json.username && typeof json.username === 'object' && ('$ne' in json.username))) {
          res.statusCode = 500;
          return res.end('CastError simulated');
        }
      } catch {}
      res.end('ok');
    });
  });
  return new Promise(resolve => server.listen(port, () => resolve(server)));
}

describe('Scanner basic', () => {
  let server, port;

  beforeAll(async () => {
    server = await startTestServer();
    port = server.address().port;
  });

  afterAll(() => server.close());

  test('detects GET anomaly', async () => {
    const scanner = new Scanner({ delayMs: 0, timeoutMs: 2000 });
    const url = `http://localhost:${port}/?q=a`;
    const res = await scanner.scanGet(url, ['q']);
    expect(res.some(r => r.evidence.keywordHits.includes('MongoError'))).toBe(true);
  });

  test('detects Body anomaly', async () => {
    const scanner = new Scanner({ delayMs: 0, timeoutMs: 2000 });
    const url = `http://localhost:${port}/login`;
    const res = await scanner.scanBody(url, 'POST', { username: 'a', password: 'b' }, ['username']);
    expect(res.length).toBeGreaterThan(0);
  });
});
