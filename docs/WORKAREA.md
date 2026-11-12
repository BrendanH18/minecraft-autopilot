# Discrete work areas

The `workarea` group offers 25 offline block-cell calculators for excavation and construction planning. Every area takes two opposite corners as `x,y,z`. Coordinates are floored, corner order does not matter, and both endpoint cells are included. For example, `0,64,0` through `2,66,2` contains 27 cells. All inputs must belong to one dimension.

These calculators never inspect, break, or place blocks. Counts do not describe material drops, existing air, ownership, structural support, reachability, or safety. Unlike continuous geometry, a single-cell area has volume 1 and six exposed unit faces.

| # | Command after `mc-agent workarea` | Behavior |
| --- | --- | --- |
| 1 | `size <a> <b>` | Count inclusive block cells and axis sizes. |
| 2 | `layers <a> <b>` | List horizontal layer ranges and cumulative cell counts. |
| 3 | `face-counts <a> <b>` | Count directional exposed unit faces, including degenerate dimensions. |
| 4 | `boundary <a> <b> <thickness>` | Count boundary and interior cells without face overlap. |
| 5 | `corners <a> <b>` | Enumerate unique corner block coordinates. |
| 6 | `center-blocks <a> <b>` | Enumerate central block cells, including even-size alternatives. |
| 7 | `chunk-cover <a> <b>` | Count intersected horizontal chunks using negative-coordinate floor division. |
| 8 | `section-cover <a> <b>` | Count intersected 16-cubed sections. |
| 9 | `region-cover <a> <b>` | Count intersected horizontal region files. |
| 10 | `chunk-partitions <a> <b>` | Partition the work area into clipped horizontal chunk columns. |
| 11 | `split-axis <a> <b> <axis> <width>` | Split an area into nonoverlapping cell-width slabs. |
| 12 | `tiles <a> <b> <x-width> <z-width>` | Split the footprint into clipped rectangular work tiles. |
| 13 | `expand <a> <b> <blocks>` | Grow every face by an integer number of cells. |
| 14 | `inset <a> <b> <blocks>` | Shrink every face; report an empty area if no cells remain. |
| 15 | `translate <a> <b> <dx> <dy> <dz>` | Translate a block area by integer offsets. |
| 16 | `union-count <a> <b> <c> <d>` | Count the exact union of two cell areas, rather than their bounding box. |
| 17 | `subtract <a> <b> <c> <d>` | Partition the first area minus the second into disjoint cuboids. |
| 18 | `overlap-ratio <a> <b> <c> <d>` | Measure discrete intersection-over-union and directional coverage. |
| 19 | `contains-box <a> <b> <c> <d>` | Test complete cell-area containment. |
| 20 | `touches <a> <b> <c> <d>` | Classify overlap, face, edge, corner adjacency, or separation. |
| 21 | `gap <a> <b> <c> <d>` | Count empty cells between axis projections and their maximum separation. |
| 22 | `nearest-face <a> <b> <point>` | Choose the nearest outer face plane to a point, with deterministic ties. |
| 23 | `boundary-distance <a> <b> <point>` | Report interior block-layer depth, or unknown outside the area. |
| 24 | `layer-at <a> <b> <y>` | Extract an integer horizontal layer if it intersects the area. |
| 25 | `checker-count <a> <b>` | Count global even and odd X+Y+Z block parity cells. |

Examples:

```sh
mc-agent --json workarea chunk-partitions -- -1,64,-1 16,65,16
mc-agent --json workarea subtract -- 0,64,0 4,68,4 1,65,1 3,67,3
mc-agent --json workarea tiles -- 0,64,0 15,67,15 8 8
```

Put `--` before negative coordinates. Widths and boundary thickness are positive integers; translations and growth are integer cell offsets. Growth and translations must stay within supported world bounds. Numeric offsets/widths are limited to 1 million, outputs to 1000 parts, and cell counts to safe JavaScript integers. Huge counts are rejected rather than silently rounded.

`subtract` emits at most six disjoint cuboids whose union equals the first area minus the second. `union-count` counts the actual union, including overlap once. `chunk-partitions` clips each chunk column to the original area and preserves total cells. `tiles` starts at the minimum X/Z corner. Grid calculations use floor division for negative coordinates. `touches` distinguishes common cells from face, edge, and corner adjacency. `gap` counts empty intervening cell layers, so touching areas have zero gap.

`nearest-face` measures perpendicular distance to the six infinite outer face planes (max planes lie at max+1); it does not measure distance to a finite face rectangle. Ties prefer X before Y before Z and min before max. `boundary-distance` floors its query point and returns null outside the area. `checker-count` uses global X+Y+Z parity, including negative coordinates. Empty insets and nonintersecting layers return null areas with zero cells.
