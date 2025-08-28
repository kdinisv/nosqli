// Safe payloads for CouchDB Mango selector endpoints (_find) and similar.
// Focus on selectors that could broaden results without performing mutations.

export const stringPayloads: string[] = [
  '{"$gt": ""}',
  '{"$ne": null}',
  '{"$regex": ".*"}',
];

export type BodyTemplate = (
  field: string,
  val: unknown
) => Record<string, unknown>;

export const bodyTemplates: BodyTemplate[] = [
  (field, _val) => ({ selector: { [field]: { $regex: ".*" } } }),
  (field, val) => ({
    selector: { $or: [{ [field]: val }, { [field]: { $ne: val } }] },
  }),
  (field, _val) => ({ selector: { [field]: { $gt: "" } } }),
];
