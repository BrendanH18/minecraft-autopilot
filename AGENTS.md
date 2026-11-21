# Agent instructions

## Cloud sandboxes (Boat)

Use a Boat sandbox for builds, tests, untrusted code, Docker, and long jobs. Never run them on this computer.
Docs: https://docs.boat.dev/llms.txt. Prices and limits: run `boat limits`; never quote prices from memory.

Run checks with `scripts/boat-check.sh` (owner decision, 2026-11-21). The
account's 200 sandbox starts a day are shared by all the owner's projects, and a
`boat run` per check spends one start and reinstalls everything each time. The
script gives each worktree one long-lived sandbox, created from the warm
snapshot `minecraft-autopilot-warm` (Java 21, `node_modules`, Gradle caches,
the pinned jars and the vanilla server jar), and pushes every check into a fresh
directory in it. See [Boat checks](docs/DEVELOPMENT.md#boat-checks).

- Hand-off checks (the CONTRIBUTING.md list): `scripts/boat-check.sh`
- Any other command: `scripts/boat-check.sh -- npm test`
- Headless bot acceptance against the offline vanilla server (no Ollama):
  `scripts/boat-check.sh --fetch .runtime/live-acceptance -- npm run acceptance:bot -- --accept-eula --scenario <scenario>`
  (or `--all`, which takes well over ten minutes); the results come back to
  `.runtime/boat-check/<check>/`.
- When your work ends: `scripts/boat-check.sh --done` deletes your sandbox.
  Otherwise it stops by itself 45 minutes after its last check, and the next
  check resumes it.
- Never share a sandbox between agents: each agent works in its own worktree,
  or sets `MCA_BOAT_KEY=<name>` when two agents share a checkout.
- After dependency or toolchain changes, refresh the snapshot with
  `scripts/boat-check.sh --save` (hand-off checks, then save).
- Use as few starts as possible: one sandbox for the whole job. Run
  `boat limits` before starting one. If the included starts are used up, the
  script refuses rather than pay for extra starts (`MCA_BOAT_PAID_STARTS=1`
  overrides it only with the owner's go-ahead); finish the code and docs
  work and tell the owner what still needs a Boat run instead of waiting or retrying.
- The script creates sandboxes with `--no-env`, so no GitHub token, agent
  logins or API keys go in; the tests and headless acceptance need none. If
  something genuinely needs a credential, stop and tell the owner rather than
  adding it. It passes `--fail-fast` to `boat new` and `boat resume`, so an
  attempt that finds no ready machine fails without counting against the start
  limits, and retries briefly (owner decision, 2026-11-21).
- Exceptions (run on this Mac): the Minecraft client (`npm run dev:mod`, `runClient`, the normal launcher), packaged Fabric acceptance, Microsoft-authenticated handoff and Ollama local-model runs. Boat has no GPU, and Microsoft account credentials never go into a sandbox. For packaged acceptance, build the bundle in a sandbox and copy it back: `scripts/boat-check.sh --fetch dist -- npm run build:mod` puts it in `.runtime/boat-check/<check>/dist`.
- The ask-first rule below covers this Mac only. In a sandbox, `npm ci`, `--allow-downloads` and other installs need no approval.

Generic Boat commands, for genuine one-offs outside the checks:

- One-shot job: `boat run --push . -- <command>` (new sandbox, run, cost, delete; exits with the command's exit code)
- Create: `id=$(boat new --json --no-env --fail-fast | jq -r 'select(.event=="ready") | .id')`
- Run: `boat exec "$id" --cwd my-app "npm test"` (30 s timeout; `--timeout 0` = no limit)
- Server: `boat exec "$id" --detach "npm run dev"`, then `boat exec "$id" --status <pid>`
- Copy files: `boat push "$id" ./my-app` (git-tracked files, to /home/user/my-app), `boat scp -r "$id":<path> .`
- Public URL for a port: `boat ssh "$id" "host 3000 --private"`
- Always pass the sandbox id. `current` does not work in a non-interactive shell.
- When done: `boat stop "$id"` (keeps the disk for at least 14 days) or `boat delete "$id" --yes` (erases it)

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
