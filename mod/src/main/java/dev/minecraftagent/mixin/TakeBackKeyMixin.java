package dev.minecraftagent.mixin;

import dev.minecraftagent.AgentClient;
import net.minecraft.client.Keyboard;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/** Sees the takeover key as it arrives, before an agent screen opening can clear the binding's pending press. */
@Mixin(Keyboard.class)
public abstract class TakeBackKeyMixin {
    @Inject(method = "onKey", at = @At("HEAD"))
    private void minecraftAgentTakeBack(
            long window, int key, int scancode, int action, int modifiers, CallbackInfo ci) {
        AgentClient.takeBackKey(window, key, scancode, action);
    }
}
