# Spatial planning additions

These 250 commands run offline, print JSON `{result,note}`, and never connect to
Minecraft, acquire a control lease, call a model, or write their inputs.
Use `mc-agent GROUP --help` for the full command list. Quote JSON arguments.

All scalar inputs are finite and within ±1,000,000; lengths and dimensions marked
positive reject zero. Cell dimensions/counts and indices are whole numbers.
CSV lists and JSON point arrays contain 1–1000 entries; generated sequences and
voxel sets are limited to 1000 entries. Integer count rounding uses the existing
roundoff policy adjacent to a nonzero integer. Geometric calculations are ideal
continuous geometry unless their description explicitly counts cells.

Vector, symmetry, and landmark point arrays are JSON `[x,y,z]` rows; landmark
bearing intersections use `[x,z]` rows. Voxel arrays require integer coordinates.
Paired vector lists must have equal length; single axes, origins, and centers
are one-row arrays. Indices are zero-based. Angles use degrees. Numeric equality
can include a supplied absolute tolerance; zero tolerance means exact equality.

## vector

Offline continuous 3D vector calculations. Coordinates use [x,y,z]; directions and projections do not establish navigability. Zero directions are rejected where a direction is required.

| # | Command | Behavior |
| --- | --- | --- |
| 1 | `add <a> <b>` | Add corresponding vectors. |
| 2 | `subtract <a> <b>` | Subtract corresponding vectors. |
| 3 | `scale <vectors> <factor>` | Scale vectors by a signed factor. |
| 4 | `dot <a> <b>` | Compute paired scalar products. |
| 5 | `cross <a> <b>` | Compute paired right-handed vector products. |
| 6 | `length <vectors>` | Measure vector magnitudes. |
| 7 | `normalize <vectors>` | Normalize nonzero directions. |
| 8 | `project <vectors> <axis>` | Project vectors onto one nonzero axis. |
| 9 | `reject <vectors> <axis>` | Remove components along one nonzero axis. |
| 10 | `angle <a> <b>` | Measure paired unsigned angles in degrees. |
| 11 | `interpolate <a> <b> <fraction>` | Interpolate paired endpoints. |
| 12 | `component-product <a> <b>` | Multiply paired vector components. |
| 13 | `component-min <a> <b>` | Take paired component minima. |
| 14 | `component-max <a> <b>` | Take paired component maxima. |
| 15 | `cap-length <vectors> <maximum>` | Cap magnitudes without changing directions. |
| 16 | `reflect <vectors> <normal>` | Reflect directions across a plane through the origin. |
| 17 | `plane-distance <points> <normal> <offset>` | Signed distance to unit-normal plane n dot p = offset. |
| 18 | `plane-project <points> <normal> <offset>` | Project points to unit-normal plane n dot p = offset. |
| 19 | `triangle-normal <vertices>` | Unit normal of exactly three noncollinear vertices. |
| 20 | `triangle-area <vertices>` | Continuous area of exactly three vertices. |
| 21 | `tetra-volume <vertices>` | Unsigned volume of exactly four vertices. |
| 22 | `triple-product <vectors>` | Signed scalar triple product of exactly three vectors. |
| 23 | `parallel <a> <b> <tolerance>` | Test paired nonzero directions by sine-angle tolerance. |
| 24 | `orthogonal <a> <b> <tolerance>` | Test paired nonzero directions by absolute cosine tolerance. |
| 25 | `elevation <vectors>` | Compute signed elevation above the X/Z plane in degrees. |

Example: `mc-agent vector add '[[1,2,3]]' '[[4,5,6]]'`

Result: `[[5,7,9]]`.

## voxel

Offline sets of integer [x,y,z] cells. Duplicate cells collapse; faces use six orthogonal neighbors. Growth and enumeration are limited to 1000 cells; no world blocks are inspected.

