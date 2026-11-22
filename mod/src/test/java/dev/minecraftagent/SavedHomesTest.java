package dev.minecraftagent;

import static org.junit.jupiter.api.Assertions.*;

import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class SavedHomesTest {
    @TempDir
    Path directory;

    private static JsonObject position(int x) {
        JsonObject position = new JsonObject();
        position.addProperty("x", x);
        position.addProperty("y", 67);
        position.addProperty("z", -15);
        return position;
    }

    @Test
    void acceptsLegacyFileAndPreservesOtherWorldsAcrossSaves() throws IOException {
        Path file = directory.resolve("homes.json");
        Files.writeString(file, "{\"world|player|overworld\":{\"x\":3,\"y\":67,\"z\":-15}}");
        SavedHomes homes = new SavedHomes(file);
        assertEquals(position(3), homes.get("world|player|overworld"));
        homes.save("world|player|nether", position(5));
        SavedHomes restarted = new SavedHomes(file);
        assertEquals(position(3), restarted.get("world|player|overworld"));
        assertEquals(position(5), restarted.get("world|player|nether"));
    }

    @Test
    void failedWriteCannotPublishAnInMemoryHomeOrLeakTemporaryFile() throws IOException {
        Path file = directory.resolve("homes.json");
        SavedHomes homes = new SavedHomes(file);
        homes.save("world", position(1));
        Files.delete(file);
        Files.createDirectory(file);
        assertThrows(IOException.class, () -> homes.save("world", position(2)));
        assertEquals(position(1), homes.get("world"));
        try (var entries = Files.list(directory)) {
            assertEquals(1, entries.count());
        }
    }

    @Test
    void corruptFileRemainsIntactWhenSavingIsRefused() throws IOException {
        Path file = directory.resolve("homes.json");
        Files.writeString(file, "{broken");
        SavedHomes homes = new SavedHomes(file);
        assertNotNull(homes.loadFailure());
        assertThrows(IOException.class, () -> homes.save("world", position(2)));
        assertEquals("{broken", Files.readString(file));
    }

    @Test
    void skipsMalformedCoordinatesAndAllowsOtherProfilesToSave() throws IOException {
        Path file = directory.resolve("homes.json");
        String corrupted = "{\"x\":1.5,\"y\":67,\"z\":-15}";
        Files.writeString(file, "{\"bad\":" + corrupted + "}");
        SavedHomes homes = new SavedHomes(file);
        assertNull(homes.get("bad"));
        homes.save("good", position(2));
        JsonObject persisted = JsonParser.parseString(Files.readString(file)).getAsJsonObject();
        assertEquals(JsonParser.parseString(corrupted), persisted.get("bad"));
        assertEquals(position(2), homes.get("good"));
    }
}
