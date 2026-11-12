import { numeric, positive, count, size, radians, wrap, sequence, checked } from './spatial-inputs.js';

const NOTE = "Offline orientation math. Minecraft yaw zero faces +Z and positive yaw turns toward -X; pitch is positive downward. Does not rotate a player or check visibility.";
export const BEARING_COMMANDS = [
  [
    "yaw-vector <yaw>",
    "Convert Minecraft yaw to a horizontal unit direction."
  ],
  [
    "pitch-vector <yaw> <pitch>",
    "Convert yaw and pitch to a three-dimensional unit direction."
  ],
  [
    "vector-yaw <x> <z>",
    "Convert a nonzero horizontal vector to Minecraft yaw."
  ],
  [
    "vector-pitch <horizontal> <vertical>",
    "Compute pitch from horizontal length and signed vertical rise."
  ],
  [
    "signed-turn <from> <to>",
    "Find the shortest signed yaw change in [-180,180)."
  ],
  [
    "turn-time <from> <to> <degrees-per-second>",
    "Estimate shortest-turn duration at a supplied angular speed."
  ],
  [
    "step-yaw <from> <to> <maximum>",
    "Clamp a shortest-turn update to a maximum angular step."
  ],
  [
    "compass-sector <yaw> <sectors>",
    "Quantize yaw to a numbered equal compass sector; zero faces south."
  ],
  [
    "sector-center <sector> <sectors>",
    "Recover the yaw at the center of a numbered sector."
  ],
  [
    "forward-offset <yaw> <distance>",
    "Project a signed distance forward along a yaw."
  ],
  [
    "right-offset <yaw> <distance>",
    "Project a signed distance to the right of a yaw."
  ],
  [
    "local-offset <yaw> <forward> <right>",
    "Rotate forward/right local offsets into world X/Z."
  ],
  [
    "world-offset <yaw> <x> <z>",
    "Resolve world X/Z offsets into forward/right components."
  ],
  [
    "cone-test <facing> <target> <half-angle>",
    "Test a target yaw against an inclusive horizontal viewing cone."
  ],
  [
    "cone-width <distance> <half-angle>",
    "Compute a cone cross-section width for a half-angle below ninety degrees."
  ],
  [
    "angular-size <width> <distance>",
    "Compute apparent angular width of a centered flat target."
  ],
  [
    "heading-average <first> <second>",
    "Circular mean of two headings; reject opposite headings."
  ],
  [
    "heading-blend <from> <to> <fraction>",
    "Interpolate along the shortest yaw turn."
  ],
  [
    "turn-samples <from> <to> <intervals>",
    "List evenly spaced shortest-turn headings including endpoints."
  ],
  [
    "slope-angle <rise> <run>",
    "Convert a signed slope to an elevation angle."
  ],
  [
    "rise-from-angle <angle> <run>",
    "Compute rise from an elevation angle strictly between +/-90 degrees."
  ],
  [
    "run-from-angle <angle> <rise>",
    "Compute horizontal run for positive rise and positive elevation angle."
  ],
  [
    "pitch-limit <pitch> <minimum> <maximum>",
    "Clamp a pitch into a supplied valid pitch range."
  ],
  [
    "crosswind <heading> <wind-heading> <speed>",
    "Resolve a supplied wind vector into forward/right components."
  ],
  [
    "sweep-count <field-of-view> <overlap>",
    "Count equal camera headings covering a full turn at supplied overlap."
  ]
];

