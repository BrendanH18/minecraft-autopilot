# inventory-series

Analyze 2 to 100 saved snapshots in strictly increasing save-time order. Every command runs offline and leaves the source files unchanged. If any required reading is absent, the statistic is null rather than a fabricated zero.

```sh
mc-agent inventory-series mean dirt first.json middle.json last.json
mc-agent inventory-series percentile dirt 90 first.json middle.json last.json
mc-agent inventory-series moving-mean dirt 2 first.json middle.json last.json
```

Snapshot files use the normal saved-snapshot format. Inventory quantities normalize Minecraft item names and aggregate records. Storage uses `containers` with integer x/y/z and `items` arrays; absent or null contents are unknown. Storage calculations require identical recorded container coordinates and the same known player dimension in all files; reported contents may be stale. Vitals fields are health, hunger, x, y, or z; position statistics require the same known dimension. No sample statistic establishes damage, collection, consumption, transfers, a continuous route, or future values.

Variance uses the population denominator. Quantiles interpolate at `(n-1)*p`. Regression uses seconds since the first sample. Integrals use reading-seconds and the named piecewise interpolation. Moving windows count samples, not elapsed seconds. Acceleration compares adjacent sample rates across their time midpoints. Threshold fractions count samples, not time. Crossing up means previous < threshold and current >= threshold; down reverses that condition. Drawdown/drawup are absolute reading differences. Constant-series correlations and zero-mean variation coefficients are unknown. Item quantities support up to one billion; snapshots are limited to 10 MiB each.

| Command | Meaning |
| --- | --- |
| `mean <item> <files...>` | Arithmetic sample mean. |
| `median <item> <files...>` | Median sample reading. |
| `variance <item> <files...>` | Population variance of readings. |
| `standard-deviation <item> <files...>` | Population standard deviation. |
| `spread <item> <files...>` | Maximum minus minimum reading. |
| `quartiles <item> <files...>` | Linearly interpolated quartiles and interquartile range. |
| `percentile <item> <percent> <files...>` | Linearly interpolated percentile from 0 to 100. |
| `skewness <item> <files...>` | Population standardized third moment; constant readings are unknown. |
| `regression-slope <item> <files...>` | Least-squares reading change per second. |
| `regression-intercept <item> <files...>` | Fitted value at the first sample time. |
| `regression-residuals <item> <files...>` | Residual at each sample from a linear time fit. |
| `r-squared <item> <files...>` | Fraction of reading variance explained by time; constant series is unknown. |
| `trapezoid-integral <item> <files...>` | Reading-seconds under piecewise linear interpolation. |
| `left-integral <item> <files...>` | Reading-seconds with left-held readings. |
| `right-integral <item> <files...>` | Reading-seconds with right-held readings. |
| `coefficient-variation <item> <files...>` | Standard deviation divided by absolute mean; zero mean is unknown. |
| `lag-correlation <item> <files...>` | Pearson correlation of adjacent readings; constant side is unknown. |
| `moving-mean <item> <window> <files...>` | Trailing sample-window arithmetic means. |
| `moving-median <item> <window> <files...>` | Trailing sample-window medians. |
| `acceleration <item> <files...>` | Change in adjacent reading-per-second rates divided by midpoint time separation. |
| `fraction-above <item> <threshold> <files...>` | Fraction of samples strictly above a threshold. |
| `fraction-below <item> <threshold> <files...>` | Fraction of samples strictly below a threshold. |
| `threshold-crossings <item> <threshold> <files...>` | Adjacent readings crossing the threshold, with sample direction. |
| `maximum-drawdown <item> <files...>` | Largest sampled decline from an earlier peak. |
| `maximum-drawup <item> <files...>` | Largest sampled rise from an earlier trough. |
