import test from 'node:test';
import assert from 'node:assert/strict';
import { Command } from 'commander';
import { RESOURCE_GROUPS } from '../src/planning-resources.js';
import { RESOURCE_CASES } from './planning-resources-cases.js';
import { calculateOffline, registerOfflineGroups } from '../src/offline-kit.js';

function close(actual, expected) {
  if(typeof expected==='number') {
    assert.equal(typeof actual,'number');
    assert.ok(Math.abs(actual-expected)<=1e-9*Math.max(1,Math.abs(expected)),`${actual} differs from ${expected}`);
  } else if(expected!==null&&typeof expected==='object') {
    assert.deepEqual(Object.keys(actual),Object.keys(expected));
    for(const key of Object.keys(expected)) close(actual[key],expected[key]);
  } else assert.equal(actual,expected);
}
const groupMap=new Map(RESOURCE_GROUPS.map(group=>[group.name,group]));
test('resource inventory has exactly 250 commands and independent examples',()=>{
  assert.equal(RESOURCE_GROUPS.length,10);
  assert.equal(RESOURCE_CASES.length,250);
  const keys=RESOURCE_GROUPS.flatMap(group=>{
    assert.equal(group.commands.length,25);
    return group.commands.map(spec=>`${group.name}/${spec.signature.split(' ')[0]}`);
  });
  assert.equal(new Set(keys).size,250);
  assert.deepEqual(new Set(RESOURCE_CASES.map(([g,c])=>`${g}/${c}`)),new Set(keys));
});
for(const [name,command,args,expected] of RESOURCE_CASES) {
  test(`${name} ${command}: expected result and Commander invocation`,async()=>{
    const group=groupMap.get(name),before=JSON.stringify(args);
    close(calculateOffline(group,command,args).result,expected);
    assert.equal(JSON.stringify(args),before);
    const program=new Command().exitOverride();let printed;
    registerOfflineGroups(program,[group],{print:value=>{printed=value;}});
    await program.parseAsync([name,command,'--',...args],{from:'user'});
    close(printed.result,expected);
    assert.match(printed.note,/Offline/);
  });
  test(`${name} ${command}: rejects malformed and excessive arguments`,()=>{
    const group=groupMap.get(name);
    assert.throws(()=>calculateOffline(group,command,[]));
    assert.throws(()=>calculateOffline(group,command,[...args,'extra']));
    assert.throws(()=>calculateOffline(group,command,['NaN',...args.slice(1)]));
  });
}
const run=(g,c,...args)=>calculateOffline(groupMap.get(g),c,args.map(String)).result;
test('resource plans reject infeasible shapes and allocations',()=>{
  assert.throws(()=>run('queueplan','fcfs','2,1','1,1'));
  assert.throws(()=>run('queueplan','fcfs','0,1','1'));
  assert.throws(()=>run('queueplan','parallel-dispatch','2,3',1001));
  assert.throws(()=>run('replenish','service-fill',10,11));
  assert.throws(()=>run('bufferplan','trace',6,'1','1',5));
  assert.throws(()=>run('batchflow','cycle-upgrade','2,3','1,1',3,1));
  assert.throws(()=>run('durability','replacement-tools',1,2,3,0));
  assert.throws(()=>run('harvest','seed-growth',2,2,1001,10));
  assert.throws(()=>run('blending','target-two-load',3,3,3,10));
  assert.throws(()=>run('blending','property-bounds','2,3','0.8,0.8','1,1'));
  assert.throws(()=>run('apportion','dhondt','0,0',4));
  assert.throws(()=>run('apportion','dhondt','1,2',1001));
  assert.throws(()=>run('apportion','cap-dhondt','1,0','1,100',2));
  assert.throws(()=>run('project-cost','marginal-tiers',30,'10,10','2,1'));
});
test('resource zero workload and exact count boundaries remain defined',()=>{
  assert.equal(run('replenish','minimum-lot',0,10,4),0);
  assert.equal(run('batchflow','serial-availability','0,1'),0);
  assert.equal(run('durability','replacement-tools',0,2,3,0),0);
  assert.deepEqual(run('haul','outbound-loads',0,4),[]);
  assert.deepEqual(run('apportion','dhondt','1,2',0),[0,0]);
  assert.deepEqual(run('apportion','relative-errors','1,2','0,0'),[null,null]);
  assert.equal(run('harvest','repeat-cycles',11,3,4),3);
  assert.equal(run('blending','target-two-share',2,10,2),0);
  assert.equal(run('project-cost','break-even-units',0.3,0.2,0.1),3);
});


test('fractional budget equality does not create shortages or infeasible blends',()=>{
  assert.equal(run('replenish','stockout-period',0.3,'0,0','0.1,0.2'),null);
  assert.deepEqual(run('replenish','order-gap',0.3,'0,0','0.1,0.2'),[0.19999999999999998,0]);
  assert.equal(run('bufferplan','unmet-units',0.3,'0,0','0.1,0.2',1),0);
  assert.equal(run('bufferplan','first-shortage',0.3,'0,0','0.1,0.2',1),null);
  assert.deepEqual(run('blending','property-bounds','2,10,20','0,0,0','0.7,0.2,0.1'),{minimum:5.4,maximum:5.4});
  assert.equal(run('project-cost','first-overbudget','0.1,0.2',0.3),null);
  assert.deepEqual(run('queueplan','completion-deadlines','0,0','0.1,0.2','0.1,0.3'),[{lateness:0,late:false},{lateness:0,late:false}]);
  assert.equal(run('queueplan','backlog-at','0,0','0.1,0.2',0.3),0);
  assert.equal(run('durability','first-break-phase',0.3,'1,1','0.1,0.2'),2);
});


test('fractional comparisons honor inclusive reserve, delivery, quality, and cost ties',()=>{
  assert.deepEqual(run('bufferplan','reserve-breaches',0.3,'0','0.1',1,0.2),[]);
  assert.deepEqual(run('haul','late-shipment','0.1','0.2','0.3'),[]);
  assert.deepEqual(run('harvest','harvest-before-expiry','0,0.1,0.2',0.1,0.1).map(x=>x.expired),[false,false,false]);
  assert.equal(run('blending','range-compliance','1,1,1','0.1,0.2,0.3',0.2,0.2).within,true);
  assert.equal(run('durability','repair-or-replace',3,0.1,0.3).choice,'repair');
  assert.equal(run('project-cost','rent-or-buy',0.4,0.3,1,0.1).choice,'buy');
});

test('cumulative fractional wear and replenishment retain feasible prefixes',()=>{
  const wear=Array(50).fill('.3').join(','),receipts=Array(50).fill('0').join(',');
  assert.deepEqual(run('durability','action-prefix',15,wear,0),{actions:50,unused:0});
  assert.deepEqual(run('durability','action-prefix',20,wear,5),{actions:50,unused:0});
  assert.deepEqual(run('durability','action-prefix',15,`${wear},.3`,0),{actions:50,unused:0});
  assert.equal(run('durability','action-prefix',14.99,wear,0).actions,49);
  assert.equal(run('replenish','stockout-period',15,receipts,wear),null);
  assert.equal(run('replenish','order-gap',15,receipts,wear).at(-1),0);
  assert.equal(run('replenish','backorder-area',15,receipts,wear),0);
  assert.equal(run('replenish','stockout-period',14.99,receipts,wear),50);
  assert.equal(run('replenish','stockout-period',15,`${receipts},0`,`${wear},.001`),51);
  close(run('replenish','order-gap',0,'1,0,0','.3,.3,.4'),[.7,.4,0]);
});
