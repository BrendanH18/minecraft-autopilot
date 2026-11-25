package dev.minecraftagent;

import baritone.api.BaritoneAPI;
import baritone.api.pathing.goals.GoalBlock;
import baritone.api.pathing.goals.GoalGetToBlock;
import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import net.minecraft.block.BlockState;
import net.minecraft.block.Blocks;
import net.minecraft.block.ChestBlock;
import net.minecraft.block.NoteBlock;
import net.minecraft.block.RespawnAnchorBlock;
import net.minecraft.block.ShapeContext;
import net.minecraft.block.enums.ChestType;
import net.minecraft.client.MinecraftClient;
import net.minecraft.client.gui.screen.ingame.HandledScreen;
import net.minecraft.client.network.ClientPlayerEntity;
import net.minecraft.client.world.ClientWorld;
import net.minecraft.entity.player.PlayerInventory;
import net.minecraft.item.Item;
import net.minecraft.item.ItemStack;
import net.minecraft.item.Items;
import net.minecraft.registry.Registries;
import net.minecraft.screen.CraftingScreenHandler;
import net.minecraft.screen.GenericContainerScreenHandler;
import net.minecraft.screen.ScreenHandler;
import net.minecraft.screen.slot.SlotActionType;
import net.minecraft.util.Hand;
import net.minecraft.util.hit.BlockHitResult;
import net.minecraft.util.math.BlockPos;
import net.minecraft.util.math.Direction;
import net.minecraft.util.math.Vec3d;
import net.minecraft.world.RaycastContext;

/**
 * Bounded vanilla chest/barrel actions and crafting-table use; all access is on the Minecraft client thread. Deposit,
 * withdraw, and inspection open chests and barrels; craft opens a crafting table, or crafts in the player's own grid
 * without opening anything.
 */
final class FabricStorage {
    record Result(boolean success, String message) {}

    private enum Mode {
        DEPOSIT,
        WITHDRAW,
        INSPECT,
        CRAFT
    }

    private enum Phase {
        PLACING_TABLE,
        APPROACH,
        OPENING,
        /** Crafting in the opened table's grid, or in the player's own grid with no screen. */
        CRAFTING,
        RETURN
    }

    private final MinecraftClient client;
    private final Map<String, Map<BlockPos, JsonObject>> byIdentity = new LinkedHashMap<>();
    private ClientWorld actionWorld;
    private ClientPlayerEntity actionPlayer;
    private String identity;
    private ArrayDeque<BlockPos> targets;
    private BlockPos target;
    private Vec3d start;
    private Mode mode;
    private Phase phase;
    private long phaseStarted;
    private long openingGeneration;
    /** The chest/barrel or crafting-table handler bound to the agent's own opening. */
    private ScreenHandler owned;

    private final StorageOpening opening = new StorageOpening();
    private boolean agentOpening;
    private ClientWorld openingWorld;
    private Item item;
    private int amount;
    private StorageTransfer transfer;
    private int sent;
    /** A withdrawal's requested count (0 takes every matching item), and its target M once the container is read. */
    private int withdrawRequested;

    private int withdrawTotal;
    private FabricCrafting crafting;
    /** Where this craft placed the held crafting table, or null. */
    private BlockPos placedTable;
    /** A containers list was given: only those inventories are reopened and only they must be in range. */
    private boolean scoped;
    /**
     * Set when a deposit's or withdrawal's container first opens: where items moved and that container's contents just
     * before the transfer.
     */
    private JsonObject transferContainer;

    FabricStorage(MinecraftClient client) {
        this.client = client;
        StoragePackets.attach(this);
    }

    boolean active() {
        return phase != null;
    }

    boolean navigating() {
        return phase == Phase.APPROACH || phase == Phase.RETURN;
    }

    private void reset(String identity, Mode mode, Item item, int amount) {
        actionWorld = client.world;
        actionPlayer = client.player;
        transferContainer = null;
        crafting = null;
        placedTable = null;
        scoped = false;
        this.mode = mode;
        this.identity = identity;
        this.item = item;
        this.amount = amount;
        transfer = null;
        sent = 0;
        start = client.player.getPos();
    }

