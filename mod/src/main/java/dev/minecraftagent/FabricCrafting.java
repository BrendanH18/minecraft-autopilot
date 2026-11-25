package dev.minecraftagent;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import net.minecraft.client.MinecraftClient;
import net.minecraft.entity.player.PlayerInventory;
import net.minecraft.item.Item;
import net.minecraft.item.ItemStack;
import net.minecraft.registry.Registries;
import net.minecraft.screen.ScreenHandler;
import net.minecraft.screen.slot.Slot;
import net.minecraft.screen.slot.SlotActionType;
import net.minecraft.util.Identifier;

/**
 * Repeats one allowlisted recipe in a crafting grid by explicit slot clicks: the player's own 2x2 grid
 * (PlayerScreenHandler, sync ID 0, which the server accepts clicks for without an open screen) or an opened crafting
 * table's 3x3 grid. Explicit placement works for recipes the player has not unlocked, unlike the recipe book. The
 * result slot is filled only by the server, so each craft waits for it before a quick-move takes exactly one craft's
 * output. Client thread only.
 */
final class FabricCrafting {
    private enum Step {
        FILL,
        AWAIT_RESULT,
        AWAIT_TAKE
    }

    private static final long STEP_TIMEOUT = 5_000_000_000L;

    private final MinecraftClient client;
    private final CraftingRecipes.Recipe recipe;
    private final Item output;
    private final String outputName;
    private final int requested;
    private final int initialOutput;
    private ScreenHandler handler;
    private List<CraftingRecipes.Cell> cells;
    private int gridSlots;
    private Step step;
    private long stepStarted;
    private int expectedOutput;
    private boolean filledGrid;

    FabricCrafting(MinecraftClient client, CraftingRecipes.Recipe recipe, int requested) {
        this.client = client;
        this.recipe = recipe;
        this.requested = requested;
        outputName = recipe.output();
        output = Registries.ITEM.get(Identifier.of(outputName));
        initialOutput = count(output);
    }

    /** Fails before anything moves when the held items cannot cover every craft. */
    static void requireIngredients(MinecraftClient client, CraftingRecipes.Recipe recipe, int requested) {
        Map<String, Integer> held = new LinkedHashMap<>();
        PlayerInventory inventory = client.player.getInventory();
        for (int slot = 0; slot < InventoryRoom.MAIN_SLOTS; slot++) {
            ItemStack stack = inventory.getStack(slot);
            if (!stack.isEmpty())
                held.merge(Registries.ITEM.getId(stack.getItem()).toString(), stack.getCount(), Integer::sum);
        }
        CraftingRecipes.Plan plan = CraftingRecipes.plan(recipe, CraftingRecipes.craftsFor(recipe, requested), held);
        if (!plan.ok())
            throw new IllegalStateException(CraftingRecipes.missingMessage(recipe, requested, plan.missing()));
    }

    /** Start crafting in this handler's grid, {@code gridWidth} 2 for the player's own grid or 3 for a table. */
    void use(ScreenHandler handler, int gridWidth, long now) {
        cells = CraftingRecipes.layout(recipe, gridWidth);
        gridSlots = gridWidth * gridWidth;
        if (!handler.getCursorStack().isEmpty())
            throw new IllegalStateException("The crafting cursor is occupied; take control to clear it.");
        if (!gridEmpty(handler))
            throw new IllegalStateException("The crafting grid already contains items; clear it before starting.");
        this.handler = handler;
        step = Step.FILL;
        stepStarted = now;
    }

    boolean started() {
        return handler != null;
    }

    int crafted() {
        return client.player == null ? 0 : Math.max(0, count(output) - initialOutput);
    }

    int requested() {
        return requested;
    }

