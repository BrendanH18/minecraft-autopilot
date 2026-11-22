import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateOffline } from '../src/offline-kit.js';
import { gardenGroups } from '../src/planning-gardens.js';
import { testStudyWorkflows } from './planning-study-workflow-checks.js';
import { orchardCases, greenhouseCases as publishedGreenhouseCases } from '../src/planning-examples-gardens.js';

const greenhouseCases = [...publishedGreenhouseCases, ['aisle-cart', ['2,7,4', 3, 1], [3, 0, 1]]];

for (const [i, cases] of [orchardCases, greenhouseCases].entries()) {
  const group = gardenGroups[i];
  test(`every ${group.name} command has an expected result`, () => {
    assert.deepEqual(
      group.commands.map((spec) => spec.signature.split(' ')[0]),
      cases.map(([name]) => name),
    );
  });
  for (const [name, args, expected] of cases) {
    test(`${group.name} ${name}`, () => assert.deepEqual(calculateOffline(group, name, args).result, expected));
    testStudyWorkflows(group.name, name, args, expected);
  }
}

test('a canopy contained inside its neighbor overlaps only its own width', () => {
  assert.deepEqual(calculateOffline(gardenGroups[0], 'canopy-gaps', ['10,12', '8,1']).result, [-3]);
});

test('garden plans reject inconsistent fixtures and bound generated lists', () => {
  const [orchard, greenhouse] = gardenGroups;
  assert.throws(() => calculateOffline(orchard, 'canopy-gaps', ['3,2', '1,0']), /increase/);
  assert.throws(() => calculateOffline(orchard, 'rotation-rows', [1001, 1, 1]), /1000/);
  assert.throws(() => calculateOffline(greenhouse, 'wall-glazing', [3, 4, 2, 21]), /exceed/);
  assert.throws(() => calculateOffline(greenhouse, 'planter-fill', ['2', '2,2', '1']), /equal lengths/);
});
