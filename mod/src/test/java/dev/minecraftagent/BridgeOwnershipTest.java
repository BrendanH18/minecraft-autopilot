package dev.minecraftagent;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import static org.junit.jupiter.api.Assertions.*;

class BridgeOwnershipTest {
    @TempDir Path directory;

    @Test void anotherBridgeCannotReplaceLiveOwnership() throws Exception {
        Path discovery = directory.resolve("bridge.json");
        try (BridgeOwnership first = new BridgeOwnership(discovery)) {
            String before = Files.readString(Path.of(discovery + ".lock"));
            assertThrows(IOException.class, () -> new BridgeOwnership(discovery));
            assertEquals(before, Files.readString(Path.of(discovery + ".lock")));
        }
        assertFalse(Files.exists(Path.of(discovery + ".lock")));
    }
}
