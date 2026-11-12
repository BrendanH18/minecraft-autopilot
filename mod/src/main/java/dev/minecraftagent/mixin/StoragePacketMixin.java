package dev.minecraftagent.mixin;

import dev.minecraftagent.StoragePackets;
import net.minecraft.client.network.ClientPlayNetworkHandler;
import net.minecraft.network.packet.s2c.play.InventoryS2CPacket;
import net.minecraft.network.packet.s2c.play.OpenScreenS2CPacket;
import net.minecraft.network.packet.s2c.play.PlayerActionResponseS2CPacket;
import net.minecraft.network.packet.s2c.play.ScreenHandlerSlotUpdateS2CPacket;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

@Mixin(ClientPlayNetworkHandler.class)
public abstract class StoragePacketMixin {
    @Inject(method = "onOpenScreen", at = @At("TAIL"))
    private void minecraftAgentScreen(OpenScreenS2CPacket packet, CallbackInfo ci) { StoragePackets.screenOpened(); }

    @Inject(method = "onPlayerActionResponse", at = @At("TAIL"))
    private void minecraftAgentAck(PlayerActionResponseS2CPacket packet, CallbackInfo ci) { StoragePackets.acknowledged(packet.sequence()); }

    @Inject(method = "onInventory", at = @At("TAIL"))
    private void minecraftAgentInventory(InventoryS2CPacket packet, CallbackInfo ci) { StoragePackets.inventory(packet); }

    @Inject(method = "onScreenHandlerSlotUpdate", at = @At("TAIL"))
    private void minecraftAgentSlot(ScreenHandlerSlotUpdateS2CPacket packet, CallbackInfo ci) { StoragePackets.slot(packet); }
}
