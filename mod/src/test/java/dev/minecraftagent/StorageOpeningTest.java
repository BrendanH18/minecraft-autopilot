package dev.minecraftagent;

import static org.junit.jupiter.api.Assertions.*;

import org.junit.jupiter.api.Test;

class StorageOpeningTest {
    @Test
    void placementUsesTheReconciledBlockOnlyAfterItsAcknowledgement() {
        StorageOpening opening = new StorageOpening();
        opening.expect();
        opening.sent(12);
        assertEquals(StorageOpening.Placement.WAITING, opening.placement(true), "the table may be predicted");
        opening.acknowledge(11);
        assertEquals(StorageOpening.Placement.WAITING, opening.placement(true));
        opening.acknowledge(12);
        assertEquals(StorageOpening.Placement.REJECTED, opening.placement(false));
        assertEquals(StorageOpening.Placement.CONFIRMED, opening.placement(true));
    }

    @Test
    void cancellationRetainsLateReplyCleanupUntilAcknowledged() {
        StorageOpening opening = new StorageOpening();
        opening.expect();
        opening.sent(12);
        assertTrue(opening.mayOwnReply());
        opening.cancel();
        assertTrue(opening.pending(), "F8 before the reply must not forget the outstanding screen");
        assertFalse(opening.mayOwnReply(), "a cancelled reply must close without transfers");
        opening.acknowledge(11);
        assertTrue(opening.pending(), "older acknowledgements do not complete this interaction");
        opening.acknowledge(12);
        assertFalse(opening.pending());
    }

    @Test
    void playerInteractionCannotReplaceThePendingAgentOpening() {
        StorageOpening opening = new StorageOpening();
        opening.expect();
        opening.sent(3);
        opening.cancel(); // Player interaction releases control; its new opening is held until this reply settles.
        assertThrows(IllegalStateException.class, opening::expect);
        assertFalse(opening.mayOwnReply());
        opening.acknowledge(3);
        opening.expect();
        opening.sent(4);
        assertTrue(opening.mayOwnReply());
    }

    @Test
    void blockedLidAcknowledgementAndWorldResetClearPendingState() {
        StorageOpening opening = new StorageOpening();
        opening.expect();
        opening.sent(5);
        opening.acknowledge(5); // Vanilla sends an acknowledgement even when there is no screen reply.
        assertFalse(opening.pending());
        opening.expect();
        opening.sent(6);
        opening.cancel();
        opening.reset(); // Disconnect or world change must not block a later world.
        assertFalse(opening.pending());
    }

    @Test
    void anInteractionThatAbortsBeforeSendingCannotBlockTheNextAction() {
        StorageOpening opening = new StorageOpening();
        opening.expect();
        opening.discardIfUnsent();
        assertFalse(opening.pending());
        opening.expect();
        opening.sent(7);
        opening.discardIfUnsent();
        assertTrue(opening.pending(), "a sent interaction still needs late screen cleanup");
    }
}
