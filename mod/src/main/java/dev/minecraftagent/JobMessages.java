package dev.minecraftagent;

/**
 * Storage job sentences, worded exactly as the bot words them ({@code src/mineflayer-driver.js}), so agents and the
 * live acceptance checks read one format on every backend. Item and block ids lose the {@code minecraft:} prefix.
 */
final class JobMessages {
    private JobMessages() {}

    static String shortId(String id) {
        return id.replaceFirst("^minecraft:", "");
    }

    /** {@code chest at 674 -60 0}. */
    static String where(String block, int x, int y, int z) {
        return shortId(block) + " at " + x + " " + y + " " + z;
    }

    static String deposited(int deposited, String item, String where) {
        return "Deposited " + deposited + " " + shortId(item) + " into the " + where + ".";
    }

    static String depositFull(String where, int deposited, int requested, String item) {
        return "The " + where + " is full; deposited " + deposited + " of " + requested + " " + shortId(item) + ".";
    }

    static String withdrew(int withdrawn, String item, String where) {
        return "Withdrew " + withdrawn + " " + shortId(item) + " from the " + where + ".";
    }

    static String heldOnly(String where, int available, int withdrawn, int requested, String item) {
        return "The " + where + " held only " + available + " " + shortId(item) + "; withdrew " + withdrawn + " of "
                + requested + " " + shortId(item) + ".";
    }

    /** {@code requested} is 0 when the withdrawal named no count. */
    static String holdsNo(String where, String item, int requested) {
        String none = "The " + where + " holds no " + shortId(item);
        return requested == 0 ? none + "." : none + "; withdrew 0 of " + requested + " " + shortId(item) + ".";
    }

    /** No container nearby is known to hold the item and none is unopened; trapped chests count as chests. */
    static String noCandidate(String item) {
        return "No chest or barrel within 16 blocks is known to hold " + shortId(item)
                + ", and none nearby is unopened. Move near storage that holds it first.";
    }

    static String noneToDeposit(String item) {
        return "No " + shortId(item) + " in inventory to deposit.";
    }

    static String depositShort(int held, String item, int requested) {
        return "Only " + held + " " + shortId(item) + " in inventory; cannot deposit " + requested + ".";
    }
}
