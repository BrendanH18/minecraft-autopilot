package dev.minecraftagent;

import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

class StorageTransferTest {
    @Test void quotaAndContainerCapacityBoundEveryBatch() {
        assertEquals(8, StorageTransfer.quantity(8, 64, 64));
        assertEquals(4, StorageTransfer.quantity(10, 64, 4));
        assertEquals(1, StorageTransfer.quantity(8, 1, 64));
        assertEquals(0, StorageTransfer.quantity(8, 64, 0));
    }

    @Test void freshServerCountsMustConfirmBothSidesBeforeProgress() {
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

    @Test void rejectsOverTransferStaleReopenAndUnconfirmedPartialProgress() {
        StorageTransfer transfer = new StorageTransfer(8, 10, 64);
        assertFalse(transfer.confirm(10, 64, 8), "unchanged contents must not pass");
        assertFalse(transfer.confirm(74, 0, 64), "whole-stack overshoot must not pass a smaller quota");
        assertFalse(transfer.confirm(14, 60, 8), "a partially accepted batch is a failure, not completion");
        assertEquals(4, transfer.remaining(), "fresh matched counts retain honest partial progress even though the action fails");
    }

    @Test void inventoryMustCoverTheRequestedAmountBeforeClicks() {
        assertThrows(IllegalArgumentException.class, () -> new StorageTransfer(8, 0, 7));
        assertThrows(IllegalArgumentException.class, () -> new StorageTransfer(0, 0, 0));
    }
}