    /** Stores {@code amount} held items in the nearest chest, trapped chest, or barrel within 16 blocks. */
    void beginDeposit(String identity, Item item, int requested, int held) {
        // A requested count of 0 stores every held item. Reset first so a refusal never reports an earlier container.
        reset(identity, Mode.DEPOSIT, item, requested == 0 ? held : requested);
        String id = Registries.ITEM.getId(item).toString();
        if (held == 0) throw new IllegalStateException(JobMessages.noneToDeposit(id));
        if (requested > held) throw new IllegalStateException(JobMessages.depositShort(held, id, requested));
        List<BlockPos> nearby = nearby();
        if (nearby.isEmpty())
            throw new IllegalStateException("No chest or barrel within 16 blocks. Move near storage first.");
        targets = new ArrayDeque<>(List.of(nearby.getFirst()));
        nextTarget();
    }

    /** requested limits the inspection to those known inventories; null reopens every known container. */
    void beginInspect(String identity, List<BlockPos> requested) {
        reset(identity, Mode.INSPECT, null, 0);
        scoped = requested != null;
        targets = new ArrayDeque<>(
                scoped
                        ? requestedTargets(identity, requested)
                        : normalize(identity).keySet());
        nextTarget();
    }

    /**
     * Takes {@code amount} of the item (0 for every matching item) from one container within 16 blocks: the nearest whose
     * last-observed contents include it, else the nearest with no known contents. Fails before moving without one.
     */
    void beginWithdraw(String identity, Item item, int amount) {
        reset(identity, Mode.WITHDRAW, item, amount);
        withdrawRequested = amount;
        withdrawTotal = amount;
        Map<BlockPos, JsonObject> known = normalize(identity);
        Map<BlockPos, Integer> observed = new LinkedHashMap<>();
        String name = Registries.ITEM.getId(item).toString();
        for (var entry : known.entrySet()) {
            JsonElement items = entry.getValue().get("items");
            if (items == null || items.isJsonNull()) continue;
            int count = 0;
            for (JsonElement stack : items.getAsJsonArray())
                if (stack.getAsJsonObject().get("name").getAsString().equals(name))
                    count += stack.getAsJsonObject().get("count").getAsInt();
            observed.put(entry.getKey(), count);
        }
        BlockPos chosen = WithdrawTargets.choose(nearby(), observed);
        if (chosen == null) throw new IllegalStateException(JobMessages.noCandidate(name));
        // A full inventory is reported after reading the container, so the count and its contents are live.
        targets = new ArrayDeque<>(List.of(chosen));
        nextTarget();
    }

    /**
     * Crafts at least {@code count} of an allowlisted output. Ingredients are checked before anything moves. A 2x2
     * recipe uses the player's own grid; a table recipe uses the nearest crafting table within 16 blocks, placing a held
     * one next to the player when none is in range.
     */
    void beginCraft(String identity, CraftingRecipes.Recipe recipe, int count) {
        reset(identity, Mode.CRAFT, null, count);
        FabricCrafting.requireIngredients(client, recipe, count);
        crafting = new FabricCrafting(client, recipe, count);
        if (!recipe.table()) {
            crafting.use(client.player.playerScreenHandler, 2, System.nanoTime());
            phase = Phase.CRAFTING;
            return;
        }
        BlockPos table = nearestCraftingTable();
        if (table == null) {
            placeCraftingTable(recipe.output());
            return;
        }
        targets = new ArrayDeque<>(List.of(table));
        nextTarget();
    }

    boolean pendingOpen() {
        return opening.pending();
    }

    boolean agentOpening() {
        return agentOpening;
    }

    void interactionSent(int sequence) {
        opening.sent(sequence);
    }

    void acknowledged(int sequence) {
        opening.acknowledge(sequence);
    }

    void maintain() {
        if (openingWorld != client.world) opening.reset();
    }

    /** Bind at packet delivery, before F8/stop/expiry can run on the next tick. */
    void screenOpened() {
        if (client.player == null || !opening.pending()) return;
        ScreenHandler handler = client.player.currentScreenHandler;
        boolean container = handler instanceof GenericContainerScreenHandler;
        boolean table = handler instanceof CraftingScreenHandler;
        if (!container && !table) return;
        if (!opening.mayOwnReply()) {
            owned = handler;
            closeOwned();
            return;
        }
        if (owned == null
                && phase == Phase.OPENING
                && (mode == Mode.CRAFT
                        ? table
                        : container
                                && ((GenericContainerScreenHandler) handler).getRows()
                                        == (members(target).size() == 2 ? 6 : 3))) owned = handler;
    }