| # | Command | Behavior |
| --- | --- | --- |
| 1 | `unique <cells>` | Canonicalize duplicate integer cells. |
| 2 | `union <a> <b>` | Union two occupied cell sets. |
| 3 | `intersection <a> <b>` | Keep cells shared by both sets. |
| 4 | `difference <a> <b>` | Remove cells present in the second set. |
| 5 | `exclusive <a> <b>` | Keep cells present in exactly one set. |
| 6 | `face-count <cells>` | Count faces adjacent to unoccupied cells. |
| 7 | `internal-faces <cells>` | Count shared face pairs once. |
| 8 | `bounds-volume <cells>` | Count cells in the inclusive bounding cuboid. |
| 9 | `fill-fraction <cells>` | Occupied fraction of inclusive bounding cuboid. |
| 10 | `components <cells>` | Partition cells into six-neighbor connected components. |
| 11 | `neighbor-counts <cells>` | Count occupied orthogonal neighbors for each canonical cell. |
| 12 | `boundary-cells <cells>` | Select occupied cells with any exposed face. |
| 13 | `layer-counts <cells>` | Count occupied cells by ascending Y layer. |
| 14 | `column-counts <cells>` | Count occupied cells by X/Z column. |
| 15 | `bottom-cells <cells>` | Select cells with no occupied neighbor immediately below. |
| 16 | `centroid <cells>` | Mean center of unique occupied cells. |
| 17 | `dilate <cells>` | Add all six-neighbor cells by one Manhattan step. |
| 18 | `erode <cells>` | Keep cells surrounded on all six faces. |
| 19 | `translate <cells> <dx> <dy> <dz>` | Translate integer occupied cells. |
| 20 | `top-cells <cells>` | Select cells with no occupied neighbor immediately above. |
| 21 | `slice-y <cells> <y>` | Extract one horizontal integer layer. |
| 22 | `clip-box <cells> <corners>` | Clip cells to two ordered inclusive cuboid corners. |
| 23 | `fill-box <corners>` | Enumerate all integer cells between two ordered corners. |
| 24 | `overlap-fraction <a> <b>` | Compute intersection over union for occupied sets. |
| 25 | `disconnected-count <cells>` | Count cells outside the largest six-neighbor component. |

Example: `mc-agent voxel unique '[[0,0,0],[0,0,0],[1,0,0]]'`

Result: `[[0,0,0],[1,0,0]]`.

## tunnel

Offline rectangular tunnel takeoffs. Width/height are clear interior cell dimensions, wall thickness is explicit, length counts cross-section slices. Openings and terrain are not observed; these quantities do not execute mining or building.

| # | Command | Behavior |
| --- | --- | --- |
| 1 | `excavate <width> <height> <length>` | Count clear rectangular excavation cells. |
| 2 | `lining <width> <height> <length> <thickness>` | Count complete outer rectangular lining excluding end caps. |
| 3 | `floor-strip <width> <length> <thickness>` | Count floor material under clear width. |
| 4 | `ceiling-strip <width> <length> <overhang>` | Count one-cell ceiling including side overhang. |
| 5 | `sidewalls <height> <length> <thickness>` | Count two straight sidewalls excluding floor and ceiling. |
| 6 | `portal-ring <width> <height> <thickness>` | Count lining in one portal cross section. |
| 7 | `end-caps <width> <height> <thickness> <caps>` | Count solid clear-opening closure cells. |
| 8 | `cross-section <width> <height> <thickness>` | Report outer cross-section dimensions. |
| 9 | `support-count <length> <spacing>` | Count endpoint-inclusive support frames. |
| 10 | `support-positions <length> <spacing>` | List endpoint-inclusive support slice indices. |
| 11 | `support-material <width> <height> <frames>` | Count U-shaped one-cell frames: two posts plus header. |
| 12 | `clear-width <outer-width> <lining>` | Subtract two lining widths and reject blocked interiors. |
| 13 | `clear-height <outer-height> <floor> <ceiling>` | Subtract floor and ceiling from outer height. |
| 14 | `parallel-bores <bores> <width> <separation>` | Compute total clear-bore and separator width. |
| 15 | `cross-passages <length> <spacing> <bores> <separation> <height>` | Count excavation in internal cross passages at regular nonendpoint stations. |
| 16 | `drain <length> <width> <depth>` | Count cells in a rectangular below-floor drain. |
| 17 | `walkway-share <width> <walkways> <walkway-width>` | Compute remaining clear travel width after side walkways. |
| 18 | `grade-rise <length> <rise-per-slice>` | Compute supplied linear elevation change. |
| 19 | `ramp-slices <rise> <maximum-rise>` | Round required horizontal slices for supplied grade limit. |
| 20 | `headroom <ceiling-y> <floor-y> <required>` | Report signed continuous headroom margin. |
| 21 | `haul-work <slice-volume> <length>` | Sum cell-distance hauling to entry from slice centers. |
| 22 | `two-end-haul <slice-volume> <length>` | Sum integer-slice hauling to nearest endpoint. |
| 23 | `spoil-trips <volume> <capacity>` | Round up trips for supplied spoil carrying capacity. |
| 24 | `progress <completed-slices> <length>` | Report tunnel completion fraction and uncut slices. |
| 25 | `work-window <length> <slices-per-minute> <setup-minutes>` | Estimate active excavation minutes plus one setup. |

