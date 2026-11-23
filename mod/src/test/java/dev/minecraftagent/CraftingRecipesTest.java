package dev.minecraftagent;

import static org.junit.jupiter.api.Assertions.*;

import com.google.gson.Gson;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.junit.jupiter.api.Test;

class CraftingRecipesTest {
    private static final String OAK = "minecraft:oak_planks";
    private static final String BIRCH = "minecraft:birch_planks";
    private static final String STICK = "minecraft:stick";
    private static final String COBBLE = "minecraft:cobblestone";

    private static CraftingRecipes.Cell cell(int slot, int ingredient) {
        return new CraftingRecipes.Cell(slot, ingredient);
    }

    private static CraftingRecipes.Click click(int slot, int button) {
        return new CraftingRecipes.Click(slot, button);
    }

    @Test
    void allowsOnlySupportedOutputs() {
        assertEquals(
                List.of(
                        "minecraft:oak_planks",
                        "minecraft:birch_planks",
                        "minecraft:spruce_planks",
                        "minecraft:jungle_planks",
                        "minecraft:acacia_planks",
                        "minecraft:dark_oak_planks",
                        "minecraft:cherry_planks",
                        "minecraft:mangrove_planks",
                        "minecraft:stick",
                        "minecraft:crafting_table",
                        "minecraft:torch",
                        "minecraft:chest",
                        "minecraft:furnace",
                        "minecraft:wooden_pickaxe",
                        "minecraft:wooden_axe",
                        "minecraft:wooden_shovel",
                        "minecraft:stone_pickaxe",
                        "minecraft:stone_axe",
                        "minecraft:stone_shovel"),
                CraftingRecipes.outputs());
        assertSame(CraftingRecipes.get("stick"), CraftingRecipes.get("minecraft:stick"));
        assertNull(CraftingRecipes.get("minecraft:diamond_pickaxe"));
        assertEquals(4, CraftingRecipes.get("oak_planks").yield());
        assertEquals(4, CraftingRecipes.get("torch").yield());
        assertEquals(1, CraftingRecipes.get("chest").yield());
    }

    @Test
    void allowlistMatchesNodeRecipes() throws IOException, InterruptedException {
        JsonObject nodeOutput = runNode("""
                import { RECIPES, MAX_CRAFT_COUNT } from '../src/recipes.js';
                process.stdout.write(JSON.stringify({ RECIPES, MAX_CRAFT_COUNT }));
                """);
        assertEquals(
                CraftingRecipes.MAX_COUNT, nodeOutput.get("MAX_CRAFT_COUNT").getAsInt(), "craft action count limit");
        JsonObject nodeRecipes = nodeOutput.getAsJsonObject("RECIPES");
        assertEquals(nodeRecipes.keySet(), Set.copyOf(CraftingRecipes.outputs()), "allowlisted outputs");
        Gson gson = new Gson();
        for (String name : CraftingRecipes.outputs()) {
            JsonObject fabricRecipe = gson.toJsonTree(CraftingRecipes.get(name)).getAsJsonObject();
            fabricRecipe.remove("pattern"); // Only Fabric needs the grid layout.
            assertEquals(nodeRecipes.get(name), fabricRecipe, name);
        }
    }

