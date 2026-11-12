# Lightplan estimates

Abstract light geometry only: maximum source level minus unobstructed Manhattan distance, floored at zero. No occlusion, skylight, game-version behavior, spawning safety, or actual light propagation is checked. Source levels and rates are supplied assumptions. No sources are placed.

Run `mc-agent lightplan --help` for all commands. Every output is JSON with `result` and `note`. This group is offline and never acquires control or connects to Minecraft. Numeric inputs must be finite and are bounded to one million unless a narrower domain is documented; integer counts reject fractions. Structured outputs are capped at 1000 entries and results outside the safe numeric range are rejected.

| Command | Meaning |
| --- | --- |
| `falloff <source> <distance>` | Compute supplied source level minus Manhattan travel distance, floored at zero. |
| `reach <source> <minimum>` | Compute maximum abstract Manhattan range meeting a minimum level. |
| `vertical-reach <source> <minimum> <height>` | Compute remaining horizontal abstract reach after a vertical offset; -1 means unreachable. |
| `line-spacing <source> <minimum>` | Compute maximum spacing of integer line sources without below-minimum cells. |
| `square-spacing <source> <minimum>` | Compute integer square-grid spacing whose Manhattan worst cell meets minimum. |
| `diamond-cells <radius>` | Count integer cells in a Manhattan diamond. |
| `diamond-ring <radius>` | Count integer cells at an exact Manhattan radius. |
| `diamond-points <radius>` | List bounded integer coordinates in a Manhattan diamond. |
| `line-levels <source> <length>` | Sample abstract light levels along a line from its first cell. |
| `between-sources <source> <separation>` | Sample the maximum level from equal sources at both line endpoints. |
| `line-lit-count <source> <source-index> <length> <minimum>` | Count line cells meeting a supplied minimum from one source. |
| `line-deficits <source> <source-index> <length> <minimum>` | List line cells below supplied minimum and their level deficits. |
| `grid-source-count <width> <depth> <spacing>` | Count endpoint-inclusive source grids on a rectangle. |
| `grid-sources <width> <depth> <spacing>` | List endpoint-inclusive source grid coordinates. |
| `single-level <source> <sx> <sz> <x> <z>` | Evaluate an abstract point from a single horizontal source. |
| `height-level <source> <horizontal> <vertical>` | Evaluate an abstract point using horizontal Manhattan distance and vertical offset. |
| `corner-worst <source> <width> <depth>` | Compute worst level on a rectangle lit only at its four corner cells. |
| `center-worst <source> <width> <depth>` | Compute worst level from one source at the lower center cell. |
| `hanging-limit <source> <minimum> <horizontal>` | Compute largest whole vertical source offset meeting minimum. |
| `wall-row-count <length> <spacing> <rows>` | Count sources along parallel endpoint-inclusive wall rows. |
| `fuel-budget <sources> <duration> <burn-duration>` | Estimate whole consumable units per source for a supplied burn duration. |
| `replacement-cycle <sources> <burn-duration> <interval>` | Estimate whole replacements over a supplied maintenance interval. |
| `coverage-lower-bound <cells> <radius>` | Compute ideal area-only source lower bound; overlaps and edges can require more. |
| `level-margin <source> <distance> <minimum>` | Compute signed margin over supplied minimum abstract level. |
| `rectangle-audit <source> <sx> <sz> <width> <depth> <minimum>` | Audit min/max/mean levels and below-minimum cells in a bounded abstract rectangle. |

Examples:

```sh
mc-agent lightplan falloff 15 4
mc-agent lightplan reach 15 8
mc-agent lightplan vertical-reach 15 8 3
```

Fractional volumes and lengths are continuous estimates; round and choose actual game materials separately. No command executes an action.

`reach`, `vertical-reach`, `hanging-limit`, `line-spacing`, and `square-spacing` require a positive minimum level: a zero minimum has unbounded reach in this abstract model.
