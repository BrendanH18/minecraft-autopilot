package dev.minecraftagent;

import java.util.UUID;
import java.util.function.LongSupplier;

/** Only accessed on the Minecraft thread. Expiry uses a monotonic clock. */
public final class ControlLease {
    private static final long TIMEOUT_NANOS = 8_000_000_000L;
    private final LongSupplier clock;
    private String owner;
    private long renewedAt;

    public ControlLease() { this(System::nanoTime); }
    ControlLease(LongSupplier clock) { this.clock = clock; }

    public void acquire(String id) {
        validate(id);
        if (owner != null) throw new IllegalStateException("Another agent owns control. Stop it or press F8 first.");
        owner = id;
        renewedAt = clock.getAsLong();
    }

    public void require(String id) {
        if (owner == null || !owner.equals(id) || expired())
            throw new IllegalStateException("Control was released or expired. Explicitly start a new session.");
    }

    public void heartbeat(String id) { require(id); renewedAt = clock.getAsLong(); }
    public boolean active() { return owner != null; }
    public boolean expired() { return owner != null && clock.getAsLong() - renewedAt >= TIMEOUT_NANOS; }
    public void release() { owner = null; }

    private static void validate(String id) {
        if (id == null || !UUID.fromString(id).toString().equals(id))
            throw new IllegalArgumentException("leaseId must be a canonical UUID.");
    }
}
