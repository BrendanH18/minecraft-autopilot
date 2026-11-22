# Bot acceptance and resource planning improvements

## Acceptance runner

1. Export a complete selected fixture plan with `--dry-run --json` for tooling that prepares or audits live runs.
2. Prevent queued console writes after cancellation and drain the replies of commands already sent before writing cleanup commands.
3. Handle synchronous and asynchronous server stdin errors so the runner can finish shutdown and record results.
4. Preserve each acceptance check's name and verdict when its diagnostic data uses the same fields.
5. Store a large check diagnostic as one bounded string so the artifact remains readable.
6. Fail scenarios whose cleanup fails and include the specific failed cleanup steps in the result.
7. Report an unreaped bot as a failed scenario and abort the run before another bot can start on the same server.
8. Clean up the current fixture after an interrupt even if the run enabled `--keep-server` for inspection.
9. Record a skipped row with the reason for every remaining selected scenario when a run error prevents execution.
10. Store the trailing bot output with a failed scenario so reviewers can compare it with `server.out`.
11. Record the requested `--no-thinking` setting with real-model acceptance configuration.
12. Exit unsuccessfully when no live scenario passed, including a model-only selection that lacks a model.

## Live acceptance scenarios

13. `deposit-barrel-exact` checks exact deposition into an existing barrel stack and preservation of unrelated contents.
14. `deposit-full-chest` checks that a full chest leaves both inventories unchanged and reports zero items transferred.
15. `deposit-double-chest-omitted` uses the only free slot in each half of a double chest, with independent reads of both halves.
16. `deposit-over-held` checks that a deposit quota larger than the held total refuses without moving items.
17. `withdraw-barrel-exact` checks withdrawal from a barrel, including the reported container identity and live baseline.
18. `withdraw-no-matching-stock` checks that a chest with only other items refuses the requested withdrawal and preserves its contents.
19. `craft-rounds-up` checks that a five-plank request produces eight and consumes only two logs.
20. `craft-mixed-planks` makes sticks from different plank species in the inventory crafting grid.
21. `craft-mixed-stone` makes one pickaxe from three different stone materials on an existing crafting table.
22. `craft-reuses-consumed-slot` uses the space freed by the ingredient to fit the output in a previously full inventory.
23. `craft-no-table` checks that a table recipe without a held or placed table preserves its ingredients and reports why it failed.

## Worked resource planning examples

The 227 unique entries in [the resource catalog](../src/planning-examples-resources.js)
are now available through `mc-agent study example GROUP COMMAND`. The inputs and
independently calculated expected results come from the existing resource planner
regressions. Those regressions still run all 250 original cases.

The catalog includes nine complete resource groups through `apportion`, one
example for each of their 25 commands, plus `project-cost line-items` and
`project-cost subtotal`. The other 23 `project-cost` cases remain test fixtures.

The total is 250 improvements across runner behavior, live scenarios, and newly
available worked examples.
