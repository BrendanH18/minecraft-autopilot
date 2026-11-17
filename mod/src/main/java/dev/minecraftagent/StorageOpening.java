package dev.minecraftagent;

/** One vanilla interaction at a time; its acknowledgement follows any screen reply. */
final class StorageOpening {
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
