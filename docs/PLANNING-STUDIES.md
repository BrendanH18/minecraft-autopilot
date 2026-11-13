# Offline planning studies

`mc-agent study` adds five workflows to each of the 1,000 batch 10 planners:
**5,000 newly supported planner/workflow combinations**. These are five reusable
capabilities, not 5,000 new algorithms. No action is executed and no bridge,
model, or Minecraft connection is needed. The original planner's assumptions,
argument types, and output restrictions still apply.

Run `mc-agent study --help` for workflows, `mc-agent study catalog` for the full
machine-readable inventory, or `mc-agent study catalog durability` for one group.
The catalog reports each planner's signature and ordered argument types.
Run `mc-agent GROUP COMMAND --help` for the original calculation's arguments.

## Requests and reports

All five commands use this form:

```sh
mc-agent study WORKFLOW GROUP COMMAND 'JSON_REQUEST'
mc-agent study WORKFLOW GROUP COMMAND @request.json
cat request.json | mc-agent study WORKFLOW GROUP COMMAND -
```

Requests may be inline JSON, a UTF-8 file prefixed with `@`, or stdin using `-`.
Scalar arguments may be JSON numbers or strings. Lists remain CSV strings and
coordinate/edge arrays remain JSON-encoded strings, just as in the original
planner. For example, a numeric list argument inside a request is `"2,3"`,
not `[2,3]`. Negative numeric arguments inside JSON need no CLI `--` separator.

Reports include the workflow, group, command, workflow data, and both the study
note and original planner note. Cases and argument indexes are **one-based**;
result paths use **zero-based** JSON Pointer array indexes. Input row order is
preserved except in `rank`, where the original `case` is retained.

Any invalid case fails the entire study with a nonzero exit and no success JSON.
It never silently skips candidates or emits a partial result. Unknown request
fields are errors. Each study has 1–100 candidate cases; sensitivity counts
the total replacements across all changed arguments. Compare and sensitivity
also evaluate one baseline. Sweep validates its base arguments before varying.

Request and compact report JSON are limited to 1,000,000 UTF-8 bytes each.
Requests also have a maximum depth of 20, 10,000 value nodes, and 10,000
aggregate comma-separated string entries. Each original calculation keeps its
1,000-entry list limits. Result comparisons visit at most 10,000 nodes per case.
Nonfinite and unsafe-range numerical results or deltas fail. Use smaller studies
if combined reports exceed a limit. Pretty-printed CLI output may use more bytes
than the compact report limit. Reports contain the supplied inputs; review them
before sharing.

## Batch evaluation

```sh
mc-agent study batch durability action-budget '{"cases":[[25,3,4],[40,3,4]]}'
```

`cases` is a list of full argument rows. This example returns results `7` and
`12`, the whole actions available after protecting four durability units.
Output `cases` rows contain `case`, `args`, and `result`.

## Baseline comparison

```sh
mc-agent study compare durability action-budget '{"baseline":[25,3,4],"candidates":[[40,3,4],[25,2,4]]}'
```

The baseline result is `7`; the candidates return `12` and `10`. Each candidate
includes `changes`, with root changes `{"path":"","before":7,"after":12,"delta":5}`
and `{"path":"","before":7,"after":10,"delta":3}` respectively. The report has
`baseline` and `candidates`, each including their input arguments and result.

Nested objects and arrays are compared by own key or array index. Paths escape
`~` as `~0` and `/` as `~1`. Added or removed values use `null` for the absent
side and mark `beforePresent:false` or `afterPresent:false`; an actual null
remains distinguishable from absence. A shape/type change is one change at
that path. Only pairs of numeric values have a `delta` (`after - before`).
An unchanged result has no changes. Deltas describe arithmetic differences,
not improvement, causation, or a derivative.

## Parameter sweeps

```sh
mc-agent study sweep durability action-budget '{"args":[25,3,4],"index":2,"values":[1,2,3]}'
mc-agent study sweep queueplan parallel-makespan '{"args":["3,2,4",2],"index":1,"values":["3,2,4","2,2,2"]}'
```

