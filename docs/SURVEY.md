# Survey reports

`mc-agent survey <report>` takes one observation without acquiring control or changing the world. Global `--bridge` and `--json` options work normally. Coordinates refer to the currently observed dimension. Reports operate on the backend's partial, loaded observations; an absent collection is `supported: false`, distinct from an empty reported collection. No report proves that an area is safe or exhaustively scanned.

The 25 additions are:

1. `block-position`: floor fractional player coordinates to the occupied block, including negative coordinates.
2. `chunk`: chunk X/Z plus local block coordinates from 0 through 15.
3. `section`: section X/Y/Z and local coordinates in its 16-block cube.
4. `region`: region X/Z, `r.X.Z.mca` filename, and local chunk coordinates from 0 through 31. This is a coordinate calculation, not a filesystem lookup.
5. `chunk-bounds`: inclusive X/Z block bounds of the occupied chunk.
6. `height-limits`: block altitude and distance to standard vanilla build limits for Overworld, Nether, or End. Custom dimension types can differ; unknown ids have null limits.
7. `border-margin`: directional distances to the CLI's hard coordinate bounds. These are not measurements of the configured server world border.
8. `vitals`: health in hearts and missing health/hunger points relative to 20. Maximum health and absorption are unavailable, so the reference is explicit.
9. `threat-types`: counts by observed hostile entity type.
10. `nearest-threat`: closest observed threat with a known or calculable distance, and count with unknown distance.
11. `threat-bands`: nonoverlapping distance bands through 5, 16, and 32 blocks, beyond 32, and unknown distances.
12. `threat-directions`: counts by compass direction, with separate same-column and unlocated entries.
13. `threat-elevation`: counts above, below, and in the player's block Y level; unlocated entries stay separate.
14. `block-types`: counts of observed entries by block type.
15. `block-bounds`: bounding box of located observed blocks, or null when none are located. This is not the backend's search radius.
16. `block-levels`: observed block counts grouped by block Y, ascending.
17. `block-directions`: observed block counts grouped by compass direction.
18. `logs`: observed vanilla logs and Nether stems, nearest known distances first. No claim that all nearby trees are reported.
19. `ores`: observed standard ores, deepslate variants, Nether ores, and ancient debris, nearest first.
20. `hazards`: observed potentially harmful block types, including lava, fire, cactus, and powder snow. Block state, falls, and unseen dangers are not assessed.
21. `liquids`: observed water and lava blocks, nearest first.
22. `container-types`: distinct observed container positions counted by type.
23. `container-coverage`: opened, unopened, and known-empty container counts after deduplicating coordinates. Opened contents are last observed, not freshly inspected.
24. `container-age`: each distinct container's observation age in seconds, null for unknown timestamps. Negative ages include `clockSkew: true`; timestamps depend on backend and local clocks.
25. `observation-coverage`: supported status and observed entry counts for blocks, threats, and containers, plus backend and dimension. Counts describe the raw observation, including duplicate entries.

For example:

```sh
mc-agent survey chunk
mc-agent survey nearest-threat
mc-agent survey container-coverage
```

Container reports deduplicate coordinates using the existing storage observation rule: opened records beat unopened records; among equally opened records the latest timestamp wins. These commands do not inspect or open a container. Run the existing storage inspection action when fresh contents are needed.
