# Snapshot timeline analysis

Run `mc-agent timeline COMMAND` with 2–100 snapshot JSON files, earliest first. All commands run offline and print JSON. Save samples with `mc-agent snapshot FILE`. Timestamps must strictly increase; duplicate times and invalid snapshots fail. Input files are never modified.

1. `timeline gains <files...>`: Sum positive sampled inventory changes by item.
2. `timeline losses <files...>`: Sum negative sampled inventory changes by item.
3. `timeline net-items <files...>`: Compare first and last item quantities.
4. `timeline turnover <files...>`: Show sampled item gains, losses, and net change together.
5. `timeline item-history <item> <files...>`: Trace one item through all samples.
6. `timeline item-rate <item> <files...>`: Measure endpoint net item change per minute.
7. `timeline item-peak <item> <files...>`: Find the first sample at the highest observed quantity.
8. `timeline item-target <item> <count> <files...>`: Find the first sample meeting a carried quota.
9. `timeline total-history <files...>`: Trace total carried item counts.
10. `timeline diversity-history <files...>`: Trace distinct carried item counts.
11. `timeline health-history <files...>`: Trace available health readings and their deltas.
12. `timeline hunger-history <files...>`: Trace available hunger readings and their deltas.
13. `timeline damage-events <files...>`: Locate sampled health decreases.
14. `timeline healing-events <files...>`: Locate sampled health increases.
15. `timeline hunger-drops <files...>`: Locate sampled hunger decreases.
16. `timeline food-gains <files...>`: Locate sampled hunger increases without inferring cause.
17. `timeline dimension-visits <files...>`: Summarize consecutive observed dimension visits.
18. `timeline dimension-crossings <files...>`: Locate changes between known dimension identifiers.
19. `timeline movement-legs <files...>`: Measure comparable straight-line sample displacements.
20. `timeline path-summary <files...>`: Sum comparable sample displacements and ascent/descent.
21. `timeline home-events <files...>`: Locate changes to the saved home.
22. `timeline time-gaps <files...>`: Report each sampling interval and the largest gap.
23. `timeline largest-gains <limit> <files...>`: Rank items by positive sampled changes.
24. `timeline largest-losses <limit> <files...>`: Rank items by negative sampled changes.
25. `timeline stable-items <files...>`: Find positive item quantities unchanged in every sample.

Examples:

`mc-agent timeline turnover before.json middle.json after.json`

`mc-agent timeline item-target oak_log 32 before.json after.json`

`mc-agent timeline movement-legs before.json after.json`

Item names accept an optional minecraft: prefix. Quotas are integers 0–1,000,000. Ranking limits are 1–100. Counts aggregate positive stacks by exact item name. Histories report missing health/hunger as null; event reports never infer events across a missing reading.

Inventory gains/losses sum net differences between adjacent observations, not actual gathering, depositing, or consumption. Unobserved changes are unknowable. Item rates use endpoint net change and elapsed wall time. Peaks and target checks use the first matching sample.

Movement distances and rates are straight-line sample displacements, calculated only when both endpoints have the same known dimension. Path summaries exclude unknown/cross-dimension legs and count them explicitly. Visits report observed runs, not time spent between samples. Missing dimension identifiers stay null. Home events compare coordinates and optional dimension. No terrain, movement physics, cause of vitals changes, or live backend acceptance is established by these reports.
