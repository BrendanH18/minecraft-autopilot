# Offline measurement analysis

These ten command groups provide 250 independently callable calculations on
caller-supplied numeric measurements. They never read snapshots, contact a bridge,
execute gameplay, or change input files. Use consistent units within each command.
Numeric scalars must be finite and within ±1,000,000; CSV lists and JSON coordinate
lists have at most 1,000 entries. Positive, count, fraction, equal-length, window,
and nondegeneracy constraints are validated. Generated arrays are limited to
1,000 entries, including extra endpoints: Lorenz curves therefore permit at most
999 readings, and quantile grids at most 999 intervals. Binomial enumeration
supports at most 1,000 trials. Results outside the safe numeric range are rejected. The calculations describe supplied measurements or explicit
assumptions; they do not establish causes, statistical confidence, future accuracy,
Minecraft mechanics, or safe gameplay.

CSV arguments should be quoted. For a negative first token use Commander argument
separator `--`, for example `mc-agent series absolute -- '-2,0,3'`.
Indices are zero-based unless a command explicitly states otherwise. Quantiles
sort samples then linearly interpolate at `(n-1)*fraction`. Variance and SD use
population denominator n unless the description says sample. Smoothing windows
use complete trailing windows unless described as centered; centered edges are
clipped and normalized. Extrapolations use supplied rates without uncertainty
inference. Every group has 25 commands.

## `series`

Measurement algebra and sequence transforms.

| # | Command and arguments | Result and assumptions |
| --- | --- | --- |
| 1 | `series center <values>` | Subtract the sample mean from each reading. |
| 2 | `series standardize <values>` | Divide centered readings by population standard deviation; constant readings are rejected. |
| 3 | `series minmax-scale <values>` | Map sample minimum to zero and maximum to one. |
| 4 | `series unit-sum <values>` | Normalize nonnegative readings to shares summing to one. |
| 5 | `series unit-length <values>` | Normalize readings to Euclidean unit length. |
| 6 | `series cumulative <values>` | Compute inclusive running totals. |
| 7 | `series differences <values> <lag>` | Subtract the reading lag positions earlier. |
| 8 | `series ratios <values>` | Compute adjacent reading ratios; zero predecessors are rejected. |
| 9 | `series log-changes <values>` | Compute adjacent natural logarithmic changes. |
| 10 | `series absolute <values>` | Map readings to magnitudes. |
| 11 | `series signed-root <values>` | Apply sign-preserving square-root compression. |
| 12 | `series winsorize <values> <fraction>` | Clamp readings to interpolated symmetric tail quantiles; fraction at most one half. |
| 13 | `series trim <values> <per-tail>` | Remove a whole number of sorted readings from each tail. |
| 14 | `series subsample <values> <stride> <offset>` | Keep a zero-based offset and each stride thereafter. |
| 15 | `series reverse-difference <values>` | Subtract each reading from the final reading. |
| 16 | `series deviation-target <values> <target>` | Report signed errors relative to a supplied target. |
| 17 | `series clamp <values> <lower> <upper>` | Clamp readings to an explicitly supplied closed interval. |
| 18 | `series round-step <values> <step>` | Round readings to the nearest supplied step using JavaScript half-up rounding. |
| 19 | `series run-lengths <values>` | Encode consecutive identical readings as value/count records. |
| 20 | `series record-highs <values>` | List strictly new high readings with zero-based indices, including the first. |
| 21 | `series record-lows <values>` | List strictly new low readings with zero-based indices, including the first. |
| 22 | `series positive-part <values>` | Retain positive excess while replacing negative readings with zero. |
| 23 | `series soft-threshold <values> <threshold>` | Shrink magnitudes toward zero by a fixed threshold. |
| 24 | `series rescale <values> <lower> <upper>` | Map nonconstant sample extrema to a supplied output interval. |
| 25 | `series gap-fill <positions> <values> <queries>` | Linearly interpolate bounded queries between strictly increasing supplied positions. |

Example:

```sh
mc-agent series center -- '1,2,3'
```

The JSON `result` for this example is `[-1,0,1]`.

## `distribution`

Empirical frequency, concentration, and shape summaries.