    /** Only the handler bound to the agent's outstanding interaction (and, for a craft, still in use) is exempt. */
    boolean ownsScreen() {
        return (phase == Phase.OPENING || phase == Phase.CRAFTING)
                && owned != null
                && client.player != null
                && client.currentScreen instanceof HandledScreen<?> screen
                && screen.getScreenHandler() == owned
                && client.player.currentScreenHandler == owned;
    }

    boolean screenClosedByPlayer() {
        return owned != null && !ownsScreen();
    }

    Result tick(long now) {
        if (!active()) return null;
        Result result = step(now);
        if (result == null || placedTable == null) return result;
        return new Result(
                result.success(),
                CraftingRecipes.placedTableMessage(
                        placedTable.getX(), placedTable.getY(), placedTable.getZ(), result.message()));
    }

    private Result step(long now) {
        try {
            if (phase == Phase.PLACING_TABLE) {
                switch (opening.placement(isCraftingTable(target))) {
                    case WAITING -> {
                        if (now - phaseStarted > 5_000_000_000L)
                            throw new IllegalStateException(
                                    "Timed out waiting for the server to confirm the crafting table at "
                                            + describe(target) + ".");
                    }
                    case REJECTED ->
                        throw new IllegalStateException(
                                "The server did not confirm a crafting table at " + describe(target) + ".");
                    case CONFIRMED -> {
                        placedTable = target;
                        targets = new ArrayDeque<>(List.of(target));
                        nextTarget();
                    }
                }
                return null;
            }
            if (phase == Phase.CRAFTING) return crafting.tick(now);
            if (phase == Phase.RETURN) {
                // Back in the start block, not merely near it: a step below counted as near, and repeated inspections
                // crept away from a completed return home (#78).
                return switch (Arrival.state(
                        atStart(), client.player.isOnGround(), pathing(), false, now - phaseStarted > 3_000_000_000L)) {
                    case ARRIVED ->
                        new Result(
                                true,
                                scoped
                                        ? "Refreshed the requested storage from the server."
                                        : "Refreshed previously opened storage from the server and returned to"
                                                + " inspection start.");
                    case STOPPED ->
                        throw new IllegalStateException("Storage refreshed, but could not return to inspection start.");
                    case WALKING -> null;
                };
            }
            if (target == null) return new Result(true, "No previously opened storage to refresh.");
            if (mode == Mode.CRAFT ? !isCraftingTable(target) : !isContainer(target))
                throw new IllegalStateException(
                        mode == Mode.CRAFT
                                ? "The crafting table disappeared before it could be used."
                                : "The container disappeared before it could be inspected.");
            if (client.player.getPos().distanceTo(Vec3d.ofCenter(target)) > 16)
                throw new IllegalStateException(
                        mode == Mode.CRAFT
                                ? "Crafting requires the crafting table within 16 blocks."
                                : scoped
                                        ? "Storage inspection requires the requested containers to be within 16"
                                                + " blocks; the "
                                                + Registries.BLOCK
                                                        .getId(client.world
                                                                .getBlockState(target)
                                                                .getBlock())
                                                        .getPath()
                                                + " at " + describe(target)
                                                + " is farther. Return near it before finishing."
                                        : "Storage requires containers within 16 blocks. Return near storage first.");
            if (phase == Phase.APPROACH) {
                if (opening.pending()) return null;
                BlockHitResult hit = visibleHit();
                if (hit != null) {
                    BaritoneAPI.getProvider()
                            .getPrimaryBaritone()
                            .getPathingBehavior()
                            .cancelEverything();
                    open(hit);
                } else if (now - phaseStarted > 3_000_000_000L && !pathing())
                    throw new IllegalStateException(
                            mode == Mode.CRAFT
                                    ? "Could not reach the crafting table."
                                    : "Could not reach the container.");
                return null;
            }
            if (now - phaseStarted > 5_000_000_000L)
                throw new IllegalStateException(
                        mode == Mode.CRAFT
                                ? "The crafting table did not open."
                                : "The container did not open with fresh server contents; its lid may be blocked.");
            if (owned == null || !StoragePackets.ready(owned.syncId, openingGeneration, owned.slots.size()))
                return null;
            if (mode == Mode.CRAFT) {
                phase = Phase.CRAFTING;
                crafting.use(owned, 3, now);
                return null;
            }
            List<ItemStack> stacks = StoragePackets.contents();
            int size = ((GenericContainerScreenHandler) owned).getRows() * 9;
            record(stacks, size);
            if (mode == Mode.INSPECT) {
                closeOwned();
                nextTarget();
                return null;
            }
            int stored = count(stacks.subList(0, size), item);
            int held = count(stacks.subList(size, stacks.size()), item);
            if (transfer == null) {
                // The screen opened, so report this container even if the transfer later fails: items may move before
                // then.
                BlockPos key = canonical(target);
                transferContainer = new JsonObject();
                transferContainer.addProperty("name", blockName(key));
                transferContainer.addProperty("x", key.getX());
                transferContainer.addProperty("y", key.getY());
                transferContainer.addProperty("z", key.getZ());
                transferContainer.add("before", contents(stacks.subList(0, size)));
                if (mode == Mode.WITHDRAW) return startWithdrawal(stacks, size, stored, held, now);
                transfer = new StorageTransfer(amount, stored, held);
            } else if (mode == Mode.WITHDRAW) return continueWithdrawal(stacks, size, stored, held, now);
            else if (!transfer.confirm(stored, held, sent))
                throw new IllegalStateException(
                        "Server did not confirm the requested transfer. Check inventory and storage before retrying.");
            String itemId = Registries.ITEM.getId(item).toString();
            if (transfer.remaining() == 0)
                return new Result(true, JobMessages.deposited(transfer.confirmed(), itemId, where(canonical(target))));
            if (!transferStack(stacks, size, false))
                return new Result(
                        false, JobMessages.depositFull(where(canonical(target)), transfer.confirmed(), amount, itemId));
            reopen(now);
            return null;
        } catch (RuntimeException exception) {
            String progress = "";
            if (mode == Mode.CRAFT && crafting != null)
                progress = " Crafted " + crafting.crafted() + " of " + crafting.requested() + ".";
            else if (transfer != null)
                progress = mode == Mode.WITHDRAW
                        ? " Confirmed withdrawn: " + transfer.confirmed() + " of " + withdrawTotal + "."
                        : " Confirmed deposited: " + transfer.confirmed() + " of " + amount + ".";
            return new Result(false, exception.getMessage() + progress);
        }
    }

