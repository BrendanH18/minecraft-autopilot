import { registerOfflineGroups } from './offline-kit.js';
import { SPATIAL_GROUPS } from './planning-spatial.js';
import { RESOURCE_GROUPS } from './planning-resources.js';
import { ANALYSIS_GROUPS } from './planning-analysis.js';
import { COORDINATION_GROUPS } from './planning-coordination.js';
import { STRUCTURE_GROUPS } from './planning-structures.js';
import { OPERATION_GROUPS } from './planning-operations.js';

// Batch 10: the original 40 groups of 25 typed planners.
export const PLANNING_GROUPS = [
  ...SPATIAL_GROUPS, ...RESOURCE_GROUPS, ...ANALYSIS_GROUPS, ...COORDINATION_GROUPS,
];

// Batch 13: eight further groups of 25 typed planners.
export const EXTENSION_GROUPS = [...STRUCTURE_GROUPS, ...OPERATION_GROUPS];

// Every typed planner. Study workflows apply to all of them.
export const ALL_PLANNING_GROUPS = [...PLANNING_GROUPS, ...EXTENSION_GROUPS];

export function registerPlanningTools(program, options) {
  registerOfflineGroups(program, PLANNING_GROUPS, options);
}

export function registerPlanningExtensions(program, options) {
  registerOfflineGroups(program, EXTENSION_GROUPS, options);
}
