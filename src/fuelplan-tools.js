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

const NOTE = "Offline smelting arithmetic from supplied burn times, item times, furnace counts, and costs. No fuel table, recipe, game tick rate, or actual furnace scheduling is inferred.";
export const FUELPLAN_COMMANDS = [
  ["fuel-count <items> <item-seconds> <fuel-seconds>", "Budget whole fuel items for one continuous furnace run."],
  ["capacity <fuel-items> <fuel-seconds> <item-seconds>", "Count complete items supported by one continuous burn budget."],
  ["furnace-split <items> <furnaces> <item-seconds> <fuel-seconds>", "Split items evenly and round fuel independently per furnace."],
  ["continuous-vs-split <items> <runs> <item-seconds> <fuel-seconds>", "Compare fuel rounding for balanced isolated runs and continuous burn."],
  ["burn-credit <items> <item-seconds> <remaining-burn> <fuel-seconds>", "Apply existing usable burn time before adding new fuel."],
  ["fuel-cost <items> <item-seconds> <fuel-seconds> <cost-per-fuel>", "Price a whole-fuel continuous run with supplied unit costs."],
  ["compare <items> <item-seconds> <burn-times> <unit-costs>", "Compare whole-fuel options for one continuous run."],
  ["efficiency <used-burn-seconds> <supplied-burn-seconds>", "Measure fraction of supplied burn time put to use."],
  ["finish-time <items> <furnaces> <item-seconds> <startup-seconds>", "Include per-furnace startup before balanced whole-item waves."],
  ["deadline-furnaces <items> <item-seconds> <deadline-seconds>", "Compute furnaces required for complete items by a deadline."],
  ["feed-rate <furnaces> <item-seconds>", "Estimate ideal item and ingredient feed rate."],
  ["fuel-rate <furnaces> <fuel-seconds>", "Estimate sustained whole fuel demand as a fractional rate."],
  ["stock-duration <fuel-stock> <fuel-seconds> <furnaces>", "Divide aggregate fuel time equally across continuously active furnaces."],
  ["reserve <items> <item-seconds> <fuel-seconds> <reserve-fuel>", "Add held whole fuel reserve to the operational budget."],
  ["refill <fuel-stock> <target-items> <item-seconds> <fuel-seconds>", "Compute extra fuel needed after using supplied fuel stock."],
  ["mixed-burn <fuel-counts> <burn-times> <item-seconds>", "Combine supplied fuel types into one continuous burn budget."],
  ["substitute <old-count> <old-burn> <new-burn>", "Replace an aggregate burn budget with whole units of another fuel."],
  ["restart-loss <runs> <lost-seconds-per-run> <fuel-seconds>", "Express caller-estimated restart burn loss in whole fuel units."],
  ["preheat <idle-seconds> <fuel-seconds> <furnaces>", "Budget fuel consumed by a supplied idle preheat interval."],
  ["loading-window <input-buffer> <furnaces> <item-seconds>", "Estimate when a shared input buffer empties at ideal continuous throughput."],
  ["output-buffer <slots> <stack-size> <furnaces> <item-seconds>", "Estimate shared empty output capacity and fill time at ideal throughput."],
  ["collect-interval <capacity> <existing> <items-per-minute>", "Estimate remaining time before a shared output capacity is reached."],
  ["throughput-cap <input-per-minute> <output-per-minute> <furnaces> <item-seconds>", "Bound smelting throughput by input, output, and ideal furnace capacity."],
  ["batch-checkpoints <items> <every-items> <item-seconds>", "List bounded single-furnace completion checkpoints."],
  ["net-fuel <fuel-produced> <fuel-consumed> <burn-seconds>", "Account for whole fuel stock change and its equivalent burn time."],
];
const SPECS = {
  "fuel-count": ["I", "P", "P"],
  "capacity": ["I", "P", "P"],
  "furnace-split": ["I", "J", "P", "P"],
  "continuous-vs-split": ["I", "J", "P", "P"],
  "burn-credit": ["I", "P", "N", "P"],
  "fuel-cost": ["I", "P", "P", "N"],
  "compare": ["I", "P", "W", "L"],
  "efficiency": ["N", "P"],
  "finish-time": ["I", "J", "P", "N"],
  "deadline-furnaces": ["I", "P", "P"],
  "feed-rate": ["J", "P"],
  "fuel-rate": ["J", "P"],
  "stock-duration": ["I", "P", "J"],
  "reserve": ["I", "P", "P", "I"],
  "refill": ["I", "I", "P", "P"],
  "mixed-burn": ["C", "W", "P"],
  "substitute": ["I", "P", "P"],
  "restart-loss": ["I", "N", "P"],
  "preheat": ["N", "P", "J"],
  "loading-window": ["I", "J", "P"],
  "output-buffer": ["I", "J", "J", "P"],
  "collect-interval": ["I", "I", "P"],
  "throughput-cap": ["N", "N", "J", "P"],
  "batch-checkpoints": ["I", "J", "P"],
  "net-fuel": ["I", "I", "P"],
};

