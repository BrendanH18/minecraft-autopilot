import { numeric, positive, count, size, radians, wrap, sequence, checked } from './spatial-inputs.js';

const NOTE = "Offline continuous material and time estimates using caller-supplied rates. Units must be consistent. No terrain, fluid, geology, support, stability, game mechanics, or construction feasibility is checked. No excavation is executed.";
export const EARTHWORKS_COMMANDS = [
  [
    "bench-cut <width> <run> <rise>",
    "Estimate a triangular-prism bench excavation."
  ],
  [
    "trapezoid-cut <bottom> <top> <depth> <length>",
    "Estimate trapezoidal ditch volume."
  ],
  [
    "side-slope-width <bottom> <depth> <slope>",
    "Compute ditch top width from horizontal run per vertical rise."
  ],
  [
    "bank-swell <in-place> <swell-percent>",
    "Estimate loose spoil volume after supplied positive percentage swell."
  ],
  [
    "compact-fill <loose> <shrink-percent>",
    "Estimate compacted fill from loose material and supplied shrink percentage."
  ],
  [
    "borrow-required <compacted> <shrink-percent>",
    "Estimate loose borrow required for compacted fill."
  ],
  [
    "cut-fill-balance <cut> <fill> <recovery-percent>",
    "Compute usable cut, borrow deficit, and surplus."
  ],
  [
    "haul-trips <volume> <capacity>",
    "Round up haul trips at supplied capacity."
  ],
  [
    "haul-time <trips> <distance> <speed> <loading> <unloading>",
    "Estimate serial roundtrip hauling time in supplied units."
  ],
  [
    "dig-time <blocks> <blocks-per-second>",
    "Estimate active excavation time at supplied throughput."
  ],
  [
    "crew-time <work> <rate> <workers> <efficiency>",
    "Estimate completion time at supplied per-worker rate and efficiency."
  ],
  [
    "lift-count <height> <maximum-lift>",
    "Count fill lifts at a supplied maximum thickness."
  ],
  [
    "lift-schedule <height> <maximum-lift> <area>",
    "List lift heights and volumes up to 1000 lifts."
  ],
  [
    "overdig <width> <length> <depth> <allowance>",
    "Compute additional volume from outward side overdig only."
  ],
  [
    "topsoil-strip <width> <length> <thickness>",
    "Estimate topsoil stripping volume."
  ],
  [
    "stockpile-cone <radius> <height>",
    "Estimate ideal conical spoil pile capacity."
  ],
  [
    "stockpile-height <volume> <radius>",
    "Find height of an ideal conical stockpile."
  ],
  [
    "stockpile-footprint <volume> <height>",
    "Find circular footprint area of an ideal conical stockpile."
  ],
  [
    "average-end-area <first-area> <last-area> <length>",
    "Estimate excavation using the average-end-area method."
  ],
  [
    "prismoidal <first-area> <middle-area> <last-area> <length>",
    "Estimate volume with the prismoidal formula."
  ],
  [
    "retaining-pressure <height> <density>",
    "Estimate ideal hydrostatic-style triangular load from supplied density."
  ],
  [
    "batter-run <height> <horizontal-per-vertical>",
    "Compute horizontal bank run from a supplied batter."
  ],
  [
    "slope-face <height> <run> <length>",
    "Compute inclined bank face area."
  ],
  [
    "drain-fall <length> <grade-percent>",
    "Compute drain fall from a supplied nonnegative percentage grade."
  ],
  [
    "dewatering-time <volume> <inflow> <pumping>",
    "Estimate draining time, requiring pumping to exceed inflow."
  ]
];

