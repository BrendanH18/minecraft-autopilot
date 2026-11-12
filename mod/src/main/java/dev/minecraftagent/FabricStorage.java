package dev.minecraftagent;

import baritone.api.BaritoneAPI;
import baritone.api.pathing.goals.GoalGetToBlock;
import baritone.api.pathing.goals.GoalNear;
import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import net.minecraft.block.BlockState;
import net.minecraft.block.Blocks;
import net.minecraft.block.ChestBlock;
import net.minecraft.block.enums.ChestType;
import net.minecraft.client.MinecraftClient;
import net.minecraft.client.gui.screen.ingame.GenericContainerScreen;
import net.minecraft.item.Item;
import net.minecraft.item.ItemStack;
import net.minecraft.registry.Registries;
import net.minecraft.screen.GenericContainerScreenHandler;
import net.minecraft.screen.slot.SlotActionType;
import net.minecraft.util.Hand;
import net.minecraft.util.hit.BlockHitResult;
import net.minecraft.util.math.BlockPos;
import net.minecraft.util.math.Vec3d;
import net.minecraft.world.RaycastContext;

import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/** Bounded vanilla chest/barrel actions; all access is on the Minecraft client thread. */
final class FabricStorage {
    record Result(boolean success, String message) {}
    private enum Phase { APPROACH, OPENING, RETURN }
    private final MinecraftClient client;
    private final Map<String, Map<BlockPos, JsonObject>> byIdentity = new LinkedHashMap<>();
    private String identity;
    private ArrayDeque<BlockPos> targets;
    private BlockPos target;
    private Vec3d start;
    private Phase phase;
    private long phaseStarted;
    private long openingGeneration;
    private GenericContainerScreenHandler owned;
    private final StorageOpening opening = new StorageOpening();
    private boolean agentOpening;
    private Object openingWorld;
    private Item item;
    private int amount;
    private StorageTransfer transfer;
    private int sent;

    FabricStorage(MinecraftClient client) { this.client = client; StoragePackets.attach(this); }
    boolean active() { return phase != null; }

    void begin(String identity, Item item, int amount) {
        this.identity = identity;
        this.item = item;
        this.amount = amount;
        transfer = null;
        sent = 0;
        start = client.player.getPos();
        targets = new ArrayDeque<>(item == null ? normalize(identity).keySet() : nearby());
        if (item != null && targets.isEmpty()) throw new IllegalStateException("No chest or barrel within 16 blocks. Move near storage first.");
        if (item != null) targets = new ArrayDeque<>(List.of(targets.getFirst()));
        nextTarget();
    }

    boolean pendingOpen() { return opening.pending(); }
    boolean agentOpening() { return agentOpening; }
    void interactionSent(int sequence) { opening.sent(sequence); }
    void acknowledged(int sequence) { opening.acknowledge(sequence); }
    void maintain() { if (openingWorld != client.world) opening.reset(); }

    /** Bind at packet delivery, before F8/stop/expiry can run on the next tick. */
    void screenOpened() {
        if (client.player == null || !opening.pending() || !(client.player.currentScreenHandler instanceof GenericContainerScreenHandler handler)) return;
        if (!opening.mayOwnReply()) {
            owned = handler;
            closeOwned();
            return;
        }
        if (owned == null && phase == Phase.OPENING && handler.getRows() == (members(target).size() == 2 ? 6 : 3)) owned = handler;
    }

    /** Only the handler bound to the agent's outstanding interaction is exempt. */
    boolean ownsScreen() {
        return phase == Phase.OPENING && owned != null && client.currentScreen instanceof GenericContainerScreen screen
                && screen.getScreenHandler() == owned && client.player.currentScreenHandler == owned;
    }

    boolean screenClosedByPlayer() { return owned != null && !ownsScreen(); }

