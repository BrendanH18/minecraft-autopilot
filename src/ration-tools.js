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

const NOTE = "Offline ration estimates from explicit consumption rates and usable supply values. Units are chosen by the caller; no food saturation, spoilage, exhaustion, or guaranteed survival is inferred.";
export const RATION_COMMANDS = [
  ["trip <minutes> <units-per-minute> <reserve-units>", "Budget steady consumption with a separate held reserve."],
  ["phases <minutes> <rates> <reserve>", "Sum consumption across sequential phases with separate rates."],
  ["portions <required-units> <units-per-item>", "Convert required usable supply units to whole consumable items."],
  ["endurance <stock-units> <units-per-minute> <reserve>", "Estimate time before a held supply reserve would be crossed."],
  ["return-budget <outbound-minutes> <return-minutes> <rate> <reserve>", "Separate outbound and return consumption allowances."],
  ["turnaround <stock-units> <outbound-rate> <return-rate> <reserve>", "Estimate latest turnaround for symmetric travel durations."],
  ["party <minutes> <individual-rates> <reserve-each>", "Budget a party with supplied individual consumption rates."],
  ["share-stock <stock-units> <people> <rate-each>", "Estimate common endurance when supplies are shared equally."],
  ["refill <current> <target> <units-per-item>", "Budget whole replacement items to restore a target supply level."],
  ["checkpoint <stock> <elapsed-minutes> <rate> <reserve>", "Project stock and reserve margin at one elapsed-time checkpoint."],
  ["checkpoints <stock> <times> <rate> <reserve>", "Project supply margins at caller-supplied elapsed times."],
  ["activity <minutes> <base-rate> <multiplier> <reserve>", "Scale an assumed consumption rate for a more demanding activity."],
  ["uncertainty <minutes> <low-rate> <high-rate> <reserve>", "Bound supply needs over an explicit consumption-rate interval."],
  ["delay <planned-units> <delay-minutes> <idle-rate>", "Add consumption for an explicit unplanned waiting interval."],
  ["loss <required-usable> <loss-fraction> <units-per-item>", "Inflate whole-item supply demand for an expected unusable fraction."],
  ["cache-leg <leg-minutes> <rates> <reserve-per-leg>", "Budget independent legs assuming a full refill before each leg."],
  ["refill-interval <capacity-units> <rate> <reserve>", "Estimate maximum interval between refills without using a reserve."],
  ["refill-count <trip-minutes> <capacity> <rate> <reserve>", "Count mid-trip full refills while preserving reserve for each stage."],
  ["loadout <counts> <unit-values> <stack-sizes>", "Sum usable values and occupied slots for distinct carried supplies."],
  ["density <unit-values> <stack-sizes>", "Rank supplied consumable types by usable units per full slot."],
  ["portion-plan <stock> <servings> <reserve>", "Divide usable supply into equal planned servings."],
  ["meal-clock <trip-minutes> <interval-minutes> <units-per-meal>", "Count scheduled meals after departure through the trip endpoint."],
  ["resupply-gap <arrival-minutes> <supply-ready-minutes> <waiting-rate>", "Budget extra consumption while waiting for a resupply to become ready."],
  ["escape-reserve <distance> <speed-blocks-per-minute> <rate> <margin-units>", "Convert a supplied direct escape distance to a consumption reserve."],
  ["actual-rate <starting-units> <ending-units> <elapsed-minutes>", "Infer a net observed consumption rate from two supplied stock readings."],
];
const SPECS = {
  "trip": ["N", "N", "N"],
  "phases": ["L", "L", "N"],
  "portions": ["N", "P"],
  "endurance": ["N", "P", "N"],
  "return-budget": ["N", "N", "N", "N"],
  "turnaround": ["N", "P", "P", "N"],
  "party": ["N", "L", "N"],
  "share-stock": ["N", "J", "P"],
  "refill": ["N", "N", "P"],
  "checkpoint": ["N", "N", "N", "N"],
  "checkpoints": ["N", "L", "N", "N"],
  "activity": ["N", "N", "P", "N"],
  "uncertainty": ["N", "N", "N", "N"],
  "delay": ["N", "N", "N"],
  "loss": ["N", "R", "P"],
  "cache-leg": ["L", "L", "N"],
  "refill-interval": ["N", "P", "N"],
  "refill-count": ["N", "P", "P", "N"],
  "loadout": ["C", "W", "C"],
  "density": ["W", "C"],
  "portion-plan": ["N", "J", "N"],
  "meal-clock": ["N", "P", "N"],
  "resupply-gap": ["N", "N", "N"],
  "escape-reserve": ["N", "P", "N", "N"],
  "actual-rate": ["N", "N", "P"],
};

