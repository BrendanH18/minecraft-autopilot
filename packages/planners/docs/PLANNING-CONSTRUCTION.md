# Construction planners

Use `mc-agent scaffold-plan --help` and `mc-agent beacon-plan --help` to list
commands. Supply measurements in consistent units. Pass numeric lists as
comma-separated values and point or interval lists as quoted JSON arrays.
Command results are returned under `result`.
Supply `[]` for existing pads or opaque blocks when a survey found none.

## `scaffold-plan`

Temporary decks are rectangular unless the command explicitly measures a
linear run. Whole level and column counts describe a supplied layout. For
example, `mc-agent scaffold-plan frame-grid 9 5 4 5` gives two rows of four
supports with both endpoints supported on each axis.

| Command | Calculation |
| --- | --- |
| `column-bill <ground-levels> <deck-y> <blocks-per-level>` | Count support blocks under a fixed deck based on measured ground levels. |
| `frame-grid <length> <width> <max-length-span> <max-width-span>` | Size an endpoint-inclusive rectangular frame grid with independent span limits. |
| `brace-span-check <attachment-heights> <bay-widths> <maximum-brace-length>` | List one-based bays whose diagonal between adjacent attachment heights exceeds the available brace length. |
| `cantilever-coverage <support-columns> <reach>` | Find inclusive intervals reachable from the supplied support columns. |
| `unsupported-deck <first-column> <last-column> <support-columns> <reach>` | Count unsupported deck columns within a proposed run. |
| `stacked-decks <length> <width> <openings-by-level>` | Find total decking for equal-footprint levels with different openings. |
| `guardrail-gaps <side-lengths> <openings-by-side> <rows>` | Count guardrail blocks with a separate opening budget for each side. |
| `ladder-landings <rise> <maximum-flight> <landing-depth>` | Count ladder flights, interior landings, and their combined depth. |
| `ladder-extensions <installed-heights> <target-heights>` | Count extra ladder pieces at each access point without crediting excess elsewhere. |
| `deck-clearance <deck-levels> <undersides> <required-clearance>` | Report the one-based decks with insufficient vertical clearance. |
| `workface-reach <target-levels> <deck-levels> <reach-above-deck>` | Assign each target level to the highest usable deck at or below it, or null. |
| `mast-joins <column-heights> <section-height>` | Count joints between stacked mast sections, omitting the base joint. |
| `anchor-levels <bottom-y> <top-y> <maximum-gap>` | Space anchors from the bottom level through the top level, including both. |
| `tie-materials <anchor-counts> <wall-distances> <end-blocks>` | Count tie runs and end blocks for anchor banks with different wall distances. |
| `bay-brace-stock <braces-per-bay> <brace-lengths> <stock-length>` | Estimate stock pieces for each bay when every brace is cut as one piece. |
| `outrigger-footprint <length> <width> <left> <right> <front> <back>` | Measure the enlarged obstruction footprint with asymmetrical outrigger extensions. |
| `relocation-overlap <deck-length> <step> <moves>` | Compute distance served and unchecked gaps when a deck moves by fixed steps. |
| `recovered-modules <removed-by-type> <recovery-fractions>` | Estimate whole modules recovered by type, rounding losses independently. |
| `rolling-stock <staged-bays> <blocks-per-bay> <recovery> <relocations>` | Budget the initial build and top-ups when a single bay is dismantled and reinstalled each move. |
| `build-strip-time <placed> <removed> <place-rate> <remove-rate> <setup-time>` | Estimate setup, installation, and teardown time for one crew working in series. |
| `deck-crew <deck-blocks> <worker-rate> <deadline> <setup-per-worker>` | Size a parallel crew whose workers each lose setup time from the shared window. |
| `winch-hauls <demand-per-level> <haul-capacity> <ground-y> <deck-levels>` | Count separate loaded trips by deck and total loaded vertical travel. |
| `staggered-inspections <bay-count> <bays-per-round> <days-between-rounds>` | Count inspection rounds and the interval between successive inspections of the same bay. |
| `strike-order <deck-levels> <removable-levels>` | Identify the consecutive highest decks ready to come down, stopping at the first retained deck. |
| `missing-ground-pads <support-points> <pad-points>` | List distinct support points that still need a matching ground pad. |

