package dev.minecraftagent.mixin;

import dev.minecraftagent.StoragePackets;
import net.minecraft.network.ClientConnection;
import net.minecraft.network.packet.Packet;
import net.minecraft.network.packet.c2s.play.PlayerInteractBlockC2SPacket;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

@Mixin(ClientConnection.class)
public abstract class StorageInteractionMixin {
    @Inject(method = "send(Lnet/minecraft/network/packet/Packet;)V", at = @At("HEAD"))
    private void minecraftAgentInteraction(Packet<?> packet, CallbackInfo ci) {
        if (packet instanceof PlayerInteractBlockC2SPacket interaction)
            StoragePackets.interactionSent(interaction.getSequence());
    }
}
