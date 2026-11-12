import { wholeFloor, wholeCeil } from './resource-rounding.js';
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

const NOTE = "Offline production arithmetic from caller-supplied recipe inputs, yields, and rates. No Minecraft recipe, crafting ability, or machine behavior is assumed.";
export const PRODUCTION_COMMANDS = [
  ["recipe <wanted> <yield> <input-per-batch>", "Round output demand to whole recipe batches."],
  ["stock-batches <stock> <input-per-batch> <yield>", "Limit complete recipe batches by one input stock."],
  ["bottleneck <stocks> <per-batch>", "Limit production by multiple independently consumed inputs."],
  ["shortfall <wanted> <yield> <stocks> <per-batch>", "Compute additional input quantities for a target output."],
  ["chain <wanted-final> <first-yield> <second-input> <second-yield>", "Budget two recipe stages with a unit raw input per first batch."],
  ["byproduct <batches> <main-yield> <byproduct-yield>", "Calculate paired main and byproduct quantities."],
  ["recycle <initial> <recovery-fraction> <passes>", "Estimate repeated fractional recycling for a bounded number of passes."],
  ["cycle-time <batches> <seconds-per-batch> <machines>", "Estimate synchronized identical machines processing whole batches."],
  ["rate <yield> <seconds-per-batch> <machines>", "Calculate ideal sustained output rate for supplied machine behavior."],
  ["deadline <batches> <seconds-per-batch> <seconds-available>", "Find machines needed to meet a whole-batch deadline."],
  ["batch-cap <wanted> <yield> <maximum-batches>", "Report fulfillment under a hard batch cap."],
  ["startup <batches> <startup-seconds> <batch-seconds>", "Add one startup cost only when production is nonempty."],
  ["setup-runs <batches> <run-capacity> <setup-seconds> <batch-seconds>", "Include setup once per bounded production run."],
  ["input-rate <output-per-minute> <input-per-batch> <yield>", "Convert desired output flow to ideal ingredient flow."],
  ["utilization <demand-per-minute> <yield> <seconds-per-batch> <machines>", "Compare desired output flow with ideal installed capacity."],
  ["parallel-lines <batches> <lines>", "Assign whole batches evenly across bounded production lines."],
  ["output-stock <batches> <yield> <existing> <target>", "Reconcile produced and existing finished stock against a target."],
  ["loss-allowance <wanted> <yield> <survival-fraction>", "Inflate batch demand by an explicit deterministic expected survival fraction."],
  ["change-yield <wanted> <old-yield> <new-yield>", "Compare required batches after changing a supplied recipe yield."],
  ["shared-input <stock> <first-batches> <first-cost> <second-cost>", "Reserve input for one product before budgeting a second product."],
  ["quota-order <quotas> <yields> <input-costs>", "Sum shared raw input needed for separate product quotas."],
  ["work-in-progress <started> <completed> <input-per-batch> <yield>", "Account for raw material tied up in incomplete batches."],
  ["reorder-point <consumption-per-minute> <lead-minutes> <buffer>", "Estimate raw-input reorder level from flow and lead time."],
  ["campaign <targets> <yields> <batch-seconds>", "Sum sequential production time for separate product targets."],
  ["completion-window <batches> <fast-seconds> <slow-seconds> <machines>", "Bound completion time using supplied fast and slow batch durations."],
];
const SPECS = {
  "recipe": ["I", "J", "J"],
  "stock-batches": ["I", "J", "J"],
  "bottleneck": ["C", "C"],
  "shortfall": ["I", "J", "C", "C"],
  "chain": ["I", "J", "J", "J"],
  "byproduct": ["I", "J", "I"],
  "recycle": ["N", "R", "I"],
  "cycle-time": ["I", "P", "J"],
  "rate": ["J", "P", "J"],
  "deadline": ["I", "P", "P"],
  "batch-cap": ["I", "J", "I"],
  "startup": ["I", "N", "P"],
  "setup-runs": ["I", "J", "N", "P"],
  "input-rate": ["N", "P", "P"],
  "utilization": ["N", "J", "P", "J"],
  "parallel-lines": ["I", "J"],
  "output-stock": ["I", "J", "I", "I"],
  "loss-allowance": ["I", "J", "R"],
  "change-yield": ["I", "J", "J"],
  "shared-input": ["I", "I", "J", "J"],
  "quota-order": ["C", "C", "C"],
  "work-in-progress": ["I", "I", "J", "J"],
  "reorder-point": ["N", "N", "I"],
  "campaign": ["C", "C", "L"],
  "completion-window": ["I", "P", "P", "J"],
};

