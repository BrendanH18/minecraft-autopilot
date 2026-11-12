import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { Command } from 'commander';
import { gridCalculation, registerGridTools, GRID_COMMANDS } from '../src/grid-tools.js';
const cases = [
  [
    "block-address",
    [
      "-1",
      "16"
    ],
    {
      "chunkX": -1,
      "chunkZ": 1,
      "localX": 15,
      "localZ": 0
    }
  ],
  [
    "chunk-address",
    [
      "-1",
      "32"
    ],
    {
      "regionX": -1,
      "regionZ": 1,
      "localX": 31,
      "localZ": 0
    }
  ],
  [
    "region-header-entry",
    [
      "-1",
      "32"
    ],
    {
      "file": "r.-1.1.mca",
      "locationOffset": 124,
      "timestampOffset": 4220
    }
  ],
  [
    "chunk-window",
    [
      "0",
      "0",
      "1"
    ],
    {
      "minX": -16,
      "minZ": -16,
      "maxX": 31,
      "maxZ": 31
    }
  ],
  [
    "region-seam",
    [
      "31",
      "0",
      "1",
      "0"
    ],
    true
  ],
  [
    "chunk-reconstruct",
    [
      "-1",
      "15"
    ],
    -1
  ],
  [
    "region-reconstruct",
    [
      "-1",
      "31"
    ],
    -1
  ],
  [
    "section-address",
    [
      "-1"
    ],
    {
      "section": -1,
      "local": 15
    }
  ],
  [
    "section-reconstruct",
    [
      "-1",
      "15"
    ],
    -1
  ],
  [
    "region-slot",
    [
      "3",
      "2"
    ],
    67
  ],
  [
    "slot-address",
    [
      "67"
    ],
    {
      "x": 3,
      "z": 2
    }
  ],
  [
    "section-index",
    [
      "1",
      "2",
      "3"
    ],
    561
  ],
  [
    "index-address",
    [
      "561"
    ],
    {
      "x": 1,
      "y": 2,
      "z": 3
    }
  ],
  [
    "axis-chunks",
    [
      "-1",
      "16"
    ],
    3
  ],
  [
    "axis-regions",
    [
      "-1",
      "512"
    ],
    3
  ],
  [
    "chunk-intersection",
    [
      "0",
      "-2",
      "3"
    ],
    4
  ],
  [
    "border-distance",
    [
      "0"
    ],
    0.5
  ],
  [
    "next-boundary",
    [
      "16",
      "-1"
    ],
    0
  ],
  [
    "snap-grid",
    [
      "7",
      "4",
      "0"
    ],
    8
  ],
  [
    "cell-center",
    [
      "-1",
      "4",
      "0"
    ],
    -2
  ],
  [
    "chunk-neighbors",
    [
      "0",
      "0"
    ],
    [
      {
        "x": -1,
        "z": 0
      },
      {
        "x": 1,
        "z": 0
      },
      {
        "x": 0,
        "z": -1
      },
      {
        "x": 0,
        "z": 1
      }
    ]
  ],
  [
    "chunk-ring",
    [
      "2"
    ],
    16
  ],
  [
    "loaded-square",
    [
      "2"
    ],
    25
  ],
  [
    "axis-partitions",
    [
      "-1",
      "16"
    ],
    [
      {
        "chunk": -1,
        "minimum": -1,
        "maximum": -1
      },
      {
        "chunk": 0,
        "minimum": 0,
        "maximum": 15
      },
      {
        "chunk": 1,
        "minimum": 16,
        "maximum": 16
      }
    ]
  ],
  [
    "region-header-offset",
    [
      "3",
      "2"
    ],
    {
      "location": 268,
      "timestamp": 4364
    }
  ]
];
function close(actual,expected) {
 if(typeof expected==='number') { assert.equal(typeof actual,'number');assert.ok(Math.abs(actual-expected)<=1e-8*Math.max(1,Math.abs(expected)),`${actual} != ${expected}`); }
 else if(expected && typeof expected==='object') { assert.deepEqual(Object.keys(actual),Object.keys(expected)); for(const k of Object.keys(expected)) close(actual[k],expected[k]); }
 else assert.equal(actual,expected);
}
test('grid: 25 documented and distinct commands',()=>{assert.equal(GRID_COMMANDS.length,25);assert.equal(new Set(GRID_COMMANDS.map(([s])=>s.split(' ')[0])).size,25);});
for(const [command,args,expected] of cases) {
 test(`grid ${command}: direct expected result and Commander behavior`,async()=>{
  const result=gridCalculation(command,args);close(result.result,expected);assert.match(result.note,/Offline|Continuous|Abstract/);
  const program=new Command().exitOverride();let printed;registerGridTools(program,{print:value=>{printed=value;}});
  await program.parseAsync(['grid',command,...args],{from:'user'});close(printed.result,expected);
 });
 test(`grid ${command}: real CLI`,()=>{
  const run=spawnSync(process.execPath,['src/cli.js','grid',command,...args],{encoding:'utf8',timeout:15000});
  assert.equal(run.status,0,run.stderr); close(JSON.parse(run.stdout).result,expected);
 });
 test(`grid ${command}: malformed input rejected`,()=>{
  assert.throws(()=>gridCalculation(command,[]));
  assert.throws(()=>gridCalculation(command,args.map((v,i)=>i===0?'NaN':v)));
 });
}
test('grid: unknown command rejected',()=>assert.throws(()=>gridCalculation('unknown',[])));
test('grid rejects fractional blocks and invalid local indices',()=>{assert.throws(()=>gridCalculation('block-address',['0.5','0']));assert.throws(()=>gridCalculation('chunk-reconstruct',['0','16']));assert.throws(()=>gridCalculation('next-boundary',['0','0']));});
