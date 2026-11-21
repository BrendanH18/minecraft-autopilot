# Offline planning studies

`mc-agent study` adds nine workflows to each of the 1,700 typed planners (the
1,000 from batch 10, 200 each from batches 13–15, and 100 from batch 16): **15,300 supported
planner/workflow combinations**. These are nine reusable capabilities, not
15,300 algorithms. No action is executed and no bridge, model, or Minecraft
connection is needed. The original planner's assumptions, argument types, and
output restrictions still apply.

Run `mc-agent study --help` for workflows, `mc-agent study catalog` for the full
machine-readable inventory, or `mc-agent study catalog durability` for one group.
The catalog reports each planner's signature and ordered argument types.
Run `mc-agent GROUP COMMAND --help` for the original calculation's arguments.

Use `mc-agent study search "map scale"` to find planners by topic. Each word must
appear somewhere in the group name, command name, or description. Matching ignores
case and accepts partial words. Results are a JSON array in catalog order with
the group, signature, and description for each match. An unmatched query returns
`[]`.

Compare the cost of a three-layer beacon base with a four-layer base using a
three-block top edge for both:

```sh
mc-agent study compare beacon-plan tier-materials '{"baseline":[3,3],"candidates":[[3,4]]}'
```

The baseline needs 83 blocks. Adding the fourth layer takes another 81 blocks,
bringing the candidate total to 164.

## Requests and reports

All nine commands use this form:

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
the total replacements across all changed arguments and factorial counts every
combination. Compare and sensitivity also evaluate one baseline. Sweep and
factorial validate their base arguments before varying.

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

## Constraint screening

```sh
mc-agent study screen durability action-budget '{"cases":[[25,3,4],[40,3,4],[25,2,4]],"criteria":[{"op":"gte","value":10},{"op":"lte","value":11}]}'
mc-agent study screen queueplan parallel-dispatch '{"cases":[["3,2,4",2],["2,2,2",2]],"criteria":[{"path":"/2/finish","op":"lte","value":4}]}'
```

Screen checks **every supplied criterion** for each candidate. The first example
returns results 7, 12, and 10; only case 3 passes both bounds. The second accepts
case 2's finish clock of 4 and rejects case 1's finish clock of 6. Candidates
remain in source order, including those that fail the criteria.

Supply 1–20 `criteria`, each with `op` and `value`. `path` defaults to `""`
and uses the same JSON Pointer rules as ranking; `measure` defaults to `"value"`.
Use `measure:"length"` to check a string's UTF-16 length, array element count,
or object's own key count. `eq` and `ne` compare scalar values of exactly the
same type, including null with null. `lt`, `lte`, `gt`, and `gte` compare numbers
only. Equality is exact; use two numeric bounds when a tolerance is needed.
Objects and arrays require a scalar path or length measurement.

The report includes normalized `criteria`, `total`, numeric `passed` and `failed`
counts, and `cases`. Every case contains `case`, `args`, `result`, a boolean
`passed`, and `checks`. Each check includes its one-based `criterion`, `actual`
measured value, and boolean `passed`. A case passes only if all checks pass.
All checks and cases are evaluated; a failed criterion does not hide a later
missing path, type mismatch, or invalid planner argument. Such errors fail the
entire request without a partial success report. Unknown fields are rejected.

A valid report exits successfully even when no cases pass: criterion failures
are data, while malformed requests are errors. Screening tests supplied bounds;
it does not establish real-world feasibility, safety, or optimality.

## Factorial grids

```sh
mc-agent study factorial durability action-budget '{"args":[25,3,4],"axes":[{"index":1,"values":[25,40]},{"index":2,"values":[3,2]}]}'
mc-agent study factorial queueplan parallel-makespan '{"args":["3,2,4",2],"axes":[{"index":2,"values":[1,2]},{"index":1,"values":["3,2,4","2,2,2"]}]}'
```

Factorial evaluates every combination of the supplied replacement values. The
first example crosses two remaining-durability values with two wear rates and
returns `7`, `10`, `12`, and `18`. The second crosses one or two servers with
two complete service lists and returns `9`, `6`, `6`, and `4`.

`args` is the full base argument row. It is evaluated first and must be valid,
even when an axis would replace the invalid argument. `axes` holds 1–10
objects, each with exactly `index` and `values`; neither has a default. `index`
is a one-based argument position and may appear in only one axis. `values`
holds 1–100 numbers or argument strings, each replacing the complete argument
as in a sweep. Repeated values remain separate combinations. The product of
the axes' value counts must not exceed 100. Every axis and that limit are
checked before any combination is evaluated.

Combinations are listed in row-major order: the first axis varies slowest and
the last axis fastest, with values in supplied order. Axes need not follow
argument order. The report has `axes` (each validated `index` and `values`),
`total` (the number of combinations), and `cases`. Each case contains its
one-based `case`, `values` (the replacement chosen for each axis, in `axes`
order), the complete `args` row after replacement, and `result`. Arguments
without an axis keep their base value. The base result is not reported
separately; it appears only where the supplied values reproduce the base row.

