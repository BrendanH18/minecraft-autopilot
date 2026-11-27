# Coordination and route planning

All ten groups run offline with caller-supplied data. They print JSON, never execute actions, and never establish traversability or safety. Coordinates are abstract X/Z pairs in a single caller-chosen frame; times and rates must use consistent units. Lists and output sequences are bounded to 1,000 entries. Numbers are finite and within ±1,000,000; computed results must remain within the safe numeric range. Negative CLI arguments can follow `--`.

## interval-set

Offline continuous interval unions for work windows or route spans. Touching intervals merge; endpoints have zero length. Quantiles use covered length, not elapsed span.

1. `merge <intervals>` — Merge overlapping or touching intervals.
2. `runs <intervals>` — Count disjoint covered runs.
3. `covered <intervals>` — Measure the union without double counting.
4. `bounds <intervals>` — Find first start and last end.
5. `span <intervals>` — Measure elapsed span including gaps.
6. `density <intervals>` — Fraction of nonzero span covered.
7. `gaps <intervals>` — List internal uncovered spans.
8. `idle <intervals>` — Sum internal gap lengths.
9. `longest-gap <intervals>` — Find the largest internal gap length, zero if none.
10. `longest-run <intervals>` — Find longest covered run.
11. `shortest-run <intervals>` — Find shortest covered run including zero-length runs.
12. `starts <intervals>` — Report starts of merged runs.
13. `ends <intervals>` — Report ends of merged runs.
14. `midpoints <intervals>` — Report midpoints of merged runs.
15. `lengths <intervals>` — Report lengths of merged runs.
16. `contains <intervals> <point>` — Test closed endpoint membership.
17. `clip <intervals> <low> <high>` — Intersect with a closed query window.
18. `exclude <intervals> <low> <high>` — Remove query window interior; resulting boundaries remain closed.
19. `shift <intervals> <offset>` — Translate all merged runs.
20. `expand <intervals> <margin>` — Grow each run then merge.
21. `shrink <intervals> <margin>` — Erode merged runs and drop inverted runs.
22. `complement <intervals> <low> <high>` — Find uncovered query lengths; boundaries are shared.
23. `overlap <intervals> <low> <high>` — Measure union overlap with a window.
24. `distance <intervals> <point>` — Measure nearest distance to covered set.
25. `quantile <intervals> <fraction>` — Locate a fraction of total covered length.
## shiftplan

Offline sequential work durations in consistent time units; no travel or resource contention is inferred. Zero durations are allowed. Indexes are zero-based.

1. `schedule <durations>` — Produce sequential start/end records.
2. `starts <durations>` — Report start times.
3. `finishes <durations>` — Report completion times.
4. `total <durations>` — Sum serial work duration.
5. `completion-mean <durations>` — Mean job completion time.
6. `waiting-total <durations>` — Sum waiting time before jobs start.
7. `shortest-first <durations>` — Order job indexes by duration ascending.
8. `longest-first <durations>` — Order job indexes by duration descending.
9. `deadline-slack <durations> <deadline>` — Report slack after all jobs.
10. `completed-at <durations> <time>` — Count jobs whose completion is at or before time.
11. `active-at <durations> <time>` — Find active positive-duration job at time or null.
12. `remaining-at <durations> <time>` — Report remaining serial work.
13. `progress <durations> <time>` — Fraction of total nonzero work elapsed, clamped.
14. `offset <durations> <start>` — Shift schedule to a supplied origin.
15. `breaks <durations> <break-duration>` — Insert breaks between jobs, never after last.
16. `setup <durations> <setup-duration>` — Include setup before every listed job.
17. `repeat <durations> <cycles>` — Budget repeated full cycles.
18. `fit-cycles <durations> <budget>` — Count complete nonzero cycles fitting a budget.
19. `scale <durations> <factor>` — Scale durations by a deterministic factor.
20. `overheads <durations> <overheads>` — Add separate overhead per job.
21. `lateness <durations> <deadlines>` — Compute signed lateness per job.
22. `tardiness <durations> <deadlines>` — Sum positive lateness.
23. `weighted-completion <durations> <weights>` — Sum completion times times job importance weights.
24. `parallel-lower-bound <durations> <workers>` — Work/span lower bound ignoring job divisibility.
25. `greedy-workers <durations> <workers>` — Assign each ordered job to earliest-free worker.
## dependency

