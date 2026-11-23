package dev.minecraftagent;

import static org.junit.jupiter.api.Assertions.*;

import org.junit.jupiter.api.Test;

class CollectionReturnTest {
    @Test
    void aLatePickupCanSatisfyAnExhaustedSearch() {
        CollectionReturn result = CollectionReturn.noReachableBlocks();
        assertTrue(result.finish(true, 8, 8, "Returned.").success());
        assertFalse(result.finish(true, 7, 8, "Returned.").success());
        assertFalse(result.finish(false, 8, 8, "Could not return.").success());
    }

    @Test
    void anExpiredSearchStillReportsItsFailureWithTheLatestInventory() {
        CollectionReturn result = CollectionReturn.failed("Collection timed out.");
        var outcome = result.finish(true, 8, 8, "Returned.");
        assertFalse(outcome.success());
        assertEquals("Collection timed out. Inventory: 8/8. Returned.", outcome.message());
    }

    @Test
    void aSuccessfulSearchAndReturnStillRequireTheQuotaAtArrival() {
        CollectionReturn result = CollectionReturn.quotaReached();
        assertTrue(result.finish(true, 8, 8, "Returned.").success());
        assertFalse(result.finish(false, 8, 8, "Could not return.").success());
        var outcome = result.finish(true, 7, 8, "Returned.");
        assertFalse(outcome.success());
        assertEquals(
                "Inventory fell below the requested quota during the return. Inventory: 7/8. Returned.",
                outcome.message());
    }
}
