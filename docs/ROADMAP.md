# Roadmap

The immediate goal is an experimental **v0.1.0** of the current Minecraft 1.21.1 harness. Readiness depends on live acceptance, not a fixed date. [RELEASE.md](RELEASE.md) is the authoritative shipping checklist.

## Current foundation

Implemented: Fabric control, server bot, authenticated bridge/leases, CLI, MCP, Ollama planning, navigation, bounded collection, eating/retreat, handoff, independent criteria, and verified packaging. Local automated checks pass; recorded live results are in [DEVELOPMENT.md](DEVELOPMENT.md#validation).

## v0.1 acceptance work

1. Install in a normal Fabric launcher and test current recovery/handoff behavior.
2. Run a real Ollama task with inventory/home criteria and exercise a real MCP agent.
3. Validate authenticated client → bot → client continuity using UUID and inventory.
4. Validate cobblestone/tool loss, hostile observations, dimension changes, partial collection, and failed returns in live worlds.
5. Confirm remote CI, rebuild a clean-source artifact, and publish the preview with tested configurations and limitations.

Source and packaging can be prepared before account/keyboard access is available. Allow one or two focused live-testing sessions plus resulting fixes; the estimate does not replace acceptance checks.

## After v0.1

Candidates to evaluate after validation, rather than promised release dates:

| Candidate | Purpose |
| --- | --- |
| Chest deposits | A repeatable gather-and-store workflow |
| Better collection/path recovery | Improve difficult trees, terrain, tools, and inventory capacity |
| More task criteria | Verify more concrete outcomes independently of model explanations |
| Crafting and building | Expand actions after the current lifecycle is reliable |
| Combat and richer survival | Protection beyond health/hunger reflexes |
| Client/bot transfer | Reduce reconnection steps while preserving identity and ownership |
| Optional input takeover | Ordinary input handoff without accidental reacquisition |

Prioritize evidence from real use. Each new action needs preconditions, observable completion, execution limits, and cancellation that respects player takeover.