Offline directed task graphs. Edges are JSON [prerequisite,dependent] index pairs; node count includes isolated nodes. Duplicate edges count once; `[]` represents no edges and an empty quoted string (`''`) represents no completed tasks in `ready-after`. No actions execute.

1. `order <nodes> <edges>` — Return stable topological order; reject cycles.
2. `acyclic <nodes> <edges>` — Test directed acyclicity.
3. `roots <nodes> <edges>` — List nodes with no prerequisites.
4. `leaves <nodes> <edges>` — List nodes with no dependents.
5. `indegree <nodes> <edges>` — Count direct prerequisites per node.
6. `outdegree <nodes> <edges>` — Count direct dependents per node.
7. `levels <nodes> <edges>` — Longest prerequisite-chain depth per node.
8. `layers <nodes> <edges>` — Group nodes by prerequisite-chain depth.
9. `depth <nodes> <edges>` — Find longest chain length in edges.
10. `width <nodes> <edges>` — Find largest earliest-start layer; not maximum antichain.
11. `edges <nodes> <edges>` — Count distinct edges.
12. `isolated <nodes> <edges>` — List nodes without incident edges.
13. `adjacency <nodes> <edges>` — Report direct forward adjacency.
14. `reverse <nodes> <edges>` — Report direct reverse adjacency.
15. `reachable-pairs <nodes> <edges>` — Count ordered reachable distinct-node pairs.
16. `closure <nodes> <edges>` — Report transitive reachable dependents.
17. `redundant <nodes> <edges>` — Find edges implied by other prerequisite paths.
18. `critical-nodes <nodes> <edges>` — List nodes on some longest unit-time chain.
19. `unit-makespan <nodes> <edges>` — Earliest finish with unit tasks and unlimited workers.
20. `unit-slack <nodes> <edges>` — Unit-time schedule slack per node.
21. `descendants <nodes> <edges> <node>` — List transitive dependents excluding the selected node.
22. `ancestors <nodes> <edges> <node>` — List transitive prerequisites excluding the selected node.
23. `ready-after <nodes> <edges> <completed>` — List unfinished nodes whose prerequisites are completed.
24. `blocked-by <nodes> <edges> <node>` — Report selected node and all nodes depending on it.
25. `path-counts <nodes> <edges> <source>` — Count directed paths from a source including its empty path.
## pathplan

Offline ordered X/Z polyline measurements; repeated vertices allowed, but nonzero length is required for distance sampling. No terrain, navigation, or dimension inference.

1. `segments <points>` — Measure each consecutive leg.
2. `chainage <points>` — Cumulative distance at each vertex.
3. `length <points>` — Total ordered path distance.
4. `chord <points>` — Direct endpoint distance.
5. `detour <points>` — Extra path distance above endpoint chord.
6. `efficiency <points>` — Chord distance divided by nonzero path length.
7. `longest-leg <points>` — Maximum consecutive leg length.
8. `shortest-leg <points>` — Minimum consecutive leg length including zero.
9. `mean-leg <points>` — Arithmetic mean leg length.
10. `duplicates <points>` — Indexes of consecutive repeated vertices.
11. `reverse <points>` — Reverse ordered visit sequence.
12. `close <points>` — Append the starting point to make a closed route.
13. `midpoint <points>` — Sample at half total chainage.
14. `leg-shares <points>` — Fraction of path distance in each leg.
15. `centers <points>` — Midpoints of each leg.
16. `headings <points>` — Planar headings from positive X in degrees; zero legs unknown.
17. `sample <points> <distance>` — Sample a clamped distance along the route.
18. `resample <points> <count>` — Return equally spaced chainage samples including endpoints.
19. `trim-start <points> <distance>` — Move starting point forward and preserve later original vertices.
20. `travel-time <points> <speed>` — Budget motion time at supplied constant speed.
21. `leg-times <points> <speeds>` — Budget each leg at its own constant speed.
22. `translate <points> <dx> <dz>` — Shift every route vertex.
23. `crossings-x <points> <x>` — List segment indexes straddling an X line; endpoint on line included.
24. `stops-budget <points> <speed> <per-vertex>` — Add dwell at every listed waypoint to motion time.
25. `simplify-collinear <points>` — Collapse consecutive duplicates, then remove exact collinear interior vertices only when direction is preserved.
## pointcloud

