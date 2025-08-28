import { request, ProxyAgent, Dispatcher } from "undici";

export type HttpMethod = "GET" | "HEAD" | "POST" | "PUT" | "PATCH" | "DELETE";

export type RetryConfig = {
  maxAttempts: number; // total attempts including the first one
  baseDelayMs: number; // initial backoff base
  maxDelayMs: number; // cap for backoff delay
  retryUnsafeMethods?: boolean; // allow POST/PUT/PATCH/DELETE
};

export type HttpRequestOptions = {
  method?: HttpMethod;
  headers?: Record<string, string>;
  body?: unknown;
  timeoutMs?: number; // per-attempt (headers/body)
  retry?: RetryConfig;
  proxyUrl?: string | null; // explicit proxy override (takes precedence over env)
  onAttemptLog?: (entry: HttpAttemptLog) => void; // optional attempt logger
};

export type HttpResponse = {
  status: number;
  headers: Record<string, string>;
  text: string;
  timeMs: number;
  attempts: number;
  attemptLogs: HttpAttemptLog[];
};

export type HttpAttemptLog = {
  url: string;
  method: HttpMethod;
  attempt: number; // 1-based
  startTs: number; // Date.now()
  durationMs: number;
  statusCode?: number;
  errorCode?: string;
  errorMessage?: string;
  willRetry: boolean;
  retryDelayMs?: number;
  reason?: string; // textual reason for retry
};

const IDEMPOTENT_METHODS: ReadonlySet<string> = new Set(["GET", "HEAD"]);
const RETRY_STATUS: ReadonlySet<number> = new Set([502, 503, 504]);
const RETRY_ERROR_CODES: ReadonlySet<string> = new Set([
  "ECONNRESET",
  "ETIMEDOUT",
  "ENOTFOUND",
  "EAI_AGAIN",
  // Undici/node errors
  "UND_ERR_HEADERS_TIMEOUT",
  "UND_ERR_BODY_TIMEOUT",
]);

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function isRetryAllowed(
  method: HttpMethod,
  statusOrCode: { statusCode?: number; errorCode?: string },
  cfg?: RetryConfig
): { retry: boolean; reason?: string } {
  const retryUnsafe = cfg?.retryUnsafeMethods === true;
  const isIdempotent = IDEMPOTENT_METHODS.has(method);
  if (!retryUnsafe && !isIdempotent) return { retry: false };

  if (
    typeof statusOrCode.statusCode === "number" &&
    RETRY_STATUS.has(statusOrCode.statusCode)
  )
    return { retry: true, reason: `status:${statusOrCode.statusCode}` };
  if (statusOrCode.errorCode && RETRY_ERROR_CODES.has(statusOrCode.errorCode))
    return { retry: true, reason: `error:${statusOrCode.errorCode}` };
  return { retry: false };
}

function expBackoffDelay(attempt: number, base: number, cap: number): number {
  // attempt: 1,2,3... (1st retry waits base, but we call for current attempt index)
  const pow = Math.pow(2, Math.max(0, attempt - 1));
  const raw = Math.min(cap, base * pow);
  // full jitter per AWS architecture blog
  return Math.floor(Math.random() * raw);
}

function normalizeHeaders(input: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (!input || typeof input !== "object") return out;
  for (const [k, v] of Object.entries(input as any)) {
    const val = Array.isArray(v) ? v.join(", ") : String(v);
    out[k.toLowerCase()] = val;
  }
  return out;
}

function resolveProxy(
  url: string,
  override?: string | null
): Dispatcher | undefined {
  try {
    const target = new URL(url);
    const proto = target.protocol; // http: or https:
    const noProxy = process.env.NO_PROXY || process.env.no_proxy;
    if (shouldBypassProxy(target, noProxy)) return undefined;

    const px =
      override ??
      (proto === "http:"
        ? process.env.HTTP_PROXY || process.env.http_proxy
        : process.env.HTTPS_PROXY || process.env.https_proxy);
    if (!px) return undefined;
    return new ProxyAgent(px);
  } catch {
    return undefined;
  }
}

function shouldBypassProxy(target: URL, noProxyEnv?: string): boolean {
  if (!noProxyEnv) return false;
  const host = target.hostname.toLowerCase();
  const port = target.port || (target.protocol === "https:" ? "443" : "80");
  const entries = noProxyEnv
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  for (const entry of entries) {
    if (entry === "*") return true;
    if (entry.includes(":")) {
      // host:port match
      if (entry === `${host}:${port}`) return true;
    } else if (entry.startsWith(".")) {
      // domain suffix match
      if (host.endsWith(entry)) return true;
    } else if (entry === host) {
      return true;
    }
  }
  return false;
}

