# Offline navigation calculators

`mc-agent nav` calculates geometry without a bridge, game, model, or control lease.
Points use `x,y,z` without spaces. Put `--` before positional arguments when any
start with a minus sign, for example `mc-agent nav chunk -- -0.5,64,-17`.
All commands print JSON and support the global `--json` flag.

Coordinates must be finite, with X/Z within ±29,999,984 and Y within -64 to 320,
matching the existing navigation protocol. These are protocol bounds, not a
claim that every backend or dimension permits standing at every accepted Y.
Block coordinates use floor, so negative coordinates select the correct block,
chunk, region, and section. Index conversion commands return geometric corners;
a region's northwest corner can extend beyond the world border.

All routes and distances are straight lines. These tools do not inspect terrain,
find safe paths, check reachable positions, or navigate your character. Portal
conversion preserves Y and scales only X/Z; it does not predict the destination
portal, validate a portal site, or guarantee portal linking. Enter coordinates
from the source dimension named by the command. Distances between dimensions
are not meaningful.

The 25 calculators are:

1. `nav block <point>` — floor each coordinate to the containing block.
2. `nav chunk <point>` — report containing chunk X/Z indices (16 blocks).
3. `nav region <point>` — report region indices and `r.X.Z.mca` filename (512 blocks).
4. `nav chunk-origin <chunk-x> <chunk-z>` — convert chunk indices to the northwest X/Z block corner.
5. `nav region-origin <region-x> <region-z>` — convert region indices to the northwest X/Z block corner.
6. `nav chunk-local <point>` — report block X/Z offsets 0–15 within the chunk and floored world Y.
7. `nav region-local <point>` — report chunk X/Z offsets 0–31 within the region.
8. `nav section <point>` — report the signed vertical section index, floor(Y/16).
9. `nav section-origin <section-y>` — report the section's bottom Y; indices -4 to 19 cover the standard Overworld build sections.
10. `nav distance <from> <to>` — report Euclidean distance in three dimensions.
11. `nav horizontal <from> <to>` — report X/Z distance, ignoring elevation.
12. `nav displacement <from> <to>` — report signed X/Y/Z offsets from origin to destination.
13. `nav heading <from> <to>` — report compass direction, yaw, and pitch using Minecraft conventions. Yaw 0 faces south; positive pitch looks down. Coincident points give null directions.
14. `nav midpoint <from> <to>` — report the point halfway along the segment.
15. `nav offset <point> <dx> <dy> <dz>` — apply signed offsets and reject an out-of-bounds result.
16. `nav interpolate <from> <to> <fraction>` — report a point at fraction 0–1 along the segment.
17. `nav nether <point>` — divide Overworld X/Z by eight for theoretical Nether coordinates.
18. `nav overworld <point>` — multiply Nether X/Z by eight and reject an out-of-bounds result.
19. `nav route <points...>` — report points, leg count, and total straight-line length.
20. `nav reverse-route <points...>` — return the points in reverse order for planning the return trip.
21. `nav close-route <points...>` — append the first point unless the route already ends there.
22. `nav route-bounds <points...>` — report minimum and maximum X/Y/Z for the entire route.
23. `nav route-sample <from> <to> <spacing>` — include both endpoints and evenly sample the segment at intervals no longer than the positive spacing. Reject requests exceeding 1,000 points. A zero-length segment returns two coincident endpoints.
24. `nav contains <corner-a> <corner-b> <point>` — test an inclusive cuboid; corner order does not matter.
25. `nav nearest <points...>` — use the first point as origin and choose the closest remaining candidate; return its one-based index among candidates. Ties retain input order.

Variable-length route and nearest inputs accept 2–50 points total; closing a
50-point open route can return 51 points. Output remains advisory and is never
automatically executed.

Examples:

```sh
mc-agent nav region -- -1,64,512
mc-agent nav heading 0,64,0 100,64,0
mc-agent nav nether 800,64,1600
mc-agent nav route 0,64,0 10,64,0 10,64,10
mc-agent nav route-sample 0,64,0 100,64,0 20
```
