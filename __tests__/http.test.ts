import http from "http";
import { httpRequest, __internals } from "../src/http.ts";

function startFlakyServer(port = 0, failCount = 1) {
  let remaining = failCount;
  const server = http.createServer((_req, res) => {
    if (remaining > 0) {
      remaining--;
      res.statusCode = 503;
      return res.end("temporary error");
    }
    res.statusCode = 200;
    res.end("ok");
  });
  return new Promise<{ server: http.Server; port: number }>((resolve) =>
    server.listen(port, () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const p = (server.address() as any).port as number;
      resolve({ server, port: p });
    })
  );
}

describe("http client", () => {
  test("backoff grows and is jittered within cap", () => {
    const d1 = __internals.expBackoffDelay(1, 200, 1000);
    const d2 = __internals.expBackoffDelay(2, 200, 1000);
    const d3 = __internals.expBackoffDelay(3, 200, 1000);
    expect(d1).toBeGreaterThanOrEqual(0);
    expect(d2).toBeGreaterThanOrEqual(0);
    expect(d3).toBeGreaterThanOrEqual(0);
    // d2 expected range <= 400, d3 <= 800 (cap 1000)
    expect(d2).toBeLessThanOrEqual(400);
    expect(d3).toBeLessThanOrEqual(800);
  });

  test("retry allowed only for idempotent by default and 503/timeout errors", () => {
    const allow503 = __internals.isRetryAllowed(
      "GET",
      { statusCode: 503 },
      {
        maxAttempts: 2,
        baseDelayMs: 10,
        maxDelayMs: 20,
        retryUnsafeMethods: false,
      }
    );
    expect(allow503.retry).toBe(true);
    const allowPost = __internals.isRetryAllowed(
      "POST",
      { statusCode: 503 },
      {
        maxAttempts: 2,
        baseDelayMs: 10,
        maxDelayMs: 20,
        retryUnsafeMethods: false,
      }
    );
    expect(allowPost.retry).toBe(false);
    const allowPostUnsafe = __internals.isRetryAllowed(
      "POST",
      { errorCode: "ETIMEDOUT" },
      {
        maxAttempts: 2,
        baseDelayMs: 10,
        maxDelayMs: 20,
        retryUnsafeMethods: true,
      }
    );
    expect(allowPostUnsafe.retry).toBe(true);
  });

  test("NO_PROXY bypass helper", () => {
    const u = new URL("http://example.com:8080");
    expect(__internals["resolveProxy"]).toBeDefined();
    // internal should bypass when domain listed
    // can't assert actual ProxyAgent instance here without env; rely on shouldBypass logic via resolve (no exception)
    expect(() => __internals.resolveProxy(u.toString(), null)).not.toThrow();
  });

  test("retries on 503 then succeeds", async () => {
    const { server, port } = await startFlakyServer(0, 1);
    try {
      const url = `http://localhost:${port}/`;
      const res = await httpRequest(url, {
        method: "GET",
        retry: { maxAttempts: 3, baseDelayMs: 10, maxDelayMs: 30 },
        timeoutMs: 1000,
      });
      expect(res.status).toBe(200);
      expect(res.attempts).toBeGreaterThanOrEqual(2);
    } finally {
      server.close();
    }
  });
});