    Result tick(long now) {
        if (!active()) return null;
        try {
            if (phase == Phase.RETURN) {
                if (client.player.getPos().distanceTo(start) <= 1.75) return new Result(true, "Refreshed previously opened storage from the server and returned to inspection start.");
                if (now - phaseStarted > 3_000_000_000L && !pathing()) throw new IllegalStateException("Storage refreshed, but could not return to inspection start.");
                return null;
            }
            if (target == null) return new Result(true, "No previously opened storage to refresh.");
            if (!isContainer(target)) throw new IllegalStateException("The container disappeared before it could be inspected.");
            if (client.player.getPos().distanceTo(Vec3d.ofCenter(target)) > 16) throw new IllegalStateException("Storage requires containers within 16 blocks. Return near storage first.");
            if (phase == Phase.APPROACH) {
                if (opening.pending()) return null;
                BlockHitResult hit = visibleHit();
                if (hit != null) {
                    BaritoneAPI.getProvider().getPrimaryBaritone().getPathingBehavior().cancelEverything();
                    open(hit);
                } else if (now - phaseStarted > 3_000_000_000L && !pathing()) throw new IllegalStateException("Could not reach the container.");
                return null;
            }
            if (now - phaseStarted > 5_000_000_000L) throw new IllegalStateException("The container did not open with fresh server contents; its lid may be blocked.");
            if (owned == null || !StoragePackets.ready(owned.syncId, openingGeneration, owned.slots.size())) return null;
            List<ItemStack> stacks = StoragePackets.contents();
            int size = owned.getRows() * 9;
            record(stacks, size);
            if (item == null) {
                closeOwned();
                nextTarget();
                return null;
            }
            int stored = count(stacks.subList(0, size), item);
            int held = count(stacks.subList(size, stacks.size()), item);
            if (transfer == null) transfer = new StorageTransfer(amount, stored, held);
            else if (!transfer.confirm(stored, held, sent)) throw new IllegalStateException("Server did not confirm the requested transfer. Check inventory and storage before retrying.");
            if (transfer.remaining() == 0) return new Result(true, "Deposited " + transfer.confirmed() + " " + Registries.ITEM.getId(item) + " into storage.");
            transferStack(stacks, size);
            // Accepted predicted clicks need not produce slot echoes. Reopen for an authoritative inventory packet.
            closeOwned();
            phase = Phase.APPROACH;
            phaseStarted = now;
            return null;
        } catch (RuntimeException exception) {
            return new Result(false, exception.getMessage() + (transfer == null ? "" : " Confirmed deposited: " + transfer.confirmed() + " of " + amount + "."));
        }
    }

    private void transferStack(List<ItemStack> stacks, int size) {
        if (!owned.getCursorStack().isEmpty()) throw new IllegalStateException("Storage cursor is occupied; take control to clear it.");
        int source = -1;
        for (int i = size; i < stacks.size(); i++) if (stacks.get(i).isOf(item)) { source = i; break; }
        if (source < 0) throw new IllegalStateException("No matching item remains in inventory.");
        ItemStack sourceStack = stacks.get(source);
        int destination = -1;
        int capacity = 0;
        for (int i = 0; i < size; i++) {
            ItemStack stack = stacks.get(i);
            if (!stack.isEmpty() && !ItemStack.areItemsAndComponentsEqual(stack, sourceStack)) continue;
            int room = Math.min(sourceStack.getMaxCount(), owned.getSlot(i).getMaxItemCount(sourceStack)) - stack.getCount();
            if (room > 0) { destination = i; capacity = room; break; }
        }
        sent = StorageTransfer.quantity(transfer.remaining(), sourceStack.getCount(), capacity);
        if (sent == 0) throw new IllegalStateException("The container is full.");
        // A single client-thread batch leaves the cursor empty before any takeover can run.
        click(source, 0);
        if (sent == sourceStack.getCount()) click(destination, 0);
        else {
            for (int i = 0; i < sent; i++) click(destination, 1);
            click(source, 0);
        }
        if (!owned.getCursorStack().isEmpty()) throw new IllegalStateException("Transfer left items on the cursor; closing storage to return them to inventory.");
    }

