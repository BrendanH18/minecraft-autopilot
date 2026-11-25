package dev.minecraftagent;

import baritone.api.BaritoneAPI;
import baritone.api.IBaritone;
import baritone.api.Settings;
import baritone.api.pathing.goals.Goal;
import baritone.api.pathing.goals.GoalBlock;
import baritone.api.pathing.goals.GoalNear;
import baritone.api.utils.input.Input;
import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import net.minecraft.block.Block;
import net.minecraft.client.MinecraftClient;
import net.minecraft.client.gui.screen.DeathScreen;
import net.minecraft.client.gui.screen.GameMenuScreen;
import net.minecraft.client.network.ClientPlayerEntity;
import net.minecraft.client.option.KeyBinding;
import net.minecraft.client.world.ClientWorld;
import net.minecraft.component.DataComponentTypes;
import net.minecraft.entity.mob.HostileEntity;
import net.minecraft.item.Item;
import net.minecraft.item.ItemStack;
import net.minecraft.registry.Registries;
import net.minecraft.registry.tag.ItemTags;
import net.minecraft.screen.slot.SlotActionType;
import net.minecraft.text.Text;
import net.minecraft.util.Hand;
import net.minecraft.util.Identifier;
import net.minecraft.util.WorldSavePath;
import net.minecraft.util.math.BlockPos;
import net.minecraft.util.math.Vec3d;

/** State, player access, and Baritone commands are confined to Minecraft's thread. */
public final class AgentController {
    private static final Set<String> SAFE_FOOD = Set.of(
            "bread",
            "apple",
            "golden_carrot",
            "carrot",
            "baked_potato",
            "cooked_beef",
            "cooked_porkchop",
            "cooked_chicken",
            "cooked_mutton",
            "cooked_rabbit",
            "cooked_cod",
            "cooked_salmon",
            "melon_slice",
            "beetroot");
    private static final Map<String, String> COLLECT_DROPS = Map.ofEntries(
            Map.entry("oak_log", "oak_log"),
            Map.entry("birch_log", "birch_log"),
            Map.entry("spruce_log", "spruce_log"),
            Map.entry("jungle_log", "jungle_log"),
            Map.entry("acacia_log", "acacia_log"),
            Map.entry("dark_oak_log", "dark_oak_log"),
            Map.entry("cherry_log", "cherry_log"),
            Map.entry("mangrove_log", "mangrove_log"),
            Map.entry("dirt", "dirt"),
            Map.entry("cobblestone", "cobblestone"),
            Map.entry("sand", "sand"));
    private static final String BARITONE_DROP_LOADER = "baritone.api.utils.BlockOptionalMeta$ServerLevelStub";
    private final MinecraftClient client;
    private final ControlLease lease = new ControlLease();
    private final Map<String, Object> savedSettings = new HashMap<>();
    private final SavedHomes homes;
    private final FabricStorage storage;
    private JsonObject job;
    private JsonObject action;
    private long jobStarted;
    private final ActionTiming timing = new ActionTiming();
    private int targetCount;
    private int collectRequested;
    private BlockPos destination;
    private BlockPos collectStart;
    private boolean returning;
    private CollectionReturn collectionReturn;
    private long returnStarted;
    private ClientWorld controlledWorld;
    private ClientPlayerEntity controlledPlayer;
    private boolean previousPauseOnLostFocus;
    private boolean eating;
    private long eatStarted;
    private int foodCountBefore;
    private int foodSlot = -1;
    private int previousSlot = -1;
    private boolean recovering;
    private boolean resumeAfterEating;
    private String survivalMessage = "Idle";

    public AgentController(MinecraftClient client) {
        this.client = client;
        storage = new FabricStorage(client);
        homes = new SavedHomes(RuntimePaths.directory(client.runDirectory.toPath(), System.getenv("MC_AGENT_HOME"))
                .resolve("homes.json"));
        if (homes.loadFailure() != null) AgentClient.LOGGER.warn("Saved homes unavailable", homes.loadFailure());
    }

