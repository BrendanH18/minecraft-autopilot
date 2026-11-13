import { demand } from './offline-kit.js';
import { evaluate, changesBetween, validateRequest, allowedKeys } from './planning-study-common.js';

function replacements(args, index, values) {
  demand(Number.isSafeInteger(index) && index >= 1 && index <= args.length,
    'Replacement indexes must be one-based argument positions.');
  demand(Array.isArray(values) && values.length >= 1 && values.length <= 100,
    'Supply 1–100 replacement values.');
  return values.map(value => {
    demand(typeof value === 'number' || typeof value === 'string',
      'Replacement values must be numbers or argument strings.');
    const next = [...args];
    next[index - 1] = value;
    return { value, args: next };
  });
}

export function runSweep(group, command, request) {
  validateRequest(request);
  allowedKeys(request, ['args', 'index', 'values']);
  evaluate(group, command, request.args);
  const variants = replacements(request.args, request.index, request.values);
  return {
    cases: variants.map((variant, i) => ({
      case: i + 1, ...variant, result: evaluate(group, command, variant.args),
    })),
  };
}

export function runSensitivity(group, command, request) {
  validateRequest(request);
  allowedKeys(request, ['args', 'changes']);
  const baselineResult = evaluate(group, command, request.args);
  const baseline = { args: [...request.args], result: baselineResult };
  demand(Array.isArray(request.changes) && request.changes.length >= 1 && request.changes.length <= 100,
    'Supply 1–100 argument changes.');
  const indexes = new Set();
  const variants = [];
  for (const change of request.changes) {
    validateRequest(change);
    allowedKeys(change, ['index', 'values']);
    demand(!indexes.has(change.index), 'Sensitivity argument indexes must be unique.');
    indexes.add(change.index);
    const rows = replacements(request.args, change.index, change.values);
    demand(variants.length + rows.length <= 100,
      'Sensitivity studies are limited to 100 replacement cases.');
    variants.push(...rows.map(row => ({ index: change.index, ...row })));
  }
  return {
    baseline,
    cases: variants.map((variant, i) => {
      const result = evaluate(group, command, variant.args);
      return { case: i + 1, ...variant, result, changes: changesBetween(baseline.result, result) };
    }),
  };
}
