package dev.minecraftagent;

import static org.junit.jupiter.api.Assertions.*;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

class WithdrawTargetsTest {
    @Test
    void nearestContainerLastSeenHoldingTheItemWinsOverNearerUnopenedOnes() {
        Map<String, Integer> observed = new HashMap<>();
        observed.put("far-with-logs", 12);
        observed.put("near-without-logs", 0);
        assertEquals(
                "far-with-logs",
                WithdrawTargets.choose(List.of("unopened", "near-without-logs", "far-with-logs"), observed));
    }

    @Test
    void theNearestContainerWithUnknownContentsIsTheFallback() {
        Map<String, Integer> observed = new HashMap<>();
        observed.put("near-without-logs", 0);
        observed.put("invalidated", null);
        assertEquals(
                "invalidated",
                WithdrawTargets.choose(List.of("near-without-logs", "invalidated", "unopened"), observed),
                "contents cleared by a chest merge or split are unknown, like an unopened container");
        assertEquals("unopened", WithdrawTargets.choose(List.of("near-without-logs", "unopened"), observed));
    }

    @Test
    void noCandidateWhenEveryNearbyContainerWasSeenWithoutTheItem() {
        assertNull(WithdrawTargets.choose(List.of("a", "b"), Map.of("a", 0, "b", 0)));
        assertNull(WithdrawTargets.choose(List.<String>of(), Map.of()));
        assertNull(
                WithdrawTargets.choose(List.<String>of(), Map.of("far-away", 5)),
                "a known container out of range is not a candidate");
        assertEquals(
                "a",
                WithdrawTargets.choose(List.of("a"), Map.of("far-away", 5)),
                "a nearby container never opened this session is the fallback, not the far one holding the item");
    }

    @Test
    void fullMessageMatchesTheProtocol() {
        assertEquals(
                "Inventory full; withdrew 3 of 8 oak_log.", WithdrawTargets.fullMessage(3, 8, "minecraft:oak_log"));
    }
}
