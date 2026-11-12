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

const NOTE = "Offline exchange arithmetic using caller-supplied prices, stock, limits, and restock assumptions. No live offer, villager discount, demand, availability, or currency value is inferred.";
export const TRADEPLAN_COMMANDS = [
  ["buy <wanted> <yield-per-trade> <cost-per-trade>", "Round desired purchased output to whole exchanges."],
  ["sell <stock> <input-per-trade> <payout>", "Sell complete input lots while retaining unusable remainder."],
  ["budget <currency> <cost-per-trade> <yield-per-trade>", "Bound output purchases by a whole-currency budget."],
  ["limited <wanted-trades> <remaining-uses> <cost-per-trade> <yield>", "Apply a supplied remaining-use cap to intended trades."],
  ["restocks <wanted-trades> <initial-uses> <uses-per-restock>", "Compute additional supplied-capacity restocks for a trade target."],
  ["restock-time <wanted-trades> <initial-uses> <uses-per-restock> <restock-minutes>", "Estimate waiting time assuming evenly available restocks."],
  ["price-change <trades> <old-price> <new-price>", "Compare total whole-currency costs across supplied prices."],
  ["unit-price <cost-per-trade> <yield-per-trade>", "Express supplied exchange cost per output unit."],
  ["compare-offers <wanted> <prices> <yields>", "Compare rounded target purchase costs across separate offers."],
  ["round-trip <input-cost> <first-yield> <second-input> <second-yield>", "Evaluate a single first exchange followed by as many complete second exchanges as possible."],
  ["fund-target <target-cost> <sale-input> <sale-payout>", "Budget complete sale exchanges to fund a purchase cost."],
  ["net-currency <sales> <sale-payout> <purchases> <purchase-cost>", "Reconcile currency earned and spent in two explicit exchange flows."],
  ["commission <gross> <fee-fraction> <flat-fee>", "Apply a supplied fractional and flat exchange fee."],
  ["price-ceiling <currency> <wanted-trades>", "Compute the largest whole-unit price that fits a trade count."],
  ["stock-limit <currency> <price> <stock-trades> <yield>", "Apply budget and supplier stock limits jointly."],
  ["parallel-sellers <wanted-trades> <uses-each> <sellers>", "Allocate one simultaneous round over equally supplied sellers."],
  ["progressive-cost <trades> <starting-price> <increase-per-trade>", "Sum an explicitly assumed arithmetic price progression."],
  ["progressive-buy <budget> <starting-price> <increase-per-trade>", "Find maximum complete exchanges in an arithmetic price progression."],
  ["quota-basket <quantities> <yields> <prices>", "Budget independent rounded purchases for a mixed-item basket."],
  ["priority-basket <quantities> <yields> <prices> <budget>", "Buy whole required exchanges in item priority order under a shared budget."],
  ["reserve-budget <currency> <reserve> <price> <yield>", "Hold currency reserve before buying whole exchanges."],
  ["trade-time <trades> <seconds-each> <travel-seconds>", "Estimate exchange time with a one-time travel allowance."],
  ["throughput <uses> <restock-minutes> <yield>", "Estimate sustained output per minute from supplied restock assumptions."],
  ["change-loss <currency> <price>", "Measure currency unusable for another whole exchange at a given price."],
  ["sell-keep <stock> <reserve> <input-per-trade> <payout>", "Sell only complete lots beyond a held input reserve."],
];
const SPECS = {
  "buy": ["I", "J", "J"],
  "sell": ["I", "J", "J"],
  "budget": ["I", "J", "J"],
  "limited": ["I", "I", "J", "J"],
  "restocks": ["I", "I", "J"],
  "restock-time": ["I", "I", "J", "P"],
  "price-change": ["I", "J", "J"],
  "unit-price": ["P", "P"],
  "compare-offers": ["I", "C", "C"],
  "round-trip": ["J", "J", "J", "J"],
  "fund-target": ["I", "J", "J"],
  "net-currency": ["I", "J", "I", "J"],
  "commission": ["N", "R", "N"],
  "price-ceiling": ["I", "J"],
  "stock-limit": ["I", "J", "I", "J"],
  "parallel-sellers": ["I", "J", "J"],
  "progressive-cost": ["I", "J", "I"],
  "progressive-buy": ["I", "J", "I"],
  "quota-basket": ["C", "C", "C"],
  "priority-basket": ["C", "C", "C", "I"],
  "reserve-budget": ["I", "I", "J", "J"],
  "trade-time": ["I", "P", "N"],
  "throughput": ["J", "P", "J"],
  "change-loss": ["I", "J"],
  "sell-keep": ["I", "I", "J", "J"],
};

