# Thirty CLI, verification, and planner improvements

This batch extends the existing bridge without changing its wire protocol or Fabric mod.
See [usage](USAGE.md#focused-observations-and-final-state-checks) for commands and limits.

## CLI tools

1. `inventory`: aggregate stacks, filter by item, report item and occupied-slot totals.
2. `blocks`: sort loaded block observations by distance; filter by name/radius and limit results.
3. `threats`: sort observed hostiles by distance, with radius and result limits.
4. `home-info`: report the saved waypoint and its distance without walking there.
5. `storage`: show nearby cached container contents, distances, and backend support.
6. `distance`: calculate three-dimensional/horizontal distances and vertical offset.
7. `position`: show player coordinates and dimension.
8. `health`: show health, hunger, control/recovery, and survival status.
9. `inspect-storage`: explicitly refresh known storage using the bounded action path.
10. `wait`: perform a cancellable controlled wait of 1–3600 seconds.

## Independent task verification

11. `--verify-health`: require a minimum final health.
12. `--verify-hunger`: require a minimum final hunger; unavailable data stays unmet.
13. `--verify-at`: require arrival at coordinates within a bounded radius.
14. `--verify-inventory`: require an absolute held-item quantity across stacks.
15. `--verify-max-threats`: bound the observed hostile count; unavailable data stays unmet.
16. `--verify-home-radius`: configure the original-home arrival tolerance.
17. Deduplicate initial container coordinates so repeated observations cannot inflate the storage baseline.
18. Retain each newly discovered source's first baseline across subsequent checks.
19. Reject empty explicit storage provenance instead of treating old stock as new deposits.
20. Reject nonnumeric or nonfinite health as proof of a living player.

## Planner reliability

21. Validate goal/model text before acquiring control.
22. Validate public API runtime, decision, inference timeout, and thinking options.
23. Refuse credentials in local Ollama URLs.
24. Explain local Ollama connection failures with recovery guidance.
25. Explain empty model actions with model/timeout/thinking recovery suggestions.
26. Reject oversized model action text above 65,536 characters.
27. Validate protocol action coordinates and identifiers before dispatch.
28. Allow the model to choose `inspect_storage`, subject to backend support.
29. Treat returned failed/cancelled action statuses as failures for the three-failure stop.
30. Detect ineffective repeated actions even when the model alternates short and namespaced item names.

## Validation

`test/cli-tools.test.js` runs all ten tools as real CLI processes against the demo bridge,
including read-only queries while another controller owns the lease. `test/agent-cli.test.js`
exercises all new verification flags together and verifies step-limit exit code 2 for new criteria.
`test/objective.test.js` and `test/agent.test.js` cover each verification/planner improvement.
The full Node suite, syntax check, and demo smoke exercise the integrated change.
These checks use a simulation and local fake Ollama responses; they do not extend the project's
recorded real-game or real-model acceptance claims in [development](DEVELOPMENT.md#validation).