    private void click(int slot, int button) { client.interactionManager.clickSlot(owned.syncId, slot, button, SlotActionType.PICKUP, client.player); }

    private void open(BlockHitResult hit) {
        owned = null;
        openingGeneration = StoragePackets.generation();
        phase = Phase.OPENING;
        phaseStarted = System.nanoTime();
        opening.expect();
        openingWorld = client.world;
        agentOpening = true;
        try { client.interactionManager.interactBlock(client.player, Hand.MAIN_HAND, hit); }
        finally { agentOpening = false; }
        if (!opening.sent()) { opening.reset(); throw new IllegalStateException("The container interaction was not sent to the server."); }

    }

    private void nextTarget() {
        target = targets.pollFirst();
        phaseStarted = System.nanoTime();
        if (target == null) {
            phase = Phase.RETURN;
            if (client.player.getPos().distanceTo(start) > 1.75)
                BaritoneAPI.getProvider().getPrimaryBaritone().getCustomGoalProcess().setGoalAndPath(new GoalNear(BlockPos.ofFloored(start), 1));
        } else {
            phase = Phase.APPROACH;
            BaritoneAPI.getSettings().allowBreak.value = false;
            if (visibleHit() == null) BaritoneAPI.getProvider().getPrimaryBaritone().getCustomGoalProcess().setGoalAndPath(new GoalGetToBlock(target));
        }
    }

    void resume() {
        if (phase == Phase.APPROACH && target != null) BaritoneAPI.getProvider().getPrimaryBaritone().getCustomGoalProcess().setGoalAndPath(new GoalGetToBlock(target));
        else if (phase == Phase.RETURN) BaritoneAPI.getProvider().getPrimaryBaritone().getCustomGoalProcess().setGoalAndPath(new GoalNear(BlockPos.ofFloored(start), 1));
    }

    private boolean pathing() {
        var baritone = BaritoneAPI.getProvider().getPrimaryBaritone();
        return baritone.getCustomGoalProcess().isActive() || baritone.getPathingBehavior().isPathing();
    }

    /** Raycast stops interaction through walls and only clicks this inventory (including either double-chest half). */
    private BlockHitResult visibleHit() {
        for (BlockPos member : members(target)) {
            Vec3d end = Vec3d.ofCenter(member);
            if (client.player.getEyePos().distanceTo(end) > 4) continue;
            BlockHitResult hit = client.world.raycast(new RaycastContext(client.player.getEyePos(), end, RaycastContext.ShapeType.OUTLINE, RaycastContext.FluidHandling.NONE, client.player));
            if (hit.getBlockPos().equals(member)) return hit;
        }
        return null;
    }

    private void closeOwned() {
        if (owned != null && client.player != null && client.player.currentScreenHandler == owned) {
            var screen = client.currentScreen;
            boolean ownScreen = screen instanceof GenericContainerScreen container && container.getScreenHandler() == owned;
            client.player.closeHandledScreen();
            if (screen != null && !ownScreen) client.setScreen(screen);
        }
        owned = null;
    }

    void cancel() { opening.cancel(); closeOwned(); phase = null; targets = null; target = null; }

    JsonArray observe(String identity) {
        JsonArray result = new JsonArray();
        Map<BlockPos, JsonObject> known = normalize(identity);
        for (JsonObject record : known.values()) result.add(record.deepCopy());
        int extra = 0;
        for (BlockPos pos : nearby()) if (!known.containsKey(pos)) {
            JsonObject record = at(pos);
            record.addProperty("name", Registries.BLOCK.getId(client.world.getBlockState(pos).getBlock()).toString());
            record.add("items", null);
            result.add(record);
            if (++extra == 8) break;
        }
        return result;
    }