| # | Command and arguments | Result and assumptions |
| --- | --- | --- |
| 26 | `distribution frequencies <values>` | Count each distinct numeric reading in ascending value order. |
| 27 | `distribution modes <values>` | Return every reading tied for the largest empirical frequency. |
| 28 | `distribution ecdf <values> <queries>` | Evaluate fraction of readings at or below each supplied query. |
| 29 | `distribution survival <values> <queries>` | Evaluate empirical fraction strictly greater than each query. |
| 30 | `distribution bin-counts <values> <edges>` | Count half-open bins; the last bin includes its upper endpoint; outside values are reported. |
| 31 | `distribution equal-width <values> <bins>` | Count equal-width empirical bins spanning nonconstant sample extrema. |
| 32 | `distribution quantile-grid <values> <intervals>` | Return equally spaced interpolated quantiles including both extrema. |
| 33 | `distribution midranks <values>` | Return ascending one-based average ranks for tied readings. |
| 34 | `distribution entropy <weights>` | Compute Shannon entropy in bits from normalized nonnegative weights. |
| 35 | `distribution effective-categories <weights>` | Exponentiate Shannon entropy to an effective category count. |
| 36 | `distribution concentration <weights>` | Compute sum of squared normalized category shares. |
| 37 | `distribution gini <values>` | Compute the empirical Gini coefficient for nonnegative nonzero-total readings. |
| 38 | `distribution lorenz <values>` | Return cumulative population and value shares from an initial origin. |
| 39 | `distribution top-share <values> <count>` | Compute share of the total held by the largest count readings. |
| 40 | `distribution bottom-share <values> <count>` | Compute share of the total held by the smallest count readings. |
| 41 | `distribution tail-mean <values> <fraction>` | Average readings at or above the interpolated upper-tail quantile. |
| 42 | `distribution mean-absolute-deviation <values>` | Average absolute distance from the sample mean. |
| 43 | `distribution median-absolute-deviation <values>` | Median absolute distance from the sample median, without scale correction. |
| 44 | `distribution root-mean-square <values>` | Compute square root of the mean squared reading. |
| 45 | `distribution geometric-mean <values>` | Compute exponentiated average natural logarithm of positive readings. |
| 46 | `distribution harmonic-mean <values>` | Compute reciprocal of average reciprocal for positive readings. |
| 47 | `distribution quadratic-entropy <weights>` | Compute one minus squared-share concentration. |
| 48 | `distribution bowley-skew <values>` | Compute quartile-based skewness; zero interquartile range is rejected. |
| 49 | `distribution excess-kurtosis <values>` | Compute population fourth standardized moment minus three. |
| 50 | `distribution central-moment <values> <order>` | Compute population central moment for a whole order from zero through six. |

Example:

```sh
mc-agent distribution frequencies -- '2,1,2'
```

The JSON `result` for this example is `[{"value":1,"count":1},{"value":2,"count":2}]`.

## `association`

Paired measurement relationships and linear fit diagnostics.

