import { demand, same } from './offline-kit.js';

const command = (signature, types, description, run) => ({ signature, types, description, run });
const ascending = (a, b) => a - b;

function counts(ids) {
  const totals = new Map();
  for (const id of ids) totals.set(id, (totals.get(id) ?? 0) + 1);
  return totals;
}

function vacancies(slots) {
  const runs = [];
  for (const [index, id] of slots.entries()) {
    if (id !== 0) continue;
    const slot = index + 1;
    if (runs.at(-1)?.end === index) runs.at(-1).end = slot;
    else runs.push({ start: slot, end: slot });
  }
  return runs;
}

function checkTitles(titles, stocks) {
  demand(
    titles.every((id) => id >= 1 && id <= stocks.length),
    'Title must have a catalog entry.',
  );
}

function uniqueVolumes(ids) {
  demand(ids.every((id) => id > 0) && new Set(ids).size === ids.length, 'Supply unique positive volume IDs.');
}

function inventoryDelta(catalog, observed) {
  const wanted = counts(catalog);
  const actual = counts(observed);
  const ids = [...new Set([...catalog, ...observed])].sort(ascending);
  return ids
    .filter((id) => wanted.get(id) !== actual.get(id))
    .map((id) => ({
      id,
      expected: wanted.get(id) ?? 0,
      observed: actual.get(id) ?? 0,
    }));
}