    public JsonObject request(String path, JsonObject body) {
        checkControl();
        switch (path) {
            case "/v1/state":
                return snapshot();
            case "/v1/stop":
                release("Emergency stop requested.");
                return ok();
            case "/v1/control": {
                String operation = string(body, "action");
                String id = string(body, "leaseId");
                switch (operation) {
                    case "acquire": {
                        // Switching to a terminal to start the agent unfocuses the game, which opens the pause menu.
                        boolean focusPaused = focusPaused();
                        if (!focusPaused) requirePlayable();
                        else requireLivingPlayer();
                        if (storage.pendingOpen())
                            throw new IllegalStateException("Previous storage opening is still awaiting the server.");
                        lease.acquire(id);
                        controlledWorld = client.world;
                        controlledPlayer = client.player;
                        previousPauseOnLostFocus = client.options.pauseOnLostFocus;
                        client.options.pauseOnLostFocus = false;
                        if (focusPaused) client.setScreen(null);
                        conservativeSettings();
                        client.player.sendMessage(
                                Text.literal("Minecraft Agent has control. Press F8 to take it back."), true);
                        break;
                    }
                    case "heartbeat":
                        lease.heartbeat(id);
                        break;
                    case "release":
                        lease.require(id);
                        release("Agent session ended.");
                        break;
                    default:
                        throw new IllegalArgumentException("Unknown control operation.");
                }
                return ok();
            }
            case "/v1/actions": {
                lease.require(string(body, "leaseId"));
                requirePlayable();
                if (storage.pendingOpen())
                    throw new IllegalStateException("Previous storage opening is still awaiting the server.");
                if (running()) throw new IllegalStateException("An action is already running. Cancel it first.");
                if (recovering) throw new IllegalStateException("Survival retreat is in progress.");
                return start(body.getAsJsonObject("action"));
            }
            case "/v1/cancel":
                lease.require(string(body, "leaseId"));
                cancel("Cancelled by agent.");
                return ok();
            default:
                throw new IllegalArgumentException("Unknown API endpoint.");
        }
    }

    private JsonObject start(JsonObject requested) {
        String type = string(requested, "type");
        // Validate everything before touching game state.
        BlockPos goal = null;
        int count = 0;
        String block = null;
        double wait = 0;
        Item depositItem = null;
        CraftingRecipes.Recipe recipe = null;
        List<BlockPos> inspectTargets = null;
        switch (type) {
            case "goto":
                goal = new BlockPos(
                        (int) Math.floor(number(requested, "x", -29_999_984, 29_999_984)),
                        (int) Math.floor(number(requested, "y", -64, 320)),
                        (int) Math.floor(number(requested, "z", -29_999_984, 29_999_984)));
                break;
            case "home": {
                JsonObject home = homes.get(identity());
                if (home == null)
                    throw new IllegalStateException(
                            homes.loadFailure() != null
                                    ? homes.loadFailure().getMessage()
                                    : "No usable home is saved for this world, player, and dimension. Use set-home first.");
                goal = new BlockPos(
                        home.get("x").getAsInt(),
                        home.get("y").getAsInt(),
                        home.get("z").getAsInt());
                break;
            }
            case "collect": {
                block = string(requested, "block").replaceFirst("^minecraft:", "");
                if (!COLLECT_DROPS.containsKey(block))
                    throw new IllegalArgumentException("Supported collection targets: " + COLLECT_DROPS.keySet());
                if (block.equals("cobblestone") && !hasPickaxe())
                    throw new IllegalStateException("A pickaxe is required to collect cobblestone.");
                if (!baritoneDropsReady())
                    throw new IllegalStateException(
                            "Baritone is still loading block data. Try again in a few seconds.");
                double quantity = number(requested, "count", 1, 64);
                if (quantity != Math.floor(quantity)) throw new IllegalArgumentException("count must be an integer.");
                count = (int) quantity;
                break;
            }
            case "wait":
                wait = number(requested, "seconds", 1, 3600);
                break;
            case "deposit":
                depositItem = item(string(requested, "item"));
                // Omitted, it stores every held matching item. Too few held fails the job, as on the bot.
                count = requested.has("count") ? integer(requested, "count", 1, 2304) : 0;
                break;
            case "withdraw":
                depositItem = item(string(requested, "item"));
                // Omitted, it takes every matching item from the chosen container.
                count = requested.has("count") ? integer(requested, "count", 1, 2304) : 0;
                break;
            case "craft": {
                String name = string(requested, "item");
                if (!name.matches("(?:minecraft:)?[a-z0-9_]{1,100}"))
                    throw new IllegalArgumentException("Invalid item identifier.");
                recipe = CraftingRecipes.get(name);
                if (recipe == null)
                    throw new IllegalArgumentException("Not a supported crafting output. Craftable: "
                            + String.join(", ", CraftingRecipes.outputs()));
                count = integer(requested, "count", 1, CraftingRecipes.MAX_COUNT);
                break;
            }
            case "inspect_storage":
                if (requested.has("containers")) inspectTargets = containerPositions(requested.get("containers"));
                break;
            case "eat":
            case "set_home":
                break;
            default:
                throw new IllegalArgumentException("Unsupported action: " + type);
        }
        stopMotion();
        endEating();
        resumeAfterEating = false;
        action = requested.deepCopy();
        job = new JsonObject();
        job.addProperty("id", UUID.randomUUID().toString());
        job.addProperty("type", type);
        job.addProperty("status", "running");
        job.addProperty("message", "Started " + type);
        jobStarted = System.nanoTime();
        timing.start(jobStarted, type.equals("wait") ? (long) (wait * 1e9) + 5_000_000_000L : 180_000_000_000L);
        destination = goal;
        returning = false;
        collectionReturn = null;
        try {
            switch (type) {
                case "set_home": {
                    JsonObject home = position(client.player.getBlockPos());
                    homes.save(identity(), home);
                    finish("completed", "Saved home in this world and dimension.");
                    break;
                }
                case "goto":
                case "home":
                    BaritoneAPI.getSettings().allowBreak.value = false;
                    baritone().getCustomGoalProcess().setGoalAndPath(travelGoal());
                    break;
                case "collect":
                    targetCount = inventoryCount(COLLECT_DROPS.get(block)) + count;
                    collectRequested = count;
                    collectStart = client.player.getBlockPos();
                    action.addProperty("block", block);
                    BaritoneAPI.getSettings().allowBreak.value = true;
                    baritone().getMineProcess().mineByName(targetCount, "minecraft:" + block);
                    break;
                case "eat":
                    if (client.player.getHungerManager().isNotFull()) {
                        if (!beginEating())
                            finish("failed", "No supported food in inventory, or an inventory screen is open.");
                    } else finish("completed", "Hunger is already full.");
                    break;
                case "wait":
                    break;
                case "deposit":
                    storage.beginDeposit(
                            identity(),
                            depositItem,
                            count,
                            inventoryCount(Registries.ITEM.getId(depositItem).getPath()));
                    break;
                case "withdraw":
                    storage.beginWithdraw(identity(), depositItem, count);
                    break;
                case "craft":
                    storage.beginCraft(identity(), recipe, count);
                    break;
                case "inspect_storage":
                    storage.beginInspect(identity(), inspectTargets);
                    break;
            }
        } catch (Exception exception) {
            finish("failed", exception.getMessage());
        }
        return job.deepCopy();
    }

