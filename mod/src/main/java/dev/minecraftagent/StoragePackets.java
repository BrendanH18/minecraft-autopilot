package dev.minecraftagent;

import net.minecraft.item.ItemStack;
import net.minecraft.network.packet.s2c.play.InventoryS2CPacket;
import net.minecraft.network.packet.s2c.play.ScreenHandlerSlotUpdateS2CPacket;

import java.util.ArrayList;
import java.util.List;

/** Server inventory mirror. Client clickSlot mutates the screen handler speculatively. Client thread only. */
public final class StoragePackets {
    private static int syncId = -1;
    private static long generation;
    private static List<ItemStack> contents = List.of();
    private static ItemStack cursor = ItemStack.EMPTY;

    private static FabricStorage storage;
    static void attach(FabricStorage value) { storage = value; }
    public static void screenOpened() { if (storage != null) storage.screenOpened(); }
    public static void interactionSent(int sequence) { if (storage != null && storage.agentOpening()) storage.interactionSent(sequence); }
    public static void acknowledged(int sequence) { if (storage != null) storage.acknowledged(sequence); }

    private StoragePackets() {}

    public static void inventory(InventoryS2CPacket packet) {
        syncId = packet.getSyncId();
        contents = new ArrayList<>();
        for (ItemStack stack : packet.getContents()) contents.add(stack.copy());
        cursor = packet.getCursorStack().copy();
        generation++;
    }

    public static void slot(ScreenHandlerSlotUpdateS2CPacket packet) {
        if (packet.getSyncId() == -1) cursor = packet.getStack().copy();
        else if (packet.getSyncId() == syncId && packet.getSlot() >= 0 && packet.getSlot() < contents.size())
            contents.set(packet.getSlot(), packet.getStack().copy());
    }

    static long generation() { return generation; }
    static boolean ready(int id, long after, int size) { return syncId == id && generation > after && contents.size() == size && cursor.isEmpty(); }
    static List<ItemStack> contents() { return contents; }
}
