package dev.minecraftagent;

import java.nio.file.Path;

/** Runtime data belongs to the selected game profile unless explicitly redirected. */
public final class RuntimePaths {
    private RuntimePaths() {}

    public static Path directory(Path gameDirectory, String override) {
        return (override == null || override.isBlank() ? gameDirectory.resolve("config/minecraft-agent") : Path.of(override))
                .toAbsolutePath().normalize();
    }
}
