package dev.minecraftagent;

import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Stream;

/**
 * The bounded crafting allowlist, mirroring {@code src/recipes.js}, plus each vanilla 1.21.1 recipe's shape so the grid
 * can be filled slot by slot. Free of Minecraft types so it is unit-testable.
 */
final class CraftingRecipes {
    /** The most output items one craft action may request, matching the protocol. */
    static final int MAX_COUNT = 64;

    static final List<String> WOODS =
            List.of("oak", "birch", "spruce", "jungle", "acacia", "dark_oak", "cherry", "mangrove");
    /** {@code #minecraft:planks} in 1.21.1: the overworld woods plus bamboo, crimson, and warped. */
    static final List<String> PLANKS = Stream.concat(WOODS.stream(), Stream.of("bamboo", "crimson", "warped"))
            .map(wood -> id(wood + "_planks"))
            .toList();
    /** {@code #minecraft:stone_tool_materials} and {@code #minecraft:stone_crafting_materials} in 1.21.1. */
    static final List<String> STONE_MATERIALS = List.of(id("cobblestone"), id("blackstone"), id("cobbled_deepslate"));

    /** Interchangeable items one craft consumes {@code count} of, in any mix; listed order is consumption preference. */
    record Ingredient(List<String> items, int count) {}

    /**
     * One allowlisted output. Each pattern row is a string whose characters are ingredient indices ('0', '1') or a space
     * for an empty cell, in vanilla's shape and orientation.
     */
    record Recipe(String output, int yield, boolean table, List<Ingredient> ingredients, List<String> pattern) {
        int width() {
            return pattern.stream().mapToInt(String::length).max().orElse(0);
        }

        int height() {
            return pattern.size();
        }
    }

    /** One grid cell to fill: its screen-handler slot index and which ingredient goes there. */
    record Cell(int slot, int ingredient) {}

    /** One click on a screen-handler slot; button 0 picks up or places a whole stack, button 1 places one item. */
    record Click(int slot, int button) {}

    /** Either the items that the requested crafts consume, or the shortfall per ingredient. */
    record Plan(Map<String, Integer> consume, List<Ingredient> missing) {
        boolean ok() {
            return missing.isEmpty();
        }
    }

    private static final Map<String, Recipe> RECIPES = recipes();

    private CraftingRecipes() {}

    static String id(String name) {
        return "minecraft:" + name;
    }

    /** The recipe for a namespaced or bare output name, or null when it is not on the allowlist. */
    static Recipe get(String name) {
        return RECIPES.get(name.contains(":") ? name : id(name));
    }

    static List<String> outputs() {
        return List.copyOf(RECIPES.keySet());
    }

    private static Map<String, Recipe> recipes() {
        Ingredient stick = new Ingredient(List.of(id("stick")), 2);
        Map<String, Recipe> recipes = new LinkedHashMap<>();
        for (String wood : WOODS)
            add(recipes, wood + "_planks", 4, false, List.of(new Ingredient(List.of(id(wood + "_log")), 1)), "0");
        add(recipes, "stick", 4, false, List.of(new Ingredient(PLANKS, 2)), "0", "0");
        add(recipes, "crafting_table", 1, false, List.of(new Ingredient(PLANKS, 4)), "00", "00");
        add(
                recipes,
                "torch",
                4,
                false,
                List.of(
                        new Ingredient(List.of(id("coal"), id("charcoal")), 1),
                        new Ingredient(List.of(id("stick")), 1)),
                "0",
                "1");
        add(recipes, "chest", 1, true, List.of(new Ingredient(PLANKS, 8)), "000", "0 0", "000");
        add(recipes, "furnace", 1, true, List.of(new Ingredient(STONE_MATERIALS, 8)), "000", "0 0", "000");
        for (String tier : List.of("wooden", "stone")) {
            List<String> material = tier.equals("wooden") ? PLANKS : STONE_MATERIALS;
            add(recipes, tier + "_pickaxe", 1, true, List.of(new Ingredient(material, 3), stick), "000", " 1 ", " 1 ");
            add(recipes, tier + "_axe", 1, true, List.of(new Ingredient(material, 3), stick), "00", "01", " 1");
            add(recipes, tier + "_shovel", 1, true, List.of(new Ingredient(material, 1), stick), "0", "1", "1");
        }
        return Collections.unmodifiableMap(recipes);
    }

    private static void add(
            Map<String, Recipe> recipes,
            String name,
            int yield,
            boolean table,
            List<Ingredient> ingredients,
            String... pattern) {
        recipes.put(id(name), new Recipe(id(name), yield, table, List.copyOf(ingredients), List.of(pattern)));
    }

    /** How many crafts produce at least {@code count} of the recipe's output. */
    static int craftsFor(Recipe recipe, int count) {
        return (count + recipe.yield() - 1) / recipe.yield();
    }

