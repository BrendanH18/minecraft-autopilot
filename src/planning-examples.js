import { calculateOffline, demand } from './offline-kit.js';
import { ANALYSIS_EXAMPLES } from './planning-examples-analysis.js';
import { constructionCases } from './planning-examples-construction.js';
import { greenhouseCases, orchardCases } from './planning-examples-gardens.js';
import { canalCases, tunnelCases } from './planning-examples-infrastructure.js';
import { RESOURCE_EXAMPLES } from './planning-examples-resources.js';
import { SPATIAL_EXAMPLES } from './planning-examples-spatial.js';
import { brewingCases, furnaceCases } from './planning-examples-stations.js';
import { waterwayCases } from './planning-examples-waterways.js';
import { resolvePlanner } from './planning-study-common.js';

const buildExamples = {
  ...Object.fromEntries(
    Object.entries(constructionCases).map(([group, cases]) => [
      group,
      Object.entries(cases).map(([command, [args, expected]]) => [command, args, expected]),
    ]),
  ),
  'tunnel-vent': tunnelCases,
  'canal-lock': canalCases,
  ...waterwayCases,
  'furnace-bank': furnaceCases,
  'brewing-bench': brewingCases,
  orchardplan: orchardCases,
  greenhouse: greenhouseCases,
};

const examples = [
  ...SPATIAL_EXAMPLES,
  ...RESOURCE_EXAMPLES,
  ...ANALYSIS_EXAMPLES,
  ...Object.entries(buildExamples).flatMap(([group, cases]) => cases.map((entry) => [group, ...entry])),
];

export function listPlanningExamples(groupName) {
  const matches = groupName === undefined ? examples : examples.filter(([group]) => group === groupName);
  demand(matches.length > 0, `No worked examples for group: ${groupName}. Run study examples to list them.`);
  return matches.map(([group, command]) => ({ group, command }));
}

export function runPlanningExample(group, command) {
  const entry = examples.find(([exampleGroup, exampleCommand]) => exampleGroup === group && exampleCommand === command);
  demand(entry, `No worked example for ${group} ${command}. Run study examples to list them.`);
  const [, , args, expected] = entry;
  const report = calculateOffline(resolvePlanner(group, command), command, args);
  return { group, command, args: structuredClone(args), expected: structuredClone(expected), ...report };
}