export function productionCalculation(command, args = []) {
  if (!Object.hasOwn(SPECS, command)) throw new Error(`Unknown production command: ${command}.`);
  const spec = SPECS[command];
  if (args.length !== spec.length) throw new Error(`Expected ${spec.length} arguments.`);
  const values = spec.map((kind, i) => read(args[i], kind));
  let result;
  switch (command) {
    case "recipe": { const [a, b, c] = values; const batches=wholeCeil(a/b);result={batches,input:batches*c,output:batches*b,surplus:batches*b-a}; break; }
    case "stock-batches": { const [a, b, c] = values; const batches=wholeFloor(a/b);result={batches,output:batches*c,leftover:a-batches*b}; break; }
    case "bottleneck": { const [a, b] = values; same(a,b);demand(b.every(v=>v>0),'Inputs per batch must be positive.');const batches=Math.min(...a.map((v,i)=>wholeFloor(v/b[i])));result={batches,remaining:a.map((v,i)=>v-batches*b[i]),limitingItems:a.flatMap((v,i)=>wholeFloor(v/b[i])===batches?[i+1]:[])}; break; }
    case "shortfall": { const [a, b, c, d] = values; same(c,d);demand(d.every(v=>v>0),'Inputs per batch must be positive.');const batches=wholeCeil(a/b);result={batches,missing:c.map((v,i)=>Math.max(0,batches*d[i]-v))}; break; }
    case "chain": { const [a, b, c, d] = values; const secondBatches=wholeCeil(a/d),intermediate=secondBatches*c,firstBatches=wholeCeil(intermediate/b);result={firstBatches,secondBatches,intermediateSurplus:firstBatches*b-intermediate,finalSurplus:secondBatches*d-a}; break; }
    case "byproduct": { const [a, b, c] = values; result={main:a*b,byproduct:a*c}; break; }
    case "recycle": { const [a, b, c] = values; demand(c<=1000,'Too many passes.');result={recovered:a*(1-(1-b)**c),remaining:a*(1-b)**c}; break; }
    case "cycle-time": { const [a, b, c] = values; const waves=wholeCeil(a/c);result={waves,seconds:waves*b,unusedBatchSlots:waves*c-a}; break; }
    case "rate": { const [a, b, c] = values; result={perSecond:a*c/b,perMinute:a*c*60/b}; break; }
    case "deadline": { const [a, b, c] = values; const waves=wholeFloor(c/b);demand(waves>0||a===0,'No complete batch fits the deadline.');result={batchesPerMachine:waves,machines:a?wholeCeil(a/waves):0}; break; }
    case "batch-cap": { const [a, b, c] = values; const batches=Math.min(wholeCeil(a/b),c);result={batches,output:batches*b,missing:Math.max(0,a-batches*b)}; break; }
    case "startup": { const [a, b, c] = values; result={seconds:a?b+a*c:0}; break; }
    case "setup-runs": { const [a, b, c, d] = values; const runs=wholeCeil(a/b);result={runs,seconds:runs*c+a*d}; break; }
    case "input-rate": { const [a, b, c] = values; result={inputPerMinute:a*b/c}; break; }
    case "utilization": { const [a, b, c, d] = values; const capacity=b*d*60/c;result={capacityPerMinute:capacity,utilization:a/capacity,overloaded:a>capacity}; break; }
    case "parallel-lines": { const [a, b] = values; demand(b<=1000,'Too many lines.');result={batches:Array.from({length:b},(_,i)=>wholeFloor(a/b)+(i<a%b?1:0))}; break; }
    case "output-stock": { const [a, b, c, d] = values; const available=a*b+c;result={available,missing:Math.max(0,d-available),surplus:Math.max(0,available-d)}; break; }
    case "loss-allowance": { const [a, b, c] = values; demand(c>0,'Survival fraction must be positive.');const batches=wholeCeil(a/(b*c));result={batches,grossOutput:batches*b,expectedUsable:batches*b*c}; break; }
    case "change-yield": { const [a, b, c] = values; result={oldBatches:wholeCeil(a/b),newBatches:wholeCeil(a/c),savedBatches:wholeCeil(a/b)-wholeCeil(a/c)}; break; }
    case "shared-input": { const [a, b, c, d] = values; demand(b*c<=a,'First product exceeds shared stock.');const left=a-b*c;result={secondBatches:wholeFloor(left/d),leftover:left% d}; break; }
    case "quota-order": { const [a, b, c] = values; same(a,b);same(a,c);demand(b.every(v=>v>0)&&c.every(v=>v>0),'Yields and costs must be positive.');const batches=a.map((v,i)=>wholeCeil(v/b[i]));result={batches,sharedInput:sum(batches.map((v,i)=>v*c[i]))}; break; }
    case "work-in-progress": { const [a, b, c, d] = values; demand(b<=a,'Completed batches exceed started batches.');result={unfinished:a-b,tiedInput:(a-b)*c,finishedOutput:b*d}; break; }
    case "reorder-point": { const [a, b, c] = values; result={reorderAt:wholeCeil(a*b)+c}; break; }
    case "campaign": { const [a, b, c] = values; same(a,b);same(a,c);demand(b.every(v=>v>0),'Yields must be positive.');const batches=a.map((v,i)=>wholeCeil(v/b[i]));result={batches,seconds:sum(batches.map((v,i)=>v*c[i]))}; break; }
    case "completion-window": { const [a, b, c, d] = values; demand(c>=b,'Slow duration must not be shorter.');const waves=wholeCeil(a/d);result={earliestSeconds:waves*b,latestSeconds:waves*c}; break; }
  }
  return checked({ ...result, note: NOTE });
}

export function registerProductionTools(program, { print }) {
  const group = program.command("production").description("Explicit production ratios");
  for (const [signature, description] of PRODUCTION_COMMANDS) group.command(signature).description(description).action((...values) => print(productionCalculation(signature.split(' ')[0], values.slice(0, -2))));
  return group;
}