    @Test
    void craftingCountsAndIngredientPlansMatchNode() throws IOException, InterruptedException {
        JsonObject nodeOutput = runNode("""
                import { RECIPES, MAX_CRAFT_COUNT, craftsFor, planCraft } from '../src/recipes.js';
                const requested = 5;
                const results = {};
                for (const [name, recipe] of Object.entries(RECIPES)) {
                  const counts = Array.from({ length: MAX_CRAFT_COUNT }, (_, index) => craftsFor(recipe, index + 1));
                  const crafts = craftsFor(recipe, requested);
                  const exact = recipe.ingredients.map(({ items, count }) => ({ name: items[0], count: count * crafts }));
                  const short = exact.map((stack, index) => ({ ...stack, count: stack.count - (index === 0 ? 1 : 0) }));
                  const inventories = { empty: [], exact, short };
                  if (recipe.ingredients.some(({ items }) => items.length > 1)) {
                    inventories.mixed = recipe.ingredients.flatMap(({ items }, index) => {
                      const stack = exact[index];
                      return items.length === 1 ? [stack] : [
                        { ...stack, count: stack.count - 1 },
                        { name: items.at(-1), count: stack.count },
                      ];
                    });
                  }
                  const probes = Object.entries(inventories).map(([scenario, inventory]) => {
                    const plan = planCraft(recipe, crafts, inventory);
                    const items = plan.ok ? Object.fromEntries(plan.consume.map(({ name, count }) => [name, count])) : plan.missing;
                    return { scenario, inventory, ok: plan.ok, items };
                  });
                  results[name] = { counts, probes };
                }
                process.stdout.write(JSON.stringify({ requested, results }));
                """);

        Gson gson = new Gson();
        int requested = nodeOutput.get("requested").getAsInt();
        JsonObject nodeRecipes = nodeOutput.getAsJsonObject("results");
        for (String output : CraftingRecipes.outputs()) {
            CraftingRecipes.Recipe recipe = CraftingRecipes.get(output);
            JsonObject nodeRecipe = nodeRecipes.getAsJsonObject(output);
            var counts = nodeRecipe.getAsJsonArray("counts");
            assertEquals(CraftingRecipes.MAX_COUNT, counts.size());
            for (int count = 1; count <= CraftingRecipes.MAX_COUNT; count++)
                assertEquals(
                        counts.get(count - 1).getAsInt(),
                        CraftingRecipes.craftsFor(recipe, count),
                        output + " x" + count);

            int crafts = CraftingRecipes.craftsFor(recipe, requested);
            for (var element : nodeRecipe.getAsJsonArray("probes")) {
                var probe = element.getAsJsonObject();
                String scenario = output + " with " + probe.get("scenario").getAsString() + " inventory";
                Map<String, Integer> inventory = new LinkedHashMap<>();
                for (var stackElement : probe.getAsJsonArray("inventory")) {
                    var stack = stackElement.getAsJsonObject();
                    inventory.merge(
                            stack.get("name").getAsString(), stack.get("count").getAsInt(), Integer::sum);
                }
                CraftingRecipes.Plan plan = CraftingRecipes.plan(recipe, crafts, inventory);
                assertEquals(probe.get("ok").getAsBoolean(), plan.ok(), scenario);
                assertEquals(
                        probe.get("items"), gson.toJsonTree(plan.ok() ? plan.consume() : plan.missing()), scenario);
            }
        }
    }

    private static JsonObject runNode(String script) throws IOException, InterruptedException {
        Process node = new ProcessBuilder("node", "--input-type=module", "--eval", script)
                .redirectErrorStream(true)
                .start();
        String output;
        try (var stdout = node.getInputStream()) {
            output = new String(stdout.readAllBytes(), StandardCharsets.UTF_8);
        }
        assertEquals(0, node.waitFor(), output);
        return JsonParser.parseString(output).getAsJsonObject();
    }

    @Test
    void tableRecipesAreExactlyTheThreeByThreeOnes() {
        for (String output : CraftingRecipes.outputs()) {
            CraftingRecipes.Recipe recipe = CraftingRecipes.get(output);
            boolean fitsPlayerGrid = recipe.width() <= 2 && recipe.height() <= 2;
            assertEquals(!fitsPlayerGrid, recipe.table(), output);
        }
    }

    @Test
    void patternsUseEachIngredientExactlyItsCountPerCraft() {
        for (String output : CraftingRecipes.outputs()) {
            CraftingRecipes.Recipe recipe = CraftingRecipes.get(output);
            int[] used = new int[recipe.ingredients().size()];
            for (CraftingRecipes.Cell cell : CraftingRecipes.layout(recipe, 3)) used[cell.ingredient()]++;
            for (int index = 0; index < used.length; index++)
                assertEquals(recipe.ingredients().get(index).count(), used[index], output + " ingredient " + index);
        }
    }

    @Test
    void craftsRoundUpToWholeRecipes() {
        CraftingRecipes.Recipe stick = CraftingRecipes.get("stick");
        assertEquals(1, CraftingRecipes.craftsFor(stick, 1));
        assertEquals(1, CraftingRecipes.craftsFor(stick, 4));
        assertEquals(2, CraftingRecipes.craftsFor(stick, 5));
        assertEquals(16, CraftingRecipes.craftsFor(stick, 64));
        assertEquals(3, CraftingRecipes.craftsFor(CraftingRecipes.get("chest"), 3));
    }

    @Test
    void planConsumesInterchangeableItemsInListedOrder() {
        Map<String, Integer> inventory = new HashMap<>(Map.of(BIRCH, 5, OAK, 2, STICK, 9));
        CraftingRecipes.Plan plan = CraftingRecipes.plan(CraftingRecipes.get("wooden_pickaxe"), 2, inventory);
        assertTrue(plan.ok());
        assertEquals(Map.of(OAK, 2, BIRCH, 4, STICK, 4), plan.consume());
    }

    @Test
    void missingIngredientsMatchTheSharedMessage() {
        CraftingRecipes.Recipe pickaxe = CraftingRecipes.get("stone_pickaxe");
        CraftingRecipes.Plan plan = CraftingRecipes.plan(pickaxe, 1, Map.of(COBBLE, 2, STICK, 2));
        assertFalse(plan.ok());
        assertEquals(
                "Missing ingredients for 1 stone_pickaxe: 1 more of cobblestone/blackstone/cobbled_deepslate.",
                CraftingRecipes.missingMessage(pickaxe, 1, plan.missing()));
        CraftingRecipes.Plan torches =
                CraftingRecipes.plan(CraftingRecipes.get("torch"), 2, Map.of("minecraft:coal", 1));
        assertEquals("1 more of coal/charcoal and 2 more stick", CraftingRecipes.describeMissing(torches.missing()));
        assertEquals("Inventory full; crafted 4 of 8 stick.", CraftingRecipes.fullMessage(4, 8, STICK));
    }

