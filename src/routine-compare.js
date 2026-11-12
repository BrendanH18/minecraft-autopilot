import { loadRoutine, parseRoutine } from './routine.js';
import { navNumber } from './navigation.js';

const validate = actions => parseRoutine(JSON.stringify(actions));
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const key = a => JSON.stringify(a);
const axes = ['x', 'y', 'z'];
const NOTE = 'Static requested actions only; outcomes, terrain, dimensions, initial inventory, and execution times are unknown. Explicit deposit totals exclude deposit-all quantities.';
const sum = (actions, type, field) => actions.reduce((n, a) => n + (a.type === type ? a[field] ?? 0 : 0), 0);
const delta = (before, after) => ({ before, after, delta: after - before });
function counts(actions, getKey) {
  const result = new Map();
  for (const a of actions) { const name = getKey(a); if (name !== null) result.set(name, (result.get(name) ?? 0) + 1); }
  return result;
}
function countDelta(a, b) {
  return [...new Set([...a.keys(), ...b.keys()])].sort().map(name => ({ name, ...delta(a.get(name) ?? 0, b.get(name) ?? 0) }));
}
function quotas(actions, type, field) {
  const result = new Map();
  for (const a of actions) if (a.type === type) result.set(a[field], (result.get(a[field]) ?? 0) + (a.count ?? 0));
  return result;
}
function subsequence(a, b) {
  const grid = Array.from({ length: a.length + 1 }, () => Array(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--) for (let j = b.length - 1; j >= 0; j--) grid[i][j] = equal(a[i], b[j]) ? 1 + grid[i + 1][j + 1] : Math.max(grid[i + 1][j], grid[i][j + 1]);
  const matches = []; let i = 0, j = 0;
  while (i < a.length && j < b.length) {
    if (equal(a[i], b[j])) { matches.push({ beforeStep: ++i, afterStep: ++j, action: a[i - 1] }); }
    else if (grid[i + 1][j] >= grid[i][j + 1]) i++;
    else j++;
  }
  return matches;
}
function inventory(actions, filter) {
  return counts(actions.filter(filter), key);
}
function actionsByMultiplicity(a, b, mode) {
  const ac = inventory(a, () => true), bc = inventory(b, () => true);
  return [...new Set([...ac.keys(), ...bc.keys()])].sort().flatMap(name => {
    const before = ac.get(name) ?? 0, after = bc.get(name) ?? 0;
    const count = mode === 'added-actions' ? Math.max(0, after - before) : mode === 'removed-actions' ? Math.max(0, before - after) : Math.min(before, after);
    return count ? [{ action: JSON.parse(name), count }] : [];
  });
}
function setDelta(a, b) {
  return { added: [...b].filter(k => !a.has(k)).sort(), removed: [...a].filter(k => !b.has(k)).sort(), shared: [...a].filter(k => b.has(k)).sort() };
}
function policy(actions, inspections = false) {
  let established = false, uncovered = 0;
  for (const a of actions) {
    if (a.type === (inspections ? 'inspect_storage' : 'set_home')) established = true;
    if (a.type === (inspections ? 'deposit' : 'home') && !established) uncovered++;
  }
  return inspections ? { inspections: actions.filter(a => a.type === 'inspect_storage').length, depositsBeforeFirstInspection: uncovered }
    : { definitions: actions.filter(a => a.type === 'set_home').length, returnsBeforeFirstDefinition: uncovered };
}

/** Compares canonical protocol actions. Positional and multiset comparisons are explicitly separate. */
export function compareRoutines(before, after, command, ...args) {
  before = validate(before); after = validate(after);
  const aligned = () => Array.from({ length: Math.max(before.length, after.length) }, (_, i) => ({ step: i + 1, before: before[i] ?? null, after: after[i] ?? null })).filter(p => !equal(p.before, p.after));
  let result;
  switch (command) {
    case 'aligned': result = { changes: aligned() }; break;
    case 'prefix': { let n = 0; while (n < Math.min(before.length, after.length) && equal(before[n], after[n])) n++; result = { steps: n, actions: before.slice(0, n) }; break; }
    case 'suffix': { let n = 0; while (n < Math.min(before.length, after.length) && equal(before.at(-1 - n), after.at(-1 - n))) n++; result = { steps: n, beforeStart: n ? before.length - n + 1 : null, afterStart: n ? after.length - n + 1 : null, actions: n ? before.slice(-n) : [] }; break; }
    case 'lcs': { const matches = subsequence(before, after); result = { length: matches.length, matches }; break; }
    case 'edit-script': {
      const matches = subsequence(before, after), oldSteps = new Set(matches.map(p => p.beforeStep)), newSteps = new Set(matches.map(p => p.afterStep));
      result = { retained: matches, removed: before.flatMap((action, i) => oldSteps.has(i + 1) ? [] : [{ step: i + 1, action }]), inserted: after.flatMap((action, i) => newSteps.has(i + 1) ? [] : [{ step: i + 1, action }]) }; break;
    }
    case 'type-counts': result = { types: countDelta(counts(before, a => a.type), counts(after, a => a.type)) }; break;
    case 'collection-delta': result = { items: countDelta(quotas(before, 'collect', 'block'), quotas(after, 'collect', 'block')) }; break;
    case 'deposit-delta': result = { items: countDelta(quotas(before, 'deposit', 'item'), quotas(after, 'deposit', 'item')), depositAll: countDelta(counts(before.filter(a => a.type === 'deposit' && a.count === undefined), a => a.item), counts(after.filter(a => a.type === 'deposit' && a.count === undefined), a => a.item)) }; break;
    case 'wait-delta': result = { seconds: delta(sum(before, 'wait', 'seconds'), sum(after, 'wait', 'seconds')), longest: delta(Math.max(0, ...before.filter(a => a.type === 'wait').map(a => a.seconds)), Math.max(0, ...after.filter(a => a.type === 'wait').map(a => a.seconds))) }; break;
    case 'destination-pairs': {
      const a = before.flatMap((action, i) => action.type === 'goto' ? [{ step: i + 1, action }] : []), b = after.flatMap((action, i) => action.type === 'goto' ? [{ step: i + 1, action }] : []);
      result = { pairs: Array.from({ length: Math.max(a.length, b.length) }, (_, i) => ({ destination: i + 1, before: a[i] ?? null, after: b[i] ?? null, displacement: a[i] && b[i] ? Object.fromEntries(axes.map(k => [k, b[i].action[k] - a[i].action[k]])) : null, distance: a[i] && b[i] ? Math.hypot(...axes.map(k => b[i].action[k] - a[i].action[k])) : null })) }; break;
    }
    case 'type-sequence': result = { same: equal(before.map(a => a.type), after.map(a => a.type)), before: before.map(a => a.type), after: after.map(a => a.type) }; break;
    case 'added-actions': case 'removed-actions': case 'shared-actions': result = { actions: actionsByMultiplicity(before, after, command), orderConsidered: false }; break;
    case 'changed-fields': result = { changes: aligned().filter(p => p.before && p.after && p.before.type === p.after.type).map(p => ({ step: p.step, type: p.before.type, fields: [...new Set([...Object.keys(p.before), ...Object.keys(p.after)])].filter(k => p.before[k] !== p.after[k]).map(field => ({ field, before: p.before[field] ?? null, after: p.after[field] ?? null })) })) }; break;
    case 'first-divergence': result = { change: aligned()[0] ?? null }; break;
    case 'last-divergence': result = { change: aligned().at(-1) ?? null }; break;
    case 'step-ratio': result = { ...delta(before.length, after.length), ratio: after.length / before.length }; break;
    case 'item-set': result = setDelta(new Set(before.flatMap(a => a.block || a.item ? [a.block ?? a.item] : [])), new Set(after.flatMap(a => a.block || a.item ? [a.block ?? a.item] : []))); break;
    case 'transition-delta': { const transitions = a => counts(a.slice(1).map((v, i) => `${a[i].type}->${v.type}`), v => v); result = { transitions: countDelta(transitions(before), transitions(after)) }; break; }
    case 'chunk-set': { const chunks = a => new Set(a.filter(p => p.type === 'goto').map(p => `${Math.floor(p.x / 16)},${Math.floor(p.z / 16)}`)); result = setDelta(chunks(before), chunks(after)); break; }
    case 'altitude-envelope': { const envelope = a => { const ys = a.filter(p => p.type === 'goto').map(p => p.y); return ys.length ? { minimum: Math.min(...ys), maximum: Math.max(...ys) } : null; }; result = { before: envelope(before), after: envelope(after) }; break; }
    case 'home-policy': result = { before: policy(before), after: policy(after) }; break;
    case 'inspection-policy': result = { before: policy(before, true), after: policy(after, true) }; break;
    case 'budget': {
      if (args.length !== 3) throw new Error('Give extra-step, extra-wait, and extra-collection ceilings.');
      const limits = args.map(navNumber); if (limits.some(n => n < 0) || !Number.isSafeInteger(limits[0])) throw new Error('Ceilings must be nonnegative; extra steps must be an integer.');
      const changes = [after.length - before.length, sum(after, 'wait', 'seconds') - sum(before, 'wait', 'seconds'), sum(after, 'collect', 'count') - sum(before, 'collect', 'count')];
      result = { passes: changes.every((n, i) => n <= limits[i]), extraSteps: changes[0], extraWaitSeconds: changes[1], extraCollection: changes[2], limits: { steps: limits[0], waitSeconds: limits[1], collection: limits[2] } }; break;
    }
    default: throw new Error(`Unknown routine comparison: ${command}.`);
  }
  return { ...result, note: NOTE };
}

export const COMPARE_ROUTINES_COMMANDS = [
  ['aligned', 'List unequal actions at the same absolute step.'],
  ['prefix', 'Find the longest identical starting sequence.'],
  ['suffix', 'Find the longest identical ending sequence.'],
  ['lcs', 'Locate a longest identical subsequence with both step numbers.'],
  ['edit-script', 'Separate retained, inserted, and removed steps using a longest subsequence.'],
  ['type-counts', 'Compare action-type occurrence counts.'],
  ['collection-delta', 'Compare total requested collection by item.'],
  ['deposit-delta', 'Compare explicit deposit totals and deposit-all counts separately.'],
  ['wait-delta', 'Compare total and longest explicit waits.'],
  ['destination-pairs', 'Pair destinations by occurrence and measure displacement.'],
  ['type-sequence', 'Compare action ordering independently of parameters.'],
  ['added-actions', 'Find additional action multiplicities regardless of order.'],
  ['removed-actions', 'Find lost action multiplicities regardless of order.'],
  ['shared-actions', 'Find common action multiplicities regardless of order.'],
  ['changed-fields', 'Compare fields of aligned actions sharing a type.'],
  ['first-divergence', 'Locate the earliest positional mismatch.'],
  ['last-divergence', 'Locate the latest positional mismatch.'],
  ['step-ratio', 'Compare routine lengths and their ratio.'],
  ['item-set', 'Compare mentioned item identities.'],
  ['transition-delta', 'Compare adjacent action-type transition counts.'],
  ['chunk-set', 'Compare horizontal chunks mentioned by goto coordinates.'],
  ['altitude-envelope', 'Compare minimum and maximum requested goto heights.'],
  ['home-policy', 'Compare home definitions and returns preceding a definition.'],
  ['inspection-policy', 'Compare inspections and deposits before the first inspection.'],
  ['budget', 'Check increases in steps, explicit waits, and requested collection against ceilings.'],
].map(([name, description]) => [`${name} <before> <after>${name === 'budget' ? ' <extra-steps> <extra-wait> <extra-collect>' : ''}`, description]);

export function registerRoutineCompare(program, { print }) {
  const group = program.command('compare-routines').description('Compare two validated routine files offline; never executes or writes inputs.');
  for (const [signature, description] of COMPARE_ROUTINES_COMMANDS) {
    const name = signature.split(' ')[0];
    group.command(signature).description(description).action(async (...values) => {
      const [before, after, ...args] = values.slice(0, -2);
      print(compareRoutines(await loadRoutine(before), await loadRoutine(after), name, ...args));
    });
  }
  return group;
}
