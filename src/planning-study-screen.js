import { demand } from './offline-kit.js';
import { allowedKeys, cases, evaluate, validateRequest } from './planning-study-common.js';
import { pointerTokens, select, score } from './planning-study-selection.js';

const scalarType = value => value === null ? 'null' : typeof value;
const operators = Object.freeze({
  eq: (actual, expected) => actual === expected,
  ne: (actual, expected) => actual !== expected,
  lt: (actual, expected) => actual < expected,
  lte: (actual, expected) => actual <= expected,
  gt: (actual, expected) => actual > expected,
  gte: (actual, expected) => actual >= expected,
});

export function runScreen(group, command, request) {
  validateRequest(request);
  allowedKeys(request, ['cases', 'criteria']);
  const rows = cases(request.cases);
  demand(Array.isArray(request.criteria) && request.criteria.length >= 1 && request.criteria.length <= 20,
    'Supply 1–20 screening criteria.');
  const criteria = request.criteria.map(criterion => {
    demand(criterion && typeof criterion === 'object' && !Array.isArray(criterion), 'Each criterion must be an object.');
    allowedKeys(criterion, ['path', 'measure', 'op', 'value']);
    const { path = '', measure = 'value', op, value } = criterion;
    pointerTokens(path);
    demand(measure === 'value' || measure === 'length', 'Measure must be value or length.');
    demand(typeof op === 'string' && Object.hasOwn(operators, op), 'Operator must be eq, ne, lt, lte, gt, or gte.');
    demand(value === null || ['number', 'string', 'boolean'].includes(typeof value), 'Criterion value must be a scalar or null.');
    demand((op === 'eq' || op === 'ne') || typeof value === 'number', 'Ordered criteria require numeric values.');
    demand(measure !== 'length' || typeof value === 'number', 'Length criteria require numeric values.');
    return { path, measure, op, value };
  });
  const selectors = criteria.map(criterion => pointerTokens(criterion.path));
  const candidates = rows.map((args, index) => {
    const result = evaluate(group, command, args);
    // Build every check before deciding the case, so a failed condition never
    // hides an invalid selector or incompatible value in a later condition.
    const checks = criteria.map((criterion, criterionIndex) => {
      const actual = score(select(result, selectors[criterionIndex]), criterion.measure);
      demand(scalarType(actual) === scalarType(criterion.value), 'Screening values must have the same scalar type; null only compares with null.');
      return { criterion: criterionIndex + 1, actual, passed: operators[criterion.op](actual, criterion.value) };
    });
    return { case: index + 1, args: [...args], result, passed: checks.every(check => check.passed), checks };
  });
  const passed = candidates.filter(candidate => candidate.passed).length;
  return { criteria, total: candidates.length, passed, failed: candidates.length - passed, cases: candidates };
}
