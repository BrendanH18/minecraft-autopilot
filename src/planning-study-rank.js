import { demand } from './offline-kit.js';
import { allowedKeys, cases, evaluate, validateRequest } from './planning-study-common.js';

// A selector is data, never a JavaScript expression. Empty means the result itself.
function pointerTokens(path) {
  demand(typeof path === 'string' && (path === '' || path.startsWith('/')), 'Path must be a JSON Pointer (empty or starting with /).');
  return path === '' ? [] : path.slice(1).split('/').map(token => {
    demand(!/~(?:[^01]|$)/.test(token), 'JSON Pointer escapes must be ~0 or ~1.');
    return token.replace(/~1/g, '/').replace(/~0/g, '~');
  });
}

function select(result, tokens) {
  let selected = result;
  for (const token of tokens) {
    demand(selected !== null && typeof selected === 'object', 'Ranking path does not exist in every result.');
    demand(!Array.isArray(selected) || /^(?:0|[1-9]\d*)$/.test(token), 'Array paths require canonical zero-based indexes.');
    demand(Object.hasOwn(selected, token), 'Ranking path does not exist in every result.');
    selected = selected[token];
  }
  return selected;
}

function score(value, measure) {
  if (measure === 'length') {
    demand(typeof value === 'string' || value !== null && typeof value === 'object', 'Length requires a string, array, or object.');
    return typeof value === 'string' || Array.isArray(value) ? value.length : Object.keys(value).length;
  }
  demand(value === null || ['number', 'string', 'boolean'].includes(typeof value), 'Value ranking requires a scalar or null; choose a path or length.');
  return value;
}

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
  const scoreType = value => value === null ? 'null' : typeof value;
  demand(candidates.every(candidate => scoreType(candidate.score) === scoreType(candidates[0].score)), 'Ranking scores must all have the same scalar type; null only ties null.');
  candidates.sort((a, b) => {
    const order = a.score < b.score ? -1 : a.score > b.score ? 1 : 0;
    return order * (direction === 'min' ? 1 : -1) || a.case - b.case;
  });
  return {
    direction, path, measure, total: candidates.length,
    ranked: candidates.slice(0, limit).map((candidate, index) => ({ rank: index + 1, ...candidate })),
  };
}