    private List<BlockPos> nearby() {
        var positions = new LinkedHashSet<BlockPos>();
        for (BlockPos pos : BlockPos.iterate(client.player.getBlockPos().add(-16, -16, -16), client.player.getBlockPos().add(16, 16, 16)))
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
        return members(pos).stream().min(Comparator.comparingInt(BlockPos::getX).thenComparingInt(BlockPos::getZ)).orElseThrow();
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
                if (client.world.isChunkLoaded(pos) && (!isContainer(pos) || !Registries.BLOCK.getId(client.world.getBlockState(pos).getBlock()).toString().equals(old.get("name").getAsString()))) continue;
                candidates.add(canonical(pos));
            }
            for (BlockPos pos : candidates) {
                JsonObject record = old.deepCopy();
                JsonObject existing = next.get(pos);
                JsonArray sources = new JsonArray();
                var ids = new LinkedHashSet<String>();
                if (existing != null) for (JsonElement source : existing.getAsJsonArray("sources")) if (ids.add(source.getAsJsonObject().get("id").getAsString())) sources.add(source.deepCopy());
                for (JsonElement source : old.getAsJsonArray("sources")) if (ids.add(source.getAsJsonObject().get("id").getAsString())) sources.add(source.deepCopy());
                JsonArray members = memberJson(pos);
                if (existing != null || !pos.equals(entry.getKey()) || !members.equals(old.get("members"))) record.add("items", null);
                record.addProperty("x", pos.getX()); record.addProperty("y", pos.getY()); record.addProperty("z", pos.getZ());
                record.add("members", members); record.add("sources", sources);
                Map<String, Integer> totals = new LinkedHashMap<>();
                for (JsonElement source : sources) for (JsonElement item : source.getAsJsonObject().getAsJsonArray("items")) {
                    JsonObject stack = item.getAsJsonObject();
                    totals.merge(stack.get("name").getAsString(), stack.get("count").getAsInt(), Integer::sum);
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
        Map<String, Integer> totals = new LinkedHashMap<>();
        for (ItemStack stack : stacks.subList(0, size)) if (!stack.isEmpty()) totals.merge(Registries.ITEM.getId(stack.getItem()).toString(), stack.getCount(), Integer::sum);
        JsonArray contents = items(totals);
        JsonObject record = at(key);
        record.addProperty("name", Registries.BLOCK.getId(client.world.getBlockState(key).getBlock()).toString());
        record.addProperty("observedAt", System.currentTimeMillis());
        record.add("items", contents);
        record.add("members", memberJson(key));
        if (previous == null) {
            JsonObject source = new JsonObject(); source.addProperty("id", UUID.randomUUID().toString()); source.add("items", contents.deepCopy());
            JsonArray sources = new JsonArray(); sources.add(source);
            record.add("sources", sources); record.add("firstSeen", contents.deepCopy());
        } else {
            record.add("sources", previous.get("sources").deepCopy()); record.add("firstSeen", previous.get("firstSeen").deepCopy());
        }
        known.put(key, record);
    }

    private JsonArray memberJson(BlockPos pos) { JsonArray result = new JsonArray(); for (BlockPos member : members(pos)) result.add(at(member)); return result; }
    private static int count(List<ItemStack> stacks, Item item) { return stacks.stream().filter(stack -> stack.isOf(item)).mapToInt(ItemStack::getCount).sum(); }
    private static JsonObject at(BlockPos pos) { JsonObject result = new JsonObject(); result.addProperty("x", pos.getX()); result.addProperty("y", pos.getY()); result.addProperty("z", pos.getZ()); return result; }
    private static BlockPos pos(JsonObject object) { return new BlockPos(object.get("x").getAsInt(), object.get("y").getAsInt(), object.get("z").getAsInt()); }
    private static JsonArray items(Map<String, Integer> totals) { JsonArray result = new JsonArray(); totals.forEach((name, count) -> { JsonObject item = new JsonObject(); item.addProperty("name", name); item.addProperty("count", count); result.add(item); }); return result; }
}