An unknown field in the request or in an axis, a malformed axis, or a single
invalid combination fails the whole request without a partial report. A
factorial grid examines only the supplied values; it does not interpolate
between them, rank the combinations, or estimate interactions or significance.

## Result summaries

```sh
mc-agent study summarize durability action-budget '{"cases":[[25,3,4],[40,3,4],[25,2,4],[34,3,4]]}'
mc-agent study summarize durability repair-or-replace '{"cases":[[10,2,5],[1,2,5],[3,2,5]],"path":"/choice"}'
```

Summarize reduces one objective across the supplied cases to its distinct
values and, for numbers, basic statistics. The first example scores `7`, `12`,
`10`, and `10`: `values` lists `7` (case 1), `10` (cases 3 and 4), and `12`
(case 2), and `statistics` is minimum `7`, maximum `12`, range `5`, sum `39`,
mean `9.75`, and median `10`. The second selects each decision and returns
`repair` for case 2 and `replace` for cases 1 and 3, with `statistics` null.

`cases` holds 1–100 full argument rows. `path` defaults to `""` (the entire
result) and follows the same JSON Pointer rules as ranking. `measure` defaults
to `"value"`, which requires a scalar or null at the path; `"length"` scores a
string's UTF-16 length, an array's element count, or an object's own key count.
Both fields are checked before any case is evaluated. All scores must share one
type: number, string, boolean, or null. Null matches only null, so a planner
that returns null for some cases and a number for others cannot be summarized.

The report has `path`, `measure`, `total` (the number of cases), `scoreType`
(`number`, `string`, `boolean`, or `null`), `values`, `statistics`, and `cases`.
`values` has one entry per distinct score with `value`, `count`, and the
one-based `cases` that produced it, listed in source order. Entries are sorted
ascending: numbers numerically, strings by JavaScript code-unit order, and
`false` before `true`. A null summary has a single entry. `0` and `-0` are one
value, reported as `0`. Distinct means exactly equal; nearby numbers are not
grouped. `cases` keeps source order, and each row contains `case`, `args`,
`result`, and `score`.

`statistics` is null unless `scoreType` is `number`. For numbers it contains
`minimum`, `maximum`, `range` (`maximum - minimum`), `sum`, `mean`
(`sum / total`), and `median`. The sum adds scores in source order with
Neumaier (Kahan–Babuška) compensation, which keeps small scores even when large
scores cancel: scores `2000001000000`, `0.1`, `-2000001000000`, and `0.2` sum to
`0.30000000000000004`, the same as `0.1 + 0.2`. The result is still a
floating-point estimate, and reordering the cases can change its last digits.
The median is the middle score of the ascending list; for an even count it is
`lower + (upper - lower) / 2`, the lower middle score plus half the difference
to the upper middle score.

An unknown field, a missing path, a selection the measure cannot score, mixed
score types, or a single invalid case fails the whole request without a partial
report. A sum or range beyond the safe numeric range fails in the same way. A
summary describes only the supplied cases, each counted once; it does not
weight them, sample between them, or estimate a distribution, trend, or
significance.

## Pareto fronts

```sh
mc-agent study pareto replenish review-order '{"cases":[[3,10,5],[3,10,8],[3,10,4],[3,10,1]],"objectives":[{"path":"/packs","direction":"min"},{"path":"/units","direction":"min"}]}'
mc-agent study pareto bufferplan capacity-comparison '{"cases":[[3,"4,0","2,6","5"],[3,"4,0","2,6","7"],[3,"4,0","2,6","9"]],"objectives":[{"path":"/0/capacity","direction":"min"},{"path":"/0/shortage","direction":"min"}]}'
```

Pareto compares the supplied cases on several objectives at once and reports
the cases that no other case dominates. The first example scores packs and
ordered units as `[2,10]`, `[1,8]`, `[2,8]`, and `[7,7]`: `front` is `[2,4]`,
case 1 is dominated by cases 2 and 3, and case 3 by case 2. The second scores
capacity and total shortage as `[5,3]`, `[7,1]`, and `[9,1]`: `front` is
`[1,2]`, and case 3 is dominated by case 2 because the larger buffer leaves the
same shortage.

`cases` holds 1–100 full argument rows. `objectives` holds 1–10 objects with
only the fields `path`, `measure`, and `direction`. `path` defaults to `""`
(the entire result) and follows the same JSON Pointer rules as ranking.
`measure` defaults to `"value"`, which requires a scalar or null at the path;
`"length"` scores a string's UTF-16 length, an array's element count, or an
object's own key count. `direction` is required: with `min` a smaller score is
better and with `max` a larger one. Every objective is checked before any case
is evaluated.

