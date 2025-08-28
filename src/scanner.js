const { request } = require('undici');
const { operators, stringPayloads, bodyTemplates } = require('./payloads/mongodb');

/**
 * ScanResult type
 * {
 *   url: string,
 *   method: 'GET'|'POST'|'PUT'|'PATCH'|'DELETE',
 *   param: string,
 *   payload: any,
 *   evidence: {
 *     statusDelta?: number,
 *     timeMs?: number,
 *     lengthDelta?: number,
 *     keywordHits?: string[],
 *   }
 * }
 */

class Scanner {
  constructor(opts = {}) {
    this.timeoutMs = opts.timeoutMs ?? 8000;
    this.delayMs = opts.delayMs ?? 50;
    this.keywords = opts.keywords ?? [
      'MongoError', 'E11000', 'CastError', 'validator failed', 'Not authorized', 'invalid operator', '$where', '$regex', 'ObjectId('
    ];
  }

  async sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

  async baselineFetch({ url, method = 'GET', headers = {}, body }) {
    const start = Date.now();
    const res = await request(url, {
      method,
      headers: { 'user-agent': '@kdinisv/nosqli/0.1', ...headers },
      body: body && (typeof body === 'string' ? body : JSON.stringify(body)),
      headersTimeout: this.timeoutMs,
      bodyTimeout: this.timeoutMs,
    });
    const text = await res.body.text();
    return {
      status: res.statusCode,
      timeMs: Date.now() - start,
      text,
      length: text.length,
    };
  }

  buildUrlWithParam(url, param, value) {
    try {
      const u = new URL(url);
      u.searchParams.set(param, value);
      return u.toString();
    } catch {
      return url; // fallback if invalid
    }
  }

  analyzeDiff(baseline, current) {
    const statusDelta = current.status - baseline.status;
    const lengthDelta = current.length - baseline.length;
    const keywordHits = this.keywords.filter(k => current.text.includes(k));
    return { statusDelta, lengthDelta, keywordHits, timeMs: current.timeMs };
  }

  async scanGet(url, params = []) {
    const results = [];
    const base = await this.baselineFetch({ url });
    for (const p of params) {
      // string-based payloads
      for (const pl of stringPayloads) {
        const injectedUrl = this.buildUrlWithParam(url, p, pl);
        const cur = await this.baselineFetch({ url: injectedUrl });
        const evidence = this.analyzeDiff(base, cur);
        if (Math.abs(evidence.statusDelta) > 0 || Math.abs(evidence.lengthDelta) > 50 || evidence.keywordHits.length) {
          results.push({ url: injectedUrl, method: 'GET', param: p, payload: pl, evidence });
        }
        await this.sleep(this.delayMs);
      }
    }
    return results;
  }

  async scanBody(url, method = 'POST', baseBody = {}, fields = []) {
    const results = [];
    const base = await this.baselineFetch({ url, method, headers: { 'content-type': 'application/json' }, body: baseBody });

    for (const field of fields) {
      for (const tmpl of bodyTemplates) {
        const injBody = { ...baseBody, ...tmpl(field, baseBody[field] ?? '') };
        const cur = await this.baselineFetch({ url, method, headers: { 'content-type': 'application/json' }, body: injBody });
        const evidence = this.analyzeDiff(base, cur);
        if (Math.abs(evidence.statusDelta) > 0 || Math.abs(evidence.lengthDelta) > 50 || evidence.keywordHits.length) {
          results.push({ url, method, param: field, payload: injBody[field], evidence });
        }
        await this.sleep(this.delayMs);
      }
    }
    return results;
  }
}

module.exports = { Scanner };
