package dev.minecraftagent;

import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

class ActionTimingTest {
    @Test void failedEatingAllowsRetreatBeforeAnotherAutomaticAttempt() {
        ActionTiming timing = new ActionTiming();
        assertTrue(timing.canAutoEat(0));
        timing.eatingFailed(5_000_000_000L);
        assertFalse(timing.canAutoEat(5_000_000_001L));
        assertFalse(timing.canAutoEat(14_999_999_999L));
        assertTrue(timing.canAutoEat(15_000_000_000L));
    }

    @Test void eatingFailuresDoNotExtendTheActionOrRecoveryBudget() {
        ActionTiming timing = new ActionTiming();
        timing.start(0, 180_000_000_000L);
        timing.eatingFailed(179_000_000_000L);
        assertTrue(timing.expired(180_000_000_000L));
        timing.start(180_000_000_000L, 60_000_000_000L);
        timing.eatingFailed(239_000_000_000L);
        assertFalse(timing.expired(239_999_999_999L));
        assertTrue(timing.expired(240_000_000_000L));
    }

    @Test void failedConsumptionCannotKeepASurvivalRetreatAlivePastItsBudget() {
        ActionTiming timing = new ActionTiming();
        timing.start(0, 180_000_000_000L);
        timing.startRetreat(20_000_000_000L);
        timing.eatingFailed(79_000_000_000L);
        assertFalse(timing.retreatExpired(79_999_999_999L));
        assertTrue(timing.retreatExpired(80_000_000_000L));
        assertFalse(timing.expired(80_000_000_000L), "retreat has its own shorter deadline");
        assertFalse(timing.canAutoEat(80_000_000_000L));
    }
}