export function tradeplanCalculation(command, args = []) {
  if (!Object.hasOwn(SPECS, command)) throw new Error(`Unknown tradeplan command: ${command}.`);
  const spec = SPECS[command];
  if (args.length !== spec.length) throw new Error(`Expected ${spec.length} arguments.`);
  const values = spec.map((kind, i) => read(args[i], kind));
  let result;
  switch (command) {
    case "buy": { const [a, b, c] = values; const trades=Math.ceil(a/b);result={trades,cost:trades*c,received:trades*b,surplus:trades*b-a}; break; }
    case "sell": { const [a, b, c] = values; const trades=Math.floor(a/b);result={trades,received:trades*c,remaining:a-trades*b}; break; }
    case "budget": { const [a, b, c] = values; const trades=Math.floor(a/b);result={trades,received:trades*c,unspent:a-trades*b}; break; }
    case "limited": { const [a, b, c, d] = values; const trades=Math.min(a,b);result={trades,cost:trades*c,received:trades*d,unfilledTrades:a-trades}; break; }
    case "restocks": { const [a, b, c] = values; result={restocks:Math.ceil(Math.max(0,a-b)/c),initialTrades:Math.min(a,b)}; break; }
    case "restock-time": { const [a, b, c, d] = values; const restocks=Math.ceil(Math.max(0,a-b)/c);result={restocks,minutes:restocks*d}; break; }
    case "price-change": { const [a, b, c] = values; result={oldCost:a*b,newCost:a*c,savings:a*(b-c)}; break; }
    case "unit-price": { const [a, b] = values; result={costPerItem:a/b,itemsPerCurrency:b/a}; break; }
    case "compare-offers": { const [a, b, c] = values; same(b,c);demand(b.every(v=>v>0)&&c.every(v=>v>0),'Prices and yields must be positive.');result={offers:b.map((v,i)=>({offer:i+1,trades:Math.ceil(a/c[i]),cost:Math.ceil(a/c[i])*v,surplus:Math.ceil(a/c[i])*c[i]-a}))}; break; }
    case "round-trip": { const [a, b, c, d] = values; const secondTrades=Math.floor(b/c);result={secondTrades,returned:secondTrades*d,netCurrency:secondTrades*d-a,intermediateRemainder:b-secondTrades*c}; break; }
    case "fund-target": { const [a, b, c] = values; const sales=Math.ceil(a/c);result={sales,inputRequired:sales*b,currency:sales*c,change:sales*c-a}; break; }
    case "net-currency": { const [a, b, c, d] = values; result={earned:a*b,spent:c*d,net:a*b-c*d}; break; }
    case "commission": { const [a, b, c] = values; result={fee:a*b+c,net:a-a*b-c}; break; }
    case "price-ceiling": { const [a, b] = values; result={maximumPrice:Math.floor(a/b),unusedAtMaximum:a-Math.floor(a/b)*b}; break; }
    case "stock-limit": { const [a, b, c, d] = values; const trades=Math.min(Math.floor(a/b),c);result={trades,received:trades*d,unspent:a-trades*b,limitedBy:Math.floor(a/b)<c?'budget':Math.floor(a/b)>c?'stock':'both'}; break; }
    case "parallel-sellers": { const [a, b, c] = values; result={roundCapacity:b*c,rounds:Math.ceil(a/(b*c)),sellersNeededNow:Math.min(c,Math.ceil(a/b))}; break; }
    case "progressive-cost": { const [a, b, c] = values; result={cost:a*b+c*a*(a-1)/2,lastPrice:a?b+(a-1)*c:null}; break; }
    case "progressive-buy": { const [a, b, c] = values; const cost=n=>n*b+c*n*(n-1)/2;let low=0,high=Math.floor(a/b)+1;while(low+1<high){const mid=Math.floor((low+high)/2);if(cost(mid)<=a)low=mid;else high=mid;}result={trades:low,cost:cost(low),unspent:a-cost(low)}; break; }
    case "quota-basket": { const [a, b, c] = values; same(a,b);same(a,c);demand(b.every(v=>v>0)&&c.every(v=>v>0),'Yields and prices must be positive.');const trades=a.map((v,i)=>Math.ceil(v/b[i]));result={trades,cost:sum(trades.map((v,i)=>v*c[i]))}; break; }
    case "priority-basket": { const [a, b, c, d] = values; same(a,b);same(a,c);demand(b.every(v=>v>0)&&c.every(v=>v>0),'Yields and prices must be positive.');let left=d;const trades=a.map((v,i)=>{const n=Math.min(Math.ceil(v/b[i]),Math.floor(left/c[i]));left-=n*c[i];return n;});result={trades,received:trades.map((v,i)=>v*b[i]),unspent:left}; break; }
    case "reserve-budget": { const [a, b, c, d] = values; const spendable=Math.max(0,a-b),trades=Math.floor(spendable/c);result={trades,received:trades*d,remaining:a-trades*c,reserveShortfall:Math.max(0,b-a)}; break; }
    case "trade-time": { const [a, b, c] = values; result={seconds:a?a*b+c:0}; break; }
    case "throughput": { const [a, b, c] = values; result={itemsPerMinute:a*c/b}; break; }
    case "change-loss": { const [a, b] = values; result={wholeTrades:Math.floor(a/b),remainder:a%b,fractionUnspent:a?a%b/a:0}; break; }
    case "sell-keep": { const [a, b, c, d] = values; const available=Math.max(0,a-b),trades=Math.floor(available/c);result={trades,received:trades*d,retained:a-trades*c}; break; }
  }
  return checked({ ...result, note: NOTE });
}

export function registerTradeplanTools(program, { print }) {
  const group = program.command("tradeplan").description("Explicit trade budgets");
  for (const [signature, description] of TRADEPLAN_COMMANDS) group.command(signature).description(description).action((...values) => print(tradeplanCalculation(signature.split(' ')[0], values.slice(0, -2))));
  return group;
}