    /** Which held items {@code crafts} repetitions consume, taking interchangeable items in the listed order. */
    static Plan plan(Recipe recipe, int crafts, Map<String, Integer> inventory) {
        Map<String, Integer> held = new LinkedHashMap<>(inventory);
        Map<String, Integer> consume = new LinkedHashMap<>();
        List<Ingredient> missing = new ArrayList<>();
        for (Ingredient ingredient : recipe.ingredients()) {
            int needed = ingredient.count() * crafts;
            for (String name : ingredient.items()) {
                int taken = Math.min(needed, held.getOrDefault(name, 0));
                if (taken == 0) continue;
                held.merge(name, -taken, Integer::sum);
                consume.merge(name, taken, Integer::sum);
                needed -= taken;
            }
            if (needed > 0) missing.add(new Ingredient(ingredient.items(), needed));
        }
        return new Plan(consume, missing);
    }

    /** A readable shortfall, for example "2 more stick and 3 more of cobblestone/blackstone/cobbled_deepslate". */
    static String describeMissing(List<Ingredient> missing) {
        List<String> parts = new ArrayList<>();
        for (Ingredient ingredient : missing) {
            List<String> names = ingredient.items().stream()
                    .map(name -> name.replaceFirst("^minecraft:", ""))
                    .toList();
            parts.add(
                    names.size() == 1
                            ? ingredient.count() + " more " + names.getFirst()
                            : ingredient.count() + " more of " + String.join("/", names));
        }
        return String.join(" and ", parts);
    }

    /** The failure sentence when ingredients fall short before anything moves. */
    static String missingMessage(Recipe recipe, int count, List<Ingredient> missing) {
        return "Missing ingredients for " + count + " " + recipe.output().replaceFirst("^minecraft:", "") + ": "
                + describeMissing(missing) + ".";
    }

    /** The success sentence, worded as the bot and the demo word it, so agents see one format on every backend. */
    static String craftedMessage(int crafted, String output) {
        return "Crafted " + crafted + " " + output.replaceFirst("^minecraft:", "") + ".";
    }

    /** Prefixes a held crafting table's placement, worded as the bot and the demo word it. */
    static String placedTableMessage(int x, int y, int z, String message) {
        return "Placed a crafting table at " + x + " " + y + " " + z + ". " + message;
    }

    /** A table recipe with no table within 16 blocks and none held, worded as the bot words it. */
    static String noTableMessage(String output) {
        return "Crafting " + output.replaceFirst("^minecraft:", "")
                + " needs a crafting table; none is within 16 blocks and none is held.";
    }

    /** The failure sentence when the crafted output has nowhere to go. */
    static String fullMessage(int crafted, int requested, String output) {
        return "Inventory full; crafted " + Math.max(0, crafted) + " of " + requested + " "
                + output.replaceFirst("^minecraft:", "") + ".";
    }

    /**
     * The cells of a square crafting grid ({@code gridWidth} 2 for the player's own grid, 3 for a crafting table) that
     * the recipe fills, aligned to the top-left corner. Input slots start at screen-handler slot 1 in row-major order,
     * after the result slot 0, in both {@code PlayerScreenHandler} and {@code CraftingScreenHandler}.
     */
    static List<Cell> layout(Recipe recipe, int gridWidth) {
        if (recipe.width() > gridWidth || recipe.height() > gridWidth)
            throw new IllegalArgumentException(
                    recipe.output() + " does not fit a " + gridWidth + "x" + gridWidth + " grid.");
        List<Cell> cells = new ArrayList<>();
        for (int row = 0; row < recipe.height(); row++) {
            String line = recipe.pattern().get(row);
            for (int column = 0; column < line.length(); column++) {
                char symbol = line.charAt(column);
                if (symbol != ' ') cells.add(new Cell(1 + row * gridWidth + column, symbol - '0'));
            }
        }
        return cells;
    }

    /**
     * Clicks that put one accepted item into every cell for a single craft, from {@code sources} (screen-handler slot to
     * item and count, in slot order, all from the player's main inventory). Each source stack is picked up whole, one
     * item is right-clicked into each cell it can serve, and any remainder is put back into the emptied source slot, so
     * the cursor ends empty. Returns null when the sources cannot cover the craft. The cells must start empty.
     */
    static List<Click> fill(Recipe recipe, List<Cell> cells, Map<Integer, Map.Entry<String, Integer>> sources) {
        Map<Integer, Integer> left = new LinkedHashMap<>();
        sources.forEach((slot, stack) -> left.put(slot, stack.getValue()));
        List<Click> clicks = new ArrayList<>();
        for (int index = 0; index < recipe.ingredients().size(); index++) {
            int ingredient = index;
            List<Integer> pending = new ArrayList<>(cells.stream()
                    .filter(cell -> cell.ingredient() == ingredient)
                    .map(Cell::slot)
                    .toList());
            while (!pending.isEmpty()) {
                Integer source = null;
                for (String item : recipe.ingredients().get(ingredient).items()) {
                    for (var entry : sources.entrySet())
                        if (entry.getValue().getKey().equals(item) && left.get(entry.getKey()) > 0) {
                            source = entry.getKey();
                            break;
                        }
                    if (source != null) break;
                }
                if (source == null) return null;
                int cursor = left.get(source);
                left.put(source, 0);
                clicks.add(new Click(source, 0));
                while (cursor > 0 && !pending.isEmpty()) {
                    clicks.add(new Click(pending.removeFirst(), 1));
                    cursor--;
                }
                if (cursor > 0) {
                    clicks.add(new Click(source, 0));
                    left.put(source, cursor);
                }
            }
        }
        return clicks;
    }
}