A sweep replaces one complete argument at `index` for every supplied value.
The first example returns `21`, `10`, and `7`; the second replaces an entire
service list and returns `6` and `4`. Rows contain `case`, `value`, `args`, and
`result`. No interpolation, implicit range, or cross product is generated.

## One-at-a-time sensitivity

```sh
mc-agent study sensitivity durability action-budget '{"args":[25,3,4],"changes":[{"index":1,"values":[40]},{"index":2,"values":[2]}]}'
```

Each variation starts from the original baseline, so this returns `12` and
`10` against baseline `7`; it does not combine both replacements. Argument
indexes in `changes` must be unique. Use a `values` list to vary one index
multiple times. Output has `baseline` and `cases`; each case contains `index`,
`value`, `args`, `result`, and the same `changes` format as comparison. Whole
CSV or JSON argument-string replacement also works here. This is discrete
scenario analysis; it does not estimate statistical significance or gradients.

## Candidate ranking

```sh
mc-agent study rank durability action-budget '{"cases":[[25,3,4],[40,3,4],[25,2,4]],"direction":"max","limit":2}'
mc-agent study rank queueplan parallel-dispatch '{"cases":[["3,2,4",2],["2,2,2",2]],"path":"/2/finish","direction":"min"}'
```

The first example ranks original cases 2 and 3 with scores `12` and `10`.
The second ranks case 2 before case 1 on the final supplied job's finish
clock (`4` before `6`). `path` defaults to `""` (the entire result) and must be
a JSON Pointer, not a JavaScript expression. Missing paths fail. Only own keys
are selected; array tokens must be canonical zero-based indexes, never `length`.

`direction` is required (`min` or `max`). `measure` defaults to `value`, which
accepts homogeneous number, string, boolean, or null scores. Numbers sort
numerically, strings by JavaScript lexical order, booleans `false` before `true`;
null only ties null and cannot mix with other types. For `measure:"length"`,
the selected string's UTF-16 length, array element count, or object's own key
count is the numeric score. Pick an objective that means something for the plan.

Ties always preserve source order. All cases are evaluated and validated before
an optional `limit` (1–100) is applied. Output has `direction`, `path`, `measure`,
`total`, and `ranked` rows containing `rank` (sequential position), original
`case`, `args`, `result`, and `score`. Ranking is limited to supplied candidates
and one chosen objective; it does not find a global optimum or a safe route.

## Inventory and count

Each listed group contains 25 existing planners. Each planner now supports
`batch`, `compare`, `sweep`, `sensitivity`, and `rank`: **125 combinations per
group × 40 groups = 5,000**. The original guides enumerate all signatures;
`study catalog` provides their exact names and argument types at runtime.

| Original command guide | Groups (25 planners each) | New combinations |
| --- | --- | --- |
| [Spatial](PLANNING-SPATIAL.md) | `vector`, `voxel`, `tunnel`, `bridgeplan`, `roofplan`, `facade`, `spiral`, `symmetry`, `landmark`, `district` | 1,250 |
| [Resources](PLANNING-RESOURCES.md) | `queueplan`, `replenish`, `haul`, `bufferplan`, `batchflow`, `durability`, `harvest`, `blending`, `apportion`, `project-cost` | 1,250 |
| [Analysis](PLANNING-ANALYSIS.md) | `series`, `distribution`, `association`, `anomaly`, `smooth`, `trend`, `probability`, `experiment`, `scorecard`, `forecast` | 1,250 |
| [Coordination](PLANNING-COORDINATION.md) | `interval-set`, `shiftplan`, `dependency`, `pathplan`, `pointcloud`, `index-set`, `tiling`, `elevation`, `reach`, `patrol` | 1,250 |

The inventory test exercises all 5,000 combinations with independent expected
results from the original planner examples, via the study API and Commander.
Focused tests cover changed arguments, baseline deltas, shape changes, sorted
candidates, invalid requests, and limits. Real CLI processes check all five
workflows without a bridge and verify atomic failures. These checks establish
offline behavior and do not close packaged Fabric or authenticated-handoff
acceptance gates.
