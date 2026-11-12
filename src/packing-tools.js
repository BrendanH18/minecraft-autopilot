// Pure offline calculations. All quantities and rates are supplied by the caller.
const MAX = 1_000_000;
function scalar(value, kind) {
  if (!['number', 'string'].includes(typeof value) || String(value).trim() === '') throw new Error('Expected a finite numeric value.');
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || n > MAX || ('PJW'.includes(kind) && n <= 0) || ('IJ'.includes(kind) && !Number.isSafeInteger(n)) || (kind === 'R' && n > 1)) throw new Error('Quantity outside the supported finite range.');
  return n;
}
function read(value, kind) {
  if (!['L', 'W', 'C'].includes(kind)) return scalar(value, kind);
  if (typeof value !== 'string') throw new Error('Expected a comma-separated list.');
  const parts = value.split(',');
  if (!parts.length || parts.length > 1000) throw new Error('Lists are limited to 1000 entries.');
  return parts.map(v => scalar(v, kind === 'C' ? 'I' : kind === 'W' ? 'P' : 'N'));
}
const sum = values => values.reduce((n, v) => n + v, 0);
function same(a, b) { if (a.length !== b.length) throw new Error('Lists must have equal lengths.'); }
function demand(ok, message) { if (!ok) throw new Error(message); }
function checked(value) {
  if (typeof value === 'number' && (!Number.isFinite(value) || Math.abs(value) > Number.MAX_SAFE_INTEGER)) throw new Error('Result exceeds supported numeric range.');
  if (Array.isArray(value)) { if (value.length > 1000) throw new Error('Output is limited to 1000 entries.'); value.forEach(checked); }
  else if (value && typeof value === 'object') Object.values(value).forEach(checked);
  return value;
}

const NOTE = "Offline packing estimates using explicit stack sizes and available slots. Item types in positional lists remain separate; no inventory or container compatibility is inferred.";
export const PACKING_COMMANDS = [
  ["merge <first> <second> <stack-size>", "Merge two same-item quantities and report freed occupied slots."],
  ["fragmentation <counts> <stack-size>", "Compare separate same-item partial stacks with consolidated stacks."],
  ["split <count> <piece-size>", "Divide a quantity into bounded pieces, retaining a final remainder."],
  ["headroom <counts> <stack-size>", "Sum unused space in supplied occupied same-item stacks."],
  ["fill-partials <counts> <incoming> <stack-size>", "Fill partial same-item stacks from left to right before new slots."],
  ["transfer-limit <incoming> <partial-room> <free-slots> <stack-size>", "Bound an incoming transfer by known compatible capacity."],
  ["reserved-capacity <slots> <reserved> <stack-size>", "Compute item capacity after reserving empty slots."],
  ["container-loads <count> <slots> <stack-size>", "Produce whole-container loads plus final partial load."],
  ["container-balance <count> <containers> <stack-size>", "Distribute one item count evenly across containers and count slots."],
  ["item-slots <counts> <stack-sizes>", "Count occupied slots separately for distinct item quantities."],
  ["kit-copies <available> <per-kit>", "Compute complete mixed-item kit copies and remaining stock."],
  ["kit-slots <per-kit> <copies> <stack-sizes>", "Count slots when identical kits may consolidate by item."],
  ["isolated-kits <per-kit> <copies> <stack-sizes>", "Count slots when each kit must stay separately packed."],
  ["repack <count> <old-stack-size> <new-stack-size>", "Measure occupied-slot change under a different supplied limit."],
  ["bundle-overhead <count> <bundle-size> <wrapper-per-bundle>", "Count wrappers and packed units for whole packaging bundles."],
  ["slot-waste <counts> <stack-sizes>", "Measure unused capacity in slots occupied by separate item types."],
  ["compact-order <counts> <stack-sizes>", "Rank item types by reclaimable slots after removing that type."],
  ["drain <counts> <requested>", "Remove from supplied same-item stacks left to right."],
  ["swap-space <outgoing> <incoming> <stack-size>", "Compute net slot change replacing one whole item type with another."],
  ["trip-remainder <count> <capacity> <completed-trips>", "Report stock remaining after complete capacity-sized trips."],
  ["priority-load <counts> <stack-sizes> <slots>", "Pack separate item types in given priority order using full slots."],
  ["minimum-slot-load <counts> <stack-sizes>", "Find the smallest indivisible whole-item load by occupied slots."],
  ["reserve-stock <count> <reserve> <stack-size>", "Split held reserve from transferable stock with separate slot costs."],
  ["stack-threshold <count> <stack-size>", "Report removal needed to free one slot and addition needed to occupy another."],
  ["parallel-carry <carriers> <slots-each> <stack-size> <count>", "Budget synchronized rounds across equally equipped carriers."],
];
const SPECS = {
  "merge": ["I", "I", "J"],
  "fragmentation": ["C", "J"],
  "split": ["I", "J"],
  "headroom": ["C", "J"],
  "fill-partials": ["C", "I", "J"],
  "transfer-limit": ["I", "I", "I", "J"],
  "reserved-capacity": ["I", "I", "J"],
  "container-loads": ["I", "J", "J"],
  "container-balance": ["I", "J", "J"],
  "item-slots": ["C", "C"],
  "kit-copies": ["C", "C"],
  "kit-slots": ["C", "I", "C"],
  "isolated-kits": ["C", "I", "C"],
  "repack": ["I", "J", "J"],
  "bundle-overhead": ["I", "J", "I"],
  "slot-waste": ["C", "C"],
  "compact-order": ["C", "C"],
  "drain": ["C", "I"],
  "swap-space": ["I", "I", "J"],
  "trip-remainder": ["I", "J", "I"],
  "priority-load": ["C", "C", "I"],
  "minimum-slot-load": ["C", "C"],
  "reserve-stock": ["I", "I", "J"],
  "stack-threshold": ["I", "J"],
  "parallel-carry": ["J", "J", "J", "I"],
};

