package dev.minecraftagent;

import net.fabricmc.api.ClientModInitializer;
import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientLifecycleEvents;
import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientTickEvents;
import net.fabricmc.fabric.api.client.keybinding.v1.KeyBindingHelper;
import net.fabricmc.fabric.api.client.screen.v1.ScreenEvents;
import net.fabricmc.fabric.api.client.screen.v1.ScreenKeyboardEvents;
import net.fabricmc.fabric.api.client.screen.v1.ScreenMouseEvents;
import net.fabricmc.fabric.api.event.player.UseBlockCallback;
import net.fabricmc.fabric.api.event.player.UseEntityCallback;
import net.minecraft.client.MinecraftClient;
import net.minecraft.client.option.KeyBinding;
import net.minecraft.client.util.InputUtil;
import net.minecraft.text.Text;
import net.minecraft.util.ActionResult;
import org.lwjgl.glfw.GLFW;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public final class AgentClient implements ClientModInitializer {
    public static final Logger LOGGER = LoggerFactory.getLogger("minecraft-agent");
    private BridgeServer bridge;

    @Override
    public void onInitializeClient() {
        MinecraftClient client = MinecraftClient.getInstance();
        AgentController controller = new AgentController(client);
        KeyBinding takeBack = KeyBindingHelper.registerKeyBinding(new KeyBinding(
                "key.minecraft_agent.take_back", InputUtil.Type.KEYSYM, GLFW.GLFW_KEY_F8, "category.minecraft_agent"));
        UseBlockCallback.EVENT.register((player, world, hand, hit) -> {
            if (!world.isClient()) return ActionResult.PASS;
            return controller.playerStorageInteraction() ? ActionResult.PASS : ActionResult.FAIL;
        });
        UseEntityCallback.EVENT.register((player, world, hand, entity, hit) -> {
            if (!world.isClient()) return ActionResult.PASS;
            return controller.playerStorageInteraction() ? ActionResult.PASS : ActionResult.FAIL;
        });
        // Handled screens consume ordinary keybinding presses, including while the agent opens storage.
        ScreenEvents.AFTER_INIT.register((game, screen, width, height) -> {
            ScreenKeyboardEvents.allowKeyPress(screen).register((current, key, scan, modifiers) -> {
                if (!controller.hasControl() || !takeBack.matchesKey(key, scan)) return true;
                controller.release("Control returned to the player with the takeover binding.");
                return false;
            });
            ScreenMouseEvents.allowMouseClick(screen).register((current, x, y, button) -> {
                if (!controller.hasControl() || !takeBack.matchesMouse(button)) return true;
                controller.release("Control returned to the player with the takeover binding.");
                return false;
            });
        });
        ClientTickEvents.END_CLIENT_TICK.register(game -> {
            while (takeBack.wasPressed()) {
                controller.release("Control returned to the player with F8.");
                if (game.player != null)
                    game.player.sendMessage(Text.literal("Minecraft Agent: you have control."), true);
            }
            controller.tick();
        });
        ClientLifecycleEvents.CLIENT_STARTED.register(game -> {
            AgentController.prepareBaritoneDrops();
            try {
                bridge = new BridgeServer(game, controller);
                LOGGER.info("Local agent bridge ready.");
            } catch (Exception exception) {
                LOGGER.error("Could not start the agent bridge", exception);
            }
        });
        ClientLifecycleEvents.CLIENT_STOPPING.register(game -> {
            controller.release("Minecraft is closing.");
            if (bridge != null) bridge.close();
        });
    }
}