    /** Accepted predicted clicks need not produce slot echoes. Reopen for an authoritative inventory packet. */
    private void reopen(long now) {
        closeOwned();
        phase = Phase.APPROACH;
        phaseStarted = now;
    }

    /** The first read of the withdrawal's container fixes how many items it can take. */
    private Result startWithdrawal(List<ItemStack> stacks, int size, int stored, int held, long now) {
        String name = Registries.ITEM.getId(item).toString();
        String where = where(canonical(target));
        withdrawTotal = withdrawRequested > 0 ? withdrawRequested : stored;
        if (withdrawTotal == 0) return new Result(false, JobMessages.holdsNo(where, name, 0));
        if (stored == 0) return new Result(false, JobMessages.holdsNo(where, name, withdrawTotal));
        // A deposit's destination is the container; a withdrawal's is the player, so the roles swap.
        transfer = new StorageTransfer(Math.min(withdrawTotal, stored), held, stored);
        return withdrawStack(stacks, size, now);
    }

    private Result continueWithdrawal(List<ItemStack> stacks, int size, int stored, int held, long now) {
        if (!transfer.confirm(held, stored, sent))
            throw new IllegalStateException(
                    "Server did not confirm the requested transfer. Check inventory and storage before retrying.");
        return withdrawStack(stacks, size, now);
    }

    private Result withdrawStack(List<ItemStack> stacks, int size, long now) {
        String name = Registries.ITEM.getId(item).toString();
        BlockPos key = canonical(target);
        if (transfer.remaining() == 0) {
            if (transfer.confirmed() < withdrawTotal)
                return new Result(
                        false,
                        JobMessages.heldOnly(
                                where(key), transfer.confirmed(), transfer.confirmed(), withdrawTotal, name));
            return new Result(true, JobMessages.withdrew(transfer.confirmed(), name, where(key)));
        }
        if (!transferStack(stacks, size, true))
            return new Result(false, WithdrawTargets.fullMessage(transfer.confirmed(), withdrawTotal, name));
        reopen(now);
        return null;
    }