Example: `mc-agent tunnel excavate 3 4 5`

Result: `60`.

## bridgeplan

Offline bridge layout and material estimates from caller dimensions. Span partitions and loads are arithmetic only and establish neither structural stability nor in-game build feasibility. No blocks are placed.

| # | Command | Behavior |
| --- | --- | --- |
| 1 | `deck-cells <length> <width> <thickness>` | Count a rectangular deck. |
| 2 | `abutment-cells <width> <height> <depth>` | Count two solid rectangular abutments. |
| 3 | `span-count <distance> <maximum-span>` | Round a continuous gap into bounded spans. |
| 4 | `equal-spans <distance> <maximum-span>` | List equalized spans that satisfy the supplied maximum. |
| 5 | `pier-count <spans>` | Count internal piers between endpoint supports. |
| 6 | `pier-stations <distance> <spans>` | List internal equally spaced pier chainages. |
| 7 | `pier-volume <heights> <width> <depth>` | Sum rectangular pier volumes from supplied heights. |
| 8 | `rail-cells <length> <rail-height> <sides>` | Count solid side railing cells excluding end returns. |
| 9 | `post-count <length> <spacing> <sides>` | Count endpoint-inclusive posts along selected sides. |
| 10 | `post-volume <length> <spacing> <height> <sides>` | Count one-cell vertical post columns. |
| 11 | `underbeam <length> <beams> <depth>` | Count continuous one-cell-wide underdeck beams. |
| 12 | `crossbeams <length> <spacing> <width>` | Count one-cell transverse beams at endpoint-inclusive stations. |
| 13 | `clearance <deck-bottom> <highest-obstacle> <minimum>` | Report signed vertical clearance margin. |
| 14 | `approach-length <deck-y> <ground-y> <maximum-grade>` | Estimate minimum continuous approach run. |
| 15 | `approach-fill <width> <run> <rise>` | Estimate triangular-prism approach fill. |
| 16 | `deck-slope <start-y> <end-y> <run>` | Compute signed deck rise per horizontal unit. |
| 17 | `sloped-length <run> <rise>` | Compute continuous sloped deck length. |
| 18 | `expansion-gaps <length> <section-length> <gap>` | Count internal expansion joints and aggregate gap width. |
| 19 | `deck-panels <length> <width> <panel-length> <panel-width>` | Count axis-aligned rectangular panels with edge trimming. |
| 20 | `panel-waste <length> <width> <panel-length> <panel-width>` | Compute purchased panel area beyond deck area. |
| 21 | `tributary-load <spans> <load-per-length>` | Allocate uniform span loads to adjacent supports by halves. |
| 22 | `load-total <length> <width> <load-per-area>` | Multiply supplied uniform surface load by area. |
| 23 | `cantilever-share <overhang> <supported-length>` | Compute overhang fraction of total longitudinal extent. |
| 24 | `material-reserve <deck> <supports> <reserve-fraction>` | Add rounded reserve to explicit deck and support counts. |
| 25 | `build-hours <cells> <cells-per-hour> <mobilization>` | Estimate placement hours plus one mobilization for nonempty work. |

