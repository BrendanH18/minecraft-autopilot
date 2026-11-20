package dev.minecraftagent;

import static org.junit.jupiter.api.Assertions.*;

import org.junit.jupiter.api.Test;

class StorageTransferTest {
    @Test
    void quotaAndContainerCapacityBoundEveryBatch() {
        assertEquals(8, StorageTransfer.quantity(8, 64, 64));
        assertEquals(4, StorageTransfer.quantity(10, 64, 4));
        assertEquals(1, StorageTransfer.quantity(8, 1, 64));
        assertEquals(0, StorageTransfer.quantity(8, 64, 0));
    }

    @Test
    void freshServerCountsMustConfirmBothSidesBeforeProgress() {
        StorageTransfer transfer = new StorageTransfer(10, 30, 20);
        assertFalse(transfer.confirm(34, 20, 4), "a chest update alone is not proof of this player's deposit");
        assertFalse(transfer.confirm(30, 16, 4), "a player inventory decrease alone is not proof of a deposit");
        assertEquals(0, transfer.confirmed());
        assertTrue(transfer.confirm(34, 16, 4));
        assertEquals(4, transfer.confirmed());
        assertEquals(6, transfer.remaining());
        assertTrue(transfer.confirm(40, 10, 6));
        assertEquals(0, transfer.remaining());
    }

    @Test
    void rejectsOverTransferStaleReopenAndUnconfirmedPartialProgress() {
        StorageTransfer transfer = new StorageTransfer(8, 10, 64);
        assertFalse(transfer.confirm(10, 64, 8), "unchanged contents must not pass");
        assertFalse(transfer.confirm(74, 0, 64), "whole-stack overshoot must not pass a smaller quota");
        assertFalse(transfer.confirm(14, 60, 8), "a partially accepted batch is a failure, not completion");
        assertEquals(
                4,
                transfer.remaining(),
                "fresh matched counts retain honest partial progress even though the action fails");
    }

    @Test
    void laterCompatibleSourceIsTriedBeforeDeclaringStorageFull() {
        // Slot 0 has eight spaces in ordinary logs; source 1 is renamed and cannot merge, source 2 can.
        StorageTransfer.Slots selected = StorageTransfer.select(
                1, 3, index -> true, index -> false, (source, destination) -> source == 2 ? 8 : 0);
        assertEquals(new StorageTransfer.Slots(2, 0, 8), selected);
        assertNull(StorageTransfer.select(1, 3, index -> true, index -> false, (source, destination) -> 0));
    }

    @Test
    void partialStacksAcrossAllSourcesArePreferredToEmptySlots() {
        // Empty slot 0 fits either source; partial slot 1 fits only the later ordinary source 3.
        StorageTransfer.Slots selected = StorageTransfer.select(
                2,
                4,
                index -> true,
                index -> index == 0,
                (source, destination) -> destination == 0 ? 64 : source == 3 ? 8 : 0);
        assertEquals(new StorageTransfer.Slots(3, 1, 8), selected);
        assertEquals(
                new StorageTransfer.Slots(2, 0, 64),
                StorageTransfer.select(
                        2, 4, index -> true, index -> index == 0, (source, destination) -> destination == 0 ? 64 : 0));
    }

    @Test
    void inventoryMustCoverTheRequestedAmountBeforeClicks() {
        assertThrows(IllegalArgumentException.class, () -> new StorageTransfer(8, 0, 7));
        assertThrows(IllegalArgumentException.class, () -> new StorageTransfer(0, 0, 0));
    }

    @Test
    void withdrawalSelectsContainerSourcesAndPlayerDestinations() {
        // A 3-slot container (0-2) and 3 player slots (3-5): container slot 1 holds the item, player slot 3 holds
        // another item, slot 4 is a partial stack, and slot 5 is empty. The partial stack is filled before the empty
        // slot.
        StorageTransfer.Slots selected = StorageTransfer.select(
                0,
                3,
                3,
                6,
                index -> index == 1,
                index -> index == 5,
                (source, destination) -> destination == 3 ? 0 : destination == 4 ? 10 : 64);
        assertEquals(new StorageTransfer.Slots(1, 4, 10), selected);
        assertNull(
                StorageTransfer.select(0, 3, 3, 6, index -> index == 1, index -> false, (source, destination) -> 0),
                "no player room is reported as no selection");
    }

    @Test
    void withdrawalConfirmsWithTheRolesSwapped() {
        // The player holds 5 and the container 20; withdrawing 8 counts the player as the destination.
        StorageTransfer transfer = new StorageTransfer(8, 5, 20);
        assertTrue(transfer.confirm(13, 12, 8));
        assertEquals(0, transfer.remaining());
    }
}
