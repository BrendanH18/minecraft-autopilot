import { z } from 'zod';
import { open } from 'node:fs/promises';
import { constants } from 'node:fs';
import { join } from 'node:path';
import { dataDirectory, writePrivateJson } from './config.js';
import { positionSchema } from './protocol.js';

export const waypointFile = join(dataDirectory, 'waypoints.json');
export const MAX_WAYPOINTS = 100;
const MAX_WAYPOINT_BYTES = 1024 * 1024;
const NAME = /^[a-z0-9][a-z0-9_-]{0,31}$/;
const DIMENSION = /^[a-z0-9_.-]+:[a-z0-9_./-]+$/;

export function waypointName(value) {
  if (!NAME.test(value)) throw new Error('Waypoint names are 1–32 lowercase letters, digits, "_" or "-", starting with a letter or digit.');
  return value;
}
export function dimensionId(value) {
  if (value.length > 100 || !DIMENSION.test(value)) throw new Error('Use a dimension id such as minecraft:overworld.');
  return value;
}

const waypointSchema = z.object({ name: z.string().regex(NAME), ...positionSchema.shape, dimension: z.string().max(100).regex(DIMENSION), savedAt: z.iso.datetime() }).strict();
const fileSchema = z.object({ version: z.literal(1), waypoints: z.array(waypointSchema).max(MAX_WAYPOINTS) }).strict()
  .refine(file => new Set(file.waypoints.map(waypoint => waypoint.name)).size === file.waypoints.length, { message: 'duplicate waypoint names', path: ['waypoints'] });

/** Returns saved waypoints, or [] when the file does not exist; a corrupt file is an error and is never overwritten. */
export async function readWaypoints(path = waypointFile) {
  let file;
  try { file = await open(path, constants.O_RDONLY | constants.O_NONBLOCK); }
  catch (error) {
    if (error.code === 'ENOENT') return [];
    throw new Error(`Cannot read waypoints at ${path}: ${error.code || error.message}.`);
  }
  let text;
  try {
    // Never block on a FIFO or read an unbounded file; 100 waypoints fit easily in 1 MiB.
    if (!(await file.stat()).isFile()) throw new Error(`Waypoint file ${path} is not a regular file; fix or remove it.`);
    const buffer = Buffer.alloc(MAX_WAYPOINT_BYTES + 1);
    const { bytesRead } = await file.read(buffer, 0, buffer.length, 0);
    if (bytesRead > MAX_WAYPOINT_BYTES) throw new Error(`Waypoint file ${path} is larger than 1 MiB; fix or remove it.`);
    text = buffer.subarray(0, bytesRead).toString('utf8');
  } finally { await file.close(); }
  let parsed;
  try { parsed = JSON.parse(text); } catch { throw new Error(`Waypoint file ${path} is not valid JSON; fix or remove it.`); }
  const result = fileSchema.safeParse(parsed);
  if (!result.success) {
    const [issue] = result.error.issues;
    throw new Error(`Waypoint file ${path} is invalid (${issue.path.join('.') || 'root'}: ${issue.message}); fix or remove it.`);
  }
  return result.data.waypoints;
}

export async function writeWaypoints(waypoints, path = waypointFile) {
  await writePrivateJson(path, fileSchema.parse({ version: 1, waypoints: sortWaypoints(waypoints) }));
}

export const sortWaypoints = waypoints => [...waypoints].sort((a, b) => a.name.localeCompare(b.name));

/** Pure: adds or (with force) replaces a waypoint; enforces the name, bounds, and count limits. */
export function addWaypoint(waypoints, { name, x, y, z, dimension }, { force = false, now = new Date() } = {}) {
  waypointName(name);
  dimensionId(dimension);
  if (!positionSchema.safeParse({ x, y, z }).success) throw new Error(`Waypoint ${x} ${y} ${z} is outside goto bounds: Y must be -64 to 320 and X/Z within ±29,999,984.`);
  const replaced = waypoints.some(waypoint => waypoint.name === name);
  if (replaced && !force) throw new Error(`Waypoint ${name} already exists; pass --force to replace it.`);
  const rest = waypoints.filter(waypoint => waypoint.name !== name);
  if (rest.length >= MAX_WAYPOINTS) throw new Error(`At most ${MAX_WAYPOINTS} waypoints can be saved; remove one first.`);
  const waypoint = { name, x, y, z, dimension, savedAt: now.toISOString() };
  return { waypoints: sortWaypoints([...rest, waypoint]), waypoint, replaced };
}

export function findWaypoint(waypoints, name) {
  const waypoint = waypoints.find(entry => entry.name === waypointName(name));
  if (!waypoint) throw new Error(`No waypoint named ${name}. Run "mc-agent waypoint list" to see saved names.`);
  return waypoint;
}

export function removeWaypoint(waypoints, name) {
  findWaypoint(waypoints, name);
  return waypoints.filter(waypoint => waypoint.name !== name);
}

/** Refuses a waypoint saved in another dimension; observed dimension must be reported and equal. */
export function assertSameDimension(waypoint, state) {
  const dimension = state.player?.dimension;
  if (dimension !== waypoint.dimension) {
    throw new Error(`Waypoint ${waypoint.name} is in ${waypoint.dimension} but the player is in ${dimension ?? 'an unknown dimension'}; not taking control.`);
  }
}