Example: `mc-agent bridgeplan deck-cells 10 3 2`

Result: `60`.

## roofplan

Offline continuous roof takeoffs unless a command explicitly says cells. Width and length include only caller-supplied extents; no placement, weather, collision, recipe, or structural behavior is assumed.

| # | Command | Behavior |
| --- | --- | --- |
| 1 | `gable-rise <width> <pitch>` | Rise of a centered gable with supplied rise/run pitch. |
| 2 | `gable-rafter <width> <rise>` | Length from eave to centered ridge. |
| 3 | `gable-surface <width> <length> <rise>` | Combined area of two gable roof planes. |
| 4 | `gable-end <width> <rise>` | Area of one triangular gable wall. |
| 5 | `gable-volume <width> <length> <rise>` | Enclosed triangular-prism attic volume. |
| 6 | `shed-surface <width> <length> <rise>` | Area of one rectangular sloping shed plane. |
| 7 | `shed-volume <width> <length> <low-height> <rise>` | Volume below a shed roof above a flat datum. |
| 8 | `hip-ridge <width> <length>` | Equal-pitch hip roof ridge length with length at least width. |
| 9 | `hip-surface <width> <length> <rise>` | Surface area of equal-pitch hip roof on a rectangle. |
| 10 | `pyramid-surface <side> <rise>` | Lateral surface area of a square pyramid roof. |
| 11 | `pyramid-volume <side> <rise>` | Volume under a square pyramid roof. |
| 12 | `overhang-footprint <width> <length> <overhang>` | Projected footprint including equal overhang on all sides. |
| 13 | `eave-length <width> <length>` | Total horizontal eave perimeter. |
| 14 | `ridge-cap <ridge-length> <unit-length>` | Round ridge length to whole cap units. |
| 15 | `tile-order <surface-area> <coverage> <waste>` | Round supplied net coverage and waste into whole tiles. |
| 16 | `course-count <slope-length> <exposure>` | Round slope length to exposed tile courses. |
| 17 | `course-overlap <tile-length> <exposure>` | Compute longitudinal overlap between adjacent courses. |
| 18 | `batten-length <ridge-length> <courses> <sides>` | Sum continuous battens along each roof course. |
| 19 | `rafter-count <length> <spacing> <sides>` | Count endpoint-inclusive rafters along selected roof sides. |
| 20 | `rafter-stock <width> <rise> <count>` | Sum stock length for equal gable half-span rafters. |
| 21 | `gutter-fall <length> <gradient>` | Vertical fall for supplied gutter gradient. |
| 22 | `outlet-count <area> <area-per-outlet>` | Round projected catchment area into outlets using supplied capacity. |
| 23 | `rain-volume <projected-area> <rain-depth> <capture-fraction>` | Ideal captured volume from matching area/depth units. |
| 24 | `stepped-profile <half-width> <rise>` | List floor-rounded gable heights from eave through ridge. |
| 25 | `attic-clear-width <width> <rise> <required-height>` | Width with sufficient headroom under a centered triangular gable. |

Example: `mc-agent roofplan gable-rise 8 0.5`

Result: `2`.

## facade

Offline wall and opening layouts. Coordinates are continuous wall-local [horizontal,vertical]; counts use explicit dimensions. Openings must fit where documented; layouts are never placed in Minecraft.