    @Test
    void layoutAlignsShapesTopLeftInEitherGrid() {
        // Player grid (2x2): input slots 1 2 / 3 4.
        assertEquals(List.of(cell(1, 0), cell(3, 0)), CraftingRecipes.layout(CraftingRecipes.get("stick"), 2));
        assertEquals(
                List.of(cell(1, 0), cell(3, 1)),
                CraftingRecipes.layout(CraftingRecipes.get("torch"), 2),
                "coal above the stick");
        assertEquals(
                List.of(cell(1, 0), cell(2, 0), cell(3, 0), cell(4, 0)),
                CraftingRecipes.layout(CraftingRecipes.get("crafting_table"), 2));
        assertEquals(List.of(cell(1, 0)), CraftingRecipes.layout(CraftingRecipes.get("oak_planks"), 2));
        // Crafting table (3x3): input slots 1 2 3 / 4 5 6 / 7 8 9.
        assertEquals(
                List.of(cell(1, 0), cell(2, 0), cell(3, 0), cell(5, 1), cell(8, 1)),
                CraftingRecipes.layout(CraftingRecipes.get("stone_pickaxe"), 3));
        assertEquals(
                List.of(cell(1, 0), cell(2, 0), cell(4, 0), cell(5, 1), cell(8, 1)),
                CraftingRecipes.layout(CraftingRecipes.get("wooden_axe"), 3));
        assertEquals(
                List.of(cell(1, 0), cell(4, 1), cell(7, 1)),
                CraftingRecipes.layout(CraftingRecipes.get("stone_shovel"), 3));
        assertEquals(
                List.of(cell(1, 0), cell(2, 0), cell(3, 0), cell(4, 0), cell(6, 0), cell(7, 0), cell(8, 0), cell(9, 0)),
                CraftingRecipes.layout(CraftingRecipes.get("chest"), 3),
                "the centre stays empty");
        assertThrows(IllegalArgumentException.class, () -> CraftingRecipes.layout(CraftingRecipes.get("chest"), 2));
    }

    @Test
    void fillPicksUpAStackPlacesOneItemPerCellAndPutsTheRestBack() {
        CraftingRecipes.Recipe pickaxe = CraftingRecipes.get("wooden_pickaxe");
        Map<Integer, Map.Entry<String, Integer>> sources = new LinkedHashMap<>();
        sources.put(10, Map.entry(STICK, 5));
        sources.put(11, Map.entry(OAK, 10));
        assertEquals(
                List.of(
                        click(11, 0),
                        click(1, 1),
                        click(2, 1),
                        click(3, 1),
                        click(11, 0),
                        click(10, 0),
                        click(5, 1),
                        click(8, 1),
                        click(10, 0)),
                CraftingRecipes.fill(pickaxe, CraftingRecipes.layout(pickaxe, 3), sources));
    }

    @Test
    void fillSpreadsAcrossStacksAndPrefersListedItems() {
        CraftingRecipes.Recipe table = CraftingRecipes.get("crafting_table");
        Map<Integer, Map.Entry<String, Integer>> sources = new LinkedHashMap<>();
        sources.put(9, Map.entry(BIRCH, 64));
        sources.put(36, Map.entry(OAK, 1));
        sources.put(40, Map.entry(OAK, 2));
        // Oak is listed before birch, so both oak stacks are used up first, with no put-back for exhausted stacks.
        assertEquals(
                List.of(
                        click(36, 0),
                        click(1, 1),
                        click(40, 0),
                        click(2, 1),
                        click(3, 1),
                        click(9, 0),
                        click(4, 1),
                        click(9, 0)),
                CraftingRecipes.fill(table, CraftingRecipes.layout(table, 2), sources));
    }

    @Test
    void fillReportsWhenSourcesCannotCoverOneCraft() {
        CraftingRecipes.Recipe furnace = CraftingRecipes.get("furnace");
        Map<Integer, Map.Entry<String, Integer>> sources = new LinkedHashMap<>();
        sources.put(10, Map.entry(COBBLE, 7));
        assertNull(CraftingRecipes.fill(furnace, CraftingRecipes.layout(furnace, 3), sources));
        sources.put(11, Map.entry("minecraft:blackstone", 1));
        assertNotNull(
                CraftingRecipes.fill(furnace, CraftingRecipes.layout(furnace, 3), sources),
                "stone materials mix within one craft");
    }
}
