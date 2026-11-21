# Note-block score planning

Use `note-score` to arrange a tune, mark its triggers, and budget the delays for a note-block build. For example, `node src/cli.js note-score retune-clicks 24,4,1 0,4,24` reports `[1,0,23]` in the JSON result. The first block needs one forward click to wrap from 24 to 0.

Tunings are whole semitone steps from 0 through 24 relative to an instrument's lowest note. Assign positive integer IDs to instruments. Times are whole redstone ticks. Timing calculations assume ten redstone ticks per second at normal game speed. A timeline begins at tick zero, may include leading silence, and accepts simultaneous events. Pass its ticks in nondecreasing order. Comma-separated lists are nonempty, and paired lists must match in length. Lists and generated output arrays have at most 1,000 entries. Scalar and list elements have magnitude at most 1,000,000.

When an interval list starts with a minus sign, put `--` after the command name. For example, `mc-agent note-score interval-walk -- 7 -2,3` returns the pitches `[7,5,8]`.

| # | Command and example arguments | Result |
| --- | --- | --- |
| 1 | `retune-clicks 24,4,1 0,4,24` | Forward clicks from each installed tuning to the corresponding target, modulo 25. |
| 2 | `transpose-window 3,9,20` | Inclusive range of semitone shifts that keep the entire melody playable. |
| 3 | `octave-register 24,7,5 6` | Nearest playable representative of each pitch class to the center, preferring the lower tie. |
| 4 | `mirror-melody 8,12,6 10` | Inversion around the pivot tuning. An unplayable result raises an error. |
| 5 | `scale-snap 4,6,9 8,2,6` | Nearest allowed tuning for each input, preferring the lower tie. |
| 6 | `interval-walk 7 3,-2,0` | Pitches starting at the first tuning and stepping through signed integer intervals. Each must be playable. |
| 7 | `motif-starts 0,2,4,8,10 5,7` | One-based positions at which the motif's sequence of intervals occurs, in any transposition. |
| 8 | `block-manifest 1,2,1,1 3,3,7,3` | Construction counts by instrument and tuning, assuming one dedicated block per event. |
| 9 | `chord-frames 0,0,4 3,8,9` | Events grouped by tick, preserving pitches and duplicates in supplied order. |
| 10 | `roll-chord 2,8,14 3,1,2,1 2` | Arpeggio from tick zero using the supplied one-based chord members and inter-note gap. |
| 11 | `lane-reuse 0,0,2,3,6 3` | Lowest available one-based interchangeable trigger lane at each onset with the given reset time. |
| 12 | `step-onsets 2 2,3,5` | Onsets after the lead-in and an exclusive end tick after the final step. |
| 13 | `bar-address 0,3,11,12 3 4` | Bar and beat (one-based) plus tick offset (zero-based) using the supplied beat count and beat length. |
| 14 | `quantize 0,2,4,5,7 4` | Onsets on the nearest grid tick. Half-grid ties round later. |
| 15 | `swing-pairs 0,4,4,8,12 4 1` | Delay odd half-pair positions by the requested ticks. Delay must be shorter than one half-pair. |
| 16 | `ratchet-step 6 8 3` | Spread attacks inside a single step, rounding ideal offsets down to whole ticks. |
| 17 | `pulse-mask 8 3 1` | Binary rhythm with evenly dispersed hits, rotated forward by the supplied step count. Before rotation the first hit lands on step zero. |
| 18 | `canon-entries 0,2 4,7 0,2` | Copy a phrase to one voice per supplied delay. Ties play in voice order, then original event order. |
| 19 | `reverse-phrase 0,0,4 6,9,12 6` | Mirror each onset around the phrase midpoint. The last possible tick is length minus one. Chord members retain their order. |
| 20 | `section-cut 0,3,5,6 0,4,6,8 3 6` | Events from the inclusive start to the exclusive end, with their clocks relative to the start. |
| 21 | `repeat-seam 2,5,11 12 4` | Gap across the loop seam and extra ticks needed to meet the specified reset time. |
| 22 | `repeater-chain 0,3,8,10` | Minimal serial repeater breakdown for each delay. Place the given number of four-tick repeaters and one final repeater if tail ticks are positive. |
| 23 | `branch-alignment 3,9,2` | Extra delay for each path to match the latest arriving branch. |
| 24 | `tempo-fit 120 2` | Closest whole-tick duration per subdivision and the resulting BPM. Durations are at least one tick, and half-tick ties round up. |
| 25 | `section-cues 2,1,4 4,3,2 5,4,3` | Start and end boundaries for consecutive sections using parallel lists of bar counts, beats per bar, and ticks per beat. |