| # | Command | Behavior |
| --- | --- | --- |
| 1 | `opening-area <widths> <heights>` | Sum rectangular opening areas. |
| 2 | `net-wall <width> <height> <opening-area>` | Subtract explicit total opening area, rejecting excess. |
| 3 | `window-columns <wall-width> <margin> <window-width> <gap>` | Maximum equally gapped windows between margins. |
| 4 | `window-rows <wall-height> <sill> <head-margin> <window-height> <gap>` | Maximum rows above a sill and below a head margin. |
| 5 | `centered-start <wall-width> <count> <opening-width> <gap>` | Left offset for a centered row of openings. |
| 6 | `equal-gaps <wall-width> <count> <opening-width>` | Equal gaps including both wall ends. |
| 7 | `window-centers <start> <count> <width> <gap> <sill> <height>` | List center coordinates of a horizontal window row. |
| 8 | `frame-perimeter <width> <height> <count>` | Total continuous frame centerline perimeter. |
| 9 | `frame-ring <width> <height> <thickness> <count>` | Area of outer frame rings around clear openings. |
| 10 | `sill-stock <width> <overhang> <count>` | Total sill length including both side overhangs. |
| 11 | `lintel-order <width> <bearing> <count> <stock-length>` | Order whole unjoined lintel members cut from supplied stock lengths. |
| 12 | `mullion-stock <height> <divisions> <windows>` | Vertical mullion length for equal panes per window. |
| 13 | `transom-stock <width> <rows> <windows>` | Horizontal transom length for equal pane rows. |
| 14 | `pane-size <width> <height> <columns> <rows> <bar-width>` | Clear pane dimensions after internal bars. |
| 15 | `glazing-fraction <wall-area> <glazed-area>` | Compute wall glazing fraction, rejecting excess. |
| 16 | `pier-minimum <wall-width> <openings> <opening-width> <minimum>` | Check equal solid pier widths against a supplied minimum. |
| 17 | `bay-width <wall-width> <bays>` | Compute equal facade bay width. |
| 18 | `bay-boundaries <wall-width> <bays>` | List local equal bay divider coordinates. |
| 19 | `story-datums <base-y> <story-heights>` | List base and cumulative story elevations. |
| 20 | `spandrel-height <story-height> <sill-height> <window-height>` | Compute remaining height above a window in one story. |
| 21 | `cladding-panels <width> <height> <panel-width> <panel-height>` | Count axis-aligned cladding panels with edge cutting. |
| 22 | `joint-length <columns> <rows> <panel-width> <panel-height>` | Total internal panel seam length on an untrimmed rectangular array. |
| 23 | `reveal-area <width> <height> <depth> <count>` | Area of four internal reveals around clear openings. |
| 24 | `door-threshold <door-widths> <depth>` | Total threshold surface area for supplied doors. |
| 25 | `accent-band <perimeter> <band-height> <bands>` | Surface area of supplied horizontal accent bands. |

Example: `mc-agent facade opening-area '2,3' '4,2'`

Result: `14`.

## spiral

Offline ideal polar spirals and helices. Angles are degrees; radial growth is supplied units per full revolution. Samples are bounded to 1000 points and are geometric layouts, never routes proven traversable.