    /** Moves one batch; false when no destination slot has room. Withdrawals move container to player. */
    private boolean transferStack(List<ItemStack> stacks, int size, boolean withdraw) {
        if (!owned.getCursorStack().isEmpty())
            throw new IllegalStateException("Storage cursor is occupied; take control to clear it.");
        StorageTransfer.Slots slots = StorageTransfer.select(
                withdraw ? 0 : size,
                withdraw ? size : stacks.size(),
                withdraw ? size : 0,
                withdraw ? stacks.size() : size,
                index -> stacks.get(index).isOf(item),
                index -> stacks.get(index).isEmpty(),
                (source, destination) -> {
                    ItemStack from = stacks.get(source), to = stacks.get(destination);
                    if (!to.isEmpty() && !ItemStack.areItemsAndComponentsEqual(to, from)) return 0;
                    return Math.min(
                                    from.getMaxCount(),
                                    owned.getSlot(destination).getMaxItemCount(from))
                            - to.getCount();
                });
        if (slots == null) return false;
        int source = slots.source(), destination = slots.destination();
        ItemStack sourceStack = stacks.get(source);
        sent = StorageTransfer.quantity(transfer.remaining(), sourceStack.getCount(), slots.capacity());
        // A single client-thread batch leaves the cursor empty before any takeover can run.
        click(source, 0);
        if (sent == sourceStack.getCount()) click(destination, 0);
        else {
            for (int i = 0; i < sent; i++) click(destination, 1);
            click(source, 0);
        }
        if (!owned.getCursorStack().isEmpty())
            throw new IllegalStateException(
                    "Transfer left items on the cursor; closing storage to return them to inventory.");
        return true;
    }

    private void click(int slot, int button) {
        client.interactionManager.clickSlot(owned.syncId, slot, button, SlotActionType.PICKUP, client.player);
    }

    private void open(BlockHitResult hit) {
        owned = null;
        openingGeneration = StoragePackets.generation();
        phase = Phase.OPENING;
        phaseStarted = System.nanoTime();
        interact(hit, "The container interaction was not sent to the server.");
    }

    private void interact(BlockHitResult hit, String notSentMessage) {
        opening.expect();
        openingWorld = client.world;
        agentOpening = true;
        try {
            client.interactionManager.interactBlock(client.player, Hand.MAIN_HAND, hit);
        } finally {
            agentOpening = false;
            opening.discardIfUnsent();
        }
        if (!opening.sent()) throw new IllegalStateException(notSentMessage);
    }

    private void nextTarget() {
        target = targets.pollFirst();
        phaseStarted = System.nanoTime();
        if (target == null) {
            phase = Phase.RETURN;
            if (!atStart())
                BaritoneAPI.getProvider()
                        .getPrimaryBaritone()
                        .getCustomGoalProcess()
                        .setGoalAndPath(new GoalBlock(BlockPos.ofFloored(start)));
        } else {
            phase = Phase.APPROACH;
            BaritoneAPI.getSettings().allowBreak.value = false;
            if (visibleHit() == null)
                BaritoneAPI.getProvider()
                        .getPrimaryBaritone()
                        .getCustomGoalProcess()
                        .setGoalAndPath(new GoalGetToBlock(target));
        }
    }

    private boolean atStart() {
        BlockPos block = BlockPos.ofFloored(start);
        Vec3d pos = client.player.getPos();
        return Arrival.inBlock(pos.x, pos.y, pos.z, block.getX(), block.getY(), block.getZ());
    }

    private boolean pathing() {
        var baritone = BaritoneAPI.getProvider().getPrimaryBaritone();
        return baritone.getCustomGoalProcess().isActive()
                || baritone.getPathingBehavior().isPathing();
    }

    /** Raycast stops interaction through walls and only clicks this inventory (including either double-chest half). */
    private BlockHitResult visibleHit() {
        for (BlockPos member : members(target)) {
            Vec3d end = Vec3d.ofCenter(member);
            if (client.player.getEyePos().distanceTo(end) > 4) continue;
            BlockHitResult hit = client.world.raycast(new RaycastContext(
                    client.player.getEyePos(),
                    end,
                    RaycastContext.ShapeType.OUTLINE,
                    RaycastContext.FluidHandling.NONE,
                    client.player));
            if (hit.getBlockPos().equals(member)) return hit;
        }
        return null;
    }

    private void closeOwned() {
        if (owned != null && client.player != null && client.player.currentScreenHandler == owned) {
            var screen = client.currentScreen;
            boolean ownScreen = screen instanceof HandledScreen<?> handled && handled.getScreenHandler() == owned;
            client.player.closeHandledScreen();
            if (screen != null && !ownScreen) client.setScreen(screen);
        }
        owned = null;
    }

