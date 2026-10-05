package dev.minecraftagent;

import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import java.io.IOException;
import java.nio.file.FileAlreadyExistsException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import java.util.UUID;

/** Shared on-disk ownership format with the Node bridge. */
public final class BridgeOwnership implements AutoCloseable {
    private final Path path;
    private final String nonce = UUID.randomUUID().toString();

    public BridgeOwnership(Path discovery) throws IOException {
        path = Path.of(discovery + ".lock");
        JsonObject owner = new JsonObject();
        owner.addProperty("pid", ProcessHandle.current().pid());
        owner.addProperty("nonce", nonce);
        Files.createDirectories(path.getParent());
        for (int attempt = 0; attempt < 2; attempt++) {
            try {
                Files.writeString(path, owner.toString(), StandardOpenOption.CREATE_NEW, StandardOpenOption.WRITE);
                return;
            } catch (FileAlreadyExistsException exception) {
                String previous = Files.readString(path);
                JsonObject saved;
                try { saved = JsonParser.parseString(previous).getAsJsonObject(); }
                catch (RuntimeException invalid) { throw new IOException("Bridge lock is unreadable or another bridge is starting: " + path); }
                if (!saved.has("pid") || ProcessHandle.of(saved.get("pid").getAsLong()).map(ProcessHandle::isAlive).orElse(false))
                    throw new IOException("A bridge already owns this profile. Close it before starting another.");
                if (!previous.equals(Files.readString(path))) throw new IOException("Bridge ownership changed; retry.");
                Files.delete(path);
            }
        }
        throw new IOException("Could not claim bridge ownership.");
    }

    @Override public void close() {
        try {
            JsonObject saved = JsonParser.parseString(Files.readString(path)).getAsJsonObject();
            if (saved.has("nonce") && nonce.equals(saved.get("nonce").getAsString())) Files.deleteIfExists(path);
        } catch (Exception ignored) {}
    }
}
