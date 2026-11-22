# Fabric and spatial planner improvements

## Fabric reliability

1. Check for takeover conditions before processing bridge requests as well as on client ticks, so a request queued across a pause or screen change cannot extend stale control.
2. Bind control to the actual client world and player instances, so recreating either instance invalidates the session even if the saved-world identity is the same. Eating cleanup leaves the replacement player’s item selection alone.
3. Refuse to acquire control while an earlier storage interaction is awaiting the server. Its late reply belongs to the earlier session.
4. Revoke the lease before action cleanup begins and restore the player’s settings in a `finally` block if cleanup fails.
5. Save home coordinates by atomically replacing `homes.json` and update the in-memory position only after the replacement succeeds.
6. Preserve an unreadable `homes.json` and surface the read error when the player tries to use or save a home.
7. Treat malformed saved coordinates as unavailable while continuing to use and save entries for other worlds and dimensions.
8. Refuse to craft into an occupied grid. Cleanup only attempts to clear a grid after the agent has filled it.
9. Check that the server’s crafting result has the allowlisted yield before taking it, including when a datapack changes a recipe’s output count.
10. Include the maximum craft request size in the Java and Node allowlist parity check.

## Runnable spatial planner examples

Entries 11–250 are the 240 examples in [the spatial example catalog](../src/planning-examples-spatial.js), in source order. Each pairs a distinct existing planner operation with its arguments and an independently worked expected result. The examples previously served as test fixtures and now also serve the planner example CLI. All 250 original spatial reference cases remain in the [test suite](../test/planning-spatial.test.js).

The Fabric changes passed the Java tests, build, formatting check, and installer archive verification in Boat. The spatial fixtures passed the focused Node suite and Biome. The in-game lease and crafting behavior still needs packaged Fabric acceptance.