Within one objective all scores must share one type: number, string, boolean,
or null. Null matches only null, and objectives may differ in type from each
other. Numbers are ordered numerically, strings by JavaScript code-unit order,
and `false` before `true`; null scores tie. One case dominates another when it
is at least as good on every objective and strictly better on at least one.
Comparison is exact, without a tolerance. Cases with identical scores never
dominate each other, so both stay on the front unless a third case dominates
them.

The report has `objectives` (each with `path`, `measure`, and `direction` after
defaults), `total` (the number of cases), `front`, and `cases`. `front` lists
the one-based numbers of the non-dominated cases in source order and is never
empty. `cases` keeps source order, and each row contains `case`, `args`,
`result`, `scores` (one per objective, in `objectives` order), a boolean
`dominated`, and `dominatedBy`: the one-based numbers of every case that
dominates it, in source order, or an empty list.

Every score is built before dominance is judged, so a dominated case does not
hide a later missing path or type mismatch. An unknown field in the request or
in an objective, a malformed objective, a missing path, a selection the measure
cannot score, mixed score types within an objective, or a single invalid case
fails the whole request without a partial report. Called from JavaScript, a
hole in a sparse `cases` or `objectives` array is a malformed case or objective,
not a skipped one. A front examines only the supplied cases and the chosen
objectives; it does not search for other candidates, weight the objectives,
choose one best case, or establish feasibility or a global optimum.

## Inventory and count

Each listed group contains 25 planners. Each planner supports `batch`,
`compare`, `sweep`, `sensitivity`, `rank`, `screen`, `factorial`, `summarize`,
and `pareto`: **225 combinations per group × 68 groups = 15,300**. The guides
enumerate all signatures; `study catalog` provides their exact names and
argument types at runtime.

| Command guide | Groups (25 planners each) | Combinations |
| --- | --- | --- |
| [Spatial](PLANNING-SPATIAL.md) | `vector`, `voxel`, `tunnel`, `bridgeplan`, `roofplan`, `facade`, `spiral`, `symmetry`, `landmark`, `district` | 2,250 |
| [Resources](PLANNING-RESOURCES.md) | `queueplan`, `replenish`, `haul`, `bufferplan`, `batchflow`, `durability`, `harvest`, `blending`, `apportion`, `project-cost` | 2,250 |
| [Analysis](PLANNING-ANALYSIS.md) | `series`, `distribution`, `association`, `anomaly`, `smooth`, `trend`, `probability`, `experiment`, `scorecard`, `forecast` | 2,250 |
| [Coordination](PLANNING-COORDINATION.md) | `interval-set`, `shiftplan`, `dependency`, `pathplan`, `pointcloud`, `index-set`, `tiling`, `elevation`, `reach`, `patrol` | 2,250 |
| [Structures](PLANNING-STRUCTURES.md) | `stairplan`, `roundplan`, `rampart`, `warehouse` | 900 |
| [Operations](PLANNING-OPERATIONS.md) | `stripmine`, `herd`, `signalplan`, `linkplan` | 900 |
| [Construction](PLANNING-CONSTRUCTION.md) | `scaffold-plan`, `beacon-plan` | 450 |
| [Infrastructure](PLANNING-INFRASTRUCTURE.md) | `tunnel-vent`, `canal-lock` | 450 |
| [Waterways](PLANNING-WATERWAYS.md) | `sponge-plan`, `ice-road` | 450 |
| [Stations](PLANNING-STATIONS.md) | `furnace-bank`, `brewing-bench` | 450 |
| [Gardens](PLANNING-GARDENS.md) | `orchardplan`, `greenhouse` | 450 |
| [Settlements](PLANNING-SETTLEMENTS.md) | `maproom`, `bookbind`, `bannerhall` | 675 |
| [Crossings](PLANNING-CROSSINGS.md) | `harborplan`, `aqueduct`, `viaduct` | 675 |
| [Textiles](PLANNING-TEXTILES.md) | `textile` | 225 |
| [Note-block scores](PLANNING-SCORE.md) | `note-score` | 225 |
| [Libraries](PLANNING-LIBRARY.md) | `library-plan` | 225 |
| [Pixel murals](PLANNING-MURAL.md) | `mural` | 225 |

Batch 13 accounts for 4,800 of these combinations: `factorial`, `summarize`,
and `pareto` on the 1,000 batch 10 planners (3,000), the same three workflows
on the 200 batch 13 planners (600), and the six earlier workflows on those 200
planners (1,200).

The planner fixture tests exercise all 15,300 combinations with independent expected
results from the planner examples, via the study API and Commander. Focused
tests cover changed arguments, baseline deltas, shape changes, sorted
candidates, factorial ordering, summary statistics, dominance, invalid
requests, and limits. Real CLI processes check all nine workflows without a
bridge and verify atomic failures. These checks establish offline behavior and
do not close packaged Fabric or authenticated-handoff acceptance gates.