| # | Command and arguments | Result and assumptions |
| --- | --- | --- |
| 51 | `association covariance <first> <second>` | Compute population covariance of equal-length paired measurements. |
| 52 | `association sample-covariance <first> <second>` | Compute covariance with denominator n minus one. |
| 53 | `association pearson <first> <second>` | Compute Pearson linear correlation; constant sides are rejected. |
| 54 | `association spearman <first> <second>` | Compute correlation of average ranks with tie handling. |
| 55 | `association kendall <first> <second>` | Compute Kendall tau-b accounting for ties in either side. |
| 56 | `association linear-fit <predictors> <responses>` | Fit response equals intercept plus slope times predictor using least squares. |
| 57 | `association predict <predictors> <responses> <queries>` | Evaluate the fitted linear response at supplied predictor queries. |
| 58 | `association residuals <predictors> <responses>` | Subtract fitted response from every observed response. |
| 59 | `association r-squared <predictors> <responses>` | Compute squared Pearson correlation for a fitted intercept model. |
| 60 | `association squared-error <predictors> <responses>` | Sum squared residuals of the least-squares intercept model. |
| 61 | `association root-error <predictors> <responses>` | Compute residual root mean squared error with population denominator. |
| 62 | `association leverage <predictors>` | Compute diagonal leverage values for an intercept-plus-slope design. |
| 63 | `association through-origin <predictors> <responses>` | Fit slope with the intercept explicitly constrained to zero. |
| 64 | `association cosine <first> <second>` | Compute vector cosine similarity without centering. |
| 65 | `association concordance <first> <second>` | Compute Lin concordance correlation using population moments. |
| 66 | `association mean-bias <reference> <measured>` | Average measured-minus-reference paired differences. |
| 67 | `association absolute-error <reference> <measured>` | Average absolute paired measurement error. |
| 68 | `association maximum-error <reference> <measured>` | Find largest absolute paired measurement error. |
| 69 | `association percentage-error <reference> <measured>` | Average absolute error divided by each positive reference, as a fraction. |
| 70 | `association symmetric-error <first> <second>` | Average twice absolute difference over paired absolute magnitudes; zero pairs contribute zero. |
| 71 | `association weighted-fit <predictors> <responses> <weights>` | Fit an intercept and slope using explicit nonnegative observation weights. |
| 72 | `association lagged <first> <second> <lag>` | Correlate first readings with later second readings at a supplied nonnegative lag. |
| 73 | `association difference-series <first> <second>` | Return signed first-minus-second paired differences. |
| 74 | `association pair-midpoints <first> <second>` | Return paired means for agreement plotting. |
| 75 | `association difference-limits <first> <second> <multiplier>` | Report paired mean difference plus/minus a caller-supplied population SD multiplier. |

Example:

```sh
mc-agent association covariance -- '1,2,3' '2,4,6'
```

The JSON `result` for this example is `1.3333333333333333`.

## `anomaly`

Explicit descriptive threshold and outlier rules.

| # | Command and arguments | Result and assumptions |
| --- | --- | --- |
| 76 | `anomaly z-flags <values> <threshold>` | Flag readings whose absolute population z-score strictly exceeds a supplied threshold. |
| 77 | `anomaly mad-flags <values> <threshold>` | Flag deviations greater than a supplied multiple of unscaled median absolute deviation. |
| 78 | `anomaly iqr-fences <values> <multiplier>` | Calculate lower and upper Tukey-style fences with a supplied multiplier. |
| 79 | `anomaly iqr-flags <values> <multiplier>` | Flag readings strictly outside interpolated quartile fences. |
| 80 | `anomaly range-flags <values> <lower> <upper>` | Flag readings outside a supplied closed acceptable range. |
| 81 | `anomaly jump-flags <values> <maximum-jump>` | Flag adjacent absolute changes strictly greater than a supplied limit. |
| 82 | `anomaly relative-jumps <values> <fraction>` | Flag adjacent relative changes strictly greater than a supplied fraction. |
| 83 | `anomaly flat-runs <values> <minimum-length>` | Report maximal identical-value runs at least the supplied length. |
| 84 | `anomaly zero-runs <values>` | Report maximal zero-reading runs with zero-based start and length. |
| 85 | `anomaly duplicate-count <values>` | Count observations after the first occurrence of each distinct value. |
| 86 | `anomaly local-peaks <values>` | List strict interior peaks with zero-based positions. |
| 87 | `anomaly local-troughs <values>` | List strict interior troughs with zero-based positions. |
| 88 | `anomaly hampel <values> <radius> <multiplier>` | Flag centered local median deviations beyond multiplier times unscaled local MAD. |
| 89 | `anomaly replace-range <values> <lower> <upper> <replacement>` | Replace readings outside an acceptable interval with an explicit value. |
| 90 | `anomaly clip-z <values> <maximum-z>` | Clamp readings to mean plus/minus supplied population SD multiple. |
| 91 | `anomaly threshold-duration <values> <threshold> <sample-duration>` | Estimate above-threshold duration using equal-width held samples. |
| 92 | `anomaly breach-runs <values> <lower> <upper>` | Report maximal out-of-range runs including peak absolute boundary excess. |
| 93 | `anomaly missing-slots <times> <cadence>` | Estimate missed regular samples from integer cadence multiples between observations. |
| 94 | `anomaly timing-jitter <times> <cadence>` | Report signed deviation of observed adjacent gaps from an expected cadence. |
| 95 | `anomaly sign-reversals <values>` | Report adjacent strict positive/negative sign reversals; zeros do not bridge. |
| 96 | `anomaly rolling-range <values> <window>` | Report local complete-window maximum-minus-minimum spans. |
| 97 | `anomaly rolling-volatility <values> <window>` | Report local complete-window population standard deviations. |
| 98 | `anomaly excess-area <values> <threshold> <sample-duration>` | Sum positive threshold excess multiplied by equal sample duration. |
| 99 | `anomaly deficit-area <values> <threshold> <sample-duration>` | Sum positive threshold deficits multiplied by equal sample duration. |
| 100 | `anomaly longest-breach <values> <lower> <upper>` | Count the longest consecutive run outside a supplied acceptable range. |

