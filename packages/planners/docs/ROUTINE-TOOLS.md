# Offline routine tools

`mc-agent routine` prints JSON to standard output. It never connects to Minecraft,
executes steps, or overwrites a file. Redirect output to a **different** file and
inspect it before using `mc-agent run`. Every input and generated result is
validated against the action protocol and the 1–100 step limit. Steps are 1-based.
Static validation does not prove a backend supports an action or can finish it.
Reversing steps does not undo their effects.

The 25 additions are:

1. `validate <file>` checks every action before execution.
2. `summary <file>` shows steps, action types and explicit waiting time.
3. `types <file>` counts each action type.
4. `collection <file>` totals additional collection targets by block.
5. `deposits <file>` totals explicit transfers and flags deposit-all operations.
6. `waits <file>` lists wait steps and their total duration.
7. `destinations <file>` extracts explicit goto coordinates.
8. `first <file>` shows the first action.
9. `last <file>` shows the last action and its step number.
10. `numbered <file>` pairs every action with its execution step.
11. `warnings <file>` flags terrain modification, deposit-all and home dependencies.
12. `slice <file> <first> <last>` keeps an inclusive step range.
13. `take <file> <count>` keeps a prefix.
14. `drop <file> <count>` removes a prefix while retaining at least one action.
15. `reverse <file>` reverses execution order.
16. `repeat <file> <count>` expands repetitions within the 100-step limit.
17. `concat <file> <other>` appends another validated routine.
18. `remove <file> <step>` removes the specified step, retaining a nonempty routine.
19. `insert <file> <step> <other>` inserts a routine before a step (length + 1 appends).
20. `replace <file> <step> <other>` replaces one step with another routine.
21. `make-collect <item> <count>` splits a collection quota into actions of at most 64.
22. `make-deposit <item> <count>` generates a bounded explicit transfer.
23. `make-trip <item> <count>` generates collection actions followed by a home return.
24. `make-wait <seconds>` splits waiting into actions of at most 3,600 seconds.
25. `make-route <points...>` generates goto actions from `x,y,z` coordinates.

Collection generators accept 1–2,304 items; wait generation accepts 1–360,000
seconds. Collection generators accept only the 11 supported vanilla collection targets (eight log types, dirt, cobblestone, and sand). Static routine validation checks protocol structure; it does not check backend collection support for hand-written actions. Generated
trips require a saved home. Route coordinates apply to the execution dimension.

For example:

```sh
mc-agent routine make-trip oak_log 80 > trip.json
mc-agent routine warnings trip.json
mc-agent routine numbered trip.json
mc-agent run trip.json --dry-run
```
