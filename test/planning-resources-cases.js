import { RESOURCE_EXAMPLES } from '../src/planning-examples-resources.js';

// Independent worked examples for every resource planning command.
export const RESOURCE_CASES = [
  ...RESOURCE_EXAMPLES,
  ['project-cost', 'fixed-variable', ['10', '5', '2'], { total: 20, perUnit: 4 }],
  ['project-cost', 'overhead', ['100', '0.2', '5'], { overhead: 25, total: 125 }],
  ['project-cost', 'contingency', ['100', '0.15'], { reserve: 15, budget: 115 }],
  ['project-cost', 'stacked-discounts', ['100', '0.2,0.1'], 72],
  ['project-cost', 'shipping-threshold', ['40', '50', '8'], { shipping: 8, total: 48 }],
  ['project-cost', 'price-break', ['12', '10', '4', '3'], 36],
  ['project-cost', 'marginal-tiers', ['12', '10,10', '4,3'], 46],
  ['project-cost', 'labor-budget', ['2,3', '10,20'], 80],
  ['project-cost', 'rent-or-buy', ['100', '15', '5', '30'], { rent: 75, buy: 70, choice: 'buy' }],
  ['project-cost', 'break-even-units', ['100', '8', '3'], 20],
  ['project-cost', 'unit-margin', ['10', '6'], { margin: 4, fraction: 0.4 }],
  ['project-cost', 'budget-variance', ['100', '120'], { variance: 20, fraction: 0.2 }],
  ['project-cost', 'remaining-budget', ['100', '30', '40'], 30],
  ['project-cost', 'cost-to-complete', ['100', '30', '2'], 140],
  ['project-cost', 'estimate-at-completion', ['60', '20', '3', '10'], 130],
  ['project-cost', 'phase-cashflow', ['20,40,50', '100'], [80, 40, -10]],
  ['project-cost', 'first-overbudget', ['20,40,50', '100'], 3],
  ['project-cost', 'weighted-unit-cost', ['4,6', '2,3'], 2.6],
  ['project-cost', 'price-sensitivity', ['4,6', '1,-0.5'], 1],
  ['project-cost', 'waste-adjustment', ['10', '0.8', '3'], { purchased: 13, cost: 39 }],
  ['project-cost', 'reuse-credit', ['100', '2,3', '5,4'], { credit: 22, net: 78 }],
  ['project-cost', 'scenario-budget', ['4,6', '2,3', '3,5', '10'], { minimum: 36, maximum: 52 }],
  [
    'project-cost',
    'cost-priority',
    ['4,2', '6,4'],
    [
      { option: 2, ratio: 2 },
      { option: 1, ratio: 1.5 },
    ],
  ],
];
