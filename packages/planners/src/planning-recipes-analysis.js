function recipe(purpose, baseline, candidate) {
  return { purpose, request: { baseline, candidates: [candidate] } };
}

export const analysisRecipes = {
  series: {
    center: recipe('Compare mining trips against each route’s own mean haul.', ['36,44,40,48'], ['29,43,41,47']),
    standardize: recipe(
      'Compare delivery time deviations measured relative to each crew’s variability.',
      ['6,8,7,10'],
      ['10,12,17,15'],
    ),
    'minmax-scale': recipe(
      'Compare the relative profiles of two hillside paths on a zero-to-one scale.',
      ['62,69,74,70'],
      ['62,66,74,71'],
    ),
    'unit-sum': recipe(
      'Compare each farm plot’s share of the total harvest before and after adding irrigation.',
      ['30,38,32'],
      ['37,45,48'],
    ),
    'unit-length': recipe('Compare the direction of two proposed horizontal mine extensions.', ['12,16'], ['18,12']),
    cumulative: recipe(
      'Track cumulative glass stock under two delivery and placement schedules.',
      ['48,-16,32,-24'],
      ['32,-16,48,-24'],
    ),
    differences: recipe(
      'Compare changes in wheat stock over one versus two inventory checks.',
      ['80,96,76,104,93', 1],
      ['80,96,76,104,93', 2],
    ),
    ratios: recipe(
      'Compare run-to-run output ratios for two bamboo harvest schedules.',
      ['24,32,28,40'],
      ['24,28,36,42'],
    ),
    'log-changes': recipe(
      'Compare successive log changes in visits to two village trading halls.',
      ['12,18,24,22'],
      ['12,16,22,27'],
    ),
    absolute: recipe(
      'Compare the magnitude of tunnel offsets from the planned centerline.',
      ['-2,1,-3,0'],
      ['-1,0,1,0'],
    ),
    'signed-root': recipe(
      'Compare compressed elevation deviations for two proposed ridge paths.',
      ['-9,-4,0,16'],
      ['-4,-1,0,9'],
    ),
    winsorize: recipe(
      'Compare how capping the tails at two quantiles changes haul-time samples.',
      ['8,9,10,11,12,25', 0.1],
      ['8,9,10,11,12,25', 0.2],
    ),
    trim: recipe(
      'Compare retained farm yields when trimming extreme harvest counts.',
      ['19,20,21,24,38', 0],
      ['19,20,21,24,38', 1],
    ),
    subsample: recipe(
      'Compare even and odd inventory sampling schedules across six checkpoints.',
      ['90,83,78,72,70,68', 2, 0],
      ['90,83,78,72,70,68', 2, 1],
    ),
    'reverse-difference': recipe(
      'Compare how far masonry totals at each checkpoint fall short of each run’s final count.',
      ['32,54,86,104'],
      ['32,65,89,112'],
    ),
    'deviation-target': recipe(
      'Compare each coal delivery’s shortfall or surplus under two per-trip quotas.',
      ['28,40,34,46', 32],
      ['28,40,34,46', 40],
    ),
    clamp: recipe(
      'Compare decorative wall heights after applying two allowable height ranges.',
      ['2,4,6,8,10', 3, 8],
      ['2,4,6,8,10', 4, 7],
    ),
    'round-step': recipe(
      'Compare branch-mine spacings rounded to two possible marking intervals.',
      ['13,22,30,41', 4],
      ['13,22,30,41', 8],
    ),
    'run-lengths': recipe(
      'Compare uninterrupted stretches of equal elevation for two rail beds.',
      ['64,64,65,65,65,64'],
      ['64,64,64,65,65,64'],
    ),
    'record-highs': recipe(
      'Compare when crews set new records for blocks delivered per trip.',
      ['32,37,36,45,44'],
      ['32,35,43,40,48'],
    ),
    'record-lows': recipe(
      'Compare when two rail layouts set new lows for ride time in seconds.',
      ['52,47,48,45,41'],
      ['52,49,40,42,39'],
    ),
    'positive-part': recipe(
      'Compare surplus stacks available to lend after satisfying two build budgets.',
      ['4,-2,6,-1'],
      ['3,1,5,-2'],
    ),
    'soft-threshold': recipe(
      'Compare elevation errors after removing one-block versus two-block tolerances.',
      ['-4,-2,1,3,6', 1],
      ['-4,-2,1,3,6', 2],
    ),
    rescale: recipe(
      'Compare the same tower profile mapped to two permitted height ranges.',
      ['7,11,9,15', 12, 22],
      ['7,11,9,15', 8, 18],
    ),
    'gap-fill': recipe(
      'Compare interpolated terrace heights between stakes for two hillside profiles.',
      ['0,8,16', '62,68,72', '4,12'],
      ['0,8,16', '62,66,72', '4,12'],
    ),
  },
  distribution: {
    frequencies: recipe(
      'Compare the frequencies of ore counts per branch in two tunnels.',
      ['2,2,3,2,5,3'],
      ['2,3,3,4,5,4'],
    ),
    modes: recipe(
      'Compare the most frequent torch spacing in two branch-mine layouts.',
      ['7,7,8,7,9,8'],
      ['7,8,8,9,9,9'],
    ),
    ecdf: recipe(
      'Compare observed shares of cart runs at or below three duration targets.',
      ['12,14,16,18,21', '14,17,20'],
      ['11,13,15,16,19', '14,17,20'],
    ),
    survival: recipe(
      'Compare observed shares of tool lifetimes exceeding three workload thresholds.',
      ['43,51,57,61,78', '45,58,70'],
      ['48,58,64,72,82', '45,58,70'],
    ),
    'bin-counts': recipe(
      'Compare travel times for two supply routes in the same time bands.',
      ['18,20,27,31,43', '15,25,35,45'],
      ['15,17,21,28,34', '15,25,35,45'],
    ),
    'equal-width': recipe(
      'Compare the granularity of three versus four bins for trade prices.',
      ['4,6,8,11,13,15,16', 3],
      ['4,6,8,11,13,15,16', 4],
    ),
    'quantile-grid': recipe(
      'Compare haul duration benchmarks at fourths of two observed trip-time distributions.',
      ['7,8,11,12,17', 4],
      ['6,7,10,11,13', 4],
    ),
    midranks: recipe(
      'Compare farm plot yield ranks after two plots tie under the new layout.',
      ['18,22,27,33'],
      ['21,25,25,35'],
    ),
    entropy: recipe(
      'Compare the diversity of surveyed biome counts across four biome categories.',
      ['18,8,6,2'],
      ['14,9,7,4'],
    ),
    'effective-categories': recipe(
      'Compare the effective number of supply sources before and after pooling two stockpiles.',
      ['20,20,25,35'],
      ['40,25,35'],
    ),
    concentration: recipe(
      'Compare how strongly glass production is concentrated among three furnaces.',
      ['24,24,48'],
      ['18,24,54'],
    ),
    gini: recipe(
      'Compare inequality of blocks delivered to four depots under two schedules.',
      ['18,24,30,48'],
      ['26,28,30,36'],
    ),
    lorenz: recipe(
      'Compare cumulative delivery shares for evenly fed and unevenly fed depots.',
      ['16,32,32,48'],
      ['24,30,34,40'],
    ),
    'top-share': recipe(
      'Compare the fraction of village food produced by the two largest plots.',
      ['18,22,35,45', 2],
      ['24,27,33,36', 2],
    ),
    'bottom-share': recipe(
      'Compare the fraction of harvest delivered by the two smallest plots.',
      ['12,18,38,52', 2],
      ['22,26,32,40', 2],
    ),
    'tail-mean': recipe(
      'Compare the upper-quarter mean cart delay under two dispatch patterns.',
      ['3,4,5,6,8,9,13,18', 0.25],
      ['3,4,5,6,7,8,10,13', 0.25],
    ),
    'mean-absolute-deviation': recipe(
      'Compare typical distance from mean smelting time across two furnace batches.',
      ['34,37,40,42,49'],
      ['37,38,40,42,43'],
    ),
    'median-absolute-deviation': recipe(
      'Compare robust spread of redstone timing measurements across two circuits.',
      ['9,10,11,12,29'],
      ['8,10,12,14,29'],
    ),
    'root-mean-square': recipe(
      'Compare aggregate magnitude of signed elevation errors along two survey lines.',
      ['0,-2,3,-4'],
      ['1,-1,1,-2'],
    ),
    'geometric-mean': recipe(
      'Compare compound-average throughput factors for two sequence upgrades.',
      ['1.1,1.25,0.96'],
      ['1.06,1.32,1.04'],
    ),
    'harmonic-mean': recipe(
      'Compare average speed over equal-length rail legs for two alignments.',
      ['7,8,5'],
      ['6,9,7'],
    ),
    'quadratic-entropy': recipe(
      'Compare diversity of harvest shares across the same four crop plots.',
      ['16,16,16,48'],
      ['18,22,26,30'],
    ),
    'bowley-skew': recipe(
      'Compare quartile asymmetry in delivery delays on two rail routes.',
      ['10,11,14,17,25,45,50'],
      ['10,13,15,19,22,26,41'],
    ),
    'excess-kurtosis': recipe(
      'Compare tail weight in two sets of signed survey measurement errors.',
      ['-5,-2,-1,0,1,2,5'],
      ['-2,-1,-1,0,1,1,8'],
    ),
    'central-moment': recipe(
      'Compare third central moments of delays with and without a missed departure.',
      ['4,6,7,9,11', 3],
      ['4,6,7,9,19', 3],
    ),
  },
  association: {
    covariance: recipe(
      'Compare how active furnaces and ingot output vary together under two fuel policies.',
      ['2,4,6,8', '14,25,37,49'],
      ['2,4,6,8', '14,30,44,59'],
    ),
    'sample-covariance': recipe(
      'Compare sampled joint variation in rail distance and delivery time for two layouts.',
      ['24,32,48,64', '6,9,13,16'],
      ['24,32,48,64', '6,7,9,11'],
    ),
    pearson: recipe(
      'Compare the linear association between dig length and elapsed time in two tunnels.',
      ['12,24,36,48', '7,14,24,26'],
      ['12,24,36,48', '8,13,18,23'],
    ),
    spearman: recipe(
      'Compare rank agreement between farm area and harvest under two layouts.',
      ['12,20,28,36', '18,27,24,35'],
      ['12,20,28,36', '17,26,30,33'],
    ),
    kendall: recipe(
      'Compare pairwise ordering of predicted and measured build costs before and after revising a bill of materials.',
      ['20,40,65,80', '24,70,54,82'],
      ['20,40,65,80', '24,45,66,82'],
    ),
    'linear-fit': recipe(
      'Fit two per-block rail-time scenarios to compare fixed and distance-related costs.',
      ['16,32,48,64', '8,12,17,21'],
      ['16,32,48,64', '7,11,13,17'],
    ),
    predict: recipe(
      'Compare fitted platform storage requirements at two proposed lengths.',
      ['8,16,24', '36,60,82', '28,32'],
      ['8,16,24', '32,52,72', '28,32'],
    ),
    residuals: recipe(
      'Compare residual patterns for straight and hilly rail timing samples.',
      ['16,32,48,64', '9,15,21,27'],
      ['16,32,48,64', '9,20,27,39'],
    ),
    'r-squared': recipe(
      'Compare how well a straight-line model describes travel time on two terrain types.',
      ['16,32,48,64,80', '8,11,14,17,20'],
      ['16,32,48,64,80', '8,11,18,16,26'],
    ),
    'squared-error': recipe(
      'Compare summed squared residuals of two fits of shelf counts against delivery totals.',
      ['34,46,59,71', '29,44,61,65'],
      ['34,46,59,71', '32,48,60,68'],
    ),
    'root-error': recipe(
      'Compare fitted residual magnitudes in blocks for two inventories across four delivery budgets.',
      ['42,58,68,91', '36,55,77,87'],
      ['42,58,68,91', '40,54,71,89'],
    ),
    leverage: recipe(
      'Compare which timing observations exert the most leverage when the longest trial is extended.',
      ['8,16,24,32'],
      ['8,16,24,80'],
    ),
    'through-origin': recipe(
      'Compare fitted deliveries per minute when a crew’s estimate assumes zero work at zero time.',
      ['2,4,6,8', '14,30,41,55'],
      ['2,4,6,8', '20,38,56,76'],
    ),
    cosine: recipe(
      'Compare similarity between a desired material mix and two observed supply mixes.',
      ['64,48,16', '48,64,32'],
      ['64,48,16', '62,50,18'],
    ),
    concordance: recipe(
      'Compare agreement between planned and audited deposits for two accounting passes.',
      ['21,34,47,68', '26,39,54,74'],
      ['21,34,47,68', '22,33,48,70'],
    ),
    'mean-bias': recipe(
      'Compare systematic overestimation of wheat harvests under two forecasting methods.',
      ['35,37,40,43', '39,41,42,46'],
      ['35,37,40,43', '34,38,42,43'],
    ),
    'absolute-error': recipe(
      'Compare average unsigned torch count errors for two tunnel length estimates.',
      ['16,24,32,48', '18,31,29,41'],
      ['16,24,32,48', '17,25,35,48'],
    ),
    'maximum-error': recipe(
      'Compare worst material count miss under two wall estimation methods.',
      ['40,52,68,95', '45,55,68,85'],
      ['40,52,68,95', '37,52,72,92'],
    ),
    'percentage-error': recipe(
      'Compare relative stock forecast errors across stacks of different sizes.',
      ['12,32,64,96', '6,29,69,100'],
      ['12,32,64,96', '11,30,59,92'],
    ),
    'symmetric-error': recipe(
      'Compare relative ledger discrepancies including a chest empty in both records.',
      ['0,12,38,57', '0,16,34,62'],
      ['0,12,38,57', '0,14,38,56'],
    ),
    'weighted-fit': recipe(
      'Compare fitted rail timing with equal weights and heavier weight on the busiest haul.',
      ['16,32,48,64', '7,11,15,24', '1,1,1,1'],
      ['16,32,48,64', '7,11,15,24', '1,1,1,4'],
    ),
    lagged: recipe(
      'Compare dispatch and receipt correlations at zero and one interval of lag.',
      ['1,5,3,6,2,7', '0,1,5,3,6,2', 0],
      ['1,5,3,6,2,7', '0,1,5,3,6,2', 1],
    ),
    'difference-series': recipe(
      'Compare paired shortfalls from two count methods against audited stock.',
      ['37,42,51,60', '42,44,51,62'],
      ['39,44,50,62', '42,44,51,62'],
    ),
    'pair-midpoints': recipe(
      'Compare midpoint elevation for two alternative upper edges of a terrace.',
      ['62,64,65,66', '70,74,76,78'],
      ['62,64,65,66', '68,71,75,76'],
    ),
    'difference-limits': recipe(
      'Compare average bias and descriptive limits for two pairs of survey methods.',
      ['62,65,68,73', '61,67,71,72', 2],
      ['62,65,68,73', '62,66,69,73', 2],
    ),
  },
  anomaly: {
    'z-flags': recipe(
      'Compare which hauling durations are flagged under two standard-deviation cutoffs.',
      ['11,12,14,16,42', 1.5],
      ['11,12,14,16,42', 2],
    ),
    'mad-flags': recipe(
      'Compare robust anomaly flags when one furnace run takes unusually long.',
      ['8,10,11,13,14', 3],
      ['8,10,11,13,40', 3],
    ),
    'iqr-fences': recipe(
      'Compare acceptable cart delay fences under two interquartile multipliers.',
      ['4,6,7,9,12,18', 1],
      ['4,6,7,9,12,18', 1.5],
    ),
    'iqr-flags': recipe(
      'Compare flagged smelting durations with tighter and wider interquartile fences.',
      ['8,10,12,14,16,21', 0.75],
      ['8,10,12,14,16,21', 1.5],
    ),
    'range-flags': recipe(
      'Compare stock count alerts under narrow and expanded reserve bands.',
      ['12,20,36,43,48', 18, 42],
      ['12,20,36,43,48', 12, 48],
    ),
    'jump-flags': recipe(
      'Compare which inventory swings trigger a one-stack versus two-stack alert.',
      ['64,120,196,151,19', 64],
      ['64,120,196,151,19', 128],
    ),
    'relative-jumps': recipe(
      'Compare large proportional changes in harvest counts under two alert thresholds.',
      ['40,48,76,65,90', 0.3],
      ['40,48,76,65,90', 0.5],
    ),
    'flat-runs': recipe(
      'Compare which stretches of unchanged furnace output meet two minimum durations.',
      ['24,24,32,40,40,40,42', 2],
      ['24,24,32,40,40,40,42', 3],
    ),
    'zero-runs': recipe(
      'Compare stretches of missed deliveries before and after adding a second runner.',
      ['2,0,0,0,3,0,4'],
      ['2,0,1,0,3,2,4'],
    ),
    'duplicate-count': recipe(
      'Compare repeated delivery batch sizes under fixed and variable load schedules.',
      ['16,16,16,16,12,12'],
      ['16,16,18,14,12,12'],
    ),
    'local-peaks': recipe(
      'Compare the placement of brief smelting demand peaks under two schedules.',
      ['12,24,18,30,14,19,13'],
      ['12,18,29,26,23,31,13'],
    ),
    'local-troughs': recipe(
      'Compare inventory troughs before and after staggering chest withdrawals.',
      ['48,22,32,17,38,24,43'],
      ['48,31,37,34,39,44,43'],
    ),
    hampel: recipe(
      'Compare local outlier flags for hopper deposit counts under two sensitivity limits.',
      ['12,13,14,29,15,16,14', 2, 3],
      ['12,13,14,29,15,16,14', 2, 20],
    ),
    'replace-range': recipe(
      'Compare replacement of survey offsets outside two permissible ranges.',
      ['-5,-2,-1,1,4', -2, 2, 0],
      ['-5,-2,-1,1,4', -4, 4, 0],
    ),
    'clip-z': recipe(
      'Compare how two deviation limits clip an unusually slow crafting batch.',
      ['8,9,8,10,34', 1],
      ['8,9,8,10,34', 1.5],
    ),
    'threshold-duration': recipe(
      'Compare minutes spent above two backlog limits at two-minute sampling intervals.',
      ['4,8,10,5,9,3', 6, 2],
      ['4,8,10,5,9,3', 9, 2],
    ),
    'breach-runs': recipe(
      'Compare out-of-band stock runs before and after a mid-shift resupply.',
      ['12,11,10,30,45,47,32', 16, 40],
      ['12,18,22,30,45,38,32', 16, 40],
    ),
    'missing-slots': recipe(
      'Compare missed checkpoints in two schedules with two-minute sampling.',
      ['0,2,6,8,14', 2],
      ['0,2,4,8,10,12,14', 2],
    ),
    'timing-jitter': recipe(
      'Compare interval drift for two hopper counters with a target four-tick cadence.',
      ['0,4,10,13,16', 4],
      ['0,4,9,12,16', 4],
    ),
    'sign-reversals': recipe(
      'Compare sign flips in the gap between production and demand for two shifts.',
      ['8,-3,-2,4,0,-1'],
      ['8,2,-2,-3,0,-1'],
    ),
    'rolling-range': recipe(
      'Compare range of observed stock variation over two-trip and three-trip windows.',
      ['30,42,33,48,37,45', 2],
      ['30,42,33,48,37,45', 3],
    ),
    'rolling-volatility': recipe(
      'Compare rolling haul-time variability before and after improving the track.',
      ['8,15,9,16,11,17', 3],
      ['8,11,10,13,12,14', 3],
    ),
    'excess-area': recipe(
      'Compare cumulative queue backlog above two dispatch thresholds.',
      ['5,8,11,12,8', 6, 2],
      ['5,8,11,12,8', 9, 2],
    ),
    'deficit-area': recipe(
      'Compare cumulative food stock shortages against two reserve targets.',
      ['40,22,18,37,42', 24, 5],
      ['40,22,18,37,42', 32, 5],
    ),
    'longest-breach': recipe(
      'Compare the longest uninterrupted stock alert under two refill schedules.',
      ['10,11,12,32,12,22', 16, 40],
      ['10,18,16,32,12,22', 16, 40],
    ),
  },
  smooth: {
    'trailing-sum': recipe(
      'Compare total blocks delivered within short and long rolling trip windows.',
      ['12,16,23,14,19,28', 2],
      ['12,16,23,14,19,28', 3],
    ),
    'trailing-min': recipe(
      'Compare recent low stock readings in two-check and three-check windows.',
      ['45,32,28,38,35,44', 2],
      ['45,32,28,38,35,44', 3],
    ),
    'trailing-max': recipe(
      'Compare moving peak furnace demand over two possible sampling windows.',
      ['6,11,5,8,17,9', 2],
      ['6,11,5,8,17,9', 3],
    ),
    'trailing-quantile': recipe(
      'Compare the median and upper quartile of haul times within four-trip windows.',
      ['14,16,24,13,11,19,22', 4, 0.5],
      ['14,16,24,13,11,19,22', 4, 0.75],
    ),
    'trailing-rms': recipe(
      'Compare rolling magnitude of signed tunnel survey offsets under two alignments.',
      ['1,-2,3,-4,2', 3],
      ['0,-1,2,-1,1', 3],
    ),
    'centered-mean': recipe(
      'Compare central averaging at narrow and wide radii around rail elevation readings.',
      ['62,62,65,66,68,66,65', 1],
      ['62,62,65,66,68,66,65', 2],
    ),
    'centered-median': recipe(
      'Compare how two median windows treat spikes in measured redstone delays.',
      ['8,9,19,10,11,14,9', 1],
      ['8,9,19,10,11,14,9', 2],
    ),
    exponential: recipe(
      'Compare fast and slow smoothing responses to a jump in crop output.',
      ['24,22,23,42,44,42', 0.25],
      ['24,22,23,42,44,42', 0.75],
    ),
    'double-exponential': recipe(
      'Compare two response speeds for double-smoothed supply counts.',
      ['12,11,19,9,24,27', 0.3],
      ['12,11,19,9,24,27', 0.7],
    ),
    holt: recipe(
      'Compare how quickly Holt’s trend estimate adjusts after two extra furnaces come online.',
      ['16,22,28,46,61,77', 0.5, 0.2],
      ['16,22,28,46,61,77', 0.5, 0.8],
    ),
    'weighted-window': recipe(
      'Compare equal weights and recent-trip emphasis for a rolling travel-time estimate.',
      ['18,32,23,17,15,19', '1,1,1'],
      ['18,32,23,17,15,19', '1,2,4'],
    ),
    triangular: recipe(
      'Compare narrow and wide triangular smoothing of hillside measurements.',
      ['62,64,67,71,69,64,62', 1],
      ['62,64,67,71,69,64,62', 2],
    ),
    gaussian: recipe(
      'Compare tight and loose Gaussian weighting of elevations along the same path.',
      ['63,63,65,72,67,65,65', 2, 0.6],
      ['63,63,65,72,67,65,65', 2, 1.5],
    ),
    'block-means': recipe(
      'Compare average ore haul per two-trip and three-trip accounting groups.',
      ['12,17,14,26,23,19,32', 2],
      ['12,17,14,26,23,19,32', 3],
    ),
    'block-totals': recipe(
      'Compare how supply counts aggregate into two-run and four-run delivery cycles.',
      ['22,18,24,26,14,22,17', 2],
      ['22,18,24,26,14,22,17', 4],
    ),
    'block-medians': recipe(
      'Compare median trip times grouped in blocks of three or five.',
      ['11,14,23,13,19,27,15', 3],
      ['11,14,23,13,19,27,15', 5],
    ),
    'cumulative-mean': recipe(
      'Compare how quickly average mining output settles under two tool loadouts.',
      ['14,34,29,37,45'],
      ['25,28,27,30,31'],
    ),
    'cumulative-min': recipe(
      'Compare the lowest reserve observed so far under two withdrawal schedules.',
      ['66,48,51,42,30'],
      ['66,57,62,51,49'],
    ),
    'cumulative-max': recipe(
      'Compare when each depot first observes a higher queue size.',
      ['4,7,5,11,9,12'],
      ['4,6,8,7,9,10'],
    ),
    detrend: recipe(
      'Compare departures from fitted linear build progress for two crews.',
      ['12,26,33,48,62'],
      ['12,24,36,48,60'],
    ),
    residual: recipe(
      'Compare an actual supply trajectory against original and revised forecasts.',
      ['32,24,36,30', '29,27,26,24'],
      ['32,24,36,30', '32,26,33,29'],
    ),
    'median-replace': recipe(
      'Compare cleanup of isolated spikes in smelting durations under two limits.',
      ['9,11,24,13,12,10', 1, 8],
      ['9,11,24,13,12,10', 1, 12],
    ),
    'forward-hold': recipe(
      'Compare held stock readings at the same time checkpoints under two delivery schedules.',
      ['0,4,9,13', '64,44,80,56', '2,5,8,12'],
      ['0,4,9,13', '64,56,84,62', '2,5,8,12'],
    ),
    'nearest-hold': recipe(
      'Compare nearest-stake elevations under sparse and dense survey sampling.',
      ['0,8,16', '62,68,73', '2,5,11,14'],
      ['0,4,8,12,16', '62,65,68,70,73', '2,5,11,14'],
    ),
    'convolve-valid': recipe(
      'Compare adjacent stock changes from two delivery schedules using the same difference kernel.',
      ['56,44,36,68,52', '-1,1'],
      ['56,48,40,64,57', '-1,1'],
    ),
  },
  trend: {
    rates: recipe(
      'Compare production rates between unevenly timed smelting checkpoints.',
      ['0,3,7,12', '0,18,45,82'],
      ['0,3,7,12', '0,22,53,91'],
    ),
    'rate-change': recipe(
      'Compare changes in throughput after successive route improvements.',
      ['0,3,7,12', '0,18,40,74'],
      ['0,3,7,12', '0,16,45,86'],
    ),
    'time-weighted-mean': recipe(
      'Compare average chest occupancy over the same time span with different refill timing.',
      ['0,2,8,10', '20,60,56,24'],
      ['0,4,6,10', '20,60,56,24'],
    ),
    'segment-slopes': recipe(
      'Compare early and late block placement rates around a crew handover.',
      ['0,2,4,6,8,10', '0,16,35,50,65,85', 3],
      ['0,2,4,6,8,10', '0,16,35,50,71,94', 3],
    ),
    'split-shift': recipe(
      'Compare mean fuel usage before and after two possible furnace switchovers.',
      ['14,15,16,22,24,25', 2],
      ['14,15,16,22,24,25', 3],
    ),
    'best-mean-split': recipe(
      'Compare likely demand change points with two minimum segment lengths.',
      ['16,16,16,32,34,33,34,34', 2],
      ['16,16,16,32,34,33,34,34', 4],
    ),
    'cumulative-deviation': recipe(
      'Compare cumulative quota surpluses and deficits under two per-run targets.',
      ['18,22,24,17,32', 20],
      ['18,22,24,17,32', 24],
    ),
    'positive-cusum': recipe(
      'Compare sustained queue buildup under two per-reading noise allowances.',
      ['8,12,17,14,10,18', 10, 1],
      ['8,12,17,14,10,18', 10, 3],
    ),
    'negative-cusum': recipe(
      'Compare detection of accumulated farm yield shortfalls against two targets.',
      ['20,18,17,22,15,12', 18, 1],
      ['20,18,17,22,15,12', 20, 1],
    ),
    'monotone-runs': recipe(
      'Compare rises, descents and level stretches in two railway bed profiles.',
      ['64,64,65,67,66,65,65'],
      ['64,65,66,67,67,66,65'],
    ),
    'total-variation': recipe(
      'Compare total vertical movement along two paths with identical endpoints.',
      ['62,65,69,64,70'],
      ['62,64,66,67,70'],
    ),
    'direction-efficiency': recipe(
      'Compare how directly two stockpiles climb from 20 to 60 blocks.',
      ['20,31,44,36,60'],
      ['20,33,41,49,60'],
    ),
    'up-down': recipe(
      'Compare rising, falling and unchanged stock checks under two restock policies.',
      ['20,28,24,24,38,29'],
      ['20,26,29,31,31,37'],
    ),
    'recovery-time': recipe(
      'Compare how long two depots take to regain their 32-block reserve.',
      ['0,3,6,9,12', '42,20,22,28,38', 32],
      ['0,3,6,9,12', '42,20,34,36,40', 32],
    ),
    'peak-delay': recipe(
      'Compare when the highest cart backlog arrives under two dispatch schedules.',
      ['0,3,7,11', '4,7,12,8'],
      ['0,3,7,11', '4,11,8,6'],
    ),
    'valley-delay': recipe(
      'Compare the time to lowest fuel stock under early and late deliveries.',
      ['0,4,8,12', '28,20,14,32'],
      ['0,4,8,12', '28,14,32,26'],
    ),
    'threshold-arrivals': recipe(
      'Compare estimated times to cross a 48-block reserve after morning deliveries.',
      ['0,3,7,12', '26,39,57,62', 48],
      ['0,3,7,12', '26,47,68,73', 48],
    ),
    'threshold-departures': recipe(
      'Compare estimated times to fall below a 40-block reserve under two usage schedules.',
      ['0,3,7,12', '64,52,37,30', 40],
      ['0,3,7,12', '64,58,44,28', 40],
    ),
    'rolling-slopes': recipe(
      'Compare short and long rolling throughput slopes during a smelter ramp-up.',
      ['8,12,15,26,42,47,51', 3],
      ['8,12,15,26,42,47,51', 5],
    ),
    'endpoint-rate': recipe(
      'Compare whole-shift placement rates for two retaining-wall crews.',
      ['0,5,11,20', '0,32,56,128'],
      ['0,5,11,20', '0,38,81,146'],
    ),
    'baseline-ratios': recipe(
      'Compare daily fuel usage as proportions of two established budgets.',
      ['28,32,38,35', 32],
      ['28,32,38,35', 40],
    ),
    'growth-factors': recipe(
      'Compare per-harvest growth factors for two three-interval crop sequences.',
      ['12,17,23,33', 3],
      ['12,20,30,42', 3],
    ),
    roughness: recipe(
      'Compare abrupt elevation changes for rocky and graded rail beds.',
      ['63,66,64,70,69,73'],
      ['63,65,67,69,71,73'],
    ),
    'turning-count': recipe(
      'Compare strict elevation reversals along two ravine traverses.',
      ['68,65,67,63,65,62'],
      ['68,66,65,64,65,62'],
    ),
    'step-residuals': recipe(
      'Compare incremental path elevations against one-block and two-block grade targets.',
      ['62,63,66,67,69', 1],
      ['62,63,66,67,69', 2],
    ),
  },
  probability: {
    complement: recipe(
      'Compare modeled chances of a late delivery under two on-time rate assumptions.',
      [0.82],
      [0.94],
    ),
    'independent-all': recipe(
      'Compare the chance all three independently modeled orders arrive on time under two supplier plans.',
      ['0.9,0.8,0.7'],
      ['0.9,0.85,0.8'],
    ),
    'independent-any': recipe(
      'Compare the chance of finding at least one target ore on three independently modeled branches.',
      ['0.18,0.24,0.2'],
      ['0.2,0.28,0.3'],
    ),
    'exactly-one': recipe(
      'Compare the chance of exactly one lift call during three independently modeled intervals.',
      ['0.18,0.32,0.46'],
      ['0.17,0.24,0.3'],
    ),
    'binomial-mass': recipe(
      'Compare chances of exactly four successful unloads across six independent test runs.',
      [6, 4, 0.75],
      [6, 4, 0.85],
    ),
    'binomial-at-most': recipe(
      'Compare chances of harvesting from at most three of eight independently modeled test plots.',
      [8, 3, 0.55],
      [8, 3, 0.65],
    ),
    'binomial-at-least': recipe(
      'Compare chances of passing a five-success quota with eight or ten independent tests.',
      [8, 5, 0.7],
      [10, 5, 0.7],
    ),
    'binomial-moments': recipe(
      'Compare expected successful dispatches and their variance for two assumed dispatch rates.',
      [24, 0.65],
      [24, 0.8],
    ),
    'no-success': recipe(
      'Compare the chance of finding no desired trade in six or ten independent attempts.',
      [6, 0.14],
      [10, 0.14],
    ),
    'trials-for-success': recipe(
      'Compare independent trip budgets for an 85 or 95 percent chance of at least one find.',
      [0.85, 0.22],
      [0.95, 0.22],
    ),
    'geometric-mean': recipe(
      'Compare expected tunnel attempts to the first find under two assumed chances.',
      [0.12],
      [0.18],
    ),
    'geometric-mass': recipe(
      'Compare probabilities of a first successful collection on the fifth independent run.',
      [5, 0.2],
      [5, 0.36],
    ),
    'geometric-quantile': recipe(
      'Compare when independent attempts reach the 90th percentile for two assumed trade chances.',
      [0.9, 0.08],
      [0.9, 0.14],
    ),
    'expected-value': recipe(
      'Compare expected block yield under stated probabilities for two routes.',
      ['12,24,48', '0.4,0.4,0.2'],
      ['12,24,48', '0.2,0.5,0.3'],
    ),
    'outcome-variance': recipe(
      'Compare delivery variability for two schedules with three possible outputs.',
      ['8,24,40', '0.2,0.6,0.2'],
      ['16,24,32', '0.2,0.6,0.2'],
    ),
    'expected-utility': recipe(
      'Compare a steady stock gain to a riskier plan under the same stock gain utility scale.',
      ['8,10,12', '0.2,0.6,0.2', 10],
      ['-4,12,24', '0.2,0.6,0.2', 10],
    ),
    conditional: recipe(
      'Compare the conditional chance of a missed batch among runs that start late.',
      [0.12, 0.3],
      [0.07, 0.28],
    ),
    bayes: recipe(
      'Compare how two detector false-positive rates change estimated blockage probability after an alert.',
      [0.1, 0.85, 0.12],
      [0.1, 0.85, 0.05],
    ),
    union: recipe(
      'Compare the chance of either rail segment requiring repair under two overlap assumptions.',
      [0.24, 0.19, 0.06],
      [0.24, 0.19, 0.12],
    ),
    odds: recipe('Compare odds in favor of reaching the depot before a modeled deadline.', [0.7], [0.85]),
    'from-odds': recipe('Translate two assumed odds in favor of finishing a dig quota into chances.', [1.5], [2.5]),
    'risk-ratio': recipe(
      'Compare the relative risk of missing a fuel restock under two candidate dispatch policies.',
      [0.18, 0.1],
      [0.12, 0.1],
    ),
    'risk-difference': recipe(
      'Compare absolute trip failure risk gaps against the same reference route.',
      [0.16, 0.1],
      [0.08, 0.1],
    ),
    mixture: recipe(
      'Compare overall rail delay chance when most trips move from the ridge to the valley.',
      ['7,3', '0.18,0.07'],
      ['3,7', '0.18,0.07'],
    ),
    'bounded-loss': recipe(
      'Compare expected stock losses when two transport load caps limit loss per trip.',
      ['0,24,64', '0.6,0.3,0.1', 32],
      ['0,24,64', '0.6,0.3,0.1', 48],
    ),
  },
  experiment: {
    'mean-change': recipe(
      'Compare average yield changes for two harvest tools against the same reference sample.',
      ['25,28,20,31', '28,32,37'],
      ['25,28,20,31', '26,28,33,31,32'],
    ),
    'median-change': recipe(
      'Compare changes in typical cart times for two proposed track repairs.',
      ['17,18,23,26,29', '14,18,19,20,31'],
      ['17,18,23,26,29', '12,17,18,27,30'],
    ),
    'paired-change': recipe(
      'Compare per-plot yield changes for two irrigation plans on the same four plots.',
      ['24,34,28,30', '28,36,34,37'],
      ['24,34,28,30', '30,33,32,41'],
    ),
    'paired-percent': recipe(
      'Compare relative time changes on each of three routes after two infrastructure upgrades.',
      ['13,27,42', '12,23,34'],
      ['13,27,42', '11,25,37'],
    ),
    'pooled-variance': recipe(
      'Compare combined within-crew variation for two pairs of building crews.',
      ['8,10,11,13', '9,14,13,19'],
      ['8,10,11,13', '11,13,14,15'],
    ),
    'cohen-d': recipe(
      'Compare standardized throughput differences for two tool upgrades against a reference tool.',
      ['14,18,16,22', '21,24,29,25'],
      ['14,18,16,22', '19,23,25,26'],
    ),
    'glass-delta': recipe(
      'Compare output changes under two furnace expansions scaled by reference variability.',
      ['18,23,21,27', '24,28,32,26'],
      ['18,23,21,27', '25,30,36,29'],
    ),
    'probability-superiority': recipe(
      'Compare pairwise crop yield wins for two soil treatments against the same sample.',
      ['18,21,23,26', '20,24,26,29'],
      ['18,21,23,26', '16,19,24,31'],
    ),
    'cliff-delta': recipe(
      'Compare balance of harvest wins and losses when two tools face the same reference batch.',
      ['8,12,17,19', '9,12,19,21'],
      ['8,12,17,19', '10,11,15,17'],
    ),
    'standard-error': recipe(
      'Compare estimated mean placement-rate error before and after extending the trial.',
      ['23,28,38,24'],
      ['23,28,38,24,29,30,28,29'],
    ),
    'difference-error': recipe(
      'Compare standard errors for a difference in mean travel time using short and expanded samples.',
      ['6,9,12', '13,17,19'],
      ['6,9,12,8,9,10', '13,17,19,15,16,16'],
    ),
    'welch-statistic': recipe(
      'Compare how large haul-time shifts are relative to each independent sample’s standard error.',
      ['18,22,25,29', '13,18,19,22'],
      ['18,22,25,29', '16,18,23,25'],
    ),
    'paired-statistic': recipe(
      'Compare standardized within-route time differences after two surface changes.',
      ['19,32,25,36', '17,26,22,34'],
      ['19,32,25,36', '16,24,23,29'],
    ),
    'mean-band': recipe(
      'Compare two standard-error envelopes around mean fuel usage per batch.',
      ['27,30,25,38,31', 1],
      ['27,30,25,38,31', 2],
    ),
    proportion: recipe('Compare observed route completion fractions across two pilot groups.', [15, 20], [22, 26]),
    'proportion-error': recipe(
      'Compare estimated drop-off rate error at the same observed fraction with different sample sizes.',
      [12, 16],
      [36, 48],
    ),
    'wilson-band': recipe(
      'Compare Wilson bands for two pilot sizes that observe the same 80 percent completion rate.',
      [8, 10, 1.96],
      [32, 40, 1.96],
    ),
    'relative-lift': recipe(
      'Compare relative on-time delivery lifts for two dispatch rules against the same reference.',
      [12, 20, 15, 20],
      [12, 20, 19, 24],
    ),
    'number-needed': recipe(
      'Compare inverse absolute rate gaps for two modeled reductions in missed cart pickups.',
      [0.3, 0.24],
      [0.3, 0.18],
    ),
    'balanced-split': recipe(
      'Compare allocating 23 trials evenly across three or four storage layouts.',
      [23, 3],
      [23, 4],
    ),
    'weighted-mean': recipe(
      'Compare overall mean hauls with two possible allocations of trial runs to three crews.',
      ['14,24,32', '2,4,5'],
      ['14,24,32', '5,4,2'],
    ),
    'combined-variance': recipe(
      'Compare overall yield variability with equal or unequal sampling across plots.',
      ['16,24,37', '9,12,5', '4,4,4'],
      ['16,24,37', '9,12,5', '2,8,2'],
    ),
    'sign-test-counts': recipe(
      'Compare how many matched plots improve, worsen or tie under two planting patterns.',
      ['21,26,29,34,42', '23,26,30,30,46'],
      ['21,26,29,34,42', '20,28,29,31,43'],
    ),
    'minimum-detectable': recipe(
      'Compare detectable cart delay shifts from two standard-error assumptions.',
      [1.8, 2],
      [1.1, 2],
    ),
    'replication-budget': recipe(
      'Compare total trial counts and testing minutes for two furnace experiment schedules.',
      [6, 3, 2, 4],
      [6, 3, 3, 4],
    ),
  },
  scorecard: {
    'weighted-sum': recipe(
      'Compare build scores for two layouts with the same weights on access, storage and visibility.',
      ['7,9,6', '4,3,2'],
      ['8,7,8', '4,3,2'],
    ),
    'weighted-average': recipe(
      'Compare a route score when weights shift from speed toward ease of repair.',
      ['9,6,8', '5,2,3'],
      ['9,6,8', '2,5,3'],
    ),
    'weighted-geometric': recipe(
      'Compare a balanced depot and a depot with one low accessibility score.',
      ['7,7,8', '2,2,1'],
      ['9,4,9', '2,2,1'],
    ),
    'weighted-harmonic': recipe(
      'Compare throughput scores for two lines that prioritize the same unloading stage.',
      ['14,9,20', '1,3,1'],
      ['12,12,18', '1,3,1'],
    ),
    'minimum-score': recipe(
      'Compare the weakest terrain, access and capacity ratings before and after enlarging a depot.',
      ['8,4,4'],
      ['8,4,7'],
    ),
    'maximum-score': recipe(
      'Compare which features top each of two workshop layouts on a common score scale.',
      ['6,8,8,7'],
      ['9,7,8,6'],
    ),
    'target-attainment': recipe(
      'Compare delivered wood, stone and fuel against category targets for two shipments.',
      ['72,60,42', '64,80,32'],
      ['58,85,30', '64,80,32'],
    ),
    'capped-attainment': recipe(
      'Compare capped target fractions after moving spare stone into a shared storage hub.',
      ['72,56,36', '64,64,48'],
      ['60,68,36', '64,64,48'],
    ),
    'weighted-deficit': recipe(
      'Compare weighted shortages of glass, stone and wood when the glass deadline moves up.',
      ['20,54,80', '32,64,64', '2,1,1'],
      ['20,54,80', '32,64,64', '5,1,1'],
    ),
    'weighted-surplus': recipe(
      'Compare useful spare supply under two stock plans that prioritize lanterns.',
      ['20,64,40', '16,48,32', '3,1,2'],
      ['24,55,34', '16,48,32', '3,1,2'],
    ),
    'pass-count': recipe(
      'Compare how many material budgets meet minimum stock for two candidate manifests.',
      ['42,18,26,68', '40,24,24,64'],
      ['48,24,22,57', '40,24,24,64'],
    ),
    'all-pass': recipe(
      'Check whether a supplemental plank delivery clears every build minimum.',
      ['71,44,29', '64,48,24'],
      ['71,52,29', '64,48,24'],
    ),
    veto: recipe(
      'Compare which workshop requirements still fail after upgrading access.',
      ['3,7,5,9', '5,6,6,8'],
      ['6,7,5,9', '5,6,6,8'],
    ),
    dominates: recipe(
      'Compare whether two successive depot redesigns beat the original across all supplied scores.',
      ['8,6,7', '7,6,6'],
      ['9,5,8', '7,6,6'],
    ),
    'pair-margin': recipe(
      'Compare the weighted margin between depot layouts when travel ease gains priority.',
      ['9,5,8', '6,8,8', '2,3,1'],
      ['9,5,8', '6,8,8', '4,1,1'],
    ),
    'outrank-count': recipe(
      'Compare broader criterion wins for two roof redesigns against the original roof.',
      ['7,8,6,7', '6,8,7,7'],
      ['7,9,6,8', '6,8,7,7'],
    ),
    regret: recipe(
      'Compare per-resource shortfalls relative to an ideal supply delivery.',
      ['42,64,37', '48,64,32'],
      ['45,61,30', '48,64,32'],
    ),
    'maximum-regret': recipe(
      'Compare worst stock shortfall for two depot allocations against the same ideals.',
      ['71,44,18', '64,48,32'],
      ['60,39,30', '64,48,32'],
    ),
    'distance-ideal': recipe(
      'Compare weighted score distance from ideal access, storage and capacity ratings.',
      ['8,6,9', '10,10,10', '1,3,2'],
      ['7,9,8', '10,10,10', '1,3,2'],
    ),
    'cost-benefit': recipe(
      'Compare valued supply points per labor unit when a second mine route gets faster.',
      ['58,48,29', '9,12,8'],
      ['58,48,29', '9,8,8'],
    ),
    'net-benefit': recipe(
      'Compare net material equivalents for three proposals after revising estimated costs.',
      ['90,120,155', '56,83,108'],
      ['90,120,155', '62,79,99'],
    ),
    'rank-candidates': recipe(
      'Compare ranking of four delivery routes after revising two overall scores.',
      ['72,80,80,68'],
      ['82,80,79,68'],
    ),
    'top-candidates': recipe(
      'Compare two-route and three-route shortlists from the same review scores.',
      ['71,83,88,96,83', 2],
      ['71,83,88,96,83', 3],
    ),
    'weight-sensitivity': recipe(
      'Compare criterion margin sensitivities for two depot upgrades against one design.',
      ['8,5,9', '6,7,7'],
      ['7,8,6', '6,7,7'],
    ),
    'two-criterion-switch': recipe(
      'Compare the tradeoff weights where two alternate route designs tie the standard design.',
      ['9,4', '6,8'],
      ['8,5', '6,8'],
    ),
  },
  forecast: {
    'last-value': recipe(
      'Compare four-hour demand scenarios when the latest observation differs.',
      ['28,33,42,38', 4],
      ['28,33,42,46', 4],
    ),
    'historical-mean': recipe(
      'Compare average-based forecasts from pre-upgrade and post-upgrade placement histories.',
      ['45,52,58,53', 4],
      ['56,60,64,62', 4],
    ),
    'historical-median': recipe(
      'Compare median-based food forecasts before and after adding two harvest observations.',
      ['20,24,25,30,41', 3],
      ['20,24,25,30,41,36,46', 3],
    ),
    drift: recipe(
      'Compare three-step stock projections using endpoint changes under two hauling policies.',
      ['12,20,25,32', 3],
      ['12,22,28,38', 3],
    ),
    linear: recipe(
      'Compare projected furnace output from two irregularly sampled run histories.',
      ['0,2,5,9', '0,12,29,60', '10,12,15'],
      ['0,2,5,9', '0,16,39,74', '10,12,15'],
    ),
    'seasonal-repeat': recipe(
      'Compare demand projections repeating the final two or three dispatch intervals.',
      ['10,21,13,11,24,14', 2, 6],
      ['10,21,13,11,24,14', 3, 6],
    ),
    'seasonal-drift': recipe(
      'Compare two three-interval harvest cycle projections under different seasonal growth histories.',
      ['14,20,32,18,27,37', 3, 6],
      ['14,20,32,15,22,35', 3, 6],
    ),
    'constant-rate': recipe(
      'Compare projected inventory for two net hourly stock draw rates.',
      [96, -5, '0,2,4,6'],
      [96, -8, '0,2,4,6'],
    ),
    compound: recipe(
      'Compare modeled stockpile growth from two assumed weekly multipliers.',
      [32, 1.15, '0,1,2,4'],
      [32, 1.25, '0,1,2,4'],
    ),
    'bounded-growth': recipe(
      'Compare when a depot reaches capacity at two fixed delivery rates.',
      [24, 12, 64, '0,2,4,6'],
      [24, 8, 64, '0,2,4,6'],
    ),
    depletion: recipe(
      'Compare available torch stock over time under two use rates.',
      [72, 12, '0,2,4,6,8'],
      [72, 8, '0,2,4,6,8'],
    ),
    'time-to-target': recipe(
      'Compare time to the same glass quota for two furnace deployment rates.',
      [28, 120, 8],
      [28, 120, 13],
    ),
    'time-to-empty': recipe('Compare how many minutes coal lasts at two positive use rates.', [64, 4], [64, 7]),
    'reorder-time': recipe(
      'Compare when two fuel policies reach the same reserve threshold.',
      [96, 32, 7],
      [96, 32, 10],
    ),
    'exponential-decay': recipe(
      'Compare a modeled queue clearing trajectory under two assumed halving times.',
      [48, 2, '0,2,4,8'],
      [48, 4, '0,2,4,8'],
    ),
    doubling: recipe(
      'Compare modeled crop stock under two assumed doubling times.',
      [18, 3, '0,3,6,9'],
      [18, 4, '0,3,6,9'],
    ),
    logistic: recipe(
      'Compare capacity-limited depot occupancy curves under two assumed growth rates.',
      [18, 64, 0.3, '0,3,6,9'],
      [18, 64, 0.5, '0,3,6,9'],
    ),
    'damped-trend': recipe(
      'Compare furnace output trajectories when a short-lived production bump fades quickly or slowly.',
      [42, 8, 0.4, 5],
      [42, 8, 0.75, 5],
    ),
    'level-trend': recipe(
      'Compare expected build progress under two fixed trends from the same starting level.',
      [52, 7, 5],
      [52, 11, 5],
    ),
    'scenario-range': recipe(
      'Compare projected supply bounds from a broad and narrow range of assumed net delivery rates.',
      [72, -6, 10, '0,2,4,6'],
      [72, -2, 6, '0,2,4,6'],
    ),
    'error-band': recipe(
      'Compare fixed planning envelopes around the same block demand estimates.',
      ['34,48,72', 4, 1],
      ['34,48,72', 4, 2],
    ),
    'horizon-band': recipe(
      'Compare how quickly planning envelopes widen under two per-step stock error scales.',
      ['37,45,52,59', 2, 2],
      ['37,45,52,59', 4, 2],
    ),
    ensemble: recipe(
      'Compare two blends of recent-trip and historical haul forecasts.',
      ['32,44,52', '28,34,40', 0.25],
      ['32,44,52', '28,34,40', 0.75],
    ),
    'inventory-path': recipe(
      'Compare four-step stock trajectories with earlier or later deliveries and the same usage.',
      [40, '24,0,16,0', '16,24,12,10'],
      [40, '0,24,0,16', '16,24,12,10'],
    ),
    'forecast-errors': recipe(
      'Compare signed and aggregate errors for two forecasts against the same actual haul counts.',
      ['28,44,38,55', '32,36,40,49'],
      ['28,44,38,55', '30,42,37,53'],
    ),
  },
};
