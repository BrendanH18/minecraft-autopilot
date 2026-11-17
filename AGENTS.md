# Agent instructions

## Installs and local files

- Reuse tools already on the machine or cached in the repo (Node 22, Java 21,
  `.gradle-user`, `.deps`, `node_modules`, the cached Minecraft server jar).
  Ask before installing or downloading any new software, dependency, model,
  launcher or server, including `npm ci`, model pulls or `--allow-downloads`.
  Running the cached vanilla server jar with `eula=true` for local testing is
  approved (owner, 2026-10-05).
- Keep caches and runtime files inside the repo, and stop Minecraft, bridges
  and test servers after validation.
- This repo is private on GitHub, but keep personal notes and machine-specific
  details out of tracked files anyway.

## Lint and format

- Biome (pinned in `package.json`, configured in `biome.jsonc`) lints and
  formats every tracked `.js`, `.json` and `.jsonc` file except
  `package-lock.json`. `npm run lint` runs `biome ci --error-on-warnings`, so
  warnings fail it too, and CI runs it; `npm run format` applies formatting and
  safe fixes. Fix what it reports rather than hand-formatting or suppressing
  it; prefix an unused parameter with `_` only when its position must stay.
- Spotless (configured in `mod/build.gradle`) formats the mod's Java with
  palantir-java-format. `npm run lint:mod` checks it and `npm run format:mod`
  applies it, offline through `scripts/gradle.js`. Gradle's `check`, and so
  `build` and the CI `mod` job, fails on unformatted Java.
- actionlint (version pinned in `.github/workflows/ci.yml`, configured in
  `.github/actionlint.yaml`) checks the workflows in the CI `node` job; it is
  not installed locally. Pin every action to a full commit SHA with a
  `# vX.Y.Z` comment, and run jobs on Namespace runners.
- The main ruleset requires the `node` and `mod` CI jobs to pass. A new CI
  job must be added to the ruleset's required checks to block merges.

## Context maintenance

- Keep project rules and durable project knowledge in tracked `AGENTS.md` and
  repository docs; do not store them in agent auto-memory or machine-local notes.
- `CLAUDE.md` contains only `@AGENTS.md`. Shared hooks, scripts and settings
  belong in tracked files. Do not ignore instruction files or shared settings;
  ignore only machine-local settings and agent worktrees.

## Current implementation scope

- Fabric gather-and-store (chest/barrel deposits and fresh storage inspection) is
  approved for the experimental preview. Keep the existing packaged Fabric and
  authenticated-handoff acceptance gates open until observed passing.
