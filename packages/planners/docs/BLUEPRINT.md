# Construction material plans

`mc-agent blueprint` offers 25 offline material calculators. They print JSON,
never connect to Minecraft, and never place or break blocks. Dimensions are
**occupied block counts**: a floor covering X coordinates 0 through 4 has width
5. Dimensions, quantities, and counts are integers from 1 through 1,000,000,
except explicitly supported zero material budgets. Inputs that would produce
an inexact integer total are rejected.

```sh
mc-agent blueprint room 7 5 3 1
mc-agent blueprint wall-opening 12 4 2 3 2
mc-agent blueprint spaced-posts 21 6 4
mc-agent blueprint material-waste 500 12.5
```

The room example has interior dimensions 7 × 5 × 3, outer dimensions 9 × 7 × 5,
and needs 210 blocks for its six-sided shell. The wall example removes two
side-by-side 2 × 3 openings from a 12 × 4 wall, leaving 36 blocks. These plans
assume geometry only: access, support, physics, placement orientation, existing
terrain, material selection, hazards, and build feasibility are not checked.
There is no recipe lookup or construction execution.

| Command | Result |
| --- | --- |
| `floor <width> <depth> <layers>` | Total blocks for a solid rectangular floor. |
| `floor-border <width> <depth> <thickness>` | Border blocks inside the outer footprint; no corner duplication. |
| `checkerboard <width> <depth>` | Two color counts with the origin assigned to the first color. |
| `stripes <width> <depth> <stripe-width>` | Alternating color counts across width; stripes run the full depth. |
| `wall <length> <height> <thickness>` | Blocks in a solid wall. |
| `wall-opening <length> <height> <opening-width> <opening-height> <openings>` | Gross, removed, and remaining blocks in a one-block-thick wall. Openings must fit side by side; their positions and lintels are not planned. |
| `perimeter-walls <width> <depth> <height> <thickness>` | Four walls inside the footprint; shared corners count once. |
| `closed-shell <width> <depth> <height> <thickness>` | Six-sided shell inside the supplied outer dimensions. |
| `open-box <width> <depth> <height> <thickness>` | Bottom plus four walls inside the supplied outer dimensions. |
| `room <inside-width> <inside-depth> <inside-height> <thickness>` | Outer dimensions and six-sided shell preserving the requested interior. |
| `cuboid-frame <width> <depth> <height>` | Unique blocks along the twelve one-block-thick box edges, including thin boxes. |
| `pillars <count> <height> <width> <depth>` | Total blocks for separate rectangular pillars. |
| `solid-stairs <width> <steps> <rise> <run>` | Full-block fill beneath each successive step; rise and run are per step, not Minecraft stair items. |
| `gable-fill <width> <depth>` | Filled layers shrinking width by two each time, with constant depth. |
| `pyramid <width> <depth>` | Filled layers shrinking both horizontal dimensions by two until one vanishes. |
| `tunnel-clear <width> <height> <length>` | Rectangular excavation cells and end opening area; existing air, fluids, and drops are unknown. |
| `tunnel-lining <inside-width> <inside-height> <length> <thickness>` | Lining around four sides of an open-ended tunnel; no end caps. |
| `spaced-posts <length> <maximum-gap> <height>` | One-block-wide posts at evenly distributed integer offsets, including both endpoints. |
| `grid-pillars <width> <depth> <x-gap> <z-gap> <height>` | Support counts and X/Z offsets for all grid combinations, including boundaries. |
| `layer-plan <width> <depth> <height>` | Per-layer and cumulative counts for a solid volume, at most 1,000 layers. |
| `material-stacks <blocks> <stack-size>` | Full stacks, remainder, and occupied stacks for an explicit limit of 1–64. Components and merge restrictions are ignored. |
| `batch-output <required> <yield> <input-per-batch>` | Whole batches, input cost, output, and surplus from supplied yields; no recipes are assumed. |
| `material-waste <blocks> <percent>` | Rounded-up allowance and total, with percentage 0–1,000. |
| `material-split <blocks> <builders>` | Integer allocations differing by at most one block; at most 1,000 builders. |
| `build-time <blocks> <blocks-per-minute>` | Minutes at a constant supplied rate of 0.001–1,000,000; gathering, movement, failures, and pauses excluded. |

`material-stacks`, `batch-output`, `material-waste`, `material-split`, and
`build-time` accept zero blocks or zero required output. Thickness may exceed
a structure's size; an interior that vanishes contributes zero void blocks.
Spacing measures center-to-center block offsets from 0 through length−1,
rather than empty air between posts. Offset arrays are capped at 1,000 entries
per axis. A length of one uses one post. In a grid, every X/Z combination is a
pillar; the output uses separate axis arrays instead of listing a million
positions.