export function fuelplanCalculation(command, args = []) {
  if (!Object.hasOwn(SPECS, command)) throw new Error(`Unknown fuelplan command: ${command}.`);
  const spec = SPECS[command];
  if (args.length !== spec.length) throw new Error(`Expected ${spec.length} arguments.`);
  const values = spec.map((kind, i) => read(args[i], kind));
  let result;
  switch (command) {
    case "fuel-count": { const [a, b, c] = values; const required=a*b,fuel=wholeCeil(required/c);result={fuel,requiredSeconds:required,wastedSeconds:Math.max(0,fuel*c-required)}; break; }
    case "capacity": { const [a, b, c] = values; result={items:wholeFloor(a*b/c),leftoverSeconds:Math.max(0,a*b-wholeFloor(a*b/c)*c)}; break; }
    case "furnace-split": { const [a, b, c, d] = values; demand(b<=1000,'Too many furnaces.');const loads=Array.from({length:b},(_,i)=>wholeFloor(a/b)+(i<a%b?1:0));const fuel=loads.map(v=>wholeCeil(v*c/d));result={loads,fuel,totalFuel:sum(fuel),seconds:wholeCeil(a/b)*c}; break; }
    case "continuous-vs-split": { const [a, b, c, d] = values; demand(b<=1000,'Too many runs.');const separate=sum(Array.from({length:b},(_,i)=>wholeCeil((wholeFloor(a/b)+(i<a%b?1:0))*c/d)));result={continuousFuel:wholeCeil(a*c/d),separateFuel:separate,extraFuel:separate-wholeCeil(a*c/d)}; break; }
    case "burn-credit": { const [a, b, c, d] = values; const needed=Math.max(0,a*b-c);result={newFuel:wholeCeil(needed/d),creditedSeconds:Math.min(c,a*b),uncoveredSeconds:needed}; break; }
    case "fuel-cost": { const [a, b, c, d] = values; const fuel=wholeCeil(a*b/c);result={fuel,cost:fuel*d,costPerOutput:a?fuel*d/a:null}; break; }
    case "compare": { const [a, b, c, d] = values; same(c,d);result={options:c.map((v,i)=>({option:i+1,fuel:wholeCeil(a*b/v),cost:wholeCeil(a*b/v)*d[i]}))}; break; }
    case "efficiency": { const [a, b] = values; demand(a<=b,'Used burn exceeds supplied burn.');result={utilization:a/b,wasteSeconds:b-a}; break; }
    case "finish-time": { const [a, b, c, d] = values; result={seconds:a?wholeCeil(a/b)*c+d:0}; break; }
    case "deadline-furnaces": { const [a, b, c] = values; const per=wholeFloor(c/b);demand(per>0||a===0,'No item fits the deadline.');result={itemsPerFurnace:per,furnaces:a?wholeCeil(a/per):0}; break; }
    case "feed-rate": { const [a, b] = values; result={itemsPerSecond:a/b,itemsPerMinute:a*60/b}; break; }
    case "fuel-rate": { const [a, b] = values; result={fuelPerMinute:a*60/b}; break; }
    case "stock-duration": { const [a, b, c] = values; result={seconds:a*b/c,minutes:a*b/c/60}; break; }
    case "reserve": { const [a, b, c, d] = values; const operating=wholeCeil(a*b/c);result={operating,reserve:d,total:operating+d}; break; }
    case "refill": { const [a, b, c, d] = values; const required=wholeCeil(b*c/d);result={required,missing:Math.max(0,required-a),surplus:Math.max(0,a-required)}; break; }
    case "mixed-burn": { const [a, b, c] = values; same(a,b);const burnSeconds=sum(a.map((v,i)=>v*b[i]));result={burnSeconds,items:wholeFloor(burnSeconds/c)}; break; }
    case "substitute": { const [a, b, c] = values; const count=wholeCeil(a*b/c);result={count,excessSeconds:Math.max(0,count*c-a*b)}; break; }
    case "restart-loss": { const [a, b, c] = values; result={lostSeconds:a*b,replacementFuel:wholeCeil(a*b/c)}; break; }
    case "preheat": { const [a, b, c] = values; result={burnSeconds:a*c,fuelPerFurnace:wholeCeil(a/b),totalFuel:wholeCeil(a/b)*c}; break; }
    case "loading-window": { const [a, b, c] = values; result={seconds:a*c/b}; break; }
    case "output-buffer": { const [a, b, c, d] = values; result={capacity:a*b,seconds:a*b*d/c}; break; }
    case "collect-interval": { const [a, b, c] = values; demand(b<=a,'Existing output exceeds capacity.');result={remainingCapacity:a-b,minutes:(a-b)/c}; break; }
    case "throughput-cap": { const [a, b, c, d] = values; const furnaceRate=c*60/d;result={itemsPerMinute:Math.min(a,b,furnaceRate),furnaceRate}; break; }
    case "batch-checkpoints": { const [a, b, c] = values; const n=wholeCeil(a/b);demand(n<=1000,'Too many checkpoints.');result={checkpoints:Array.from({length:n},(_,i)=>({items:Math.min(a,(i+1)*b),seconds:Math.min(a,(i+1)*b)*c}))}; break; }
    case "net-fuel": { const [a, b, c] = values; result={netItems:a-b,netBurnSeconds:(a-b)*c}; break; }
  }
  return checked({ ...result, note: NOTE });
}

export function registerFuelplanTools(program, { print }) {
  const group = program.command("fuelplan").description("Explicit smelting budgets");
  for (const [signature, description] of FUELPLAN_COMMANDS) group.command(signature).description(description).action((...values) => print(fuelplanCalculation(signature.split(' ')[0], values.slice(0, -2))));
  return group;
}
