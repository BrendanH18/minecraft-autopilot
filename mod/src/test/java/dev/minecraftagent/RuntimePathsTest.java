package dev.minecraftagent;

import static org.junit.jupiter.api.Assertions.*;

import java.nio.file.Path;
import org.junit.jupiter.api.Test;

class RuntimePathsTest {
    @Test
    void defaultDataStaysInsideTheGameProfile() {
        Path game = Path.of("test-profile").toAbsolutePath();
        Path actual = RuntimePaths.directory(game, null);
        assertEquals(game.resolve("config/minecraft-agent"), actual);
        assertTrue(actual.startsWith(game));
    }

    @Test
    void explicitProjectRuntimeDirectoryIsRespected() {
        Path runtime = Path.of(".runtime").toAbsolutePath();
        assertEquals(runtime, RuntimePaths.directory(Path.of("test-profile"), runtime.toString()));
    }
}
