const recipe = (purpose, baseline, ...candidates) => ({ purpose, request: { baseline, candidates } });
const points = (...positions) => JSON.stringify(positions);
const firstCourse = points([14, 64, 32], [15, 64, 32], [16, 64, 32]);
const cornerCourse = points([14, 64, 32], [15, 64, 32], [15, 64, 33]);
const stair = points([14, 64, 32], [15, 64, 32], [15, 65, 32], [16, 65, 32], [16, 66, 32]);
const repair = points([15, 64, 32], [16, 64, 32], [17, 64, 32]);
const brace = points([15, 65, 32], [16, 65, 32], [17, 65, 32]);
const gate = points([14, 64, 32], [14, 65, 32], [14, 66, 32], [16, 66, 32], [16, 65, 32], [16, 64, 32]);

export const spatialRecipes = {
  vector: {
    add: recipe(
      'Place a marker at the same local offset from either proposed porch corner.',
      [points([120, 64, -48]), points([4, 1, 2])],
      [points([124, 64, -44]), points([4, 1, 2])],
    ),
    subtract: recipe(
      'Measure the displacement to two alternate tunnel exit points.',
      [points([164, 71, -28]), points([120, 64, -48])],
      [points([158, 68, -32]), points([120, 64, -48])],
    ),
    scale: recipe(
      'Compare full-size and half-size roof-brace offsets.',
      [points([8, 6, 0]), 1],
      [points([8, 6, 0]), 0.5],
    ),
    dot: recipe(
      'Compare how much two proposed survey legs advance along an eastward reference.',
      [points([12, 0, 5]), points([1, 0, 0])],
      [points([10, 3, 2]), points([1, 0, 0])],
    ),
    cross: recipe(
      'Compare area-weighted normals for an east-rising roof panel and a flat panel.',
      [points([8, 3, 0]), points([0, 0, 6])],
      [points([8, 0, 0]), points([0, 0, 6])],
    ),
    length: recipe(
      'Compare the straight lengths of two possible diagonal supports.',
      [points([8, 5, 0])],
      [points([6, 4, 3])],
    ),
    normalize: recipe(
      'Compare unit headings for two proposed mine entrances.',
      [points([16, 2, -8])],
      [points([12, 2, -12])],
    ),
    project: recipe(
      'Compare how two proposed ramp displacements project onto the east-west axis.',
      [points([24, 6, 10]), points([1, 0, 0])],
      [points([20, 6, 14]), points([1, 0, 0])],
    ),
    reject: recipe(
      'Compare the off-axis displacement of two approaches to an eastbound bridge.',
      [points([24, 6, 10]), points([1, 0, 0])],
      [points([20, 6, 4]), points([1, 0, 0])],
    ),
    angle: recipe(
      'Compare the turn from an eastbound road into two proposed paths.',
      [points([1, 0, 0]), points([8, 0, 8])],
      [points([1, 0, 0]), points([8, 0, 4])],
    ),
    interpolate: recipe(
      'Locate the quarter and midpoint marker along a rising path.',
      [points([120, 64, -48]), points([144, 68, -36]), 0.25],
      [points([120, 64, -48]), points([144, 68, -36]), 0.5],
    ),
    'component-product': recipe(
      'Compare widening a module horizontally with raising its vertical offsets.',
      [points([4, 6, 3]), points([2, 1, 2])],
      [points([4, 6, 3]), points([1, 2, 1])],
    ),
    'component-min': recipe(
      'Compare lower coordinate bounds when joining either of two shed extensions.',
      [points([120, 64, -48]), points([116, 65, -42])],
      [points([120, 64, -48]), points([122, 63, -52])],
    ),
    'component-max': recipe(
      'Compare upper coordinate bounds for two proposed annex placements.',
      [points([132, 71, -38]), points([140, 73, -40])],
      [points([132, 71, -38]), points([136, 70, -30])],
    ),
    'cap-length': recipe(
      'Trim the same diagonal beam direction to two available stock lengths.',
      [points([12, 5, 0]), 8],
      [points([12, 5, 0]), 10],
    ),
    reflect: recipe(
      'Compare reflecting a brace across a center wall and across a level floor.',
      [points([4, -3, 2]), points([1, 0, 0])],
      [points([4, -3, 2]), points([0, 1, 0])],
    ),
    'plane-distance': recipe(
      'Measure signed offsets of utility points from two possible basement floor levels.',
      [points([122, 60, -44], [130, 62, -44]), points([0, 1, 0]), 61],
      [points([122, 60, -44], [130, 62, -44]), points([0, 1, 0]), 63],
    ),
    'plane-project': recipe(
      'Project cable anchors onto two possible service-ceiling levels.',
      [points([122, 66, -44], [130, 65, -44]), points([0, 1, 0]), 67],
      [points([122, 66, -44], [130, 65, -44]), points([0, 1, 0]), 69],
    ),
    'triangle-normal': recipe(
      'Compare the facing direction of a retaining-wall panel before and after tilting its top.',
      [points([120, 64, -48], [128, 64, -48], [120, 70, -48])],
      [points([120, 64, -48], [128, 64, -48], [120, 70, -46])],
    ),
    'triangle-area': recipe(
      'Compare panel area for two attic gable heights.',
      [points([120, 69, -48], [132, 69, -48], [126, 73, -48])],
      [points([120, 69, -48], [132, 69, -48], [126, 75, -48])],
    ),
    'tetra-volume': recipe(
      'Compare the volume of two corner grading wedges with different rises.',
      [points([120, 64, -48], [128, 64, -48], [120, 64, -42], [120, 67, -48])],
      [points([120, 64, -48], [128, 64, -48], [120, 64, -42], [120, 69, -48])],
    ),
    'triple-product': recipe(
      'Check whether swapping the vertical and depth axes reverses a blueprint coordinate frame.',
      [points([6, 0, 0], [0, 4, 0], [0, 0, 8])],
      [points([6, 0, 0], [0, 0, 8], [0, 4, 0])],
    ),
    parallel: recipe(
      'Compare exact and slightly skewed guide beams against the same alignment tolerance.',
      [points([20, 0, 0]), points([10, 0, 0]), 0.05],
      [points([20, 0, 0]), points([10, 0, 1]), 0.05],
    ),
    orthogonal: recipe(
      'Check whether either layout makes a square intersection within the supplied tolerance.',
      [points([20, 0, 0]), points([0, 0, 10]), 0.05],
      [points([20, 0, 0]), points([1, 0, 10]), 0.05],
    ),
    elevation: recipe(
      'Compare the sightline angle to two alternative hilltop marker positions.',
      [points([32, 12, -24])],
      [points([28, 18, -18])],
    ),
  },
  voxel: {
    unique: recipe(
      'Deduplicate a shared wall seam before and after extending one of the crews’ block lists.',
      [points([14, 64, 32], [15, 64, 32], [15, 64, 32])],
      [points([14, 64, 32], [15, 64, 32], [15, 64, 32], [16, 64, 32])],
    ),
    union: recipe(
      'Preview a wall course merged with a same-level repair or an overhead brace.',
      [firstCourse, repair],
      [firstCourse, brace],
    ),
    intersection: recipe(
      'Find whether the repair or overhead brace collides with the existing wall course.',
      [firstCourse, repair],
      [firstCourse, brace],
    ),
    difference: recipe(
      'Compare the blocks still missing after checking the same design against two observed courses.',
      [repair, firstCourse],
      [repair, cornerCourse],
    ),
    exclusive: recipe(
      'Locate conflicting cells when the wall layout is replaced by either of two edits.',
      [firstCourse, repair],
      [firstCourse, cornerCourse],
    ),
    'face-count': recipe(
      'Compare exposed faces for two ways of arranging four blocks in one floor layer.',
      [points([14, 64, 32], [15, 64, 32], [16, 64, 32], [17, 64, 32])],
      [points([14, 64, 32], [15, 64, 32], [14, 64, 33], [15, 64, 33])],
    ),
    'internal-faces': recipe(
      'Compare shared faces before and after closing a two-block gap pattern in a retaining course.',
      [points([14, 64, 32], [16, 64, 32], [18, 64, 32])],
      [points([14, 64, 32], [15, 64, 32], [16, 64, 32], [17, 64, 32], [18, 64, 32])],
    ),
    'bounds-volume': recipe(
      'Compare the reserved bounding volume of a low wall course and a stair module.',
      [firstCourse],
      [stair],
    ),
    'fill-fraction': recipe(
      'Compare how much of each bounding box is occupied by a solid course or a stair.',
      [firstCourse],
      [stair],
    ),
    components: recipe(
      'Check whether adding a single block between two isolated pillars joins them.',
      [points([14, 64, 32], [16, 64, 32])],
      [firstCourse],
    ),
    'neighbor-counts': recipe(
      'Compare support neighbors on three unconnected spots and on a joined course.',
      [points([14, 64, 32], [16, 64, 32], [18, 64, 32])],
      [firstCourse],
    ),
    'boundary-cells': recipe(
      'Find how adding a missing west neighbor changes the exposed cells around a core block.',
      [points([15, 64, 32], [16, 64, 32], [15, 65, 32], [15, 63, 32], [15, 64, 33], [15, 64, 31])],
      [points([15, 64, 32], [16, 64, 32], [15, 65, 32], [15, 63, 32], [15, 64, 33], [15, 64, 31], [14, 64, 32])],
    ),
    'layer-counts': recipe(
      'Compare vertical staging quantities for a low wall course and a stepped approach.',
      [firstCourse],
      [stair],
    ),
    'column-counts': recipe(
      'Compare pillar heights for a flat course and a stepped approach over three positions.',
      [firstCourse],
      [stair],
    ),
    'bottom-cells': recipe(
      'Compare contact blocks for a flat course and the same-width stair profile.',
      [firstCourse],
      [stair],
    ),
    centroid: recipe(
      'Compare the center of occupied blocks before and after raising three cells into a stair.',
      [firstCourse],
      [stair],
    ),
    dilate: recipe(
      'Mark the one-cell orthogonal buffer around a straight course and around its corner variant.',
      [firstCourse],
      [cornerCourse],
    ),
    erode: recipe(
      'Check whether omitting a west neighbor leaves the core of a cross-shaped fixture.',
      [points([15, 64, 32], [16, 64, 32], [15, 65, 32], [15, 63, 32], [15, 64, 33], [15, 64, 31], [14, 64, 32])],
      [points([15, 64, 32], [16, 64, 32], [15, 65, 32], [15, 63, 32], [15, 64, 33], [15, 64, 31])],
    ),
    translate: recipe(
      'Preview placing the same stair module on the next floor or at the adjacent gate.',
      [stair, 0, 6, 0],
      [stair, 12, 0, -4],
    ),
    'top-cells': recipe('Compare upper contact points along a flat course and along a stair.', [firstCourse], [stair]),
    'slice-y': recipe('Extract the ground and lintel block lists from the same gate frame.', [gate, 64], [gate, 66]),
    'clip-box': recipe(
      'Compare how much of a stair module fits within two proposed work envelopes.',
      [stair, points([14, 64, 32], [16, 66, 32])],
      [stair, points([14, 64, 32], [15, 65, 32])],
    ),
    'fill-box': recipe(
      'List occupied cells for solid and widened blocks at the base of a pillar.',
      [points([14, 64, 32], [15, 66, 33])],
      [points([14, 64, 32], [16, 66, 33])],
    ),
    'overlap-fraction': recipe(
      'Compare how closely two course edits match the same existing block layout.',
      [firstCourse, repair],
      [firstCourse, brace],
    ),
    'disconnected-count': recipe(
      'Find how many isolated work sections are removed by bridging a gap.',
      [points([14, 64, 32], [16, 64, 32], [17, 64, 32])],
      [points([14, 64, 32], [15, 64, 32], [16, 64, 32], [17, 64, 32])],
    ),
  },
  tunnel: {
    excavate: recipe(
      'Compare the excavation for a narrow guide tunnel and a widened rail tunnel.',
      [3, 4, 48],
      [5, 4, 48],
    ),
    lining: recipe(
      'Budget one-layer and two-layer stone lining along a 48-slice rail tunnel.',
      [5, 4, 48, 1],
      [5, 4, 48, 2],
    ),
    'floor-strip': recipe(
      'Compare slab-course and two-course floor block counts for the mine access tunnel.',
      [5, 48, 1],
      [5, 48, 2],
    ),
    'ceiling-strip': recipe('Budget ceiling strips with zero or one block of side overhang.', [5, 48, 0], [5, 48, 1]),
    sidewalls: recipe(
      'Compare sidewall material for a two-block walking tunnel and a four-block minecart hall.',
      [2, 48, 1],
      [4, 48, 1],
    ),
    'portal-ring': recipe(
      'Estimate stone rings around narrower pedestrian and wider rail entrances.',
      [3, 4, 1],
      [5, 4, 1],
    ),
    'end-caps': recipe(
      'Compare masonry for temporarily sealing one portal or sealing both.',
      [5, 4, 1, 1],
      [5, 4, 1, 2],
    ),
    'cross-section': recipe(
      'Check the total excavation cross section with two lining thicknesses.',
      [5, 4, 1],
      [5, 4, 2],
    ),
    'support-count': recipe(
      'Budget support frames for the same tunnel with six- and eight-slice spacing.',
      [48, 6],
      [48, 8],
    ),
    'support-positions': recipe(
      'Mark support stations along the same approach using two spacing options.',
      [48, 6],
      [48, 8],
    ),
    'support-material': recipe(
      'Compare the post and header cells for two layouts with different frame counts.',
      [5, 4, 9],
      [5, 4, 7],
    ),
    'clear-width': recipe(
      'Check the space remaining after adding one- or two-block lining to a seven-block shell.',
      [7, 1],
      [7, 2],
    ),
    'clear-height': recipe(
      'Compare standing clearance with a one-block floor and a thicker raised floor.',
      [6, 1, 1],
      [6, 2, 1],
    ),
    'parallel-bores': recipe(
      'Compare the width reserved for two working bores or a third service bore.',
      [2, 5, 3],
      [3, 5, 3],
    ),
    'cross-passages': recipe(
      'Budget cross-passage excavation for eight- and twelve-slice station intervals.',
      [48, 8, 2, 3, 3],
      [48, 12, 2, 3, 3],
    ),
    drain: recipe('Compare excavation for one- and two-block-wide drains below the track bed.', [48, 1, 2], [48, 2, 2]),
    'walkway-share': recipe(
      'Compare remaining cart clearance when providing one or two service walks.',
      [7, 1, 2],
      [7, 2, 2],
    ),
    'grade-rise': recipe(
      'Check total elevation change over a 48-slice approach for two planned grades.',
      [48, 0.125],
      [48, 0.25],
    ),
    'ramp-slices': recipe('Compare required ramp runs to climb six blocks at two grade limits.', [6, 0.125], [6, 0.25]),
    headroom: recipe(
      'Check the headroom margin before and after resurfacing raises the tunnel floor.',
      [70, 65, 4],
      [70, 67, 4],
    ),
    'haul-work': recipe(
      'Compare spoil hauling distance-weighted volume for a direct and a detoured excavation.',
      [20, 48],
      [20, 56],
    ),
    'two-end-haul': recipe(
      'Compare nearest-end hauling for a north-south alignment and a longer reroute.',
      [20, 48],
      [20, 56],
    ),
    'spoil-trips': recipe('Plan unloading trips at half-stack and full-stack carrying capacity.', [960, 32], [960, 64]),
    progress: recipe('Review the cut and remaining slices at the end of two shifts.', [18, 48], [34, 48]),
    'work-window': recipe(
      'Estimate active digging time using the rates measured for two crew setups.',
      [48, 4, 3],
      [48, 6, 5],
    ),
  },
  bridgeplan: {
    'deck-cells': recipe(
      'Budget deck blocks for a three-wide footbridge or a five-wide crossing.',
      [36, 3, 1],
      [36, 5, 1],
    ),
    'abutment-cells': recipe('Compare abutment blocks with two- and three-block bank depths.', [5, 4, 2], [5, 4, 3]),
    'span-count': recipe(
      'Check how the maximum planned span changes partitioning of a 36-block river.',
      [36, 10],
      [36, 12],
    ),
    'equal-spans': recipe('Compare equal span lengths for ten-block and twelve-block span limits.', [36, 10], [36, 12]),
    'pier-count': recipe('Compare internal pier counts for three-span and four-span river layouts.', [3], [4]),
    'pier-stations': recipe(
      'Locate pier positions for three-span and four-span divisions of the same crossing.',
      [36, 3],
      [36, 4],
    ),
    'pier-volume': recipe(
      'Compare masonry volume for two support locations with different channel depths.',
      ['4,8,6', 2, 3],
      ['5,9,7', 2, 3],
    ),
    'rail-cells': recipe('Budget one- and two-course parapets for the same deck.', [36, 1, 2], [36, 2, 2]),
    'post-count': recipe('Compare railing post counts at four- and six-block spacing.', [36, 4, 2], [36, 6, 2]),
    'post-volume': recipe(
      'Compare blocks in short railing posts and taller lantern posts at the same stations.',
      [36, 6, 2, 2],
      [36, 6, 4, 2],
    ),
    underbeam: recipe('Budget two or three longitudinal beams for the crossing underside.', [36, 2, 2], [36, 3, 2]),
    crossbeams: recipe('Compare transverse beam material for two station spacings.', [36, 6, 5], [36, 9, 5]),
    clearance: recipe(
      'Check the reserved clearance over the channel at two proposed deck elevations.',
      [71, 66, 4],
      [69, 66, 4],
    ),
    'approach-length': recipe(
      'Compare approach runs from two bank elevations up to a common deck.',
      [71, 65, 0.25],
      [71, 68, 0.25],
    ),
    'approach-fill': recipe(
      'Compare fill for two ramp lengths with the same three-block rise.',
      [5, 12, 3],
      [5, 18, 3],
    ),
    'deck-slope': recipe(
      'Compare the deck grade when meeting the opposite bank at two elevations.',
      [68, 71, 36],
      [68, 74, 36],
    ),
    'sloped-length': recipe('Compare continuous deck lengths for two cross-bank elevation changes.', [36, 3], [36, 6]),
    'expansion-gaps': recipe(
      'Compare internal seams when dividing a long decorative deck into two section sizes.',
      [36, 8, 0.25],
      [36, 12, 0.25],
    ),
    'deck-panels': recipe(
      'Compare panel counts for two prefabricated deck module sizes.',
      [36, 5, 6, 3],
      [36, 5, 9, 5],
    ),
    'panel-waste': recipe(
      'Compare trimmed panel area for modular decking with and without exact width coverage.',
      [36, 5, 6, 3],
      [36, 5, 9, 5],
    ),
    'tributary-load': recipe(
      'Compare arithmetic load shares across two arrangements of three spans.',
      ['12,12,12', 2],
      ['8,16,12', 2],
    ),
    'load-total': recipe(
      'Compare supplied uniform loads on the same bridge under light and dense finishes.',
      [36, 5, 2],
      [36, 5, 3],
    ),
    'cantilever-share': recipe(
      'Compare the overhang fraction when lengthening a viewing platform at the end of a span.',
      [2, 12],
      [4, 12],
    ),
    'material-reserve': recipe(
      'Compare block purchase totals with five and fifteen percent spares.',
      [180, 96, 0.05],
      [180, 96, 0.15],
    ),
    'build-hours': recipe(
      'Compare placement hours when staging pallets increases the placement rate.',
      [276, 60, 0.5],
      [276, 90, 0.75],
    ),
  },
  roofplan: {
    'gable-rise': recipe('Compare ridge height for two pitches across a fourteen-block lodge.', [14, 0.5], [14, 1]),
    'gable-rafter': recipe('Check individual rafter length for two proposed lodge ridge heights.', [14, 4], [14, 7]),
    'gable-surface': recipe('Compare roof covering area for low and steep lodge roofs.', [14, 22, 4], [14, 22, 7]),
    'gable-end': recipe('Budget gable infill area at two different ridge heights.', [14, 4], [14, 7]),
    'gable-volume': recipe('Compare open attic volume under two lodge roof rises.', [14, 22, 4], [14, 22, 7]),
    'shed-surface': recipe(
      'Compare covering area for two rises on a single-slope greenhouse roof.',
      [8, 16, 2],
      [8, 16, 4],
    ),
    'shed-volume': recipe(
      'Compare greenhouse volume before and after raising the low eave.',
      [8, 16, 3, 4],
      [8, 16, 5, 4],
    ),
    'hip-ridge': recipe('Compare ridge length on two inn footprints with the same width.', [14, 22], [14, 28]),
    'hip-surface': recipe(
      'Compare roof area for two hip-roof rises on the same inn footprint.',
      [14, 22, 4],
      [14, 22, 7],
    ),
    'pyramid-surface': recipe('Compare roof covering area for two peak heights on a square lookout.', [9, 4], [9, 6]),
    'pyramid-volume': recipe('Compare the space enclosed below two proposed lookout peaks.', [9, 4], [9, 6]),
    'overhang-footprint': recipe(
      'Compare projected footprint with one- and two-block roof overhang.',
      [14, 22, 1],
      [14, 22, 2],
    ),
    'eave-length': recipe(
      'Compare total gutter run before and after extending the lodge footprint.',
      [14, 22],
      [14, 28],
    ),
    'ridge-cap': recipe('Compare whole ridge cap counts for two stock lengths.', [22, 2], [22, 3]),
    'tile-order': recipe(
      'Compare tile orders with two waste allowances for the same net coverage.',
      [360, 0.5, 0.08],
      [360, 0.5, 0.15],
    ),
    'course-count': recipe(
      'Compare roof course counts when tiles expose half or three quarters of a block.',
      [9, 0.5],
      [9, 0.75],
    ),
    'course-overlap': recipe(
      'Compare overlap when using two exposure marks on the same tile size.',
      [1, 0.5],
      [1, 0.75],
    ),
    'batten-length': recipe('Compare total batten length for two roof course layouts.', [22, 12, 2], [22, 18, 2]),
    'rafter-count': recipe('Compare rafter counts using two- and three-block spacing.', [22, 2, 2], [22, 3, 2]),
    'rafter-stock': recipe('Compare total rafter stock at two possible ridge heights.', [14, 4, 24], [14, 7, 24]),
    'gutter-fall': recipe(
      'Compare required gutter fall along the same wall for two gradients.',
      [22, 0.01],
      [22, 0.025],
    ),
    'outlet-count': recipe('Compare outlet quantities for two specified catchment ratings.', [384, 100], [384, 160]),
    'rain-volume': recipe(
      'Compare ideal captured rain volume at two collection fractions.',
      [384, 0.04, 0.65],
      [384, 0.04, 0.9],
    ),
    'stepped-profile': recipe('Compare block-height sequences toward a shallow peak and a tall peak.', [7, 4], [7, 7]),
    'attic-clear-width': recipe(
      'Compare usable attic width under two ridge heights with the same headroom target.',
      [14, 4, 3],
      [14, 7, 3],
    ),
  },
  facade: {
    'opening-area': recipe(
      'Compare total opening area before and after widening a market doorway.',
      ['2,3,3', '3,4,4'],
      ['4,3,3', '3,4,4'],
    ),
    'net-wall': recipe('Budget masonry area for two storefront glazing layouts.', [24, 8, 54], [24, 8, 72]),
    'window-columns': recipe(
      'Compare how many openings fit using two standard window widths.',
      [24, 2, 3, 1],
      [24, 2, 4, 1],
    ),
    'window-rows': recipe(
      'Compare how many window rows fit with short or tall openings.',
      [15, 2, 2, 3, 1],
      [15, 2, 2, 4, 1],
    ),
    'centered-start': recipe(
      'Mark the starting offset for centered rows of three or four openings.',
      [24, 3, 4, 2],
      [24, 4, 4, 2],
    ),
    'equal-gaps': recipe('Compare even gap widths for two rows of same-sized market windows.', [24, 3, 3], [24, 4, 3]),
    'window-centers': recipe(
      'Compare center markers for two window rows with different sill levels.',
      [2, 4, 3, 2, 1, 4],
      [2, 4, 3, 2, 3, 4],
    ),
    'frame-perimeter': recipe('Compare trim lengths for two heights of gallery opening.', [3, 4, 4], [3, 5, 4]),
    'frame-ring': recipe(
      'Compare decorative border area with half-block and full-block frame widths.',
      [3, 4, 0.5, 4],
      [3, 4, 1, 4],
    ),
    'sill-stock': recipe('Compare sill stock for flush ends and half-block overhangs.', [3, 0, 4], [3, 0.5, 4]),
    'lintel-order': recipe(
      'Compare stock usage for seven identical lintels from ten- or sixteen-block members.',
      [3, 1, 7, 10],
      [3, 1, 7, 16],
    ),
    'mullion-stock': recipe('Compare vertical divider stock for two- and three-pane windows.', [4, 2, 4], [4, 3, 4]),
    'transom-stock': recipe(
      'Compare horizontal divider stock for two- and three-row gallery windows.',
      [3, 2, 4],
      [3, 3, 4],
    ),
    'pane-size': recipe(
      'Compare net pane sizes for two grids with the same opening and bar thickness.',
      [5, 6, 2, 2, 0.5],
      [5, 6, 3, 2, 0.5],
    ),
    'glazing-fraction': recipe(
      'Compare the glazed share of two storefront options on the same wall.',
      [192, 54],
      [192, 72],
    ),
    'pier-minimum': recipe(
      'Check whether three or four storefront openings keep the required pier width.',
      [24, 3, 4, 2],
      [24, 4, 4, 2],
    ),
    'bay-width': recipe('Compare bay width when dividing one frontage into four or six bays.', [30, 4], [30, 6]),
    'bay-boundaries': recipe('Mark frontage dividers for four- and six-bay plans.', [30, 4], [30, 6]),
    'story-datums': recipe(
      'Compare floor datums with an ordinary or double-height market level.',
      [64, '4,4,4'],
      [64, '8,4,4'],
    ),
    'spandrel-height': recipe(
      'Check the space above windows before and after raising their sills.',
      [6, 1, 3],
      [6, 2, 3],
    ),
    'cladding-panels': recipe(
      'Compare panel orders for two standard panel sizes on the same market wall.',
      [24, 8, 5, 3],
      [24, 8, 4, 4],
    ),
    'joint-length': recipe(
      'Compare internal seam length between two panel grids spanning the same wall.',
      [6, 2, 4, 4],
      [3, 4, 8, 2],
    ),
    'reveal-area': recipe(
      'Compare interior trim area for shallow and deep window recesses.',
      [3, 4, 0.25, 4],
      [3, 4, 1, 4],
    ),
    'door-threshold': recipe('Compare threshold areas for two entry mat recess depths.', ['3,4,3', 0.5], ['3,4,3', 1]),
    'accent-band': recipe(
      'Compare masonry finish area for two or three bands around the building.',
      [64, 0.5, 2],
      [64, 0.5, 3],
    ),
  },
  spiral: {
    'arch-radius': recipe(
      'Compare the radius reached by a garden spiral with two rates of outward growth.',
      [4, 2, 3],
      [4, 3, 3],
    ),
    'arch-point': recipe(
      'Place markers at a quarter turn and a half turn along the same garden spiral.',
      [4, 2, 0.25],
      [4, 2, 0.5],
    ),
    'arch-samples': recipe(
      'Compare coarse and dense stake layouts for a two-turn garden path.',
      [4, 2, 2, 12],
      [4, 2, 2, 24],
    ),
    'turn-spacing': recipe('Compare radial spacing for two inward spiral path designs.', [-2], [-3]),
    'turns-to-radius': recipe(
      'Compare the turns needed to reach a border using two rates of radial growth.',
      [4, 13, 2],
      [4, 13, 3],
    ),
    'annulus-area': recipe('Compare paved ring area before and after widening its outer border.', [5, 8], [5, 9]),
    'helix-rise': recipe('Compare the top elevation of two turns with six- and eight-block pitches.', [2, 6], [2, 8]),
    'helix-turns': recipe(
      'Compare the number of revolutions needed to climb a tower on two pitches.',
      [24, 6],
      [24, 8],
    ),
    'helix-length': recipe(
      'Compare continuous travel distance between two ramp radii at the same pitch.',
      [5, 6, 2],
      [7, 6, 2],
    ),
    'helix-grade': recipe('Compare uphill grade on narrow and wide spiral ramps with the same pitch.', [5, 6], [7, 6]),
    'helix-point': recipe(
      'Locate lantern anchors a quarter and a half turn above the start of the ramp.',
      [5, 6, 0.25],
      [5, 6, 0.5],
    ),
    'helix-samples': recipe(
      'Compare stair guide markers drawn with sixteen or thirty-two segments.',
      [5, 6, 2, 16],
      [5, 6, 2, 32],
    ),
    'helix-step-angle': recipe('Compare per-step turning angles for twelve- and sixteen-step revolutions.', [12], [16]),
    'helix-step-rise': recipe(
      'Compare step heights for twelve- and sixteen-step subdivisions of the same pitch.',
      [6, 12],
      [6, 16],
    ),
    'helix-step-chord': recipe(
      'Compare straight distances between stairs for two step densities on one radius.',
      [5, 6, 12],
      [5, 6, 16],
    ),
    'headroom-pitch': recipe(
      'Check how increasing deck thickness changes the pitch required for headroom.',
      [3, 1],
      [3, 2],
    ),
    'headroom-margin': recipe(
      'Check the spare headroom for two spiral pitches under the same deck thickness.',
      [4, 1, 3],
      [6, 1, 3],
    ),
    'inner-radius': recipe('Compare the opening left by two walking widths at the same outer radius.', [8, 3], [8, 4]),
    'walking-radius': recipe(
      'Locate the quarter-width walking line and centerline on the same stair.',
      [5, 3, 0.25],
      [5, 3, 0.5],
    ),
    'ring-deck-area': recipe(
      'Compare decking area for two widths following one and a half revolutions.',
      [5, 3, 1.5],
      [5, 4, 1.5],
    ),
    'post-angles': recipe(
      'Compare lantern post angles with the same spacing at two starting orientations.',
      [8, 0],
      [8, 22.5],
    ),
    'rise-stations': recipe(
      'Compare rise subdivisions for a staircase with half- and three-quarter-block step limits.',
      [12, 0.5],
      [12, 0.75],
    ),
    'angular-speed': recipe('Compare rotation in degrees per second for two decorative display speeds.', [3], [6]),
    'helix-travel': recipe('Compare estimated ramp travel at two user-supplied speeds.', [5, 6, 2, 3], [5, 6, 2, 4]),
    'radial-clearance': recipe('Compare the open radial gap between turns at two garden path widths.', [4, 2], [4, 3]),
  },
  symmetry: {
    'mirror-x': recipe(
      'Compare mirrored window placements with two east-west wall centerlines.',
      [points([12, 3, 2], [12, 6, 4]), 16],
      [points([12, 3, 2], [12, 6, 4]), 18],
    ),
    'mirror-y': recipe(
      'Compare reflected decorative trim around two horizontal datums.',
      [points([2, 3, 0], [4, 5, 0]), 8],
      [points([2, 3, 0], [4, 5, 0]), 10],
    ),
    'mirror-z': recipe(
      'Compare matching kiosk positions on streets with two centerline offsets.',
      [points([6, 0, 10], [12, 0, 10]), 16],
      [points([6, 0, 10], [12, 0, 10]), 20],
    ),
    invert: recipe(
      'Compare point reflections of light fixtures around two possible pavilion centers.',
      [points([5, 5, 2], [6, 5, 3]), points([8, 4, 8])],
      [points([5, 5, 2], [6, 5, 3]), points([10, 4, 8])],
    ),
    'quarter-y': recipe(
      'Preview a quarter-turned arch when the pillar separation changes.',
      [points([2, 0, 0], [6, 0, 0], [4, 4, 0])],
      [points([2, 0, 0], [8, 0, 0], [5, 4, 0])],
    ),
    'quarter-x': recipe(
      'Preview two quarter-turned local mounting profiles with different offsets.',
      [points([0, 2, 1], [2, 5, 1])],
      [points([0, 2, 2], [2, 5, 2])],
    ),
    'quarter-z': recipe(
      'Compare raised and low trim profiles quarter-turned across a facade.',
      [points([2, 0, 0], [5, 1, 0])],
      [points([2, 2, 0], [5, 3, 0])],
    ),
    'swap-xy': recipe(
      'Convert two facade motif variants from horizontal offsets to vertical offsets.',
      [points([2, 1, 0], [5, 1, 0])],
      [points([2, 1, 0], [5, 3, 0])],
    ),
    'swap-xz': recipe(
      'Compare two planter footprints mirrored across a diagonal walkway.',
      [points([3, 0, 1], [5, 0, 1])],
      [points([3, 0, 2], [5, 0, 2])],
    ),
    'swap-yz': recipe(
      'Compare the depth profiles when reflecting two stair rises into the depth axis.',
      [points([0, 2, 1], [0, 4, 3])],
      [points([0, 3, 1], [0, 6, 3])],
    ),
    'orbit-four': recipe(
      'Compare fourfold beacon layouts from two proposed first marker offsets.',
      [points([8, 1, 0])],
      [points([8, 1, 3])],
    ),
    'orbit-eight': recipe(
      'Compare mirrored fixture placements when its seed point moves off an origin plane.',
      [points([4, 3, 0])],
      [points([4, 3, 2])],
    ),
    'radial-orbit': recipe(
      'Compare equally spaced pedestal markers around a plaza for six or eight copies.',
      [points([10, 0, 0]), 6],
      [points([10, 0, 0]), 8],
    ),
    'screw-orbit': recipe(
      'Compare terraced lantern points with two angular advances per level.',
      [points([5, 1, 0]), 6, 45, 2],
      [points([5, 1, 0]), 6, 60, 2],
    ),
    'glide-x': recipe(
      'Compare two offsets for reflected plaques along the opposite corridor wall.',
      [points([4, 2, 1], [4, 2, 5]), 0, 0, 3],
      [points([4, 2, 1], [4, 2, 5]), 0, 0, 6],
    ),
    'rotate-y': recipe(
      'Compare two angles for turning a small fountain footprint around its center.',
      [points([3, 0, 0], [3, 0, 2], [4, 0, 2]), 45],
      [points([3, 0, 0], [3, 0, 2], [4, 0, 2]), 90],
    ),
    'x-symmetric': recipe(
      'Check whether shifting one stair lamp preserves symmetry around the central aisle.',
      [points([-4, 3, 2], [4, 3, 2]), 0, 0],
      [points([-4, 3, 2], [5, 3, 2]), 0, 0],
    ),
    'y-symmetric': recipe(
      'Check whether a display remains symmetric after its top light moves upward.',
      [points([4, 5, 2], [4, 11, 2]), 8, 0],
      [points([4, 5, 2], [4, 12, 2]), 8, 0],
    ),
    'z-symmetric': recipe(
      'Check whether moving one pillar keeps the pair symmetric around a corridor datum.',
      [points([5, 0, 12], [5, 0, 20]), 16, 0],
      [points([5, 0, 12], [5, 0, 21]), 16, 0],
    ),
    'rotational-check': recipe(
      'Check whether adding one unpaired lamp breaks a plaza layout’s half-turn symmetry.',
      [points([8, 1, 0], [-8, 1, 0], [0, 1, 8], [0, 1, -8]), 180, 0.000001],
      [points([8, 1, 0], [-8, 1, 0], [0, 1, 8], [0, 1, -8], [5, 1, 5]), 180, 0.000001],
    ),
    'central-check': recipe(
      'Check which of two hub placements is the center of point symmetry for its lights.',
      [points([5, 2, 7], [11, 2, 13]), points([8, 2, 10]), 0],
      [points([5, 2, 7], [11, 2, 13]), points([9, 2, 10]), 0],
    ),
    'pair-midpoints': recipe(
      'Compare halfway markers when the receiving ends of two lifts move upward.',
      [points([4, 0, 2], [10, 0, 2]), points([4, 10, 2], [10, 10, 2])],
      [points([4, 0, 2], [10, 0, 2]), points([4, 12, 2], [10, 12, 2])],
    ),
    'missing-x': recipe(
      'Find missing mirror partners before and after one of the mirrored aisle lamps is installed.',
      [points([-4, 3, 2], [-4, 3, 8]), 0, 0],
      [points([-4, 3, 2], [-4, 3, 8], [4, 3, 2]), 0, 0],
    ),
    'fundamental-x': recipe(
      'Compare half-plan block lists under two possible greenhouse center planes.',
      [points([4, 0, 0], [6, 0, 0], [8, 0, 0], [10, 0, 0]), 6],
      [points([4, 0, 0], [6, 0, 0], [8, 0, 0], [10, 0, 0]), 8],
    ),
    'symmetry-error': recipe(
      'Compare the worst mirror mismatch before and after moving an offset pier toward alignment.',
      [points([-4, 2, 2], [6, 2, 2]), 0],
      [points([-4, 2, 2], [5, 2, 2]), 0],
    ),
  },
  landmark: {
    ranges: recipe(
      'Compare sight distances from two observation platforms to the same hill markers.',
      [points([120, 64, -48]), points([132, 68, -48], [144, 66, -32])],
      [points([136, 72, -42]), points([132, 68, -48], [144, 66, -32])],
    ),
    'horizontal-ranges': recipe(
      'Compare horizontal ranges from two portals to the planned hill entrance.',
      [points([120, 64, -48]), points([144, 80, -24])],
      [points([126, 64, -38]), points([144, 80, -24])],
    ),
    'vertical-offsets': recipe(
      'Compare rise to a proposed lookout from the valley and ridge trailheads.',
      [points([120, 64, -48]), points([144, 80, -24])],
      [points([126, 72, -38]), points([144, 80, -24])],
    ),
    'nearest-index': recipe(
      'Check which supply station is nearest after moving the work camp eastward.',
      [points([120, 64, -48]), points([122, 66, -48], [141, 64, -48])],
      [points([138, 64, -48]), points([122, 66, -48], [141, 64, -48])],
    ),
    'farthest-index': recipe(
      'Check which beacon is farthest from each proposed assembly point.',
      [points([120, 64, -48]), points([122, 66, -48], [141, 64, -48])],
      [points([138, 64, -48]), points([122, 66, -48], [141, 64, -48])],
    ),
    'range-filter': recipe(
      'Filter rally points first by a short range band and then by a longer one.',
      [points([120, 64, -48]), points([125, 64, -48], [132, 64, -48], [144, 64, -48]), 0, 12],
      [points([120, 64, -48]), points([125, 64, -48], [132, 64, -48], [144, 64, -48]), 12, 26],
    ),
    'sort-range': recipe(
      'Compare station visitation order by distance from two different work camps.',
      [points([120, 64, -48]), points([144, 64, -48], [132, 64, -48], [125, 64, -48])],
      [points([138, 64, -48]), points([144, 64, -48], [132, 64, -48], [125, 64, -48])],
    ),
    'range-margin': recipe(
      'Compare sight range margins for two maximum lengths on the same landmarks.',
      [points([120, 64, -48]), points([132, 68, -48], [144, 66, -32]), 24],
      [points([120, 64, -48]), points([132, 68, -48], [144, 66, -32]), 32],
    ),
    'elevation-angles': recipe(
      'Compare the viewing angle to a ridge beacon from a valley trail and from the ridge trail.',
      [points([120, 64, -48]), points([144, 80, -24])],
      [points([126, 72, -38]), points([144, 80, -24])],
    ),
    'sight-grade': recipe(
      'Compare vertical-to-horizontal slopes to a proposed signal lamp from two watch platforms.',
      [points([120, 64, -48]), points([132, 72, -48])],
      [points([120, 69, -48]), points([132, 72, -48])],
    ),
    'height-from-angle': recipe(
      'Compare inferred mast height under two plausible angle readings.',
      [24, 30, 65],
      [24, 32, 65],
    ),
    'range-from-height': recipe(
      'Compare inferred distance to a landmark at two observed upward angles.',
      [12, 30],
      [12, 45],
    ),
    baseline: recipe(
      'Compare baseline lengths to two possible second survey markers.',
      [points([120, 64, -48], [136, 64, -48])],
      [points([120, 64, -48], [144, 66, -48])],
    ),
    'baseline-midpoint': recipe(
      'Locate the midpoint before and after moving the east baseline pin.',
      [points([120, 64, -48], [136, 64, -48])],
      [points([120, 64, -48], [144, 66, -48])],
    ),
    'baseline-fraction': recipe(
      'Compare along-baseline fractions of a marker placed within and beyond the east endpoint.',
      [points([120, 64, -48], [136, 64, -48]), points([132, 66, -44])],
      [points([120, 64, -48], [136, 64, -48]), points([140, 66, -44])],
    ),
    'baseline-offset': recipe(
      'Compare how far two lantern positions are from the same surveyed road centerline.',
      [points([120, 64, -48], [136, 64, -48]), points([132, 64, -44])],
      [points([120, 64, -48], [136, 64, -48]), points([132, 64, -42])],
    ),
    'sight-interpolate': recipe(
      'Compare staking a sightline at one-third and two-thirds of its length.',
      [points([120, 64, -48], [144, 70, -36]), 0.3333333333333333],
      [points([120, 64, -48], [144, 70, -36]), 0.6666666666666666],
    ),
    'trilaterate-flat': recipe(
      'Compare the candidate positions after updating one range in a two-point flat survey.',
      [16, 10, 10],
      [16, 10, 12],
    ),
    'bearing-cross': recipe(
      'Compare where two survey bearings intersect after updating the second angle.',
      [points([120, -48], [136, -48]), 45, 135],
      [points([120, -48], [136, -48]), 45, 120],
    ),
    'weighted-fix': recipe(
      'Compare an equal-weight position fix with one giving the firmer survey point triple weight.',
      [points([120, 64, -48], [124, 66, -44]), '1,1'],
      [points([120, 64, -48], [124, 66, -44]), '1,3'],
    ),
    'measurement-residuals': recipe(
      'Compare signed range residuals for two candidate beacon positions against the same measurements.',
      [points([128, 64, -48]), points([120, 64, -48], [140, 64, -48]), '10,10'],
      [points([130, 64, -48]), points([120, 64, -48], [140, 64, -48]), '10,10'],
    ),
    'range-rms': recipe(
      'Compare overall fit of two possible beacon positions against the same measured ranges.',
      [points([128, 64, -48]), points([120, 64, -48], [140, 64, -48]), '10,10'],
      [points([130, 64, -48]), points([120, 64, -48], [140, 64, -48]), '10,10'],
    ),
    'sphere-shell': recipe(
      'Compare the range band with one- and three-block measurement uncertainty.',
      [24, 1],
      [24, 3],
    ),
    'angular-width': recipe(
      'Compare the apparent width of a market gate from near and distant lookout points.',
      [8, 24],
      [8, 48],
    ),
    'range-ratio': recipe('Compare a near beacon’s range to each of two farther marks.', [16, 32], [16, 48]),
  },
  district: {
    'parcel-count': recipe(
      'Compare plot counts before and after adding another row behind the market.',
      [5, 3],
      [5, 4],
    ),
    'parcel-area': recipe(
      'Compare area per plot when the same district land is divided into three or four rows.',
      [60, 48, 5, 3],
      [60, 48, 5, 4],
    ),
    'street-footprint': recipe(
      'Check total district width and depth with two widths of internal street.',
      [5, 4, 12, 10, 2],
      [5, 4, 12, 10, 4],
    ),
    'street-area': recipe(
      'Compare total paving footprint for narrow paths and broader avenues.',
      [5, 4, 12, 10, 2],
      [5, 4, 12, 10, 4],
    ),
    'street-intersections': recipe(
      'Compare internal intersection counts before and after adding a district row.',
      [5, 3],
      [5, 4],
    ),
    'street-length': recipe(
      'Compare centerline lengths before and after widening internal streets.',
      [5, 4, 12, 10, 2],
      [5, 4, 12, 10, 4],
    ),
    'parcel-origins': recipe(
      'Lay out row-major build origins using two planned street widths.',
      [3, 2, 12, 10, 2],
      [3, 2, 12, 10, 4],
    ),
    'parcel-centers': recipe(
      'Plan central plot markers for shallow and deep garden rows.',
      [3, 2, 12, 10, 2],
      [3, 2, 12, 14, 2],
    ),
    'setback-area': recipe(
      'Compare buildable area when reserving two or three blocks around each lot edge.',
      [16, 12, 2],
      [16, 12, 3],
    ),
    'setback-loss': recipe(
      'Compare the share of a lot consumed by two possible edge buffers.',
      [16, 12, 2],
      [16, 12, 3],
    ),
    'courtyard-layout': recipe(
      'Compare open courtyard dimensions with four- and six-block building wings.',
      [32, 24, 4],
      [32, 24, 6],
    ),
    'perimeter-building': recipe(
      'Compare gross floor area for a two- and three-story market surrounding the same courtyard.',
      [32, 24, 4, 2],
      [32, 24, 4, 3],
    ),
    coverage: recipe(
      'Compare lot coverage for the original house footprint and an expanded workshop.',
      [72, 192],
      [104, 192],
    ),
    'floor-ratio': recipe('Compare density on one plot before and after adding a second floor.', [96, 192], [192, 192]),
    'story-budget': recipe(
      'Compare stories needed for the same floor-area goal under two building footprints.',
      [288, 96],
      [288, 144],
    ),
    'green-area': recipe(
      'Compare the open reserve before and after allocating more land to streets.',
      [3600, 1800, 384],
      [3600, 1800, 768],
    ),
    frontage: recipe('Compare total plot frontage before and after adding a row of shops.', [5, 3, 12], [5, 4, 12]),
    'frontage-lots': recipe(
      'Compare how many stalls fit along an avenue with two gate clearance reserves.',
      [84, 8, 4],
      [84, 8, 12],
    ),
    'corner-parcels': recipe(
      'Compare unique corner lots in a single-row farm strip and a two-row layout.',
      [5, 1],
      [5, 2],
    ),
    'edge-parcels': recipe('Compare the number of perimeter plots after thickening a garden district.', [5, 3], [5, 4]),
    'interior-parcels': recipe('Compare protected interior plots under three- and four-row layouts.', [5, 3], [5, 4]),
    'checker-parcels': recipe('Compare the two alternating parcel classes after adding a new row.', [5, 3], [5, 4]),
    'phase-rows': recipe(
      'Compare plot counts per construction phase with two or three rows per phase.',
      [5, 7, 2],
      [5, 7, 3],
    ),
    'utility-trunk': recipe(
      'Compare estimated utility run before and after adding another row of homes.',
      [5, 3, 12, 10, 2],
      [5, 4, 12, 10, 2],
    ),
    'service-radius': recipe(
      'Compare ideal corner reach from a plot center for two proposed depth options.',
      [12, 10],
      [12, 14],
    ),
  },
};
