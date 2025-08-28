import http from "http";
import { Scanner } from "../src/scanner.ts";

function startTestServer(port = 0) {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url || "/", `http://localhost:${port}`);
    const q = url.searchParams.get("q");
    let body = "";

    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", () => {
      // First: anomaly on query for GET scanning
      if (q && q.includes("$ne")) {
        res.statusCode = 500;
        return res.end("MongoError: simulated");
      }
      // Then: serve simple HTML at root for crawler discovery
      if (url.pathname === "/") {
        res.setHeader("Content-Type", "text/html");
        // Simulate CouchDB-like headers
        res.setHeader("Server", "CouchDB/3.3.2");
        res.setHeader("X-CouchDB", "Welcome");
        res.setHeader("X-CouchDB-Version", "3.3.2");
        const html = `<!doctype html>
          <html><head><title>test</title></head>
          <body>
            <a href="/?q=a">L</a>
            <form action="/login" method="post">
              <input type="text" name="username" value="a" />
              <button type="submit">Go</button>
            </form>
          </body></html>`;
        return res.end(html);
      }
      if (url.pathname === "/es") {
        res.setHeader("Content-Type", "application/json");
        res.setHeader("X-Elastic-Product", "Elasticsearch");
        return res.end(JSON.stringify({ version: { number: "8.15.0" } }));
      }
      res.setHeader("Content-Type", "text/plain");
      try {
        const json = body ? JSON.parse(body) : null;
        if (
          json &&
          (json as any).username &&
          typeof (json as any).username === "object" &&
          "$ne" in (json as any).username
        ) {
          res.statusCode = 500;
          return res.end("CastError simulated");
        }
      } catch {}
      res.end("ok");
    });
  });
  return new Promise<http.Server>((resolve) =>
    server.listen(port, () => resolve(server))
  );
}

describe("Scanner basic", () => {
  let server: http.Server;
  let port: number;

  beforeAll(async () => {
    server = await startTestServer();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    port = (server.address() as any).port;
  });

  afterAll(() => server.close());

  test("detects GET anomaly", async () => {
    const scanner = new Scanner({ delayMs: 0, timeoutMs: 2000 });
    const url = `http://localhost:${port}/?q=a`;
    const res = await scanner.scanGet(url, ["q"]);
    expect(
      res.some((r) => r.evidence.keywordHits?.includes("MongoError"))
    ).toBe(true);
  });

  test("detects Body anomaly", async () => {
    const scanner = new Scanner({ delayMs: 0, timeoutMs: 2000 });
    const url = `http://localhost:${port}/login`;
    const res = await scanner.scanBody(
      url,
      "POST",
      { username: "a", password: "b" },
      ["username"]
    );
    expect(res.length).toBeGreaterThan(0);
  });

  test("crawl detects anomalies from link and form", async () => {
    const scanner = new Scanner({ delayMs: 0, timeoutMs: 2000 });
    const url = `http://localhost:${port}/`;
    const res = await scanner.crawl(url, {
      maxPages: 5,
      maxDepth: 2,
      sameOrigin: true,
    });
    expect(res.length).toBeGreaterThan(0);
    const hasIndicator = res.some((r) =>
      (r.evidence.keywordHits || []).some(
        (k) => k.includes("MongoError") || k.includes("CastError")
      )
    );
    expect(hasIndicator).toBe(true);
  });

  test("fingerprint detects CouchDB from headers", async () => {
    const scanner = new Scanner({ delayMs: 0, timeoutMs: 2000 });
    const url = `http://localhost:${port}/`;
    const fp = await scanner.fingerprint(url);
    expect(fp?.engine).toBe("CouchDB");
    expect(fp?.version).toBe("3.3.2");
  });

  test("fingerprint detects Elasticsearch from header/body", async () => {
    const scanner = new Scanner({ delayMs: 0, timeoutMs: 2000 });
    const url = `http://localhost:${port}/es`;
    const fp = await scanner.fingerprint(url);
    expect(fp?.engine).toBe("Elasticsearch");
    expect(fp?.version).toBe("8.15.0");
  });
});