Offline unordered supplied X/Z observations. Duplicate points retain weight unless deduplicating. Neighbors are straight-line distances; absent observations imply nothing about the world.

1. `count <points>` — Count observations including duplicates.
2. `unique <points>` — Preserve first occurrence of each coordinate.
3. `centroid <points>` — Find equally weighted coordinate mean.
4. `bounds <points>` — Find axis-aligned lower and upper bounds.
5. `extent <points>` — Measure X and Z range.
6. `box-area <points>` — Measure bounding rectangle area, zero when degenerate.
7. `median-center <points>` — Coordinatewise median center.
8. `variance <points>` — Population coordinate variances.
9. `covariance <points>` — Population covariance between coordinates.
10. `rms-origin <points>` — Root mean square radial distance from origin.
11. `radii <points>` — Distances to coordinate centroid.
12. `medoid <points>` — Index minimizing summed distances to observations.
13. `sort-x <points>` — Sort coordinates lexicographically by X then Z.
14. `sort-z <points>` — Sort coordinates lexicographically by Z then X.
15. `quadrants <points>` — Count half-open origin quadrants, axes in positive halves.
16. `nearest <points> <x> <z>` — Nearest observation index and distance.
17. `farthest <points> <x> <z>` — Farthest observation index and distance, latest index wins ties.
18. `within <points> <x> <z> <radius>` — Indexes within closed query radius sorted by distance.
19. `outside <points> <x> <z> <radius>` — Indexes strictly beyond query radius sorted by distance.
20. `k-nearest <points> <x> <z> <count>` — Up to count nearest observations.
21. `radius-counts <points> <radius>` — Neighbor counts per observation excluding itself.
22. `isolated <points> <radius>` — Indexes with no other observation inside radius.
23. `clip-box <points> <xmin> <zmin> <xmax> <zmax>` — Keep observations inside closed valid rectangle.
24. `snap <points> <step>` — Round each coordinate to nearest grid multiple.
25. `occupancy <points> <cell-size>` — Count observations per floored grid cell in first-seen order.
## index-set

Offline set algebra for numeric task or waypoint indexes. Inputs are nonnegative whole-number CSV lists; results discard duplicates. Sorted outputs use increasing index order.

