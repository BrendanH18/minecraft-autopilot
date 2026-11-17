import { ALL_PLANNING_GROUPS } from './planning-tools.js';
import { calculateOffline, demand } from './offline-kit.js';

const groups = new Map(ALL_PLANNING_GROUPS.map((group) => [group.name, group]));
const MAX_BYTES = 1_000_000;
const MAX_NODES = 10_000;

export function resolvePlanner(groupName, commandName) {
  const group = groups.get(groupName);
  demand(group, `Unknown planning group: ${groupName}.`);
  demand(
    group.commands.some((spec) => spec.signature.split(' ')[0] === commandName),
    `Unknown ${groupName} command: ${commandName}.`,
  );
  return group;
}

export function evaluate(groupName, commandName, args) {
  demand(Array.isArray(args), 'Each case must be an argument array.');
  return calculateOffline(resolvePlanner(groupName, commandName), commandName, args).result;
}

export function cases(value) {
  demand(Array.isArray(value) && value.length > 0 && value.length <= 100, 'Supply 1–100 argument-array cases.');
  demand(value.every(Array.isArray), 'Each case must be an argument array.');
  return value;
}

// Validate before calculations: callers cannot hide unbounded work in unknown
// fields, nested JSON, or a large collection of individually valid CSV lists.
export function validateRequest(request) {
  demand(
    request &&
      !Array.isArray(request) &&
      typeof request === 'object' &&
      [Object.prototype, null].includes(Object.getPrototypeOf(request)),
    'Supply a JSON request object.',
  );
  let nodes = 0,
    entries = 0;
  const ancestors = new Set();
  function visit(value, depth) {
    demand(++nodes <= MAX_NODES && depth <= 20, 'Request exceeds supported size or depth.');
    if (typeof value === 'string') {
      entries += value.split(',').length;
      demand(entries <= MAX_NODES && value.length <= MAX_BYTES, 'Request has too many input entries.');
    } else if (typeof value === 'number') demand(Number.isFinite(value), 'Request numbers must be finite.');
    else if (value && typeof value === 'object') {
      demand(!ancestors.has(value), 'Request must not contain cycles.');
      demand(
        Array.isArray(value) || [Object.prototype, null].includes(Object.getPrototypeOf(value)),
        'Request must contain JSON values only.',
      );
      // JSON arrays are dense. Object.values skips holes in a sparse JavaScript
      // array, so check the own keys before visiting, and before any stringify.
      if (Array.isArray(value)) {
        const keys = Object.keys(value);
        demand(
          keys.length === value.length && keys.every((key, index) => key === String(index)),
          'Request must contain JSON values only.',
        );
      }
      ancestors.add(value);
      for (const child of Object.values(value)) visit(child, depth + 1);
      ancestors.delete(value);
    } else demand(value === null || typeof value === 'boolean', 'Request must contain JSON values only.');
  }
  visit(request, 0);
  demand(Buffer.byteLength(JSON.stringify(request), 'utf8') <= MAX_BYTES, 'Request exceeds 1,000,000 bytes.');
  return request;
}

export function allowedKeys(request, keys) {
  demand(
    Object.keys(request).every((key) => keys.includes(key)),
    'Request contains an unknown field.',
  );
}

const escapePointer = (key) => String(key).replaceAll('~', '~0').replaceAll('/', '~1');

// Missing values are explicit, so removal of a null differs from an unchanged
// null. Arrays use zero-based JSON pointers; argument indexes elsewhere are 1-based.
export function changesBetween(before, after) {
  const changes = [];
  let nodes = 0;
  function visit(left, right, path, leftPresent = true, rightPresent = true) {
    demand(++nodes <= MAX_NODES, 'Comparison exceeds 10,000 result nodes.');
    if (leftPresent && rightPresent && left === right) return;
    const leftObject = left !== null && typeof left === 'object';
    const rightObject = right !== null && typeof right === 'object';
    if (leftPresent && rightPresent && leftObject && rightObject && Array.isArray(left) === Array.isArray(right)) {
      for (const key of new Set([...Object.keys(left), ...Object.keys(right)])) {
        visit(
          left[key],
          right[key],
          `${path}/${escapePointer(key)}`,
          Object.hasOwn(left, key),
          Object.hasOwn(right, key),
        );
      }
      return;
    }
    const change = { path, before: leftPresent ? left : null, after: rightPresent ? right : null };
    if (!leftPresent) change.beforePresent = false;
    if (!rightPresent) change.afterPresent = false;
    if (leftPresent && rightPresent && typeof left === 'number' && typeof right === 'number') {
      const delta = right - left;
      demand(
        Number.isFinite(delta) && Math.abs(delta) <= Number.MAX_SAFE_INTEGER,
        'Comparison delta exceeds supported numeric range.',
      );
      change.delta = delta;
    }
    changes.push(change);
  }
  visit(before, after, '');
  return changes;
}
