package dev.minecraftagent;

/** One vanilla block interaction at a time; its acknowledgement follows any screen reply. */
final class StorageOpening {
    enum Placement {
        WAITING,
        CONFIRMED,
        REJECTED
    }

    private boolean pending;
    private boolean cancelled;
    private int sequence = -1;

    void expect() {
        if (pending) throw new IllegalStateException("Previous storage opening is still awaiting the server.");
        pending = true;
        cancelled = false;
        sequence = -1;
    }

    void sent(int sequence) {
        if (pending) this.sequence = sequence;
    }

    boolean pending() {
        return pending;
    }

    /** The acknowledgement hook runs after vanilla reconciles the predicted block with the server's state. */
    Placement placement(boolean tablePresent) {
        if (pending) return Placement.WAITING;
        return tablePresent ? Placement.CONFIRMED : Placement.REJECTED;
    }

    boolean sent() {
        return sequence >= 0;
    }

    boolean mayOwnReply() {
        return pending && !cancelled;
    }

    void cancel() {
        cancelled = true;
    }

    void acknowledge(int sequence) {
        if (pending && this.sequence >= 0 && sequence >= this.sequence) reset();
    }

    void reset() {
        pending = false;
        cancelled = false;
        sequence = -1;
    }
}
