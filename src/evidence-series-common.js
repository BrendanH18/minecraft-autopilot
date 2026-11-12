import { parseSnapshot, itemName } from './cli-views.js';
import { readLedgerSnapshot, ledgerItems, ledgerNumber } from './ledger-tools.js';

export const SERIES_NOTE = 'Offline sampled evidence. Statistics describe supplied samples, not causes, future outcomes, or continuous world state. Integration assumes supplied interpolation. Storage trends require the same known dimension and container set; contents may be stale. Any missing required reading makes the statistic unknown.';
export const SERIES_SPECS = [
 ['mean', '', 'Arithmetic sample mean.'], ['median', '', 'Median sample reading.'], ['variance', '', 'Population variance of readings.'], ['standard-deviation', '', 'Population standard deviation.'], ['spread', '', 'Maximum minus minimum reading.'], ['quartiles', '', 'Linearly interpolated quartiles and interquartile range.'], ['percentile', ' <percent>', 'Linearly interpolated percentile from 0 to 100.'], ['skewness', '', 'Population standardized third moment; constant readings are unknown.'], ['regression-slope', '', 'Least-squares reading change per second.'], ['regression-intercept', '', 'Fitted value at the first sample time.'], ['regression-residuals', '', 'Residual at each sample from a linear time fit.'], ['r-squared', '', 'Fraction of reading variance explained by time; constant series is unknown.'], ['trapezoid-integral', '', 'Reading-seconds under piecewise linear interpolation.'], ['left-integral', '', 'Reading-seconds with left-held readings.'], ['right-integral', '', 'Reading-seconds with right-held readings.'], ['coefficient-variation', '', 'Standard deviation divided by absolute mean; zero mean is unknown.'], ['lag-correlation', '', 'Pearson correlation of adjacent readings; constant side is unknown.'], ['moving-mean', ' <window>', 'Trailing sample-window arithmetic means.'], ['moving-median', ' <window>', 'Trailing sample-window medians.'], ['acceleration', '', 'Change in adjacent reading-per-second rates divided by midpoint time separation.'], ['fraction-above', ' <threshold>', 'Fraction of samples strictly above a threshold.'], ['fraction-below', ' <threshold>', 'Fraction of samples strictly below a threshold.'], ['threshold-crossings', ' <threshold>', 'Adjacent readings crossing the threshold, with sample direction.'], ['maximum-drawdown', '', 'Largest sampled decline from an earlier peak.'], ['maximum-drawup', '', 'Largest sampled rise from an earlier trough.'],
];
const sum = a => a.reduce((n,v)=>n+v,0);
const avg = a => sum(a)/a.length;
function quantile(values, p) { const a = [...values].sort((x,y)=>x-y), at = (a.length-1)*p, i = Math.floor(at); return a[i] + (a[Math.ceil(at)]-a[i])*(at-i); }
export function seriesStatistic(values, times, command, args = []) {
 if (!SERIES_SPECS.some(s=>s[0]===command)) throw new Error(`Unknown series command: ${command}.`);
 let parameter;
 if (command==='percentile') parameter=ledgerNumber(args[0],0,100);
 if (command.startsWith('moving-')) parameter=ledgerNumber(args[0],1,values.length,true);
 if (['fraction-above','fraction-below','threshold-crossings'].includes(command)) parameter=ledgerNumber(args[0],-1e9,1e9);
 if (values.some(v=>v===null)) return null;
 const n=values.length, mean=avg(values), variance=avg(values.map(v=>(v-mean)**2)), sd=Math.sqrt(variance), tx=times.map(t=>(t-times[0])/1000), tm=avg(tx), xx=sum(tx.map(t=>(t-tm)**2)), slope=sum(values.map((v,i)=>(v-mean)*(tx[i]-tm)))/xx, intercept=mean-slope*tm, residuals=values.map((v,i)=>v-(intercept+slope*tx[i]));
 switch(command) {
 case 'mean': return mean;
 case 'median': return quantile(values,.5);
 case 'variance': return variance;
 case 'standard-deviation': return sd;
 case 'spread': return Math.max(...values)-Math.min(...values);
 case 'quartiles': { const lower=quantile(values,.25), upper=quantile(values,.75); return {lower,median:quantile(values,.5),upper,interquartileRange:upper-lower}; }
 case 'percentile': return quantile(values,parameter/100);
 case 'skewness': return sd ? avg(values.map(v=>((v-mean)/sd)**3)) : null;
 case 'regression-slope': return slope;
 case 'regression-intercept': return intercept;
 case 'regression-residuals': return residuals;
 case 'r-squared': return variance ? Math.max(0,Math.min(1,1-sum(residuals.map(v=>v*v))/(n*variance))) : null;
 case 'trapezoid-integral': return sum(values.slice(1).map((v,i)=>(v+values[i])/2*(tx[i+1]-tx[i])));
 case 'left-integral': return sum(values.slice(0,-1).map((v,i)=>v*(tx[i+1]-tx[i])));
 case 'right-integral': return sum(values.slice(1).map((v,i)=>v*(tx[i+1]-tx[i])));
 case 'coefficient-variation': return mean ? sd/Math.abs(mean) : null;
 case 'lag-correlation': { const a=values.slice(0,-1),b=values.slice(1),ma=avg(a),mb=avg(b),den=Math.sqrt(sum(a.map(v=>(v-ma)**2))*sum(b.map(v=>(v-mb)**2))); return den ? sum(a.map((v,i)=>(v-ma)*(b[i]-mb)))/den : null; }
 case 'moving-mean': case 'moving-median': return values.slice(parameter-1).map((_,i)=>({sample:i+parameter,value:command==='moving-mean'?avg(values.slice(i,i+parameter)):quantile(values.slice(i,i+parameter),.5)}));
 case 'acceleration': { const rates=values.slice(1).map((v,i)=>(v-values[i])/(tx[i+1]-tx[i])); return rates.slice(1).map((v,i)=>({sample:i+3,value:(v-rates[i])/((tx[i+2]-tx[i])/2)})); }
 case 'fraction-above': return values.filter(v=>v>parameter).length/n;
 case 'fraction-below': return values.filter(v=>v<parameter).length/n;
 case 'threshold-crossings': return values.slice(1).flatMap((v,i)=>values[i]<parameter&&v>=parameter?[{sample:i+2,direction:'up'}]:values[i]>=parameter&&v<parameter?[{sample:i+2,direction:'down'}]:[]);
 case 'maximum-drawdown': { let peak=values[0],max=0; for(const v of values) {max=Math.max(max,peak-v);peak=Math.max(peak,v);} return max; }
 case 'maximum-drawup': {let low=values[0],max=0;for(const v of values){max=Math.max(max,v-low);low=Math.min(low,v);}return max;}
 }
}
function stored(value, name) {
 if (value.containers===undefined) return {value:null,key:null};
 if (!Array.isArray(value.containers)||value.containers.length>1000) throw new Error('Use at most 1000 storage containers.');
 const keys=new Set(); let total=0,unknown=false;
 for(const c of value.containers){if(!c||!['x','y','z'].every(k=>Number.isSafeInteger(c[k])))throw new Error('Container coordinates must be integers.');const key=`${c.x},${c.y},${c.z}`;if(keys.has(key))throw new Error('Duplicate containers.');keys.add(key);const items=ledgerItems(c.items===null?undefined:c.items);if(items===null)unknown=true;else total+=items.get(name)??0;}
 if(!Number.isSafeInteger(total)||total>1e9)throw new Error('Storage total exceeds supported bound.');
 const dim=value.player?.dimension;
 return {value:unknown?null:total,key:typeof dim==='string'&&/^[a-z0-9_.-]+:[a-z0-9_./-]+$/.test(dim)?`${dim}|${[...keys].sort().join(';')}`:null};
}
export function seriesReport(domain, values, selector, command, args=[]) {
 if(!Array.isArray(values)||values.length<2||values.length>100)throw new Error('Supply 2 to 100 chronologically ordered snapshots.');
 const samples=values.map(v=>parseSnapshot(JSON.stringify(v))), times=samples.map(v=>Date.parse(v.savedAt));
 if(times.some((t,i)=>!Number.isFinite(t)||i&&t<=times[i-1]))throw new Error('Snapshot timestamps must strictly increase.');
 let readings;
 if(domain==='inventory'){const name=itemName(selector);readings=values.map(v=>{const items=ledgerItems(v.inventory);return items===null?null:items.get(name)??0;});}
 else if(domain==='storage'){const name=itemName(selector),rows=values.map(v=>stored(v,name)),key=rows[0].key;readings=rows.map(r=>key&&r.key===key?r.value:null);}
 else {if(!['health','hunger','x','y','z'].includes(selector))throw new Error('Field must be health, hunger, x, y, or z.');readings=samples.map(v=>{const n=['x','y','z'].includes(selector)?v.player.position[selector]:v.player[selector];return typeof n==='number'&&Number.isFinite(n)&&Math.abs(n)<=3e7&&(selector!=='hunger'||n>=0&&n<=20&&Number.isInteger(n))&&(selector!=='health'||n>=0)?n:null;});if(['x','y','z'].includes(selector)&&(!samples[0].player.dimension||samples.some(s=>s.player.dimension!==samples[0].player.dimension)))readings=readings.map(()=>null);}
 return {statistic:command,selector,result:seriesStatistic(readings,times,command,args),samples:values.length,knownSamples:readings.filter(v=>v!==null).length,note:SERIES_NOTE};
}
export function registerSeries(program,name,domain,commands,{print}) {
 const group=program.command(name).description('Offline sampled evidence statistics; missing evidence remains unknown.');
 for(const [signature,description]of commands)group.command(signature).description(description).action(async(...values)=>{const supplied=values.slice(0,-2), selector=supplied.shift(),files=supplied.pop();if(files.length<2||files.length>100)throw new Error('Supply2 to100 snapshot files.');print(seriesReport(domain,await Promise.all(files.map(readLedgerSnapshot)),selector,signature.split(' ')[0],supplied));});
 return group;
}
