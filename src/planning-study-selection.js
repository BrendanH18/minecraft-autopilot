import { demand } from './offline-kit.js';

// A selector is data, never a JavaScript expression. Empty means the result itself.
export function pointerTokens(path) {
  demand(typeof path === 'string' && (path === '' || path.startsWith('/')), 'Path must be a JSON Pointer (empty or starting with /).');
  return path === '' ? [] : path.slice(1).split('/').map(token => {
    demand(!/~(?:[^01]|$)/.test(token), 'JSON Pointer escapes must be ~0 or ~1.');
    return token.replace(/~1/g, '/').replace(/~0/g, '~');
  });
}

export function select(result, tokens) {
  let selected = result;
  for (const token of tokens) {
    demand(selected !== null && typeof selected === 'object', 'Result path does not exist in every result.');
    demand(!Array.isArray(selected) || /^(?:0|[1-9]\d*)$/.test(token), 'Array paths require canonical zero-based indexes.');
    demand(Object.hasOwn(selected, token), 'Result path does not exist in every result.');
    selected = selected[token];
  }
  return selected;
}

// Scores compare only within one scalar type; null is its own type.
export const scalarType = value => value === null ? 'null' : typeof value;
// Numbers numerically, strings by code unit, false before true; nulls are equal.
export const ascending = (a, b) => a < b ? -1 : a > b ? 1 : 0;

export function score(value, measure) {
  if (measure === 'length') {
    demand(typeof value === 'string' || value !== null && typeof value === 'object', 'Length requires a string, array, or object.');
    return typeof value === 'string' || Array.isArray(value) ? value.length : Object.keys(value).length;
  }
  demand(value === null || ['number', 'string', 'boolean'].includes(typeof value), 'Value selection requires a scalar or null; choose a path or length.');
  return value;
}