Example:

```sh
mc-agent anomaly z-flags -- '0,0,3' '1'
```

The JSON `result` for this example is `[false,false,true]`.

## `smooth`

Bounded descriptive filters and sequence aggregation.

| # | Command and arguments | Result and assumptions |
| --- | --- | --- |
| 101 | `smooth trailing-sum <values> <window>` | Compute complete trailing-window sums. |
| 102 | `smooth trailing-min <values> <window>` | Compute complete trailing-window minima. |
| 103 | `smooth trailing-max <values> <window>` | Compute complete trailing-window maxima. |
| 104 | `smooth trailing-quantile <values> <window> <fraction>` | Compute an interpolated quantile for each complete trailing window. |
| 105 | `smooth trailing-rms <values> <window>` | Compute complete trailing-window root mean squares. |
| 106 | `smooth centered-mean <values> <radius>` | Average centered windows clipped to sample boundaries. |
| 107 | `smooth centered-median <values> <radius>` | Take centered medians with windows clipped at sample boundaries. |
| 108 | `smooth exponential <values> <alpha>` | Apply exponential smoothing initialized from the first observation. |
| 109 | `smooth double-exponential <values> <alpha>` | Apply two successive identical exponential smoothing passes. |
| 110 | `smooth holt <values> <alpha> <beta>` | Return Holt level/trend records initialized from first reading and first difference. |
| 111 | `smooth weighted-window <values> <weights>` | Compute trailing weighted means with weights ordered oldest to newest. |
| 112 | `smooth triangular <values> <radius>` | Apply centered triangular weights, renormalizing clipped edges. |
| 113 | `smooth gaussian <values> <radius> <sigma>` | Apply bounded centered Gaussian weights with clipped-edge normalization. |
| 114 | `smooth block-means <values> <block-size>` | Average disjoint consecutive blocks, retaining a final partial block. |
| 115 | `smooth block-totals <values> <block-size>` | Sum disjoint consecutive blocks, retaining a final partial block. |
| 116 | `smooth block-medians <values> <block-size>` | Take medians in disjoint blocks, retaining a final partial block. |
| 117 | `smooth cumulative-mean <values>` | Compute an expanding arithmetic mean after each reading. |
| 118 | `smooth cumulative-min <values>` | Compute the minimum observed through each sample. |
| 119 | `smooth cumulative-max <values>` | Compute the maximum observed through each sample. |
| 120 | `smooth detrend <values>` | Subtract a fitted intercept and linear sample-index trend. |
| 121 | `smooth residual <values> <baseline>` | Subtract an explicitly supplied baseline series. |
| 122 | `smooth median-replace <values> <radius> <limit>` | Replace a reading by its local median only when absolute deviation exceeds a supplied limit. |
| 123 | `smooth forward-hold <times> <values> <queries>` | Evaluate left-held readings for queries within observed time bounds. |
| 124 | `smooth nearest-hold <positions> <values> <queries>` | Choose the nearest recorded sample for bounded queries, taking the earlier sample on ties. |
| 125 | `smooth convolve-valid <values> <kernel>` | Apply oldest-to-newest dot products over each complete window, without normalization. |

Example:

```sh
mc-agent smooth trailing-sum -- '1,2,3,4' '2'
```

The JSON `result` for this example is `[3,5,7]`.

## `trend`

Ordered measurement rates, changes, and piecewise summaries.

