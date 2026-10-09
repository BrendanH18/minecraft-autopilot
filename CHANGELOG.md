# Changelog

Changes being prepared for the initial experimental release. Acceptance is tracked in [docs/RELEASE.md](docs/RELEASE.md).

## Unreleased — intended for v0.1.0

### Added

- Fabric 1.21.1 control of the logged-in character through Baritone.
- Mineflayer server bot with Microsoft device authentication and explicit offline development mode.
- CLI observation, waypoints, navigation, collection, eating, guard, profile attachment, diagnostics, and cleanup.
- Authenticated localhost bridge with exclusive leases, heartbeats, bounded jobs, cancellation, and emergency stop.
- MCP stdio tools and a bounded Ollama planner using structured actions.
- Simulation, Node/Java regression tests, and CI installation artifacts.
- Independent inventory/home checks through `--verify-collect` and `--verify-home`.
- Verified installation ZIP with license, checksums, and source commit/checkout metadata.
- Usage, contributor, roadmap, protocol, troubleshooting, and release documentation.

### Fixed

- Prevent delayed actions/model replies/inventory operations from resuming after handoff or cancellation.
- Recover from collection pits and unmet quotas; report unsuccessful returns as failures.
- Require cobblestone harvesting tools and recover when the last pickaxe breaks.
- Refuse dead-character bot joins instead of waiting indefinitely for spawn.
- Eat before low-health retreat and replan after interrupted collection.
- Handle focus-loss takeover, preload Baritone mining data, and scope homes to world/player/dimension.
- Detect runtime-only Java and follow the selected profile without exposing credentials.

### Validation limits

Recorded live tests used development single-player/offline multiplayer. Real Ollama/MCP use, authenticated handoff, normal launcher installation, and latest recovery/tool changes remain on the acceptance checklist. Combat, crafting, building, deposits, seamless transfer, and guaranteed survival are not implemented.