| # | Command | Behavior |
| --- | --- | --- |
| 1 | `arch-radius <initial> <growth> <turns>` | Radius after a supplied number of Archimedean turns. |
| 2 | `arch-point <initial> <growth> <turns>` | X/Z coordinate at a nonnegative Archimedean turn. |
| 3 | `arch-samples <initial> <growth> <turns> <segments>` | Endpoint-inclusive samples of an Archimedean spiral. |
| 4 | `turn-spacing <growth>` | Absolute radial spacing between full revolutions. |
| 5 | `turns-to-radius <initial> <target> <growth>` | Solve outward or inward spiral turns to a radius. |
| 6 | `annulus-area <inner> <outer>` | Area swept between inner and outer spiral radii. |
| 7 | `helix-rise <turns> <pitch>` | Signed height after supplied helix turns. |
| 8 | `helix-turns <rise> <pitch>` | Solve nonnegative turn count for a signed pitch. |
| 9 | `helix-length <radius> <pitch> <turns>` | Continuous constant-radius helix arc length. |
| 10 | `helix-grade <radius> <pitch>` | Signed rise divided by horizontal circumference. |
| 11 | `helix-point <radius> <pitch> <turns>` | X/Y/Z coordinate on a constant-radius helix. |
| 12 | `helix-samples <radius> <pitch> <turns> <segments>` | Endpoint-inclusive helix coordinate samples. |
| 13 | `helix-step-angle <steps-per-turn>` | Angular advance of equal subdivisions. |
| 14 | `helix-step-rise <pitch> <steps-per-turn>` | Vertical advance per equal subdivision. |
| 15 | `helix-step-chord <radius> <pitch> <steps-per-turn>` | Straight 3D chord length between adjacent equal subdivisions. |
| 16 | `headroom-pitch <clear-height> <deck-thickness>` | Minimum turn pitch from supplied vertical clearances. |
| 17 | `headroom-margin <pitch> <deck-thickness> <required>` | Signed vertical separation margin between stacked turns. |
| 18 | `inner-radius <outer-radius> <walk-width>` | Compute remaining central void radius. |
| 19 | `walking-radius <inner-radius> <width> <fraction>` | Radius of a supplied position across a spiral walkway. |
| 20 | `ring-deck-area <inner-radius> <width> <turns>` | Horizontal annulus area repeated per turn, ignoring slope. |
| 21 | `post-angles <posts> <offset>` | Even angular positions around one turn. |
| 22 | `rise-stations <total-rise> <maximum-step>` | Count equal-rise subdivisions for a target ascent. |
| 23 | `angular-speed <turns-per-minute>` | Convert turns per minute to degrees per second. |
| 24 | `helix-travel <radius> <pitch> <turns> <speed>` | Ideal travel time along a continuous helix. |
| 25 | `radial-clearance <growth> <corridor-width>` | Signed radial margin between adjacent full spiral turns. |

Example: `mc-agent spiral arch-radius 2 3 4`

Result: `14`.

## symmetry

Offline 3D reflection, rotation, orbits, and symmetry checks on supplied points. Equality checks use supplied absolute tolerance; no collision, block legality, or world state is evaluated.

| # | Command | Behavior |
| --- | --- | --- |
| 1 | `mirror-x <points> <plane-x>` | Reflect points across x = plane-x. |
| 2 | `mirror-y <points> <plane-y>` | Reflect points across y = plane-y. |
| 3 | `mirror-z <points> <plane-z>` | Reflect points across z = plane-z. |
| 4 | `invert <points> <center>` | Point reflection about one center. |
| 5 | `quarter-y <points>` | Rotate positive ninety degrees about Y. |
| 6 | `quarter-x <points>` | Rotate positive ninety degrees about X. |
| 7 | `quarter-z <points>` | Rotate positive ninety degrees about Z. |
| 8 | `swap-xy <points>` | Reflect across diagonal plane x = y. |
| 9 | `swap-xz <points>` | Reflect across diagonal plane x = z. |
| 10 | `swap-yz <points>` | Reflect across diagonal plane y = z. |
| 11 | `orbit-four <point>` | Fourfold Y-axis orbit of one point. |
| 12 | `orbit-eight <point>` | Distinct sign-reflection orbit across all origin planes. |
| 13 | `radial-orbit <point> <copies>` | Equally rotated copies about Y including original. |
| 14 | `screw-orbit <point> <copies> <angle> <rise>` | Repeated Y-axis rotation combined with vertical translation. |
| 15 | `glide-x <points> <plane-x> <dy> <dz>` | Reflect across an X-plane then translate within that plane. |
| 16 | `rotate-y <points> <degrees>` | Rotate point list around Y through origin. |
| 17 | `x-symmetric <points> <plane-x> <tolerance>` | Check whether every point has a reflected partner across an X-plane. |
| 18 | `y-symmetric <points> <plane-y> <tolerance>` | Check reflected partners across a Y-plane. |
| 19 | `z-symmetric <points> <plane-z> <tolerance>` | Check reflected partners across a Z-plane. |
| 20 | `rotational-check <points> <degrees> <tolerance>` | Check point-set invariance under a supplied Y rotation. |
| 21 | `central-check <points> <center> <tolerance>` | Check point-set invariance under point reflection. |
| 22 | `pair-midpoints <a> <b>` | Compute centers that would make paired points centrally symmetric. |
| 23 | `missing-x <points> <plane-x> <tolerance>` | List reflected X-plane partners absent from the supplied set. |
| 24 | `fundamental-x <points> <plane-x>` | Select the closed right half-space of an X-reflection layout. |
| 25 | `symmetry-error <points> <plane-x>` | Maximum nearest-partner error after X reflection. |

