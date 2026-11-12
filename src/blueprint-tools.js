const NOTE = 'Offline block-count estimates only. Dimensions count occupied blocks, not coordinate spans. No blocks are placed; terrain, support, access, recipes, orientation, and build feasibility are not checked.';
const MAX = 1_000_000;
function integer(value, minimum = 1, maximum = MAX) {
  if (!/^\d+$/.test(String(value)) || !Number.isSafeInteger(Number(value)) || Number(value) < minimum || Number(value) > maximum) throw new Error(`Use an integer from ${minimum} to ${maximum}.`);
  return Number(value);
}
function number(value, minimum, maximum) {
  if (!['string', 'number'].includes(typeof value) || String(value).trim() === '') throw new Error('Use a finite number.');
  const n = Number(value);
  if (!Number.isFinite(n) || n < minimum || n > maximum) throw new Error(`Use a number from ${minimum} to ${maximum}.`);
  return n;
}
function safe(value) {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error('Block count exceeds the safe integer range.');
  return value;
}
const product = (...values) => values.reduce((n, v) => safe(n * v), 1);
const sum = values => values.reduce((n, v) => safe(n + v), 0);
const interior = (size, thickness) => Math.max(0, size - 2 * thickness);
const volume = (width, depth, height) => product(width, depth, height);
const border = (width, depth, thickness) => product(width, depth) - product(interior(width, thickness), interior(depth, thickness));
function positions(length, gap) {
  const intervals = Math.ceil((length - 1) / gap);
  if (intervals > 999) throw new Error('Position output is limited to 1000 entries; increase spacing.');
  return Array.from({ length: intervals + 1 }, (_, i) => intervals ? Math.floor(i * (length - 1) / intervals) : 0);
}

export const BLUEPRINT_COMMANDS = [
  ['floor <width> <depth> <layers>', 'Count blocks in a solid rectangular floor.'],
  ['floor-border <width> <depth> <thickness>', 'Count a border inside a rectangular footprint.'],
  ['checkerboard <width> <depth>', 'Split a rectangular floor into alternating block colors.'],
  ['stripes <width> <depth> <stripe-width>', 'Split a floor into alternating stripes across its width.'],
  ['wall <length> <height> <thickness>', 'Count a solid wall including its thickness.'],
  ['wall-opening <length> <height> <opening-width> <opening-height> <openings>', 'Subtract nonoverlapping through-openings from a one-block-thick wall.'],
  ['perimeter-walls <width> <depth> <height> <thickness>', 'Count four walls with shared corners counted once.'],
  ['closed-shell <width> <depth> <height> <thickness>', 'Count all six faces of a hollow box without overlap.'],
  ['open-box <width> <depth> <height> <thickness>', 'Count a bottom and four walls without a lid.'],
  ['room <inside-width> <inside-depth> <inside-height> <thickness>', 'Calculate outer dimensions and materials around a requested interior.'],
  ['cuboid-frame <width> <depth> <height>', 'Count unique blocks on all twelve one-block-thick box edges.'],
  ['pillars <count> <height> <width> <depth>', 'Count blocks in separate solid rectangular pillars.'],
  ['solid-stairs <width> <steps> <rise> <run>', 'Count full-block fill under a regular stepped staircase.'],
  ['gable-fill <width> <depth>', 'Count a solid centered gable rising one layer per inset block.'],
  ['pyramid <width> <depth>', 'Count successive filled layers shrinking by two in each horizontal axis.'],
  ['tunnel-clear <width> <height> <length>', 'Count cells in a rectangular excavation and its end opening area.'],
  ['tunnel-lining <inside-width> <inside-height> <length> <thickness>', 'Count four-sided lining around an open-ended tunnel.'],
  ['spaced-posts <length> <maximum-gap> <height>', 'Plan endpoint posts with evenly distributed integer spacing.'],
  ['grid-pillars <width> <depth> <x-gap> <z-gap> <height>', 'Plan a rectangular support grid including each boundary.'],
  ['layer-plan <width> <depth> <height>', 'List the material count and cumulative total for each solid layer.'],
  ['material-stacks <blocks> <stack-size>', 'Convert material blocks into full stacks, remainder, and occupied stacks.'],
  ['batch-output <required> <yield> <input-per-batch>', 'Plan whole batches from explicitly supplied output and input quantities.'],
  ['material-waste <blocks> <percent>', 'Add a rounded-up material allowance.'],
  ['material-split <blocks> <builders>', 'Divide materials fairly among numbered builders.'],
  ['build-time <blocks> <blocks-per-minute>', 'Estimate time at an explicit constant placement rate.'],
];

