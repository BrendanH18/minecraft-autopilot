package dev.minecraftagent;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import com.google.gson.JsonElement;

/**
 * Bridge JSON keeps null members. The protocol reports some values as null rather than leaving them out, for example a
 * container's {@code items} before it is opened, and a plain {@code Gson} would drop them.
 */
final class BridgeJson {
    private static final Gson GSON = new GsonBuilder().serializeNulls().create();

    private BridgeJson() {}

    static String write(JsonElement value) {
        return GSON.toJson(value);
    }
}