| # | Command and arguments | Result and assumptions |
| --- | --- | --- |
| 126 | `trend rates <times> <values>` | Compute adjacent value changes per supplied time unit. |
| 127 | `trend rate-change <times> <values>` | Compute differences between consecutive per-time rates. |
| 128 | `trend time-weighted-mean <times> <values>` | Compute mean under piecewise-linear interpolation over observed time. |
| 129 | `trend segment-slopes <times> <values> <split>` | Fit separate slopes before and after a zero-based split; each side needs two samples. |
| 130 | `trend split-shift <values> <split>` | Compare means on either side of a zero-based split. |
| 131 | `trend best-mean-split <values> <minimum-side>` | Find the earliest split minimizing within-side squared deviations with minimum sample counts. |
| 132 | `trend cumulative-deviation <values> <reference>` | Accumulate signed deviations from a fixed reference. |
| 133 | `trend positive-cusum <values> <reference> <allowance>` | Compute one-sided cumulative positive shifts with a supplied allowance. |
| 134 | `trend negative-cusum <values> <reference> <allowance>` | Compute one-sided cumulative negative shifts with a supplied allowance. |
| 135 | `trend monotone-runs <values>` | Report maximal runs of equal adjacent-change sign, including flat runs. |
| 136 | `trend total-variation <values>` | Sum absolute adjacent changes. |
| 137 | `trend direction-efficiency <values>` | Divide absolute endpoint change by total variation; constant paths return zero. |
| 138 | `trend up-down <values>` | Count rising, falling, and unchanged adjacent steps. |
| 139 | `trend recovery-time <times> <values> <threshold>` | Find first observed recovery to threshold after the first observed below-threshold reading, or null. |
| 140 | `trend peak-delay <times> <values>` | Report time from first reading to earliest observed maximum. |
| 141 | `trend valley-delay <times> <values>` | Report time from first reading to earliest observed minimum. |
| 142 | `trend threshold-arrivals <times> <values> <threshold>` | Linearly interpolate upward threshold crossings between observed samples. |
| 143 | `trend threshold-departures <times> <values> <threshold>` | Linearly interpolate downward threshold crossings between observed samples. |
| 144 | `trend rolling-slopes <values> <window>` | Fit sample-index slopes for complete windows of at least two readings. |
| 145 | `trend endpoint-rate <times> <values>` | Compute overall endpoint change per elapsed supplied time unit. |
| 146 | `trend baseline-ratios <values> <baseline>` | Express each reading as a fraction of a positive fixed baseline. |
| 147 | `trend growth-factors <values> <periods>` | Compute constant per-period geometric factor between first and last positive readings. |
| 148 | `trend roughness <values>` | Compute mean squared second difference; at least three samples required. |
| 149 | `trend turning-count <values>` | Count strict local direction reversals, excluding flat adjacent changes. |
| 150 | `trend step-residuals <values> <expected-step>` | Report deviations of observed adjacent increments from a supplied expected increment. |

Example:

```sh
mc-agent trend rates -- '0,2,5' '1,5,14'
```

The JSON `result` for this example is `[2,3]`.

## `probability`

Explicit independent-event and discrete outcome arithmetic.

