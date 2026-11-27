// Entry point of @minecraft-autopilot/planners. The core CLI (src/cli.js) imports this module dynamically, and only
// for commands it doesn't define itself, so core commands never load it and run without the package installed.
export { TOOL_GROUPS, registerToolGroups } from './tool-groups.js';

// The planners and study workflows are the largest modules. The CLI registers them only when the command is still
// unknown after the tool groups, which keeps root help and unknown-command suggestions complete.
export async function registerPlanners(program, context) {
  const [planning, studies] = await Promise.all([import('./planning-tools.js'), import('./planning-studies.js')]);
  planning.registerPlanningTools(program, context);
  planning.registerPlanningExtensions(program, context);
  planning.registerBuildPlanningTools(program, context);
  studies.registerPlanningStudies(program, context);
}
