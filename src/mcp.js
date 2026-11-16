import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { actionSchema, positionSchema } from './protocol.js';
import { inventoryView, nearbyView, storageView, summaryView, findItemView, directionView, homeTarget } from './cli-views.js';

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
  server.registerTool('minecraft_inventory', {
    description: 'Read combined item counts and occupied inventory slots without taking control. Optionally filter by item name such as oak_log.',
    annotations: { readOnlyHint: true }, inputSchema: { item: z.string().max(100).optional() },
  }, wrap(async ({ item }) => inventoryView(await adapter.observe(), { item })));
  server.registerTool('minecraft_nearby', {
    description: 'List observed loaded blocks, hostile threats, or containers nearest first without taking control. These are partial observations, not a world scan; absent threats do not prove safety. Container contents are last observed, not refreshed.',
    annotations: { readOnlyHint: true },
    inputSchema: { kind: z.enum(['blocks', 'threats', 'containers']), name: z.string().max(100).optional().describe('block or container name, for example oak_log or chest'),
      radius: z.number().positive().finite().optional(), limit: z.number().int().positive().optional() },
  }, wrap(async ({ kind, name, radius, limit = 20 }) => {
    if (kind === 'threats' && name !== undefined) throw new Error('Name filters apply to blocks and containers only.');
    const state = await adapter.observe();
    const options = { name, radius, limit };
    return kind === 'containers' ? storageView(state, options) : nearbyView(state, kind, options);
  }));
  server.registerTool('minecraft_summary', {
    description: 'Read position, dimension, health, hunger, control mode, current job, home distance, threat count, and inventory totals without taking control.',
    annotations: { readOnlyHint: true }, inputSchema: {},
  }, wrap(async () => summaryView(await adapter.observe())));
  server.registerTool('minecraft_find_item', {
    description: 'Count an item in inventory and in last observed storage, nearest container first, without opening containers or taking control.',
    annotations: { readOnlyHint: true }, inputSchema: { item: z.string().max(100).describe('item name, for example oak_log') },
  }, wrap(async ({ item }) => findItemView(await adapter.observe(), item)));
  server.registerTool('minecraft_direction', {
    description: 'Compass bearing, yaw, pitch, and distance to a coordinate or the saved home, without moving or taking control. Pass either x, y, z or home: true.',
    annotations: { readOnlyHint: true },
    inputSchema: { x: z.number().optional(), y: z.number().optional(), z: z.number().optional(), home: z.literal(true).optional() },
  }, wrap(async ({ home, ...coordinates }) => {
    const given = ['x', 'y', 'z'].filter(axis => coordinates[axis] !== undefined);
    if (home ? given.length : given.length !== 3) throw new Error('Pass either x, y, and z, or home: true.');
    const target = home ? undefined : positionSchema.safeParse(coordinates);
    if (target && !target.success) throw new Error('Coordinates must be inside the world: Y from -64 to 320 and X/Z within ±29,999,984.');
    const state = await adapter.observe();
    return directionView(state, home ? homeTarget(state) : target.data);
  }));
  server.registerTool('minecraft_take_control', {
    description: 'Take exclusive control of the currently logged-in player. F8 or minecraft_stop returns control. Do this only when the user asks you to play.', inputSchema: {},
  }, wrap(async () => {
    // This tool is an explicit new takeover, unlike delayed action dispatch.
    if (adapter.leaseId && (adapter.leaseError || (await adapter.observe()).mode !== 'agent')) await adapter.release();
    await adapter.acquire(); return { controlled: true };
  }));
  server.registerTool('minecraft_action', {
    description: 'Execute one bounded gameplay action and wait for its result. Requires prior minecraft_take_control. collect adds items to current inventory. deposit stores an item in the nearest chest or barrel within 16 blocks; its result names that container (x, y, z) and its contents just before the deposit (before). inspect_storage reopens previously observed storage and returns to its starting position; pass containers (1 to 16 block positions the bot has opened) to reopen only those, for example the ones a task deposited into. Home is scoped to the world, account, and dimension.',
    inputSchema: { action: actionSchema },
  }, wrap(async ({ action }, extra) => {
    if (!adapter.leaseId || adapter.leaseError) throw new Error('Use minecraft_take_control first.');
    return adapter.execute(action, { signal: extra.signal });
  }));
  server.registerTool('minecraft_cancel', {
    description: 'Cancel the running action while retaining agent control.', inputSchema: {},
  }, wrap(async () => { await adapter.cancel(); return { stopped: true }; }));
  server.registerTool('minecraft_release', {
    description: 'Gracefully end this session: cancel its running action and return control to the player. Does not affect sessions started by another process; harmless when not in control.', inputSchema: {},
  }, wrap(async () => { const released = Boolean(adapter.leaseId); await adapter.release(); return { controlled: false, released }; }));
  server.registerTool('minecraft_stop', {
    description: 'Emergency stop: cancel gameplay and immediately return control to the player, including sessions started by another process.', inputSchema: {},
  }, wrap(async () => { await adapter.emergencyStop(); await adapter.release(); return { controlled: false }; }));
  await server.connect(new StdioServerTransport());
  return server;
}