    /** Check on requests as well as ticks, before an old lease can submit more work. */
    private void checkControl() {
        storage.maintain();
        if (!lease.active()) return;
        if (lease.expired()) {
            release("Control lease expired; agent stopped responding.");
            return;
        }
        // Servers can send the death screen before the health update.
        if (client.player == null
                || client.world == null
                || client.player.isDead()
                || client.currentScreen instanceof DeathScreen) {
            release("Disconnected or player died.");
            return;
        }
        if (client.world != controlledWorld || client.player != controlledPlayer) {
            release("World or dimension changed. Start a new session explicitly.");
            return;
        }
        if (storage.screenClosedByPlayer()) {
            release("Storage screen was closed or replaced. Control returned to the player.");
            return;
        }
        if (client.isPaused() || (client.currentScreen != null && !storage.ownsScreen())) {
            String screen = client.currentScreen == null
                    ? "pause"
                    : client.currentScreen.getClass().getSimpleName();
            AgentClient.LOGGER.info(
                    "Releasing control: screen {} opened (window focused: {})", screen, client.isWindowFocused());
            release("A game menu was opened (" + screen + "). Control returned to the player.");
        }
    }

    public void tick() {
        checkControl();
        if (!lease.active()) return;
        long now = System.nanoTime();
        // Deadlines are checked before eating, including when consumption never succeeds.
        if (recovering && timing.retreatExpired(now)) {
            stopMotion();
            endEating();
            recovering = false;
            survivalMessage = "Retreat timed out";
            if (running()) finish("failed", "Survival retreat timed out. Check your health and shelter.");
            return;
        }
        if (running() && !recovering && timing.expired(now)) {
            if (returning) finishCollectionReturn(false, "Could not return to the starting point in time.");
            else if (collecting())
                beginReturn(now, CollectionReturn.failed("Collection timed out before reaching the requested quota."));
            else finish("failed", "Action timed out.");
            return;
        }
        if (eating) {
            // Keep food selected; Baritone is stopped while eating.
            client.player.getInventory().selectedSlot = foodSlot;
            client.options.useKey.setPressed(true);
            if (now - eatStarted > 250_000_000L
                    && (inventoryCountOfSlot(foodSlot) < foodCountBefore
                            || !client.player.getHungerManager().isNotFull())) {
                endEating();
                if (running() && string(action, "type").equals("eat")) finish("completed", "Ate food.");
                else if (resumeAfterEating) resumeMotion();
            } else if (now - eatStarted > 5_000_000_000L) {
                endEating();
                timing.eatingFailed(now);
                if (running() && string(action, "type").equals("eat")) finish("failed", "Eating timed out.");
                else if (resumeAfterEating) resumeMotion();
                survivalMessage = "Could not eat.";
            }
            return;
        }
        // Reflexes run locally every tick, independent of model latency.
        if (client.player.getHungerManager().getFoodLevel() <= 16
                && timing.canAutoEat(now, storage.active())
                && beginEating()) {
            resumeAfterEating = running() || recovering;
            if (running()) job.addProperty("message", "Paused to eat.");
            survivalMessage = "Eating";
            return;
        }
        if (client.player.getHealth() <= 8 && !recovering && timing.canRetreat(now)) {
            stopMotion();
            endEating();
            if (storage.active()) {
                storage.cancel();
                finishWithoutStopping(
                        "failed",
                        "Storage action interrupted for survival. Check inventory and storage before retrying.");
            }
            timing.retreatAttempted(now);
            JsonObject home = homes.get(identity());
            if (home != null) {
                destination = new BlockPos(
                        home.get("x").getAsInt(),
                        home.get("y").getAsInt(),
                        home.get("z").getAsInt());
                // Mining can leave the player in a pit; a collection session already permits breaking to get out.
                BaritoneAPI.getSettings().allowBreak.value = collecting();
                baritone().getCustomGoalProcess().setGoalAndPath(new GoalNear(destination, 1));
                timing.startRetreat(now);
                recovering = true;
                survivalMessage = "Low health: retreating home";
                if (running()) job.addProperty("message", survivalMessage);
            } else {
                survivalMessage = "Low health; no saved shelter. Take control or save a home.";
                if (running()) finish("failed", survivalMessage);
            }
        }
        if (recovering) {
            if (nearDestination()) {
                stopMotion();
                recovering = false;
                survivalMessage = "Retreat ended";
                if (running()) finish("failed", "Action interrupted for survival. Check your health and shelter.");
            }
            return;
        }
        if (!running()) return;
        String type = string(action, "type");
        switch (type) {
            case "goto":
            case "home": {
                // Stopping as soon as the player was near cut Baritone off half way up a step, and momentum carried the
                // player off a home platform (#78). Stopping short of the block is accepted only once Baritone stops.
                Vec3d position = client.player.getPos();
                switch (Arrival.state(
                        Arrival.inBlock(
                                position.x,
                                position.y,
                                position.z,
                                destination.getX(),
                                destination.getY(),
                                destination.getZ()),
                        client.player.isOnGround(),
                        baritone().getCustomGoalProcess().isActive()
                                || baritone().getPathingBehavior().isPathing(),
                        nearDestination(),
                        now - jobStarted > 3_000_000_000L)) {
                    case ARRIVED -> finish("completed", "Reached destination.");
                    case STOPPED -> finish("failed", "No path to destination.");
                    case WALKING -> {}
                }
                break;
            }
            case "collect": {
                if (returning) {
                    if (nearDestination()) finishCollectionReturn(true, "Returned to the starting point.");
                    else if (now - returnStarted > 3_000_000_000L
                            && !baritone().getCustomGoalProcess().isActive()
                            && !baritone().getPathingBehavior().isPathing())
                        finishCollectionReturn(false, "Could not return to the starting point.");
                    break;
                }
                String drop = COLLECT_DROPS.get(string(action, "block"));
                int have = inventoryCount(drop);
                job.addProperty("message", "Inventory: " + have + "/" + targetCount);
                if (have >= targetCount) beginReturn(now, CollectionReturn.quotaReached());
                else if (string(action, "block").equals("cobblestone") && !hasPickaxe())
                    beginReturn(now, CollectionReturn.failed("Collection stopped because no pickaxe remains."));
                // Checked every tick: mining stops as soon as no drop could be picked up, not at the 180 s deadline.
                else if (!hasRoomFor(drop))
                    beginReturn(
                            now,
                            CollectionReturn.failed(InventoryRoom.fullMessage(
                                    have - (targetCount - collectRequested),
                                    collectRequested,
                                    string(action, "block"))));
                else if (now - jobStarted > 3_000_000_000L
                        && !baritone().getMineProcess().isActive())
                    beginReturn(now, CollectionReturn.noReachableBlocks());
                break;
            }
            case "wait":
                if (now - jobStarted >= action.get("seconds").getAsDouble() * 1e9)
                    finish("completed", "Wait finished.");
                break;
            case "deposit":
            case "withdraw":
            case "craft":
            case "inspect_storage": {
                FabricStorage.Result result = storage.tick(now);
                if (result != null) finish(result.success() ? "completed" : "failed", result.message());
                break;
            }
        }
    }

