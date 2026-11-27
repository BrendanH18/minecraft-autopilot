# Bearing estimates

Offline orientation math. Minecraft yaw zero faces +Z and positive yaw turns toward -X; pitch is positive downward. Does not rotate a player or check visibility.

Run `mc-agent bearing --help` for all commands. Every output is JSON with `result` and `note`. This group is offline and never acquires control or connects to Minecraft. Numeric inputs must be finite and are bounded to one million unless a narrower domain is documented; integer counts reject fractions. Structured outputs are capped at 1000 entries and results outside the safe numeric range are rejected.

| Command | Meaning |
| --- | --- |
| `yaw-vector <yaw>` | Convert Minecraft yaw to a horizontal unit direction. |
| `pitch-vector <yaw> <pitch>` | Convert yaw and pitch to a three-dimensional unit direction. |
| `vector-yaw <x> <z>` | Convert a nonzero horizontal vector to Minecraft yaw. |
| `vector-pitch <horizontal> <vertical>` | Compute pitch from horizontal length and signed vertical rise. |
| `signed-turn <from> <to>` | Find the shortest signed yaw change in [-180,180). |
| `turn-time <from> <to> <degrees-per-second>` | Estimate shortest-turn duration at a supplied angular speed. |
| `step-yaw <from> <to> <maximum>` | Clamp a shortest-turn update to a maximum angular step. |
| `compass-sector <yaw> <sectors>` | Quantize yaw to a numbered equal compass sector; zero faces south. |
| `sector-center <sector> <sectors>` | Recover the yaw at the center of a numbered sector. |
| `forward-offset <yaw> <distance>` | Project a signed distance forward along a yaw. |
| `right-offset <yaw> <distance>` | Project a signed distance to the right of a yaw. |
| `local-offset <yaw> <forward> <right>` | Rotate forward/right local offsets into world X/Z. |
| `world-offset <yaw> <x> <z>` | Resolve world X/Z offsets into forward/right components. |
| `cone-test <facing> <target> <half-angle>` | Test a target yaw against an inclusive horizontal viewing cone. |
| `cone-width <distance> <half-angle>` | Compute a cone cross-section width for a half-angle below ninety degrees. |
| `angular-size <width> <distance>` | Compute apparent angular width of a centered flat target. |
| `heading-average <first> <second>` | Circular mean of two headings; reject opposite headings. |
| `heading-blend <from> <to> <fraction>` | Interpolate along the shortest yaw turn. |
| `turn-samples <from> <to> <intervals>` | List evenly spaced shortest-turn headings including endpoints. |
| `slope-angle <rise> <run>` | Convert a signed slope to an elevation angle. |
| `rise-from-angle <angle> <run>` | Compute rise from an elevation angle strictly between +/-90 degrees. |
| `run-from-angle <angle> <rise>` | Compute horizontal run for positive rise and positive elevation angle. |
| `pitch-limit <pitch> <minimum> <maximum>` | Clamp a pitch into a supplied valid pitch range. |
| `crosswind <heading> <wind-heading> <speed>` | Resolve a supplied wind vector into forward/right components. |
| `sweep-count <field-of-view> <overlap>` | Count equal camera headings covering a full turn at supplied overlap. |

Examples:

```sh
mc-agent bearing yaw-vector 0
mc-agent bearing pitch-vector 0 0
mc-agent bearing vector-yaw 0 1
```

Fractional volumes and lengths are continuous estimates; round and choose actual game materials separately. No command executes an action.
