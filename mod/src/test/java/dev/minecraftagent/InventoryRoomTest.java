package dev.minecraftagent;

import static org.junit.jupiter.api.Assertions.*;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import org.junit.jupiter.api.Test;

class InventoryRoomTest {
    private static final InventoryRoom.Slot COBBLE = new InventoryRoom.Slot("minecraft:cobblestone", 64, 64);
    private static final String LOG = "minecraft:oak_log";

    private static List<InventoryRoom.Slot> full() {
        return new ArrayList<>(Collections.nCopies(InventoryRoom.MAIN_SLOTS, COBBLE));
    }

    @Test
    void anEmptyMainSlotIsRoom() {
        List<InventoryRoom.Slot> slots = full();
        slots.set(20, InventoryRoom.Slot.EMPTY);
        assertTrue(InventoryRoom.hasRoom(slots, LOG));
        slots.set(20, new InventoryRoom.Slot("minecraft:air", 0, 64));
        assertTrue(InventoryRoom.hasRoom(slots, LOG), "a zero-count stack is empty");
    }

    @Test
    void aPartialStackOfTheDropIsRoomWithoutAnEmptySlot() {
        List<InventoryRoom.Slot> slots = full();
        slots.set(3, new InventoryRoom.Slot(LOG, 63, 64));
        assertTrue(InventoryRoom.hasRoom(slots, LOG));
    }

    @Test
    void aFullInventoryOfOtherItemsHasNoRoom() {
        List<InventoryRoom.Slot> slots = full();
        slots.set(5, new InventoryRoom.Slot("minecraft:dirt", 12, 64));
        assertFalse(InventoryRoom.hasRoom(slots, LOG), "a partial stack of another item cannot take the drop");
    }

    @Test
    void fullStacksOfTheDropHaveNoRoom() {
        List<InventoryRoom.Slot> slots =
                new ArrayList<>(Collections.nCopies(InventoryRoom.MAIN_SLOTS, new InventoryRoom.Slot(LOG, 64, 64)));
        assertFalse(InventoryRoom.hasRoom(slots, LOG));
        slots.set(0, new InventoryRoom.Slot("minecraft:ender_pearl", 16, 16));
        assertFalse(
                InventoryRoom.hasRoom(slots, "minecraft:ender_pearl"),
                "the item's own stack size bounds a partial stack");
        slots.set(0, new InventoryRoom.Slot("minecraft:ender_pearl", 15, 16));
        assertTrue(InventoryRoom.hasRoom(slots, "minecraft:ender_pearl"));
    }

    @Test
    void armourAndOffhandSlotsNeverCount() {
        // Player inventory order: 36 main slots, then 4 armour slots and the offhand.
        List<InventoryRoom.Slot> slots = full();
        for (int slot = 0; slot < 4; slot++) slots.add(InventoryRoom.Slot.EMPTY);
        slots.add(new InventoryRoom.Slot(LOG, 1, 64));
        assertFalse(InventoryRoom.hasRoom(slots, LOG));
        assertFalse(InventoryRoom.hasRoom(List.of(), LOG));
    }

    @Test
    void failureMessageMatchesTheSharedPatternAndNeverGoesNegative() {
        assertEquals("Inventory full; collected 3 of 8 oak_log.", InventoryRoom.fullMessage(3, 8, "oak_log"));
        assertEquals("Inventory full; collected 0 of 8 oak_log.", InventoryRoom.fullMessage(-2, 8, "oak_log"));
        assertTrue(InventoryRoom.fullMessage(0, 64, "cobblestone")
                .matches("Inventory full; collected \\d+ of \\d+ \\w+\\."));
    }
}
