#!/usr/bin/env node
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { Scanner, type HttpMethod } from "./scanner.js";

async function main() {
  const argv = await yargs(hideBin(process.argv))
    .scriptName("nosqli-scan")
    .usage("$0 <url> [options]")
    .positional("url", { describe: "Target URL", type: "string" })
    .option("get-params", {
      alias: "g",
      describe: "Comma-separated GET params to test",
      type: "string",
    })
    .option("crawl", {
      alias: "C",
      describe:
        "Crawl the site starting from the URL and scan discovered links/forms",
      type: "boolean",
    })
    .option("max-pages", {
      describe: "Crawl page limit",
      type: "number",
      default: 50,
    })
    .option("max-depth", {
      describe: "Crawl depth limit",
      type: "number",
      default: 3,
    })
    .option("offsite", {
      describe: "Allow offsite (cross-origin) links during crawl",
      type: "boolean",
      default: false,
    })
    .option("fingerprint", {
      alias: "F",
      describe: "Try to detect database engine and version",
      type: "boolean",
    })
    .option("method", {
      alias: "X",
      describe: "HTTP method for body scan",
      type: "string",
      default: "POST",
    })
    .option("fields", {
      alias: "f",
      describe: "Comma-separated JSON body fields to test",
      type: "string",
    })
    .option("dos", {
      describe: "Enable DoS timing payloads in addition to regular payloads",
      type: "boolean",
      default: false,
    })
    .option("manipulation", {
      describe: "Try broad filters to detect mass update (manipulation)",
      type: "boolean",
      default: false,
    })
    .option("body", {
      alias: "d",
      describe: "Base JSON body string",
      type: "string",
    })
    .option("timeout", {
      alias: "t",
      describe: "Timeout per request (ms)",
      type: "number",
      default: 8000,
    })
    .option("retry-max", {
      describe: "Max retry attempts (including first attempt)",
      type: "number",
      default: 1,
    })
    .option("retry-base-delay", {
      describe: "Base delay for exponential backoff (ms)",
      type: "number",
      default: 200,
    })
    .option("retry-max-delay", {
      describe: "Max delay cap for backoff (ms)",
      type: "number",
      default: 2000,
    })
    .option("retry-unsafe", {
      describe:
        "Allow retries for non-idempotent methods (POST/PUT/PATCH/DELETE)",
      type: "boolean",
      default: false,
    })
    .option("proxy", {
      describe:
        "Proxy URL (overrides HTTP(S)_PROXY). Honors NO_PROXY for bypass.",
      type: "string",
    })
    .option("delay", {
      alias: "D",
      describe: "Delay between requests (ms)",
      type: "number",
      default: 50,
    })
    .option("header", {
      alias: "H",
      describe: "Extra header, repeatable, e.g. -H 'Authorization: Bearer ...'",
      type: "array",
    })
    .option("dos-threshold", {
      describe: "Threshold in ms to treat response delay as DoS",
      type: "number",
      default: 1000,
    })
    .option("format", {
      describe: "Output format: raw|spec",
      type: "string",
      default: "raw",
    })
    .option("http-jsonl", {
      describe: "Path to write HTTP attempt logs in JSONL format",
      type: "string",
    })
    .option("debug", {
      describe: "Enable verbose debug logging",
      type: "boolean",
      default: false,
    })
    .option("debug-jsonl", {
      describe: "Path to write debug events in JSONL format",
      type: "string",
    })
    .option("db-family", {
      describe: "Target DB family (MongoDB|Elasticsearch|CouchDB)",
      type: "string",
      default: "MongoDB",
    })
    .option("headers-scan", {
      describe: "Fuzz selected headers with payloads",
      type: "boolean",
      default: false,
    })
    .option("header-names", {
      describe: "Comma-separated header names to fuzz",
      type: "string",
    })
    .option("cookies-scan", {
      describe: "Fuzz selected cookies with payloads",
      type: "boolean",
      default: false,
    })
    .option("cookie-names", {
      describe: "Comma-separated cookie names to fuzz",
      type: "string",
    })
    .option("graphql-scan", {
      describe: "Scan GraphQL endpoint by fuzzing variables",
      type: "boolean",
      default: false,
    })
    .option("graphql-query", {
      describe: "GraphQL operation (query/mutation) string",
      type: "string",
    })
    .option("graphql-opname", {
      describe: "GraphQL operationName (optional)",
      type: "string",
    })
    .option("graphql-fields", {
      describe: "Comma-separated GraphQL variable fields to fuzz",
      type: "string",
    })
    .demandCommand(1)
    .help()
    .parse();

  const url = String((argv as any)._?.[0] ?? "");
  const extraHeaders: Record<string, string> = {};
  const hdrs = (argv as any).header as string[] | undefined;
  if (hdrs && Array.isArray(hdrs)) {
    for (const h of hdrs) {
      const idx = String(h).indexOf(":");
      if (idx > 0) {
        const k = String(h).slice(0, idx).trim();
        const v = String(h)
          .slice(idx + 1)
          .trim();
        if (k && v) extraHeaders[k] = v;
      }
    }
  }

  // Optional JSONL writer and metrics
  let jsonlStream: any = null;
  let metrics: import("./metrics.js").HttpMetrics | null = null;
  const jsonlPath = (argv as any)["http-jsonl"] as string | undefined;
  // Optional DEBUG JSONL
  let debugStream: any = null;
  const debugJsonlPath = (argv as any)["debug-jsonl"] as string | undefined;
  if (jsonlPath) {
    const fs = await import("node:fs");
    jsonlStream = fs.createWriteStream(jsonlPath, { flags: "a" });
    const { HttpMetrics } = await import("./metrics.js");
    metrics = new HttpMetrics();
  }
  if (debugJsonlPath) {
    const fs = await import("node:fs");
    debugStream = fs.createWriteStream(debugJsonlPath, { flags: "a" });
  }

  const scanner = new Scanner({
    timeoutMs: (argv as any).timeout,
    delayMs: (argv as any).delay,
    headers: extraHeaders,
    dosThresholdMs: Number((argv as any)["dos-threshold"]) || 1000,
    dbFamily: (argv as any)["db-family"],
    retryMaxAttempts: Number((argv as any)["retry-max"]) || 1,
    retryBaseDelayMs: Number((argv as any)["retry-base-delay"]) || 200,
    retryMaxDelayMs: Number((argv as any)["retry-max-delay"]) || 2000,
    retryUnsafeMethods: !!(argv as any)["retry-unsafe"],
    proxy: (argv as any)["proxy"] ?? null,
    debug: !!(argv as any)["debug"],
    onDebugEvent: (e) => {
      if (debugStream) {
        try {
          debugStream.write(JSON.stringify(e) + "\n");
        } catch {}
      }
    },
    onHttpAttempt: (log) => {
      if (jsonlStream) {
        try {
          jsonlStream.write(JSON.stringify({ ts: Date.now(), ...log }) + "\n");
        } catch {}
      }
      if (metrics) {
        try {
          metrics.addAttempt(log);
        } catch {}
      }
    },
  });

  let findings: any[] = [];
  let fingerprint: any = undefined;

  if ((argv as any).fingerprint) {
    fingerprint = await scanner.fingerprint(url);
  }

  if ((argv as any).crawl) {
    const crawlFindings = await scanner.crawl(url, {
      maxPages: Number((argv as any)["max-pages"]) || 50,
      maxDepth: Number((argv as any)["max-depth"]) || 3,
      sameOrigin: !(argv as any).offsite,
    });
    findings = findings.concat(crawlFindings);
  }

  if ((argv as any).getParams) {
    const params = String((argv as any).getParams)
      .split(",")
      .map((s: string) => s.trim())
      .filter(Boolean);
    let res = await scanner.scanGet(url, params);
    if ((argv as any).dos) {
      const d = await scanner.scanDoSGet(url, params);
      res = res.concat(d);
    }
    findings = findings.concat(res);
  }

  if ((argv as any).fields) {
    const fields = String((argv as any).fields)
      .split(",")
      .map((s: string) => s.trim())
      .filter(Boolean);
    let baseBody: Record<string, unknown> = {};
    if ((argv as any).body) {
      try {
        baseBody = JSON.parse(String((argv as any).body));
      } catch {
        console.error("Invalid JSON in --body");
      }
    }
    const method =
      (String((argv as any).method).toUpperCase() as HttpMethod) || "POST";
    let res = await scanner.scanBody(url, method, baseBody, fields);
    if ((argv as any).dos) {
      const d = await scanner.scanDoSBody(url, method, baseBody, fields);
      res = res.concat(d);
    }
    if ((argv as any).manipulation) {
      const m = await scanner.scanManipulation(url, method, baseBody, fields);
      res = res.concat(m);
    }
    findings = findings.concat(res);
  }

  if ((argv as any)["headers-scan"]) {
    const headerNames = ((argv as any)["header-names"] || "")
      .split(",")
      .map((s: string) => s.trim())
      .filter(Boolean);
    const res = await scanner.scanHeaders(
      url,
      headerNames.length ? headerNames : undefined
    );
    findings = findings.concat(res);
  }

  if ((argv as any)["cookies-scan"]) {
    const cookieNames = ((argv as any)["cookie-names"] || "")
      .split(",")
      .map((s: string) => s.trim())
      .filter(Boolean);
    const res = await scanner.scanCookies(
      url,
      cookieNames.length ? cookieNames : undefined
    );
    findings = findings.concat(res);
  }

  if ((argv as any)["graphql-scan"]) {
    const queryStr = String((argv as any)["graphql-query"] || "");
    const fields = String((argv as any)["graphql-fields"] || "")
      .split(",")
      .map((s: string) => s.trim())
      .filter(Boolean);
    if (queryStr && fields.length) {
      const opname = (argv as any)["graphql-opname"] || null;
      const res = await scanner.scanGraphQL(url, opname, queryStr, fields);
      findings = findings.concat(res);
    }
  }

  const outFmt = String((argv as any).format || "raw");
  if (outFmt === "spec") {
    const { toSpec } = await import("./reporter.js");
    const dbFamily = String(
      (argv as any)["db-family"] || fingerprint?.engine || "Unknown"
    );
    const spec = toSpec(findings, dbFamily);
    console.log(JSON.stringify(spec, null, 2));
    if (metrics) {
      console.log("\nHTTP metrics:");
      console.log(JSON.stringify(metrics.summary(), null, 2));
    }
    if (jsonlStream) jsonlStream.end();
    if (debugStream) debugStream.end();
    return;
  }

  if ((argv as any).fingerprint) {
    console.log(
      JSON.stringify({ fingerprint: fingerprint ?? null, findings }, null, 2)
    );
    if (metrics) {
      console.log("\nHTTP metrics:");
      console.log(JSON.stringify(metrics.summary(), null, 2));
    }
    if (jsonlStream) jsonlStream.end();
    if (debugStream) debugStream.end();
    return;
  }

  if (!findings.length) {
    console.log("No obvious NoSQLi indicators found.");
  } else {
    console.log(JSON.stringify(findings, null, 2));
  }

  if (metrics) {
    console.log("\nHTTP metrics:");
    console.log(JSON.stringify(metrics.summary(), null, 2));
  }
  if (jsonlStream) jsonlStream.end();
  if (debugStream) debugStream.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
