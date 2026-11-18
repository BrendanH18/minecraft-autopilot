# Map room, bookbinding and banner hall planners

For a signed list beginning with a minus sign, place `--` after the command name and before its arguments.

These 75 offline commands calculate from the dimensions, counts and designs you supply. Run `mc-agent <group> <command> <args...>` to print the result as JSON. Numeric lists are comma-separated. For an optional list, pass an empty shell argument (`''`). Each list accepts up to 1,000 entries. In the tables, `s`, `c` and `i` denote positive, nonnegative and signed integers. `S` and `C` denote nonempty lists of the corresponding integers, `l` is a list of signed numbers, and `indexes` allows an empty list.

## `maproom`

Supply the coordinate of the first block in tile zero as the grid origin. Tiles can extend west and north into negative coordinates. Block bounds are inclusive. Pixels and tile indices start at zero. Wall rows, columns and frame IDs start at one. For example, `mc-agent maproom tile-address -66 -64 128` locates tile -1 at offset 126.

| Command | Types | Calculation |
| --- | --- | --- |
| `scale-span <level>` | `c` | Report the side in blocks and the blocks per pixel of a square map. |
| `minimum-scale <width> <depth>` | `s,s` | Find the smallest scale whose side can contain both extents when freely positioned. |
| `tile-address <block> <grid-origin> <tile-side>` | `i,i,s` | Locate a block on one grid axis by signed tile index and zero-based local offset. |
| `tile-corners <tile-x> <tile-z> <origin-x> <origin-z> <side>` | `i,i,i,i,s` | Find inclusive block bounds for one tile on the supplied grid. |
| `region-tiles <west> <east> <north> <south> <origin-x> <origin-z> <side>` | `i,i,i,i,i,i,s` | Count the tiles touched by an inclusive block rectangle on a fixed grid. |
| `pixel-address <block> <tile-start> <level>` | `i,i,c` | Return the zero-based pixel on one axis within an identified tile. |
| `pixel-footprint <pixel> <tile-start> <level>` | `c,i,c` | Return inclusive block bounds along one axis for a pixel. |
| `wall-number <row> <column> <columns>` | `s,s,s` | Assign a one-based row-major frame number. |
| `wall-cell <frame> <columns>` | `s,s` | Locate a numbered frame on a row-major wall. |
| `survey-order <columns> <rows>` | `s,s` | List wall frame numbers in alternating eastbound and westbound survey rows. |
| `wall-border <columns> <rows> <thickness>` | `s,s,c` | Count backing blocks for a solid outer frame around a tiled wall. |
| `spare-frames <frames> <broken-ids>` | `s,indexes` | Count replacement frames from a damage report with repeated frame numbers. |
| `map-copies <editions> <owned>` | `C,C` | Budget blank maps for additional copies of each owned original. |
| `lock-supplies <display-counts> <already-locked>` | `C,C` | Count panes for individually locking each outstanding display map. |
| `zoom-stages <levels> <target>` | `C,c` | Count cartography table enlargement steps for maps moving to a shared target scale. |
| `atlas-pages <columns> <rows> <page-width> <page-height>` | `s,s,s,s` | Divide a rectangular atlas into rectangular print panels and count unused panel cells. |
| `seam-length <columns> <rows> <tile-side>` | `s,s,s` | Measure internal tile boundaries in blocks, counting each shared edge once. |
| `marker-clusters <offsets> <bucket-width>` | `l,s` | Count markers per occupied signed strip along a survey axis in ascending strip order. |
| `waypoint-pages <offsets> <origin> <side>` | `l,i,s` | List distinct map strips in order of first waypoint visit. |
| `missing-tiles <wall-size> <mounted-ids>` | `s,indexes` | List unmounted frame numbers in ascending order. |
| `refresh-queue <last-surveys> <today> <max-age>` | `C,c,c` | Return the oldest map numbers first among those older than the age limit. |
| `tile-overlap <a-start> <a-side> <b-start> <b-side>` | `i,s,i,s` | Measure overlap of two tile intervals in blocks along one axis. |
| `wall-extension <columns> <rows> <west> <east> <north> <south>` | `s,s,c,c,c,c` | Count new frames and find the old top-left frame number after extending the wall. |
| `survey-distance <columns> <rows> <x-spacing> <z-spacing>` | `s,s,s,s` | Measure blocks walked between tile centers on a serpentine pass. |
| `orientation-turns <mounted> <wanted> <positions>` | `C,C,s` | Count forward item-frame clicks per map on a cyclic orientation dial. |

