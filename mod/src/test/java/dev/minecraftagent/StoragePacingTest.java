package dev.minecraftagent;

import static org.junit.jupiter.api.Assertions.*;

import org.junit.jupiter.api.Test;

class StoragePacingTest {
    @Test
    void unsetOrMalformedValuesLeaveTransfersUnpaced() {
        for (String value : new String[] {null, "", " ", "abc", "1.5", "20 ticks", "0x10", "99999999999999999999"})
            assertEquals(0, StoragePacing.parse(value), String.valueOf(value));
        assertEquals(0, StoragePacing.parse("0"));
        assertEquals(20, StoragePacing.parse(" 20 "));
        assertEquals(7, StoragePacing.parse("+7"));
    }

    @Test
    void valuesAreClampedToTheSupportedRange() {
        assertEquals(0, StoragePacing.parse("-5"));
        assertEquals(StoragePacing.MAX_TICKS, StoragePacing.parse("41"));
        assertEquals(StoragePacing.MAX_TICKS, StoragePacing.parse(String.valueOf(Long.MAX_VALUE)));
        assertEquals(StoragePacing.MAX_TICKS, new StoragePacing(1000).delayTicks());
        assertEquals(0, new StoragePacing(-1).delayTicks());
    }

    @Test
    void theDefaultMovesAStackInTheTickItsContentsArrive() {
        StoragePacing pacing = new StoragePacing(0);
        pacing.restart();
        assertTrue(pacing.ready());
    }

    @Test
    void eachOpeningIsHeldForTheConfiguredTicks() {
        StoragePacing pacing = new StoragePacing(3);
        for (int opening = 0; opening < 2; opening++) {
            pacing.restart();
            assertFalse(pacing.ready());
            assertFalse(pacing.ready());
            assertFalse(pacing.ready());
            assertTrue(pacing.ready(), "the fourth tick moves the stack");
            assertTrue(pacing.ready(), "the hold does not restart until the container reopens");
        }
    }

    @Test
    void theLongestHoldKeepsAFullInventoryInsideTheActionBudget() {
        // 36 stacks, each held for the maximum, plus a generous second per stack to reopen the container.
        long perStackNanos = StoragePacing.MAX_TICKS * 50_000_000L + 1_000_000_000L;
        assertTrue(36 * perStackNanos < 180_000_000_000L);
    }

    @Test
    void theHoldIsSetWithASystemProperty() {
        String previous = System.getProperty(StoragePacing.PROPERTY);
        try {
            System.clearProperty(StoragePacing.PROPERTY);
            assertEquals(0, StoragePacing.fromSystemProperty().delayTicks());
            System.setProperty(StoragePacing.PROPERTY, "12");
            assertEquals(12, StoragePacing.fromSystemProperty().delayTicks());
        } finally {
            if (previous == null) System.clearProperty(StoragePacing.PROPERTY);
            else System.setProperty(StoragePacing.PROPERTY, previous);
        }
    }
}