Example: `mc-agent symmetry mirror-x '[[1,2,3]]' 4`

Result: `[[7,2,3]]`.

## landmark

Offline coordinate survey calculations on caller-supplied [x,y,z] landmarks. Range and bearing geometry ignores occlusion, terrain, measurement uncertainty unless explicit, and dimension transitions. No observations are fetched.

| # | Command | Behavior |
| --- | --- | --- |
| 1 | `ranges <origin> <landmarks>` | Compute 3D ranges from one origin. |
| 2 | `horizontal-ranges <origin> <landmarks>` | Compute horizontal ranges from one origin. |
| 3 | `vertical-offsets <origin> <landmarks>` | Compute signed landmark height differences. |
| 4 | `nearest-index <origin> <landmarks>` | Return first nearest landmark index, zero-based. |
| 5 | `farthest-index <origin> <landmarks>` | Return first farthest landmark index, zero-based. |
| 6 | `range-filter <origin> <landmarks> <minimum> <maximum>` | Select landmarks within a closed 3D range band. |
| 7 | `sort-range <origin> <landmarks>` | Sort landmarks by 3D distance with stable ties. |
| 8 | `range-margin <origin> <landmarks> <maximum>` | Report signed range margins to a supplied maximum. |
| 9 | `elevation-angles <origin> <landmarks>` | Signed sight elevation angles above horizontal. |
| 10 | `sight-grade <origin> <landmarks>` | Signed vertical over horizontal sight slopes. |
| 11 | `height-from-angle <horizontal-range> <degrees> <eye-y>` | Infer landmark height from supplied sight angle and horizontal range. |
| 12 | `range-from-height <height-difference> <degrees>` | Infer positive horizontal range from height difference and sight angle. |
| 13 | `baseline <landmarks>` | Length of a baseline defined by exactly two landmarks. |
| 14 | `baseline-midpoint <landmarks>` | Midpoint of exactly two survey landmarks. |
| 15 | `baseline-fraction <landmarks> <point>` | Unclamped projection fraction along a nonzero landmark baseline. |
| 16 | `baseline-offset <landmarks> <point>` | Perpendicular distance to the infinite landmark baseline. |
| 17 | `sight-interpolate <landmarks> <fraction>` | Point at supplied fraction along two landmark endpoints. |
| 18 | `trilaterate-flat <baseline> <first-range> <second-range>` | Two X/Z solutions relative to landmarks at (0,0) and (baseline,0). |
| 19 | `bearing-cross <origins> <first-degrees> <second-degrees>` | Intersect two infinite X/Z bearing lines; zero degrees is +X. |
| 20 | `weighted-fix <landmarks> <weights>` | Compute weighted mean position from explicit nonnegative weights. |
| 21 | `measurement-residuals <estimate> <landmarks> <ranges>` | Subtract measured ranges from predicted 3D ranges. |
| 22 | `range-rms <estimate> <landmarks> <ranges>` | RMS residual over explicit measured landmark ranges. |
| 23 | `sphere-shell <range> <error>` | Inner and outer radii for an absolute range error. |
| 24 | `angular-width <object-width> <range>` | Ideal angular width of centered perpendicular object in degrees. |
| 25 | `range-ratio <first-range> <second-range>` | Relative scale of two supplied landmark ranges. |

