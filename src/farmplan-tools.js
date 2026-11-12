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

const NOTE = "Offline plot, harvest, and replenishment estimates from supplied dimensions, yields, growth times, and loss assumptions. No crop mechanics, hydration, random tick behavior, or actual yield is inferred.";
export const FARMPLAN_COMMANDS = [
  ["rows <width> <length> <row-gap>", "Count one-cell planting rows separated by explicit empty-row gaps."],
  ["beds <width> <length> <bed-width> <path-width>", "Count planting columns in repeating beds and paths with a clipped final bed."],
  ["grid-spacing <width> <length> <x-spacing> <z-spacing>", "Count plants at regular lattice positions beginning at the origin cell."],
  ["edge-margin <width> <length> <margin>", "Remove an equal unplanted border from a rectangular plot."],
  ["seed-budget <plants> <seeds-per-plant> <reserve>", "Budget initial planting and an explicit held seed reserve."],
  ["harvest <plants> <yield-per-plant> <survival>", "Estimate gross and surviving harvest with a supplied fractional survival."],
  ["replant <harvested-seeds> <plants> <seed-cost>", "Separate replanting seed requirement from distributable excess."],
  ["cycles <target> <plants> <yield-per-cycle>", "Estimate complete harvest cycles for a target under constant yields."],
  ["growth-schedule <cycles> <growth-minutes> <harvest-minutes>", "List bounded sequential cycle completion times including harvest work."],
  ["stagger <beds> <cycle-minutes>", "Offset equal beds uniformly across an assumed cycle."],
  ["steady-yield <plants> <yield> <cycle-minutes>", "Convert an assumed repeated harvest to ideal average output flow."],
  ["target-area <items-per-hour> <yield-per-cell> <cycle-minutes>", "Estimate planting cells needed for a constant average output target."],
  ["water-lattice <width> <length> <coverage-width> <coverage-length>", "Count rectangular coverage tiles with supplied spans; no hydration simulation."],
  ["path-share <width> <length> <path-every>", "Count full-width cross paths every given row starting at the last row of each period."],
  ["fertilizer <plants> <applications> <units-per-application>", "Budget caller-supplied fertilizer use per plant and application."],
  ["compost <inputs> <success-fraction> <levels-per-output>", "Estimate output from independent expected compost-level contributions."],
  ["seed-multiply <initial-seeds> <net-multiplier> <cycles>", "Project bounded compounded seed stock under a supplied net multiplier."],
  ["loss-buffer <target> <loss-fraction> <yield-per-plant>", "Inflate required plant count for expected fractional harvest losses."],
  ["rotation <areas> <yields>", "Estimate harvest by positional crop area and supplied yield."],
  ["harvest-work <plants> <seconds-per-plant> <workers>", "Estimate whole-plant work waves across equal workers."],
  ["storage <plants> <yield> <cycles> <stack-size>", "Estimate occupied whole slots for accumulated expected harvest."],
  ["consumption-balance <harvest> <cycle-minutes> <consumption-per-minute>", "Compare one harvest with consumption during its assumed growth cycle."],
  ["expansion <current-plants> <target-plants> <seeds-per-plant>", "Budget seed costs for only the additional planting area."],
  ["season <minutes> <growth-minutes> <plants> <yield>", "Estimate complete harvests inside an explicit time window."],
  ["bed-allocation <total-plants> <weights>", "Allocate integer planting cells by largest remainders of explicit crop weights."],
];
const SPECS = {
  "rows": ["J", "J", "I"],
  "beds": ["J", "J", "J", "I"],
  "grid-spacing": ["J", "J", "J", "J"],
  "edge-margin": ["J", "J", "I"],
  "seed-budget": ["I", "J", "I"],
  "harvest": ["I", "N", "R"],
  "replant": ["I", "I", "J"],
  "cycles": ["N", "J", "P"],
  "growth-schedule": ["I", "P", "N"],
  "stagger": ["J", "P"],
  "steady-yield": ["I", "N", "P"],
  "target-area": ["N", "P", "P"],
  "water-lattice": ["J", "J", "J", "J"],
  "path-share": ["J", "J", "J"],
  "fertilizer": ["I", "I", "N"],
  "compost": ["I", "R", "J"],
  "seed-multiply": ["I", "P", "I"],
  "loss-buffer": ["N", "R", "P"],
  "rotation": ["C", "L"],
  "harvest-work": ["I", "P", "J"],
  "storage": ["I", "N", "I", "J"],
  "consumption-balance": ["N", "P", "N"],
  "expansion": ["I", "I", "J"],
  "season": ["N", "P", "I", "N"],
  "bed-allocation": ["I", "W"],
};

