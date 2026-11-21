function compare(purpose, baseline, ...candidates) {
  return { purpose, request: { baseline, candidates } };
}

const intervals = '[[0,12],[10,20],[26,38],[52,60]]';
const staggered = '[[0,14],[14,28],[36,47],[62,68]]';
const coverage = (purpose) => compare(purpose, [intervals], [staggered]);
const jobs = '8,22,14,11';
const revisedJobs = '6,12,26,4';
const shifts = (purpose) => compare(purpose, [jobs], [revisedJobs]);
const chain = '[[0,1],[1,2],[2,3],[3,4]]';
const fork = '[[0,1],[0,2],[1,3],[2,3],[3,4]]';
const graph = (purpose) => compare(purpose, [5, chain], [5, fork]);
const ridge = '[[0,0],[24,0],[24,16],[58,16],[58,0]]';
const valley = '[[0,0],[18,-6],[44,-6],[58,0]]';
const path = (purpose) => compare(purpose, [ridge], [valley]);
const camps = '[[-12,4],[3,6],[7,6],[25,18],[27,20]]';
const campsWithOutpost = '[[-12,4],[3,6],[7,6],[25,18],[27,20],[42,-27]]';
const samples = (purpose) => compare(purpose, [camps], [campsWithOutpost]);
const floor = [23, 17, 5, 3];
const modules = [23, 17, 4, 5];
const tile = (purpose) => compare(purpose, floor, modules);
const bank = '65,70,63,62,65,68';
const cut = '65,64,64,63,63,65';
const profile = (purpose) => compare(purpose, [bank], [cut]);
const radius = (purpose) => compare(purpose, [90, 4, 20], [90, 4, 10]);
const loop = (purpose) => compare(purpose, [144, 4, 12], [112, 4, 8]);