export function rationCalculation(command, args = []) {
  if (!Object.hasOwn(SPECS, command)) throw new Error(`Unknown ration command: ${command}.`);
  const spec = SPECS[command];
  if (args.length !== spec.length) throw new Error(`Expected ${spec.length} arguments.`);
  const values = spec.map((kind, i) => read(args[i], kind));
  let result;
  switch (command) {
    case "trip": { const [a, b, c] = values; result={consumed:a*b,total:a*b+c}; break; }
    case "phases": { const [a, b, c] = values; same(a,b);const phases=a.map((v,i)=>v*b[i]);result={phases,consumed:sum(phases),total:sum(phases)+c}; break; }
    case "portions": { const [a, b] = values; const items=wholeCeil(a/b);result={items,supplied:items*b,surplus:Math.max(0,items*b-a)}; break; }
    case "endurance": { const [a, b, c] = values; const usable=Math.max(0,a-c);result={usable,minutes:usable/b,reserveShortfall:Math.max(0,c-a)}; break; }
    case "return-budget": { const [a, b, c, d] = values; result={outbound:a*c,returning:b*c,total:(a+b)*c+d}; break; }
    case "turnaround": { const [a, b, c, d] = values; result={outboundMinutes:Math.max(0,a-d)/(b+c)}; break; }
    case "party": { const [a, b, c] = values; const individual=b.map(v=>a*v+c);result={individual,total:sum(individual)}; break; }
    case "share-stock": { const [a, b, c] = values; result={unitsEach:a/b,minutes:a/(b*c)}; break; }
    case "refill": { const [a, b, c] = values; const items=wholeCeil(Math.max(0,b-a)/c);result={items,after:a+items*c,surplus:Math.max(0,a+items*c-b)}; break; }
    case "checkpoint": { const [a, b, c, d] = values; const remaining=a-b*c;result={remaining,reserveMargin:remaining-d,exhausted:remaining<0}; break; }
    case "checkpoints": { const [a, b, c, d] = values; result={checkpoints:b.map(t=>({minutes:t,remaining:a-t*c,reserveMargin:a-t*c-d}))}; break; }
    case "activity": { const [a, b, c, d] = values; const rate=b*c;result={rate,consumed:a*rate,total:a*rate+d}; break; }
    case "uncertainty": { const [a, b, c, d] = values; demand(c>=b,'High rate must not be lower.');result={minimum:a*b+d,maximum:a*c+d}; break; }
    case "delay": { const [a, b, c] = values; result={delayUnits:b*c,total:a+b*c}; break; }
    case "loss": { const [a, b, c] = values; demand(b<1,'Loss fraction must be below one.');const items=wholeCeil(a/((1-b)*c));result={items,grossUnits:items*c,expectedUsable:items*c*(1-b)}; break; }
    case "cache-leg": { const [a, b, c] = values; same(a,b);const loads=a.map((v,i)=>v*b[i]+c);result={loads,maximumLoad:Math.max(...loads),totalIssued:sum(loads)}; break; }
    case "refill-interval": { const [a, b, c] = values; demand(c<=a,'Reserve exceeds capacity.');result={minutes:(a-c)/b}; break; }
    case "refill-count": { const [a, b, c, d] = values; demand(d<b,'Reserve must leave positive capacity.');const interval=(b-d)/c;result={intervalMinutes:interval,refills:Math.max(0,wholeCeil(a/interval)-1)}; break; }
    case "loadout": { const [a, b, c] = values; same(a,b);same(a,c);demand(c.every(v=>v>0),'Stack sizes must be positive.');result={units:sum(a.map((v,i)=>v*b[i])),slots:sum(a.map((v,i)=>wholeCeil(v/c[i])))}; break; }
    case "density": { const [a, b] = values; same(a,b);demand(b.every(v=>v>0),'Stack sizes must be positive.');result={ranked:a.map((v,i)=>({item:i+1,unitsPerSlot:v*b[i]})).sort((x,y)=>y.unitsPerSlot-x.unitsPerSlot||x.item-y.item)}; break; }
    case "portion-plan": { const [a, b, c] = values; result={unitsPerServing:Math.max(0,a-c)/b,reserveShortfall:Math.max(0,c-a)}; break; }
    case "meal-clock": { const [a, b, c] = values; const meals=wholeFloor(a/b);demand(meals<=1000,'Too many meals.');result={meals,totalUnits:meals*c,times:Array.from({length:meals},(_,i)=>(i+1)*b)}; break; }
    case "resupply-gap": { const [a, b, c] = values; const wait=Math.max(0,b-a);result={waitMinutes:wait,waitingUnits:wait*c}; break; }
    case "escape-reserve": { const [a, b, c, d] = values; const minutes=a/b;result={minutes,reserve:minutes*c+d}; break; }
    case "actual-rate": { const [a, b, c] = values; const consumed=a-b;result={netConsumed:consumed,netRate:consumed/c}; break; }
  }
  return checked({ ...result, note: NOTE });
}

export function registerRationTools(program, { print }) {
  const group = program.command("ration").description("Trip consumption and reserves");
  for (const [signature, description] of RATION_COMMANDS) group.command(signature).description(description).action((...values) => print(rationCalculation(signature.split(' ')[0], values.slice(0, -2))));
  return group;
}