export async function httpRequest(
  url: string,
  options: HttpRequestOptions = {}
): Promise<HttpResponse> {
  const method = (options.method || "GET") as HttpMethod;
  const headers = { ...(options.headers || {}) } as Record<string, string>;
  const timeoutMs = options.timeoutMs ?? 8000;
  const retryCfg: RetryConfig = {
    maxAttempts: Math.max(1, options.retry?.maxAttempts ?? 1),
    baseDelayMs: Math.max(1, options.retry?.baseDelayMs ?? 200),
    maxDelayMs: Math.max(1, options.retry?.maxDelayMs ?? 2000),
    retryUnsafeMethods: options.retry?.retryUnsafeMethods ?? false,
  };
  const dispatcher = resolveProxy(url, options.proxyUrl ?? undefined);

  const attemptLogs: HttpAttemptLog[] = [];
  let lastError: any;
  let lastText = "";
  let lastStatus = 0;
  let lastHeaders: Record<string, string> = {};
  const startWall = Date.now();

  for (let attempt = 1; attempt <= retryCfg.maxAttempts; attempt++) {
    const aStart = Date.now();
    let willRetry = false;
    let retryDelay = 0;
    let reason: string | undefined;
    try {
      const res = await request(url, {
        method,
        headers,
        dispatcher,
        // body handling
        body: ((): any => {
          const b = (options as any).body;
          if (b == null) return undefined;
          if (typeof b === "string" || b instanceof Uint8Array) return b as any;
          try {
            return JSON.stringify(b);
          } catch {
            return undefined;
          }
        })(),
        headersTimeout: timeoutMs,
        bodyTimeout: timeoutMs,
      });
      const text = await res.body.text();
      lastText = text;
      lastStatus = res.statusCode;
      lastHeaders = normalizeHeaders((res as any).headers);

      // Decide retry on status
      const allow = isRetryAllowed(
        method,
        { statusCode: res.statusCode },
        retryCfg
      );
      willRetry = allow.retry && attempt < retryCfg.maxAttempts;
      reason = allow.reason;
      const aEnd = Date.now();
      const duration = aEnd - aStart;
      const logEntry: HttpAttemptLog = {
        url,
        method,
        attempt,
        startTs: aStart,
        durationMs: duration,
        statusCode: res.statusCode,
        willRetry,
        retryDelayMs: willRetry
          ? (retryDelay = expBackoffDelay(
              attempt,
              retryCfg.baseDelayMs,
              retryCfg.maxDelayMs
            ))
          : undefined,
        reason,
      };
      attemptLogs.push(logEntry);
      options.onAttemptLog?.(logEntry);
      if (!willRetry) {
        return {
          status: res.statusCode,
          headers: lastHeaders,
          text,
          timeMs: Date.now() - startWall,
          attempts: attempt,
          attemptLogs,
        };
      }
    } catch (err: any) {
      lastError = err;
      const code = String(err?.code || err?.name || "ERR");
      const allow = isRetryAllowed(method, { errorCode: code }, retryCfg);
      willRetry = allow.retry && attempt < retryCfg.maxAttempts;
      reason = allow.reason;
      const aEnd = Date.now();
      const duration = aEnd - aStart;
      const logEntry: HttpAttemptLog = {
        url,
        method,
        attempt,
        startTs: aStart,
        durationMs: duration,
        errorCode: code,
        errorMessage: String(err?.message || err),
        willRetry,
        retryDelayMs: willRetry
          ? (retryDelay = expBackoffDelay(
              attempt,
              retryCfg.baseDelayMs,
              retryCfg.maxDelayMs
            ))
          : undefined,
        reason,
      };
      attemptLogs.push(logEntry);
      options.onAttemptLog?.(logEntry);
    }
    if (willRetry) {
      await sleep(retryDelay);
      continue;
    }
    // exit loop if not retrying after error
    break;
  }

  // If we are here, last attempt failed or returned retriable status but no more attempts
  if (lastStatus) {
    return {
      status: lastStatus,
      headers: lastHeaders,
      text: lastText,
      timeMs: Date.now() - startWall,
      attempts: attemptLogs.length,
      attemptLogs,
    };
  }
  // No status captured — throw the last error
  const err = new Error(
    `HTTP request failed after ${attemptLogs.length} attempt(s): ${String(
      lastError?.message || lastError
    )}`
  );
  (err as any).attemptLogs = attemptLogs;
  throw err;
}

// Export internals for unit testing
export const __internals = {
  expBackoffDelay,
  isRetryAllowed,
  resolveProxy,
  normalizeHeaders,
};
