import { spawnSync } from 'node:child_process';
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,writeFile,readFile,rm } from 'node:fs/promises';
import { join } from 'node:path';
import { Command } from 'commander';
import { ROUTINE_METRICS_COMMANDS,routineMetricsReport,registerRoutineMetricsTools } from '../src/routine-metrics-tools.js';
const actions=[{type:'collect',block:'dirt',count:4},{type:'wait',seconds:2},{type:'collect',block:'dirt',count:2},{type:'deposit',item:'dirt',count:3},{type:'wait',seconds:4}];
const entropy=-(.4*Math.log2(.4)*2+.2*Math.log2(.2));
const cases={
 'type-entropy':[[],entropy],'type-concentration':[[],.36],'switch-rate':[[],1],
 'transition-probabilities':[[],[{pair:'collect>wait',count:1,probability:.5},{pair:'wait>collect',count:1,probability:1},{pair:'collect>deposit',count:1,probability:.5},{pair:'deposit>wait',count:1,probability:1}]],
 trigrams:[[],{'collect>wait>collect':1,'wait>collect>deposit':1,'collect>deposit>wait':1}],
 'lag-pairs':[['2'],{'collect>collect':1,'wait>deposit':1,'collect>wait':1}],
 'type-recurrence':[['collect'],[2]],'item-recurrence':[['dirt'],[2,1]],'prefix-diversity':[[],[1,2,2,3,3]],'suffix-diversity':[[],[3,3,3,2,1]],'wait-share':[[],.4],'collection-concentration':[[],1],
 'deposit-uncertainty':[[],{steps:[],share:0}],'collection-pressure':[[],{'minecraft:dirt':6}],
 'wait-spacing':[[],[2]],'inspection-spacing':[[],[]],'return-spacing':[[],[]],
 'type-coverage':[['wait','eat'],{share:.5,missing:['eat']}], 'item-coverage':[['dirt','sand'],{share:.5,missing:['minecraft:sand']}],
 'wait-quantiles':[[],{minimum:2,median:3,maximum:4}], 'collect-quantiles':[[],{minimum:2,median:3,maximum:4}], 'deposit-quantiles':[[],{minimum:3,median:3,maximum:3}], 'goto-revisit':[[],[]], 'vertical-reversals':[[],0], 'step-cost':[['collect=2,wait=1,deposit=3'],{steps:[2,1,2,3,1],total:9}],
};
test('routine-metrics all25 expected values and file CLI',async()=>{const dir=await mkdtemp(join(process.cwd(),'.metrics-test-'));try{const file=join(dir,'routine.json');await writeFile(file,JSON.stringify(actions));assert.equal(ROUTINE_METRICS_COMMANDS.length,25);for(const [signature]of ROUTINE_METRICS_COMMANDS){const name=signature.split(' ')[0],[args,expected]=cases[name],actual=routineMetricsReport(actions,name,args).result;if(typeof expected==='number')assert.ok(Math.abs(actual-expected)<1e-12,name);else assert.deepEqual(actual,expected,name);let output;const p=new Command();registerRoutineMetricsTools(p,{print:v=>{output=v;}});await p.parseAsync(['node','test','routine-metrics',name,file,...args]);assert.deepEqual(output.result,actual,name);const processResult=spawnSync(process.execPath,['src/cli.js','routine-metrics',name,file,...args],{encoding:'utf8',timeout:15000});assert.equal(processResult.status,0,processResult.stderr);assert.deepEqual(JSON.parse(processResult.stdout).result,actual,`${name} shipped CLI`);assert.equal(await readFile(file,'utf8'),JSON.stringify(actions),'input unchanged');}}finally{await rm(dir,{recursive:true,force:true});}});
test('routine metrics invalid, unknown deposit, revisit and reversal',()=>{assert.throws(()=>routineMetricsReport([], 'type-entropy'));assert.throws(()=>routineMetricsReport(actions,'bad'));assert.throws(()=>routineMetricsReport(actions,'step-cost',['wait=2']));assert.throws(()=>routineMetricsReport(actions,'lag-pairs',['0']));assert.throws(()=>routineMetricsReport(actions,'type-recurrence',['bogus']));assert.deepEqual(routineMetricsReport([{type:'collect',block:'dirt',count:2},{type:'deposit',item:'dirt'}],'collection-pressure').result,{'minecraft:dirt':null});const positions=[0,2,0].map(y=>({type:'goto',x:0,y,z:0}));assert.equal(routineMetricsReport(positions,'vertical-reversals').result,1);assert.deepEqual(routineMetricsReport(positions,'goto-revisit').result,[{step:3,previousStep:1}]);});
