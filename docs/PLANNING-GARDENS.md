# Orchard and greenhouse planning

For a signed list beginning with a minus sign, place `--` after the command name and before its arguments.

These commands calculate from your supplied layout and harvest assumptions. Each command prints JSON. Distances and dimensions are in blocks. Count crops, trees, materials and work in whole units. Parallel lists use the same row or variety order.

For example, `mc-agent orchardplan quota-cut 2,5,3 3,4,5 13` selects two trees in each of the first two rows for 14 logs. `mc-agent greenhouse channel-stripes 12 2` places water at columns 3, 8 and 12.

Input codes are `c` for nonnegative integers, `s` for positive integers and `i` for signed integers. `C` and `S` denote comma-separated lists of counts and positive sizes. The `lamp-drop` bed elevations (`l`) are comma-separated signed integers. Each list is limited to 1,000 entries.

## `orchardplan`

| Command | Types | Calculation |
| --- | --- | --- |
| `planting-grid <length> <width> <end-margin> <side-margin> <tree-pitch> <row-pitch>` | `s,s,c,c,s,s` | Count trunk centers on a rectangular grid with clear borders. |
| `staggered-sites <length> <rows> <pitch> <alternate-offset>` | `s,c,s,c` | Count sites when every second row starts farther along the plot. |
| `canopy-gaps <centers> <radii>` | `C,C` | Find signed clearance between neighboring inclusive canopy intervals along one row. |
| `headland-extension <sites> <pitch> <end-margin> <available>` | `s,s,c,c` | Budget extra row length for a target planting and two headlands. |
| `underplant-strips <row-gaps> <clearance> <bed-width>` | `C,c,s` | Fit whole understory beds in each inter-row gap after two buffers. |
| `trunk-guards <trunk-widths> <clearance> <gates>` | `S,c,C` | Count square guard rings with the specified gate openings removed. |
| `boundary-posts <length> <width> <max-span>` | `s,s,s` | Count distinct corner and intermediate posts around a rectangular plot. |
| `tree-address <row-counts> <label>` | `C,s` | Locate a one-based tree label on a serpentine walk counting columns from the same end. |
| `replant-stock <empty-sites> <saplings-per-site> <stocks>` | `C,S,C` | Allocate species-specific saplings to complete planting sites. |
| `nursery-release <stocks> <reserve> <bundle>` | `C,C,s` | Release complete bundles per species while protecting nursery stock. |
| `thin-row <sites> <keep-every> <first-kept>` | `c,s,s` | Mark one-based planting positions to retain in a regular thinning pass. |
| `stocktake <planned> <standing> <stumps>` | `C,C,C` | Reconcile planted rows and classify missing and cleared sites. |
| `rotation-rows <row-count> <cohorts> <round>` | `s,s,s` | List the rows assigned to a repeating one-cohort harvest round. |
| `rest-window <last-cut> <rest> <now>` | `C,S,c` | Find remaining rest time per row after its previous cut. |
| `log-forecast <trees> <logs-per-tree> <standing-reserve>` | `C,C,C` | Estimate harvestable logs while retaining a specified number of trees per row. |
| `quota-cut <trees> <logs-per-tree> <target>` | `C,S,c` | Select whole trees in row order until the log target is reached. |
| `axe-budget <log-counts> <tool-durabilities> <reserve-per-tool>` | `C,C,c` | Compare planned log breaks with usable durability across the tool kit. |
| `unload-rows <row-yields> <carry>` | `C,s` | Unload before a row when its entire yield would exceed remaining capacity. |
| `collection-distance <row-lengths> <crossings>` | `S,C` | Measure a serpentine walk including approach and the distance entering each later row. |
| `ladder-allocation <trunk-heights> <reach> <stock>` | `S,c,c` | Assign ladders in order to whole trunks whose tops exceed unaided reach. |
| `harvest-priority <ready-logs> <work-ticks>` | `C,S` | Rank rows by expected logs per work tick with ties in row order. |
| `deadwood-run <failed> <minimum>` | `C,s` | Find consecutive runs of failed planting sites meeting a removal threshold. |
| `reserve-splits <logs> <keep-logs> <planks-per-log> <plank-quota>` | `c,c,s,c` | Split the fewest available logs toward a plank quota while protecting raw logs. |
| `harvest-waves <row-work> <shift>` | `C,s` | Pack contiguous whole row jobs into shifts without interrupting a row. |
| `sapling-ledger <initial> <received> <planted>` | `c,C,C` | Track sapling stock and unfilled planting requests over successive rounds. |

