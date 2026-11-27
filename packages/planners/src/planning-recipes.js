import { demand } from './offline-kit.js';
import { analysisRecipes } from './planning-recipes-analysis.js';
import { coordinationRecipes } from './planning-recipes-coordination.js';
import { resourceRecipes } from './planning-recipes-resources.js';
import { spatialRecipes } from './planning-recipes-spatial.js';

const recipes = { ...spatialRecipes, ...resourceRecipes, ...analysisRecipes, ...coordinationRecipes };

function recipeGroup(group) {
  demand(Object.hasOwn(recipes, group), `Unknown recipe group: ${group}. Run study recipes to list groups.`);
  return recipes[group];
}

export function listRecipes(group) {
  const groups = group === undefined ? Object.entries(recipes) : [[group, recipeGroup(group)]];
  return groups.flatMap(([name, entries]) =>
    Object.entries(entries).map(([command, { purpose }]) => ({ group: name, command, purpose })),
  );
}

export function findRecipe(group, command) {
  const entries = recipeGroup(group);
  demand(
    Object.hasOwn(entries, command),
    `Unknown recipe: ${group} ${command}. Run study recipes ${group} to list recipes.`,
  );
  return structuredClone(entries[command]);
}