1. `union <first> <second>` — All indexes in either set.
2. `intersection <first> <second>` — Indexes appearing in both sets.
3. `difference <first> <second>` — Indexes in first set only.
4. `reverse-difference <first> <second>` — Indexes in second set only.
5. `symmetric <first> <second>` — Indexes in exactly one set.
6. `subset <first> <second>` — Test first set inclusion in second.
7. `superset <first> <second>` — Test second set inclusion in first.
8. `equal <first> <second>` — Test set equality ignoring duplicates.
9. `disjoint <first> <second>` — Test whether intersection is empty.
10. `jaccard <first> <second>` — Intersection size divided by union size.
11. `dice <first> <second>` — Twice overlap divided by total set sizes.
12. `overlap <first> <second>` — Intersection over smaller set size.
13. `coverage-first <first> <second>` — Fraction of first indexes present in second.
14. `coverage-second <first> <second>` — Fraction of second indexes present in first.
15. `union-count <first> <second>` — Count distinct combined indexes.
16. `intersection-count <first> <second>` — Count shared distinct indexes.
17. `edit-count <first> <second>` — Number of membership toggles between sets.
18. `retain-order <first> <second>` — Intersect while retaining first input encounter order.
19. `append-new <first> <second>` — Append new second-set indexes after first encounter order.
20. `membership <first> <second>` — Report membership flags in combined encounter order.
21. `complement <indexes> <size>` — Missing indexes in range zero through size minus one.
22. `runs <indexes>` — Group consecutive indexes into inclusive ranges.
23. `duplicates <indexes>` — List indexes repeated at least once.
24. `shift <indexes> <offset>` — Translate indexes; reject negative results.
25. `mask <indexes> <size>` — Boolean membership mask of supplied bounded size.
## tiling

Offline rectangular panel layout with caller-supplied continuous widths and heights. Tile counts include partial edge tiles; cut reuse and material mechanics are excluded.

1. `columns <width> <height> <tile-width> <tile-height>` — Columns needed including a partial edge column.
2. `rows <width> <height> <tile-width> <tile-height>` — Rows needed including a partial edge row.
3. `tiles <width> <height> <tile-width> <tile-height>` — Total whole tiles to purchase without cut reuse.
4. `full-tiles <width> <height> <tile-width> <tile-height>` — Count uncut interior tiles.
5. `partial-tiles <width> <height> <tile-width> <tile-height>` — Count tiles requiring any edge cut.
6. `area <width> <height> <tile-width> <tile-height>` — Target covered area.
7. `purchased-area <width> <height> <tile-width> <tile-height>` — Area of all purchased whole tiles.
8. `waste-area <width> <height> <tile-width> <tile-height>` — Discard area when cuts cannot be reused.
9. `waste-fraction <width> <height> <tile-width> <tile-height>` — Discard area divided by purchased area.
10. `edge-width <width> <height> <tile-width> <tile-height>` — Remainder width; zero when exactly divisible.
11. `edge-height <width> <height> <tile-width> <tile-height>` — Remainder height; zero when exactly divisible.
12. `horizontal-seams <width> <height> <tile-width> <tile-height>` — Length of interior row seams.
13. `vertical-seams <width> <height> <tile-width> <tile-height>` — Length of interior column seams.
14. `seam-total <width> <height> <tile-width> <tile-height>` — Total interior grid seam length.
15. `border <width> <height> <tile-width> <tile-height>` — Outer boundary length.
16. `junctions <width> <height> <tile-width> <tile-height>` — Interior four-tile grid junction count.
17. `row-widths <width> <height> <tile-width> <tile-height>` — Cut width of each column.
18. `column-heights <width> <height> <tile-width> <tile-height>` — Cut height of each row.
19. `rotated-count <width> <height> <tile-width> <tile-height>` — Purchase count with tile orientation rotated ninety degrees.
20. `rotation-saving <width> <height> <tile-width> <tile-height>` — Whole-tile saving from rotating all tiles.
21. `dimensions <width> <height> <tile-width> <tile-height>` — Grid dimensions including edge cuts.
22. `cells <width> <height> <tile-width> <tile-height>` — List bounded tile cut dimensions in row-major order.
23. `order-cost <width> <height> <tile-width> <tile-height> <unit-cost>` — Budget whole tiles at a supplied price.
24. `spares <width> <height> <tile-width> <tile-height> <fraction>` — Add rounded-up proportional spare tiles.
25. `packages <width> <height> <tile-width> <tile-height> <pack-size>` — Round tile demand to whole packages.
## elevation

Offline equally spaced supplied height-profile samples. These are abstract measurements, not world scans. Fill and excavation use linear interpolation and supplied cross-section width.