    private boolean beginEating() {
        if (client.currentScreen != null || !client.player.getHungerManager().isNotFull()) return false;
        for (int slot = 0; slot < 36; slot++) {
            ItemStack stack = client.player.getInventory().getStack(slot);
            if (stack.isEmpty()
                    || !stack.contains(DataComponentTypes.FOOD)
                    || !SAFE_FOOD.contains(
                            Registries.ITEM.getId(stack.getItem()).getPath())) continue;
            stopMotion();
            previousSlot = client.player.getInventory().selectedSlot;
            foodSlot = slot < 9 ? slot : previousSlot;
            if (slot >= 9)
                client.interactionManager.clickSlot(
                        client.player.playerScreenHandler.syncId, slot, foodSlot, SlotActionType.SWAP, client.player);
            client.player.getInventory().selectedSlot = foodSlot;
            foodCountBefore = inventoryCountOfSlot(foodSlot);
            client.interactionManager.interactItem(client.player, Hand.MAIN_HAND);
            client.options.useKey.setPressed(true);
            eating = true;
            eatStarted = System.nanoTime();
            return true;
        }
        return false;
    }

    private void endEating() {
        if (!eating) return;
        try {
            client.options.useKey.setPressed(false);
            if (client.player != null
                    && client.player == controlledPlayer
                    && client.world == controlledWorld
                    && client.interactionManager != null) {
                try {
                    client.interactionManager.stopUsingItem(client.player);
                } finally {
                    if (previousSlot >= 0) client.player.getInventory().selectedSlot = previousSlot;
                }
            }
        } finally {
            eating = false;
            foodSlot = -1;
            previousSlot = -1;
        }
    }

