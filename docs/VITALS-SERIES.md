# vitals-series

Analyze 2 to 100 saved snapshots in strictly increasing save-time order. Every command runs offline and leaves the source files unchanged. If any required reading is absent, the statistic is null rather than a fabricated zero.

```sh
mc-agent vitals-series mean health first.json middle.json last.json
mc-agent vitals-series percentile health 90 first.json middle.json last.json
mc-agent vitals-series moving-mean health 2 first.json middle.json last.json
```

Snapshot files use the normal saved-snapshot format. Inventory quantities normalize Minecraft item names and aggregate records. Storage uses `containers` with integer x/y/z and `items` arrays; absent or null contents are unknown. Storage calculations require identical recorded container coordinates and the same known player dimension in all files; reported contents may be stale. Vitals fields are health, hunger, x, y, or z; position statistics require the same known dimension. No sample statistic establishes damage, collection, consumption, transfers, a continuous route, or future values.

Variance uses the population denominator. Quantiles interpolate at `(n-1)*p`. Regression uses seconds since the first sample. Integrals use reading-seconds and the named piecewise interpolation. Moving windows count samples, not elapsed seconds. Acceleration compares adjacent sample rates across their time midpoints. Threshold fractions count samples, not time. Crossing up means previous < threshold and current >= threshold; down reverses that condition. Drawdown/drawup are absolute reading differences. Constant-series correlations and zero-mean variation coefficients are unknown. Item quantities support up to one billion; snapshots are limited to 10 MiB each.

| Command | Meaning |
| --- | --- |
| `mean <field> <files...>` | Arithmetic sample mean. |
| `median <field> <files...>` | Median sample reading. |
| `variance <field> <files...>` | Population variance of readings. |
| `standard-deviation <field> <files...>` | Population standard deviation. |
| `spread <field> <files...>` | Maximum minus minimum reading. |
| `quartiles <field> <files...>` | Linearly interpolated quartiles and interquartile range. |
| `percentile <field> <percent> <files...>` | Linearly interpolated percentile from 0 to 100. |
| `skewness <field> <files...>` | Population standardized third moment; constant readings are unknown. |
| `regression-slope <field> <files...>` | Least-squares reading change per second. |
| `regression-intercept <field> <files...>` | Fitted value at the first sample time. |
| `regression-residuals <field> <files...>` | Residual at each sample from a linear time fit. |
| `r-squared <field> <files...>` | Fraction of reading variance explained by time; constant series is unknown. |
| `trapezoid-integral <field> <files...>` | Reading-seconds under piecewise linear interpolation. |
| `left-integral <field> <files...>` | Reading-seconds with left-held readings. |
| `right-integral <field> <files...>` | Reading-seconds with right-held readings. |
| `coefficient-variation <field> <files...>` | Standard deviation divided by absolute mean; zero mean is unknown. |
| `lag-correlation <field> <files...>` | Pearson correlation of adjacent readings; constant side is unknown. |
| `moving-mean <field> <window> <files...>` | Trailing sample-window arithmetic means. |
| `moving-median <field> <window> <files...>` | Trailing sample-window medians. |
| `acceleration <field> <files...>` | Change in adjacent reading-per-second rates divided by midpoint time separation. |
| `fraction-above <field> <threshold> <files...>` | Fraction of samples strictly above a threshold. |
| `fraction-below <field> <threshold> <files...>` | Fraction of samples strictly below a threshold. |
| `threshold-crossings <field> <threshold> <files...>` | Adjacent readings crossing the threshold, with sample direction. |
| `maximum-drawdown <field> <files...>` | Largest sampled decline from an earlier peak. |
| `maximum-drawup <field> <files...>` | Largest sampled rise from an earlier trough. |
