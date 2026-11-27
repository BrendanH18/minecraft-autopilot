# Pixel mural planning

Build and audit block-art panels using a width and comma-separated material IDs in row-major order. For example, `mc-agent mural turn-right 3 1,1,0,0,2,1` returns a two-column mural with pixels `[0,1,2,1,1,0]`. Material zero is an ordinary color unless you select it as ground or transparency. All coordinates and pixel indexes start at zero in the top left. Raster outputs carry their width and height. Inputs and outputs support up to 1,000 pixels each.

Every command takes `<width> <pixels>` immediately after its name. The table shows the remaining arguments. Colors in reports follow first encounter order. Patches use four-way adjacency.

Use `--` after the command name when passing signed offsets. For example, `mc-agent mural shift-art -- 2 1,2 -1 0 0` moves the artwork one column left and fills the exposed cell with zero, yielding `[2,0]`.

| Command | Extra arguments | Result |
| --- | --- | --- |
| `turn-right` | — | Rotate the mural clockwise by a quarter turn. |
| `mirror-proof` | — | Preview the reverse face of a freestanding mural. |
| `cut-panel` | `<x>` `<y>` `<columns>` `<rows>` | Extract a rectangular panel starting at zero-based coordinates. |
| `magnify` | `<factor>` | Enlarge each pixel to a square of blocks. |
| `repeat-field` | `<across>` `<down>` | Tile the motif across a larger field. |
| `mat-border` | `<thickness>` `<color>` | Surround the art with a solid mat. |
| `trim-ground` | `<ground>` | Crop background-only margins, returning null for blank art. |
| `stencil-overlay` | `<stencil-width>` `<stencil>` `<left>` `<top>` `<transparent>` | Stamp a clipped stencil, skipping its transparent color. |
| `flood-recolor` | `<x>` `<y>` `<color>` | Replace the connected patch containing a chosen pixel. |
| `patch-census` | — | List each connected patch with color, first pixel index and area. |
| `outline-mask` | `<ground>` | Mark foreground pixels touching ground or the exterior. |
| `color-seams` | — | Count shared edges between each distinct pair of colors. |
| `layer-stencil` | `<color>` | Produce a placement mask for one material. |
| `repair-list` | `<installed>` | List zero-based coordinates and target colors of mismatched blocks. |
| `row-runs` | `<row>` | Read a row as consecutive same-material placement runs. |
| `color-bounds` | `<color>` | Find the inclusive bounding box for a material. |
| `snake-loadout` | — | Order placement materials along alternating row directions. |
| `coarsen` | `<factor>` | Choose the most common color in each clipped square, with first-seen ties. |
| `relief-layers` | `<heights>` | Translate indexed colors into column heights and total fill blocks. |
| `half-turn-errors` | — | List opposed pixel index pairs that break half-turn symmetry. |
| `panel-palette` | `<panel-width>` `<panel-height>` | List the materials required in each clipped panel in reading order. |
| `shift-art` | `<dx>` `<dy>` `<ground>` | Move art inside its frame, filling exposed cells. |
| `dither-mix` | `<first>` `<second>` `<target>` | Split one material into two alternating checkerboard shades. |
| `registration-marks` | `<ground>` | Locate the first and last inked pixel on each row. |
| `palette-kits` | `<stack-size>` | Pack each mural material into full stacks and loose blocks. |

To use a mural in the [textile planner](PLANNING-TEXTILES.md), pass the width and flat pixel list, map design colors to IDs 1–16, and add one to both coordinates.
