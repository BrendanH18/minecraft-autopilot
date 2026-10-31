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

## Context maintenance

- Keep project rules and durable project knowledge in tracked `AGENTS.md` and
  repository docs; do not store them in agent auto-memory or machine-local notes.
- `CLAUDE.md` contains only `@AGENTS.md`. Shared hooks, scripts and settings
  belong in tracked files. Do not ignore instruction files or shared settings;
  ignore only machine-local settings and agent worktrees.
