package dev.minecraftagent;

import java.util.List;

/** Whether a collection drop can still be picked up, decided from plain slot data so it tests without the game. */
final class InventoryRoom {
    /** Pickups land in the hotbar and main inventory (slots 0-35); armour, offhand, and crafting slots never count. */
    static final int MAIN_SLOTS = 36;

    /** One inventory slot: an item id (null when empty), its count, and that item's maximum stack size. */
    record Slot(String item, int count, int maxCount) {
        static final Slot EMPTY = new Slot(null, 0, 0);

        boolean empty() {
            return item == null || count <= 0;
        }
    }

    private InventoryRoom() {}

    /** Room means an empty main slot, or a main-slot stack of the drop with space left. Slots past the main 36 are ignored. */
    static boolean hasRoom(List<Slot> slots, String drop) {
        for (int index = 0; index < Math.min(MAIN_SLOTS, slots.size()); index++) {
            Slot slot = slots.get(index);
            if (slot.empty() || (slot.item().equals(drop) && slot.count() < slot.maxCount())) return true;
        }
        return false;
    }

    /**
     * How many of {@code item} (stacking to {@code maxCount}) the main slots can still take: an empty slot takes a full
     * stack, a matching stack its remaining space.
     */
    static int capacity(List<Slot> slots, String item, int maxCount) {
        int room = 0;
        for (int index = 0; index < Math.min(MAIN_SLOTS, slots.size()); index++) {
            Slot slot = slots.get(index);
            if (slot.empty()) room += maxCount;
            else if (slot.item().equals(item)) room += Math.max(0, slot.maxCount() - slot.count());
        }
        return room;
    }

    /** The shared failure sentence; items collected so far never reads below zero (e.g. after eating or dropping some). */
    static String fullMessage(int collected, int requested, String block) {
        return "Inventory full; collected " + Math.max(0, collected) + " of " + requested + " " + block + ".";
    }
}
