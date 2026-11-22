import test from 'node:test';
import assert from 'node:assert/strict';
import { Command } from 'commander';
import { STUDY_WORKFLOWS, calculateStudy, registerPlanningStudies } from '../src/planning-studies.js';

export function close(actual, expected) {
  if (typeof expected === 'number') {
    assert.equal(typeof actual, 'number');
    assert.ok(Math.abs(actual - expected) <= 1e-9 * Math.max(1, Math.abs(expected)), `${actual} != ${expected}`);
  } else if (expected !== null && typeof expected === 'object') {
    assert.deepEqual(Object.keys(actual), Object.keys(expected));
    for (const key of Object.keys(expected)) close(actual[key], expected[key]);
  } else assert.equal(actual, expected);
}

// Reusing a baseline here tests identity invariants; focused workflow tests
// separately exercise changing inputs, rankings, and nested deltas.
export function testStudyWorkflows(group, command, args, expected) {
  test(`all nine study workflows: ${group} ${command}`, async () => {
    const before = JSON.stringify(args);
    const criteria =
      typeof expected === 'number'
        ? [
            { op: 'gte', value: expected - 1e-9 * Math.max(1, Math.abs(expected)) },
            { op: 'lte', value: expected + 1e-9 * Math.max(1, Math.abs(expected)) },
          ]
        : [
            {
              op: 'eq',
              measure: expected !== null && typeof expected === 'object' ? 'length' : 'value',
              value: expected !== null && typeof expected === 'object' ? Object.keys(expected).length : expected,
            },
          ];
    const measure = expected !== null && typeof expected === 'object' ? 'length' : 'value';
    const axes = args.slice(0, 2).map((value, index) => ({ index: index + 1, values: [value] }));
    const requests = {
      screen: { cases: [args], criteria },
      batch: { cases: [args] },
      compare: { baseline: args, candidates: [args] },
      sweep: { args, index: 1, values: [args[0]] },
      sensitivity: { args, changes: [{ index: 1, values: [args[0]] }] },
      rank: { cases: [args, args], direction: 'min', measure },
      factorial: { args, axes },
      summarize: { cases: [args, args], measure },
      pareto: {
        cases: [args, args],
        objectives: [
          { direction: 'min', measure },
          { direction: 'max', measure },
        ],
      },
    };
    let printed;
    const program = new Command().exitOverride();
    registerPlanningStudies(program, {
      print: (result) => {
        printed = result;
      },
    });
    for (const workflow of Object.keys(STUDY_WORKFLOWS)) {
      const report = calculateStudy(workflow, group, command, requests[workflow]);
      const rows = report.cases ?? report.candidates ?? report.ranked;
      close(rows[0].result, expected);
      if (workflow === 'screen') {
        assert.equal(report.passed, 1);
        assert.equal(report.failed, 0);
        assert.ok(report.cases[0].checks.every((check) => check.passed));
      }
      if (report.baseline) close(report.baseline.result, expected);
      if (workflow === 'compare' || workflow === 'sensitivity') assert.deepEqual(rows[0].changes, []);
      if (workflow === 'rank')
        assert.deepEqual(
          report.ranked.map((row) => row.case),
          [1, 2],
        );
      if (workflow === 'factorial') {
        assert.equal(report.total, 1);
        assert.deepEqual(
          report.cases[0].values,
          axes.map((axis) => axis.values[0]),
        );
        assert.deepEqual(report.cases[0].args, args);
      }
      if (workflow === 'summarize') {
        assert.equal(report.total, 2);
        assert.equal(report.values.length, 1);
        assert.deepEqual([report.values[0].count, report.values[0].cases], [2, [1, 2]]);
        assert.equal(report.statistics === null, report.scoreType !== 'number');
        if (report.statistics) assert.equal(report.statistics.range, 0);
      }
      if (workflow === 'pareto') {
        assert.deepEqual(report.front, [1, 2]);
        assert.ok(report.cases.every((row) => row.dominated === false && row.dominatedBy.length === 0));
      }
      await program.parseAsync(['study', workflow, group, command, JSON.stringify(requests[workflow])], {
        from: 'user',
      });
      assert.deepEqual(printed, report);
      assert.match(report.note, /Offline/);
    }
    assert.equal(JSON.stringify(args), before);
  });
}
