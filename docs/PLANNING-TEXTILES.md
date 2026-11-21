# Textile planners

Design a carpet floor from a swatch, calculate its wool requirements and check the installation. All 25 commands run offline.

Assign your carpet colors numeric IDs from 1 through 16 and keep that mapping across commands. For example, `mc-agent textile checker-layout 3 2 2 1 4,8` generates the two rows `4,4,8` and `8,8,4`. To order wool for that floor with no carpets on hand, run `mc-agent textile wool-orders 4,4,8,8,8,4 0`. The floor needs one batch for each color, or four wool in total.

Supply swatches as a flat, comma-separated list of color IDs, reading left to right and then top to bottom. A width of three splits six cells into two rows. Coordinates start at column 1 and row 1. An observed floor may contain 0 for an empty floor cell. Stock lists start at color 1, with omitted trailing colors treated as empty. Color reports appear in ascending color order.

Dimensions are in whole blocks. The input codes `s`, `c` and `i` denote positive, nonnegative and signed whole numbers respectively. Uppercase codes denote comma-separated lists. Put `--` between the command name and its arguments when supplying a negative offset. Generated layouts and input lists contain at most 1,000 cells or entries.

| Command | Types | Calculation |
| --- | --- | --- |
| `stripe-layout <width> <height> <colors> <band-widths>` | `s,s,S,S` | Repeat vertical color bands with individually sized widths. |
| `checker-layout <width> <height> <tile-width> <tile-height> <colors>` | `s,s,s,s,S` | Alternate two colors in rectangular checks cropped at the floor edges. |
| `ring-layout <width> <height> <band-depth> <colors>` | `s,s,s,S` | Lay concentric rectangular color bands inward from all four floor edges. |
| `chevron-layout <width> <height> <rise> <colors>` | `s,s,s,S` | Bend repeating horizontal color lines into chevrons with a supplied rise. |
| `twill-layout <width> <height> <over> <under> <row-step> <colors>` | `s,s,s,s,i,S` | Shift a two-color over-under weave by a signed offset on successive rows. |
| `diamond-layout <width> <height> <center-column> <center-row> <colors>` | `s,s,s,s,S` | Alternate diamond outlines at increasing block distances from a chosen center. |
| `gingham-layout <width> <height> <band> <gap> <colors>` | `s,s,s,s,S` | Cross repeating warp and weft bands using ground, stripe and intersection colors. |
| `tile-motif <width> <height> <motif-width> <motif> <course-shift>` | `s,s,s,S,i` | Tile a swatch, shifting it horizontally after each completed course of motifs. |
| `loom-draft <threading> <lift-masks> <warp-colors> <weft-colors>` | `S,C,S,S` | Render a shaft-loom drawdown from column threading, lifted shafts and yarn colors. |
| `braid-layout <strand-colors> <rows>` | `S,s` | Lay a three-strand runner, alternating the left and right crossings after each row. |
| `bookmatch <half-width> <half> <shared-center>` | `s,S,c` | Reflect a half-pattern across its right edge or through its last column. |
| `fringe-ends <width> <cells> <spacing> <fringe-color>` | `s,S,s,s` | List fringe placements immediately above the top row and below the bottom row. |
| `palette-remap <cells> <source-colors> <target-colors>` | `S,S,S` | Replace selected colors simultaneously, allowing swaps and palette consolidation. |
| `color-takeoff <cells>` | `S` | Count the carpets needed for each color appearing in the design. |
| `warp-floats <width> <cells> <warp-colors>` | `s,S,S` | Measure the longest continuous run matching the warp color in each column. |
| `runner-alignment <hall-widths> <runner-width> <clearance>` | `S,s,c` | Find centered runner margins in each hall section, rejecting sections below the clearance. |
| `shearing-rounds <wool-needed> <colored-sheep> <yield-per-sheep>` | `C,C,s` | Estimate flock shearing rounds per color at a caller-supplied yield per sheep per round. |
| `reuse-balance <design> <observed>` | `S,C` | Balance salvaged wrong-color carpets against replacements, excluding cells already correct. |
| `wool-orders <cells> <carpet-stock>` | `S,C` | Budget two wool per three carpets separately by color after using loose stock. |
| `haul-slots <cells> <stack-limit> <slots-per-trip>` | `S,s,s` | Pack same-color carpet stacks into delivery trips without combining partial stacks across colors. |
| `stock-frontier <width> <cells> <stock>` | `s,S,C` | Find the first row-major placement that runs out of its color and return the completed count. |
| `patch-junctions <upper-panel-widths> <lower-panel-widths>` | `S,S` | Locate four-way seam junctions where adjacent patchwork rows have identical join offsets. |
| `align-edges <first-edge> <second-edge>` | `S,S` | Find the earliest cyclic left shift of the second edge maximizing color matches. |
| `repeat-unit <edge>` | `S` | Recover the shortest color sequence that repeats exactly to fill a sample edge. |
| `dye-lots <wool-needed> <colored-stock> <dyes> <blank-wool>` | `C,C,C,c` | Assign undyed wool and matching dyes to shortages in ascending color ID order. |

For `twill-layout`, a positive step moves the start of the over-band to the right as rows advance. For `tile-motif`, the shift applies once per motif height. The bookmatch output width is twice the half-width minus the shared-center flag. A bookmatch with a shared center includes the last column of the half-pattern once. Fringe placements use the supplied width across each runner end, at rows 0 and height + 1.

Salvage assumes one recoverable carpet per occupied cell. Wool orders apply the vanilla same-color recipe of two wool for three carpets. The reported crafted surplus counts only extra carpets produced by those batches. Haul estimates use the caller's stack and trip limits. Stock-frontier installation consumes carpets in row order and halts at the first missing color.

In a loom draft the least significant bit lifts shaft 1. A lifted shaft exposes its warp color and a lowered shaft exposes the weft color of the current row. Opposing yarns of the same color appear as one visible color in a warp-float survey. A runner alignment of null denotes insufficient clearance. A null shearing estimate denotes a positive wool order with no sheep in that color. Patch junction offsets count blocks to the left of a join. Dye lots assume one matching dye and one blank wool make one colored wool. Blank wool and colored stock are separate inventories.

To use a textile layout in the [mural planner](PLANNING-MURAL.md), pass its width and flat color list. Subtract one from textile row and column positions to obtain mural coordinates. Mural treats zero as an ordinary color.
