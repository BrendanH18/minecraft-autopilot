# Transcript journal

Inspect a saved planner JSON Lines transcript, preserving physical line numbers and 1-based run provenance. Commands read regular files up to 10 MiB and print JSON without connecting to a bridge or model, acquiring control, changing the transcript, or replaying actions.

`file` is a path to an agent `--transcript` JSON Lines file. Every report includes a limitations note.

## Commands

1. `runs <file>` — Index recorded runs with start, finish, and line provenance.
2. `events <file>` — List all valid recorded event objects with physical line numbers.
3. `run <file> <number>` — Extract all valid events and invalid lines from one run.
4. `event-type <file> <event>` — Select an exact recorded event name.
5. `action-type <file> <type>` — Select records mentioning one decision or action type.
6. `step <file> <number>` — Select a numbered step across runs.
7. `lines <file> <first> <last>` — Select records in an inclusive physical line range.
8. `head <file> <count>` — Select the first count valid events.
9. `tail <file> <count>` — Select the last count valid events.
10. `decisions <file>` — Extract recorded model decisions.
11. `results <file>` — Extract recorded action result events.
12. `errors <file>` — Extract action errors and terminal run errors.
13. `rejections <file>` — Extract refused requests and invalid model replies.
14. `finishes <file>` — Extract terminal run records.
15. `starts <file>` — Extract recorded task starts.
16. `goals <file>` — List recorded task goal text by run.
17. `models <file>` — Group start records by model name, retaining unknown names.
18. `settings <file>` — Extract explicitly recorded task limits and planner settings.
19. `criteria <file>` — Extract recorded criteria descriptions without evaluating them.
20. `invalid-lines <file>` — Show nonblank lines that are not event objects.
21. `unknown-events <file>` — Show event names outside the current planner contract.
22. `timestamps <file>` — Parse each event timestamp, preserving missing and invalid evidence.
23. `search <file> <text>` — Find literal case-sensitive text within event JSON.
24. `unfinished <file>` — Locate run segments lacking a finish record.
25. `dry-runs <file>` — Locate explicitly recorded dry-run starts.

## Examples

```sh
mc-agent journal runs session.jsonl
mc-agent journal run session.jsonl 2
mc-agent journal action-type session.jsonl collect
mc-agent journal lines session.jsonl 10 25
```

## Evidence and limits

Nonblank lines without a JSON object containing a string `event` appear in `invalid-lines`; blank lines still count toward physical line numbers. A start event begins a new run. A finish closes it, and the next valid event starts another run segment. Pre-start records form their own segment. Run selection is explicit and 1-based; head, tail, step, and line arguments must be positive integers up to 1,000,000. Search is literal, case-sensitive JSON text, not a regular expression. Missing goals/models/criteria and invalid timestamps remain null or explicitly unrecorded. Unknown event names remain visible.

Inter-event and decision-to-outcome gaps include unrecorded work and do not measure model inference latency. Clock regressions are reported separately; negative response delays stay unknown. Reports describe recorded evidence and cannot establish current world state or its causes.
