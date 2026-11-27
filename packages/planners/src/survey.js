import { playerPosition, headingBetween, uniqueContainers } from '../../../src/cli-views.js';

// Reports describe the backend's partial observation, never a complete world scan.
export const SURVEY_REPORTS = {
  'block-position': 'Floor the player position to Minecraft block coordinates.',
  chunk: 'Find the current chunk and coordinates within it.',
  section: 'Find the current 16×16×16 section and local coordinates.',
  region: 'Find the current region file and chunk coordinates within it.',
  'chunk-bounds': 'Show inclusive block bounds of the current chunk.',
  'height-limits': 'Compare altitude with standard vanilla dimension build limits.',
  'border-margin': 'Measure distance to the hard coordinate limits used by goto.',
  vitals: 'Show hearts and missing health and hunger points.',
  'threat-types': 'Count observed threats by entity type.',
  'nearest-threat': 'Find the nearest threat with a known distance.',
  'threat-bands': 'Count observed threats in nonoverlapping distance bands.',
  'threat-directions': 'Group located threats by compass direction.',
  'threat-elevation': 'Group located threats above, below, or level with the player.',
  'block-types': 'Count observed blocks by block type.',
  'block-bounds': 'Show the bounding box of located observed blocks.',
  'block-levels': 'Count observed blocks at each block Y coordinate.',
  'block-directions': 'Group located observed blocks by compass direction.',
  logs: 'List observed vanilla log and stem blocks nearest first.',
  ores: 'List observed vanilla ore blocks nearest first.',
  hazards: 'List observed harmful blocks nearest first.',
  liquids: 'List observed water and lava blocks nearest first.',
  'container-types': 'Count distinct observed container positions by type.',
  'container-coverage': 'Distinguish opened containers from unknown contents.',
  'container-age': 'Show the age of each container contents observation.',
  'observation-coverage': 'Show which optional observation collections are reported.',
};

const located = (entry) => entry && ['x', 'y', 'z'].every((axis) => Number.isFinite(entry[axis]));
const floor = (point) => Object.fromEntries(['x', 'y', 'z'].map((axis) => [axis, Math.floor(point[axis])]));
const local = (value, size) => ((value % size) + size) % size;
const nameOf = (entry) => entry.type ?? entry.name ?? 'unknown';
const group = (entries, key) => {
  const counts = new Map();
  for (const entry of entries) {
    const name = key(entry);
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return [...counts]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || String(a.name).localeCompare(String(b.name)));
};
const LOG = /^minecraft:(?:(?:oak|spruce|birch|jungle|acacia|dark_oak|mangrove|cherry)_log|(?:crimson|warped)_stem)$/;
const ORE =
  /^minecraft:(?:(?:deepslate_)?(?:coal|iron|copper|gold|redstone|emerald|lapis|diamond)_ore|nether_gold_ore|nether_quartz_ore|ancient_debris)$/;
const HAZARDS = new Set(
  [
    'lava',
    'fire',
    'soul_fire',
    'cactus',
    'magma_block',
    'sweet_berry_bush',
    'wither_rose',
    'powder_snow',
    'campfire',
    'soul_campfire',
  ].map((name) => `minecraft:${name}`),
);

