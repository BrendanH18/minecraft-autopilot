# Grid estimates

Offline coordinate arithmetic. Negative coordinates use floor division. Blocks and chunk indices are integers; next-boundary and custom lattice calculations use continuous coordinates. Does not read world files or load chunks.

Run `mc-agent grid --help` for all commands. Every output is JSON with `result` and `note`. This group is offline and never acquires control or connects to Minecraft. Numeric inputs must be finite and are bounded to one million unless a narrower domain is documented; integer counts reject fractions. Structured outputs are capped at 1000 entries and results outside the safe numeric range are rejected.

| Command | Meaning |
| --- | --- |
| `block-address <x> <z>` | Report chunk and local block coordinates using floor division. |
| `chunk-address <x> <z>` | Report region and local chunk coordinates. |
| `region-header-entry <chunk-x> <chunk-z>` | Identify an Anvil region file and both header offsets for a chunk. |
| `chunk-window <x> <z> <radius>` | Report the inclusive block-coordinate bounds of a square chunk window. |
| `region-seam <x> <z> <dx> <dz>` | Test whether an adjacent cardinal chunk step crosses a region-file seam. |
| `chunk-reconstruct <chunk> <local>` | Reconstruct a block axis from chunk index and local offset. |
| `region-reconstruct <region> <local-chunk>` | Reconstruct a chunk axis from region and local chunk index. |
| `section-address <y>` | Report section index and local vertical block coordinate. |
| `section-reconstruct <section> <local>` | Recover Y from a supported vertical section and local offset. |
| `region-slot <local-x> <local-z>` | Compute the zero-based Anvil header slot. |
| `slot-address <slot>` | Decode a zero-based Anvil header slot. |
| `section-index <x> <y> <z>` | Encode local block coordinates with X fastest, then Z, then Y. |
| `index-address <index>` | Decode an X/Z/Y ordered local block index. |
| `axis-chunks <minimum> <maximum>` | Count chunks touched by an inclusive block-axis interval. |
| `axis-regions <minimum> <maximum>` | Count regions touched by an inclusive block-axis interval. |
| `chunk-intersection <chunk> <minimum> <maximum>` | Count cells of an inclusive axis interval inside one chunk. |
| `border-distance <coordinate>` | Find distance from a block center to the nearest chunk boundary plane. |
| `next-boundary <coordinate> <direction>` | Find the next chunk boundary plane strictly in a direction. |
| `snap-grid <coordinate> <spacing> <origin>` | Snap a scalar coordinate to its nearest supplied lattice point. |
| `cell-center <coordinate> <spacing> <origin>` | Find the center of the containing half-open grid cell. |
| `chunk-neighbors <x> <z>` | List four orthogonally adjacent chunk indices. |
| `chunk-ring <radius>` | Count chunks at an exact Chebyshev radius. |
| `loaded-square <radius>` | Count chunks in a square with an inclusive chunk radius. |
| `axis-partitions <minimum> <maximum>` | Partition an inclusive block-axis interval at every chunk boundary. |
| `region-header-offset <local-x> <local-z>` | Report Anvil location and timestamp header byte offsets. |

Examples:

```sh
mc-agent grid block-address -1 16
mc-agent grid chunk-address -1 32
mc-agent grid region-header-entry -1 32
```

Fractional volumes and lengths are continuous estimates; round and choose actual game materials separately. No command executes an action.