1. `deltas <heights>` — Signed height changes between samples.
2. `ascent <heights>` — Total positive elevation gain.
3. `descent <heights>` — Total positive elevation loss.
4. `net <heights>` — Final height minus initial height.
5. `range <heights>` — Highest minus lowest sample.
6. `peaks <heights>` — Strict interior peak indexes.
7. `valleys <heights>` — Strict interior valley indexes.
8. `level-legs <heights>` — Indexes of horizontal legs.
9. `up-legs <heights>` — Indexes of ascending legs.
10. `down-legs <heights>` — Indexes of descending legs.
11. `roughness <heights>` — Sum absolute second differences, in height units.
12. `total-variation <heights>` — Total absolute elevation change.
13. `running-high <heights>` — Highest observed height through each sample.
14. `running-low <heights>` — Lowest observed height through each sample.
15. `relative-start <heights>` — Height offsets from first sample.
16. `grades <heights> <spacing>` — Signed rise divided by horizontal spacing.
17. `angles <heights> <spacing>` — Signed inclination angle in degrees per leg.
18. `surface-length <heights> <spacing>` — Polyline length through the sampled vertical cross-section.
19. `horizontal-span <heights> <spacing>` — Horizontal distance between first and last sample.
20. `max-grade <heights> <spacing>` — Largest absolute grade, zero with one sample.
21. `steep-legs <heights> <spacing> <limit>` — Indexes whose absolute grade strictly exceeds a supplied threshold.
22. `offset <heights> <delta>` — Translate all heights by a vertical offset.
23. `level-deficits <heights> <target>` — Per-sample fill heights below a target plane.
24. `level-excess <heights> <target>` — Per-sample cut heights above a target plane.
25. `signed-volume <heights> <target> <spacing> <width>` — Signed fill-minus-cut volume using trapezoidal integration.
## reach

Offline constant-speed travel budgets using explicit delays and reserves. Results do not account for terrain, obstacles, loading, acceleration, or food.

1. `radius <budget> <speed> <delay>` — Maximum one-way distance after fixed delay.
2. `roundtrip-radius <budget> <speed> <delay>` — Maximum distance with equal-speed outward and return travel.
3. `time-left <budget> <speed> <delay>` — Travel time available after fixed delay.
4. `delay-share <budget> <speed> <delay>` — Delay divided by total time budget.
5. `disk-area <budget> <speed> <delay>` — Area of unobstructed continuous travel disk.
6. `diamond-area <budget> <speed> <delay>` — Area of continuous Manhattan travel diamond.
7. `square-area <budget> <speed> <delay>` — Area of continuous Chebyshev travel square.
8. `circumference <budget> <speed> <delay>` — Boundary length of continuous travel disk.
9. `diameter <budget> <speed> <delay>` — Maximum separation of opposite reachable points.
10. `lost-distance <budget> <speed> <delay>` — Travel distance lost to delay, capped at full budget.
11. `required-speed <distance> <budget> <delay>` — Speed needed after delay; reject absent travel time for positive distance.
12. `arrival <distance> <speed> <delay>` — Arrival time including a fixed predeparture delay.
13. `slack <distance> <speed> <delay> <budget>` — Signed time budget margin on arrival.
14. `can-arrive <distance> <speed> <delay> <budget>` — Test whether constant-speed arrival meets budget.
15. `return-reserve <outward> <out-speed> <back-speed> <delay>` — Total roundtrip duration with asymmetric speeds.
16. `asymmetric-radius <budget> <out-speed> <back-speed> <delay>` — Maximum roundtrip distance with asymmetric speeds.
17. `reserve-radius <budget> <speed> <reserve>` — One-way distance after reserving explicit time.
18. `waypoints <distances> <speed> <budget>` — Indices whose one-way travel times meet a budget.
19. `arrival-list <distances> <speed> <delay>` — Arrival times for independent direct destinations.
20. `speed-window <distance> <fast> <slow>` — Earliest/latest travel times for a supplied speed range.
21. `budget-window <low-budget> <high-budget> <speed>` — One-way distance range for ordered time budgets.
22. `slowdown <distance> <speed> <factor>` — Travel time after multiplying speed by a positive factor.
23. `rest-cycles <distance> <speed> <walk-period> <rest>` — Time with a rest after each full walking period except on arrival.
24. `stop-cost <distance> <speed> <stops> <stop-duration>` — Travel plus fixed dwell per planned stop.
25. `latest-departure <distance> <speed> <deadline>` — Latest departure timestamp for a direct constant-speed trip.
## patrol

