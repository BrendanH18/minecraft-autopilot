package dev.minecraftagent;

import static org.junit.jupiter.api.Assertions.*;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

class StorageTargetsTest {
    record Pos(int x, int y, int z) {}

    private static Map<Pos, List<Pos>> known() {
        // A double chest keyed by its lower half, a barrel, and a distant unrelated chest.
        Map<Pos, List<Pos>> members = new LinkedHashMap<>();
        members.put(new Pos(1, 64, 0), List.of(new Pos(1, 64, 0), new Pos(2, 64, 0)));
        members.put(new Pos(5, 64, 5), List.of(new Pos(5, 64, 5)));
        members.put(new Pos(100, 64, 0), List.of(new Pos(100, 64, 0)));
        return members;
    }

    @Test
    void requestedPositionsSelectOnlyThoseRecords() {
        var resolution = StorageTargets.resolve(List.of(new Pos(5, 64, 5)), known());
        assertNull(resolution.unknown());
        assertEquals(List.of(new Pos(5, 64, 5)), resolution.keys(), "the distant unrelated chest is not reopened");
    }

    @Test
    void eitherDoubleChestHalfSelectsItsInventoryOnce() {
        var resolution =
                StorageTargets.resolve(List.of(new Pos(2, 64, 0), new Pos(5, 64, 5), new Pos(1, 64, 0)), known());
        assertNull(resolution.unknown());
        assertEquals(
                List.of(new Pos(1, 64, 0), new Pos(5, 64, 5)),
                resolution.keys(),
                "the canonical key, in request order, read once");
    }

    @Test
    void anUnopenedPositionFailsTheWholeRequest() {
        var resolution =
                StorageTargets.resolve(List.of(new Pos(5, 64, 5), new Pos(3, 64, 0), new Pos(4, 64, 0)), known());
        assertEquals(new Pos(3, 64, 0), resolution.unknown(), "the first unknown position is reported");
        assertTrue(resolution.keys().isEmpty(), "nothing is reopened when any position is unknown");
        assertEquals(
                new Pos(9, 9, 9),
                StorageTargets.resolve(List.of(new Pos(9, 9, 9)), Map.<Pos, List<Pos>>of())
                        .unknown());
    }
}
