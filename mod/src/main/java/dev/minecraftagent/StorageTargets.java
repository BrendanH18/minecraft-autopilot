package dev.minecraftagent;

import java.util.ArrayList;
import java.util.Collection;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;

/** Chooses which known inventories a scoped storage inspection reopens; free of Minecraft types so it is unit-testable. */
final class StorageTargets {
    /** At most this many positions in one scoped inspection, matching the protocol. */
    static final int MAX_REQUESTED = 16;

    /** Either the record keys to reopen, in request order, or the first requested position no record covers. */
    record Resolution<P>(List<P> keys, P unknown) {}

    private StorageTargets() {}

    /**
     * A requested position names a known record by its key or any current member, so either half of a double chest selects
     * that inventory, and each inventory is listed once.
     */
    static <P> Resolution<P> resolve(List<P> requested, Map<P, ? extends Collection<P>> members) {
        var keys = new LinkedHashSet<P>();
        for (P position : requested) {
            P key = members.containsKey(position) ? position : null;
            if (key == null)
                for (var entry : members.entrySet())
                    if (entry.getValue().contains(position)) {
                        key = entry.getKey();
                        break;
                    }
            if (key == null) return new Resolution<>(List.of(), position);
            keys.add(key);
        }
        return new Resolution<>(new ArrayList<>(keys), null);
    }
}