| # | Command and arguments | Result and assumptions |
| --- | --- | --- |
| 151 | `probability complement <chance>` | Compute probability of the complementary event. |
| 152 | `probability independent-all <chances>` | Multiply supplied independent event probabilities. |
| 153 | `probability independent-any <chances>` | Compute chance at least one independent supplied event occurs. |
| 154 | `probability exactly-one <chances>` | Compute chance of exactly one event among independent nonidentical supplied events. |
| 155 | `probability binomial-mass <trials> <successes> <chance>` | Evaluate binomial mass under identical independent trial assumptions. |
| 156 | `probability binomial-at-most <trials> <successes> <chance>` | Sum binomial mass from zero through the supplied success count. |
| 157 | `probability binomial-at-least <trials> <successes> <chance>` | Sum binomial mass from the supplied count through all trials. |
| 158 | `probability binomial-moments <trials> <chance>` | Report mean and variance of a supplied binomial model. |
| 159 | `probability no-success <trials> <chance>` | Compute chance of no success in identical independent trials. |
| 160 | `probability trials-for-success <target-chance> <chance-per-trial>` | Find minimum independent trials for at-least-one success; impossible targets are rejected. |
| 161 | `probability geometric-mean <chance>` | Compute expected trial count through first success; positive chance required. |
| 162 | `probability geometric-mass <trial> <chance>` | Compute chance first success occurs at a specified one-based trial. |
| 163 | `probability geometric-quantile <fraction> <chance>` | Find one-based geometric quantile; zero fraction returns one. |
| 164 | `probability expected-value <outcomes> <probabilities>` | Compute weighted expectation for explicit probabilities summing to one. |
| 165 | `probability outcome-variance <outcomes> <probabilities>` | Compute variance of an explicitly supplied discrete distribution. |
| 166 | `probability expected-utility <outcomes> <probabilities> <risk>` | Average negative exponential utility under explicit outcome probabilities and supplied risk scale. |
| 167 | `probability conditional <intersection> <condition>` | Divide intersection probability by a positive condition probability, checking consistency. |
| 168 | `probability bayes <prior> <likelihood> <false-positive>` | Compute posterior from prior, true likelihood, and alternative likelihood. |
| 169 | `probability union <first> <second> <intersection>` | Calculate union chance with intersection consistency bounds. |
| 170 | `probability odds <chance>` | Convert probability below one to odds in favor. |
| 171 | `probability from-odds <odds>` | Convert nonnegative odds in favor to a probability. |
| 172 | `probability risk-ratio <first-chance> <second-chance>` | Divide first risk by a positive comparison risk. |
| 173 | `probability risk-difference <first-chance> <second-chance>` | Subtract comparison risk from first risk. |
| 174 | `probability mixture <weights> <chances>` | Compute weighted mixture probability using normalized nonnegative weights. |
| 175 | `probability bounded-loss <losses> <probabilities> <cap>` | Compute expected loss after capping each outcome at a supplied amount. |

Example:

```sh
mc-agent probability complement -- '.25'
```

The JSON `result` for this example is `0.75`.

## `experiment`

Descriptive comparisons of supplied trial and measurement batches.

| # | Command and arguments | Result and assumptions |
| --- | --- | --- |
| 176 | `experiment mean-change <before> <after>` | Compare independent batch means without assuming paired observations. |
| 177 | `experiment median-change <before> <after>` | Compare interpolated independent batch medians. |
| 178 | `experiment paired-change <before> <after>` | Report mean, population SD, and sample count of paired after-minus-before changes. |
| 179 | `experiment paired-percent <before> <after>` | Report each paired fractional change relative to a positive baseline. |
| 180 | `experiment pooled-variance <first> <second>` | Compute pooled within-batch sample variance; both batches need at least two readings. |
| 181 | `experiment cohen-d <first> <second>` | Compute second-minus-first mean change divided by pooled sample standard deviation. |
| 182 | `experiment glass-delta <baseline> <treatment>` | Divide mean change by baseline sample standard deviation. |
| 183 | `experiment probability-superiority <first> <second>` | Compute fraction of cross-batch comparisons where second is greater, with ties worth one half. |
| 184 | `experiment cliff-delta <first> <second>` | Compute second-greater minus first-greater fraction over all cross-batch pairs. |
| 185 | `experiment standard-error <values>` | Compute sample standard deviation divided by square root of count, without a confidence claim. |
| 186 | `experiment difference-error <first> <second>` | Compute square root of summed independent mean variance estimates. |
| 187 | `experiment welch-statistic <first> <second>` | Compute signed second-minus-first mean difference divided by its independent estimated standard error. |
| 188 | `experiment paired-statistic <before> <after>` | Compute mean paired change divided by its estimated standard error. |
| 189 | `experiment mean-band <values> <multiplier>` | Report mean plus/minus caller multiplier times estimated standard error; no inferred confidence level. |
| 190 | `experiment proportion <successes> <trials>` | Compute observed success fraction with successes bounded by trials. |
| 191 | `experiment proportion-error <successes> <trials>` | Compute plug-in binomial standard error of a supplied observed fraction. |
| 192 | `experiment wilson-band <successes> <trials> <multiplier>` | Compute Wilson score bounds using caller-supplied normal multiplier; no confidence level is inferred. |
| 193 | `experiment relative-lift <baseline-successes> <baseline-trials> <new-successes> <new-trials>` | Compute observed success-rate lift relative to a positive baseline rate. |
| 194 | `experiment number-needed <first-risk> <second-risk>` | Compute inverse absolute risk difference as a descriptive count-equivalent. |
| 195 | `experiment balanced-split <total> <arms>` | Allocate whole trial counts evenly, assigning remainders to earlier arms. |
| 196 | `experiment weighted-mean <batch-means> <batch-counts>` | Combine batch means weighted by their observed sample counts. |
| 197 | `experiment combined-variance <means> <population-variances> <counts>` | Combine population variances and means with explicit batch counts. |
| 198 | `experiment sign-test-counts <before> <after>` | Count positive, negative, and tied paired changes; no p-value. |
| 199 | `experiment minimum-detectable <standard-error> <multiplier>` | Multiply a supplied standard error by an explicit detection threshold multiplier. |
| 200 | `experiment replication-budget <per-arm> <arms> <repeats> <cost-per-trial>` | Budget trial count and total cost across arms and repeated independent runs. |