    /** Null while crafting continues, otherwise the outcome. Throws for unexpected server or screen states. */
    FabricStorage.Result tick(long now) {
        if (client.player.currentScreenHandler != handler)
            throw new IllegalStateException("The crafting grid is no longer open.");
        switch (step) {
            case FILL: {
                int crafted = crafted();
                if (crafted >= requested)
                    return new FabricStorage.Result(true, CraftingRecipes.craftedMessage(crafted, outputName));
                if (!handler.getCursorStack().isEmpty())
                    throw new IllegalStateException("The crafting cursor is occupied; take control to clear it.");
                if (!gridEmpty(handler)) throw new IllegalStateException("Items appeared in the crafting grid.");
                List<CraftingRecipes.Click> clicks = CraftingRecipes.fill(recipe, cells, sources());
                if (clicks == null) {
                    Map<String, Integer> held = new LinkedHashMap<>();
                    sources().values().forEach(stack -> held.merge(stack.getKey(), stack.getValue(), Integer::sum));
                    return new FabricStorage.Result(
                            false,
                            CraftingRecipes.missingMessage(
                                            recipe,
                                            requested - crafted,
                                            CraftingRecipes.plan(
                                                            recipe,
                                                            CraftingRecipes.craftsFor(recipe, requested - crafted),
                                                            held)
                                                    .missing())
                                    + " Crafted " + crafted + " of " + requested + ".");
                }
                // One client-thread batch, so the cursor is empty again before any takeover can run.
                filledGrid = true;
                for (CraftingRecipes.Click click : clicks) click(click.slot(), click.button(), SlotActionType.PICKUP);
                if (!handler.getCursorStack().isEmpty())
                    throw new IllegalStateException("Filling the crafting grid left items on the cursor.");
                step = Step.AWAIT_RESULT;
                stepStarted = now;
                return null;
            }
            case AWAIT_RESULT: {
                ItemStack result = handler.getSlot(0).getStack();
                if (!result.isOf(output)) {
                    if (now - stepStarted > STEP_TIMEOUT) {
                        returnGrid();
                        throw new IllegalStateException("The server did not produce " + outputName
                                + " from the crafting grid; check that the ingredients are allowed.");
                    }
                    return null;
                }
                if (result.getCount() != recipe.yield())
                    throw new IllegalStateException("The server offered " + result.getCount() + " " + outputName
                            + " per craft; expected " + recipe.yield() + ".");
                if (InventoryRoom.capacity(mainSlots(client.player.getInventory(), result), result.getMaxCount())
                        < result.getCount()) {
                    returnGrid();
                    return new FabricStorage.Result(
                            false, CraftingRecipes.fullMessage(crafted(), requested, outputName));
                }
                expectedOutput = count(output) + result.getCount();
                // Every cell holds one item, so the quick-move crafts exactly once.
                click(0, 0, SlotActionType.QUICK_MOVE);
                step = Step.AWAIT_TAKE;
                stepStarted = now;
                return null;
            }
            case AWAIT_TAKE:
                if (count(output) >= expectedOutput
                        && gridEmpty(handler)
                        && handler.getSlot(0).getStack().isEmpty()) {
                    filledGrid = false;
                    step = Step.FILL;
                    stepStarted = now;
                } else if (now - stepStarted > STEP_TIMEOUT) {
                    returnGrid();
                    throw new IllegalStateException("The crafted " + outputName + " did not reach the inventory.");
                }
                return null;
        }
        return null;
    }

    /** Quick-moves leftover grid items back into the inventory while this grid is still the current handler. */
    void returnGrid() {
        if (!filledGrid
                || handler == null
                || client.player == null
                || client.interactionManager == null
                || client.player.currentScreenHandler != handler
                || !handler.getCursorStack().isEmpty()) return;
        for (int slot = 1; slot <= gridSlots; slot++)
            if (!handler.getSlot(slot).getStack().isEmpty()) click(slot, 0, SlotActionType.QUICK_MOVE);
        filledGrid = !gridEmpty(handler);
    }

    private boolean gridEmpty(ScreenHandler handler) {
        for (int slot = 1; slot <= gridSlots; slot++)
            if (!handler.getSlot(slot).getStack().isEmpty()) return false;
        return true;
    }

    /** The player's hotbar and main inventory slots in this handler, by handler slot index, with item and count. */
    private Map<Integer, Map.Entry<String, Integer>> sources() {
        Map<Integer, Map.Entry<String, Integer>> sources = new LinkedHashMap<>();
        for (int index = 0; index < handler.slots.size(); index++) {
            Slot slot = handler.slots.get(index);
            if (slot.inventory != client.player.getInventory() || slot.getIndex() >= InventoryRoom.MAIN_SLOTS) continue;
            ItemStack stack = slot.getStack();
            if (!stack.isEmpty())
                sources.put(
                        index, Map.entry(Registries.ITEM.getId(stack.getItem()).toString(), stack.getCount()));
        }
        return sources;
    }

    /** The hotbar and main inventory, including whether each stack accepts the incoming item. */
    static List<InventoryRoom.Slot> mainSlots(PlayerInventory inventory, ItemStack incoming) {
        List<InventoryRoom.Slot> slots = new ArrayList<>(InventoryRoom.MAIN_SLOTS);
        for (int index = 0; index < InventoryRoom.MAIN_SLOTS; index++) {
            ItemStack stack = inventory.getStack(index);
            slots.add(
                    stack.isEmpty()
                            ? InventoryRoom.Slot.EMPTY
                            : new InventoryRoom.Slot(
                                    ItemStack.areItemsAndComponentsEqual(stack, incoming),
                                    stack.getCount(),
                                    stack.getMaxCount()));
        }
        return slots;
    }

    private int count(Item item) {
        int total = 0;
        for (int index = 0; index < InventoryRoom.MAIN_SLOTS; index++) {
            ItemStack stack = client.player.getInventory().getStack(index);
            if (stack.isOf(item)) total += stack.getCount();
        }
        return total;
    }

    private void click(int slot, int button, SlotActionType action) {
        client.interactionManager.clickSlot(handler.syncId, slot, button, action, client.player);
    }
}
