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
- This repo is public: keep personal notes and machine-specific details out of
  tracked files.

## Lint and format

- Biome (pinned in `package.json`, configured in `biome.jsonc`) lints and
  formats every tracked `.js` file. `npm run lint` checks both and CI runs it;
  `npm run format` applies formatting and safe fixes. Fix what it reports
  rather than hand-formatting. The Java mod has no formatter yet.
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
