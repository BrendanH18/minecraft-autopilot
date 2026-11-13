import { demand } from './offline-kit.js';
import { allowedKeys, cases, evaluate, validateRequest } from './planning-study-common.js';
import { pointerTokens, select, score, scalarType, ascending } from './planning-study-selection.js';

export function runPareto(group, command, request) {
  validateRequest(request);
  allowedKeys(request, ['cases', 'objectives']);
  const rows = cases(request.cases);
  demand(Array.isArray(request.objectives) && request.objectives.length >= 1 && request.objectives.length <= 10,
    'Supply 1–10 objectives.');
  // Every objective is checked before any case is evaluated.
  const objectives = request.objectives.map(objective => {
    demand(objective && typeof objective === 'object' && !Array.isArray(objective), 'Each objective must be an object.');
    allowedKeys(objective, ['path', 'measure', 'direction']);
    const { path = '', measure = 'value', direction } = objective;
    pointerTokens(path);
    demand(measure === 'value' || measure === 'length', 'Measure must be value or length.');
    demand(direction === 'min' || direction === 'max', 'Direction must be min or max.');
    return { path, measure, direction };
  });
  const selectors = objectives.map(objective => pointerTokens(objective.path));
  // Every score is built before dominance is judged, so a dominated case never
  // hides an invalid selector or a mixed score type in a later case or objective.
  const candidates = rows.map((args, index) => {
    const result = evaluate(group, command, args);
    const scores = objectives.map((objective, position) => score(select(result, selectors[position]), objective.measure));
    return { case: index + 1, args: [...args], result, scores };
  });
  demand(candidates.every(candidate => candidate.scores.every((value, position) =>
    scalarType(value) === scalarType(candidates[0].scores[position]))),
  'Objective scores must all have the same scalar type; null only matches null.');
  // One entry per objective: positive where a is better than b, negative where worse.
  const advantages = (a, b) => objectives.map((objective, position) =>
    ascending(a.scores[position], b.scores[position]) * (objective.direction === 'max' ? 1 : -1));
  // At least as good everywhere and better somewhere; identical rows never dominate.
  const dominates = (a, b) => {
    const edges = advantages(a, b);
    return edges.every(edge => edge >= 0) && edges.some(edge => edge > 0);
  };
  const judged = candidates.map(candidate => {
    const dominatedBy = candidates.filter(other => dominates(other, candidate)).map(other => other.case);
    return { ...candidate, dominated: dominatedBy.length > 0, dominatedBy };
  });
  return {
    objectives, total: judged.length,
    front: judged.filter(candidate => !candidate.dominated).map(candidate => candidate.case),
    cases: judged,
  };
}
