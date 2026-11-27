import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { wholeFloor, wholeCeil, budgetFits } from '../src/resource-rounding.js';
import { allocationCalculation } from '../src/allocation-tools.js';
import { fuelplanCalculation } from '../src/fuelplan-tools.js';
import { rationCalculation } from '../src/ration-tools.js';
import { CLI_PATH } from './cli-path.js';

test('decimal whole-count boundaries agree in the shipped CLI', () => {
  const cases = [
    ['allocation', 'priority-capacity', ['3', '0.1', '0.3'], (r) => r.granted, [3]],
    ['allocation', 'whole-jobs', ['0.1,0.2', '0.3'], (r) => r.accepted, [1, 2]],
    ['allocation', 'cheapest-jobs', ['0.1,0.2', '0.3'], (r) => r.accepted, [1, 2]],
    ['fuelplan', 'fuel-count', ['3', '0.1', '0.3'], (r) => r.fuel, 1],
    ['ration', 'meal-clock', ['0.3', '0.1', '1'], (r) => r.meals, 3],
    ['production', 'deadline', ['3', '0.1', '0.3'], (r) => r.machines, 1],
    ['farmplan', 'season', ['0.3', '0.1', '1', '1'], (r) => r.cycles, 3],
  ];
  for (const [group, command, args, pick, expected] of cases) {
    const run = spawnSync(process.execPath, [CLI_PATH, group, command, ...args], {
      encoding: 'utf8',
      timeout: 15000,
    });
    assert.equal(run.status, 0, run.stderr);
    assert.deepEqual(pick(JSON.parse(run.stdout)), expected, `${group} ${command}`);
  }
});
test('roundoff tolerance preserves genuine shortages and positive tiny demands', () => {
  assert.equal(wholeFloor(0.3 / 0.1), 3);
  assert.equal(wholeCeil((3 * 0.1) / 0.3), 1);
  assert.equal(wholeFloor(2.999999), 2);
  assert.equal(wholeCeil(1.000001), 2);
  assert.equal(wholeCeil(1e-20), 1);
  assert.equal(budgetFits(1e-20, 0), false);
  assert.equal(budgetFits(0.3, 0.299999), false);
  assert.deepEqual(allocationCalculation('priority-capacity', ['3', '0.1', '0.299999']).granted, [2]);
  assert.deepEqual(allocationCalculation('whole-jobs', ['0.1,0.2', '0.299999']).accepted, [1]);
  assert.equal(allocationCalculation('priority-capacity', ['3', '0.1', '0.3']).unusedCapacity, 0);
  assert.equal(fuelplanCalculation('fuel-count', [3, 0.1, 0.3]).wastedSeconds, 0);
  assert.equal(fuelplanCalculation('fuel-count', [3, 0.100001, 0.3]).fuel, 2);
  assert.equal(rationCalculation('meal-clock', [0.299999, 0.1, 1]).meals, 2);
  assert.deepEqual(allocationCalculation('minimum-first', ['0.1,0.2', '1,1', 0.3]).granted, [0.1, 0.2]);
  assert.equal(allocationCalculation('funding-order', ['0.1,0.2', 0.3]).firstUnfunded, null);
});
