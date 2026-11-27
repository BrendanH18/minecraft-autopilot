package dev.minecraftagent;

/**
 * Opt-in pacing for deposits and withdrawals, off by default. Each stack reopens the container, and its screen normally
 * closes in the tick its contents arrive, so no key press can reach it. With {@code
 * -Dminecraftagent.storageStepDelayTicks=<n>} in the game's JVM arguments, each opened screen is held for {@code n}
 * client ticks before its stack moves, so a person or a scripted Escape can close it. Control checks still run every
 * tick of the hold.
 */
final class StoragePacing {
    static final String PROPERTY = "minecraftagent.storageStepDelayTicks";
    /** 2 s per stack: a full inventory (36 stacks) still finishes well inside the 180 s action budget. */
    static final int MAX_TICKS = 40;

    private final int delayTicks;
    private int held;

    StoragePacing(int delayTicks) {
        this.delayTicks = Math.clamp(delayTicks, 0, MAX_TICKS);
    }

    static StoragePacing fromSystemProperty() {
        return new StoragePacing(parse(System.getProperty(PROPERTY)));
    }

    /** The configured ticks, clamped to 0..MAX_TICKS; 0 when unset or not a whole number. */
    static int parse(String value) {
        if (value == null) return 0;
        try {
            return Math.clamp(Long.parseLong(value.trim()), 0, MAX_TICKS);
        } catch (NumberFormatException exception) {
            return 0;
        }
    }

    int delayTicks() {
        return delayTicks;
    }

    /** Every opening of the container starts a fresh hold. */
    void restart() {
        held = 0;
    }

    /** True once this opening's hold has begun; the opening deadline no longer applies then. Never true unpaced. */
    boolean holding() {
        return held > 0;
    }

    /** Called once per client tick while the opened screen has fresh contents; true once the stack may move. */
    boolean ready() {
        if (held >= delayTicks) return true;
        held++;
        return false;
    }
}
