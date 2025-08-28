// Safe-by-default payloads for Elasticsearch/Lucene-style query DSL
// These aim to cause observable differences without mutations.

export const stringPayloads: string[] = [
  // Query string attempts (for endpoints that accept `q`)
  "*",
  "+*",
  "*:*",
  "username:*",
  // Lucene regexp-like
  "/.*/",
];

export type BodyTemplate = (
  field: string,
  val: unknown
) => Record<string, unknown>;

export const bodyTemplates: BodyTemplate[] = [
  // Query DSL broad matchers
  (field, _val) => ({
    query: {
      query_string: { query: `${field}:*` },
    },
  }),
  (field, _val) => ({
    query: {
      wildcard: { [field]: "*" },
    },
  }),
  (field, _val) => ({
    query: {
      regexp: { [field]: ".*" },
    },
  }),
];
