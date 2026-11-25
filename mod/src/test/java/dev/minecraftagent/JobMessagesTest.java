package dev.minecraftagent;

import static org.junit.jupiter.api.Assertions.*;

import org.junit.jupiter.api.Test;

/** Each expected sentence is the bot's wording in src/mineflayer-driver.js for the same outcome. */
class JobMessagesTest {
    private static final String CHEST = JobMessages.where("minecraft:chest", 674, -60, 0);

    @Test
    void namesTheContainerWithoutTheNamespace() {
        assertEquals("chest at 674 -60 0", CHEST);
        assertEquals("barrel at -3 64 12", JobMessages.where("minecraft:barrel", -3, 64, 12));
    }

    @Test
    void depositSentences() {
        assertEquals(
                "Deposited 8 oak_log into the chest at 674 -60 0.",
                JobMessages.deposited(8, "minecraft:oak_log", CHEST));
        assertEquals(
                "The chest at 674 -60 0 is full; deposited 0 of 8 oak_log.",
                JobMessages.depositFull(CHEST, 0, 8, "minecraft:oak_log"));
    }

    @Test
    void withdrawalSentences() {
        assertEquals(
                "Withdrew 8 oak_log from the chest at 674 -60 0.", JobMessages.withdrew(8, "minecraft:oak_log", CHEST));
        assertEquals(
                "The chest at 674 -60 0 held only 20 oak_log; withdrew 20 of 24 oak_log.",
                JobMessages.heldOnly(CHEST, 20, 20, 24, "minecraft:oak_log"));
        assertEquals("The chest at 674 -60 0 holds no oak_log.", JobMessages.holdsNo(CHEST, "minecraft:oak_log", 0));
        assertEquals(
                "The chest at 674 -60 0 holds no oak_log; withdrew 0 of 8 oak_log.",
                JobMessages.holdsNo(CHEST, "minecraft:oak_log", 8));
    }

    @Test
    void noCandidateSentence() {
        assertEquals(
                "No chest or barrel within 16 blocks is known to hold oak_log, and none nearby is unopened. Move near"
                        + " storage that holds it first.",
                JobMessages.noCandidate("minecraft:oak_log"));
    }

    @Test
    void depositRefusals() {
        assertEquals("No oak_log in inventory to deposit.", JobMessages.noneToDeposit("minecraft:oak_log"));
        assertEquals(
                "Only 4 oak_log in inventory; cannot deposit 8.", JobMessages.depositShort(4, "minecraft:oak_log", 8));
    }
}
