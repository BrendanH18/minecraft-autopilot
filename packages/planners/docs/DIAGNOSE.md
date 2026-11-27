# Transcript diagnostics

Analyze recorded planner outcomes, time gaps, token evidence, budgets, and requested actions offline. Commands read regular JSON Lines files up to 10 MiB and print reports without connecting to Minecraft or a model, executing requests, or modifying input files.

`file` is a path to an agent `--transcript` JSON Lines file. Every report includes a limitations note.

## Commands

1. `outcomes <file>` — Count terminal statuses, terminal errors, and unfinished runs.
2. `completion-rate <file>` — Measure finish-record coverage without equating finish with success.
3. `criteria-results <file>` — List explicitly recorded final verification outcomes.
4. `error-reasons <file>` — Group recorded action and finish error messages separately.
5. `rejection-reasons <file>` — Count exact recorded rejection reasons.
6. `action-outcomes <file>` — Group result/error/rejection events by action type.
7. `unresolved-decisions <file>` — Locate non-done decisions with no matching subsequent step outcome.
8. `response-delays <file>` — Measure decision-to-outcome gaps, not inference latency.
9. `event-gaps <file>` — Measure adjacent event gaps within each run.
10. `clock-regressions <file>` — Locate decreasing adjacent known timestamps within runs.
11. `missing-times <file>` — Locate absent or unparseable event timestamps.
12. `token-totals <file>` — Sum explicitly recorded decision/rejection token counts.
13. `token-steps <file>` — List per-response token evidence with step provenance.
14. `token-efficiency <file>` — Compare recorded response output tokens with reported requests.
15. `model-usage <file>` — Extract terminal model request/token/time usage without filling missing fields.
16. `budget-usage <file>` — Compare recorded run duration to the recorded time budget.
17. `step-usage <file>` — Compare terminal steps against recorded decision limits.
18. `failure-streaks <file>` — Locate consecutive action-error outcomes, reset by successful result records.
19. `rejection-streaks <file>` — Locate consecutive rejected responses, reset by nonrejected decisions.
20. `repeated-decisions <file>` — Locate adjacent identical decision objects within runs.
21. `goto-fence <file>` — Compare recorded goto requests to explicitly recorded horizontal fences.
22. `allowlist <file>` — Compare recorded decision types with explicitly recorded allowlists.
23. `collect-demand <file>` — Sum requested collection counts, not collected items.
24. `deposit-demand <file>` — Summarize explicit deposit requests and unbounded deposit-all requests.
25. `wait-demand <file>` — Sum requested wait durations, not elapsed waiting.

## Examples

```sh
mc-agent diagnose response-delays session.jsonl
mc-agent diagnose token-totals session.jsonl
mc-agent diagnose goto-fence session.jsonl
mc-agent diagnose unresolved-decisions session.jsonl
```

## Evidence and limits

A finish record means the recorded run ended, not that it met criteria. Missing finish records, usage, timings, allowlists, fences, and verification evidence remain unknown. Token totals sum known response fields and report unknown counts; action-backed rejections are excluded to avoid double counting a decision response. Token efficiency is known only when every response has output tokens and its count matches terminal model requests. Budget usage uses the reported terminal duration, including planner overhead. Failure streaks reset on result events. Rejection streaks reset on decisions without a subsequent matching rejection before the next decision. Request quantities count decisions even when later refused or failed; deposit-all quantities stay unbounded. Fence checks use only recorded horizontal start coordinates and radius. Decisions are not proof of dispatch, execution, collection, deposits, waiting, or movement.

Inter-event and decision-to-outcome gaps include unrecorded work and do not measure model inference latency. Clock regressions are reported separately; negative response delays stay unknown. Reports describe recorded evidence and cannot establish current world state or its causes.
