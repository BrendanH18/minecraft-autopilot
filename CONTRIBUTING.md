# Contributing

The current goal is a reliable experimental v0.1 of the existing player harness. Check the [roadmap](docs/ROADMAP.md) before starting a larger feature.

## Issues and proposals

Use [GitHub issues](https://github.com/BrendanH18/minecraft-autopilot/issues). Include backend, Minecraft/Node/Java versions, reproduction steps, expected/actual behavior, and relevant logs. Distinguish simulation, offline development, normal launcher, and authenticated server use. Omit bearer tokens, bridge-file contents, sign-in caches, and private world/server details.

For features, explain the gameplay task, target backend, and behavior during handoff. Discuss substantial scope changes before implementing them.

## Setup and changes

Follow [DEVELOPMENT.md](docs/DEVELOPMENT.md#setup-from-a-fresh-clone). Node.js 22+ is required; mod builds need a full Java 21 JDK. Downloads are explicit and ordinary builds use the local cache.

Keep dependencies, runtime files, and development worlds in ignored project directories. Do not install global packages, create startup services, or leave bridges/games/test servers running after tests. Keep credentials out of Git.

Create a branch and keep changes focused. Preserve explicit takeover, bounded actions, cancellation, and lease ownership. Delayed model/native replies must never resume gameplay after player takeover. Document backend differences and partial observations.

Add regression coverage for behavior changes. Documentation edits generally need command/link review rather than new tests. Update usage/protocol docs for contract changes and add a concise [changelog](CHANGELOG.md) entry.

## Validation and pull requests

CI runs the full check suite on every pull request; the `node` and `mod` jobs must pass before merging. It covers this list:

```sh
npm run lint
npm run lint:mod
npm run check
npm test
npm start -- demo --smoke
npm run build:mod
npm run verify:mod
```

While working, run the checks that cover your change: the affected tests plus lint and syntax for the areas you touched (`npm run lint:mod` and `node scripts/gradle.js test` for the mod). Push and let CI run the rest. When a CI job fails, reproduce that job or its failing test, fix it, and push again. `scripts/boat-check.sh` runs the whole list in a Boat sandbox, for reproducing CI failures; see [Boat checks](docs/DEVELOPMENT.md#boat-checks). CI on pull requests doesn't run the headless bot acceptance, so run the affected [scenarios](docs/LIVE-ACCEPTANCE.md) yourself when a change affects bot gameplay. In the pull request, list the checks you ran. Report exact blockers for checks you cannot run. Distinguish fixtures, simulation, mocked inference, and live gameplay. Record live versions/results in the development guide and leave unverified release checks open.

Use the PR template to describe the problem, resulting behavior, and validation. Generated jars, caches, worlds, runtime state, tokens, and task results remain ignored. Source contributions use the [MIT license](LICENSE); third-party jars retain their own licenses.
