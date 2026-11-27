# @minecraft-autopilot/planners

The offline planners, planning studies and read-only report commands of
`mc-agent`, as an npm workspace package of this repository. It is private and
isn't published; `npm install` (or `npm ci`) in the repository root links it
into `node_modules/@minecraft-autopilot/planners`.

The core CLI in `src/` works without this package. Core commands (`observe`,
`stop`, `mcp`, `agent`, `collect`, `acceptance` and the rest) never load it.
For any other command, `src/cli.js` imports the package dynamically and
registers its commands. When the package isn't installed, root help lists the
core commands with a note saying where the others went, and an unknown command
prints the same note after Commander's error.

## Contents

- `src/index.js`: the entry point. It exports `TOOL_GROUPS`,
  `registerToolGroups(program, { view, print })` and
  `registerPlanners(program, { print })`.
- `src/tool-groups.js` and the modules it lists: 44 command groups of 25
  commands each, such as `supplies`, `survey`, `nav`, `routine`, `bearing` and
  `snapshot-query`. Some read one bridge observation through the `view`
  callback the core passes in; none takes control.
- `src/planning-*.js`: the offline planners, worked examples, recipes and
  study workflows (`mc-agent study`). The CLI loads them only when a command
  is still unknown after the tool groups, so root help and unknown-command
  suggestions see the whole command tree.
- `docs/`: a reference page per group and per planner family. The
  [improvement inventory](../../docs/IMPROVEMENTS.md) indexes them.
- `test/`: the package's tests.

## Depending on the core

The package reuses core modules (`cli-views.js`, `protocol.js`,
`objective.js`, `recipes.js`, `routine.js`, `transcript.js` and
`waypoints.js`) by relative import from `../../../src/`. Its tests also use
the core's demo bridge and `test/helpers.js`, and run the core's `src/cli.js`
(see `test/cli-path.js`). The dependency goes one
way only: nothing in `src/`, `scripts/` or `test/` may import this package,
and `test/cli-startup.test.js` in the core checks that.

New planners, studies and report groups go here, not in `src/`.

## Tests

```sh
npm run test:planners            # from the repository root
npm test                         # from packages/planners
node --test packages/planners/test/<name>.test.js
```

The CI `planners` job runs them. The core `node` job runs `npm test` with this
package's link removed.