export function earthworksCalculation(command, args = []) {
  const spec = EARTHWORKS_COMMANDS.find(([s]) => s.split(' ')[0] === command);
  if (!spec) throw new Error(`Unknown earthworks command: ${command}.`);
  if (!Array.isArray(args) || args.length !== spec[0].split(' ').length - 1) throw new Error('Supply exactly the documented arguments.');
  const a = args;
  let result;
  switch (command) {
    case "bench-cut": {  result = positive(a[0])*positive(a[1])*numeric(a[2],0)/2; break; }
    case "trapezoid-cut": {  result = (numeric(a[0],0)+numeric(a[1],0))*numeric(a[2],0)*numeric(a[3],0)/2; break; }
    case "side-slope-width": {  result = numeric(a[0],0)+2*numeric(a[1],0)*numeric(a[2],0); break; }
    case "bank-swell": {  result = numeric(a[0],0)*(1+numeric(a[1],0,1000)/100); break; }
    case "compact-fill": {  result = numeric(a[0],0)*(1-numeric(a[1],0,100)/100); break; }
    case "borrow-required": {  result = numeric(a[0],0)/(1-numeric(a[1],0,99.999)/100); break; }
    case "cut-fill-balance": { const usable=numeric(a[0],0)*numeric(a[2],0,100)/100,fill=numeric(a[1],0); result = ({usable,borrow:Math.max(0,fill-usable),surplus:Math.max(0,usable-fill)}); break; }
    case "haul-trips": {  result = Math.ceil(numeric(a[0],0)/positive(a[1])); break; }
    case "haul-time": {  result = count(a[0])*(2*numeric(a[1],0)/positive(a[2])+numeric(a[3],0)+numeric(a[4],0)); break; }
    case "dig-time": {  result = count(a[0])/positive(a[1]); break; }
    case "crew-time": {  result = numeric(a[0],0)/(positive(a[1])*size(a[2])*numeric(a[3],0.000001,1)); break; }
    case "lift-count": {  result = Math.ceil(numeric(a[0],0)/positive(a[1])); break; }
    case "lift-schedule": { const h=numeric(a[0],0),l=positive(a[1]),ar=numeric(a[2],0); result = sequence(Math.ceil(h/l),i=>({lift:i+1,height:Math.min(l,h-i*l),volume:Math.min(l,h-i*l)*ar})); break; }
    case "overdig": { const w=positive(a[0]),l=positive(a[1]),d=numeric(a[2],0),t=numeric(a[3],0); result = ((w+2*t)*(l+2*t)-w*l)*d; break; }
    case "topsoil-strip": {  result = numeric(a[0],0)*numeric(a[1],0)*numeric(a[2],0); break; }
    case "stockpile-cone": {  result = Math.PI*numeric(a[0],0)**2*numeric(a[1],0)/3; break; }
    case "stockpile-height": {  result = 3*numeric(a[0],0)/(Math.PI*positive(a[1])**2); break; }
    case "stockpile-footprint": {  result = 3*numeric(a[0],0)/positive(a[1]); break; }
    case "average-end-area": {  result = (numeric(a[0],0)+numeric(a[1],0))*numeric(a[2],0)/2; break; }
    case "prismoidal": {  result = (numeric(a[0],0)+4*numeric(a[1],0)+numeric(a[2],0))*numeric(a[3],0)/6; break; }
    case "retaining-pressure": {  result = numeric(a[1],0)*numeric(a[0],0)**2/2; break; }
    case "batter-run": {  result = numeric(a[0],0)*numeric(a[1],0); break; }
    case "slope-face": {  result = Math.hypot(numeric(a[0],0),numeric(a[1],0))*numeric(a[2],0); break; }
    case "drain-fall": {  result = numeric(a[0],0)*numeric(a[1],0,100)/100; break; }
    case "dewatering-time": { const inflow=numeric(a[1],0),pump=positive(a[2]);if(pump<=inflow)throw new Error("Pumping must exceed inflow."); result = numeric(a[0],0)/(pump-inflow); break; }
  }
  return checked({result, note:NOTE});
}
export function registerEarthworksTools(program, {print}) {
  const group=program.command('earthworks').description(NOTE);
  for(const [signature,description] of EARTHWORKS_COMMANDS) group.command(signature).description(description).action((...values)=>print(earthworksCalculation(signature.split(' ')[0],values.slice(0,-2))));
  return group;
}
