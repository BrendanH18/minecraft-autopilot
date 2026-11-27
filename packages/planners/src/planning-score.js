import { demand, same, sequence, sum } from './offline-kit.js';

const command = (signature, types, description, run) => ({ signature, types, description, run });

function tunings(values) {
  demand(
    values.every((value) => Number.isInteger(value) && value >= 0 && value <= 24),
    'Tunings must be integers from 0 to 24.',
  );
  return values;
}

function timeline(ticks) {
  demand(
    ticks.every((tick, i) => i === 0 || tick >= ticks[i - 1]),
    'Score ticks must be in nondecreasing order.',
  );
  return ticks;
}

function score(ticks, pitches) {
  same(ticks, pitches);
  timeline(ticks);
  tunings(pitches);
}

function nearest(value, candidates) {
  return candidates.reduce((best, candidate) =>
    Math.abs(candidate - value) < Math.abs(best - value) ? candidate : best,
  );
}

const commands = [
  command(
    'retune-clicks <installed> <wanted>',
    ['C', 'C'],
    'Count forward tuning clicks per block, wrapping after 24.',
    (installed, wanted) => {
      same(installed, wanted);
      tunings(installed);
      tunings(wanted);
      return wanted.map((value, i) => (value - installed[i] + 25) % 25);
    },
  ),
  command(
    'transpose-window <pitches>',
    ['C'],
    'Find the inclusive semitone shifts that keep every tuning playable.',
    (pitches) => {
      tunings(pitches);
      return { lowestShift: 0 - Math.min(...pitches), highestShift: 24 - Math.max(...pitches) };
    },
  ),
  command(
    'octave-register <pitches> <center>',
    ['C', 'c'],
    'Place each pitch in the octave closest to a requested tuning.',
    (pitches, center) => {
      tunings([center]);
      return tunings(pitches).map((pitch) =>
        nearest(
          center,
          sequence(25, (i) => i).filter((i) => i % 12 === pitch % 12),
        ),
      );
    },
  ),
  command(
    'mirror-melody <pitches> <pivot>',
    ['C', 'c'],
    'Invert melodic intervals around a fixed tuning.',
    (pitches, pivot) => {
      tunings([pivot]);
      return tunings(tunings(pitches).map((pitch) => 2 * pivot - pitch));
    },
  ),
  command(
    'scale-snap <pitches> <allowed>',
    ['C', 'C'],
    'Move each note to the nearest supplied tuning, choosing the lower tie.',
    (pitches, allowed) => {
      const sorted = tunings(allowed).sort((a, b) => a - b);
      return tunings(pitches).map((pitch) => nearest(pitch, sorted));
    },
  ),
  command(
    'interval-walk <first> <steps>',
    ['c', 'l'],
    'Generate a playable melody from successive signed semitone intervals.',
    (first, steps) => {
      demand(steps.every(Number.isInteger), 'Intervals must be whole semitones.');
      let pitch = first;
      return tunings([first, ...steps.map((step) => (pitch += step))]);
    },
  ),
  command(
    'motif-starts <pitches> <motif>',
    ['C', 'C'],
    'Find one-based starts of a motif in any transposition, including overlaps.',
    (pitches, motif) => {
      tunings(pitches);
      tunings(motif);
      return pitches.flatMap((pitch, i) =>
        i + motif.length <= pitches.length && motif.every((note, j) => pitches[i + j] - pitch === note - motif[0])
          ? [i + 1]
          : [],
      );
    },
  ),
  command(
    'block-manifest <instruments> <pitches>',
    ['S', 'C'],
    'Count dedicated blocks per instrument and tuning in first-use order.',
    (instruments, pitches) => {
      same(instruments, pitches);
      tunings(pitches);
      const rows = new Map();
      for (const [i, instrument] of instruments.entries()) {
        const pitch = pitches[i];
        const key = instrument * 25 + pitch;
        if (!rows.has(key)) rows.set(key, { instrument, pitch, count: 0 });
        rows.get(key).count++;
      }
      return [...rows.values()];
    },
  ),
  command(
    'chord-frames <ticks> <pitches>',
    ['C', 'C'],
    'Group simultaneous score events into ordered chord frames.',
    (ticks, pitches) => {
      score(ticks, pitches);
      const frames = [];
      for (const [i, tick] of ticks.entries()) {
        if (frames.at(-1)?.tick !== tick) frames.push({ tick, pitches: [] });
        frames.at(-1).pitches.push(pitches[i]);
      }
      return frames;
    },
  ),
  command(
    'roll-chord <pitches> <order> <gap>',
    ['C', 'S', 's'],
    'Roll a chord from tick zero following a sequence of one-based member indexes.',
    (pitches, order, gap) => {
      tunings(pitches);
      return order.map((member, i) => {
        demand(member <= pitches.length, 'Chord member is out of range.');
        return { tick: i * gap, pitch: pitches[member - 1] };
      });
    },
  ),
  command(
    'lane-reuse <ticks> <reset>',
    ['C', 's'],
    'Assign interchangeable trigger lanes with a minimum gap between uses.',
    (ticks, reset) => {
      timeline(ticks);
      const ready = [];
      return ticks.map((tick) => {
        const first = ready.findIndex((available) => available <= tick);
        const lane = first < 0 ? ready.length : first;
        ready[lane] = tick + reset;
        return lane + 1;
      });
    },
  ),
  command(
    'step-onsets <lead-in> <step-lengths>',
    ['c', 'S'],
    'Convert successive step lengths into trigger ticks and an end marker.',
    (start, lengths) => {
      let end = start;
      const ticks = lengths.map((length) => {
        const tick = end;
        end += length;
        return tick;
      });
      return { ticks, end };
    },
  ),
  command(
    'bar-address <ticks> <beats-per-bar> <ticks-per-beat>',
    ['C', 's', 's'],
    'Locate ticks by one-based bar and beat and zero-based offset.',
    (ticks, beats, unit) =>
      ticks.map((tick) => ({
        bar: Math.floor(tick / (unit * beats)) + 1,
        beat: (Math.floor(tick / unit) % beats) + 1,
        offset: tick % unit,
      })),
  ),
  command(
    'quantize <ticks> <grid>',
    ['C', 's'],
    'Snap each onset to its nearest grid line, rounding half-grid ties later.',
    (ticks, grid) => timeline(ticks).map((tick) => Math.round(tick / grid) * grid),
  ),
  command(
    'swing-pairs <ticks> <half-pair> <delay>',
    ['C', 's', 'c'],
    'Delay offbeats in paired eighths while retaining downbeats.',
    (ticks, half, delay) => {
      demand(delay < half, 'Delay must be less than the half-pair length.');
      return timeline(ticks).map((tick) => {
        demand(tick % half === 0, 'Swing inputs must lie on the half-pair grid.');
        return tick % (half * 2) === 0 ? tick : tick + delay;
      });
    },
  ),
  command(
    'ratchet-step <start> <length> <hits>',
    ['c', 's', 's'],
    'Subdivide a step into distinct evenly spaced integer-tick attacks.',
    (start, length, hits) => {
      demand(hits <= length, 'Each hit needs at least one tick.');
      return sequence(hits, (i) => start + Math.floor((i * length) / hits));
    },
  ),
  command(
    'pulse-mask <steps> <hits> <rotation>',
    ['s', 'c', 'c'],
    'Spread a pulse count across a cyclic step grid and rotate it forward.',
    (steps, hits, rotation) => {
      demand(hits <= steps, 'Hits cannot exceed steps.');
      return sequence(steps, (i) => ((((i - (rotation % steps) + steps) % steps) * hits) % steps < hits ? 1 : 0));
    },
  ),
  command(
    'canon-entries <ticks> <pitches> <delays>',
    ['C', 'C', 'C'],
    'Interleave delayed copies of a phrase, tagging each entry with its voice.',
    (ticks, pitches, delays) => {
      score(ticks, pitches);
      demand(ticks.length * delays.length <= 1000, 'Canon exceeds 1000 events.');
      return delays
        .flatMap((delay, voice) =>
          ticks.map((tick, i) => ({ tick: tick + delay, voice: voice + 1, pitch: pitches[i] })),
        )
        .sort((a, b) => a.tick - b.tick || a.voice - b.voice);
    },
  ),
  command(
    'reverse-phrase <ticks> <pitches> <length>',
    ['C', 'C', 's'],
    'Reflect trigger positions across a discrete phrase, preserving order within each chord.',
    (ticks, pitches, length) => {
      score(ticks, pitches);
      demand(ticks.at(-1) < length, 'Events must be inside the phrase.');
      return ticks.map((tick, i) => ({ tick: length - 1 - tick, pitch: pitches[i] })).sort((a, b) => a.tick - b.tick);
    },
  ),
  command(
    'section-cut <ticks> <pitches> <start> <end>',
    ['C', 'C', 'c', 'c'],
    'Extract events in a half-open section and rebase them to its start.',
    (ticks, pitches, start, end) => {
      score(ticks, pitches);
      demand(start <= end, 'Section end must follow or equal its start.');
      return ticks.flatMap((tick, i) =>
        tick >= start && tick < end ? [{ tick: tick - start, pitch: pitches[i] }] : [],
      );
    },
  ),
  command(
    'repeat-seam <ticks> <period> <reset>',
    ['C', 's', 's'],
    'Measure the gap from the last trigger to the next first trigger and identify missing reset time.',
    (ticks, period, reset) => {
      timeline(ticks);
      demand(ticks.at(-1) < period, 'Triggers must be inside one period.');
      const gap = period - ticks.at(-1) + ticks[0];
      return { gap, missing: Math.max(0, reset - gap) };
    },
  ),
  command(
    'repeater-chain <delays>',
    ['C'],
    'Budget the fewest serial repeaters for each delay in redstone ticks.',
    (delays) => delays.map((delay) => ({ fourTick: Math.floor(delay / 4), tailTicks: delay % 4 })),
  ),
  command(
    'branch-alignment <path-delays>',
    ['C'],
    'Calculate extra delay on each branch so chords arrive simultaneously.',
    (delays) => {
      const arrival = Math.max(...delays);
      return delays.map((delay) => arrival - delay);
    },
  ),
  command(
    'tempo-fit <bpm> <subdivisions>',
    ['s', 's'],
    'Find the integer redstone-tick subdivision closest in duration to the requested tempo.',
    (bpm, subdivisions) => {
      const ticks = Math.max(1, Math.round(600 / (bpm * subdivisions)));
      return { ticks, effectiveBpm: 600 / (ticks * subdivisions) };
    },
  ),
  command(
    'section-cues <bar-counts> <beats-per-bar> <ticks-per-beat>',
    ['S', 'S', 'S'],
    'Place section boundaries for a score with meter and tempo changes.',
    (bars, beats, units) => {
      same(bars, beats, units);
      const lengths = bars.map((count, i) => count * beats[i] * units[i]);
      demand(Number.isSafeInteger(sum(lengths)), 'Score duration exceeds the supported integer range.');
      let tick = 0;
      return [0, ...lengths.map((length) => (tick += length))];
    },
  ),
];

export const scoreGroup = {
  name: 'note-score',
  note: 'Offline note-block score planning using caller-supplied pitches, instruments and redstone-tick timing.',
  commands,
};