export function farmplanCalculation(command, args = []) {
  if (!Object.hasOwn(SPECS, command)) throw new Error(`Unknown farmplan command: ${command}.`);
  const spec = SPECS[command];
  if (args.length !== spec.length) throw new Error(`Expected ${spec.length} arguments.`);
  const values = spec.map((kind, i) => read(args[i], kind));
  let result;
  switch (command) {
    case "rows": { const [a, b, c] = values; const rows=Math.ceil(a/(c+1));result={rows,plants:rows*b,unusedCells:a*b-rows*b}; break; }
    case "beds": { const [a, b, c, d] = values; const full=Math.floor(a/(c+d)),rem=a%(c+d),planted=full*c+Math.min(c,rem);result={plantingColumns:planted,plants:planted*b,pathCells:(a-planted)*b}; break; }
    case "grid-spacing": { const [a, b, c, d] = values; result={columns:Math.ceil(a/c),rows:Math.ceil(b/d),plants:Math.ceil(a/c)*Math.ceil(b/d)}; break; }
    case "edge-margin": { const [a, b, c] = values; const width=Math.max(0,a-2*c),length=Math.max(0,b-2*c);result={plantingWidth:width,plantingLength:length,plants:width*length,borderCells:a*b-width*length}; break; }
    case "seed-budget": { const [a, b, c] = values; result={plantingSeeds:a*b,totalSeeds:a*b+c}; break; }
    case "harvest": { const [a, b, c] = values; result={gross:a*b,expectedUsable:a*b*c}; break; }
    case "replant": { const [a, b, c] = values; const required=b*c;result={required,missing:Math.max(0,required-a),surplus:Math.max(0,a-required)}; break; }
    case "cycles": { const [a, b, c] = values; const perCycle=b*c,cycles=Math.ceil(a/perCycle);result={perCycle,cycles,expectedSurplus:cycles*perCycle-a}; break; }
    case "growth-schedule": { const [a, b, c] = values; demand(a<=1000,'Too many cycles.');result={minutes:a*(b+c),completions:Array.from({length:a},(_,i)=>(i+1)*(b+c))}; break; }
    case "stagger": { const [a, b] = values; demand(a<=1000,'Too many beds.');result={intervalMinutes:b/a,offsets:Array.from({length:a},(_,i)=>i*b/a)}; break; }
    case "steady-yield": { const [a, b, c] = values; result={perMinute:a*b/c,perHour:a*b*60/c}; break; }
    case "target-area": { const [a, b, c] = values; result={cells:Math.ceil(a*c/(60*b))}; break; }
    case "water-lattice": { const [a, b, c, d] = values; result={columns:Math.ceil(a/c),rows:Math.ceil(b/d),sources:Math.ceil(a/c)*Math.ceil(b/d)}; break; }
    case "path-share": { const [a, b, c] = values; const pathRows=Math.floor(b/c);result={pathRows,pathCells:a*pathRows,plantingCells:a*(b-pathRows)}; break; }
    case "fertilizer": { const [a, b, c] = values; result={applications:a*b,units:a*b*c}; break; }
    case "compost": { const [a, b, c] = values; result={expectedLevels:a*b,expectedOutputs:a*b/c}; break; }
    case "seed-multiply": { const [a, b, c] = values; demand(c<=1000,'Too many cycles.');result={expectedSeeds:a*b**c}; break; }
    case "loss-buffer": { const [a, b, c] = values; demand(b<1,'Total loss cannot meet a positive target.');result={plants:Math.ceil(a/((1-b)*c))}; break; }
    case "rotation": { const [a, b] = values; same(a,b);const harvest=a.map((v,i)=>v*b[i]);result={harvest,total:sum(harvest)}; break; }
    case "harvest-work": { const [a, b, c] = values; result={waves:Math.ceil(a/c),seconds:Math.ceil(a/c)*b}; break; }
    case "storage": { const [a, b, c, d] = values; const items=a*b*c;result={expectedItems:items,slots:Math.ceil(items/d)}; break; }
    case "consumption-balance": { const [a, b, c] = values; result={consumed:b*c,net:a-b*c,sustainable:a>=b*c}; break; }
    case "expansion": { const [a, b, c] = values; const added=Math.max(0,b-a);result={additionalPlants:added,seeds:added*c}; break; }
    case "season": { const [a, b, c, d] = values; const cycles=Math.floor(a/b);result={cycles,expectedItems:cycles*c*d,unusedMinutes:a-cycles*b}; break; }
    case "bed-allocation": { const [a, b] = values; const total=sum(b),ideal=b.map(v=>a*v/total),counts=ideal.map(Math.floor),order=ideal.map((v,i)=>({i,r:v-counts[i]})).sort((x,y)=>y.r-x.r||x.i-y.i);for(let n=a-sum(counts),i=0;i<n;i++)counts[order[i].i]++;result={plants:counts}; break; }
  }
  return checked({ ...result, note: NOTE });
}

export function registerFarmplanTools(program, { print }) {
  const group = program.command("farmplan").description("Abstract farm estimates");
  for (const [signature, description] of FARMPLAN_COMMANDS) group.command(signature).description(description).action((...values) => print(farmplanCalculation(signature.split(' ')[0], values.slice(0, -2))));
  return group;
}
