# Terrain observation analysis

`mc-agent terrain COMMAND` reads one authenticated observation. These commands do
not take control, refresh containers, or scan additional terrain. Every report
includes collection support, the number of entries missing coordinates, and a
partial-observation warning. Containers are deduplicated by position. Their
contents remain last observed. Missing entries never prove absence or safety;
current backends report collection targets rather than a complete terrain map.

Points use `x,y,z`, with X/Z within ±29,999,984 and Y from -64 to 320. Put `--`
before negative arguments. Radius and corridor width are inclusive geometric
distances from 0 to 60,000,000 blocks. Cylinder rises are relative to player Y,
ordered from -384 to 384. Nearest limits are integers from 1 to 1000. Grid sizes
range from 1 to 60,000,000 and align to the world origin; negative indices use
floor division. Grids count entries, not unique entity identities.

Each command below is an independently callable addition (local numbering 1–25).

1. `blocks-cylinder <radius> <minimum-rise> <maximum-rise>`: select observed blocks by horizontal distance and relative height.
2. `blocks-corridor <from> <to> <width>`: select blocks within width of a finite 3D segment, including spherical end caps.
3. `blocks-nearest-k <point> <limit>`: select up to limit blocks nearest an arbitrary point, retaining input order on ties.
4. `blocks-grid <size>`: count block observations in occupied 3D grid cells.
5. `blocks-spread`: compute the observed block centroid, mean radius and maximum radius; empty inputs give null geometry.
6. `blocks-projection <from> <to>`: project each block onto a segment, reporting the point, clamped fraction and perpendicular/end distance.
7. `threats-cylinder <radius> <minimum-rise> <maximum-rise>`: select located threats by horizontal distance and relative height.
8. `threats-corridor <from> <to> <width>`: select located threats near a finite 3D segment.
9. `threats-nearest-k <point> <limit>`: select up to limit located threats nearest an arbitrary point.
10. `threats-grid <size>`: count located threat entries in occupied 3D grid cells.
11. `threats-spread`: compute located threat centroid and radius statistics.
12. `threats-projection <from> <to>`: report located threat projections onto a segment.
13. `containers-cylinder <radius> <minimum-rise> <maximum-rise>`: select distinct containers by horizontal distance and relative height.
14. `containers-corridor <from> <to> <width>`: select distinct containers near a finite 3D segment.
15. `containers-nearest-k <point> <limit>`: select up to limit distinct containers nearest an arbitrary point.
16. `containers-grid <size>`: count distinct container locations in occupied 3D grid cells.
17. `containers-spread`: compute distinct container centroid and radius statistics.
18. `containers-projection <from> <to>`: report distinct container projections onto a segment.
19. `block-columns`: list sorted distinct observed Y cells for each occupied X/Z column.
20. `block-components <item>`: group observed blocks of one normalized Minecraft name into components using six face neighbors; sort largest first.
21. `block-surface <item>`: count faces of selected blocks without an adjacent observed block of any type. These are **unobserved neighbor faces**, not verified exposed or air faces.
22. `block-neighbors <point>`: list observed blocks in the six cells touching the floored point by a face.
23. `block-duplicates`: identify floored cells reported more than once, with entry counts and distinct reported names.
24. `block-height-profile <axis>`: report minimum/maximum observed Y and unique cell count grouped along `x` or `z`.
25. `block-cross-section <axis> <coordinate>`: select observed cells on an integer `x`, `y`, or `z` slice within the supported point bounds.

Structural block commands (19–25) floor positions to cells. Commands 19–22 and
24–25 use the first observed entry per cell; `block-duplicates` exposes conflicts.
Components only describe adjacency among reported cells. They cannot establish
whether unreported blocks connect components. Segment projections clamp to the
nearest endpoint outside the segment; zero-length segments project to their
single endpoint. No corridor establishes traversability or a safe route.

Examples:

```sh
mc-agent terrain blocks-cylinder 12 -- -2 4
mc-agent terrain containers-corridor 0,64,0 20,64,0 3
mc-agent terrain threats-nearest-k 10,64,10 5
mc-agent terrain block-components oak_log
mc-agent terrain block-cross-section y 64
```

`packages/planners/test/terrain-tools.test.js` checks expected behavior and Commander dispatch for
all 25 commands, plus bounds, unsupported collections, duplicate cells, negative
grid indices, and degenerate segments. No live Fabric acceptance claim follows
from these reports or their fixture tests.
