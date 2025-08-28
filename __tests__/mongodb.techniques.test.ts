import http from "http";
import { Scanner } from "../src/scanner.ts";

function startMongoLikeServer(port = 0) {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url || "/", `http://localhost:${port}`);
    const q = url.searchParams.get("q") || "";
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      // Content-Type toggles for body JSON
      res.setHeader("Content-Type", "text/plain");

      // Error-based indicators via GET param
      if (
        q.includes("$abcd") ||
        q.includes("$type") ||
        q.includes('$where": 1') ||
        q.includes('$or": 1') ||
        q.includes('$regex": "[') ||
        q.includes('$type": "notatype"')
      ) {
        res.statusCode = 500;
        return res.end("MongoServerError: invalid operator");
      }
      if (q.includes('ObjectId("zzz")')) {
        res.statusCode = 500;
        return res.end('CastError: Cast to ObjectId failed for value "zzz"');
      }
      // Boolean-based via $where in query string
      if (q.includes('$where": "return true"')) {
        return res.end("ok-true");
      }
      if (q.includes('$where": "return false"')) {
        return res.end("ok-false");
      }

      // Type juggling primitives in query: if q is booleanish, alter length
      if (["true", "false", "1", "0"].includes(q)) {
        const s = q === "true" || q === "1" ? "T".repeat(20) : "F".repeat(10);
        return res.end(s);
      }

      // Parse body for JSON cases
      try {
        const json = body ? JSON.parse(body) : {};
        // Error-based: invalid operator
        if (json && typeof json === "object") {
          const j = json as any;
          if (j.username && typeof j.username === "object") {
            if ("$abcd" in j.username) {
              res.statusCode = 500;
              return res.end("MongoServerError: invalid operator");
            }
            if ("$type" in j.username && typeof j.username.$type !== "number") {
              res.statusCode = 500;
              return res.end("BSONTypeError: wrong $type");
            }
            if (
              "$or" in j.username ||
              ("$where" in j.username && typeof j.username.$where === "number")
            ) {
              res.statusCode = 500;
              return res.end("ValidationError: expected object");
            }
            if (
              "$in" in j.username &&
              Array.isArray(j.username.$in) &&
              j.username.$in.some(
                (x: any) => x && typeof x === "object" && "$oid" in x
              )
            ) {
              res.statusCode = 500;
              return res.end("CastError: Cast to ObjectId failed");
            }
            if ("$where" in j.username) {
              const w = j.username.$where;
              if (w === "return true") return res.end("ok-true");
              if (w === "return false") return res.end("ok-false");
            }
          }
        }
        // Type juggling in body: boolean/number changes output shape
        if (
          json &&
          typeof json === "object" &&
          (json as any).username !== undefined
        ) {
          const u = (json as any).username;
          if (u === true || u === 1)
            return res.end("truthy-user" + "!".repeat(5));
          if (u === false || u === 0) return res.end("falsy-user");
        }
      } catch {}

      return res.end("ok");
    });
  });
  return new Promise<http.Server>((resolve) =>
    server.listen(port, () => resolve(server))
  );
}

describe("MongoDB techniques (boolean-based, error-based, type juggling)", () => {
  let server: http.Server;
  let port: number;

  beforeAll(async () => {
    server = await startMongoLikeServer();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    port = (server.address() as any).port;
  });

  afterAll(() => server.close());

  test("boolean-based via $where toggles response", async () => {
    const scanner = new Scanner({
      delayMs: 0,
      timeoutMs: 2000,
      dbFamily: "MongoDB",
    });
    const url = `http://localhost:${port}/?q=a`;
    const res = await scanner.scanGet(url, ["q"]);
    // Expect at least one finding due to length/status/keywords differences
    expect(res.length).toBeGreaterThan(0);
    const hasToggle = res.some(
      (r) =>
        (r.evidence.lengthDelta ?? 0) !== 0 ||
        (r.evidence.statusDelta ?? 0) !== 0
    );
    expect(hasToggle).toBe(true);
  });

  test("error-based via invalid operator triggers keyword hits", async () => {
    const scanner = new Scanner({
      delayMs: 0,
      timeoutMs: 2000,
      dbFamily: "MongoDB",
    });
    const url = `http://localhost:${port}/login`;
    const res = await scanner.scanBody(url, "POST", { username: "a" }, [
      "username",
    ]);
    const hasError = res.some(
      (r) =>
        (r.evidence.keywordHits || []).some((k) =>
          /MongoError|invalid operator|CastError/.test(k)
        ) || (r.evidence.statusDelta ?? 0) !== 0
    );
    expect(hasError).toBe(true);
  });

  test("type juggling primitives change response length", async () => {
    const scanner = new Scanner({
      delayMs: 0,
      timeoutMs: 2000,
      dbFamily: "MongoDB",
    });
    const url = `http://localhost:${port}/?q=x`;
    const res = await scanner.scanGet(url, ["q"]);
    const lenChanged = res.some(
      (r) => Math.abs(r.evidence.lengthDelta || 0) >= 10
    );
    expect(lenChanged).toBe(true);
  });

  test("error-based CastError/ObjectId indicators detected", async () => {
    const scanner = new Scanner({
      delayMs: 0,
      timeoutMs: 2000,
      dbFamily: "MongoDB",
    });
    const url = `http://localhost:${port}/?q=a`;
    const res = await scanner.scanGet(url, ["q"]);
    const hasCast = res.some((r) =>
      (r.evidence.keywordHits || []).some((k) =>
        /Cast to ObjectId failed|CastError/.test(k)
      )
    );
    expect(hasCast).toBe(true);
  });
});