    void cancel() {
        opening.cancel();
        boolean samePlayer = actionWorld == client.world && actionPlayer == client.player;
        try {
            // Leftover ingredients go back to the inventory; closing a table also makes the server return them.
            if (samePlayer && crafting != null && crafting.started()) crafting.returnGrid();
        } finally {
            try {
                if (samePlayer) closeOwned();
            } finally {
                crafting = null;
                owned = null;
                phase = null;
                targets = null;
                target = null;
                actionWorld = null;
                actionPlayer = null;
            }
        }
    }

    /**
     * The current deposit's or withdrawal's container once its screen opened, kept after it finishes or is cancelled;
     * otherwise null.
     */
    JsonObject transferContainer() {
        return transferContainer == null ? null : transferContainer.deepCopy();
    }

    private BlockPos nearestCraftingTable() {
        BlockPos nearest = null;
        for (BlockPos pos : BlockPos.iterate(
                client.player.getBlockPos().add(-16, -16, -16),
                client.player.getBlockPos().add(16, 16, 16)))
            if (pos.isWithinDistance(client.player.getPos(), 16)
                    && isCraftingTable(pos)
                    && (nearest == null
                            || pos.getSquaredDistance(client.player.getPos())
                                    < nearest.getSquaredDistance(client.player.getPos()))) nearest = pos.toImmutable();
        return nearest;
    }

    private boolean isCraftingTable(BlockPos pos) {
        return pos != null
                && client.world.isChunkLoaded(pos)
                && client.world.getBlockState(pos).isOf(Blocks.CRAFTING_TABLE);
    }

    /** Places a held crafting table on a free block next to the player, without digging; fails before moving otherwise. */
    private void placeCraftingTable(String output) {
        PlayerInventory inventory = client.player.getInventory();
        int slot = -1;
        for (int index = 0; index < InventoryRoom.MAIN_SLOTS && slot < 0; index++)
            if (inventory.getStack(index).isOf(Items.CRAFTING_TABLE)) slot = index;
        if (slot < 0) throw new IllegalStateException(CraftingRecipes.noTableMessage(output));
        BlockPos spot = freeSpot();
        if (spot == null)
            throw new IllegalStateException("No crafting table within 16 blocks, and no free block next to the player"
                    + " has solid, non-interactive ground to place the held one on.");
        int previous = inventory.selectedSlot;
        if (slot < 9) inventory.selectedSlot = slot;
        else
            // Like eating, swap the table into the selected hotbar slot; the swapped item stays in the inventory.
            client.interactionManager.clickSlot(
                    client.player.playerScreenHandler.syncId, slot, previous, SlotActionType.SWAP, client.player);
        BlockPos below = spot.down();
        BlockHitResult hit = new BlockHitResult(Vec3d.ofCenter(below).add(0, 0.5, 0), Direction.UP, below, false);
        target = spot;
        phase = Phase.PLACING_TABLE;
        phaseStarted = System.nanoTime();
        try {
            interact(hit, "The crafting-table placement was not sent to the server.");
        } finally {
            inventory.selectedSlot = previous;
        }
    }

    /**
     * The nearest replaceable, fluid-free block beside the player (at foot level, then one up) that no entity occupies,
     * above a full solid top face whose block has no screen, block entity, or other use that a click could trigger.
     */
    private BlockPos freeSpot() {
        BlockPos feet = client.player.getBlockPos();
        BlockPos best = null;
        for (int dy = 0; dy <= 1 && best == null; dy++)
            for (int dx = -1; dx <= 1; dx++)
                for (int dz = -1; dz <= 1; dz++) {
                    if (dx == 0 && dz == 0) continue;
                    BlockPos spot = feet.add(dx, dy, dz);
                    BlockPos below = spot.down();
                    BlockState state = client.world.getBlockState(spot);
                    BlockState ground = client.world.getBlockState(below);
                    if (!client.world.isChunkLoaded(spot)
                            || !state.isReplaceable()
                            || !state.getFluidState().isEmpty()
                            || !client.world.canPlace(
                                    Blocks.CRAFTING_TABLE.getDefaultState(), spot, ShapeContext.absent())
                            || !ground.isSideSolidFullSquare(client.world, below, Direction.UP)
                            || ground.hasBlockEntity()
                            || ground.createScreenHandlerFactory(client.world, below) != null
                            || ground.getBlock() instanceof NoteBlock
                            || ground.getBlock() instanceof RespawnAnchorBlock) continue;
                    if (best == null
                            || spot.getSquaredDistance(client.player.getPos())
                                    < best.getSquaredDistance(client.player.getPos())) best = spot;
                }
        return best;
    }