## `bookbind`

Pages, chapters, shelves, slots and serials start at one. Page budgets and print mockups use your supplied limits. For example, `mc-agent bookbind volume-split 3,2,1,5 5` assigns chapters to volumes 1, 1, 2 and 3 in sequence.

| Command | Types | Calculation |
| --- | --- | --- |
| `chapter-starts <chapter-pages> <front-pages>` | `S,c` | Assign each chapter its first numbered page after the front matter. |
| `page-entry <chapter-pages> <page>` | `S,s` | Locate the chapter and local page of a page number. |
| `facing-starts <chapter-pages>` | `S` | Start every chapter on an odd page and count inserted blank pages. |
| `volume-split <chapter-pages> <limit>` | `S,s` | Pack whole chapters into consecutive volumes, starting a new volume when needed. |
| `continued-chapter <start-page> <length> <pages-per-volume>` | `s,s,s` | Locate the two endpoints of a chapter allowed to span volumes. |
| `paragraph-pages <lines> <page-height>` | `S,s` | Place unsplit paragraphs in order and report used lines on each page. |
| `contents-pages <chapters> <entries-per-page> <fixed-front-pages>` | `c,s,c` | Reserve numbered contents pages after fixed front matter and locate the first body page. |
| `index-hits <page-numbers>` | `S` | Deduplicate index references, sort them and compress adjacent pages into inclusive ranges. |
| `errata-volumes <page-numbers> <volume-pages>` | `S,S` | Identify volumes needing reissue for a list of corrected global page numbers. |
| `signature-folds <pages> <sheets-per-signature>` | `s,s` | Budget four numbered faces per folded sheet and full signatures for a print mockup. |
| `copy-materials <copies-by-title> <blank-books> <inks> <feathers>` | `C,c,c,c` | Budget one writable blank per requested extra copy using the supplied material stocks. |
| `edition-run <originals> <copies-per-operation> <orders>` | `c,s,C` | Count parallel copying rounds when each original supports one batch per round for the same title. |
| `print-priority <orders> <writable-blanks>` | `C,c` | Allocate writable blanks to title orders in order, allowing partial fulfillment. |
| `library-sets <stock-per-title> <copies-per-set>` | `C,S` | Count complete sets of titles and the remaining books after assembling them. |
| `shelf-labels <volumes-per-series> <shelf-width>` | `S,s` | Locate the first and last shelf for each contiguous series on a shared rack. |
| `chiseled-slot <book> <slots-per-shelf> <shelves-per-row>` | `s,s,s` | Address a one-based book number by rack row, shelf column and slot. |
| `lectern-signals <pages> <page>` | `s,s` | Estimate the lectern comparator signal for a specified page of a nonempty book. |
| `reading-clocks <pages-per-reader> <ticks-per-page> <start>` | `C,s,c` | Schedule successive readers sharing one lectern. |
| `copy-collation <observed-pages> <expected-count>` | `indexes,s` | Report the first out-of-order, missing or excess page in an observed sequence. |
| `revised-pagination <old-pages> <new-pages>` | `S,S` | Measure chapter start shifts and the total change in pages after revision. |
| `citation-remap <old-chapters> <new-chapters> <old-page>` | `S,C,s` | Map a citation by chapter and local page when pages are added or removed at chapter ends. |
| `serial-range <first> <run-sizes>` | `s,S` | Reserve consecutive inclusive copy serials per edition run. |
| `loan-balances <shelf-counts> <returns> <requests>` | `C,C,C` | Process returns then loans per title and report unfilled loans and stock left. |
| `folio-imposition <sheets> <sheet-number>` | `s,s` | Pair pages on both sides of a chosen nested folded sheet, numbering sheets from the outside. |
| `abridgement <chapter-pages> <required-pages> <target>` | `S,C,c` | Trim from the last chapters first while retaining each required minimum. |

