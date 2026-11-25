package dev.minecraftagent;

import static org.junit.jupiter.api.Assertions.*;

import org.junit.jupiter.api.Test;

class ArrivalTest {
    @Test
    void aStepBelowTheStartIsNotTheStart() {
        // Issue #78: an inspection that started on the platform edge (481.95 -58) stopped on the step at 483.36 -59,
        // within 1.75 blocks; the next inspection started there and stopped on the ground, then farther still.
        assertFalse(Arrival.inBlock(483.36, -58.9987, 0.5, 481, -58, 0));
        assertFalse(Arrival.inBlock(483.88, -60, 0.5, 482, -59, 0));
        assertTrue(Arrival.inBlock(481.95, -58, 0.5, 481, -58, 0));
    }

    @Test
    void halfWayUpTheStepHomeIsNotHome() {
        // home ended here, 1.69 blocks from the home block's centre, then settled 2.01 blocks from home.
        assertFalse(Arrival.inBlock(482.19, -57.75, 0.5, 480, -58, 0));
        assertTrue(Arrival.inBlock(480.6, -58, 0.5, 480, -58, 0));
        assertTrue(Arrival.inBlock(-0.4, 64, -12.1, -1, 64, -13));
    }

    @Test
    void inTheBlockArrivesOnTheGroundOrOnceBaritoneStops() {
        assertEquals(Arrival.State.ARRIVED, Arrival.state(true, true, true, true, false));
        assertEquals(Arrival.State.WALKING, Arrival.state(true, false, true, true, true), "mid-jump into the block");
        assertEquals(Arrival.State.ARRIVED, Arrival.state(true, false, false, true, true), "in water or on a ladder");
    }

    @Test
    void stoppingShortArrivesOnlyWhenNear() {
        assertEquals(Arrival.State.WALKING, Arrival.state(false, true, true, true, true), "near but still walking");
        assertEquals(Arrival.State.ARRIVED, Arrival.state(false, true, false, true, false), "blocked home, beside it");
        assertEquals(Arrival.State.WALKING, Arrival.state(false, true, false, false, false), "grace for the path");
        assertEquals(Arrival.State.STOPPED, Arrival.state(false, true, false, false, true));
    }
}