    private String blockName(BlockPos pos) {
        return Registries.BLOCK
                .getId(client.world.getBlockState(pos).getBlock())
                .toString();
    }

    /** Fails before anything moves when a requested position names no inventory this session has opened. */
    private List<BlockPos> requestedTargets(String identity, List<BlockPos> requested) {
        Map<BlockPos, List<BlockPos>> members = new LinkedHashMap<>();
        for (var entry : normalize(identity).entrySet()) {
            List<BlockPos> current = new ArrayList<>();
            for (JsonElement member : entry.getValue().getAsJsonArray("members"))
                current.add(pos(member.getAsJsonObject()));
            members.put(entry.getKey(), current);
        }
        StorageTargets.Resolution<BlockPos> resolution = StorageTargets.resolve(requested, members);
        BlockPos unknown = resolution.unknown();
        if (unknown == null) return resolution.keys();
        if (client.world.isChunkLoaded(unknown) && !isContainer(unknown))
            throw new IllegalStateException("There is no chest or barrel at " + describe(unknown) + ".");
        throw new IllegalStateException("The container at " + describe(unknown)
                + " has not been opened in this session, so it has no contents to refresh.");
    }

    JsonArray observe(String identity) {
        JsonArray result = new JsonArray();
        Map<BlockPos, JsonObject> known = normalize(identity);
        for (JsonObject record : known.values()) result.add(record.deepCopy());
        int extra = 0;
        for (BlockPos pos : nearby())
            if (!known.containsKey(pos)) {
                JsonObject record = at(pos);
                record.addProperty(
                        "name",
                        Registries.BLOCK
                                .getId(client.world.getBlockState(pos).getBlock())
                                .toString());
                record.add("items", null);
                result.add(record);
                if (++extra == 8) break;
            }
        return result;
    }

    private List<BlockPos> nearby() {
        var positions = new LinkedHashSet<BlockPos>();
        for (BlockPos pos : BlockPos.iterate(
                client.player.getBlockPos().add(-16, -16, -16),
                client.player.getBlockPos().add(16, 16, 16)))
            if (pos.isWithinDistance(client.player.getPos(), 16) && isContainer(pos)) positions.add(canonical(pos));
        var sorted = new ArrayList<>(positions);
        sorted.sort(Comparator.comparingDouble(pos -> pos.getSquaredDistance(client.player.getPos())));
        return sorted;
    }

    private boolean isContainer(BlockPos pos) {
        if (pos == null || !client.world.isChunkLoaded(pos)) return false;
        BlockState state = client.world.getBlockState(pos);
        return state.isOf(Blocks.CHEST) || state.isOf(Blocks.TRAPPED_CHEST) || state.isOf(Blocks.BARREL);
    }

    private List<BlockPos> members(BlockPos pos) {
        if (!isContainer(pos)) return List.of(pos);
        BlockState state = client.world.getBlockState(pos);
        if (state.getBlock() instanceof ChestBlock && state.get(ChestBlock.CHEST_TYPE) != ChestType.SINGLE) {
            BlockPos other = pos.offset(ChestBlock.getFacing(state));
            if (client.world.getBlockState(other).isOf(state.getBlock())) return List.of(pos.toImmutable(), other);
        }
        return List.of(pos.toImmutable());
    }

    private BlockPos canonical(BlockPos pos) {
        return members(pos).stream()
                .min(Comparator.comparingInt(BlockPos::getX).thenComparingInt(BlockPos::getZ))
                .orElseThrow();
    }