export function packingCalculation(command, args = []) {
  if (!Object.hasOwn(SPECS, command)) throw new Error(`Unknown packing command: ${command}.`);
  const spec = SPECS[command];
  if (args.length !== spec.length) throw new Error(`Expected ${spec.length} arguments.`);
  const values = spec.map((kind, i) => read(args[i], kind));
  let result;
  switch (command) {
    case "merge": { const [a, b, c] = values; result = { count: a+b, occupied: Math.ceil((a+b)/c), freed: Math.ceil(a/c)+Math.ceil(b/c)-Math.ceil((a+b)/c) }; break; }
    case "fragmentation": { const [a, b] = values; demand(a.every(v=>v<=b),'A fragment exceeds the stack size.'); result = { occupied: a.filter(v=>v>0).length, consolidated: Math.ceil(sum(a)/b), freed: a.filter(v=>v>0).length-Math.ceil(sum(a)/b) }; break; }
    case "split": { const [a, b] = values; const n=Math.ceil(a/b); demand(n<=1000,'Too many pieces.'); result = { pieces: Array.from({length:n},(_,i)=>Math.min(b,a-i*b)) }; break; }
    case "headroom": { const [a, b] = values; demand(a.every(v=>v>0&&v<=b),'Supply occupied valid stacks.'); result = { headroom: a.length*b-sum(a) }; break; }
    case "fill-partials": { const [a, b, c] = values; demand(a.every(v=>v>0&&v<=c),'Supply occupied valid stacks.'); let left=b; const stacks=a.map(v=>{const put=Math.min(c-v,left);left-=put;return v+put;}); result={stacks, remaining:left, newSlots:Math.ceil(left/c)}; break; }
    case "transfer-limit": { const [a, b, c, d] = values; result={accepted:Math.min(a,b+c*d),remaining:Math.max(0,a-b-c*d)}; break; }
    case "reserved-capacity": { const [a, b, c] = values; demand(b<=a,'Reserved slots exceed total.'); result={usableSlots:a-b,capacity:(a-b)*c}; break; }
    case "container-loads": { const [a, b, c] = values; const capacity=b*c,n=Math.ceil(a/capacity); demand(n<=1000,'Too many loads.'); result={capacity,loads:Array.from({length:n},(_,i)=>Math.min(capacity,a-i*capacity))}; break; }
    case "container-balance": { const [a, b, c] = values; demand(b<=1000,'Too many containers.'); const q=Math.floor(a/b),r=a%b; const counts=Array.from({length:b},(_,i)=>q+(i<r?1:0)); result={counts,slots:counts.map(v=>Math.ceil(v/c))}; break; }
    case "item-slots": { const [a, b] = values; same(a,b); demand(b.every(v=>v>0),'Stack sizes must be positive.'); const slots=a.map((v,i)=>Math.ceil(v/b[i]));result={slots,totalSlots:sum(slots)}; break; }
    case "kit-copies": { const [a, b] = values; same(a,b); demand(b.every(v=>v>0),'Kit quantities must be positive.'); const copies=Math.min(...a.map((v,i)=>Math.floor(v/b[i]))); result={copies,remaining:a.map((v,i)=>v-copies*b[i])}; break; }
    case "kit-slots": { const [a, b, c] = values; same(a,c); demand(c.every(v=>v>0),'Stack sizes must be positive.'); const slots=a.map((v,i)=>Math.ceil(v*b/c[i]));result={slots,totalSlots:sum(slots)}; break; }
    case "isolated-kits": { const [a, b, c] = values; same(a,c); demand(c.every(v=>v>0),'Stack sizes must be positive.'); result={slotsPerKit:sum(a.map((v,i)=>Math.ceil(v/c[i]))),totalSlots:b*sum(a.map((v,i)=>Math.ceil(v/c[i])))}; break; }
    case "repack": { const [a, b, c] = values; result={oldSlots:Math.ceil(a/b),newSlots:Math.ceil(a/c),slotChange:Math.ceil(a/c)-Math.ceil(a/b)}; break; }
    case "bundle-overhead": { const [a, b, c] = values; const bundles=Math.ceil(a/b);result={bundles,wrappers:bundles*c,unusedCapacity:bundles*b-a}; break; }
    case "slot-waste": { const [a, b] = values; same(a,b); demand(b.every(v=>v>0),'Stack sizes must be positive.'); const unused=a.map((v,i)=>Math.ceil(v/b[i])*b[i]-v);result={unused,totalUnused:sum(unused)}; break; }
    case "compact-order": { const [a, b] = values; same(a,b); demand(b.every(v=>v>0),'Stack sizes must be positive.'); result={order:a.map((v,i)=>({item:i+1,slots:Math.ceil(v/b[i]),count:v})).sort((x,y)=>y.slots-x.slots||x.item-y.item)}; break; }
    case "drain": { const [a, b] = values; let left=b; const stacks=a.map(v=>{const take=Math.min(v,left);left-=take;return v-take;});result={stacks,removed:b-left,unfilled:left}; break; }
    case "swap-space": { const [a, b, c] = values; result={freed:Math.ceil(a/c),required:Math.ceil(b/c),extraSlots:Math.max(0,Math.ceil(b/c)-Math.ceil(a/c))}; break; }
    case "trip-remainder": { const [a, b, c] = values; result={moved:Math.min(a,b*c),remaining:Math.max(0,a-b*c),remainingTrips:Math.ceil(Math.max(0,a-b*c)/b)}; break; }
    case "priority-load": { const [a, b, c] = values; same(a,b);demand(b.every(v=>v>0),'Stack sizes must be positive.');let free=c;const loaded=a.map((v,i)=>{const n=Math.min(v,free*b[i]);free-=Math.ceil(n/b[i]);return n;});result={loaded,remaining:a.map((v,i)=>v-loaded[i]),freeSlots:free}; break; }
    case "minimum-slot-load": { const [a, b] = values; same(a,b);demand(b.every(v=>v>0),'Stack sizes must be positive.');const candidates=a.map((v,i)=>({item:i+1,count:v,slots:Math.ceil(v/b[i])})).filter(v=>v.count>0);result={chosen:candidates.reduce((best,v)=>!best||v.slots<best.slots?v:best,null)}; break; }
    case "reserve-stock": { const [a, b, c] = values; const held=Math.min(a,b),movable=a-held;result={held,movable,reserveShortfall:Math.max(0,b-a),separateSlots:Math.ceil(held/c)+Math.ceil(movable/c)}; break; }
    case "stack-threshold": { const [a, b] = values; result={removeToFree:a?((a-1)%b)+1:0,addToNext:a?Math.ceil(a/b)*b-a+1:1}; break; }
    case "parallel-carry": { const [a, b, c, d] = values; const roundCapacity=a*b*c;result={roundCapacity,rounds:Math.ceil(d/roundCapacity),unusedLastRound:d?Math.ceil(d/roundCapacity)*roundCapacity-d:0}; break; }
  }
  return checked({ ...result, note: NOTE });
}

export function registerPackingTools(program, { print }) {
  const group = program.command("packing").description("Stack and container packing");
  for (const [signature, description] of PACKING_COMMANDS) group.command(signature).description(description).action((...values) => print(packingCalculation(signature.split(' ')[0], values.slice(0, -2))));
  return group;
}
