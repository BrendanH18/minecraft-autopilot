package dev.minecraftagent.mixin;

import dev.minecraftagent.AgentClient;
import net.minecraft.client.Mouse;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/** The takeover binding may be a mouse button; see {@link TakeBackKeyMixin}. */
@Mixin(Mouse.class)
public abstract class TakeBackMouseMixin {
    @Inject(method = "onMouseButton", at = @At("HEAD"))
    private void minecraftAgentTakeBack(long window, int button, int action, int mods, CallbackInfo ci) {
        AgentClient.takeBackButton(window, button, action);
    }
}
