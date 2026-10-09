# v0.1 release checklist

v0.1.0 is an **experimental preview** of the existing Minecraft 1.21.1 player harness. It includes Fabric control, the standalone bot, CLI, MCP, local Ollama planning, bounded collection/navigation/eating, and explicit handoff. It does not include combat, crafting, building, chest deposits, automatic reconnect transfer, or guaranteed survival.

## Automated release checks

- [x] JavaScript syntax and Node regression tests pass.
- [x] The simulated bridge completes a collection/eating/home/handoff smoke check.
- [x] The Fabric mod compiles against the pinned APIs; Java helper tests pass.
- [x] Explicit agent inventory/home criteria are checked independently of model explanations.
- [x] Packaging verifies exact jar names, manifest hashes, and pinned third-party hashes; it includes the project license.
- [x] CI runs the simulation and produces a verified installation artifact.

The CI workflow is configured, but its remote execution on the final release commit must also pass. Automated checks and simulated/mocked model replies do not substitute for the live checks below.

## Live checks required before shipping

- [ ] Install the packaged jars in a normal Fabric launcher profile, enter a real world, attach the CLI, and observe the existing character.
- [ ] Run collection with partial progress and recovery from a pit on the latest Fabric and bot code. Verify an unreachable return is reported as failed and inventory progress remains observable.
- [ ] Run a real installed Ollama model with `--verify-collect oak_log:8 --verify-home`. Record the model name/version, initial inventory, result, and final manual control.
- [ ] Use a real MCP agent to observe, explicitly acquire, perform an action, and stop.
- [ ] Press F8 during inference/action; close the menu afterward and verify no command resumes. Check emergency stop and lease expiry with the packaged mod.
- [ ] Validate authenticated client → bot → client handoff. Check the UUID and inventory at each stage; never connect both as the same account simultaneously.
- [ ] Validate cobblestone with a pickaxe, hostile observations, and release on dimension change.

Earlier offline gameplay results are recorded in [DEVELOPMENT.md](DEVELOPMENT.md#validation). These boxes remain open until the latest release candidate has been observed working. Record failures and fix blocking regressions before marking them complete. Testing authenticated play requires the account owner; testing a normal launcher and F8 requires a person at the keyboard.

## Build and distribute

Use Node.js 22+ and a full Java 21 JDK on PATH. Follow the development guide's explicit download setup if dependencies are not cached. Then run:

```sh
npm run check
npm test
npm start -- demo --smoke
npm run build:mod
npm run verify:mod
```

Commit the final source, confirm `git status --short` is empty, and rebuild the bundle. `dist/BUILD.json` must identify that commit with `sourceModified: false`. Verify the archive against `dist/ARCHIVE_SHA256SUMS` before uploading it.

The installation download is `dist/minecraft-agent-0.1.0.zip`; it includes three mod jars, install instructions, license, jar checksums, and build metadata. The CLI remains source-installed with `npm ci`; `package.json` is private, and this release does not publish an npm package. Provide the source/tag link alongside the mod download.

After the live checks and remote CI pass, tag the verified commit as `v0.1.0` and publish the archive and its checksum. Release notes must call it an experimental preview, list the tested launcher/model/server configurations, and retain the documented limitations and known issues. Creating the archive locally does not publish a release.

## Planning estimate

The code and packaging can be prepared independently of live account access. The remaining critical path is one or two focused live-testing sessions plus any fixes they uncover. This is a conditional estimate, not a scheduled release date; real-model behavior and authenticated handoff have not yet been verified.
