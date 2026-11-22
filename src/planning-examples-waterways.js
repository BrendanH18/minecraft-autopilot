// Independently calculated planner inputs and expected results.
const road = '[[0,0],[5,0],[5,4],[5,6],[3,6],[5,6]]';

export const waterwayCases = {
  'sponge-plan': [
    ['section-grid', [12, 8, 5, 3], { columns: 3, rows: 3, sections: 9 }],
    ['section-at', [12, 8, 5, 3, 3, 3], { x: 10, z: 6, length: 2, width: 2 }],
    ['divider-cells', [12, 8, 2, 5, 3], { alongWidth: 32, alongLength: 48, shared: 8, total: 72 }],
    ['cofferdam-wall', [8, 4, 3, 1, 2], { submerged: 192, aboveWater: 64 }],
    ['divider-gates', [13, 5, '2,3', 4, 2], { span: 7, removed: 20, remaining: 45 }],
    ['barrier-kit', ['4,6,1', '0,3,5', 4], { peak: 7, extra: 3, stillInstalled: 3 }],
    ['barrier-labor', [24, 6, 8, 2, 2], { install: 4, removal: 3, setupTime: 4, total: 11 }],
    ['layer-profile', ['12,8,0,5'], { total: 25, wettedLayers: 3, deepest: 4 }],
    ['temporary-fill', ['20,16,5', '3,0,5', 0.5], { fill: [17, 16, 0], recovered: [8, 8, 0], consumed: 17 }],
    ['sponge-loads', ['8,9,0,7', 4], { placements: [2, 3, 0, 2], total: 7 }],
    [
      'drying-backlog',
      ['5,0,1', 2],
      [
        { dried: 2, pending: 3 },
        { dried: 2, pending: 1 },
        { dried: 2, pending: 0 },
      ],
    ],
    ['reuse-shifts', [8, 3, 2, 3], { elapsed: 3, placed: 7, remaining: 1, clean: 2, wet: 1 }],
    ['staging-stock', [4, 3, 7, 2], 14],
    ['pump-crew', [24, 2, 4, 1, 5], 3],
    ['pump-outage', [24, 6, 2, 1, 2], 9],
    ['pump-handoff', [20, 1, 4, 2, 8], 4],
    ['pump-schedule', ['8,0,10', '2,12,4', 6, 1], [3.5, 3.5, 11.5]],
    [
      'wet-checkpoints',
      [5, '5,6,2', '1,5,1', '2,0,5'],
      [
        { water: 4, spill: 0 },
        { water: 6, spill: 3 },
        { water: 2, spill: 0 },
      ],
    ],
    ['breach-level', [4, 6, 2, 0], { waterDepth: 4, moved: 8, direction: 'left-to-right' }],
    ['stage-depth', [14, 5, 3], { top: 10, bottom: 14 }],
    ['draining-method', [24, 5, 3, 3, 1, 8], { batches: 2, spongeTime: 6, pumpTime: 4, preferred: 'pump' }],
    ['leak-test', [8, 2, 1.5, 7, 2], { netVolume: 3, netRate: 1.5 }],
    ['seal-survey', ['8,4,2', '0.5,0.75,1', 6], { residual: 5, headroom: 1, drains: true }],
    ['dry-first', ['20,12,8,4', '0,0,4,8', 8, 0, 4], { completed: [2, 3], used: 3.5 }],
    ['refuge-work', [12, 6, 4, 2, 10, 2.5], { travelTime: 7, feasible: true, workTime: 3, completeCells: 7 }],
  ],
  'ice-road': [
    ['turn-mix', [road], { left: 0, right: 2, reverse: 1, straight: 1 }],
    ['turn-spacing', [road, 3], [{ from: 4, to: 5, distance: 2 }]],
    ['curve-clearance', [road, 1, 2], { straightRuns: [4, 4, -1, 0], fits: false }],
    ['corner-stock', [road, 4, 9, 2, 5], { ice: 17, guards: 9 }],
    ['striped-deck', [12, 3, 2, 1, 2], { deckWidth: 12, iceCells: 72, otherCells: 72 }],
    ['switchyard-deck', [10, 3, 2, 2, '2,3'], { laneCells: 50, transferCells: 10, dividerCells: 10 }],
    ['raised-road', ['2,5,0', 2, 3, 4], { postCells: 14, capCells: 9, footingCells: 12 }],
    [
      'gap-crossings',
      [20, '[[2,5],[8,10],[17,19]]', 2, 3],
      {
        spans: [
          [0, 12],
          [15, 20],
        ],
        deckCells: 51,
      },
    ],
    ['roadside-chests', ['8,21,14', 4, 3], { additional: [0, 2, 1], chests: 7, kit: 21 }],
    ['material-budget', [12, 5, 0.25, 2], 12],
    [
      'station-coverage',
      [20, '0,2,10,15', 3],
      {
        covered: [
          [0, 5],
          [7, 18],
        ],
        uncoveredLength: 4,
      },
    ],
    ['station-platform', [20, 3, 2, 2], { perSide: 5, stalls: 10, sparePerSide: 1 }],
    ['passing-bays', [30, 11, 4, 2], { count: 2, spacing: 10, wideningCells: 16 }],
    ['patch-window', ['4,2,8', 2, 4, 1, 5], { patches: 2, cells: 12, used: 5 }],
    ['transfer-window', [12, 3, 1, '8,4,5,5', 18, 3], { departureIndex: 3, ready: 5, departure: 5, arrival: 11 }],
    ['route-clock', [road, 3, 2, 3], { distance: 15, turnTime: 7, total: 12 }],
    [
      'dwell-budget',
      ['10,6', '5,2', '1,2', 7],
      {
        times: [
          { arrival: 2, departure: 3 },
          { arrival: 6, departure: 8 },
        ],
        slack: -1,
        fits: false,
      },
    ],
    ['directional-trip', ['8,6', '4,3', '2,6', 1, 2], { outbound: 4, inbound: 5, cycle: 12 }],
    ['launch-headway', [12, '2,4,3', 2], [0, 3.5, 4]],
    ['terminal-capacity', [10, 2, 4, 4, 3], { fleetRate: 0.4, loadingRate: 0.5, laneRate: 1 / 3, capacity: 1 / 3 }],
    [
      'upgrade-priority',
      ['12,24,30', '3,2,10', 6, '2,5,1'],
      [
        { segment: 2, timeSaved: 8, savingsPerBuildTime: 1.6 },
        { segment: 1, timeSaved: 2, savingsPerBuildTime: 1 },
      ],
    ],
    ['spur-budget', ['12,0,8', 2, 4, 10], { deckCells: 40, transferCells: 12, portalCells: 30 }],
    [
      'neighboring-spurs',
      [20, '16,2,7,12,12', 10],
      { behind: { spur: 3, distance: 3 }, ahead: { spur: 4, distance: 2 } },
    ],
    ['alternate-window', [12, 4, 3, 1, 21], { outbound: 3, inbound: 2 }],
    ['breakdown-detour', [10, 12, 5, 4, 1], { original: 2, detour: 5, delay: 3 }],
  ],
};
