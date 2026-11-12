# Offline geometry tools

`mc-agent geometry` adds 25 route and spatial planning commands. These operate
without Minecraft, a model, or a control lease. Points use `x,y,z`; all points
must fit the existing navigation bounds (X/Z ±29,999,984 and Y -64 through 320).
Use `--` before negative positional arguments. Routes accept 2–50 points.

```sh
mc-agent geometry route-elevation 0,64,0 20,72,0 20,68,20
mc-agent geometry route-at 10 0,64,0 20,64,0 20,64,20
mc-agent geometry route-project 12,64,3 0,64,0 20,64,0
mc-agent geometry bearing-target -- 0,64,0 -90 20
```

Every result includes a geometry caveat: terrain, hazards, path availability,
movement physics, and portal links are not assessed. All points must describe
the same dimension. No output executes movement. Fractional results describe
geometry and are not rounded to block positions.

1. `route-legs <points...>` reports each leg's endpoints, 3D distance, horizontal
   distance, and signed rise.
2. `route-elevation <points...>` totals ascent, descent, and net elevation change.
3. `route-grades <points...>` reports signed percent grades relative to horizontal
   distance. Vertical and zero-length legs have null grade; `vertical`
   distinguishes them.
4. `route-turns <points...>` reports horizontal turns at intermediate waypoints.
   Positive angles rotate east toward south in X/Z; zero-horizontal legs give
   null angles. A two-point route has no turns.
5. `route-detour <points...>` compares traveled distance to direct endpoint
   distance, including excess and ratio. Coincident endpoints produce null ratio.
6. `route-progress <points...>` attaches cumulative traveled distance to waypoints.
7. `route-at <distance> <points...>` locates a point at an inclusive traveled
   distance, rejecting distances beyond the route.
8. `route-prefix <distance> <points...>` truncates a route at a traveled distance,
   inserting an interpolated final point when needed. Zero distance returns only
   the first point; output is a point list, not an executable routine.
9. `route-dedupe <points...>` removes consecutive identical coordinates while
   preserving later visits to the same location. All-identical input produces one
   point.
10. `route-simplify <points...>` removes intermediate points within 0.0000001
    block of the segment between retained neighbors. Reversals remain unless
    their displacement is within that tolerance.
11. `route-project <query> <points...>` finds the nearest point on all finite
    route legs, including leg number, fraction, distance, and traveled distance
    along the route. Equal-distance ties keep the first leg.
12. `segment-project <from> <to> <query>` projects onto a finite 3D segment,
    clamping to its endpoints. A zero-length segment returns its starting point.
13. `sphere-contains <center> <radius> <point>` checks inclusive spherical range.
14. `box-volume <corner-a> <corner-b>` measures continuous cuboid volume in cubic
    blocks. This is not an inclusive count of occupied blocks.
15. `box-surface <corner-a> <corner-b>` measures geometric surface area in square
    blocks; zero spans follow the same formula.
16. `box-intersection <a1> <a2> <b1> <b2>` finds overlap bounds or null. Touching
    faces, edges, and points count as intersections.
17. `box-union <a1> <a2> <b1> <b2>` finds the smallest enclosing axis-aligned box;
    its interior can include space outside both input boxes.
18. `box-clamp <corner-a> <corner-b> <point>` finds the nearest point inside or on
    a cuboid and measures the query's distance from it.
19. `sphere-box <center> <radius> <corner-a> <corner-b>` checks sphere/cuboid
    intersection, including tangencies.
20. `chunk-distance <from> <to>` measures absolute chunk X/Z differences,
    Manhattan distance (cardinal chunk steps), and Chebyshev distance (diagonal
    steps allowed). It uses floor division for negative coordinates.
21. `chunk-center <point>` returns the horizontal center at origin + 8 of the
    containing 16×16 chunk, preserving Y.
22. `block-center <point>` returns the containing block's center on all three axes.
23. `bearing-target <point> <yaw> <distance>` projects horizontally using Minecraft
    yaw: 0 south, -90 east, 90 west, and ±180 north.
24. `rotate <point> <pivot> <degrees>` rotates X/Z around a vertical axis through
    the pivot while preserving the point's Y. Positive rotates east toward south.
25. `route-time <speed> <points...>` estimates seconds at a supplied constant
    blocks-per-second speed. Stops, acceleration, vertical movement constraints,
    and terrain are excluded.

Box corners may be supplied in either order. Distances/radii must be finite,
nonnegative, and at most 10,000,000,000. Speeds must be positive and at most
1,000 blocks per second. Angles are limited to -360 through 360 degrees.
Generated centers, rotations, and bearing targets are checked against the same
world bounds as input points; an edge chunk's center or boundary block's center
may therefore fail even when its original input fits the bounds.