Offline repeated loop patrol arithmetic. Loop lengths, speeds, rest, visit times, and phases are supplied assumptions; no entities or threats are observed.

1. `moving-period <length> <speed> <rest>` — Duration moving once around a loop.
2. `cycle-period <length> <speed> <rest>` — Duration of one loop plus end-of-loop rest.
3. `frequency <length> <speed> <rest>` — Cycles per time unit.
4. `moving-share <length> <speed> <rest>` — Fraction of each cycle spent moving.
5. `rest-share <length> <speed> <rest>` — Fraction of each cycle spent resting.
6. `effective-speed <length> <speed> <rest>` — Long-run distance per time including rest.
7. `absence-gap <length> <speed> <rest> <watch-duration>` — Time between departure from and next arrival at a watched point.
8. `total-time <length> <speed> <rest> <laps>` — Budget laps with rest after every lap including the last.
9. `moving-time <length> <speed> <laps>` — Sum movement time over whole laps.
10. `distance <length> <laps>` — Total distance over whole laps.
11. `fit-laps <length> <speed> <rest> <budget>` — Count complete movement-plus-rest cycles fitting a time budget.
12. `last-rest-free <length> <speed> <rest> <laps>` — Budget laps with no rest after the final lap.
13. `phase <period> <time>` — Normalize a timestamp to a cycle phase in time units.
14. `cycle-index <period> <time>` — Zero-based cycle index at a nonnegative timestamp.
15. `next-pass <period> <phase> <time>` — First pass at supplied phase at or after time; phase must be below period.
16. `wait-pass <period> <phase> <time>` — Delay until the next pass at a supplied valid phase.
17. `pass-times <period> <phase> <count>` — List bounded pass times from cycle zero.
18. `pass-count <period> <phase> <end>` — Count passes from time zero through an inclusive endpoint.
19. `stagger <period> <patrollers>` — Evenly spaced patrol start phases.
20. `stagger-gap <period> <patrollers>` — Ideal time gap between evenly staggered passes.
21. `required-patrollers <period> <max-gap>` — Minimum ideal equally spaced patrollers for a pass-gap target.
22. `watch-share <period> <duration> <patrollers>` — Ideal covered time fraction under evenly staggered identical watch intervals.
23. `checkpoint-phase <length> <speed> <distance>` — Arrival phase at a loop checkpoint; distance must fit loop.
24. `position <length> <speed> <rest> <time>` — Loop distance at a timestamp; rest holds position at loop end.
25. `state <length> <speed> <rest> <time>` — Classify movement or end-of-loop rest at timestamp.

Example: `mc-agent interval-set merge '[[0,2],[1,3],[5,7]]'`.


Example: `mc-agent shiftplan schedule '2,3,1'`.


Example: `mc-agent dependency order 4 '[[0,1],[0,2],[1,3],[2,3]]'`.


Example: `mc-agent pathplan segments '[[0,0],[3,0],[3,4]]'`.


Example: `mc-agent pointcloud count '[[0,0],[2,0],[0,2]]'`.


Example: `mc-agent index-set union '1,2,2,4' '2,3,4'`.


Example: `mc-agent tiling columns 10 7 3 2`.


Example: `mc-agent elevation deltas '0,2,1,4'`.


Example: `mc-agent reach radius 10 2 1`.


Example: `mc-agent patrol moving-period 12 3 2`.