export function bearingCalculation(command, args = []) {
  const spec = BEARING_COMMANDS.find(([s]) => s.split(' ')[0] === command);
  if (!spec) throw new Error(`Unknown bearing command: ${command}.`);
  if (!Array.isArray(args) || args.length !== spec[0].split(' ').length - 1) throw new Error('Supply exactly the documented arguments.');
  const a = args;
  let result;
  switch (command) {
    case "yaw-vector": {  result = ({x:-Math.sin(radians(a[0])),z:Math.cos(radians(a[0]))}); break; }
    case "pitch-vector": {  result = ({x:-Math.sin(radians(a[0]))*Math.cos(radians(a[1])),y:-Math.sin(radians(a[1])),z:Math.cos(radians(a[0]))*Math.cos(radians(a[1]))}); break; }
    case "vector-yaw": { const x=numeric(a[0]),z=numeric(a[1]); if (!Math.hypot(x,z)) throw new Error("Direction must be nonzero."); result = wrap(Math.atan2(-x,z)*180/Math.PI); break; }
    case "vector-pitch": { const h=numeric(a[0],0),y=numeric(a[1]); if (!Math.hypot(h,y)) throw new Error("Direction must be nonzero."); result = -Math.atan2(y,h)*180/Math.PI; break; }
    case "signed-turn": {  result = wrap(numeric(a[1])-numeric(a[0])+180)-180; break; }
    case "turn-time": {  result = Math.abs(wrap(numeric(a[1])-numeric(a[0])+180)-180)/positive(a[2]); break; }
    case "step-yaw": { const f=numeric(a[0]),d=wrap(numeric(a[1])-f+180)-180; result = wrap(f+Math.sign(d)*Math.min(Math.abs(d),numeric(a[2],0,180))); break; }
    case "compass-sector": { const s=size(a[1]); result = Math.floor((wrap(numeric(a[0]))+180/s)/(360/s))%s; break; }
    case "sector-center": { const s=size(a[1]),i=numeric(a[0],0,s-1,true); result = i*360/s; break; }
    case "forward-offset": {  result = ({x:-Math.sin(radians(a[0]))*numeric(a[1]),z:Math.cos(radians(a[0]))*numeric(a[1])}); break; }
    case "right-offset": {  result = ({x:-Math.cos(radians(a[0]))*numeric(a[1]),z:-Math.sin(radians(a[0]))*numeric(a[1])}); break; }
    case "local-offset": { const t=radians(a[0]),f=numeric(a[1]),r=numeric(a[2]); result = ({x:-Math.sin(t)*f-Math.cos(t)*r,z:Math.cos(t)*f-Math.sin(t)*r}); break; }
    case "world-offset": { const t=radians(a[0]),x=numeric(a[1]),z=numeric(a[2]); result = ({forward:-Math.sin(t)*x+Math.cos(t)*z,right:-Math.cos(t)*x-Math.sin(t)*z}); break; }
    case "cone-test": {  result = Math.abs(wrap(numeric(a[1])-numeric(a[0])+180)-180)<=numeric(a[2],0,180); break; }
    case "cone-width": {  result = 2*numeric(a[0],0)*Math.tan(radians(numeric(a[1],0,89.999))); break; }
    case "angular-size": {  result = 2*Math.atan(numeric(a[0],0)/(2*positive(a[1])))*180/Math.PI; break; }
    case "heading-average": { const p=radians(a[0]),q=radians(a[1]),x=Math.cos(p)+Math.cos(q),y=Math.sin(p)+Math.sin(q);if(Math.hypot(x,y)<1e-10)throw new Error("Opposite headings have no unique mean."); result = wrap(Math.atan2(y,x)*180/Math.PI); break; }
    case "heading-blend": { const f=numeric(a[0]); result = wrap(f+(wrap(numeric(a[1])-f+180)-180)*numeric(a[2],0,1)); break; }
    case "turn-samples": { const n=numeric(a[2],1,999,true),f=numeric(a[0]),d=wrap(numeric(a[1])-f+180)-180; result = sequence(n+1,i=>wrap(f+d*i/n)); break; }
    case "slope-angle": {  result = Math.atan2(numeric(a[0]),positive(a[1]))*180/Math.PI; break; }
    case "rise-from-angle": {  result = Math.tan(radians(numeric(a[0],-89.999,89.999)))*numeric(a[1],0); break; }
    case "run-from-angle": {  result = positive(a[1])/Math.tan(radians(numeric(a[0],0.000001,89.999))); break; }
    case "pitch-limit": { const lo=numeric(a[1],-90,90),hi=numeric(a[2],lo,90); result = Math.max(lo,Math.min(hi,numeric(a[0],-90,90))); break; }
    case "crosswind": { const d=radians(numeric(a[1])-numeric(a[0])),s=numeric(a[2],0); result = ({forward:s*Math.cos(d),right:s*Math.sin(d)}); break; }
    case "sweep-count": {  result = Math.ceil(360/(positive(a[0])*(1-numeric(a[1],0,0.99)))); break; }
  }
  return checked({result, note:NOTE});
}
export function registerBearingTools(program, {print}) {
  const group=program.command('bearing').description(NOTE);
  for(const [signature,description] of BEARING_COMMANDS) group.command(signature).description(description).action((...values)=>print(bearingCalculation(signature.split(' ')[0],values.slice(0,-2))));
  return group;
}
