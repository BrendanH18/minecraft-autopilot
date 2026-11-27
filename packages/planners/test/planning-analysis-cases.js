import { ANALYSIS_EXAMPLES } from '../src/planning-examples-analysis.js';

// Explicit independently calculated examples: [group, command, arguments, expected].
export const ANALYSIS_CASES = [
  ...ANALYSIS_EXAMPLES,
  ['forecast', 'compound', ['2', '1.5', '0,1,2'], [2, 3, 4.5]],
  ['forecast', 'bounded-growth', ['2', '3', '10', '0,2,4'], [2, 8, 10]],
  ['forecast', 'depletion', ['10', '3', '0,2,4'], [10, 4, 0]],
  ['forecast', 'time-to-target', ['2', '10', '4'], 2],
  ['forecast', 'time-to-empty', ['12', '3'], 4],
  ['forecast', 'reorder-time', ['20', '5', '3'], 5],
  ['forecast', 'exponential-decay', ['8', '2', '0,2,4'], [8, 4, 2]],
  ['forecast', 'doubling', ['2', '3', '0,3,6'], [2, 4, 8]],
  ['forecast', 'logistic', ['5', '10', '0', '0,2'], [5, 5]],
  ['forecast', 'damped-trend', ['10', '4', '.5', '3'], [12, 13, 13.5]],
  ['forecast', 'level-trend', ['10', '2', '3'], [12, 14, 16]],
  [
    'forecast',
    'scenario-range',
    ['10', '-1', '2', '0,2'],
    [
      { lower: 10, upper: 10 },
      { lower: 8, upper: 14 },
    ],
  ],
  [
    'forecast',
    'error-band',
    ['10,20', '2', '3'],
    [
      { lower: 4, upper: 16 },
      { lower: 14, upper: 26 },
    ],
  ],
  [
    'forecast',
    'horizon-band',
    ['10,20', '2', '1'],
    [
      { lower: 8, upper: 12 },
      { lower: 17.17157287525381, upper: 22.82842712474619 },
    ],
  ],
  ['forecast', 'ensemble', ['10,20', '20,40', '.25'], [17.5, 35]],
  ['forecast', 'inventory-path', ['5', '0,4,0', '2,3,1'], [3, 4, 3]],
  [
    'forecast',
    'forecast-errors',
    ['10,20', '8,23'],
    { errors: [2, -3], meanAbsoluteError: 2.5, rootMeanSquareError: 2.5495097567963922, bias: -0.5 },
  ],
];