    private void resumeMotion() {
        resumeAfterEating = false;
        if (recovering || (running() && Set.of("goto", "home").contains(string(action, "type")))) {
            BaritoneAPI.getSettings().allowBreak.value = recovering && collecting();
            baritone().getCustomGoalProcess().setGoalAndPath(travelGoal());
        } else if (collecting()) {
            BaritoneAPI.getSettings().allowBreak.value = true;
            if (returning) baritone().getCustomGoalProcess().setGoalAndPath(new GoalNear(collectStart, 1));
            else baritone().getMineProcess().mineByName(targetCount, "minecraft:" + string(action, "block"));
        }
    }

    /** Mining often digs downward; walk back to the start, breaking blocks if needed, so later navigation is not trapped. */
    private void beginReturn(long now, CollectionReturn reason) {
        stopMotion();
        endEating();
        resumeAfterEating = false;
        collectionReturn = reason;
        returning = true;
        returnStarted = now;
        timing.start(now, 60_000_000_000L);
        destination = collectStart;
        if (nearDestination()) {
            finishCollectionReturn(true, "At the starting point.");
            return;
        }
        job.addProperty("message", reason.returningMessage());
        BaritoneAPI.getSettings().allowBreak.value = true;
        baritone().getCustomGoalProcess().setGoalAndPath(new GoalNear(collectStart, 1));
    }

    private void finishCollectionReturn(boolean returned, String message) {
        int have = inventoryCount(COLLECT_DROPS.get(string(action, "block")));
        CollectionReturn.Outcome outcome = collectionReturn.finish(returned, have, targetCount, message);
        finish(outcome.success() ? "completed" : "failed", outcome.message());
    }

    private boolean collecting() {
        return running() && string(action, "type").equals("collect");
    }

    private void stopMotion() {
        baritone().getPathingBehavior().cancelEverything();
        baritone().getInputOverrideHandler().clearAllKeys();
        for (KeyBinding key : List.of(
                client.options.forwardKey,
                client.options.backKey,
                client.options.leftKey,
                client.options.rightKey,
                client.options.jumpKey,
                client.options.sneakKey,
                client.options.sprintKey,
                client.options.attackKey,
                client.options.useKey)) key.setPressed(false);
        if (client.interactionManager != null) client.interactionManager.cancelBlockBreaking();
    }

