package dev.minecraftagent;

/**
 * Whether a walk to a block has ended, independent of game APIs. Ending as soon as the player is merely near cuts
 * Baritone off half way up a step or on a ledge, and momentum carries the player on; a walk that then starts from
 * there creeps farther away each time.
 */
final class Arrival {
    enum State {
        WALKING,
        ARRIVED,
        STOPPED
    }

    private Arrival() {}

    /** The player's feet are inside the block, as the block position saved for a home or an inspection start. */
    static boolean inBlock(double x, double y, double z, int blockX, int blockY, int blockZ) {
        return Math.floor(x) == blockX && Math.floor(y) == blockY && Math.floor(z) == blockZ;
    }

    /**
     * Arrived once the player stands in the target block: on the ground, or wherever Baritone left it. When Baritone
     * stops short of the block, near decides; with nothing near, the walk failed once the grace for starting is over.
     */
    static State state(boolean inBlock, boolean onGround, boolean walking, boolean near, boolean graceOver) {
        if (inBlock && (onGround || !walking)) return State.ARRIVED;
        if (walking) return State.WALKING;
        if (near) return State.ARRIVED;
        return graceOver ? State.STOPPED : State.WALKING;
    }
}
