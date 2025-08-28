import type { ScanResult } from "./scanner.js";

export type SpecFinding = {
  id: string;
  title: string;
  severity: "low" | "medium" | "high";
  db_family: "MongoDB" | "Elasticsearch" | "CouchDB" | string;
  endpoint: { method: string; url: string; parameter?: string };
  payload: { injected: unknown };
  evidence: {
    diff: {
      status?: [number, number];
      length?: [number, number];
      timeMs?: [number, number];
      count?: [number, number];
      keywords?: string[];
    };
  };
  remediation: string[];
  confidence: number;
};

export function toSpec(
  findings: ScanResult[],
  dbFamily: string
): SpecFinding[] {
  return findings.map((f, idx) => {
    const sev: SpecFinding["severity"] = inferSeverity(f);
    const title = `${dbFamily} selector injection`;
    const id = `NOSQLI-2025-${String(idx + 1).padStart(4, "0")}`;
    const evidence = f.evidence || {};
    const diff: SpecFinding["evidence"]["diff"] = {};
    if (
      typeof evidence.baseStatus === "number" &&
      typeof evidence.curStatus === "number"
    )
      diff.status = [evidence.baseStatus, evidence.curStatus];
    if (
      typeof evidence.baseLength === "number" &&
      typeof evidence.curLength === "number"
    )
      diff.length = [evidence.baseLength, evidence.curLength];
    if (
      typeof evidence.baseTimeMs === "number" &&
      typeof evidence.curTimeMs === "number"
    )
      diff.timeMs = [evidence.baseTimeMs, evidence.curTimeMs];
    if (
      typeof evidence.baseCount === "number" &&
      typeof evidence.curCount === "number"
    )
      diff.count = [evidence.baseCount, evidence.curCount];
    if (evidence.keywordHits && evidence.keywordHits.length) {
      diff.keywords = evidence.keywordHits;
    }

    return {
      id,
      title,
      severity: sev,
      db_family: dbFamily,
      endpoint: { method: f.method, url: f.url, parameter: f.param },
      payload: { injected: f.payload },
      evidence: { diff },
      remediation: defaultRemediation(dbFamily),
      confidence: inferConfidence(f),
    };
  });
}

function inferSeverity(f: ScanResult): SpecFinding["severity"] {
  const t = f.tags || [];
  if (t.includes("dos")) return "high";
  if (t.includes("exfil")) return "high";
  if (t.includes("nosqli")) return "medium";
  return "low";
}

function inferConfidence(f: ScanResult): number {
  const e = f.evidence || {};
  let c = 0.3;
  if ((e.keywordHits?.length || 0) > 0) c += 0.3;
  if (Math.abs(e.statusDelta ?? 0) > 0 || Math.abs(e.lengthDelta ?? 0) > 50)
    c += 0.2;
  if ((e.timeDelta ?? 0) > 0) c += 0.1;
  if ((e.countDelta ?? 0) >= 5 || (e.updatedCount ?? 0) >= 2) c += 0.1;
  return Math.min(1, Number(c.toFixed(2)));
}

function defaultRemediation(db: string): string[] {
  const common = ["Strict validation", "Parameterized filters"];
  if (db === "MongoDB") return common;
  if (db === "Elasticsearch")
    return [...common, "Disable dangerous scripts/Painless"];
  if (db === "CouchDB")
    return [...common, "Restrict Mango selectors and map/reduce inputs"];
  return common;
}
