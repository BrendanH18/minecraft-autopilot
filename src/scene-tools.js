import { playerPosition, itemName, uniqueContainers } from './cli-views.js';
import { navPoint, navNumber } from './navigation.js';

const axes = ['x', 'y', 'z'];
const located = p => p && axes.every(k => Number.isFinite(p[k]));
const distance = (a, b) => Math.hypot(...axes.map(k => a[k] - b[k]));
const radius = value => { const n = navNumber(value); if (n < 0 || n > 60_000_000) throw new Error('Radius must be from 0 to 60000000.'); return n; };
const note = 'Partial observation only; missing entries do not prove absence or safety. Container contents are last observed. Distances are geometry, not pathfinding.';
export const SCENE_COMMANDS = [
  ['blocks-box <a> <b>', 'Find observed blocks in an inclusive cuboid.'],
  ['threats-box <a> <b>', 'Find located threats in an inclusive cuboid.'],
  ['containers-box <a> <b>', 'Find distinct containers in an inclusive cuboid.'],
  ['blocks-layer <min> <max>', 'Select blocks in a Y interval.'],
  ['threats-layer <min> <max>', 'Select threats in a Y interval.'],
  ['containers-layer <min> <max>', 'Select containers in a Y interval.'],
  ['blocks-chunk <x> <z>', 'Select blocks in a chunk by integer indices.'],
  ['threats-chunk <x> <z>', 'Select threats in a chunk by integer indices.'],
  ['containers-chunk <x> <z>', 'Select containers in a chunk by integer indices.'],
  ['blocks-around <point> <radius>', 'Select blocks near an arbitrary point.'],
  ['threats-around <point> <radius>', 'Select located threats near an arbitrary point.'],
  ['containers-around <point> <radius>', 'Select containers near an arbitrary point.'],
  ['blocks-home <radius>', 'Select blocks around the saved home.'],
  ['threats-home <radius>', 'Select located threats around the saved home.'],
  ['containers-home <radius>', 'Select containers around the saved home.'],
  ['blocks-shell <inner> <outer>', 'Select blocks in a spherical shell around the player.'],
  ['threats-shell <inner> <outer>', 'Select located threats in a spherical shell.'],
  ['containers-shell <inner> <outer>', 'Select containers in a spherical shell.'],
  ['block-clearance <item>', 'Measure each matching block’s nearest located observed threat.'],
  ['container-clearance', 'Measure each container’s nearest located observed threat.'],
  ['threat-separation', 'Find the closest pair of located observed threats.'],
  ['block-centers', 'Calculate mean observed block positions by block name.'],
  ['container-centers', 'Calculate mean distinct container positions by container name.'],
  ['location-gaps', 'Count entries missing usable coordinates in each collection.'],
  ['home-neighbors', 'Find the nearest block, threat, and container to home.'],
];

export function sceneReport(state, command, args = []) {
  const player = playerPosition(state);
  const source = field => field === 'containers' ? uniqueContainers(state[field]) : (Array.isArray(state[field]) ? state[field] : []);
  const points = field => source(field).filter(located);
  const metadata = field => ({ supported: Array.isArray(state[field]), unlocated: source(field).filter(p => !located(p)).length });
  const home = () => {
    if (!located(state.home)) throw new Error('A saved home with coordinates is required.');
    if (state.home.dimension && state.player.dimension && state.home.dimension !== state.player.dimension) throw new Error('Home is in another dimension.');
    return state.home;
  };
  const list = (field, predicate, center = player) => ({ ...metadata(field), entries: points(field).filter(predicate)
    .map(p => ({ ...p, distance: distance(p, center) })).sort((a, b) => a.distance - b.distance), note });
  if (!SCENE_COMMANDS.some(([sig]) => sig.split(' ')[0] === command)) throw new Error(`Unknown scene query: ${command}.`);
  const selection = /^(blocks|threats|containers)-(box|layer|chunk|around|home|shell)$/.exec(command);
  if (selection) {
    const [, field, kind] = selection;
    if (kind === 'box') { const a = navPoint(args[0]), b = navPoint(args[1]); return list(field, p => axes.every(k => p[k] >= Math.min(a[k], b[k]) && p[k] <= Math.max(a[k], b[k]))); }
    if (kind === 'layer') {
      const min = navNumber(args[0]), max = navNumber(args[1]);
      if (min < -64 || max > 320 || min > max) throw new Error('Y range must be ordered within -64 to 320.');
      return list(field, p => p.y >= min && p.y <= max);
    }
    if (kind === 'chunk') {
      const [x, z] = args.map(navNumber);
      if (![x, z].every(n => Number.isInteger(n) && n >= -1874999 && n <= 1874999)) throw new Error('Use supported integer chunk indices.');
      return list(field, p => Math.floor(p.x / 16) === x && Math.floor(p.z / 16) === z);
    }
    if (kind === 'around' || kind === 'home') {
      const center = kind === 'home' ? home() : navPoint(args[0]), r = radius(args[kind === 'home' ? 0 : 1]);
      return list(field, p => distance(p, center) <= r, center);
    }
    const inner = radius(args[0]), outer = radius(args[1]);
    if (inner > outer) throw new Error('Inner radius must not exceed outer radius.');
    return list(field, p => distance(p, player) >= inner && distance(p, player) <= outer);
  }
  if (command === 'block-clearance' || command === 'container-clearance') {
    const field = command === 'block-clearance' ? 'blocks' : 'containers';
    const name = field === 'blocks' ? itemName(args[0]) : null;
    const threats = points('threats');
    return { ...metadata(field), threats: metadata('threats'), entries: points(field).filter(p => !name || p.name === name).map(p => ({ ...p,
      nearestObservedThreat: threats.length ? Math.min(...threats.map(t => distance(p, t))) : null })), note };
  }
  if (command === 'threat-separation') {
    const threats = points('threats'); let pair = null;
    for (let i = 0; i < threats.length; i++) for (let j = i + 1; j < threats.length; j++) {
      const d = distance(threats[i], threats[j]);
      if (!pair || d < pair.distance) pair = { first: threats[i], second: threats[j], distance: d };
    }
    return { ...metadata('threats'), pair, note };
  }
  if (command === 'block-centers' || command === 'container-centers') {
    const field = command === 'block-centers' ? 'blocks' : 'containers', groups = new Map();
    for (const p of points(field)) { const name = p.name ?? 'unknown'; if (!groups.has(name)) groups.set(name, []); groups.get(name).push(p); }
    return { ...metadata(field), groups: [...groups].sort(([a], [b]) => a.localeCompare(b)).map(([name, entries]) => ({ name, count: entries.length,
      center: Object.fromEntries(axes.map(k => [k, entries.reduce((n, p) => n + p[k], 0) / entries.length])) })), note };
  }
  if (command === 'location-gaps') return { collections: ['blocks', 'threats', 'containers'].map(field => ({ field, ...metadata(field), located: points(field).length })), note };
  const center = home();
  return { collections: ['blocks', 'threats', 'containers'].map(field => ({ field, ...metadata(field), nearest: list(field, () => true, center).entries[0] ?? null })), note };
}

export function registerSceneTools(program, { view }) {
  const group = program.command('scene').description('Read-only spatial queries over partial observations; points use x,y,z.');
  for (const [signature, description] of SCENE_COMMANDS) {
    const [name, ...args] = signature.split(' ');
    group.command(signature).description(description).action((...values) => view(state => sceneReport(state, name, values.slice(0, args.length))));
  }
  return group;
}