## `greenhouse`

| Command | Types | Calculation |
| --- | --- | --- |
| `wall-glazing <width> <length> <height> <openings>` | `s,s,s,c` | Count rectangular shell wall blocks, counting corners once and subtracting openings. |
| `gable-infill <base-width> <step-inset> <ends>` | `s,s,s` | Count solid stepped gable infill including the full bottom course on each end. |
| `ridge-roof <half-run> <length> <end-overhang>` | `s,s,c` | Count one covering block per horizontal column on either side and along a single ridge. |
| `frame-stations <length> <max-bay>` | `s,s` | Place end frames and intermediate frames at maximum pitch with a shorter final bay. |
| `frame-infill <post-centers> <sill-y> <eave-y>` | `C,i,i` | Count infill between consecutive one-block posts and strictly between sill and eave. |
| `door-clearance <opening-widths> <opening-heights> <load-width> <load-height>` | `C,C,s,s` | List entrances that pass a rectangular load at its supplied orientation. |
| `bed-cross-section <interior-width> <wall-gap> <bed-width> <aisle>` | `s,c,s,s` | Fit equal raised beds across the interior with an aisle between neighbors. |
| `bench-levels <clear-height> <first-deck> <crop-clearance> <deck-thickness>` | `s,c,s,s` | Count complete growing tiers above a bottom offset including deck thickness and headroom on every tier. |
| `planter-fill <inner-lengths> <inner-widths> <soil-depths>` | `S,S,C` | Budget soil fill for each rectangular planter and the full greenhouse. |
| `bed-edging <outer-length> <outer-width> <wall-thickness> <courses>` | `s,s,s,s` | Count edging material around an open rectangular bed for a specified number of courses. |
| `channel-stripes <width> <reach>` | `s,c` | Place the fewest water columns so every floor column lies within the supplied horizontal reach. |
| `channel-crossings <channel-widths> <walkway-widths>` | `S,S` | Budget deck blocks for disjoint rectangular walkways crossing each channel. |
| `water-service <row-lengths> <sources> <reach>` | `S,C,c` | Count uncovered cells on each row served by a single one-based source, using zero for no source. |
| `lamp-drop <ceiling-y> <bed-heights> <clearances>` | `i,l,C` | Find chain lengths from the ceiling to lamps with requested air gaps over beds. |
| `shade-panels <row-lengths> <shaded-prefixes> <panel-width>` | `S,C,s` | Budget whole shade panels for each requested row prefix and report extra covered cells within the row. |
| `vent-spacing <wall-width> <solid-margin> <vent-width> <min-gap>` | `s,c,s,c` | Fit full vents and calculate the remaining solid wall width. |
| `glass-orders <missing-panes> <panes-per-craft> <glass-per-craft> <glass-stock>` | `c,s,s,c` | Budget whole pane crafts and glass purchases for a repair order. |
| `seed-trays <seed-stocks> <cells-per-tray> <seeds-per-cell>` | `C,s,S` | Count full trays, partial cells planted and unused seeds separately by variety. |
| `transplant-order <ready-seedlings> <bed-capacities>` | `C,C` | Move seedlings in variety order into consecutive beds, allowing shared beds. |
| `cycle-calendar <sow-days> <grow-days> <reset-days>` | `C,S,C` | Find first harvest and next sowing days for independent beds. |
| `crop-turns <first-ready> <regrow> <closing-day>` | `C,S,c` | Count harvests through an inclusive closing day for regrowing crops. |
| `crop-changeover <old-varieties> <new-varieties> <bed-cells>` | `S,S,C` | Identify beds switching crop and total cells requiring replanting. |
| `compost-runs <surplus> <keep> <items-per-run> <yield-per-run>` | `C,C,s,c` | Pool interchangeable surplus after per-bin reserves and budget complete compost runs at supplied yields. |
| `picking-window <ready-days> <last-days> <visit-day>` | `C,C,c` | Classify each crop lot as waiting, pickable, or overdue on the visit day. |
| `aisle-cart <widths> <cart-width> <side-clearance>` | `S,s,c` | Report the smallest widening per aisle needed to carry a cart with two side clearances. |

Tree labels, bed IDs, row numbers and channel columns start at one. Frame stations are offsets from the first end of the structure and start at zero. Negative canopy gaps count overlapping blocks. The first crossing distance in a collection walk is the approach to the first row. Harvest yields, reach, growth periods and conversion rates are explicit assumptions for the plan.
