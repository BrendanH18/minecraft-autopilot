# Agent instructions

## Cloud sandboxes (Boat)

Use a Boat sandbox for builds, tests, untrusted code, Docker, and long jobs. Never run them on this computer.
Docs: https://docs.boat.dev/llms.txt. Prices and limits: run `boat limits`; never quote prices from memory.

- Create: `id=$(boat new --json | jq -r 'select(.event=="ready") | .id')`
- One-shot job: `boat run --push . -- npm test` (new sandbox, run, cost, delete; exits with the test exit code)
- Run: `boat exec "$id" --cwd my-app "npm test"` (30 s timeout; `--timeout 0` = no limit)
- Server: `boat exec "$id" --detach "npm run dev"`, then `boat exec "$id" --status <pid>`
- Copy files: `boat push "$id" ./my-app` (git-tracked files, to /home/user/my-app) or clone the repo inside the sandbox
- Public URL for a port: `boat ssh "$id" "host 3000 --private"`
- Always pass the sandbox id. `current` does not work in a non-interactive shell.
- When done: `boat stop "$id"` (keeps the disk for at least 14 days) or `boat delete "$id" --yes` (erases it)
- Exceptions (run on this Mac): the Minecraft client (`npm run dev:mod`, `runClient`, the normal launcher), packaged Fabric acceptance, Microsoft-authenticated handoff and Ollama local-model runs. Boat has no GPU, and Microsoft account credentials never go into a sandbox. For packaged acceptance, build the bundle in a sandbox and copy it back with `boat scp -r "$id":/home/user/<repo>/dist .` before stopping the sandbox.
- Headless runs against the offline vanilla server (`npm run acceptance:bot` without Ollama) run in Boat. A fresh sandbox has no `node_modules` or server jar (both gitignored): install Java 21 if missing and run the fresh-clone setup in `docs/DEVELOPMENT.md`, whose build caches the jar. Then run `boat exec "$id" --cwd <repo> --timeout 0 "npm run acceptance:bot -- --accept-eula --scenario <scenario>"` (or `--all`, which takes well over ten minutes).
- The ask-first rule below covers this Mac only. In a sandbox, `npm ci`, `--allow-downloads` and other installs need no approval.

## Installs and local files (this Mac)

- Reuse tools already on the machine or cached in the repo (Node 22, Java 21,
  `.gradle-user`, `.deps`, `node_modules`, the cached Minecraft server jar).
  Ask before installing or downloading any new software, dependency, model,
  launcher or server, including `npm ci`, model pulls or `--allow-downloads`.
  Running the cached vanilla server jar with `eula=true` for local testing is
  approved (owner, 2026-10-05), in Boat sandboxes too (owner, 2026-11-20).
- Keep caches and runtime files inside the repo, and stop Minecraft, bridges
  and test servers after validation.
- This repo is public on GitHub: keep personal notes and machine-specific
  details out of tracked files.

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

- Fabric gather-and-store (chest/barrel deposits and fresh storage inspection),
  chest withdrawals and allowlisted basic crafting are approved for the
  experimental preview. Keep the packaged Fabric and authenticated-handoff
  acceptance gates open until observed passing.
