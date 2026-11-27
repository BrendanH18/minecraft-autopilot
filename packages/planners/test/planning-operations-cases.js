// One independent worked example per command: [group, command, args, expected].
// Rows follow the command order in packages/planners/src/planning-operations.js. Expected values
// are derived by hand from the documented behavior, never copied from output.
export const OPERATION_CASES = [
  // stripmine: pitch 7 (width 2 plus gap 5) and lead 3 recur so the rows cross-check.
  ['stripmine', 'branch-count', ['41', '3', '2', '5', '2'], 12],
  ['stripmine', 'branch-starts', ['4', '3', '2', '5'], [4, 11, 18, 25]],
  [
    'stripmine',
    'comb-footprint',
    ['6', '3', '2', '5', '20', '3', '2'],
    { alongCells: 40, acrossCells: 43, areaCells: 1720 },
  ],
  [
    'stripmine',
    'comb-cells',
    ['41', '2', '3', '11', '4', '20'],
    { corridorCells: 246, branchCells: 2640, totalCells: 2886 },
  ],
  [
    'stripmine',
    'comb-faces',
    ['41', '2', '3', '11', '4', '20'],
    { floorFaces: 962, ceilingFaces: 962, wallFaces: 1572, totalFaces: 3496 },
  ],
  [
    'stripmine',
    'comb-reveal',
    ['5', '2', '3', '30', '5', '4', '1'],
    { sideCells: 2520, verticalCells: 600, totalCells: 3120 },
  ],
  ['stripmine', 'pitch-efficiency', ['2', '3', '5', '4', '1'], 3.16666666666667],
  [
    'stripmine',
    'layer-coverage',
    ['2', '7', '2'],
    { dugFraction: 0.222222222222222, revealedFraction: 0.444444444444444, unseenFraction: 0.333333333333333 },
  ],
  ['stripmine', 'vein-hit-chance', ['2', '7', '2', '2'], 0.777777777777778],
  ['stripmine', 'widest-gap', ['2', '2', '2', '0.75'], 7],
  ['stripmine', 'stacked-coverage', ['2', '5', '3', '1', '1', '2', '4'], 0.714285714285714],
  [
    'stripmine',
    'layer-plan',
    ['3', '2', '4', '1', '6'],
    [
      { layer: 1, floorOffset: 0, alongShift: 0 },
      { layer: 2, floorOffset: 6, alongShift: 3 },
      { layer: 3, floorOffset: 12, alongShift: 0 },
    ],
  ],
  ['stripmine', 'expected-finds', ['1200', '3120', '0.0125'], 54],
  ['stripmine', 'cells-for-finds', ['10', '0.004', '3.5'], 556],
  ['stripmine', 'find-rate', ['1.6', '3.5', '0.004', '3600'], 40.5],
  ['stripmine', 'return-distance', ['4', '3', '2', '5', '20'], 44],
  ['stripmine', 'haul-walk', ['4', '3', '2', '5', '20', '3'], { totalWalk: 804, meanReturn: 33.5 }],
  ['stripmine', 'branches-within-walk', ['40.5', '3', '2', '5', '20'], 3],
  ['stripmine', 'branch-time', ['2', '3', '30', '1.5', '0.25'], 277.5],
  ['stripmine', 'branches-in-time', ['1000', '97.5', '12', '4'], 8],
  ['stripmine', 'poke-holes', ['30', '4', '3', '2', '2'], { holes: 14, dugCells: 42, revealedCells: 364 }],
  ['stripmine', 'stair-shaft', ['25', '3', '2', '4'], { steps: 9, cells: 122 }],
  ['stripmine', 'parallel-combs', ['184', '3', '20', '2', '4'], { spacing: 47, combs: 4, usedWidth: 184 }],
  ['stripmine', 'corridor-overhead', ['3', '2', '5', '20', '2'], 0.207920792079208],
  ['stripmine', 'branch-length-for-overhead', ['3', '2', '5', '2', '0.15'], 30],
  // herd: five adults, three offspring per pair, and a two-cycle maturation delay recur
  // (herd 11, 17, 23, 38, 62, 95 at cycle ends) so the projection rows cross-check.
  ['herd', 'breeding-round', ['37', '3', '2.5'], { pairs: 18, unpaired: 1, offspring: 54, feed: 45 }],
  ['herd', 'fed-round', ['37', '31', '2.5', '3'], { pairs: 12, offspring: 36, feedUsed: 30, idleAdults: 13 }],
  ['herd', 'growth-curve', ['5', '3', '2', '6'], [11, 17, 23, 38, 62, 95]],
  ['herd', 'age-split', ['7', '2', '1', '4'], { adults: 31, juveniles: 18, herd: 49 }],
  // Culls of 0, 0, 3, 6, 6, 12, 12 above eight kept adults total 27 after cycle six and 39 after seven.
  ['herd', 'cycles-to-harvest', ['5', '3', '2', '8', '30'], { cycles: 7, culled: 39, herd: 32 }],
  ['herd', 'feed-to-target', ['6', '2', '1', '40', '0.75'], { cycles: 4, pairings: 21, feed: 15.75, herd: 48 }],
  ['herd', 'feed-budget-cycles', ['6', '2', '1', '10', '0.75'], { cycles: 3, pairings: 12, feedUsed: 9, herd: 30 }],
  ['herd', 'delay-cycles', ['22', '5'], 4],
  ['herd', 'growth-factor', ['3', '1'], 1.8228756555323],
  ['herd', 'founders-for-target', ['62', '3', '2', '5'], 5],
  ['herd', 'fill-pen', ['5', '3', '2', '52'], { cycles: 5, herd: 50, spare: 2 }],
  ['herd', 'cull-schedule', ['5', '3', '2', '8', '6'], [0, 0, 3, 6, 6, 12]],
  ['herd', 'steady-herd', ['9', '3', '2'], { birthsPerCycle: 12, juveniles: 24, peakHerd: 45 }],
  [
    'herd',
    'sustainable-yield',
    ['9', '3', '2.5', '8', '60'],
    { pairs: 4, animalsPerPeriod: 90, feedPerPeriod: 75, feedPerAnimal: 0.833333333333333 },
  ],
  ['herd', 'breeders-for-demand', ['100', '3', '8', '60'], 10],
  ['herd', 'harvest-interval', ['50', '9', '3', '8'], { cycles: 5, interval: 40, surplus: 10 }],
  ['herd', 'drop-plan', ['100', '1.5', '4', '2.5'], { animals: 67, pairings: 17, feed: 42.5, drops: 100.5 }],
  ['herd', 'product-rate', ['12', '2.5', '7', '3', '60'], 200],
  ['herd', 'mixed-feed', ['7,12,5', '2.5,1,3'], { pairs: [3, 6, 2], feed: [7.5, 6, 6], totalFeed: 19.5 }],
  ['herd', 'square-pen', ['23', '2.5'], { side: 8, penArea: 64, capacity: 25 }],
  ['herd', 'min-perimeter-pen', ['23', '2.5'], { width: 6, length: 10, penArea: 60, perimeter: 32 }],
  ['herd', 'pen-length', ['23', '2.5', '7'], 9],
  ['herd', 'pen-capacity', ['9', '14', '0.2', '2.5'], 40],
  ['herd', 'pen-split', ['53', '12'], [11, 11, 11, 10, 10]],
  [
    'herd',
    'cull-to-fit',
    ['20', '15', '6', '8'],
    { adultsCulled: 12, juvenilesCulled: 15, breedersCulled: 2, herdAfter: 6 },
  ],
  // signalplan: a 47-cell line at range 15 needs 3 boosters; with booster delay 2 and cell
  // delay 0.5 it takes 29.5 ticks, and a 29-tick budget fits 46 cells exactly (23 + 6).
  ['signalplan', 'booster-count', ['47', '15'], 3],
  ['signalplan', 'line-timing', ['47', '15', '2', '0.5'], { totalCells: 50, delay: 29.5 }],
  ['signalplan', 'longest-line', ['29', '15', '2', '0.5'], 46],
  ['signalplan', 'strength-after', ['15', '1.5', '7'], 4.5],
  ['signalplan', 'reach-cells', ['15', '1.5', '2'], 8],
  ['signalplan', 'path-padding', ['7,12.5,3,9', '1.5'], [7, 1.5, 11, 5]],
  ['signalplan', 'clock-align', ['7,13,3,10', '5'], [3, 2, 2, 0]],
  ['signalplan', 'clock-shape', ['3', '5', '20'], { period: 8, dutyCycle: 0.375, frequency: 2.5 }],
  // High at ticks 2, 3, 4 modulo 7; inside 4..25 that is 4, 9-11, 16-18, 23-25.
  ['signalplan', 'high-tick-count', ['7', '3', '2', '4', '25'], 10],
  ['signalplan', 'common-period', ['4,6,9,10'], 180],
  // Fires 1, 7, 13, 19, 25 and 5, 15, 25.
  ['signalplan', 'first-coincidence', ['6', '1', '10', '5'], { tick: 25, repeatEvery: 30 }],
  // (100 + 1) / 3 -> 33, (33 + 0) / 4 -> 8, (8 + 3) / 5 -> 2.
  ['signalplan', 'divider-outputs', ['100', '3,4,5', '1,0,3'], [33, 8, 2]],
  ['signalplan', 'period-for-rate', ['3.5', '2', '20'], 11],
  // 995 / 7 = 142.14 rounds up (not to nearest) to 143 pulses; 2^7 = 128 < 143 <= 256 = 2^8.
  ['signalplan', 'counter-delay', ['995', '7', '2'], { pulses: 143, digits: 8, actualDelay: 1001 }],
  ['signalplan', 'counter-wrap', ['3', '4', '150'], { value: 22, wraps: 2 }],
  ['signalplan', 'digits-for-states', ['100', '3'], 5],
  // 47 = 1 * 27 + 2 * 9 + 0 * 3 + 2.
  ['signalplan', 'digit-encode', ['47', '3', '5'], [0, 1, 2, 0, 2]],
  // 101101 xor 010110 = 111011.
  ['signalplan', 'gray-code', ['45'], 59],
  ['signalplan', 'parity-bit', ['1,0,1,1,0,1,1'], { ones: 5, parityBit: 1 }],
  ['signalplan', 'hamming-distance', ['1,0,1,1,0,1', '1,1,0,1,0,0'], 3],
  ['signalplan', 'edges', ['1,1,0,0,1,0,1,1,0'], { rising: [0, 4, 6], falling: [2, 5, 8] }],
  ['signalplan', 'debounce', ['2,3,7,8,12,20,21', '5'], [2, 7, 12, 20]],
  // Cycle of 10 ticks; 27 modulo 10 = 7 lies in step two (ticks 3 to 7).
  ['signalplan', 'sequencer-step', ['3,5,2', '27'], { step: 2, tickInStep: 4, ticksToNext: 1 }],
  ['signalplan', 'level-for-fill', ['37', '64', '15'], 9],
  ['signalplan', 'fill-for-level', ['6', '27', '15'], 10],
  [
    'linkplan',
    'to-compact',
    ['[[37,-22],[5,13]]', '4'],
    [
      [9.25, -5.5],
      [1.25, 3.25],
    ],
  ],
  // 37/4 = 9.25, -22/4 = -5.5, 5/4 = 1.25, 13/4 = 3.25, -3/4 = -0.75, 8/4 = 2.
  [
    'linkplan',
    'compact-cells',
    ['[[37,-22],[5,13],[-3,8]]', '4'],
    [
      [9, -6],
      [1, 3],
      [-1, 2],
    ],
  ],
  // Cells [14,-9] and [-2,3]; corners map back to columns 35, -23 and -5, 7.
  [
    'linkplan',
    'cell-offsets',
    ['[[37,-22],[-3,9.5]]', '2.5'],
    [
      [2, 1],
      [2, 2.5],
    ],
  ],
  // [37,-21]: x edges 35 and 37.5, z edges -22.5 and -20; [8.2,4]: x edges 7.5 and 10, z edges 2.5 and 5.
  ['linkplan', 'cell-margins', ['[[37,-21],[8.2,4]]', '2.5'], [0.5, 0.7]],
  // 3.3*2.6 = 8.58, -1.6*2.6 = -4.16, 2.5*2.6 = 6.5, 7*2.6 = 18.2; 18/2.6 = 6.92 falls in cell 6, not 7.
  [
    'linkplan',
    'landing-columns',
    ['[[3.3,-1.6],[2.5,7]]', '2.6'],
    [
      { landing: [8, -5], stable: true },
      { landing: [6, 18], stable: false },
    ],
  ],
  // Cell [14,-9]; x cells 13..15 give ceil(32.5) = 33 to ceil(40) - 1 = 39; z cells -10..-8 give -25 to ceil(-17.5) - 1 = -18.
  [
    'linkplan',
    'cell-footprint',
    ['[[37,-22]]', '2.5', '1'],
    { cell: [14, -9], minX: 33, maxX: 39, minZ: -25, maxZ: -18, columns: 56 },
  ],
  ['linkplan', 'cell-span', ['[[37,-22],[5,13],[-3,8]]', '4'], { minCell: [-1, -6], maxCell: [9, 3], cells: 110 }],
  // Cells: [1,3], [9,-6], [1,3], [9,-6], [-1,2], [1,3].
  [
    'linkplan',
    'shared-cells',
    ['[[5,13],[37,-22],[6.5,15.9],[38,-21],[-3,8],[7.9,12]]', '4'],
    [
      [1, 3, 6],
      [2, 4],
    ],
  ],
  [
    'linkplan',
    'pair-alignment',
    ['[[37,-22],[5,13],[-3,8]]', '[[9.7,-5.2],[2.1,3.9],[-0.5,2]]', '4'],
    {
      offsets: [
        [0, 0],
        [1, 0],
        [0, 0],
      ],
      aligned: 2,
    },
  ],
  ['linkplan', 'tunnel-cells', ['[[37,-22],[-3,8]]', '4'], { cellsX: 10, cellsZ: 8, tunnelCells: 19 }],
  // Walk 50/5, compact 1000/8/10, walk 35/5, transfer 3; direct 1085/5.
  [
    'linkplan',
    'linked-trip',
    ['[[0,0],[30,40],[630,840],[651,868]]', '8', '5', '10', '3'],
    { walkInTime: 10, compactTime: 12.5, walkOutTime: 7, linkedTime: 32.5, directTime: 217, savedTime: 184.5 },
  ],
  // Sites 1 then 4: 5 + 975/7.5 + 20 + 6.
  [
    'linkplan',
    'best-link-pair',
    ['[[0,0],[600,800]]', '[[3,4],[-6,8],[600,780],[588,784]]', '7.5', '6'],
    { entrance: 1, exit: 4, linkedDistance: 161, directDistance: 1000, linkPays: true },
  ],
  // 13 * 7.5 / 6.5.
  ['linkplan', 'break-even', ['7.5', '13'], 15],
  // Legs 50 (link 18.25), 1000 (link 137), 10 (walk; link would be 13.25).
  [
    'linkplan',
    'mixed-route',
    ['[[0,0],[30,40],[630,840],[636,848]]', '8', '12'],
    { linkedLegs: [1, 2], total: 165.25 },
  ],
  [
    'linkplan',
    'relay-legs',
    ['[[0,0],[600,-800]]', '8', '30'],
    { compactDistance: 125, legs: 5, relays: 4, legLength: 25 },
  ],
  // (3 + 1) * 2.6 = 10.4.
  ['linkplan', 'safe-separation', ['2.6', '3'], 11],
  // Cells: [9,-6], [1,3], [10,-7], [-1,2], [2,4].
  [
    'linkplan',
    'collisions',
    ['[[37,-22],[5,13],[40,-27],[-3,8],[9,17]]', '4', '1'],
    [
      [1, 3],
      [2, 5],
    ],
  ],
  // Wide link 3 has no compact link within one cell; compact links 2 and 3 land at [7,12] and [4,15], both within two columns of [5,13].
  [
    'linkplan',
    'link-matching',
    ['[[37,-22],[5,13],[-30,8]]', '[[9.4,-5.1],[1.9,3.2],[1.1,3.9]]', '4', '1', '2'],
    { forward: [1, 2, null], backward: [1, 2, 2], mutualPairs: 2 },
  ],
  // Images [4,3], [-5,7], [6,-13] around hub [1,-1].
  [
    'linkplan',
    'spokes',
    ['[[10,7.5],[-12.5,17.5],[15,-32.5]]', '[[1,-1]]', '2.5'],
    { lengths: [5, 10, 13], total: 28, longest: 13, farthest: 3 },
  ],
  [
    'linkplan',
    'hub-assign',
    ['[[10,7.5],[-12.5,17.5],[15,-32.5],[2,2]]', '[[1,-1],[-4,6],[5,-12]]', '2.5'],
    { hubs: [1, 2, 3, 1], loads: [2, 1, 1] },
  ],
  // Trunk from x -5 to 6; branches 4 + 8 + 12.
  [
    'linkplan',
    'trunk-network',
    ['[[10,7.5],[-12.5,17.5],[15,-32.5]]', '[[1,-1]]', '2.5'],
    { trunk: 11, branches: 24, total: 35 },
  ],
  // Wide edges 26, 50 (tie with 1-4 goes to point 2), 30, 50; total 156 / 5.
  [
    'linkplan',
    'spanning-network',
    ['[[0,0],[30,40],[-24,10],[30,-40],[60,40]]', '5'],
    {
      edges: [
        [1, 3],
        [1, 2],
        [2, 5],
        [1, 4],
      ],
      total: 31.2,
    },
  ],
  // Costs 13, 23, 29, 5; 5 + 13 = 18 fits, adding 23 exceeds 40.
  [
    'linkplan',
    'errand-plan',
    ['[[10,7.5],[-12.5,17.5],[15,-32.5],[4,-0.5]]', '[[1,-1]]', '2.5', '3', '40'],
    { visits: [4, 1], used: 18 },
  ],
  // Side 84: ceil(1000/84) = 12, ceil(450/84) = 6.
  ['linkplan', 'coverage-sites', ['1000', '450', '7', '12'], { alongX: 12, alongZ: 6, sites: 72 }],
  // Point 1 sits exactly 5 from site 1; point 3 is 13 from site 1.
  [
    'linkplan',
    'coverage-check',
    ['[[10,7.5],[-12.5,17.5],[15,-32.5],[4,-0.5]]', '[[1,-1],[-4,6]]', '2.5', '5'],
    { covered: [1, 2, 4], uncovered: [3] },
  ],
];
