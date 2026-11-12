import { registerOfflineGroups } from './offline-kit.js';
import { SPATIAL_GROUPS } from './planning-spatial.js';
import { RESOURCE_GROUPS } from './planning-resources.js';
import { ANALYSIS_GROUPS } from './planning-analysis.js';
import { COORDINATION_GROUPS } from './planning-coordination.js';

export const PLANNING_GROUPS = [
  ...SPATIAL_GROUPS, ...RESOURCE_GROUPS, ...ANALYSIS_GROUPS, ...COORDINATION_GROUPS,
];

export function registerPlanningTools(program, options) {
  registerOfflineGroups(program, PLANNING_GROUPS, options);
}
