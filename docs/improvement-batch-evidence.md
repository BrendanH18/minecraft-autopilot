# Release evidence and Fabric fixtures

1. Serialize acceptance session edits so simultaneous commands preserve each other's observations.
2. Reject an acceptance update before writing if its serialized bytes would exceed the file reader's limit.
3. Bound reads of build metadata and reject non-regular files before opening their contents.
4. Reject ambiguous candidate checksum files with duplicate entries.
5. Compare the build manifest inside the candidate archive with the loose build manifest for new acceptance records.
6. Evaluate status for a specific candidate selected by commit and archive hash.
7. Let scripts require all open gates to have eligible evidence with `acceptance status --require-eligible`.
8. Export the report for a single acceptance session by id or unique prefix.
9. Show the archive hash on each session summary so a reviewer can identify a backend's candidate when evidence disagrees.
10. Prepare a measured hunger level and bread for interruption during eating.
11. Set up a low-health retreat with deterministic damage, disabled regeneration, and independent health reads.
12. Lay out a partial sand collection for interrupting the walk back.
13. Equip the player for an inventory that fills mid-collection.
14. Seed a double chest with three stacks to exercise interrupted withdrawal.
15. Provide supplies and a placed table for interrupting a multi-craft action.
16. Set up death during navigation with a repeatable independent check after respawn.
17. Provide a disconnect-during-mining run with independent observations after rejoining.

## Planner examples

The 233 analytic examples in [the example catalog](../src/planning-examples-analysis.js) each cover a distinct planner. They expose previously test-only inputs and independently calculated outputs through the study examples CLI. The full set of 250 original analytic cases still runs in the planner tests.

This batch contains 250 improvements. The total combines the 17 entries above and the 233 previously unavailable worked examples.