    /** Topology changes invalidate contents but retain each inventory's first-observed provenance. */
    private Map<BlockPos, JsonObject> normalize(String identity) {
        Map<BlockPos, JsonObject> previous = byIdentity.getOrDefault(identity, Map.of());
        Map<BlockPos, JsonObject> next = new LinkedHashMap<>();
        for (var entry : previous.entrySet()) {
            JsonObject old = entry.getValue();
            var candidates = new LinkedHashSet<BlockPos>();
            for (JsonElement member : old.getAsJsonArray("members")) {
                BlockPos pos = pos(member.getAsJsonObject());
                if (client.world.isChunkLoaded(pos)
                        && (!isContainer(pos)
                                || !Registries.BLOCK
                                        .getId(client.world.getBlockState(pos).getBlock())
                                        .toString()
                                        .equals(old.get("name").getAsString()))) continue;
                candidates.add(canonical(pos));
            }
            for (BlockPos pos : candidates) {
                JsonObject record = old.deepCopy();
                JsonObject existing = next.get(pos);
                JsonArray sources = new JsonArray();
                var ids = new LinkedHashSet<String>();
                if (existing != null)
                    for (JsonElement source : existing.getAsJsonArray("sources"))
                        if (ids.add(source.getAsJsonObject().get("id").getAsString())) sources.add(source.deepCopy());
                for (JsonElement source : old.getAsJsonArray("sources"))
                    if (ids.add(source.getAsJsonObject().get("id").getAsString())) sources.add(source.deepCopy());
                JsonArray members = memberJson(pos);
                if (existing != null || !pos.equals(entry.getKey()) || !members.equals(old.get("members")))
                    record.add("items", null);
                record.addProperty("x", pos.getX());
                record.addProperty("y", pos.getY());
                record.addProperty("z", pos.getZ());
                record.add("members", members);
                record.add("sources", sources);
                Map<String, Integer> totals = new LinkedHashMap<>();
                for (JsonElement source : sources)
                    for (JsonElement item : source.getAsJsonObject().getAsJsonArray("items")) {
                        JsonObject stack = item.getAsJsonObject();
                        totals.merge(
                                stack.get("name").getAsString(),
                                stack.get("count").getAsInt(),
                                Integer::sum);
                    }
                record.add("firstSeen", items(totals));
                next.put(pos, record);
            }
        }
        byIdentity.put(identity, next);
        return next;
    }

    private void record(List<ItemStack> stacks, int size) {
        Map<BlockPos, JsonObject> known = normalize(identity);
        BlockPos key = canonical(target);
        JsonObject previous = known.get(key);
        JsonArray contents = contents(stacks.subList(0, size));
        JsonObject record = at(key);
        record.addProperty(
                "name",
                Registries.BLOCK
                        .getId(client.world.getBlockState(key).getBlock())
                        .toString());
        record.addProperty("observedAt", System.currentTimeMillis());
        record.add("items", contents);
        record.add("members", memberJson(key));
        if (previous == null) {
            JsonObject source = new JsonObject();
            source.addProperty("id", UUID.randomUUID().toString());
            source.add("items", contents.deepCopy());
            JsonArray sources = new JsonArray();
            sources.add(source);
            record.add("sources", sources);
            record.add("firstSeen", contents.deepCopy());
        } else {
            record.add("sources", previous.get("sources").deepCopy());
            record.add("firstSeen", previous.get("firstSeen").deepCopy());
        }
        known.put(key, record);
    }

    private JsonArray memberJson(BlockPos pos) {
        JsonArray result = new JsonArray();
        for (BlockPos member : members(pos)) result.add(at(member));
        return result;
    }

    private static JsonArray contents(List<ItemStack> stacks) {
        Map<String, Integer> totals = new LinkedHashMap<>();
        for (ItemStack stack : stacks)
            if (!stack.isEmpty())
                totals.merge(Registries.ITEM.getId(stack.getItem()).toString(), stack.getCount(), Integer::sum);
        return items(totals);
    }

    private String where(BlockPos pos) {
        return JobMessages.where(blockName(pos), pos.getX(), pos.getY(), pos.getZ());
    }

    private static String describe(BlockPos pos) {
        return pos.getX() + " " + pos.getY() + " " + pos.getZ();
    }

    private static int count(List<ItemStack> stacks, Item item) {
        return stacks.stream()
                .filter(stack -> stack.isOf(item))
                .mapToInt(ItemStack::getCount)
                .sum();
    }

    private static JsonObject at(BlockPos pos) {
        JsonObject result = new JsonObject();
        result.addProperty("x", pos.getX());
        result.addProperty("y", pos.getY());
        result.addProperty("z", pos.getZ());
        return result;
    }

    private static BlockPos pos(JsonObject object) {
        return new BlockPos(
                object.get("x").getAsInt(),
                object.get("y").getAsInt(),
                object.get("z").getAsInt());
    }

    private static JsonArray items(Map<String, Integer> totals) {
        JsonArray result = new JsonArray();
        totals.forEach((name, count) -> {
            JsonObject item = new JsonObject();
            item.addProperty("name", name);
            item.addProperty("count", count);
            result.add(item);
        });
        return result;
    }
}
