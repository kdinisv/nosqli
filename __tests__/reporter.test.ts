import { toSpec } from "../src/reporter";
import type { ScanResult } from "../src/scanner";

describe("reporter.toSpec", () => {
  test("produces spec-compliant finding with diffs", () => {
    const findings: ScanResult[] = [
      {
        url: "http://example.com/api?q=a",
        method: "GET",
        param: "q",
        payload: '{"$ne":null}',
        evidence: {
          statusDelta: 1,
          lengthDelta: 120,
          timeMs: 150,
          timeDelta: 50,
          keywordHits: ["MongoError"],
          countDelta: 6,
          updatedCount: 0,
          baseStatus: 200,
          curStatus: 201,
          baseLength: 1000,
          curLength: 1120,
          baseTimeMs: 100,
          curTimeMs: 150,
          baseCount: 1,
          curCount: 7,
        },
        tags: ["nosqli"],
      },
    ];

    const out = toSpec(findings, "MongoDB");
    expect(Array.isArray(out)).toBe(true);
    expect(out.length).toBe(1);

    const f = out[0];
    expect(f).toHaveProperty("id");
    expect(f.title).toMatch(/MongoDB/);
    expect(["low", "medium", "high"]).toContain(f.severity);
    expect(f.db_family).toBe("MongoDB");
    expect(f.endpoint).toEqual({
      method: "GET",
      url: findings[0].url,
      parameter: "q",
    });
    expect(f.payload).toEqual({ injected: findings[0].payload });
    expect(f.evidence.diff.status).toEqual([200, 201]);
    expect(f.evidence.diff.length).toEqual([1000, 1120]);
    expect(f.evidence.diff.timeMs).toEqual([100, 150]);
    expect(f.evidence.diff.count).toEqual([1, 7]);
    expect(f.evidence.diff.keywords).toContain("MongoError");
    expect(Array.isArray(f.remediation)).toBe(true);
    expect(typeof f.confidence).toBe("number");
    expect(f.confidence).toBeGreaterThanOrEqual(0);
    expect(f.confidence).toBeLessThanOrEqual(1);
  });
});
