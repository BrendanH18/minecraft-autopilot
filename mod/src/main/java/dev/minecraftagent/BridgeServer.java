package dev.minecraftagent;

import com.google.gson.Gson;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import net.minecraft.client.MinecraftClient;

import java.io.IOException;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.nio.file.attribute.PosixFilePermissions;
import java.security.MessageDigest;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.Executors;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;

public final class BridgeServer implements AutoCloseable {
    private final Gson gson = new Gson();
    private final String token = UUID.randomUUID().toString() + UUID.randomUUID();
    private HttpServer server;
    private ExecutorService workers;
    private final Path discovery;
    private final BridgeOwnership ownership;

    public BridgeServer(MinecraftClient client, AgentController controller) throws IOException {
        Path directory = RuntimePaths.directory(client.runDirectory.toPath(), System.getenv("MC_AGENT_HOME"));
        Files.createDirectories(directory);
        discovery = directory.resolve("bridge.json");
        ownership = new BridgeOwnership(discovery);
        try {
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 16);
        workers = Executors.newFixedThreadPool(2, runnable -> {
            Thread thread = new Thread(runnable, "minecraft-agent-http");
            thread.setDaemon(true);
            return thread;
        });
        server.setExecutor(workers);
        server.createContext("/v1/", exchange -> handle(exchange, client, controller));
        JsonObject config = new JsonObject();
        config.addProperty("protocol", 1);
        config.addProperty("backend", "fabric");
        config.addProperty("url", "http://127.0.0.1:" + server.getAddress().getPort());
        config.addProperty("token", token);
        config.addProperty("pid", ProcessHandle.current().pid());
        Path temporary = Files.createTempFile(directory, "bridge-", ".tmp");
        try {
            Files.setPosixFilePermissions(temporary, PosixFilePermissions.fromString("rw-------"));
        } catch (UnsupportedOperationException ignored) { /* Windows uses the user's directory ACL. */ }
        Files.writeString(temporary, gson.toJson(config));
        Files.move(temporary, discovery, StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
        server.start();
        } catch (IOException | RuntimeException exception) {
            close();
            throw exception;
        }
    }

    private void handle(HttpExchange exchange, MinecraftClient client, AgentController controller) throws IOException {
        CompletableFuture<JsonObject> future = new CompletableFuture<>();
        try {
            String authorization = exchange.getRequestHeaders().getFirst("Authorization");
            if (authorization == null || !MessageDigest.isEqual(authorization.getBytes(StandardCharsets.UTF_8),
                    ("Bearer " + token).getBytes(StandardCharsets.UTF_8))) {
                respond(exchange, 401, error("Invalid bridge token.")); return;
            }
            if (exchange.getRequestHeaders().containsKey("Origin")) {
                respond(exchange, 403, error("Browser-origin requests are not supported.")); return;
            }
            String path = exchange.getRequestURI().getPath();
            boolean observation = path.equals("/v1/state");
            if (!exchange.getRequestMethod().equals(observation ? "GET" : "POST")) {
                respond(exchange, 405, error("Wrong HTTP method.")); return;
            }
            JsonObject body = new JsonObject();
            if (!observation) {
                byte[] bytes = exchange.getRequestBody().readNBytes(8193);
                if (bytes.length > 8192) { respond(exchange, 413, error("Request is too large.")); return; }
                body = JsonParser.parseString(new String(bytes, StandardCharsets.UTF_8)).getAsJsonObject();
            }
            JsonObject request = body;
            client.execute(() -> {
                // A request that timed out while queued must never start a delayed action.
                if (future.isCancelled()) return;
                try { future.complete(controller.request(path, request)); }
                catch (Exception exception) { future.completeExceptionally(exception); }
            });
            respond(exchange, 200, future.get(2, TimeUnit.SECONDS));
        } catch (TimeoutException exception) {
            future.cancel(false);
            respond(exchange, 503, error("Minecraft did not respond in time. Resume the game and try again."));
        } catch (Exception exception) {
            Throwable cause = exception.getCause() == null ? exception : exception.getCause();
            respond(exchange, 400, error(cause.getMessage() == null ? "Invalid request." : cause.getMessage()));
        } finally { exchange.close(); }
    }

    private JsonObject error(String message) { JsonObject object = new JsonObject(); object.addProperty("error", message); return object; }
    private void respond(HttpExchange exchange, int status, JsonObject object) throws IOException {
        byte[] bytes = gson.toJson(object).getBytes(StandardCharsets.UTF_8);
        exchange.getResponseHeaders().set("Content-Type", "application/json");
        exchange.getResponseHeaders().set("Cache-Control", "no-store");
        exchange.sendResponseHeaders(status, bytes.length);
        exchange.getResponseBody().write(bytes);
    }

    @Override public void close() {
        if (server != null) server.stop(0);
        if (workers != null) workers.shutdownNow();
        try {
            JsonObject saved = JsonParser.parseString(Files.readString(discovery)).getAsJsonObject();
            if (token.equals(saved.get("token").getAsString())) Files.deleteIfExists(discovery);
        } catch (Exception ignored) {}
        ownership.close();
    }
}