    private void finishWithoutStopping(String status, String message) {
        job.addProperty("status", status);
        job.addProperty("message", message);
        // A deposit or withdrawal whose container opened names it on every terminal status: items may have moved before
        // a failure or cancel.
        String type = job.get("type").getAsString();
        JsonObject container = type.equals("deposit") || type.equals("withdraw") ? storage.transferContainer() : null;
        if (container != null) job.add("container", container);
    }

    private void finish(String status, String message) {
        stopMotion();
        endEating();
        storage.cancel();
        finishWithoutStopping(status, message);
    }

    private boolean running() {
        return job != null && job.get("status").getAsString().equals("running");
    }

    private void cancel(String message) {
        try {
            stopMotion();
        } finally {
            try {
                endEating();
            } finally {
                try {
                    storage.cancel();
                } finally {
                    resumeAfterEating = false;
                    recovering = false;
                    if (running()) finishWithoutStopping("cancelled", message);
                }
            }
        }
    }

    boolean hasControl() {
        return lease.active();
    }

    boolean playerStorageInteraction() {
        if (storage.agentOpening()) return true;
        // Navigation opens doors/gates with Baritone's forced use input, not physical player input.
        // Never exempt a click while an agent container opening is unresolved.
        if (storage.navigating()
                && !storage.pendingOpen()
                && baritone().getInputOverrideHandler().isInputForcedDown(Input.CLICK_RIGHT)) return true;
        boolean pending = storage.pendingOpen();
        if (storage.active() || pending)
            release("Player interacted with a block or entity. Control returned to the player.");
        // The vanilla server's ordered acknowledgement disambiguates late opening replies.
        return !pending;
    }

    public void release(String message) {
        if (!lease.active()) return; // Do not interfere with manual play or a user's own Baritone session.
        lease.release();
        survivalMessage = message;
        try {
            cancel(message);
        } finally {
            controlledWorld = null;
            controlledPlayer = null;
            client.options.pauseOnLostFocus = previousPauseOnLostFocus;
            restoreSettings();
        }
    }

    /**
     * Baritone 1.11.3 loads drop tables on first use and then joins work scheduled on this client thread, which deadlocks
     * when that first use is a mining command dispatched here. Start the load at client startup so ticks can finish it.
     */
    public static void prepareBaritoneDrops() {
        try {
            Class.forName(BARITONE_DROP_LOADER, true, AgentController.class.getClassLoader());
        } catch (Throwable throwable) {
            AgentClient.LOGGER.warn("Could not preload Baritone block data", throwable);
        }
    }

    private static boolean baritoneDropsReady() {
        try {
            java.lang.reflect.Field field = Class.forName(
                            BARITONE_DROP_LOADER, false, AgentController.class.getClassLoader())
                    .getDeclaredField("registryAccess");
            field.setAccessible(true);
            CompletableFuture<?> loading = (CompletableFuture<?>) field.get(null);
            return loading != null && loading.isDone() && !loading.isCompletedExceptionally();
        } catch (ReflectiveOperationException | RuntimeException exception) {
            AgentClient.LOGGER.warn("Cannot confirm Baritone block data is loaded", exception);
            return false; // Refuse mining rather than risk freezing the game.
        }
    }

    /** home walks into the saved block, which was standable when saved; goto and a survival retreat stop beside it. */
    private Goal travelGoal() {
        return !recovering && running() && string(action, "type").equals("home")
                ? new GoalBlock(destination)
                : new GoalNear(destination, 1);
    }

    private boolean nearDestination() {
        return destination != null && destination.isWithinDistance(client.player.getPos(), 1.75);
    }

    private IBaritone baritone() {
        return BaritoneAPI.getProvider().getPrimaryBaritone();
    }

    private int inventoryCountOfSlot(int slot) {
        return client.player.getInventory().getStack(slot).getCount();
    }

    private boolean hasPickaxe() {
        for (int slot = 0; slot < 36; slot++) {
            ItemStack stack = client.player.getInventory().getStack(slot);
            if (!stack.isEmpty() && stack.isIn(ItemTags.PICKAXES)) return true;
        }
        return false;
    }

    private boolean hasRoomFor(String item) {
        Item drop = Registries.ITEM.get(Identifier.of("minecraft", item));
        return InventoryRoom.hasRoom(FabricCrafting.mainSlots(client.player.getInventory(), new ItemStack(drop)));
    }

