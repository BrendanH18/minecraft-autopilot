import { demand } from './offline-kit.js';
import { allowedKeys, evaluate, validateRequest } from './planning-study-common.js';
import { replacements } from './planning-study-parameters.js';

const LIMIT = 100;

export function runFactorial(group, command, request) {
  validateRequest(request);
  allowedKeys(request, ['args', 'axes']);
  // Like sweep: the base row must be valid even if every axis replaces it.
  evaluate(group, command, request.args);
  demand(Array.isArray(request.axes) && request.axes.length >= 1 && request.axes.length <= 10,
    'Supply 1–10 factorial axes.');
  const indexes = new Set();
  const axes = request.axes.map(axis => {
    demand(axis && typeof axis === 'object' && !Array.isArray(axis), 'Each axis must be an object.');
    allowedKeys(axis, ['index', 'values']);
    const values = replacements(request.args, axis.index, axis.values).map(row => row.value);
    demand(!indexes.has(axis.index), 'Factorial axis indexes must be unique.');
    indexes.add(axis.index);
    return { index: axis.index, values };
  });
  // Every axis and the total are checked before any combination is evaluated.
  demand(axes.reduce((product, axis) => product * axis.values.length, 1) <= LIMIT,
    'Factorial studies are limited to 100 combinations.');
  // Row-major order: the first axis varies slowest and the last varies fastest.
  let combinations = [[]];
  for (const axis of axes) {
    combinations = combinations.flatMap(chosen => axis.values.map(value => [...chosen, value]));
  }
  const cases = combinations.map((values, number) => {
    const args = [...request.args];
    axes.forEach((axis, position) => { args[axis.index - 1] = values[position]; });
    return { case: number + 1, values, args, result: evaluate(group, command, args) };
  });
  return { axes, total: cases.length, cases };
}
