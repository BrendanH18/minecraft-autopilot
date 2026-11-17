package dev.minecraftagent;

import java.util.function.IntBinaryOperator;
import java.util.function.IntPredicate;

/** Counts only transfers verified by reopening the server inventory, never client click prediction. */
final class StorageTransfer {
    private final int requested;
    private final int initialStored;
    private final int initialHeld;
    private int confirmed;

    StorageTransfer(int requested, int stored, int held) {
        if (requested < 1 || requested > held)
            throw new IllegalArgumentException("Not enough matching items in inventory.");
        this.requested = requested;
        initialStored = stored;
        initialHeld = held;
    }

    int remaining() {
        return requested - confirmed;
    }

    int confirmed() {
        return confirmed;
    }

    boolean confirm(int stored, int held, int sent) {
        int delta = stored - initialStored;
        if (initialHeld - held != delta || delta < confirmed || delta > requested) return false;
        boolean completeBatch = delta == confirmed + sent;
        confirmed = delta;
        return completeBatch;
    }

    record Slots(int source, int destination, int capacity) {}

    /** Try compatible partial stacks across every source before consuming an empty slot. */
    static Slots select(
            int storageSize, int totalSize, IntPredicate matches, IntPredicate empty, IntBinaryOperator capacity) {
        for (boolean useEmpty : new boolean[] {false, true}) {
            for (int source = storageSize; source < totalSize; source++) {
                if (!matches.test(source)) continue;
                for (int destination = 0; destination < storageSize; destination++) {
                    if (empty.test(destination) != useEmpty) continue;
                    int room = capacity.applyAsInt(source, destination);
                    if (room > 0) return new Slots(source, destination, room);
                }
            }
        }
        return null;
    }

    static int quantity(int remaining, int stack, int capacity) {
        return Math.max(0, Math.min(remaining, Math.min(stack, capacity)));
    }
}