    private int inventoryCount(String item) {
        Item target = Registries.ITEM.get(Identifier.of("minecraft", item));
        int count = 0;
        for (int i = 0; i < 36; i++) {
            ItemStack stack = client.player.getInventory().getStack(i);
            if (stack.isOf(target)) count += stack.getCount();
        }
        return count;
    }

    private String identity() {
        String world = client.getServer() != null
                ? client.getServer()
                        .getSavePath(WorldSavePath.ROOT)
                        .toAbsolutePath()
                        .normalize()
                        .toString()
                : client.getCurrentServerEntry() != null ? client.getCurrentServerEntry().address : "unknown";
        return world + "|" + client.player.getUuid() + "|"
                + client.world.getRegistryKey().getValue();
    }

    /** Only the pause menu that Minecraft opened because the window lost focus; other screens mean the player is busy. */
    private boolean focusPaused() {
        return client.player != null
                && client.world != null
                && client.currentScreen instanceof GameMenuScreen
                && !client.isWindowFocused();
    }

    private void requirePlayable() {
        requireLivingPlayer();
        if (client.isPaused() || client.currentScreen != null)
            throw new IllegalStateException("Close the game menu and resume Minecraft first.");
    }

    private void requireLivingPlayer() {
        if (client.player == null || client.world == null)
            throw new IllegalStateException("Enter a Minecraft world first.");
        if (client.player.isDead() || client.currentScreen instanceof DeathScreen)
            throw new IllegalStateException("Respawn manually first.");
    }

    public JsonObject snapshot() {
        JsonObject state = new JsonObject();
        state.addProperty("protocol", 1);
        state.addProperty("backend", "fabric");
        state.addProperty("connected", client.player != null && client.world != null);
        state.addProperty("mode", lease.active() ? "agent" : "manual");
        state.addProperty("paused", client.isPaused() || (client.currentScreen != null && !storage.ownsScreen()));
        state.addProperty("focusPaused", focusPaused());
        state.addProperty("survival", survivalMessage);
        state.addProperty("recovering", recovering);
        state.addProperty("stopping", storage.pendingOpen() && !storage.active());
        state.add("job", job == null ? null : job.deepCopy());
        if (client.player != null && client.world != null) {
            JsonObject player = new JsonObject();
            player.addProperty("name", client.player.getName().getString());
            player.addProperty("uuid", client.player.getUuidAsString());
            player.addProperty("health", client.player.getHealth());
            player.addProperty("hunger", client.player.getHungerManager().getFoodLevel());
            player.addProperty(
                    "dimension", client.world.getRegistryKey().getValue().toString());
            JsonObject coordinates = new JsonObject();
            coordinates.addProperty("x", client.player.getX());
            coordinates.addProperty("y", client.player.getY());
            coordinates.addProperty("z", client.player.getZ());
            player.add("position", coordinates);
            state.add("player", player);
            JsonArray inventory = new JsonArray();
            for (int i = 0; i < 36; i++) {
                ItemStack stack = client.player.getInventory().getStack(i);
                if (stack.isEmpty()) continue;
                JsonObject item = new JsonObject();
                item.addProperty("slot", i);
                item.addProperty("name", Registries.ITEM.getId(stack.getItem()).toString());
                item.addProperty("count", stack.getCount());
                inventory.add(item);
            }
            state.add("inventory", inventory);
            state.add("containers", storage.observe(identity()));
            state.add("home", homes.get(identity()));
            JsonArray threats = new JsonArray();
            for (HostileEntity entity : client.world.getEntitiesByClass(
                    HostileEntity.class, client.player.getBoundingBox().expand(16), entity -> entity.isAlive())) {
                JsonObject threat = new JsonObject();
                threat.addProperty(
                        "type", Registries.ENTITY_TYPE.getId(entity.getType()).toString());
                threat.addProperty("distance", entity.distanceTo(client.player));
                threat.addProperty("x", entity.getX());
                threat.addProperty("y", entity.getY());
                threat.addProperty("z", entity.getZ());
                threats.add(threat);
                if (threats.size() >= 16) break;
            }
            state.add("threats", threats);
            JsonArray blocks = new JsonArray();
            Map<String, Integer> found = new HashMap<>();
            for (BlockPos pos : BlockPos.iterate(
                    client.player.getBlockPos().add(-12, -4, -12),
                    client.player.getBlockPos().add(12, 8, 12))) {
                if (!client.world.isChunkLoaded(pos)) continue;
                Block block = client.world.getBlockState(pos).getBlock();
                String name = Registries.BLOCK.getId(block).getPath();
                // Crafting tables are reported too, so a planner can see where table recipes will be crafted.
                if (!(COLLECT_DROPS.containsKey(name) || name.equals("crafting_table"))
                        || found.getOrDefault(name, 0) >= 3) continue;
                JsonObject entry = position(pos);
                entry.addProperty("name", "minecraft:" + name);
                blocks.add(entry);
                found.merge(name, 1, Integer::sum);
            }
            state.add("blocks", blocks);
        }
        return state;
    }

