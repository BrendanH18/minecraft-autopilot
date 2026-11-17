import { demand } from './offline-kit.js';
import { allowedKeys, cases, evaluate, validateRequest } from './planning-study-common.js';

import { pointerTokens, select, score, scalarType, ascending } from './planning-study-selection.js';

export function runRank(group, command, request) {
  validateRequest(request);
  allowedKeys(request, ['cases', 'path', 'direction', 'measure', 'limit']);
  const rows = cases(request.cases);
  const { path = '', direction, measure = 'value', limit = rows.length } = request;
  demand(direction === 'min' || direction === 'max', 'Direction must be min or max.');
  demand(measure === 'value' || measure === 'length', 'Measure must be value or length.');
  demand(Number.isSafeInteger(limit) && limit >= 1 && limit <= 100, 'Limit must be a whole number from 1 to 100.');
  const tokens = pointerTokens(path);
  const candidates = rows.map((args, index) => {
    const result = evaluate(group, command, args);
    return { case: index + 1, args: [...args], result, score: score(select(result, tokens), measure) };
  });
  demand(
    candidates.every((candidate) => scalarType(candidate.score) === scalarType(candidates[0].score)),
    'Ranking scores must all have the same scalar type; null only ties null.',
  );
  candidates.sort((a, b) => ascending(a.score, b.score) * (direction === 'min' ? 1 : -1) || a.case - b.case);
  return {
    direction,
    path,
    measure,
    total: candidates.length,
    ranked: candidates.slice(0, limit).map((candidate, index) => ({ rank: index + 1, ...candidate })),
  };
}