export const coordinationRecipes = {
  'interval-set': {
    merge: coverage('Consolidate overlapping smelter shifts before scheduling another batch.'),
    runs: compare(
      'Count uninterrupted work windows when a relief worker covers the first break.',
      [intervals],
      ['[[0,20],[20,26],[26,38],[52,60]]'],
    ),
    covered: coverage('Total staffed trading time when two operators overlap.'),
    bounds: coverage('Find the opening and closing time of the worksite for each staffing plan.'),
    span: coverage('Budget how long a shared workshop will be reserved from first use to final cleanup.'),
    density: coverage('Compare how much of the workshop reservation contains active work.'),
    gaps: coverage('Find breaks between build shifts that could fit a supply delivery.'),
    idle: coverage('Compare downtime between furnace batches.'),
    'longest-gap': coverage('Find the largest gap available for a repair at the depot.'),
    'longest-run': coverage('Check which staffing pattern leaves the longest uninterrupted mining window.'),
    'shortest-run': coverage('Find the shortest shift when screening slots for a material transfer.'),
    starts: coverage('Build a list of reminders for the start of each staffed window.'),
    ends: coverage('Find when each continuous work window closes.'),
    midpoints: coverage('Choose a check-in time in the middle of each staffed window.'),
    lengths: coverage('Match jobs against the length of each open workshop window.'),
    contains: compare(
      'Check whether the workshop is staffed at two proposed delivery times.',
      [intervals, 23],
      [intervals, 35],
    ),
    clip: compare(
      'Compare how much staffed time remains inside two shuttle windows.',
      [intervals, 12, 24],
      [intervals, 12, 35],
    ),
    exclude: compare(
      'Remove two possible maintenance windows from the shift schedule.',
      [intervals, 8, 14],
      [intervals, 16, 29],
    ),
    shift: compare('Move the entire reservation to two possible later starts.', [intervals, 15], [intervals, 30]),
    expand: compare(
      'See which breaks close when a between-shift handover is extended.',
      [intervals, 2],
      [intervals, 4],
    ),
    shrink: compare(
      'Trim setup and cleanup from both ends of each otherwise staffed window.',
      [intervals, 2],
      [intervals, 5],
    ),
    complement: compare(
      'Find free time before, during, and after the planned shifts in a longer booking window.',
      [intervals, 0, 60],
      [staggered, 0, 75],
    ),
    overlap: compare(
      'Check how much staffing is available during a scheduled cart delivery.',
      [intervals, 18, 33],
      [staggered, 18, 33],
    ),
    distance: compare(
      'Measure the gap from an unstaffed delivery time to the nearest open window.',
      [intervals, 22],
      [intervals, 44],
    ),
    quantile: compare(
      'Locate the halfway and three-quarter marks of active workshop time.',
      [intervals, 0.5],
      [intervals, 0.75],
    ),
  },
  shiftplan: {
    schedule: shifts('Lay out serial prep, excavation, lining, and cleanup jobs under two duration estimates.'),
    starts: shifts('Compare expected start times before assigning crews to serial jobs.'),
    finishes: shifts('See how earlier staging alters the completion times of queued workshop jobs.'),
    total: shifts('Compare whole-session duration before choosing an excavation plan.'),
    'completion-mean': shifts('Compare average finish time when a long cut moves deeper into the schedule.'),
    'waiting-total': shifts('Estimate accumulated waiting when a single crew serializes the work.'),
    'shortest-first': shifts('Reorder the jobs for a quick-win workshop shift using revised estimates.'),
    'longest-first': shifts('Find which jobs to start first when scheduling around the longest ones.'),
    'deadline-slack': compare(
      'Compare two serial job bundles against the same session cutoff.',
      [jobs, 50],
      [revisedJobs, 50],
    ),
    'completed-at': compare(
      'Count jobs complete at the halfway checkpoint under each estimate.',
      [jobs, 24],
      [revisedJobs, 24],
    ),
    'active-at': compare(
      'Find which job will be underway when the replacement crew arrives.',
      [jobs, 20],
      [revisedJobs, 20],
    ),
    'remaining-at': compare(
      'Estimate remaining serial work at an early or late session checkpoint.',
      [jobs, 16],
      [jobs, 36],
    ),
    progress: compare('Compare the fraction of total work elapsed at two review points.', [jobs, 10], [jobs, 30]),
    offset: compare('Put the same list of jobs on either side of a scheduled supply drop.', [jobs, 20], [jobs, 45]),
    breaks: compare('Compare the schedule with short or extended breaks between tasks.', [jobs, 3], [jobs, 8]),
    setup: compare('Budget job start times with standard versus pre-staged tools.', [jobs, 5], [jobs, 2]),
    repeat: compare('Budget repeated rounds of the same four workshop jobs.', [jobs, 2], [jobs, 5]),
    'fit-cycles': compare('Check how many complete rounds fit a short or long session.', [jobs, 90], [jobs, 180]),
    scale: compare('Model a dry-run schedule and a slower production pass.', [jobs, 0.75], [jobs, 1.25]),
    overheads: compare(
      'Compare extra job time from shared tools against tools staged at each task.',
      [jobs, '3,5,5,2'],
      [jobs, '2,1,2,1'],
    ),
    lateness: compare(
      'See which jobs miss their handover milestones as estimates change.',
      [jobs, '10,26,42,54'],
      [revisedJobs, '10,26,42,54'],
    ),
    tardiness: compare(
      'Compare aggregate missed time against job-specific deadlines.',
      [jobs, '10,26,42,54'],
      [revisedJobs, '10,26,42,54'],
    ),
    'weighted-completion': compare(
      'Compare the schedules when the foundation and handover jobs have higher priority.',
      [jobs, '2,4,1,3'],
      [revisedJobs, '2,4,1,3'],
    ),
    'parallel-lower-bound': compare(
      'Estimate the optimistic finish time for two versus three crews.',
      [jobs, 2],
      [jobs, 3],
    ),
    'greedy-workers': compare(
      'Compare independent job assignments with two or three available crews.',
      [jobs, 2],
      [jobs, 3],
    ),
  },
  dependency: {
    order: compare(
      'Find how a required platform inspection can change the build order.',
      [5, fork],
      [5, '[[0,1],[0,2],[2,1],[1,3],[3,4]]'],
    ),
    acyclic: compare(
      'Catch a circular sign-off in which the final inspection is required before work can start.',
      [5, fork],
      [5, '[[0,1],[0,2],[1,3],[2,3],[3,4],[4,0]]'],
    ),
    roots: compare(
      'Find tasks allowed to begin when material gathering can start independently of staking.',
      [5, fork],
      [5, '[[0,1],[1,3],[2,3],[3,4]]'],
    ),
    leaves: compare(
      'Find final tasks when cleanup can proceed independently of the user handover.',
      [5, fork],
      [5, '[[0,1],[0,2],[1,3],[2,3],[2,4]]'],
    ),
    indegree: graph('Compare how many immediate sign-offs each build task requires.'),
    outdegree: graph('Find prerequisites that unlock more than one immediate build task.'),
    levels: graph('Compare how many dependency stages precede each task.'),
    layers: graph('Group jobs that can start at the same stage if crews are available.'),
    depth: graph('See how splitting excavation and staging shortens the longest dependency chain.'),
    width: graph('Find the busiest earliest-start stage after parallelizing work.'),
    edges: compare(
      'Spot a newly added dependency when reviewing a revised work order.',
      [5, chain],
      [5, '[[0,1],[1,2],[2,3],[3,4],[0,4]]'],
    ),
    isolated: compare(
      'Check whether an optional signboard task has been linked to the work order.',
      [5, '[[0,1],[1,2],[2,3]]'],
      [5, chain],
    ),
    adjacency: graph('List the tasks immediately released by a completed build step.'),
    reverse: graph('Check the immediate prerequisites at each crew handover.'),
    'reachable-pairs': graph('Compare how widely a delay can propagate across two job networks.'),
    closure: graph('Trace which downstream tasks are affected by an upstream delay.'),
    redundant: compare(
      'Find a direct inspection dependency already guaranteed by the job chain.',
      [5, chain],
      [5, '[[0,1],[1,2],[2,3],[3,4],[0,4]]'],
    ),
    'critical-nodes': compare(
      'Find critical jobs when one staging task can move off the longest chain.',
      [5, chain],
      [5, '[[0,1],[0,2],[1,3],[3,4]]'],
    ),
    'unit-makespan': graph('Compare earliest completion when all tasks take one planning unit.'),
    'unit-slack': compare(
      'Find how much a parallel staging task can slip under equal-duration assumptions.',
      [5, chain],
      [5, '[[0,1],[0,2],[1,3],[3,4]]'],
    ),
    descendants: compare('Find all jobs delayed by a late preparation or inspection step.', [5, fork, 0], [5, fork, 3]),
    ancestors: compare('Trace all prerequisite tasks for two different milestones.', [5, fork, 1], [5, fork, 4]),
    'ready-after': compare(
      'Find the next work available before and after both middle jobs finish.',
      [5, fork, '0,1'],
      [5, fork, '0,1,2'],
    ),
    'blocked-by': compare(
      'Check which jobs a hold on staking or a hold on excavation would stop.',
      [5, fork, 0],
      [5, fork, 1],
    ),
    'path-counts': compare(
      'Compare the number of dependency paths from the first task to handover.',
      [5, chain, 0],
      [5, fork, 0],
    ),
  },
  pathplan: {
    segments: path('Measure individual legs of the ridge and valley supply paths.'),
    chainage: path('Locate each junction by distance traveled from the depot.'),
    length: path('Compare total walk length for the ridge and valley routes.'),
    chord: compare(
      'Compare straight-line distance to a close and far depot entrance.',
      [ridge],
      ['[[0,0],[24,0],[24,16],[71,16],[71,0]]'],
    ),
    detour: path('Compare how much distance each path adds over straight-line displacement.'),
    efficiency: path('Compare what fraction of each route is direct progress toward the destination.'),
    'longest-leg': path('Find the longest marker-free stretch in each route.'),
    'shortest-leg': path('Check how closely waypoints cluster on each marked route.'),
    'mean-leg': path('Estimate typical distance between path markers on alternative routes.'),
    duplicates: compare(
      'Detect repeated adjacent coordinates after merging route surveys.',
      [valley],
      ['[[0,0],[18,-6],[18,-6],[44,-6],[58,0]]'],
    ),
    reverse: path('Generate the return waypoint order from either route survey.'),
    close: path('Close two path surveys back at the depot to outline a return loop.'),
    midpoint: path('Find where to meet halfway along either marked path.'),
    'leg-shares': path('See which legs account for most of the travel distance.'),
    centers: path('Find halfway points on each leg for possible trail signs.'),
    headings: path('Compare planar leg headings before writing trail directions.'),
    sample: compare('Locate the ten-block and thirty-block marks along the ridge route.', [ridge, 10], [ridge, 30]),
    resample: compare('Mark the route at five or nine equally spaced points.', [valley, 5], [valley, 9]),
    'trim-start': compare('Start a route after walking past the first obstruction.', [ridge, 12], [ridge, 35]),
    'travel-time': compare(
      'Compare an unloaded trip with a slower loaded trip at supplied speeds.',
      [valley, 4],
      [valley, 2.5],
    ),
    'leg-times': compare(
      'Budget a slower middle section on a route with variable terrain.',
      [valley, '4,4,4'],
      [valley, '4,2,4'],
    ),
    translate: compare('Move the same walkway shape to two alternative offsets.', [valley, 32, 0], [valley, 16, -12]),
    'crossings-x': compare(
      'Find which legs cross a planned trench at one of two X coordinates.',
      [ridge, 9],
      [ridge, 30],
    ),
    'stops-budget': compare(
      'Budget a quick walk against one that pauses to check every waypoint.',
      [ridge, 4, 0],
      [ridge, 4, 3],
    ),
    'simplify-collinear': compare(
      'Remove redundant inline waypoints while retaining an intentional jog.',
      ['[[0,0],[8,0],[16,0],[32,0],[32,12]]'],
      ['[[0,0],[8,0],[16,4],[32,4],[32,12]]'],
    ),
  },
  pointcloud: {
    count: samples('Compare the number of survey observations with and without a remote outpost.'),
    unique: compare(
      'Deduplicate coordinates recorded twice on a waypoint survey.',
      [camps],
      ['[[-12,4],[3,6],[3,6],[7,6],[25,18],[27,20],[42,-27]]'],
    ),
    centroid: samples('See how a remote outpost shifts the average location of surveyed camps.'),
    bounds: samples('Determine how far to extend a map after adding an outpost.'),
    extent: samples('Compare the coordinate spans you would need to record on each map axis.'),
    'box-area': samples('Estimate how much larger the rectangular survey map becomes with the outpost.'),
    'median-center': samples('Compare the median coordinate center before and after including the outpost.'),
    variance: samples('Quantify the change in coordinate spread on each axis.'),
    covariance: samples('Compare how X and Z move together after surveying across the valley.'),
    'rms-origin': samples('Measure typical radial spread from a depot at the coordinate origin.'),
    radii: samples('Compare distances from each site to the corresponding survey center.'),
    medoid: compare(
      'Choose an actual surveyed site as a central meeting point after a cluster relocation.',
      ['[[0,0],[8,4],[12,6],[17,3]]'],
      ['[[0,0],[35,20],[12,6],[17,3]]'],
    ),
    'sort-x': samples('Produce west-to-east survey checkout lists.'),
    'sort-z': samples('Produce north-to-south survey checkout lists.'),
    quadrants: samples('Count surveyed camps on each side of the depot axes.'),
    nearest: compare('Find the nearest surveyed campsite to either trail entrance.', [camps, 0, 3], [camps, 23, 17]),
    farthest: compare('Find the farthest trip from either candidate supply depot.', [camps, 0, 0], [camps, 16, 13]),
    within: compare('Find which camps fit a small or extended supply radius.', [camps, 0, 0, 10], [camps, 0, 0, 20]),
    outside: compare(
      'Identify camps that remain outside two proposed service radii.',
      [camps, 0, 0, 10],
      [camps, 0, 0, 20],
    ),
    'k-nearest': compare(
      'Shortlist the two or four closest survey points from an entrance.',
      [camps, 0, 0, 2],
      [camps, 0, 0, 4],
    ),
    'radius-counts': compare(
      'Compare nearby surveyed camps within six or sixteen blocks of each point.',
      [camps, 6],
      [camps, 16],
    ),
    isolated: compare('Find isolated camps under short and extended neighbor distances.', [camps, 6], [camps, 16]),
    'clip-box': compare(
      'Keep survey points visible in a local inset or a whole-area map frame.',
      [camps, -4, 0, 16, 12],
      [camps, -16, 0, 32, 24],
    ),
    snap: compare(
      'Compare alignment of the same camp coordinates to eight-block and sixteen-block grids.',
      [camps, 8],
      [camps, 16],
    ),
    occupancy: compare('Count surveyed points by sector at two resolutions.', [camps, 8], [camps, 16]),
  },
  'index-set': {
    union: compare(
      'Combine marked crate slots from two teams under different handover assignments.',
      ['0,3,8', '2,3,9'],
      ['0,3,8', '3,9,10'],
    ),
    intersection: compare(
      'Find duplicate repair assignments between a primary list and proposed support lists.',
      ['2,4,6,8', '1,2,4'],
      ['2,4,6,8', '5,6,7'],
    ),
    difference: compare(
      'Find planned fixtures still missing after two installation milestones.',
      ['0,1,2,3,4', '0,2'],
      ['0,1,2,3,4', '0,2,3,4'],
    ),
    'reverse-difference': compare(
      'Find installations outside the approved scope in two inspection reports.',
      ['0,1,2,3,4', '0,2,5'],
      ['0,1,2,3,4', '0,2,5,6'],
    ),
    symmetric: compare(
      'Find sites with changed status between reviewed maintenance lists.',
      ['0,4,7,9', '0,3,7,9'],
      ['0,4,7,9', '0,7,9'],
    ),
    subset: compare(
      'Check whether either vehicle manifest covers every required crate index.',
      ['2,5', '0,2,5,7'],
      ['2,5', '0,2,7'],
    ),
    superset: compare(
      'Check whether all spare parts needed for two repairs are in stock.',
      ['0,2,5,7', '2,5'],
      ['0,2,5,7', '2,6'],
    ),
    equal: compare(
      'Audit a reordered inspection checklist and one missing an item.',
      ['0,2,4', '4,2,0,2'],
      ['0,2,4', '4,0'],
    ),
    disjoint: compare(
      'Check whether primary and relief crews claim any of the same plots.',
      ['1,3,5', '0,2,4'],
      ['1,3,5', '0,3,4'],
    ),
    jaccard: compare(
      'Compare the overlap of two contractor lists relative to all distinct work orders.',
      ['0,2,4,6', '1,2,4,7'],
      ['0,2,4,6', '0,2,4,8'],
    ),
    dice: compare(
      'Compare matching survey sectors when both reports have different lengths.',
      ['0,2,4,6', '1,2,7'],
      ['0,2,4,6', '0,2,4,8,10'],
    ),
    overlap: compare(
      'Measure how much of a short follow-up inspection is covered by the original report.',
      ['0,2,4,6', '2,4'],
      ['0,2,4,6', '2,9'],
    ),
    'coverage-first': compare(
      'Compare progress against a fixed initial batch of planned repairs.',
      ['0,2,4,6', '2,4'],
      ['0,2,4,6', '2,4,6,8'],
    ),
    'coverage-second': compare(
      'Compare the share of completed repairs credited to the original scope.',
      ['0,2,4,6', '2,4,8'],
      ['0,2,4,6', '2,4,8,9'],
    ),
    'union-count': compare(
      'Estimate the number of distinct slots reserved by two crews.',
      ['0,2,4,6', '0,4,7'],
      ['0,2,4,6', '1,3,5'],
    ),
    'intersection-count': compare(
      'Count repeated work assignments before and after moving repairs between crews.',
      ['0,2,4,6', '0,4,7'],
      ['0,2,4,6', '3,4,7'],
    ),
    'edit-count': compare(
      'Count how many plot reservations need to change for either revision.',
      ['0,2,4,6', '0,4,7'],
      ['0,2,4,6', '0,4,6,7'],
    ),
    'retain-order': compare(
      'Filter an ordered pickup manifest to the cargo cleared at two checkpoints.',
      ['9,4,6,2,1', '1,4,9'],
      ['9,4,6,2,1', '1,2,6,9'],
    ),
    'append-new': compare(
      'Append newly marked plots to a waiting list while preserving existing order.',
      ['9,4,6', '1,4,2'],
      ['9,4,6', '2,4,1'],
    ),
    membership: compare(
      'See which sign-off list covers each task before a shift handover.',
      ['0,4,6', '1,4,7'],
      ['0,4,6', '0,1,7'],
    ),
    complement: compare(
      'Find unreserved rack slots in the present rack and after expansion.',
      ['0,2,4,5', 8],
      ['0,2,4,5', 12],
    ),
    runs: compare(
      'Turn individually marked lots into ranges for two proposed crew allocations.',
      ['2,3,4,8,9,15'],
      ['2,3,4,7,8,9,10,15'],
    ),
    duplicates: compare(
      'Detect repeated slot labels after combining warehouse manifests.',
      ['0,3,4,6,7'],
      ['0,3,3,4,6,7,7'],
    ),
    shift: compare('Reserve the same slot pattern on the next two storage shelves.', ['0,3,4,6', 9], ['0,3,4,6', 18]),
    mask: compare('Build an occupancy mask for two arrangements in the same rack.', ['0,2,4,5', 8], ['1,2,5,7', 8]),
  },
  tiling: {
    columns: tile('Compare how many tile columns are needed across the hall.'),
    rows: tile('Compare how many tile rows reach the back wall.'),
    tiles: tile('Estimate the number of prefab floor panels to order without reusing cuts.'),
    'full-tiles': tile('Find how many prefab floor panels can be used without any cuts.'),
    'partial-tiles': tile('Estimate how many edge pieces need to be cut under either panel size.'),
    area: compare('Compare the covered area of a standard and expanded depot floor.', floor, [27, 19, 5, 3]),
    'purchased-area': tile('Compare how much panel area must be purchased for the same floor.'),
    'waste-area': tile('Compare discarded panel area when edge pieces cannot be reused.'),
    'waste-fraction': tile('Compare the fraction of each panel order that ends up as offcuts.'),
    'edge-width': compare(
      'Check whether adding two blocks to the floor width avoids a narrow right-edge strip.',
      floor,
      [25, 17, 5, 3],
    ),
    'edge-height': compare(
      'Check whether extending the hall by one block avoids trimming the last row.',
      floor,
      [23, 18, 5, 3],
    ),
    'horizontal-seams': tile('Estimate row seam length for both panel layouts.'),
    'vertical-seams': tile('Estimate column seam length for both panel layouts.'),
    'seam-total': tile('Compare aggregate seam length when budgeting trim strips.'),
    border: compare('Measure border trim for the present floor and an expanded hall.', floor, [27, 19, 5, 3]),
    junctions: tile('Compare four-panel meeting points to budget seam connectors.'),
    'row-widths': tile('List the widths that a crew should cut for the panels across each row.'),
    'column-heights': tile('List the panel heights along a column for both layouts.'),
    'rotated-count': compare(
      'Compare rotated panel purchase counts before and after widening the floor.',
      floor,
      [27, 19, 5, 3],
    ),
    'rotation-saving': tile('Check whether rotating the panel stock saves whole panels.'),
    dimensions: tile('Compare row and column counts before sketching the floor grid.'),
    cells: tile('Generate an ordered cut list for either panel layout.'),
    'order-cost': compare('Compare panel orders using their different unit costs.', [...floor, 5], [...modules, 6]),
    spares: compare(
      'Estimate how many panels to order with five or fifteen percent spare stock.',
      [...floor, 0.05],
      [...floor, 0.15],
    ),
    packages: compare(
      'Compare four-panel and eight-panel package orders for the same floor.',
      [...floor, 4],
      [...floor, 8],
    ),
  },
  elevation: {
    deltas: profile('Compare leg-by-leg height changes on the riverbank and proposed cut.'),
    ascent: profile('Compare how many blocks of climbing remain after grading the trail.'),
    descent: profile('Compare accumulated height loss along the original and graded trail.'),
    net: profile('Compare the endpoint offset when the graded trail rejoins the starting level.'),
    range: profile('See how much the elevation range shrinks after regrading.'),
    peaks: profile('Identify high points that remain after trimming the bank crest.'),
    valleys: profile('Find strict low points before and after smoothing the drainage bed.'),
    'level-legs': profile('Find horizontal legs that might fit rest platforms.'),
    'up-legs': profile('Locate climbing segments before and after the planned cut.'),
    'down-legs': profile('Locate downward segments after moving the start of the ramp.'),
    roughness: profile('Compare the amount of abrupt slope change along the two profiles.'),
    'total-variation': profile('Compare total vertical travel on the bank and graded path.'),
    'running-high': profile('Record the highest encountered elevation at every stage of each route.'),
    'running-low': profile('Record the lowest encountered elevation ahead of a drainage inspection.'),
    'relative-start': profile('Report each profile using the depot threshold as the common reference height.'),
    grades: compare('Compare grades for the bank and cut using equal four-block sampling.', [bank, 4], [cut, 4]),
    angles: compare('Compare inclination angles along the two trail profiles.', [bank, 4], [cut, 4]),
    'surface-length': compare(
      'Estimate how much trail surface needs lining after smoothing the path.',
      [bank, 4],
      [cut, 4],
    ),
    'horizontal-span': compare(
      'Compare the extent of survey profiles sampled four or six blocks apart.',
      [bank, 4],
      [bank, 6],
    ),
    'max-grade': compare('Find the steepest leg of both trail proposals at equal sample spacing.', [bank, 4], [cut, 4]),
    'steep-legs': compare(
      'Locate grades steeper than one rise in two blocks on both proposals.',
      [bank, 4, 0.5],
      [cut, 4, 0.5],
    ),
    offset: compare('Compare the sampled heights under two possible vertical offsets.', [cut, 1], [cut, -2]),
    'level-deficits': compare(
      'Estimate fill depth at each sample for two proposed road levels.',
      [bank, 64],
      [bank, 66],
    ),
    'level-excess': compare('Estimate cut depth at each sample for two proposed road levels.', [bank, 64], [bank, 66]),
    'signed-volume': compare(
      'Compare net fill and cut along two possible road levels.',
      [bank, 64, 4, 3],
      [bank, 66, 4, 3],
    ),
  },
  reach: {
    radius: radius('Estimate the one-way survey range gained by staging gear before the session.'),
    'roundtrip-radius': radius('Compare excursion radii when the player must return before the session ends.'),
    'time-left': radius('Compare how much of a session is available to travel after setup.'),
    'delay-share': radius('Compare the portion of the session spent getting supplies ready.'),
    'disk-area': radius('Compare ideal circular survey areas under two departure delays.'),
    'diamond-area': radius('Estimate ideal coverage when travel follows perpendicular streets.'),
    'square-area': radius('Compare coverage under a square distance model for two departure times.'),
    circumference: radius('Compare the ideal boundary length of the reachable scouting area.'),
    diameter: radius('Estimate the separation between the farthest opposite sites in reach.'),
    'lost-distance': radius('Compare potential travel distance spent waiting on setup.'),
    'required-speed': compare(
      'Find the travel speed needed to reach a depot after early or late departure.',
      [240, 90, 20],
      [240, 90, 40],
    ),
    arrival: compare(
      'Compare arrival times when traveling to the same marker before and after improving the route.',
      [240, 3, 10],
      [240, 4, 10],
    ),
    slack: compare(
      'Check how much session time remains at arrival with different approach distances.',
      [240, 4, 10, 90],
      [310, 4, 10, 90],
    ),
    'can-arrive': compare(
      'Check whether a longer approach meets the same delivery cutoff.',
      [240, 4, 10, 90],
      [330, 4, 10, 90],
    ),
    'return-reserve': compare(
      'Reserve round-trip time when the uphill return is slower than the outward trip.',
      [180, 4, 4, 5],
      [180, 4, 2.5, 5],
    ),
    'asymmetric-radius': compare(
      'Compare how far to scout with a faster or slower return leg.',
      [100, 4, 4, 10],
      [100, 4, 2.5, 10],
    ),
    'reserve-radius': compare(
      'Check remaining exploration distance after setting aside ten or thirty seconds.',
      [100, 4, 10],
      [100, 4, 30],
    ),
    waypoints: compare(
      'Shortlist waypoints reachable with a tight or relaxed arrival budget.',
      ['40,120,230,310', 4, 35],
      ['40,120,230,310', 4, 65],
    ),
    'arrival-list': compare(
      'Compute arrival times for several independent routes with and without gear staging.',
      ['40,120,230,310', 4, 15],
      ['40,120,230,310', 4, 5],
    ),
    'speed-window': compare(
      'Compare arrival ranges when the approach speed varies with the terrain.',
      [240, 5, 3],
      [240, 5, 2],
    ),
    'budget-window': compare(
      'See the distance range across a short and expanded travel-time window.',
      [30, 45, 4],
      [45, 75, 4],
    ),
    slowdown: compare(
      'Compare a clear path against an assumed twenty-five percent movement slowdown.',
      [240, 4, 1],
      [240, 4, 0.75],
    ),
    'rest-cycles': compare(
      'Budget a long approach with two different rest schedules.',
      [460, 4, 30, 10],
      [460, 4, 45, 10],
    ),
    'stop-cost': compare(
      'Compare route time before and after consolidating supply stops.',
      [240, 4, 5, 8],
      [240, 4, 2, 8],
    ),
    'latest-departure': compare(
      'Find when the cart crew must depart for either depot to meet a shared deadline.',
      [240, 4, 600],
      [340, 4, 600],
    ),
  },
  patrol: {
    'moving-period': loop('Compare walking time for a full perimeter loop and a shorter circuit.'),
    'cycle-period': loop('Compare entire watch cycles including the break at the depot.'),
    frequency: loop('Compare expected lap frequency for full and shortened survey loops.'),
    'moving-share': loop('Compare the fraction of time spent traveling on each survey loop.'),
    'rest-share': loop('Compare the fraction of time available at base between walks.'),
    'effective-speed': loop('Compare average coverage rate when both walking and rest count against the schedule.'),
    'absence-gap': compare(
      'Estimate the unobserved window when a depot check takes five or ten seconds.',
      [144, 4, 12, 5],
      [144, 4, 12, 10],
    ),
    'total-time': compare(
      'Budget three complete watch loops of either length with breaks included.',
      [144, 4, 12, 3],
      [112, 4, 8, 3],
    ),
    'moving-time': compare(
      'Compare total walking time for the same number of short and long survey laps.',
      [144, 4, 4],
      [112, 4, 4],
    ),
    distance: compare('Estimate the ground covered over three standard or four shortened laps.', [144, 3], [112, 4]),
    'fit-laps': compare(
      'Check how many complete watch cycles fit two staffing windows.',
      [144, 4, 12, 120],
      [144, 4, 12, 200],
    ),
    'last-rest-free': compare(
      'Budget a crew rotation that hands over directly after the last lap.',
      [144, 4, 12, 3],
      [112, 4, 8, 3],
    ),
    phase: compare('Find the crew’s progress within the cycle at two planned handoff times.', [48, 70], [48, 100]),
    'cycle-index': compare('Find which lap is underway when two scheduled deliveries arrive.', [48, 70], [48, 100]),
    'next-pass': compare(
      'Find the next checkpoint pass when a delivery arrives just before or after a scheduled pass.',
      [48, 12, 59],
      [48, 12, 61],
    ),
    'wait-pass': compare(
      'Estimate the wait for a checkpoint rendezvous at two arrival times.',
      [48, 12, 20],
      [48, 12, 55],
    ),
    'pass-times': compare(
      'Schedule the first five checks of an early or late waypoint in the circuit.',
      [48, 12, 5],
      [48, 28, 5],
    ),
    'pass-count': compare(
      'Compare how many visits to the same gate occur by two cutoffs.',
      [48, 12, 125],
      [48, 12, 210],
    ),
    stagger: compare('Space out start times when adding a third survey crew.', [48, 2], [48, 3]),
    'stagger-gap': compare(
      'Compare the ideal gap between passes with two or three evenly spaced crews.',
      [48, 2],
      [48, 3],
    ),
    'required-patrollers': compare('Estimate crew size to meet a loose or tight revisit interval.', [48, 20], [48, 12]),
    'watch-share': compare('Compare watch coverage at the gate with one or three crews.', [48, 10, 1], [48, 10, 3]),
    'checkpoint-phase': compare(
      'Estimate arrival phase at either of two measured checkpoints along the same loop.',
      [144, 4, 28],
      [144, 4, 84],
    ),
    position: compare(
      'Find the walking distance along a loop at two rendezvous times.',
      [144, 4, 12, 20],
      [144, 4, 12, 60],
    ),
    state: compare(
      'Check whether the crew is traveling or resting at two handoff times.',
      [144, 4, 12, 30],
      [144, 4, 12, 40],
    ),
  },
};
