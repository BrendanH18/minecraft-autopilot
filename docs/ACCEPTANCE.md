# Acceptance sessions

`mc-agent acceptance` turns the open live gates in [RELEASE.md](RELEASE.md#live-checks-required-before-shipping) into recordable sessions. Each session captures what [ROADMAP.md](ROADMAP.md) step 6 asks for: the commit, the artifact checksum, the backend, the launcher/server/model configuration, the scenario, and the result.

It records human observations. It does not run gameplay, contact Minecraft or a model, or edit RELEASE.md. A person reviews the evidence and ticks a box.

## Commands

| Command | Purpose |
| --- | --- |
| `acceptance list [--open] [--backend <fabric\|mineflayer\|both>]` | List open and closed gates. A fabric or mineflayer filter includes gates that need both. |
| `acceptance show <gate>` | Show prerequisites, numbered steps, and the evidence to record. |
| `acceptance start <gate> --backend <fabric\|mineflayer\|both\|demo> [--launcher ..] [--server ..] [--model ..] [--mcp-client ..] [--note ..]` | Start a session and capture provenance. |
| `acceptance step <session> <n> pass\|fail [--note ..]` | Record an observation for step `n`. Re-recording keeps the earlier observation. |
| `acceptance finish <session> pass\|fail\|blocked [--note ..]` | Finish a session. `fail` and `blocked` need `--note`. `pass` is refused while a step's latest observation failed. |
| `acceptance sessions [--gate <gate>]` | List recorded sessions. |
| `acceptance report [--gate <gate>] [--format markdown\|json]` | Print Markdown for the [DEVELOPMENT.md](DEVELOPMENT.md#validation) Validation section, or JSON. |
| `acceptance status` | Show the latest finished session for each open gate and backend, and whether it is eligible evidence. |

Sessions can be named by their full id or an unambiguous prefix of at least six characters.

Use backend `both` only for the authenticated handoff, which exercises the client and the bot in one session. Gates marked `both` otherwise need a separate session for each backend on the same candidate. `demo` is for rehearsing the workflow and never counts.

## Workflow

```sh
npm run build:mod                      # from a clean commit; writes dist/BUILD.json and checksums
npm start -- acceptance show fabric-f8-takeover
npm start -- acceptance start fabric-f8-takeover --backend fabric \
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
- The Node version.

A missing `dist/` is recorded as `null` with a warning. Check that the installed jars came from the recorded archive.

## Eligibility

A gate's evidence is **eligible** when, for each backend it needs, the latest finished session:

- finished as `pass`, with a passing latest observation for every step;
- used the gate's backend (never `demo`);
- ran on a known commit with a clean worktree;
- has a `dist/BUILD.json` that matches that commit and records `sourceModified: false`;
- has an archive checksum that matches `ARCHIVE_SHA256SUMS`.

Any other session is **not acceptance of a verified release candidate**, and the report says so. A later failed or blocked session replaces earlier eligible evidence. Eligibility makes a session ready for review; it does not close a gate.

## Storage and limits

Sessions are stored in `.runtime/acceptance-sessions.json` (or `$MC_AGENT_HOME`). The file is owner-only (0600 in a 0700 directory) and written atomically. A corrupt file is reported and never overwritten. At most 1,000 sessions are kept.

The gate catalog in `src/acceptance-gates.js` mirrors RELEASE.md, and a test fails when they diverge. Closed gates are listed with the date of their historical evidence. The tool cannot mark a gate closed.
