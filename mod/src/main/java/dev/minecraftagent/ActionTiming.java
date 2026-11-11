package dev.minecraftagent;

/** Monotonic action budgets and failed-consumption backoff, independent of game APIs. */
final class ActionTiming {
    private long deadline;
    private long retreatDeadline;
    private long eatingRetryAt;
    private boolean eatingBackoff;

    void start(long now, long budget) { deadline = now + budget; }
    boolean expired(long now) { return now - deadline >= 0; }
    void startRetreat(long now) { retreatDeadline = now + 60_000_000_000L; }
    boolean retreatExpired(long now) { return now - retreatDeadline >= 0; }
    void eatingFailed(long now) {
        eatingRetryAt = now + 10_000_000_000L;
        eatingBackoff = true;
    }
    boolean canAutoEat(long now) { return !eatingBackoff || now - eatingRetryAt >= 0; }
}
