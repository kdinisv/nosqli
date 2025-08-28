import http from "http";

const server = http.createServer((req, res) => {
  const url = new URL(req.url || "/", "http://localhost:3005");
  const q = url.searchParams.get("q");
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    if (url.pathname === "/") {
      res.setHeader("Content-Type", "text/html");
      // Simulate CouchDB-ish headers
      res.setHeader("Server", "CouchDB/3.3.2");
      res.setHeader("X-CouchDB", "Welcome");
      res.setHeader("X-CouchDB-Version", "3.3.2");
      const html = `<!doctype html>
        <html><head><title>nosqli test</title></head>
        <body>
          <a href="/?q=a">Search link</a>
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
    if (q && q.includes("$ne")) {
      res.statusCode = 500;
      return res.end("MongoError: simulated");
    }
    try {
      const json = body ? JSON.parse(body) : {};
      if (json && typeof (json as any).username === "object") {
        res.statusCode = 500;
        return res.end("CastError simulated");
      }
    } catch {}
    res.end("ok");
  });
});

server.listen(3005, () =>
  console.log("Local test server on http://localhost:3005")
);