Example: `mc-agent landmark ranges '[[0,0,0]]' '[[3,4,0],[0,0,2]]'`

Result: `[5,2]`.

## district

Offline rectangular district and parcel estimates. Road strips and parcels are explicitly abstract rectangles; counts ignore terrain, existing blocks, ownership, connectivity, and game mechanics. No construction is executed.

| # | Command | Behavior |
| --- | --- | --- |
| 1 | `parcel-count <columns> <rows>` | Count regular grid parcels. |
| 2 | `parcel-area <width> <depth> <columns> <rows>` | Area of each equal parcel without roads. |
| 3 | `street-footprint <columns> <rows> <parcel-width> <parcel-depth> <street-width>` | Compute extent with internal streets only. |
| 4 | `street-area <columns> <rows> <parcel-width> <parcel-depth> <street-width>` | Compute union area of internal streets without double-counting intersections. |
| 5 | `street-intersections <columns> <rows>` | Count crossings of internal orthogonal streets. |
| 6 | `street-length <columns> <rows> <parcel-width> <parcel-depth> <street-width>` | Sum full centerline lengths of internal streets including crossings twice. |
| 7 | `parcel-origins <columns> <rows> <width> <depth> <street>` | List lower-left origins row-major. |
| 8 | `parcel-centers <columns> <rows> <width> <depth> <street>` | List parcel center coordinates row-major. |
| 9 | `setback-area <width> <depth> <setback>` | Buildable rectangle area after equal edge setbacks. |
| 10 | `setback-loss <width> <depth> <setback>` | Fraction of parcel lost to equal edge setbacks. |
| 11 | `courtyard-layout <outer-width> <outer-depth> <wing-width>` | Dimensions and area of courtyard within uniform perimeter wings. |
| 12 | `perimeter-building <outer-width> <outer-depth> <wing-width> <stories>` | Gross floor area of rectangular ring building. |
| 13 | `coverage <building-area> <parcel-area>` | Building footprint share of parcel area. |
| 14 | `floor-ratio <floor-area> <parcel-area>` | Gross floor area per parcel area. |
| 15 | `story-budget <floor-area-target> <footprint>` | Minimum whole stories for a gross floor area target. |
| 16 | `green-area <district-area> <building-area> <street-area>` | Residual unallocated open area after disjoint buildings and streets. |
| 17 | `frontage <columns> <rows> <parcel-width>` | Aggregate one-edge frontage of all parcels. |
| 18 | `frontage-lots <edge-length> <lot-frontage> <end-reserve>` | Count whole lots after symmetric end reserves. |
| 19 | `corner-parcels <columns> <rows>` | Count unique parcels at grid corners, including degenerate grids. |
| 20 | `edge-parcels <columns> <rows>` | Count unique grid-boundary parcels. |
| 21 | `interior-parcels <columns> <rows>` | Count parcels not touching district boundary. |
| 22 | `checker-parcels <columns> <rows>` | Count alternating even and odd grid parcel classes. |
| 23 | `phase-rows <columns> <rows> <rows-per-phase>` | List parcel counts for consecutive construction row phases. |
| 24 | `utility-trunk <columns> <rows> <parcel-width> <parcel-depth> <street-width>` | Length of one horizontal spine plus vertical branch centerlines at parcel centers. |
| 25 | `service-radius <parcel-width> <parcel-depth>` | Farthest parcel-corner distance from its center. |

Example: `mc-agent district parcel-count 4 3`

Result: `12`.

Plane distances/projections normalize the provided normal before using the
supplied offset; the offset is therefore a signed distance from the origin.
Roof pitches and tunnel grades are rise/run ratios. Roof rain depth and area must
use compatible units. Bridge loads are user-supplied arithmetic estimates, never
engineering certification. Facade `joint-length` assumes a full untrimmed array.
District streets occupy internal strips only; centerline lengths count crossing
segments in both directions. Landmark `bearing-cross` returns infinite-line
intersections, which can lie behind either sight origin.
