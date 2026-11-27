import { readFile } from 'node:fs/promises';
import { parseSnapshot, itemName, inventoryView } from '../../../src/cli-views.js';

const NOTE =
  'Saved observations only. Changes between samples are net changes, not proof of collection, eating, damage cause, or the actual traveled path. Distances require matching known dimensions.';
export const TIMELINE_COMMANDS = [
  ['gains <files...>', 'Sum positive sampled inventory changes by item.'],
  ['losses <files...>', 'Sum negative sampled inventory changes by item.'],
  ['net-items <files...>', 'Compare first and last item quantities.'],
  ['turnover <files...>', 'Show sampled item gains, losses, and net change together.'],
  ['item-history <item> <files...>', 'Trace one item through all samples.'],
  ['item-rate <item> <files...>', 'Measure endpoint net item change per minute.'],
  ['item-peak <item> <files...>', 'Find the first sample at the highest observed quantity.'],
  ['item-target <item> <count> <files...>', 'Find the first sample meeting a carried quota.'],
  ['total-history <files...>', 'Trace total carried item counts.'],
  ['diversity-history <files...>', 'Trace distinct carried item counts.'],
  ['health-history <files...>', 'Trace available health readings and their deltas.'],
  ['hunger-history <files...>', 'Trace available hunger readings and their deltas.'],
  ['damage-events <files...>', 'Locate sampled health decreases.'],
  ['healing-events <files...>', 'Locate sampled health increases.'],
  ['hunger-drops <files...>', 'Locate sampled hunger decreases.'],
  ['food-gains <files...>', 'Locate sampled hunger increases without inferring cause.'],
  ['dimension-visits <files...>', 'Summarize consecutive observed dimension visits.'],
  ['dimension-crossings <files...>', 'Locate changes between known dimension identifiers.'],
  ['movement-legs <files...>', 'Measure comparable straight-line sample displacements.'],
  ['path-summary <files...>', 'Sum comparable sample displacements and ascent/descent.'],
  ['home-events <files...>', 'Locate changes to the saved home.'],
  ['time-gaps <files...>', 'Report each sampling interval and the largest gap.'],
  ['largest-gains <limit> <files...>', 'Rank items by positive sampled changes.'],
  ['largest-losses <limit> <files...>', 'Rank items by negative sampled changes.'],
  ['stable-items <files...>', 'Find positive item quantities unchanged in every sample.'],
];
function integer(value, min, max) {
  if (
    !/^\d+$/.test(String(value)) ||
    !Number.isSafeInteger(Number(value)) ||
    Number(value) < min ||
    Number(value) > max
  )
    throw new Error(`Use an integer from ${min} to ${max}.`);
  return Number(value);
}
export function timelineReport(values, command, args = []) {
  if (!Array.isArray(values) || values.length < 2 || values.length > 100)
    throw new Error('Give 2 to 100 snapshots in chronological order.');
  const samples = values.map((value) => parseSnapshot(JSON.stringify(value)));
  const times = samples.map((s) => Date.parse(s.savedAt));
  if (times.some((time, i) => i && time <= times[i - 1]))
    throw new Error('Snapshot times must be strictly increasing.');
  const stamp = (i) => ({ sample: i + 1, savedAt: samples[i].savedAt });
  const inventories = samples.map((s) => new Map(inventoryView(s).items.map((i) => [i.name, i.count])));
  const names = [...new Set(inventories.flatMap((m) => [...m.keys()]))].sort();
  const quantity = (i, name) => inventories[i].get(name) ?? 0;
  const totals = names.map((name) => {
    let gained = 0,
      lost = 0;
    for (let i = 1; i < samples.length; i++) {
      const d = quantity(i, name) - quantity(i - 1, name);
      gained += Math.max(0, d);
      lost += Math.max(0, -d);
    }
    return { name, gained, lost, net: quantity(samples.length - 1, name) - quantity(0, name) };
  });
  const history = (field) =>
    samples.map((s, i) => {
      const value = s.player[field] ?? null,
        previous = i ? samples[i - 1].player[field] : null;
      return {
        ...stamp(i),
        value,
        delta: Number.isFinite(value) && Number.isFinite(previous) ? value - previous : null,
      };
    });
  const dimension = (s) => s.player.dimension ?? null;
  const legs = () =>
    samples.slice(1).map((s, j) => {
      const a = samples[j],
        comparable = Boolean(dimension(a)) && dimension(a) === dimension(s);
      const delta = Object.fromEntries(
        ['x', 'y', 'z'].map((axis) => [axis, s.player.position[axis] - a.player.position[axis]]),
      );
      const seconds = (times[j + 1] - times[j]) / 1000;
      const distance = comparable ? Math.hypot(delta.x, delta.y, delta.z) : null;
      return {
        fromSample: j + 1,
        toSample: j + 2,
        seconds,
        comparable,
        delta: comparable ? delta : null,
        distance,
        blocksPerSecond: distance === null ? null : distance / seconds,
      };
    });
  const durationSeconds = (times.at(-1) - times[0]) / 1000;
  let result;
  switch (command) {
    case 'gains':
      result = { items: totals.filter((i) => i.gained).map(({ name, gained }) => ({ name, gained })) };
      break;
    case 'losses':
      result = { items: totals.filter((i) => i.lost).map(({ name, lost }) => ({ name, lost })) };
      break;
    case 'net-items':
      result = { items: totals.filter((i) => i.net).map(({ name, net }) => ({ name, net })) };
      break;
    case 'turnover':
      result = { items: totals };
      break;
    case 'item-history':
    case 'item-rate':
    case 'item-peak':
    case 'item-target': {
      const name = itemName(args[0]),
        readings = samples.map((_, i) => ({ ...stamp(i), count: quantity(i, name) }));
      if (command === 'item-history') result = { name, readings };
      if (command === 'item-rate') {
        const net = readings.at(-1).count - readings[0].count;
        result = { name, net, perMinute: (net / durationSeconds) * 60 };
      }
      if (command === 'item-peak')
        result = { name, peak: readings.reduce((best, r) => (r.count > best.count ? r : best)) };
      if (command === 'item-target') {
        const target = integer(args[1], 0, 1_000_000);
        result = { name, target, first: readings.find((r) => r.count >= target) ?? null };
      }
      break;
    }
    case 'total-history':
      result = {
        readings: inventories.map((m, i) => ({ ...stamp(i), count: [...m.values()].reduce((a, b) => a + b, 0) })),
      };
      break;
    case 'diversity-history':
      result = { readings: inventories.map((m, i) => ({ ...stamp(i), count: m.size })) };
      break;
    case 'health-history':
    case 'hunger-history':
      result = { readings: history(command === 'health-history' ? 'health' : 'hunger') };
      break;
    case 'damage-events':
    case 'healing-events':
    case 'hunger-drops':
    case 'food-gains': {
      const negative = command === 'damage-events' || command === 'hunger-drops';
      const field = command === 'damage-events' || command === 'healing-events' ? 'health' : 'hunger';
      result = { events: history(field).filter((r) => r.delta !== null && (negative ? r.delta < 0 : r.delta > 0)) };
      break;
    }
    case 'dimension-visits': {
      const visits = [];
      samples.forEach((s, i) => {
        const d = dimension(s),
          previous = visits.at(-1);
        if (previous && previous.dimension === d) {
          previous.lastSample = i + 1;
          previous.lastSeen = s.savedAt;
          previous.samples++;
        } else
          visits.push({
            dimension: d,
            firstSample: i + 1,
            lastSample: i + 1,
            firstSeen: s.savedAt,
            lastSeen: s.savedAt,
            samples: 1,
          });
      });
      result = { visits };
      break;
    }
    case 'dimension-crossings':
      result = {
        events: samples
          .slice(1)
          .flatMap((s, j) =>
            dimension(s) && dimension(samples[j]) && dimension(s) !== dimension(samples[j])
              ? [{ ...stamp(j + 1), from: dimension(samples[j]), to: dimension(s) }]
              : [],
          ),
      };
      break;
    case 'movement-legs':
      result = { legs: legs() };
      break;
    case 'path-summary': {
      const all = legs(),
        valid = all.filter((l) => l.comparable);
      result = {
        comparableLegs: valid.length,
        unknownLegs: all.length - valid.length,
        sampledDistance: valid.reduce((n, l) => n + l.distance, 0),
        ascent: valid.reduce((n, l) => n + Math.max(0, l.delta.y), 0),
        descent: valid.reduce((n, l) => n + Math.max(0, -l.delta.y), 0),
      };
      break;
    }
    case 'home-events': {
      const homeKey = (h) => JSON.stringify(h ? [h.x, h.y, h.z, h.dimension ?? null] : null);
      result = {
        events: samples
          .slice(1)
          .flatMap((s, j) =>
            homeKey(s.home) !== homeKey(samples[j].home)
              ? [{ ...stamp(j + 1), from: samples[j].home ?? null, to: s.home ?? null }]
              : [],
          ),
      };
      break;
    }
    case 'time-gaps': {
      const gaps = times
        .slice(1)
        .map((t, j) => ({ fromSample: j + 1, toSample: j + 2, seconds: (t - times[j]) / 1000 }));
      result = { gaps, largest: gaps.reduce((a, b) => (b.seconds > a.seconds ? b : a)) };
      break;
    }
    case 'largest-gains':
    case 'largest-losses': {
      const limit = integer(args[0], 1, 100),
        field = command === 'largest-gains' ? 'gained' : 'lost';
      result = {
        items: totals
          .filter((i) => i[field] > 0)
          .sort((a, b) => b[field] - a[field] || a.name.localeCompare(b.name))
          .slice(0, limit),
      };
      break;
    }
    case 'stable-items':
      result = {
        items: names
          .filter(
            (name) => quantity(0, name) > 0 && inventories.every((_, i) => quantity(i, name) === quantity(0, name)),
          )
          .map((name) => ({ name, count: quantity(0, name) })),
      };
      break;
    default:
      throw new Error(`Unknown timeline command: ${command}.`);
  }
  return { samples: samples.length, durationSeconds, ...result, note: NOTE };
}
export function registerTimelineTools(program, { print }) {
  const group = program
    .command('timeline')
    .description('Offline analysis of 2–100 chronological snapshot files; never connects to Minecraft.');
  for (const [signature, description] of TIMELINE_COMMANDS) {
    const name = signature.split(' ')[0];
    group
      .command(signature)
      .description(description)
      .action(async (...values) => {
        const params = values.slice(0, -2),
          files = params.pop();
        if (files.length < 2 || files.length > 100) throw new Error('Give 2 to 100 snapshots.');
        const snapshots = await Promise.all(files.map(async (file) => parseSnapshot(await readFile(file, 'utf8'))));
        print(timelineReport(snapshots, name, params));
      });
  }
  return group;
}