Example:

```sh
mc-agent experiment mean-change -- '1,3' '5,7,9'
```

The JSON `result` for this example is `5`.

## `scorecard`

Transparent weighted criteria and candidate comparisons.

| # | Command and arguments | Result and assumptions |
| --- | --- | --- |
| 201 | `scorecard weighted-sum <scores> <weights>` | Compute weighted sum without normalizing explicitly supplied criterion weights. |
| 202 | `scorecard weighted-average <scores> <weights>` | Normalize positive-total criterion weights and average supplied scores. |
| 203 | `scorecard weighted-geometric <scores> <weights>` | Compute weighted geometric score for strictly positive criteria. |
| 204 | `scorecard weighted-harmonic <scores> <weights>` | Compute weighted harmonic score for strictly positive criteria. |
| 205 | `scorecard minimum-score <scores>` | Report the weakest supplied criterion and all tied zero-based criterion indices. |
| 206 | `scorecard maximum-score <scores>` | Report the strongest supplied criterion and all tied zero-based criterion indices. |
| 207 | `scorecard target-attainment <values> <targets>` | Compute per-criterion value/positive-target attainment fractions. |
| 208 | `scorecard capped-attainment <values> <targets>` | Compute attainment fractions capped at one, preventing surplus from masking deficits. |
| 209 | `scorecard weighted-deficit <values> <targets> <weights>` | Sum weighted positive target shortfalls. |
| 210 | `scorecard weighted-surplus <values> <targets> <weights>` | Sum weighted positive amounts above supplied targets. |
| 211 | `scorecard pass-count <values> <minimums>` | Count criteria meeting or exceeding their supplied individual minimums. |
| 212 | `scorecard all-pass <values> <minimums>` | Require all supplied criteria to meet individual minimums. |
| 213 | `scorecard veto <values> <minimums>` | List zero-based indices that fail explicit veto thresholds. |
| 214 | `scorecard dominates <first> <second>` | Report Pareto dominance when every criterion is maximized; strict improvement required. |
| 215 | `scorecard pair-margin <first> <second> <weights>` | Compute weighted first-minus-second score margin. |
| 216 | `scorecard outrank-count <first> <second>` | Count per-criterion first wins, second wins, and ties under maximization. |
| 217 | `scorecard regret <values> <ideal>` | Report per-criterion positive shortfall from an explicit ideal. |
| 218 | `scorecard maximum-regret <values> <ideal>` | Report worst criterion shortfall from an explicit ideal. |
| 219 | `scorecard distance-ideal <values> <ideal> <weights>` | Compute square root of weighted squared distance to an explicit ideal. |
| 220 | `scorecard cost-benefit <benefits> <costs>` | Compute independent benefit/cost ratios for positive supplied costs. |
| 221 | `scorecard net-benefit <benefits> <costs>` | Subtract per-candidate costs from supplied benefits. |
| 222 | `scorecard rank-candidates <scores>` | List zero-based candidates by decreasing score, preserving input order on ties. |
| 223 | `scorecard top-candidates <scores> <count>` | Select up to a supplied count of candidates in decreasing score order. |
| 224 | `scorecard weight-sensitivity <first> <second>` | Return criterion score differences, the margin derivative with respect to each unnormalized weight. |
| 225 | `scorecard two-criterion-switch <first> <second>` | Find first-criterion weight in [0,1] where two two-criterion weighted scores tie; otherwise null. |