    private void conservativeSettings() {
        Settings settings = BaritoneAPI.getSettings();
        setting("allowBreak", settings.allowBreak, false);
        setting("allowPlace", settings.allowPlace, false);
        setting("allowSprint", settings.allowSprint, false);
        setting("allowParkour", settings.allowParkour, false);
        setting("allowParkourPlace", settings.allowParkourPlace, false);
        setting("allowWaterBucketFall", settings.allowWaterBucketFall, false);
        setting("exploreForBlocks", settings.exploreForBlocks, false);
    }

    private <T> void setting(String name, Settings.Setting<T> setting, T value) {
        savedSettings.put(name, setting.value);
        setting.value = value;
    }

    @SuppressWarnings("unchecked")
    private void restoreSettings() {
        for (Map.Entry<String, Object> entry : savedSettings.entrySet()) {
            try {
                Settings.Setting<Object> setting = (Settings.Setting<Object>)
                        Settings.class.getField(entry.getKey()).get(BaritoneAPI.getSettings());
                setting.value = entry.getValue();
            } catch (ReflectiveOperationException exception) {
                AgentClient.LOGGER.warn("Could not restore Baritone setting {}", entry.getKey(), exception);
            }
        }
        savedSettings.clear();
    }

    private static JsonObject position(BlockPos pos) {
        JsonObject json = new JsonObject();
        json.addProperty("x", pos.getX());
        json.addProperty("y", pos.getY());
        json.addProperty("z", pos.getZ());
        return json;
    }

    private static JsonObject ok() {
        JsonObject result = new JsonObject();
        result.addProperty("ok", true);
        return result;
    }

    private static String string(JsonObject object, String key) {
        if (object == null
                || !object.has(key)
                || !object.get(key).isJsonPrimitive()
                || !object.getAsJsonPrimitive(key).isString())
            throw new IllegalArgumentException("Missing or invalid " + key);
        return object.get(key).getAsString();
    }
    /** A scoped inspect_storage's integer block positions; the client validates them too, but the bridge does not rely on it. */
    private static List<BlockPos> containerPositions(JsonElement value) {
        if (!value.isJsonArray()
                || value.getAsJsonArray().size() == 0
                || value.getAsJsonArray().size() > StorageTargets.MAX_REQUESTED)
            throw new IllegalArgumentException(
                    "containers must list 1 to " + StorageTargets.MAX_REQUESTED + " block positions.");
        List<BlockPos> positions = new ArrayList<>();
        for (JsonElement element : value.getAsJsonArray()) {
            JsonObject position = element.isJsonObject() ? element.getAsJsonObject() : null;
            positions.add(new BlockPos(
                    integer(position, "x", -29_999_984, 29_999_984),
                    integer(position, "y", -64, 320),
                    integer(position, "z", -29_999_984, 29_999_984)));
        }
        return positions;
    }

    /** A namespaced or bare item identifier that names a registered item. */
    private static Item item(String name) {
        if (!name.matches("(?:minecraft:)?[a-z0-9_]{1,100}"))
            throw new IllegalArgumentException("Invalid item identifier.");
        Identifier id = Identifier.of(name.contains(":") ? name : "minecraft:" + name);
        if (!Registries.ITEM.containsId(id) || id.getPath().equals("air"))
            throw new IllegalArgumentException("Unknown item " + name);
        return Registries.ITEM.get(id);
    }

    private static int integer(JsonObject object, String key, int min, int max) {
        double value = number(object, key, min, max);
        if (value != Math.floor(value)) throw new IllegalArgumentException(key + " must be an integer.");
        return (int) value;
    }

    private static double number(JsonObject object, String key, double min, double max) {
        if (object == null
                || !object.has(key)
                || !object.get(key).isJsonPrimitive()
                || !object.getAsJsonPrimitive(key).isNumber())
            throw new IllegalArgumentException("Missing or invalid " + key);
        double value = object.get(key).getAsDouble();
        if (!Double.isFinite(value) || value < min || value > max)
            throw new IllegalArgumentException(key + " is out of range.");
        return value;
    }
}
