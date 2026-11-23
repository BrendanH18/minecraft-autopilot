package dev.minecraftagent;

/** The reason mining stopped and the result of its bounded trip back to the start. */
record CollectionReturn(String failure, boolean exhausted) {
    record Outcome(boolean success, String message) {}

    static CollectionReturn quotaReached() {
        return new CollectionReturn(null, false);
    }

    static CollectionReturn noReachableBlocks() {
        return new CollectionReturn("No reachable matching blocks found.", true);
    }

    static CollectionReturn failed(String message) {
        return new CollectionReturn(message, false);
    }

    private String failureAtArrival(int held, int target) {
        if (exhausted && held >= target) return null;
        if (failure == null && held < target) return "Inventory fell below the requested quota during the return.";
        return failure;
    }

    Outcome finish(boolean returned, int held, int target, String message) {
        String finalFailure = failureAtArrival(held, target);
        String outcome = finalFailure == null ? "Collected requested items." : finalFailure;
        return new Outcome(
                returned && finalFailure == null, outcome + " Inventory: " + held + "/" + target + ". " + message);
    }

    String returningMessage() {
        String progress = exhausted
                ? "No reachable matching blocks remain"
                : failure == null ? "Collected requested items" : "Collection failed";
        return progress + "; returning to where collection started.";
    }
}