/** Pure bills of materials. Counts are validated before any bounded allocation. */
export function blueprintCalculation(command, args = []) {
  const dims = count => Array.from({ length: count }, (_, i) => integer(args[i]));
  let result;
  switch (command) {
    case 'floor': { const [width, depth, layers] = dims(3); result = { width, depth, layers, blocks: volume(width, depth, layers) }; break; }
    case 'floor-border': { const [width, depth, thickness] = dims(3); result = { width, depth, thickness, blocks: border(width, depth, thickness) }; break; }
    case 'checkerboard': {
      const [width, depth] = dims(2), blocks = product(width, depth);
      result = { width, depth, firstColor: Math.ceil(blocks / 2), secondColor: Math.floor(blocks / 2), originColor: 'firstColor' }; break;
    }
    case 'stripes': {
      const [width, depth, stripeWidth] = dims(3), fullPairs = Math.floor(width / (2 * stripeWidth)), remainder = width % (2 * stripeWidth);
      const firstColumns = fullPairs * stripeWidth + Math.min(stripeWidth, remainder);
      result = { width, depth, stripeWidth, firstColor: product(firstColumns, depth), secondColor: product(width - firstColumns, depth), originColor: 'firstColor' }; break;
    }
    case 'wall': { const [length, height, thickness] = dims(3); result = { length, height, thickness, blocks: volume(length, height, thickness) }; break; }
    case 'wall-opening': {
      const [length, height, openingWidth, openingHeight, openings] = dims(5), grossBlocks = product(length, height), removed = product(openingWidth, openingHeight, openings);
      if (openingHeight > height || product(openingWidth, openings) > length) throw new Error('Openings must fit side by side inside the wall.');
      result = { length, height, openingWidth, openingHeight, openings, grossBlocks, removed, blocks: grossBlocks - removed, assumption: 'Openings are disjoint and arranged side by side; positions and supporting lintels are not planned.' }; break;
    }
    case 'perimeter-walls': {
      const [width, depth, height, thickness] = dims(4); result = { width, depth, height, thickness, blocks: product(border(width, depth, thickness), height) }; break;
    }
    case 'closed-shell': case 'open-box': {
      const [width, depth, height, thickness] = dims(4), grossBlocks = volume(width, depth, height);
      const insideHeight = Math.max(0, height - (command === 'closed-shell' ? 2 : 1) * thickness);
      const voidBlocks = volume(interior(width, thickness), interior(depth, thickness), insideHeight);
      result = { width, depth, height, thickness, grossBlocks, voidBlocks, blocks: grossBlocks - voidBlocks }; break;
    }
    case 'room': {
      const [insideWidth, insideDepth, insideHeight, thickness] = dims(4), width = insideWidth + 2 * thickness, depth = insideDepth + 2 * thickness, height = insideHeight + 2 * thickness;
      result = { interior: { width: insideWidth, depth: insideDepth, height: insideHeight }, exterior: { width, depth, height }, thickness, blocks: volume(width, depth, height) - volume(insideWidth, insideDepth, insideHeight) }; break;
    }
    case 'cuboid-frame': {
      const [width, depth, height] = dims(3), [bx, bz, by] = [width, depth, height].map(n => Math.min(2, n)), [ix, iz, iy] = [width, depth, height].map(n => Math.max(0, n - 2));
      result = { width, depth, height, blocks: sum([product(bx, bz, by), product(ix, bz, by), product(bx, iz, by), product(bx, bz, iy)]) }; break;
    }
    case 'pillars': { const [count, height, width, depth] = dims(4); result = { count, height, width, depth, blocksPerPillar: volume(width, depth, height), blocks: product(count, width, depth, height), assumption: 'Pillars do not overlap.' }; break; }
    case 'solid-stairs': {
      const [width, steps, rise, run] = dims(4), triangular = product(steps, steps + 1) / 2;
      result = { width, steps, rise, run, height: product(steps, rise), length: product(steps, run), blocks: product(width, rise, run, triangular), assumption: 'Filled beneath every tread; full blocks, not Minecraft stair items.' }; break;
    }
    case 'gable-fill': {
      const [width, depth] = dims(2), layers = Math.ceil(width / 2), crossSection = product(layers, width - layers + 1);
      result = { width, depth, layers, blocks: product(crossSection, depth), assumption: 'Each filled layer spans the full depth; width shrinks by two per layer.' }; break;
    }
    case 'pyramid': {
      const [width, depth] = dims(2), layers = Math.ceil(Math.min(width, depth) / 2);
      // Closed form is evaluated with BigInt to keep cancellation exact for large inputs.
      const n = BigInt(layers), w = BigInt(width), d = BigInt(depth);
      const blocks = Number(n * w * d - (w + d) * n * (n - 1n) + 2n * n * (n - 1n) * (2n * n - 1n) / 3n);
      result = { width, depth, layers, blocks: safe(blocks), assumption: 'Filled rectangular layers centered above the base; both dimensions shrink by two.' }; break;
    }
    case 'tunnel-clear': { const [width, height, length] = dims(3); result = { width, height, length, cellsToClear: volume(width, height, length), endOpening: product(width, height), assumption: 'Cells only; existing air, fluids, and dropped item yields are unknown.' }; break; }
    case 'tunnel-lining': {
      const [insideWidth, insideHeight, length, thickness] = dims(4), outsideWidth = insideWidth + 2 * thickness, outsideHeight = insideHeight + 2 * thickness;
      result = { insideWidth, insideHeight, outsideWidth, outsideHeight, length, thickness, blocks: product(product(outsideWidth, outsideHeight) - product(insideWidth, insideHeight), length), assumption: 'Four walls around the cross-section, no end caps.' }; break;
    }
    case 'spaced-posts': {
      const [length, gap, height] = dims(3), offsets = positions(length, gap);
      result = { length, maximumGap: gap, height, offsets, posts: offsets.length, blocks: product(offsets.length, height), convention: 'Offsets run from 0 through length-1; gaps are center-to-center block offsets.' }; break;
    }
    case 'grid-pillars': {
      const [width, depth, xGap, zGap, height] = dims(5), xOffsets = positions(width, xGap), zOffsets = positions(depth, zGap), pillars = product(xOffsets.length, zOffsets.length);
      result = { width, depth, height, xOffsets, zOffsets, pillars, blocks: product(pillars, height), convention: 'One-block-wide pillars at every X/Z offset combination; offsets include boundaries.' }; break;
    }
    case 'layer-plan': {
      const [width, depth] = dims(2), height = integer(args[2], 1, 1000), perLayer = product(width, depth), blocks = volume(width, depth, height);
      result = { width, depth, height, blocks, layers: Array.from({ length: height }, (_, i) => ({ layer: i + 1, blocks: perLayer, cumulative: product(perLayer, i + 1) })) }; break;
    }
    case 'material-stacks': {
      const blocks = integer(args[0], 0), stackSize = integer(args[1], 1, 64);
      result = { blocks, stackSize, fullStacks: Math.floor(blocks / stackSize), remainder: blocks % stackSize, occupiedStacks: Math.ceil(blocks / stackSize), assumption: 'Supplied stack limit; components and merge restrictions are ignored.' }; break;
    }
    case 'batch-output': {
      const required = integer(args[0], 0), yieldPerBatch = integer(args[1]), inputPerBatch = integer(args[2]), batches = Math.ceil(required / yieldPerBatch), produced = product(batches, yieldPerBatch);
      result = { required, yieldPerBatch, inputPerBatch, batches, input: product(batches, inputPerBatch), produced, surplus: produced - required, assumption: 'Supplied yields only; no recipe lookup or crafting execution.' }; break;
    }
    case 'material-waste': {
      const blocks = integer(args[0], 0), percent = number(args[1], 0, 1000);
      // Apply the validated decimal percentage exactly before rounding up.
      const [mantissa, exponent = '0'] = String(percent).split('e'), [whole, fraction = ''] = mantissa.split('.');
      const denominator = 10n ** BigInt(fraction.length - Number(exponent) + 2);
      const numerator = BigInt(blocks) * BigInt(whole + fraction);
      const allowance = safe(Number((numerator + denominator - 1n) / denominator));
      result = { blocks, percent, allowance, total: safe(blocks + allowance) }; break;
    }
    case 'material-split': {
      const blocks = integer(args[0], 0), builders = integer(args[1], 1, 1000);
      result = { blocks, builders, allocations: Array.from({ length: builders }, (_, i) => ({ builder: i + 1, blocks: Math.floor(blocks / builders) + (i < blocks % builders ? 1 : 0) })) }; break;
    }
    case 'build-time': {
      const blocks = integer(args[0], 0), blocksPerMinute = number(args[1], 0.001, MAX);
      result = { blocks, blocksPerMinute, minutes: blocks / blocksPerMinute, assumption: 'Constant supplied rate; travel, gathering, failures, and pauses are excluded.' }; break;
    }
    default: throw new Error(`Unknown blueprint calculator: ${command}.`);
  }
  return { ...result, note: NOTE };
}

export function registerBlueprintTools(program, { print }) {
  const group = program.command('blueprint').description('Offline construction material estimates; never builds or connects to Minecraft.');
  for (const [signature, description] of BLUEPRINT_COMMANDS) {
    const name = signature.split(' ')[0];
    group.command(signature).description(description).action((...values) => print(blueprintCalculation(name, values.slice(0, -2))));
  }
  return group;
}
