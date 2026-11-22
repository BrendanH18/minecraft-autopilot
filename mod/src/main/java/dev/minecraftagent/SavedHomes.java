package dev.minecraftagent;

import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.NoSuchFileException;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;

/** Saves one position per world, player, and dimension, using the existing homes.json format. */
final class SavedHomes {
    private final Path file;
    private final IOException loadFailure;
    private JsonObject entries;

    SavedHomes(Path file) {
        this.file = file;
        JsonObject loaded = new JsonObject();
        IOException failure = null;
        try {
            loaded = JsonParser.parseString(Files.readString(file)).getAsJsonObject();
        } catch (NoSuchFileException ignored) {
            // A new profile does not have saved homes yet.
        } catch (IOException | RuntimeException exception) {
            failure = new IOException("Could not read saved homes at " + file + ".", exception);
        }
        entries = loaded;
        loadFailure = failure;
    }

    IOException loadFailure() {
        return loadFailure;
    }

    JsonObject get(String identity) {
        var value = entries.get(identity);
        if (value == null || !value.isJsonObject()) return null;
        JsonObject position = value.getAsJsonObject();
        for (String axis : new String[] {"x", "y", "z"}) {
            var coordinate = position.get(axis);
            if (coordinate == null
                    || !coordinate.isJsonPrimitive()
                    || !coordinate.getAsJsonPrimitive().isNumber()) return null;
            try {
                coordinate.getAsBigDecimal().intValueExact();
            } catch (NumberFormatException | ArithmeticException exception) {
                return null;
            }
        }
        return position.deepCopy();
    }

    void save(String identity, JsonObject position) throws IOException {
        if (loadFailure != null) throw loadFailure;
        JsonObject next = entries.deepCopy();
        next.add(identity, position.deepCopy());
        Files.createDirectories(file.getParent());
        Path temporary = Files.createTempFile(file.getParent(), "homes-", ".tmp");
        try {
            Files.writeString(temporary, next.toString());
            Files.move(temporary, file, StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
            entries = next;
        } finally {
            Files.deleteIfExists(temporary);
        }
    }
}
