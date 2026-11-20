// The bounded crafting allowlist shared by protocol validation, the demo, the planner, and criteria.
// Each recipe is the vanilla 1.21.1 shape reduced to ingredient counts per craft. An ingredient lists
// interchangeable items (a vanilla tag the recipe accepts); one craft consumes `count` of them in any mix.

const WOODS = ['oak', 'birch', 'spruce', 'jungle', 'acacia', 'dark_oak', 'cherry', 'mangrove'];
const id = (name) => `minecraft:${name}`;

/** Every plank type the shared `#minecraft:planks` recipes accept here. */
export const PLANKS = Object.freeze(WOODS.map((wood) => id(`${wood}_planks`)));
/** `#minecraft:stone_tool_materials` and `#minecraft:stone_crafting_materials` in 1.21.1. */
export const STONE_MATERIALS = Object.freeze(['cobblestone', 'blackstone', 'cobbled_deepslate'].map(id));
const STICK = Object.freeze({ items: [id('stick')], count: 2 });
const planks = (count) => ({ items: PLANKS, count });
const stone = (count) => ({ items: STONE_MATERIALS, count });

const entries = [
  ...WOODS.map((wood) => [
    `${wood}_planks`,
    { yield: 4, table: false, ingredients: [{ items: [id(`${wood}_log`)], count: 1 }] },
  ]),
  ['stick', { yield: 4, table: false, ingredients: [planks(2)] }],
  ['crafting_table', { yield: 1, table: false, ingredients: [planks(4)] }],
  [
    'torch',
    {
      yield: 4,
      table: false,
      ingredients: [
        { items: [id('coal'), id('charcoal')], count: 1 },
        { items: [id('stick')], count: 1 },
      ],
    },
  ],
  ['chest', { yield: 1, table: true, ingredients: [planks(8)] }],
  ['furnace', { yield: 1, table: true, ingredients: [stone(8)] }],
  ['wooden_pickaxe', { yield: 1, table: true, ingredients: [planks(3), STICK] }],
  ['wooden_axe', { yield: 1, table: true, ingredients: [planks(3), STICK] }],
  ['wooden_shovel', { yield: 1, table: true, ingredients: [planks(1), STICK] }],
  ['stone_pickaxe', { yield: 1, table: true, ingredients: [stone(3), STICK] }],
  ['stone_axe', { yield: 1, table: true, ingredients: [stone(3), STICK] }],
  ['stone_shovel', { yield: 1, table: true, ingredients: [stone(1), STICK] }],
];

/** Craftable outputs by namespaced item ID. */
export const RECIPES = Object.freeze(
  Object.fromEntries(entries.map(([name, recipe]) => [id(name), Object.freeze({ output: id(name), ...recipe })])),
);
/** Craftable outputs without the namespace, for help text and prompts. */
export const CRAFTABLE_ITEMS = Object.freeze(entries.map(([name]) => name));
/** The most output items one craft action may request. */
export const MAX_CRAFT_COUNT = 64;

/** How many crafts produce at least `count` of the recipe's output. */
export function craftsFor(recipe, count) {
  return Math.ceil(count / recipe.yield);
}

/**
 * Plans which held items `crafts` repetitions consume, taking interchangeable items in the listed order.
 * Returns `{ ok: true, consume: [{ name, count }] }`, or `{ ok: false, missing: [{ items, count }] }`
 * naming how many more of each ingredient group are needed.
 */
export function planCraft(recipe, crafts, inventory) {
  const held = new Map();
  for (const stack of inventory) held.set(stack.name, (held.get(stack.name) || 0) + stack.count);
  const consume = new Map();
  const missing = [];
  for (const ingredient of recipe.ingredients) {
    let needed = ingredient.count * crafts;
    for (const name of ingredient.items) {
      const taken = Math.min(needed, held.get(name) || 0);
      if (taken === 0) continue;
      held.set(name, held.get(name) - taken);
      consume.set(name, (consume.get(name) || 0) + taken);
      needed -= taken;
    }
    if (needed > 0) missing.push({ items: ingredient.items, count: needed });
  }
  if (missing.length) return { ok: false, missing };
  return { ok: true, consume: [...consume].map(([name, count]) => ({ name, count })) };
}

/** A readable list of missing ingredients, for example "2 more stick and 3 more of cobblestone/blackstone/...". */
export function describeMissing(missing) {
  return missing
    .map(({ items, count }) => {
      const names = items.map((name) => name.replace('minecraft:', ''));
      return names.length === 1 ? `${count} more ${names[0]}` : `${count} more of ${names.join('/')}`;
    })
    .join(' and ');
}
