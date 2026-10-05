import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { actionSchema } from './protocol.js';

export async function serveMcp(adapter) {
  const server = new McpServer({ name: 'minecraft-agent', version: '0.1.0' });
  const result = value => ({ content: [{ type: 'text', text: JSON.stringify(value, null, 2) }] });
  const wrap = callback => async (args, extra) => {
    try { return result(await callback(args, extra)); }
    catch (error) { return { ...result({ error: error.message }), isError: true }; }
  };
  server.registerTool('minecraft_observe', {
    description: 'Read player health, hunger, inventory, loaded nearby blocks, threats, current action, and saved home without taking control.',
    annotations: { readOnlyHint: true }, inputSchema: {},
  }, wrap(() => adapter.observe()));
  server.registerTool('minecraft_take_control', {
    description: 'Take exclusive control of the currently logged-in player. F8 or minecraft_stop returns control. Do this only when the user asks you to play.', inputSchema: {},
  }, wrap(async () => {
    // This tool is an explicit new takeover, unlike delayed action dispatch.
    if (adapter.leaseId && (adapter.leaseError || (await adapter.observe()).mode !== 'agent')) await adapter.release();
    await adapter.acquire(); return { controlled: true };
  }));
  server.registerTool('minecraft_action', {
    description: 'Execute one bounded gameplay action and wait for its result. Requires prior minecraft_take_control. collect adds items to current inventory. Home is scoped to the world, account, and dimension.',
    inputSchema: { action: actionSchema },
  }, wrap(async ({ action }, extra) => {
    if (!adapter.leaseId || adapter.leaseError) throw new Error('Use minecraft_take_control first.');
    return adapter.execute(action, { signal: extra.signal });
  }));
  server.registerTool('minecraft_cancel', {
    description: 'Cancel the running action while retaining agent control.', inputSchema: {},
  }, wrap(async () => { await adapter.cancel(); return { stopped: true }; }));
  server.registerTool('minecraft_stop', {
    description: 'Emergency stop: cancel gameplay and immediately return control to the player, including sessions started by another process.', inputSchema: {},
  }, wrap(async () => { await adapter.emergencyStop(); await adapter.release(); return { controlled: false }; }));
  await server.connect(new StdioServerTransport());
  return server;
}
