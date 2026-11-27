# Perimeter estimates

Offline continuous boundary and material estimates with supplied rates and dimensions. Cell quantities and counts are integers where stated; lengths measure intervals. Gates and openings must be nonoverlapping. No fences are placed or containment, visibility, safety, collision, and construction feasibility checked.

Run `mc-agent perimeter --help` for all commands. Every output is JSON with `result` and `note`. This group is offline and never acquires control or connects to Minecraft. Numeric inputs must be finite and are bounded to one million unless a narrower domain is documented; integer counts reject fractions. Structured outputs are capped at 1000 entries and results outside the safe numeric range are rejected.

| Command | Meaning |
| --- | --- |
| `gate-remainder <boundary> <gate-width> <gates>` | Subtract supplied nonoverlapping gate widths from a boundary length. |
| `fence-layers <boundary> <layers>` | Count fence units for supplied boundary cells and vertical layers. |
| `post-count-open <length> <maximum-span>` | Count endpoint posts on an open boundary measured in intervals. |
| `post-count-closed <length> <maximum-span>` | Count distinct posts on a positive closed boundary. |
| `slope-post-tops <length> <maximum-span> <start-height> <end-height> <post-height>` | Plan evenly spaced post chain distances and tops along a linear ground slope. |
| `post-loop <length> <maximum-span>` | Distribute closed-boundary post distances without repeating the origin. |
| `wire-rolls <boundary> <strands> <roll-length>` | Round up supplied wire rolls for multiple strands. |
| `mesh-rolls <boundary> <height> <roll-length> <roll-height>` | Round up mesh rolls for length and stacked height coverage. |
| `paint-area <boundary> <height> <faces>` | Compute fence painting area from length, height, and supplied face count. |
| `post-material <posts> <height> <cross-section>` | Compute post material volume with supplied cross-section area. |
| `footing-volume <posts> <radius> <depth>` | Estimate cylindrical footing material volume. |
| `brace-count <corners> <gates> <braces-per-end>` | Count braces at corners and both ends of each supplied gate. |
| `panel-count <clear-length> <maximum-panel>` | Round up equal-width panels on a clear fence run. |
| `panel-width <clear-length> <panels>` | Compute equal panel width from a supplied positive panel count. |
| `overlap-panels <length> <panel-width> <overlap>` | Count panels with supplied overlap; first panel has full width. |
| `picket-count <length> <picket-width> <gap>` | Count full pickets fitting a run with gaps only between pickets. |
| `picket-gap <length> <pickets> <picket-width>` | Compute equal gaps between supplied pickets, rejecting excess material. |
| `corner-diagonal <x-offset> <z-offset>` | Compute a diagonal brace length between supplied offsets. |
| `offset-rectangle <width> <depth> <offset>` | Compute perimeter of an outward-offset continuous rectangle. |
| `patrol-time <boundary> <speed> <pauses> <pause-seconds>` | Estimate one continuous boundary patrol plus supplied pauses. |
| `patrol-coverage <boundary> <guards> <detection-range>` | Compare ideal uniform guard separation with twice a supplied detection range. |
| `gate-throughput <gates> <crossing-seconds>` | Estimate ideal crossings per minute through independent gates. |
| `maintenance-sections <boundary> <section-length>` | Count bounded work sections around a boundary. |
| `repair-stock <fence-units> <damage-percent> <reserve-percent>` | Round up repair stock for supplied damage and contingency percentages. |
| `cost-estimate <fence-units> <posts> <fence-cost> <post-cost>` | Compute cost from supplied fence and post quantities and unit prices. |

Examples:

```sh
mc-agent perimeter gate-remainder 40 3 2
mc-agent perimeter fence-layers 40 2
mc-agent perimeter post-count-open 10 3
```

Fractional volumes and lengths are continuous estimates; round and choose actual game materials separately. No command executes an action.
