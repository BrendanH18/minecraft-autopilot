import { allowedKeys, cases, changesBetween, evaluate, validateRequest } from './planning-study-common.js';

export function runBatch(group, command, request) {
  validateRequest(request);
  allowedKeys(request, ['cases']);
  return {
    cases: cases(request.cases).map((args, index) => ({
      case: index + 1,
      args: [...args],
      result: evaluate(group, command, args),
    })),
  };
}

export function runCompare(group, command, request) {
  validateRequest(request);
  allowedKeys(request, ['baseline', 'candidates']);
  const baseline = { args: [...cases([request.baseline])[0]], result: evaluate(group, command, request.baseline) };
  return {
    baseline,
    candidates: cases(request.candidates).map((args, index) => {
      const result = evaluate(group, command, args);
      return { case: index + 1, args: [...args], result, changes: changesBetween(baseline.result, result) };
    }),
  };
}
