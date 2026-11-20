# Routine workbench

`mc-agent workbench` adds 25 offline commands for examining and transforming
routine JSON. Every input and transformed output is validated against the routine
protocol (1–100 steps, bounded coordinates/counts/waits). It never connects to
Minecraft, executes actions, or overwrites input files. Transformations print
`{"actions":[...]}`; reports print analysis JSON. Use output redirection to a
**different** file when saving an edit. Do not redirect onto the input file.

All step references are 1-based. Examples assume `trip.json` is a valid routine:

```sh
mc-agent workbench home-dependencies trip.json
mc-agent workbench cap-collect trip.json 16 > smaller-trip.json
mc-agent workbench translate trip.json -- -10 0 5 > shifted-trip.json
```

## 25 additions

1. `positions <file> <type>` lists every step of an action type.
2. `transitions <file>` counts adjacent pairs of action types.
3. `runs <file>` groups consecutive actions of the same type with step ranges.
4. `duplicates <file>` locates exact repeated actions and their first occurrence.
5. `home-dependencies <file>` identifies home calls that rely on a pre-existing
   saved home versus the most recent earlier `set_home` step.
6. `collect-balance <file>` compares collection requests and explicit deposit
   quotas by item and separately counts deposit-all calls.
7. `travel-segments <file>` measures straight-line distance between adjacent
   `goto` actions and totals only those measurable legs.
8. `wait-timeline <file>` shows cumulative explicit wait time before/after each step.
9. `item-uses <file>` lists the collect/deposit steps that reference each item.
10. `bounds <file>` finds a bounding cuboid for goto destinations (null if none).
11. `only <file> <type>` keeps just one type of action.
12. `without <file> <type>` removes one type of action.
13. `swap <file> <first> <second>` exchanges two steps.
14. `move <file> <from> <to>` moves a step to its final position.
15. `rotate <file> <count>` moves the first count steps to the end.
16. `interleave <file> <other>` alternates actions from two routines, retaining
    the remainder of the longer routine in order.
17. `scale-collect <file> <factor>` multiplies collection quotas by a positive
    integer; rejects results above 64 rather than silently splitting them.
18. `scale-waits <file> <factor>` multiplies wait seconds by a factor from 0.001
    to 3600; rejects results outside 1–3600 seconds.
19. `cap-collect <file> <count>` caps each collection quota (1–64).
20. `cap-waits <file> <seconds>` caps each explicit wait (1–3600 seconds).
21. `explicit-deposits <file> <count>` replaces deposit-all steps with an explicit
    quota (1–2304), leaving already explicit quotas unchanged.
22. `translate <file> <dx> <dy> <dz>` offsets goto destinations and refuses
    resulting coordinates outside the protocol world limits.
23. `replace-item <file> <old> <replacement>` changes an item name in both
    collection and deposit actions; bare names receive `minecraft:`.
24. `pause-after <file> <type> <seconds>` inserts a wait after each matching action.
25. `bookend-home <file>` adds home calls before and after a routine.

## Meaning and limits

Valid action types are `goto`, `home`, `set_home`, `collect`, `eat`,
`inspect_storage`, `deposit`, `withdraw`, `craft`, and `wait`. Unknown types are rejected, including
when the routine has no matching steps. Filters refuse an empty result. Edits
that exceed 100 steps or protocol bounds fail before printing anything.

These are static tools, not an execution simulator. Reordering actions, adding
home calls, or replacing items can change behavior substantially. Repeated
actions are often intentional. Collection/deposit counts are requests, not
predictions of final inventory or successful yields. Protocol-valid item names
may still be unsupported by a gameplay backend. `set_home` and `home` require
successful execution and a compatible dimension. Geometry ignores terrain and
hazards; wait timelines exclude all non-wait execution time.