export const libraryGroup = {
  name: 'library-plan',
  note: 'Offline shelf layout, catalog reconciliation and circulation for numbered library volumes.',
  commands: [
    command('vacancy-runs <slots>', ['C'], 'Locate uninterrupted stretches of empty shelf slots.', vacancies),
    command(
      'series-fit <slots> <volumes>',
      ['C', 's'],
      'Find the tightest empty run for an intact series, preferring earlier ties.',
      (slots, volumes) => {
        let best = null;
        for (const { start, end } of vacancies(slots)) {
          const spare = end - start + 1 - volumes;
          if (spare >= 0 && (best === null || spare < best.spare)) best = { start, end: start + volumes - 1, spare };
        }
        return best;
      },
    ),
    command(
      'compact-moves <slots>',
      ['C'],
      'List book moves that close gaps to the left without changing reading order.',
      (slots) => {
        let target = 0;
        return slots.flatMap((id, index) => {
          if (!id) return [];
          target++;
          return index + 1 === target ? [] : [{ id, from: index + 1, to: target }];
        });
      },
    ),
    command(
      'shelf-mask <slots>',
      ['C'],
      'Encode six front-facing chiseled bookshelf slots in row-major occupancy bits.',
      (slots) => {
        demand(slots.length === 6, 'Supply the six slots of a chiseled bookshelf.');
        return slots.reduce((mask, id, i) => mask | (Number(id > 0) << i), 0);
      },
    ),
    command(
      'pull-slips <slots> <requests>',
      ['C', 'S'],
      'Assign each requested copy its earliest matching shelf slot, without reusing a copy.',
      (slots, requests) => {
        const available = [...slots];
        return requests.map((id) => {
          const index = available.indexOf(id);
          if (index < 0) return null;
          available[index] = 0;
          return index + 1;
        });
      },
    ),
    command(
      'desk-trip <desk> <stops>',
      ['c', 'C'],
      'Choose which aisle end to visit first to collect all books on one line, ending at the last pickup.',
      (desk, stops) => {
        const left = Math.min(...stops),
          right = Math.max(...stops);
        const leftFirst = Math.abs(desk - left) <= Math.abs(desk - right);
        return {
          first: leftFirst ? left : right,
          last: leftFirst ? right : left,
          distance: right - left + Math.min(Math.abs(desk - left), Math.abs(desk - right)),
        };
      },
    ),
    command(
      'swap-count <current> <target>',
      ['S', 'S'],
      'Count the fewest arbitrary two-volume swaps that restore a specified shelf order.',
      (current, target) => {
        same(current, target);
        uniqueVolumes(current);
        uniqueVolumes(target);
        const destination = new Map(target.map((id, i) => [id, i]));
        demand(
          current.every((id) => destination.has(id)),
          'Both layouts must contain the same volumes.',
        );
        const visited = new Set();
        let swaps = current.length;
        for (let i = 0; i < current.length; i++) {
          if (visited.has(i)) continue;
          swaps--;
          let slot = i;
          while (!visited.has(slot)) {
            visited.add(slot);
            slot = destination.get(current[slot]);
          }
        }
        return swaps;
      },
    ),
    command(
      'inventory-delta <catalog> <observed>',
      ['indexes', 'indexes'],
      'Compare title multiplicities and list only discrepancies in title order.',
      (catalog, observed) => {
        demand(
          [...catalog, ...observed].every((id) => id > 0),
          'Title IDs must be positive.',
        );
        return inventoryDelta(catalog, observed);
      },
    ),
    command(
      'missing-serials <first> <last> <observed>',
      ['s', 's', 'indexes'],
      'Compress unobserved serial numbers in an inclusive catalog range into gap intervals.',
      (first, last, observed) => {
        demand(first <= last && observed.every((id) => first <= id && id <= last), 'Check the inclusive serial range.');
        const gaps = [];
        let next = first;
        for (const id of [...new Set(observed)].sort(ascending)) {
          if (next < id) gaps.push([next, id - 1]);
          next = id + 1;
        }
        if (next <= last) gaps.push([next, last]);
        return gaps;
      },
    ),
    command(
      'next-accession <occupied> <minimum> <size>',
      ['indexes', 's', 's'],
      'Find the first free consecutive ID range large enough for a new accession.',
      (occupied, minimum, size) => {
        demand(
          occupied.every((id) => id > 0),
          'Accession IDs must be positive.',
        );
        let first = minimum;
        for (const id of [...new Set(occupied)].sort(ascending)) {
          if (id < first) continue;
          if (id - first >= size) break;
          first = id + 1;
        }
        return { first, last: first + size - 1 };
      },
    ),
    command(
      'edition-audit <titles> <editions> <current-editions>',
      ['S', 'S', 'S'],
      'List copies whose edition differs from the current catalog edition.',
      (titles, editions, current) => {
        same(titles, editions);
        checkTitles(titles, current);
        return titles.flatMap((title, i) =>
          editions[i] === current[title - 1]
            ? []
            : [{ copy: i + 1, title, edition: editions[i], current: current[title - 1] }],
        );
      },
    ),
    command(
      'catalog-tabs <sorted-titles> <cards-per-tab>',
      ['S', 's'],
      'Build tab labels from fixed-size groups of sorted title cards.',
      (titles, size) => {
        uniqueVolumes(titles);
        demand(
          titles.every((id, i) => i === 0 || titles[i - 1] < id),
          'Sort title cards in ascending order.',
        );
        const tabs = [];
        for (let i = 0; i < titles.length; i += size)
          tabs.push({ tab: tabs.length + 1, first: titles[i], last: titles[Math.min(i + size, titles.length) - 1] });
        return tabs;
      },
    ),
    command(
      'cross-references <links> <start>',
      ['C', 's'],
      'Trace catalog redirects to a terminal title or the first repeated title.',
      (links, start) => {
        demand(
          start <= links.length && links.every((id) => id <= links.length),
          'Reference must point inside the catalog.',
        );
        const path = [],
          seen = new Set();
        let title = start;
        while (title && !seen.has(title)) {
          path.push(title);
          seen.add(title);
          title = links[title - 1];
        }
        return { path, cycleAt: title || null };
      },
    ),
    command(
      'subject-index <subjects> <titles>',
      ['S', 'S'],
      'Group and deduplicate title references under sorted subject numbers.',
      (subjects, titles) => {
        same(subjects, titles);
        const index = new Map();
        for (const [i, subject] of subjects.entries()) {
          if (!index.has(subject)) index.set(subject, new Set());
          index.get(subject).add(titles[i]);
        }
        return [...index.keys()]
          .sort(ascending)
          .map((subject) => ({ subject, titles: [...index.get(subject)].sort(ascending) }));
      },
    ),
    command(
      'reading-order <prerequisites>',
      ['C'],
      'Order volumes after their prerequisite, selecting the lowest eligible volume at each step.',
      (prerequisites) => {
        demand(
          prerequisites.every((id) => id <= prerequisites.length),
          'Prerequisite must be a catalog volume or zero.',
        );
        const read = new Set();
        while (read.size < prerequisites.length) {
          const i = prerequisites.findIndex(
            (prerequisite, i) => !read.has(i + 1) && (prerequisite === 0 || read.has(prerequisite)),
          );
          demand(i !== -1, 'Prerequisite cycle prevents a reading order.');
          read.add(i + 1);
        }
        return [...read];
      },
    ),
    command(
      'hold-slips <available> <requests>',
      ['C', 'S'],
      'Issue available copies in request order and number each remaining per-title waitlist.',
      (available, requests) => {
        checkTitles(requests, available);
        const stock = [...available],
          waiting = available.map(() => 0);
        return requests.map((title) => {
          if (stock[title - 1] > 0) {
            stock[title - 1]--;
            return 0;
          }
          return ++waiting[title - 1];
        });
      },
    ),
    command(
      'recall-list <volume-ids> <due-days> <today>',
      ['S', 'C', 'c'],
      'Order overdue volumes by oldest due day, breaking ties by volume ID.',
      (ids, due, today) => {
        same(ids, due);
        uniqueVolumes(ids);
        return ids
          .map((id, i) => ({ id, late: today - due[i] }))
          .filter(({ late }) => late > 0)
          .sort((a, b) => b.late - a.late || a.id - b.id);
      },
    ),
    command(
      'renewal-dates <due-days> <holds> <renewals-left> <period> <today>',
      ['C', 'C', 'C', 's', 'c'],
      'Extend eligible current loans from their due date; null marks a refused renewal.',
      (due, holds, renewals, period, today) => {
        same(due, holds, renewals);
        return due.map((day, i) => (day >= today && !holds[i] && renewals[i] > 0 ? day + period : null));
      },
    ),
    command(
      'loan-peak <checkouts> <returns>',
      ['C', 'C'],
      'Find peak concurrent loans across half-open lending intervals and the earliest peak day.',
      (starts, ends) => {
        same(starts, ends);
        const changes = new Map();
        for (const [i, start] of starts.entries()) {
          demand(start <= ends[i], 'A return must be on or after checkout.');
          changes.set(start, (changes.get(start) ?? 0) + 1);
          changes.set(ends[i], (changes.get(ends[i]) ?? 0) - 1);
        }
        let active = 0,
          peak = 0,
          day = null;
        for (const time of [...changes.keys()].sort(ascending)) {
          active += changes.get(time);
          if (active > peak) {
            peak = active;
            day = time;
          }
        }
        return { peak, day };
      },
    ),
    command(
      'reserve-copy <returns> <requests> <period>',
      ['C', 'C', 's'],
      'Schedule title reservations on the earliest free copy, with copy-number ties.',
      (returns, requests, period) => {
        demand(
          requests.every((day, i) => i === 0 || requests[i - 1] <= day),
          'Supply requests in chronological order.',
        );
        const ready = [...returns];
        return requests.map((day) => {
          const earliest = Math.min(...ready);
          const i = ready.indexOf(earliest);
          const start = Math.max(earliest, day);
          ready[i] = start + period;
          return { copy: i + 1, start, due: ready[i] };
        });
      },
    ),
    command(
      'branch-transfer <holdings> <targets>',
      ['C', 'C'],
      'Match surplus copies of one title to branch deficits in branch order.',
      (holdings, targets) => {
        same(holdings, targets);
        const balance = holdings.map((n, i) => n - targets[i]);
        const moves = [];
        let donor = 0;
        for (let i = 0; i < balance.length; i++) {
          while (balance[i] < 0) {
            while (donor < balance.length && balance[donor] <= 0) donor++;
            if (donor === balance.length) break;
            const copies = Math.min(balance[donor], -balance[i]);
            moves.push({ from: donor + 1, to: i + 1, copies });
            balance[donor] -= copies;
            balance[i] += copies;
          }
        }
        return { moves, shortages: balance.map((n) => Math.max(0, -n)) };
      },
    ),
    command(
      'return-sort <home-branches> <bin-capacity>',
      ['S', 's'],
      'Identify each return that fills its branch bin and triggers a dispatch.',
      (homes, capacity) => {
        const bins = new Map(),
          dispatches = [];
        for (const [i, branch] of homes.entries()) {
          const fill = (bins.get(branch) ?? 0) + 1;
          if (fill === capacity) dispatches.push({ after: i + 1, branch });
          bins.set(branch, fill % capacity);
        }
        return dispatches;
      },
    ),
    command(
      'preservation-copies <branch-a> <branch-b> <minimum>',
      ['C', 'C', 'c'],
      'Find copies needed by title at each branch to survive loss of either entire collection.',
      (a, b, minimum) => {
        same(a, b);
        return { branchA: a.map((n) => Math.max(0, minimum - n)), branchB: b.map((n) => Math.max(0, minimum - n)) };
      },
    ),
    command(
      'shelf-reading <slots>',
      ['C'],
      'Report adjacent occupied volumes in descending catalog order, skipping empty slots.',
      (slots) => {
        let previous = null;
        const breaks = [];
        for (const [i, id] of slots.entries()) {
          if (!id) continue;
          if (previous && id < previous.id) breaks.push([previous.slot, i + 1]);
          previous = { id, slot: i + 1 };
        }
        return breaks;
      },
    ),
    command(
      'rotation-picks <last-shown> <available> <places>',
      ['C', 'C', 'c'],
      'Pick available titles least recently displayed for numbered lecterns; lower IDs break ties.',
      (last, stock, places) => {
        same(last, stock);
        return last
          .map((day, i) => ({ id: i + 1, day }))
          .filter(({ id }) => stock[id - 1] > 0)
          .sort((a, b) => a.day - b.day || a.id - b.id)
          .slice(0, places)
          .map(({ id }) => id);
      },
    ),
  ],
};
