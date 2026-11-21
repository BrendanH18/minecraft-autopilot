# Acceptance sessions

`mc-agent acceptance` turns the open live gates in [RELEASE.md](RELEASE.md#live-checks-required-before-shipping) into recordable sessions. Each session captures what [ROADMAP.md](ROADMAP.md) step 6 asks for: the commit, the artifact checksum, the backend, the launcher/server/model configuration, the scenario, and the result.

It records human observations. It does not run gameplay, contact Minecraft or a model, or edit RELEASE.md. A person reviews the evidence and ticks a box.

## Commands

| Command | Purpose |
| --- | --- |
| `acceptance list [--open] [--backend <fabric\|mineflayer\|both>]` | List open and closed gates. A fabric or mineflayer filter includes gates that need both. |
| `acceptance show <gate>` | Show prerequisites, numbered steps, and the evidence to record. |
| `acceptance start <gate> --backend <fabric\|mineflayer\|both\|demo> [--mods-dir <path>] [--launcher ..] [--server ..] [--model ..] [--mcp-client ..] [--note ..]` | Start a session and capture provenance. Use `--mods-dir` for packaged Fabric and authenticated handoff. |
| `acceptance step <session> <n> pass\|fail [--note ..]` | Record an observation for step `n`. Re-recording keeps the earlier observation. |
| `acceptance finish <session> pass\|fail\|blocked [--note ..]` | Finish a session. `fail` and `blocked` need `--note`. `pass` is refused while a step's latest observation failed. |
| `acceptance sessions [--gate <gate>]` | List recorded sessions. |
| `acceptance report [--gate <gate>] [--format markdown\|json]` | Print Markdown for the [DEVELOPMENT.md](DEVELOPMENT.md#validation) Validation section, or JSON. |
| `acceptance status` | Show the latest finished session for each open gate and backend, and whether the eligible gates share one candidate. |

Sessions can be named by their full id or an unambiguous prefix of at least six characters.

Use backend `both` only for the authenticated handoff, which exercises the client and the bot in one session. Gates marked `both` otherwise need a separate session for each backend on the same candidate. `demo` is for rehearsing the workflow and never counts.

## Workflow

Build the candidate once from a clean commit.

```sh
npm run build:mod
```

Copy the three jars from that archive into the launcher profile's `mods` folder before starting the session.

```sh
npm start -- acceptance show fabric-f8-takeover
npm start -- acceptance start fabric-f8-takeover --backend fabric \
  --mods-dir "/path/to/launcher-profile/mods" \
  --launcher "Minecraft Launcher, Fabric Loader 0.16.14" --server "single-player" --model "qwen3.5:4b-mlx"
npm start -- acceptance step 3f2a9c 1 pass --note "F8 during inference; observe showed manual"
# ...one step command per numbered step...
npm start -- acceptance finish 3f2a9c pass
npm start -- acceptance report --gate fabric-f8-takeover
```

Record independent evidence in step notes, such as a server `data get` read or a separate `mc-agent observe`, not the agent's own report.

## What `start` records

- The ISO start time, gate, backend, and the configuration flags.
- `git rev-parse HEAD` and whether `git status --porcelain` shows changes.
- `dist/BUILD.json`, whether its `sourceCommit` matches the commit, and whether `sourceModified` is `false`.
- The SHA-256 of `dist/minecraft-agent-0.1.0.zip` and whether it matches `dist/ARCHIVE_SHA256SUMS`.
- With `--mods-dir`, the SHA-256 of each packaged jar found in that folder and the expected hash from the archive.
- The Node version.

A missing `dist/` is recorded as `null` with a warning. Use the `mods` folder of the launcher profile used for the session. `--mods-dir` uses `unzip` on PATH to read the candidate archive. The hash check records the files present when the session starts. Confirm the launcher profile and client in your observations.

## Eligibility

A gate's evidence is **eligible** when, for each backend it needs, the latest finished session:

- finished as `pass`, with a passing latest observation for every step;
- used the gate's backend (never `demo`);
- ran on a known commit with a clean worktree;
- has a `dist/BUILD.json` that matches that commit and records `sourceModified: false`;
- has an archive checksum that matches `ARCHIVE_SHA256SUMS`;
- for `fabric` or `both`, has all packaged jars present with hashes matching the archive.

A later failed or blocked session replaces earlier eligible evidence. Existing Fabric and authenticated handoff sessions remain readable and need a new session with matching jar hashes to qualify.

`acceptance status` groups individually eligible open gates in `candidates` by commit and archive SHA-256. If those gates span multiple candidates, it reports a problem and the top-level `eligible` count is zero. The gate and backend details still show which evidence passed, so you can identify which sessions to repeat. Before marking any remaining gate complete, save the status with all open gates eligible on one candidate for [release sign-off](RELEASE.md#live-checks-required-before-shipping).

## Storage and limits

Sessions are stored in `.runtime/acceptance-sessions.json` (or `$MC_AGENT_HOME`). The file is owner-only (0600 in a 0700 directory) and written atomically. A corrupt file is reported and never overwritten. At most 1,000 sessions are kept.

The gate catalog in `src/acceptance-gates.js` mirrors RELEASE.md, and a test fails when they diverge. Closed gates are listed with the date of their historical evidence. The tool cannot mark a gate closed.
