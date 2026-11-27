/** Pure bounded inputs for offline spatial estimates. */
export function numeric(v, min = -1e6, max = 1e6, integer = false) {
  if (!['number', 'string'].includes(typeof v) || String(v).trim() === '') throw new Error('Use a finite number.');
  const n = Number(v);
  if (!Number.isFinite(n) || n < min || n > max || (integer && !Number.isSafeInteger(n)))
    throw new Error(`Expected ${integer ? 'an integer' : 'a number'} from ${min} to ${max}.`);
  return n;
}
export const positive = (v) => numeric(v, 0.000001);
export const count = (v) => numeric(v, 0, 1e6, true);
export const size = (v) => numeric(v, 1, 1e6, true);
export const radians = (v) => (numeric(v, -360000, 360000) * Math.PI) / 180;
export const wrap = (v) => ((v % 360) + 360) % 360;
export function sequence(n, fn) {
  if (!Number.isSafeInteger(n) || n < 0 || n > 1000) throw new Error('Output is limited to 1000 entries.');
  return Array.from({ length: n }, (_, i) => fn(i));
}
export function checked(value) {
  if (typeof value === 'number' && (!Number.isFinite(value) || Math.abs(value) > Number.MAX_SAFE_INTEGER))
    throw new Error('Result exceeds supported numeric range.');
  if (value && typeof value === 'object') for (const v of Object.values(value)) checked(v);
  return value;
}