## `bannerhall`

Use positive numeric IDs for dye colors, templates and designs. Supply pattern layers in bottom-to-top order. Wall positions and orientation offsets are zero-based unless the command specifies otherwise. Floor and top levels refer to occupied block coordinates. For example, `mc-agent bannerhall dye-budget 1,3,3 2 4,0,3` finds a shortage of one dye of color 3.

| Command | Types | Calculation |
| --- | --- | --- |
| `stripe-order <palette> <banners> <phase>` | `S,c,i` | Assign base colors by repeating a palette with a signed starting offset. |
| `mirror-wing <left-wing> <center-color>` | `S,s` | Build a symmetric hanging order around a central banner. |
| `symmetry-repairs <color-ids>` | `S` | List the one-based right-side positions to repaint to match the left wing. |
| `palette-totals <color-ids> <copies>` | `S,C` | Combine repeat orders by base wool color in first-seen order. |
| `material-cuts <colors-in-stock> <wool-per-banner> <sticks>` | `C,s,c` | Count craftable plain banners with color-separated wool and shared sticks. |
| `layer-capacity <existing-layers> <requested-layers> <limit>` | `C,C,s` | Find requested layer additions that fit on each banner and the rejected excess. |
| `layer-prefix <first-pattern> <second-pattern>` | `S,S` | Measure the common bottom-to-top prefix of two pattern recipes and the unique steps. |
| `wash-down <current-pattern> <target-prefix>` | `S,indexes` | Count top layers to remove to reach the specified lower-layer recipe, or null if impossible. |
| `dye-budget <layer-color-ids> <copies> <dye-stocks>` | `S,c,C` | Return remaining dye and shortages per numbered color for repeated recipe layers. |
| `motif-frequency <layer-ids> <motif>` | `S,S` | Count all contiguous motif matches in a recipe, including overlapping occurrences. |
| `palette-remap <layers> <old-ids> <new-ids>` | `S,S,S` | Substitute dye IDs in a layer sequence in a single pass. |
| `loom-load <layers-per-design> <orders> <ticks-per-layer>` | `C,C,s` | Budget total manual loom ticks for decorating every ordered banner separately. |
| `master-copy-savings <layers-per-design> <orders>` | `C,C` | Compare layering every banner with layering one master per ordered design and copying the rest. |
| `hanger-spacing <width> <edge-margin> <pitch>` | `s,c,s` | Place hangers from the left margin at a fixed pitch while preserving the right margin. |
| `center-line <wall-width> <banner-count> <gap>` | `s,s,c` | Center a row of single-block banners and leave an odd extra block on the right. |
| `door-clearance <positions> <door-start> <door-width> <margin>` | `C,c,s,c` | Report hanging positions encroaching on a door or its specified side clearance. |
| `paired-standards <left-colors> <right-colors>` | `S,S` | Count complete matching pairs across two unordered wings for each left-side color. |
| `height-profile <floor-levels> <top-level> <drop>` | `l,i,s` | Find clearance in blocks between floor tops and the lowest occupied hanging blocks. |
| `visibility-runs <visible-flags>` | `C` | Report consecutive runs of visible positions on a one-based banner wall. |
| `rotation-match <mounted-colors> <target-colors>` | `S,S` | Find the smallest left rotation of a cyclic display that reproduces the target order. |
| `batch-changeovers <design-order> <setup-ticks>` | `S,c` | Budget setup ticks for design switches after the first loom job. |
| `template-checkout <pattern-ids> <available-ids>` | `S,indexes` | List distinct missing reusable template IDs in recipe order. |
| `packing-stacks <design-ids> <quantities> <stack-limit>` | `S,C,s` | Count slots for stackable identical banners, consolidating repeated design IDs. |
| `replacement-plan <mounted-designs> <desired-designs> <spare-designs>` | `S,S,indexes` | Allocate removed banners and spare copies to mismatched positions, then list designs still needed. |
| `layer-diff <mounted-layers> <desired-layers>` | `indexes,indexes` | List one-based differing layer positions including added and removed layers. |
