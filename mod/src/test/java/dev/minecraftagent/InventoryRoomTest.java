package dev.minecraftagent;

import static org.junit.jupiter.api.Assertions.*;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import org.junit.jupiter.api.Test;

class InventoryRoomTest {
    private static final InventoryRoom.Slot OTHER = new InventoryRoom.Slot(false, 64, 64);

    private static List<InventoryRoom.Slot> full() {
        return new ArrayList<>(Collections.nCopies(InventoryRoom.MAIN_SLOTS, OTHER));
    }

    @Test
    void anEmptyMainSlotIsRoom() {
        List<InventoryRoom.Slot> slots = full();
        slots.set(20, InventoryRoom.Slot.EMPTY);
        assertTrue(InventoryRoom.hasRoom(slots));
        slots.set(20, new InventoryRoom.Slot(false, 0, 64));
        assertTrue(InventoryRoom.hasRoom(slots), "a zero-count stack is empty");
    }

    @Test
    void aPartialStackOfTheDropIsRoomWithoutAnEmptySlot() {
        List<InventoryRoom.Slot> slots = full();
        slots.set(3, new InventoryRoom.Slot(true, 63, 64));
        assertTrue(InventoryRoom.hasRoom(slots));
    }

    @Test
    void aFullInventoryOfOtherItemsHasNoRoom() {
        List<InventoryRoom.Slot> slots = full();
        slots.set(5, new InventoryRoom.Slot(false, 12, 64));
        assertFalse(InventoryRoom.hasRoom(slots), "a partial stack of another item cannot take the drop");
    }

    @Test
    void fullStacksOfTheDropHaveNoRoom() {
        List<InventoryRoom.Slot> slots =
                new ArrayList<>(Collections.nCopies(InventoryRoom.MAIN_SLOTS, new InventoryRoom.Slot(true, 64, 64)));
        assertFalse(InventoryRoom.hasRoom(slots));
        slots.set(0, new InventoryRoom.Slot(true, 16, 16));
        assertFalse(InventoryRoom.hasRoom(slots), "the item's own stack size bounds a partial stack");
        slots.set(0, new InventoryRoom.Slot(true, 15, 16));
        assertTrue(InventoryRoom.hasRoom(slots));
    }

    @Test
    void armourAndOffhandSlotsNeverCount() {
        // Player inventory order: 36 main slots, then 4 armour slots and the offhand.
        List<InventoryRoom.Slot> slots = full();
        for (int slot = 0; slot < 4; slot++) slots.add(InventoryRoom.Slot.EMPTY);
        slots.add(new InventoryRoom.Slot(true, 1, 64));
        assertFalse(InventoryRoom.hasRoom(slots));
        assertFalse(InventoryRoom.hasRoom(List.of()));
    }

    @Test
    void failureMessageMatchesTheSharedPatternAndNeverGoesNegative() {
        assertEquals("Inventory full; collected 3 of 8 oak_log.", InventoryRoom.fullMessage(3, 8, "oak_log"));
        assertEquals("Inventory full; collected 0 of 8 oak_log.", InventoryRoom.fullMessage(-2, 8, "oak_log"));
        assertTrue(InventoryRoom.fullMessage(0, 64, "cobblestone")
                .matches("Inventory full; collected \\d+ of \\d+ \\w+\\."));
    }

    @Test
    void capacityCountsEmptySlotsAndMatchingSpaceOnly() {
        List<InventoryRoom.Slot> slots = full();
        assertEquals(0, InventoryRoom.capacity(slots, 64));
        slots.set(3, new InventoryRoom.Slot(true, 61, 64));
        assertEquals(3, InventoryRoom.capacity(slots, 64));
        slots.set(5, new InventoryRoom.Slot(false, 1, 64));
        assertEquals(3, InventoryRoom.capacity(slots, 64), "different stack components cannot accept the output");
        slots.set(4, InventoryRoom.Slot.EMPTY);
        assertEquals(3 + 64, InventoryRoom.capacity(slots, 64));
        assertEquals(1, InventoryRoom.capacity(slots, 1), "only the empty slot fits an unstackable item");
        List<InventoryRoom.Slot> longer = new ArrayList<>(full());
        longer.add(InventoryRoom.Slot.EMPTY);
        assertEquals(0, InventoryRoom.capacity(longer, 64), "offhand and armour slots never count");
    }
}
