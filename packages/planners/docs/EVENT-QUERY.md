# event-query

Query saved planner JSON Lines transcripts using recorded fields and physical source-line numbers. No model or Minecraft connection is used.

```sh
mc-agent event-query numeric-mean transcript.jsonl /step
mc-agent event-query field-equals transcript.jsonl /event '"result"'
mc-agent event-query project transcript.jsonl /event /decision/type
```

Paths use JSON Pointer syntax: `/decision/type`, with `~1` for a slash in a key and `~0` for a tilde. Empty string selects the event object. Scalar comparisons accept JSON string, number, boolean, or null literals; quote string JSON for the shell. Missing fields remain distinct from explicit null. Aggregates include finite numeric fields only, report excluded rows, and return null for no readings. Numeric aggregation magnitudes are limited to 10^12. Quantiles interpolate at `(n-1)*p`. UTC time windows validate their endpoints; missing or invalid row times are excluded. Adjacent comparisons never cross recorded run boundaries. Event pairing resets on a repeated opening and never crosses a run. Duplicate-records compares exact JSON serialization, so object key order matters. Malformed nonblank transcript lines are excluded from queries; inspect them with journal invalid-lines. Files support at most 10 MiB and 20,000 events.

| Command | Meaning |
| --- | --- |
| `field-present <file> <pointer>` | Select events with an explicitly recorded field. |
| `field-missing <file> <pointer>` | Select events lacking a field. |
| `field-equals <file> <pointer> <json>` | Select events equal to a supplied scalar JSON value. |
| `field-not-equals <file> <pointer> <json>` | Select present fields unequal to a supplied scalar JSON value. |
| `numeric-between <file> <pointer> <minimum> <maximum>` | Select numeric fields in an inclusive range. |
| `string-prefix <file> <pointer> <text>` | Select string fields beginning with literal text. |
| `string-suffix <file> <pointer> <text>` | Select string fields ending with literal text. |
| `string-contains <file> <pointer> <text>` | Select string fields containing literal text. |
| `array-contains <file> <pointer> <json>` | Select array fields containing a supplied scalar JSON value. |
| `field-types <file> <pointer>` | Count field types and missing fields separately. |
| `group-count <file> <pointer>` | Group scalar values, retaining null and missing groups. |
| `distinct-values <file> <pointer>` | List distinct recorded scalar values in encounter order. |
| `project <file> <pointers...>` | Project requested fields with presence markers and source lines. |
| `numeric-sum <file> <pointer>` | Sum recorded finite numbers and report excluded rows. |
| `numeric-mean <file> <pointer>` | Mean recorded finite numbers; empty numeric evidence remains unknown. |
| `numeric-extrema <file> <pointer>` | Find minima and maxima with all source-line ties. |
| `numeric-quantile <file> <pointer> <percent>` | Interpolated percentile of recorded finite numbers. |
| `adjacent-field-changes <file> <pointer>` | Locate adjacent present scalar field changes. |
| `increasing-breaks <file> <pointer>` | Locate adjacent numeric decreases violating nondecreasing order. |
| `decreasing-breaks <file> <pointer>` | Locate adjacent numeric increases violating nonincreasing order. |
| `timestamp-window <file> <earliest> <latest>` | Select valid UTC event timestamps inside an inclusive interval. |
| `clock-regressions <file>` | Locate adjacent recorded UTC times moving backwards. |
| `event-pairs <file> <first> <second>` | Pair each opening event with the first subsequent closing event in the same run; reset on another opening. |
| `duplicate-records <file>` | Group exactly identical serialized event objects with line provenance. |
| `field-coverage <file> <pointers...>` | Report presence and explicit-null counts for requested paths. |
