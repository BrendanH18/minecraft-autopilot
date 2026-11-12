import test from 'node:test';
import assert from 'node:assert/strict';
import { Command } from 'commander';
import { ANALYSIS_GROUPS } from '../src/planning-analysis.js';
import { ANALYSIS_CASES } from './planning-analysis-cases.js';
import { calculateOffline, registerOfflineGroups } from '../src/offline-kit.js';

function close(actual, expected) {
  if (typeof expected === 'number') {
    assert.equal(typeof actual, 'number');
    assert.ok(Number.isFinite(actual));
    assert.ok(Math.abs(actual - expected) <= 1e-9 * Math.max(1, Math.abs(expected)), `${actual} != ${expected}`);
  } else if (expected !== null && typeof expected === 'object') {
    assert.deepEqual(Object.keys(actual), Object.keys(expected));
    for (const key of Object.keys(expected)) close(actual[key], expected[key]);
  } else assert.equal(actual, expected);
}

test('analysis inventory has exactly 250 distinct documented callable calculations', () => {
  assert.equal(ANALYSIS_GROUPS.length, 10);
  assert.equal(new Set(ANALYSIS_GROUPS.map(g => g.name)).size, 10);
  const keys = [];
  for (const group of ANALYSIS_GROUPS) {
    assert.equal(group.commands.length, 25, group.name);
    assert.equal(new Set(group.commands.map(c => c.signature.split(' ')[0])).size, 25, group.name);
    for (const command of group.commands) keys.push(`${group.name}/${command.signature.split(' ')[0]}`);
  }
  assert.deepEqual(ANALYSIS_CASES.map(c => `${c[0]}/${c[1]}`), keys);
});

for (const [name, command, args, expected] of ANALYSIS_CASES) {
  const group = ANALYSIS_GROUPS.find(g => g.name === name);
  test(`${name} ${command}: independent expected result and Commander entry`, async () => {
    const original = JSON.stringify(args);
    const report = calculateOffline(group, command, args);
    close(report.result, expected);
    assert.match(report.note, /Offline/);
    assert.equal(JSON.stringify(args), original);
    const program = new Command().exitOverride();
    let printed;
    registerOfflineGroups(program, [group], { print(value) { printed = value; } });
    await program.parseAsync([name, command, '--', ...args], { from: 'user' });
    close(printed.result, expected);
  });
  test(`${name} ${command}: missing, extra, and malformed input rejected`, () => {
    assert.throws(() => calculateOffline(group, command, []));
    assert.throws(() => calculateOffline(group, command, [...args, '1']));
    assert.throws(() => calculateOffline(group, command, args.map((v, i) => i ? v : 'NaN')));
  });
}

function run(name, command, args) {
  return calculateOffline(ANALYSIS_GROUPS.find(g => g.name === name), command, args).result;
}

test('analysis rejects undefined statistics and inconsistent measurements', () => {
  for (const args of [
    ['series','standardize',['2,2']], ['series','minmax-scale',['2,2']],
    ['series','unit-sum',['0,0']], ['series','unit-length',['0,0']],
    ['series','ratios',['0,2']], ['series','trim',['1,2','1']],
    ['association','pearson',['1,1','2,3']], ['association','covariance',['1','1']],
    ['association','linear-fit',['1,1','2,3']],
    ['association','weighted-fit',['1,2','2,3','0,0']],
    ['distribution','bin-counts',['1,2','2,1']],
    ['distribution','gini',['0,0']], ['distribution','central-moment',['1,2','7']],
    ['smooth','trailing-sum',['1,2','3']], ['smooth','holt',['1','.5','.5']],
    ['trend','rates',['1,1','2,3']], ['trend','segment-slopes',['0,1,2','1,2,3','1']],
    ['probability','binomial-mass',['2','3','.5']],
    ['probability','expected-value',['1,2','.2,.2']],
    ['probability','conditional',['.8','.5']], ['probability','union',['.8','.8','.1']],
    ['experiment','cohen-d',['1,1','3,3']],
    ['scorecard','weighted-average',['1,2','0,0']],
    ['forecast','inventory-path',['1','0,1','2,0']],
    ['forecast','time-to-target',['1','3','-1']],
    ['forecast','seasonal-drift',['1,2,3','2','1']],
  ]) assert.throws(() => run(...args), args.join(' '));
});

test('analysis bounded output and edge probabilities', () => {
  assert.equal(run('probability','binomial-mass',['0','0','.5']), 1);
  assert.equal(run('probability','binomial-mass',['4','0','0']), 1);
  assert.equal(run('probability','binomial-mass',['4','4','1']), 1);
  assert.equal(run('probability','exactly-one',['1,0,0']), 1);
  assert.equal(run('probability','exactly-one',['1,1,0']), 0);
  assert.deepEqual(run('forecast','last-value',['1,2','0']), []);
  assert.deepEqual(run('series','trim',['1,2','0']), [1,2]);
  assert.equal(run('trend','recovery-time',['0,1','5,6','4']), null);
  assert.equal(run('trend','recovery-time',['0,1','1,2','4']), null);
  assert.deepEqual(run('smooth','centered-mean',['2','1000000']), [2]);
  assert.throws(() => run('forecast','last-value',['1','1001']));
  assert.throws(() => run('distribution','quantile-grid',['1,2','1000']));
  assert.throws(() => run('probability','binomial-mass',['1001','1','.5']));
  assert.throws(() => run('series','absolute',[Array(1001).fill('1').join(',')]));
  assert.throws(() => run('series','absolute',['1e7']));
  assert.throws(() => run('forecast','compound',['1000000','1000000','3']));
});


test('analysis handles full 1000-trial sums and exact probability boundaries', () => {
  assert.equal(run('probability','binomial-at-most',['1000','1000','1']), 1);
  assert.equal(run('probability','binomial-at-least',['1000','0','0']), 1);
  assert.equal(run('probability','trials-for-success',['.19','.1']), 2);
  assert.equal(run('probability','geometric-quantile',['.19','.1']), 2);
  assert.throws(() => run('distribution','lorenz',[Array(1000).fill('1').join(',')]));
});

test('forecast inventory paths allow decimal depletion but reject real shortages', () => {
  close(run('forecast','inventory-path',['.3','0,0','.1,.2']),[.2,0]);
  assert.throws(() => run('forecast','inventory-path',['.3','0,0','.1,.21']));
  for (const [count, use] of [[20,'.05'],[1000,'.001']]) {
    const receipts = Array(count).fill('0').join(',');
    const uses = Array(count).fill(use).join(',');
    assert.equal(run('forecast','inventory-path',['1',receipts,uses]).at(-1),0);
    assert.throws(() => run('forecast','inventory-path',['.999',receipts,uses]));
  }
});