Example:

```sh
mc-agent scorecard weighted-sum -- '2,4' '1,3'
```

The JSON `result` for this example is `14`.

## `forecast`

Explicit extrapolation scenarios without predictive guarantees.

| # | Command and arguments | Result and assumptions |
| --- | --- | --- |
| 226 | `forecast last-value <values> <horizon>` | Repeat the last observed reading for a bounded forecast horizon. |
| 227 | `forecast historical-mean <values> <horizon>` | Repeat the historical sample mean for a bounded horizon. |
| 228 | `forecast historical-median <values> <horizon>` | Repeat the historical sample median for a bounded horizon. |
| 229 | `forecast drift <values> <horizon>` | Extend average endpoint change per sample into future sample steps. |
| 230 | `forecast linear <times> <values> <queries>` | Evaluate a least-squares time fit at explicit future or historical times. |
| 231 | `forecast seasonal-repeat <values> <period> <horizon>` | Repeat the final supplied season cyclically for a bounded horizon. |
| 232 | `forecast seasonal-drift <values> <period> <horizon>` | Repeat final season with average per-season drift between the last two complete seasons. |
| 233 | `forecast constant-rate <start> <rate> <times>` | Project a supplied starting quantity using a fixed signed rate at nonnegative elapsed times. |
| 234 | `forecast compound <start> <factor> <periods>` | Project a nonnegative starting quantity under a supplied multiplicative factor. |
| 235 | `forecast bounded-growth <start> <rate> <capacity> <times>` | Project linear nonnegative growth capped at supplied capacity; start must fit. |
| 236 | `forecast depletion <stock> <consumption-rate> <times>` | Project remaining stock under fixed use, floored at zero. |
| 237 | `forecast time-to-target <start> <target> <rate>` | Compute nonnegative time for a fixed signed rate to reach a target; impossible direction rejected. |
| 238 | `forecast time-to-empty <stock> <use-rate>` | Compute continuous stock exhaustion time under fixed positive use. |
| 239 | `forecast reorder-time <stock> <threshold> <use-rate>` | Compute time to reach a reorder threshold under fixed use, zero if already at or below it. |
| 240 | `forecast exponential-decay <start> <half-life> <times>` | Project a supplied quantity using an explicit positive half-life. |
| 241 | `forecast doubling <start> <doubling-time> <times>` | Project a quantity using an explicit positive doubling time. |
| 242 | `forecast logistic <start> <capacity> <rate> <times>` | Project a deterministic logistic curve with supplied positive start and capacity. |
| 243 | `forecast damped-trend <level> <trend> <damping> <horizon>` | Accumulate a geometrically damped supplied trend through future steps. |
| 244 | `forecast level-trend <level> <trend> <horizon>` | Extend explicit fitted level and trend without re-estimating parameters. |
| 245 | `forecast scenario-range <start> <low-rate> <high-rate> <times>` | Bound fixed-rate projections by explicitly supplied ordered low/high rates. |
| 246 | `forecast error-band <predictions> <error-scale> <multiplier>` | Add a fixed caller-supplied symmetric error envelope; no confidence interpretation. |
| 247 | `forecast horizon-band <predictions> <step-error> <multiplier>` | Apply an explicitly assumed square-root-horizon error envelope. |
| 248 | `forecast ensemble <first> <second> <first-weight>` | Blend two aligned forecast series with an explicit first-model weight. |
| 249 | `forecast inventory-path <start> <receipts> <uses>` | Reconcile a supplied inventory path, rejecting shortages beyond numeric roundoff. |
| 250 | `forecast forecast-errors <actual> <predicted>` | Report signed errors, MAE, RMSE, and bias for aligned observed and predicted readings. |

Example:

```sh
mc-agent forecast last-value -- '2,4' '3'
```

The JSON `result` for this example is `[4,4,4]`.
