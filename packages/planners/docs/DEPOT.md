# Storage evidence comparison

The 25 `depot` commands compare the raw `containers` evidence preserved in two
saved observations. They run offline and leave both files unchanged. Signatures
follow `mc-agent --json depot`:

1. `coverage <before> <after>` — Compare opened, unopened, and timed storage evidence counts.
2. `discovered <before> <after>` — Locate container coordinates first recorded in the later observation.
3. `missing <before> <after>` — Locate previously recorded coordinates omitted from the later observation.
4. `opened <before> <after>` — Locate matched containers whose unknown contents became recorded.
5. `obscured <before> <after>` — Locate matched containers whose recorded contents became unknown.
6. `refreshed <before> <after>` — Locate matched containers with a strictly newer observation timestamp.
7. `aging <before> <after>` — Compare content observation age at each snapshot save time.
8. `changed-containers <before> <after>` — Locate matched opened containers with changed item quantities.
9. `item-changes <before> <after>` — List per-item changes in matched opened containers.
10. `item-total <before> <after> <item>` — Compare one item across fully recorded storage evidence.
11. `matched-item <before> <after> <item>` — Compare one item in containers with contents known at both times.
12. `source-gains <before> <after> <item>` — Locate matched containers with a positive observed change of an item.
13. `source-losses <before> <after> <item>` — Locate matched containers with a negative observed change of an item.
14. `redistribution-bound <before> <after> <item>` — Bound potentially redistributed quantity by matched gains and losses.
15. `newly-stocked <before> <after>` — Locate matched containers going from explicitly empty to nonempty.
16. `depleted <before> <after>` — Locate matched containers going from nonempty to explicitly empty.
17. `stable-stock <before> <after>` — Find positive item quantities unchanged in each matched opened container.
18. `food-change <before> <after>` — Compare hunger reserves across fully recorded storage evidence.
19. `stack-change <before> <after>` — Compare minimum stacks consolidated within each recorded container.
20. `concentration <before> <after> <item>` — Compare the largest-source share and concentration index for an item.
21. `redundancy <before> <after> <item>` — Compare the number of recorded storage sources for one item.
22. `carried-stored <before> <after> <item>` — Compare carried and stored changes for one item without claiming transfers.
23. `pooled-quota <before> <after> <item> <target>` — Compare carried-plus-stored shortfalls for one quota.
24. `kit-pool <before> <after> <entries...>` — Compare carried-plus-stored shortfalls for an explicit kit.
25. `refresh-order <before> <after> <seconds>` — Prioritize later evidence that became stale or remained untimed.

Inputs are chronological regular snapshot JSON files of at most 10 MiB. At most
1,000 containers, 1,000 item records per container, and one billion total items
per container are supported. Containers need unique integer coordinate triples;
duplicate triples are rejected because their identity would be ambiguous. Names
are normalized. Quantities must be nonnegative integers; malformed evidence is
an error. Missing `containers` is unknown; an explicit empty array is known empty.
Missing/null contents are unopened evidence, never zero. Explicit `items: []`
means an observed empty container. `observedAt` is a nonnegative epoch-millisecond
timestamp or absent/null when unknown.

Coordinate identity requires the same known player dimension in both snapshots.
On a dimension mismatch or unknown dimension, `comparable` is false and matched
container reports are null. `coverage` still describes each independent record.
`discovered` and `missing` describe observation coverage, not construction or
destruction. No coordinate matching crosses dimensions.

Matched reports inspect only coordinates present in both files with known contents
at both times; `matchedOpened` reports that subset size. A sum over a known empty
matched subset is zero, not evidence that all world storage is empty. Whole-evidence
reports (`item-total`, food, stacks, concentration, redundancy, and pooled quotas)
require every recorded container in both files to have known contents and matching
dimensions; otherwise their quantities are null. Different recorded container sets
can change these totals without any item transfer. They describe the recorded
sets only and do not claim complete world storage coverage.

`carried-stored` reports each inventory change separately and the pooled sum;
missing inventory leaves carried and pooled quantities null while storage can still
be reported. `pooled-quota` and `kit-pool` measure capped shortfalls against
explicit `item=count` quotas. `redistribution-bound` is the minimum of matched
observed gains and losses, an upper bound on possible redistribution rather than
proof of a transfer. `concentration` gives largest-source share and sum of squared
source shares; both are null when the selected item has zero recorded quantity.

`aging` compares each save timestamp to the content timestamp; negative age
exposes future-dated evidence. `refresh-order` sorts matched later containers by
age, with untimed first, and includes future-dated records for inspection. The
threshold is in seconds; stale means strictly older than that threshold.
`newlyStale` is null when either age is unknown or later evidence is future-dated.
No command opens or refreshes a container. Food and stacks use the same limited
hunger and stack-size estimates as inventory reports.

Examples:

`mc-agent --json depot redistribution-bound before.json after.json oak_log`

`mc-agent --json depot kit-pool before.json after.json torch=32 bread=8`

`mc-agent --json depot refresh-order before.json after.json 300`