export function surveyView(state, report, { now = Date.now() } = {}) {
  if (!Object.hasOwn(SURVEY_REPORTS, report)) throw new Error(`Unknown survey report: ${report}.`);
  const position = playerPosition(state);
  const block = floor(position);
  const collection = (field) => (Array.isArray(state[field]) ? state[field] : []);
  const measured = (field) =>
    collection(field)
      .map((entry) => ({
        ...entry,
        distance:
          Number.isFinite(entry.distance) && entry.distance >= 0
            ? entry.distance
            : located(entry)
              ? Math.hypot(entry.x - position.x, entry.y - position.y, entry.z - position.z)
              : null,
      }))
      .sort((a, b) => (a.distance ?? Infinity) - (b.distance ?? Infinity));
  const observed = (field, data) => ({ supported: Array.isArray(state[field]), scope: 'partial_observation', ...data });
  const directions = (field) => {
    const entries = collection(field).filter(located);
    return observed(field, {
      groups: group(entries, (entry) => headingBetween(position, entry).compass ?? 'same_column'),
      unlocated: collection(field).length - entries.length,
    });
  };
  const selectedBlocks = (predicate) => {
    if (['ores', 'hazards', 'liquids'].includes(report) && ['fabric', 'mineflayer'].includes(state.backend)) {
      return {
        supported: false,
        scope: 'partial_observation',
        blocks: [],
        reason:
          'Current Fabric and Mineflayer backends only report collection targets; ores, hazards, and liquids are unavailable from these observations.',
      };
    }
    return observed('blocks', { blocks: measured('blocks').filter((entry) => predicate(entry.name)) });
  };
  switch (report) {
    case 'block-position':
      return { block };
    case 'chunk':
      return {
        x: Math.floor(block.x / 16),
        z: Math.floor(block.z / 16),
        localX: local(block.x, 16),
        localZ: local(block.z, 16),
      };
    case 'section':
      return {
        section: Object.fromEntries(['x', 'y', 'z'].map((axis) => [axis, Math.floor(block[axis] / 16)])),
        local: Object.fromEntries(['x', 'y', 'z'].map((axis) => [axis, local(block[axis], 16)])),
      };
    case 'region': {
      const x = Math.floor(block.x / 512),
        z = Math.floor(block.z / 512);
      return {
        x,
        z,
        file: `r.${x}.${z}.mca`,
        chunkX: local(Math.floor(block.x / 16), 32),
        chunkZ: local(Math.floor(block.z / 16), 32),
      };
    }
    case 'chunk-bounds': {
      const x = Math.floor(block.x / 16) * 16,
        z = Math.floor(block.z / 16) * 16;
      return { min: { x, z }, max: { x: x + 15, z: z + 15 } };
    }
    case 'height-limits': {
      const dimension = state.player.dimension ?? null;
      const limits = {
        'minecraft:overworld': [-64, 319],
        'minecraft:the_nether': [0, 255],
        'minecraft:the_end': [0, 255],
      }[dimension];
      return {
        dimension,
        blockY: block.y,
        standardVanillaLimits: limits ? { min: limits[0], max: limits[1] } : null,
        blocksAboveMin: limits ? block.y - limits[0] : null,
        blocksBelowMax: limits ? limits[1] - block.y : null,
        caveat:
          'Standard vanilla build limits only; custom dimension types can differ. Nether terrain height is distinct from the build limit.',
      };
    }
    case 'border-margin':
      return {
        west: position.x + 29_999_984,
        east: 29_999_984 - position.x,
        north: position.z + 29_999_984,
        south: 29_999_984 - position.z,
        caveat: 'Goto coordinate bounds; the server world border may be smaller.',
      };
    case 'vitals': {
      const health = Number.isFinite(state.player.health) ? state.player.health : null;
      const hunger = Number.isFinite(state.player.hunger) ? state.player.hunger : null;
      return {
        health,
        hearts: health === null ? null : health / 2,
        hunger,
        missingHealthTo20: health === null ? null : Math.max(0, 20 - health),
        missingHungerTo20: hunger === null ? null : Math.max(0, 20 - hunger),
        caveat: '20-point reference; maximum health and absorption are not reported.',
      };
    }
    case 'threat-types':
      return observed('threats', { types: group(collection('threats'), nameOf) });
    case 'nearest-threat': {
      const threats = measured('threats');
      return observed('threats', {
        threat: threats.find((entry) => entry.distance !== null) ?? null,
        unknownDistance: threats.filter((entry) => entry.distance === null).length,
      });
    }
    case 'threat-bands': {
      const threats = measured('threats');
      return observed('threats', {
        within5: threats.filter((entry) => entry.distance !== null && entry.distance <= 5).length,
        over5To16: threats.filter((entry) => entry.distance > 5 && entry.distance <= 16).length,
        over16To32: threats.filter((entry) => entry.distance > 16 && entry.distance <= 32).length,
        over32: threats.filter((entry) => entry.distance > 32).length,
        unknownDistance: threats.filter((entry) => entry.distance === null).length,
      });
    }
    case 'threat-directions':
      return directions('threats');
    case 'threat-elevation': {
      const threats = collection('threats');
      return observed('threats', {
        above: threats.filter((entry) => located(entry) && Math.floor(entry.y) > block.y).length,
        below: threats.filter((entry) => located(entry) && Math.floor(entry.y) < block.y).length,
        level: threats.filter((entry) => located(entry) && Math.floor(entry.y) === block.y).length,
        unlocated: threats.filter((entry) => !located(entry)).length,
      });
    }
    case 'block-types':
      return observed('blocks', { types: group(collection('blocks'), nameOf) });
    case 'block-bounds': {
      const blocks = collection('blocks').filter(located);
      return observed('blocks', {
        count: blocks.length,
        bounds: blocks.length
          ? {
              min: Object.fromEntries(
                ['x', 'y', 'z'].map((axis) => [axis, Math.min(...blocks.map((entry) => entry[axis]))]),
              ),
              max: Object.fromEntries(
                ['x', 'y', 'z'].map((axis) => [axis, Math.max(...blocks.map((entry) => entry[axis]))]),
              ),
            }
          : null,
        unlocated: collection('blocks').length - blocks.length,
      });
    }
    case 'block-levels':
      return observed('blocks', {
        levels: group(collection('blocks').filter(located), (entry) => Math.floor(entry.y))
          .map(({ name, count }) => ({ y: name, count }))
          .sort((a, b) => a.y - b.y),
        unlocated: collection('blocks').filter((entry) => !located(entry)).length,
      });
    case 'block-directions':
      return directions('blocks');
    case 'logs':
      return selectedBlocks((name) => LOG.test(name));
    case 'ores':
      return selectedBlocks((name) => ORE.test(name));
    case 'hazards':
      return {
        ...selectedBlocks((name) => HAZARDS.has(name)),
        caveat: 'Potentially harmful block types; lit state, falls, and unreported dangers are not assessed.',
      };
    case 'liquids':
      return selectedBlocks((name) => name === 'minecraft:water' || name === 'minecraft:lava');
    case 'container-types':
      return observed('containers', {
        types: group(uniqueContainers(collection('containers')), nameOf),
        contents: 'last_observed',
      });
    case 'container-coverage': {
      const containers = uniqueContainers(collection('containers'));
      const opened = containers.filter((entry) => Array.isArray(entry.items));
      return observed('containers', {
        total: containers.length,
        opened: opened.length,
        unopened: containers.length - opened.length,
        knownEmpty: opened.filter((entry) => !entry.items.some((item) => item.count > 0)).length,
        contents: 'last_observed',
      });
    }
    case 'container-age': {
      if (!Number.isFinite(now)) throw new Error('Current time must be finite.');
      return observed('containers', {
        contents: 'last_observed',
        containers: uniqueContainers(collection('containers')).map((entry) => ({
          x: entry.x,
          y: entry.y,
          z: entry.z,
          opened: Array.isArray(entry.items),
          observedAt: Number.isFinite(entry.observedAt) ? entry.observedAt : null,
          ageSeconds: Number.isFinite(entry.observedAt) ? (now - entry.observedAt) / 1000 : null,
          clockSkew: Number.isFinite(entry.observedAt) && entry.observedAt > now,
        })),
      });
    }
    case 'observation-coverage':
      return {
        scope: 'partial_observation',
        backend: state.backend ?? null,
        dimension: state.player.dimension ?? null,
        collections: ['blocks', 'threats', 'containers'].map((field) => ({
          field,
          supported: Array.isArray(state[field]),
          observedCount: Array.isArray(state[field]) ? state[field].length : null,
        })),
        caveat: 'Reported entries are not a complete scan; zero observed threats does not prove safety.',
      };
  }
}

export function registerSurvey(program, { view }) {
  const command = program
    .command('survey')
    .description('Read-only spatial and nearby reports from a partial observation.');
  for (const [name, description] of Object.entries(SURVEY_REPORTS))
    command
      .command(name)
      .description(description)
      .action(() => view((state) => surveyView(state, name)));
  return command;
}
