# Agent instructions

## Cloud sandboxes (Boat)

Use Boat as the compute for your task (owner, 2026-11-25). Anything that runs
a program to do work happens in a Boat sandbox, never on the machine the agent
runs on: builds, tests, Gradle and the Java toolchain, the Minecraft server
and clients, large downloads, Docker, untrusted code and long jobs. That
machine is the owner's Mac or a Raspberry Pi with 8 GB of RAM shared by every
agent and the T3 server, where one heavy command stalls them all. Only light
work stays local: reading and editing files, git, searches such as `git grep`,
the `boat` CLI and the exceptions this file lists. If you're unsure, use Boat.
If Boat can't start a sandbox, don't fall back to local compute: tell the
owner what still needs a Boat run. Work this file keeps on the Mac (no GPU or
macOS on Boat) can't run on the Pi either; an agent there leaves it to the
owner and says so in its hand-off.
Docs: https://docs.boat.dev/llms.txt. Prices and limits: run `boat limits`; never quote prices from memory.

Run checks with `scripts/boat-check.sh` (owner decision, 2026-11-21). It gives
each worktree one long-lived sandbox from a warm snapshot, so a series of checks
spends one of the account's shared daily starts. How it works (snapshot, caches,
stop and resume, keepalive, retries, settings) is in
[Boat checks](docs/DEVELOPMENT.md#boat-checks).

CI is the gate (owner decision, 2026-11-22). It runs the full check suite once,
on the pushed commit: the CI `node` job runs actionlint, `npm run lint`,
`npm run check`, `npm test` and the demo smoke, and the `mod` job builds the mod
(Gradle's `check`, so Spotless and the Java tests), packages it and runs
`npm run verify:mod`. That covers every command in the CONTRIBUTING.md list, so
don't run the full `scripts/boat-check.sh` before handing work back.

- While working, run targeted checks on Boat with
  `scripts/boat-check.sh -- <command>`: the tests that cover the code you
  changed, plus lint and syntax for the areas you touched. Chain them in one
  check (`&&`) so they share one push. The cheap choices:
  - Node side (`src/`, `scripts/`, `test/`): `node --test test/<name>.test.js`
    for the affected test files, `npm run lint` (Biome, a few seconds) and
    `npm run check`. Add `npm start -- demo --smoke` when the CLI, bridge or
    simulated harness changed.
  - Mod side (`mod/`): `npm run lint:mod` (Spotless) and
    `node scripts/gradle.js test` (compiles and runs the Java tests). Add
    `npm run build:mod && npm run verify:mod` only when packaging,
    `scripts/setup-mod.js`, `scripts/package-mod.js`, `scripts/verify-mod.js`
    or the pinned dependencies changed.
  - Workflows (`.github/workflows/`): `actionlint`.
  - Docs-only changes need no Boat check; CI on the pull request is enough.
- Then push and let CI run everything. When a CI job fails, reproduce that job,
  or just its failing test, on Boat with the script, fix it and push again.
  The full `scripts/boat-check.sh` (no command) is for reproducing CI failures
  and for checks CI doesn't run.
- The Bot acceptance workflow runs the headless `--fast` scenarios on pull
  requests that touch `src/`, the scenario runner or the server jar setup
  (owner decision, 2026-11-22). It isn't a required check, so treat a failing
  `bot-acceptance` run like a failing `node` or `mod` job: fix it before the
  pull request merges. It leaves out the three long-running
  `recovery-*` scenarios; when a change affects recovery, cancel or stop, run
  them on Boat before handing back:
  `scripts/boat-check.sh --fetch .runtime/live-acceptance -- npm run acceptance:bot -- --accept-eula --scenario <scenario>`
  (results come back to `.runtime/boat-check/<check>/`). The live and manual
  steps in [LIVE-ACCEPTANCE.md](docs/LIVE-ACCEPTANCE.md) and
  [RELEASE.md](docs/RELEASE.md) are unchanged.
- The hand-off report lists the targeted checks that ran, and says CI is the
  full check.
- When your work ends, run `scripts/boat-check.sh --done` to delete your
  sandbox. Don't keep a sandbox up between checks; `MCA_BOAT_IDLE` needs the
  owner's go-ahead.
- Never share a sandbox between agents: each agent works in its own worktree,
  or sets `MCA_BOAT_KEY=<name>` when two agents share a checkout.
- After dependency or toolchain changes, refresh the snapshot with
  `scripts/boat-check.sh --save`.
- If the included starts are used up, the script refuses to pay for more;
  `MCA_BOAT_PAID_STARTS=1` needs the owner's go-ahead. Finish the code and docs
  work and tell the owner what still needs a Boat run instead of waiting or
  retrying.
- Sandboxes get no credentials (`--no-env`). If something genuinely needs one,
  stop and tell the owner rather than adding it.
- The headless Fabric development-client runner runs on Boat (owner decision,
  2026-11-25). When a change touches Fabric behaviour in `mod/`, run the
  affected scenarios before handing back:
  `scripts/boat-check.sh --fetch .runtime/live-acceptance -- npm run acceptance:fabric -- --accept-eula --scenario <scenario>`
  (or `--fast`; `--takeover` for the scripted F8, menu, stop, expiry, death and
  dimension items). The script installs Xvfb, Mesa and xdotool, caches the client
  assets and runs the client on software OpenGL. Its results are pre-checks, never
  release evidence.
- Exceptions (run on this Mac): the interactive Minecraft client (`npm run dev:mod`, a hand-run `runClient`, the normal launcher), packaged Fabric acceptance, Microsoft-authenticated handoff and Ollama local-model runs. Boat has no GPU, and Microsoft account credentials never go into a sandbox. For packaged acceptance, build the bundle in a sandbox and copy it back: `scripts/boat-check.sh --fetch dist -- npm run build:mod` puts it in `.runtime/boat-check/<check>/dist`.
- The ask-first rule below covers this Mac only. In a sandbox, `npm ci`, `--allow-downloads` and other installs need no approval.

Generic Boat commands, for genuine one-offs outside the checks. Every sandbox
you create by hand gets `--no-env` and `--name minecraft-autopilot-<purpose>`
(owner decision, 2026-11-21); `boat run --keep` has no `--name`, so rename it at
once with `boat rename <id> minecraft-autopilot-<purpose>`.

- One-shot job: `boat run --no-env --push . -- <command>` (new sandbox, run, cost, delete; exits with the command's exit code)
- Create: `id=$(boat new --json --no-env --fail-fast --name minecraft-autopilot-<purpose> | jq -r 'select(.event=="ready") | .id')`
- Run: `boat exec "$id" --cwd my-app "npm test"` (30 s timeout; `--timeout 0` = no limit)
- Server: `boat exec "$id" --detach "npm run dev"`, then `boat exec "$id" --status <pid>`
- Copy files: `boat push "$id" ./my-app` (git-tracked files, to /home/user/my-app), `boat scp -r "$id":<path> .`
- Public URL for a port: `boat ssh "$id" "host 3000 --private"`
- Always pass the sandbox id. `current` does not work in a non-interactive shell.
- When done: `boat stop "$id"` (keeps the disk for at least 14 days) or `boat delete "$id" --yes` (erases it)

## Installs and local files (this Mac)

These cover the Mac-only exceptions above; everything else runs on Boat.

- Use the tools already on the Mac or cached in the repo. Ask before
  installing or downloading any new software, dependency, model, launcher or
  server, including `npm ci`, model pulls or `--allow-downloads`. Running the
  cached vanilla server jar with `eula=true` is approved on the Mac for these
  exceptions (owner, 2026-10-05) and in Boat sandboxes (owner, 2026-11-20).
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
- actionlint (version pinned in `.github/workflows/ci.yml`) checks workflows in
  the CI `node` job. Pin every action to a full commit SHA with a `# vX.Y.Z`
  comment, and run jobs on GitHub-hosted standard runners (`ubuntu-24.04`).
- The main ruleset requires the `node` and `mod` CI jobs to pass. A new CI
  job must be added to the ruleset's required checks to block merges.

## Current implementation scope

- Fabric gather-and-store (chest/barrel deposits and fresh storage inspection),
  chest withdrawals and allowlisted basic crafting are approved for the
  experimental preview. Keep the packaged Fabric and authenticated-handoff
  acceptance gates open until observed passing.
