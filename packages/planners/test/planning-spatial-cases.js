import { SPATIAL_EXAMPLES } from '../src/planning-examples-spatial.js';

export const SPATIAL_CASES = [
  ...SPATIAL_EXAMPLES,
  ['district', 'green-area', ['1000', '400', '200'], 400],
  ['district', 'frontage', ['4', '3', '10'], 120],
  ['district', 'frontage-lots', ['100', '12', '5'], 7],
  ['district', 'corner-parcels', ['1', '5'], 2],
  ['district', 'edge-parcels', ['4', '3'], 10],
  ['district', 'interior-parcels', ['5', '4'], 6],
  ['district', 'checker-parcels', ['3', '3'], { even: 5, odd: 4 }],
  ['district', 'phase-rows', ['4', '5', '2'], [8, 8, 4]],
  ['district', 'utility-trunk', ['3', '2', '10', '8', '2'], 64],
  ['district', 'service-radius', ['6', '8'], 5],
];
