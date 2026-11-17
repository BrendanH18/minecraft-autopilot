import { demand } from './offline-kit.js';
import { allowedKeys, cases, evaluate, validateRequest } from './planning-study-common.js';
import { pointerTokens, select, score, scalarType, ascending } from './planning-study-selection.js';

// -0 === 0, so both zeros are reported as 0.
const plain = (value) => (value === 0 ? 0 : value);

function describe(scores) {
  const sorted = [...scores].sort(ascending);
  const minimum = sorted[0],
    maximum = sorted.at(-1);
  // An odd count has one middle score, so both positions name it.
  const lower = sorted[(sorted.length - 1) >> 1],
    upper = sorted[sorted.length >> 1];
  // Neumaier summation in source order: the correction keeps the rounding error
  // of the smaller addend, so it survives a large score cancelling another.
  let total = 0,
    correction = 0;
  for (const value of scores) {
    const next = total + value;
    correction += Math.abs(total) >= Math.abs(value) ? total - next + value : value - next + total;
    total = next;
  }
  const sum = total + correction;
  return {
    minimum,
    maximum,
    range: maximum - minimum,
    sum,
    mean: sum / scores.length,
    median: lower + (upper - lower) / 2,
  };
}

export function runSummarize(group, command, request) {
  validateRequest(request);
  allowedKeys(request, ['cases', 'path', 'measure']);
  const rows = cases(request.cases);
  const { path = '', measure = 'value' } = request;
  const tokens = pointerTokens(path);
  demand(measure === 'value' || measure === 'length', 'Measure must be value or length.');
  const candidates = rows.map((args, index) => {
    const result = evaluate(group, command, args);
    return { case: index + 1, args: [...args], result, score: plain(score(select(result, tokens), measure)) };
  });
  const scoreType = scalarType(candidates[0].score);
  demand(
    candidates.every((candidate) => scalarType(candidate.score) === scoreType),
    'Summary scores must all have the same scalar type; null only matches null.',
  );
  // Map keys keep first-seen order, so each group lists its cases in source order.
  const groups = new Map();
  for (const candidate of candidates) {
    if (!groups.has(candidate.score)) groups.set(candidate.score, { value: candidate.score, count: 0, cases: [] });
    const entry = groups.get(candidate.score);
    entry.count++;
    entry.cases.push(candidate.case);
  }
  return {
    path,
    measure,
    total: candidates.length,
    scoreType,
    values: [...groups.values()].sort((a, b) => ascending(a.value, b.value)),
    statistics: scoreType === 'number' ? describe(candidates.map((candidate) => candidate.score)) : null,
    cases: candidates,
  };
}
