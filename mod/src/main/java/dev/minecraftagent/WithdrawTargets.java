package dev.minecraftagent;

import java.util.List;
import java.util.Map;

/** Chooses the one container a withdrawal opens; free of Minecraft types so it is unit-testable. */
final class WithdrawTargets {
    private WithdrawTargets() {}

    /**
     * {@code nearby} lists the canonical positions of containers in range, nearest first. {@code observed} maps the
     * containers this session has read to how many of the item their last-observed contents held, or null when those
     * contents are unknown (invalidated by a chest merge or split). The nearest container known to hold the item wins;
     * otherwise the nearest container with no known contents (never opened this session, or invalidated). A container
     * last seen without the item is never chosen. Returns null when there is no candidate.
     */
    static <P> P choose(List<P> nearby, Map<P, Integer> observed) {
        for (P position : nearby) {
            Integer count = observed.get(position);
            if (count != null && count > 0) return position;
        }
        for (P position : nearby) if (observed.get(position) == null) return position;
        return null;
    }

    /** The failure sentence when the inventory has no room for another matching item. */
    static String fullMessage(int withdrawn, int requested, String item) {
        return "Inventory full; withdrew " + Math.max(0, withdrawn) + " of " + requested + " "
                + item.replaceFirst("^minecraft:", "") + ".";
    }
}