## `beacon-plan`

Full square base layers widen by two blocks per tier below the top. Plan
beam columns using `[x,y,z]` rows. Horizontal service uses the larger of
the absolute X and Z differences in `[x,z]` rows. A site reaches a station
at exactly its supplied radius. For example,
`mc-agent beacon-plan tier-materials 3 4` budgets 164 blocks.
Supply a consistent time unit for uptime and service rotation.

| Command | Calculation |
| --- | --- |
| `tier-materials <top-width> <tiers>` | Count full square layers that widen by two blocks per tier, from top to bottom. |
| `highest-affordable-tier <top-width> <block-stock> <maximum-tiers>` | Find the highest tier build affordable with the given block stock. |
| `donation-shortfall <top-width> <tiers> <blocks-by-material> <ingots-by-material> <ingots-per-block>` | Use whole-block donations and convert each material separately before reporting the build shortfall. |
| `upgrade-reserve <top-width> <current-tiers> <target-tiers> <spare-fraction>` | Budget missing lower tiers plus a fractional spare allowance. |
| `rebuild-budget <old-top-width> <old-tiers> <new-top-width> <new-tiers> <recovery>` | Budget new blocks after reclaiming a fraction from a dismantled base. |
| `border-replacement <top-width> <tiers> <border-width>` | Count blocks in the perimeter bands across all layers, counting corners once. |
| `foundation-excavation <top-width> <tiers> <margin> <depth>` | Estimate excavation for the widest footprint and a margin on all sides. |
| `base-fit <available-width> <available-depth> <available-height> <top-width> <tiers>` | Report remaining clearances and fit for the base plus the beacon block. |
| `layer-levels <beacon-y> <floor-y> <tiers>` | List tier levels and count how many sit below the supplied build floor. |
| `beam-obstructions <beacons> <opaque-blocks>` | Find the nearest opaque block above each proposed beam in its exact column. |
| `beam-conflicts <beacons>` | Group one-based beacon indexes that share a vertical beam column. |
| `beam-windows <beacons> <ceiling-levels> <glass-thickness>` | List glass levels for one vertical window per beam, starting at the paired ceiling. |
| `glass-palette-stock <glass-by-color> <existing-by-color> <beams>` | Budget missing glass by color for beams that all use the same palette. |
| `beam-sleeve <levels> <inner-width> <wall-thickness> <access-voids>` | Count blocks around a square beam shaft after deducting access voids. |
| `service-uptime <active-intervals> <window-start> <window-end>` | Measure covered service time clipped to a window, counting overlapping intervals once. |
| `rotation-coverage <active-time> <recharge-time> <beacons>` | Estimate uncovered time per cycle when identical beacons take successive non-overlapping active slots. |
| `minimum-radius <site> <stations>` | Find the least square radius at one site that reaches every station. |
| `uncovered-stations <sites> <radii> <stations>` | List one-based stations outside all square service areas, with a radius per site. |
| `shared-stations <sites> <radius> <stations>` | List covered station indexes and their supporting sites when at least two sites reach them. |
| `backup-radius <sites> <stations>` | Find the least common square radius that lets two sites reach every station. |
| `station-assignment <sites> <radius> <stations>` | Assign each station to its closest site within range, breaking ties by input order. |
| `candidate-site <candidate-sites> <stations>` | Choose the first candidate that minimizes the radius needed to reach every station. |
| `coverage-columns <sites> <radius>` | Count unique integer columns inside the union of inclusive square service areas. |
| `upgrade-impact <sites> <current-radius> <new-radius> <stations>` | List one-based stations that gain service when all site radii expand. |
| `served-floors <beacon-y> <range-below> <range-above> <floor-levels>` | List one-based floors within the inclusive asymmetric vertical service window. |
