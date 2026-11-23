package dev.minecraftagent;

import static org.junit.jupiter.api.Assertions.*;

import org.junit.jupiter.api.Test;

class ActionTimingTest {
    @Test
    void failedEatingAllowsRetreatBeforeAnotherAutomaticAttempt() {
        ActionTiming timing = new ActionTiming();
        assertTrue(timing.canAutoEat(0, false));
        timing.eatingFailed(5_000_000_000L);
        assertFalse(timing.canAutoEat(5_000_000_001L, false));
        assertFalse(timing.canAutoEat(14_999_999_999L, false));
        assertTrue(timing.canAutoEat(15_000_000_000L, false));
    }

    @Test
    void inventoryActionsDeferAutomaticEatingEvenWhenBackoffHasExpired() {
        ActionTiming timing = new ActionTiming();
        assertFalse(timing.canAutoEat(0, true));
        timing.eatingFailed(0);
        assertFalse(timing.canAutoEat(10_000_000_000L, true));
        assertTrue(timing.canAutoEat(10_000_000_000L, false));
    }

    @Test
    void eatingFailuresDoNotExtendTheActionOrRecoveryBudget() {
        ActionTiming timing = new ActionTiming();
        timing.start(0, 180_000_000_000L);
        timing.eatingFailed(179_000_000_000L);
        assertTrue(timing.expired(180_000_000_000L));
        timing.start(180_000_000_000L, 60_000_000_000L);
        timing.eatingFailed(239_000_000_000L);
        assertFalse(timing.expired(239_999_999_999L));
        assertTrue(timing.expired(240_000_000_000L));
    }

    @Test
    void failedConsumptionCannotKeepASurvivalRetreatAlivePastItsBudget() {
        ActionTiming timing = new ActionTiming();
        timing.start(0, 180_000_000_000L);
        timing.startRetreat(20_000_000_000L);
        timing.eatingFailed(79_000_000_000L);
        assertFalse(timing.retreatExpired(79_999_999_999L));
        assertTrue(timing.retreatExpired(80_000_000_000L));
        assertFalse(timing.expired(80_000_000_000L), "retreat has its own shorter deadline");
        assertFalse(timing.canAutoEat(80_000_000_000L, false));
    }

    @Test
    void firstRetreatCanStartAtAnyMonotonicClockOrigin() {
        ActionTiming timing = new ActionTiming();
        assertTrue(timing.canRetreat(-5_000_000_000L));
        timing.retreatAttempted(-5_000_000_000L);
        assertFalse(timing.canRetreat(4_999_999_999L));
        assertTrue(timing.canRetreat(5_000_000_000L));
    }
}
