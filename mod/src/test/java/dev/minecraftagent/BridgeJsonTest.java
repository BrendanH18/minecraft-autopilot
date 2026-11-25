package dev.minecraftagent;

import static org.junit.jupiter.api.Assertions.*;

import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import org.junit.jupiter.api.Test;

class BridgeJsonTest {
    @Test
    void keepsNullMembersSuchAsUnopenedContainerItems() {
        JsonObject container = new JsonObject();
        container.addProperty("name", "minecraft:chest");
        container.add("items", null);
        JsonObject state = new JsonObject();
        state.add("job", null);
        state.add("container", container);

        JsonObject parsed = JsonParser.parseString(BridgeJson.write(state)).getAsJsonObject();

        assertTrue(parsed.has("job"));
        assertTrue(parsed.get("job").isJsonNull());
        assertTrue(parsed.getAsJsonObject("container").has("items"));
        assertTrue(parsed.getAsJsonObject("container").get("items").isJsonNull());
    }
}
