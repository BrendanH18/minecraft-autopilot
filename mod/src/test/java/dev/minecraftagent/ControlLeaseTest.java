package dev.minecraftagent;

import org.junit.jupiter.api.Test;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicLong;
import static org.junit.jupiter.api.Assertions.*;

class ControlLeaseTest {
    @Test void anotherControllerCannotStealALiveLease() {
        ControlLease lease = new ControlLease();
        String owner = UUID.randomUUID().toString();
        lease.acquire(owner);
        assertThrows(IllegalStateException.class, () -> lease.acquire(UUID.randomUUID().toString()));
        assertThrows(IllegalStateException.class, () -> lease.heartbeat(UUID.randomUUID().toString()));
        assertDoesNotThrow(() -> lease.heartbeat(owner));
    }

    @Test void heartbeatExtendsExpiryAndExpiredCommandsAreRejected() {
        AtomicLong clock = new AtomicLong();
        ControlLease lease = new ControlLease(clock::get);
        String owner = UUID.randomUUID().toString();
        lease.acquire(owner);
        clock.set(7_000_000_000L);
        lease.heartbeat(owner);
        clock.set(14_000_000_000L);
        assertFalse(lease.expired());
        clock.set(15_000_000_000L);
        assertTrue(lease.expired());
        assertThrows(IllegalStateException.class, () -> lease.require(owner));
    }

    @Test void releasePreventsDelayedHeartbeatFromResumingControl() {
        ControlLease lease = new ControlLease();
        String owner = UUID.randomUUID().toString();
        lease.acquire(owner);
        lease.release();
        assertFalse(lease.active());
        assertThrows(IllegalStateException.class, () -> lease.heartbeat(owner));
        assertThrows(IllegalStateException.class, () -> lease.require(owner));
    }
}
