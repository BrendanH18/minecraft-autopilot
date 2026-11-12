import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { Command } from 'commander';
import { shapeCalculation, registerShapeTools, SHAPE_COMMANDS } from '../src/shape-tools.js';
const cases = [
  [
    "signed-area",
    [
      "0,0;2,0;2,2;0,2"
    ],
    4
  ],
  [
    "winding",
    [
      "0,0;2,0;2,2;0,2"
    ],
    "counterclockwise"
  ],
  [
    "centroid",
    [
      "0,0;2,0;2,2;0,2"
    ],
    {
      "x": 1,
      "z": 1
    }
  ],
  [
    "edge-lengths",
    [
      "0,0;2,0;2,2;0,2"
    ],
    [
      2,
      2,
      2,
      2
    ]
  ],
  [
    "compactness",
    [
      "0,0;2,0;2,2;0,2"
    ],
    0.7853981633974483
  ],
  [
    "bounds-fill",
    [
      "0,0;2,0;2,2;0,2"
    ],
    1
  ],
  [
    "contains",
    [
      "0,0;2,0;2,2;0,2",
      "1",
      "1"
    ],
    true
  ],
  [
    "translate",
    [
      "0,0;2,0;2,2;0,2",
      "1",
      "-1"
    ],
    [
      {
        "x": 1,
        "z": -1
      },
      {
        "x": 3,
        "z": -1
      },
      {
        "x": 3,
        "z": 1
      },
      {
        "x": 1,
        "z": 1
      }
    ]
  ],
  [
    "scale-centroid",
    [
      "0,0;2,0;2,2;0,2",
      "2"
    ],
    [
      {
        "x": -1,
        "z": -1
      },
      {
        "x": 3,
        "z": -1
      },
      {
        "x": 3,
        "z": 3
      },
      {
        "x": -1,
        "z": 3
      }
    ]
  ],
  [
    "rotate-centroid",
    [
      "0,0;2,0;2,2;0,2",
      "0"
    ],
    [
      {
        "x": 0,
        "z": 0
      },
      {
        "x": 2,
        "z": 0
      },
      {
        "x": 2,
        "z": 2
      },
      {
        "x": 0,
        "z": 2
      }
    ]
  ],
  [
    "reverse-winding",
    [
      "0,0;2,0;2,2;0,2"
    ],
    [
      {
        "x": 0,
        "z": 0
      },
      {
        "x": 0,
        "z": 2
      },
      {
        "x": 2,
        "z": 2
      },
      {
        "x": 2,
        "z": 0
      }
    ]
  ],
  [
    "vertex-mean",
    [
      "0,0;2,0;2,2;0,2"
    ],
    {
      "x": 1,
      "z": 1
    }
  ],
  [
    "convex",
    [
      "0,0;2,0;2,2;0,2"
    ],
    true
  ],
  [
    "edge-headings",
    [
      "0,0;2,0;2,2;0,2"
    ],
    [
      270,
      0,
      90,
      180
    ]
  ],
  [
    "edge-midpoints",
    [
      "0,0;2,0;2,2;0,2"
    ],
    [
      {
        "x": 1,
        "z": 0
      },
      {
        "x": 2,
        "z": 1
      },
      {
        "x": 1,
        "z": 2
      },
      {
        "x": 0,
        "z": 1
      }
    ]
  ],
  [
    "prism-volume",
    [
      "0,0;2,0;2,2;0,2",
      "3"
    ],
    12
  ],
  [
    "side-area",
    [
      "0,0;2,0;2,2;0,2",
      "3"
    ],
    24
  ],
  [
    "surface-area",
    [
      "0,0;2,0;2,2;0,2",
      "3"
    ],
    32
  ],
  [
    "extrusion-material",
    [
      "0,0;2,0;2,2;0,2",
      "3",
      "2"
    ],
    24
  ],
  [
    "paint-budget",
    [
      "0,0;2,0;2,2;0,2",
      "2",
      "3"
    ],
    3
  ],
  [
    "raster-centers",
    [
      "0,0;2,0;2,2;0,2"
    ],
    [
      {
        "x": 0,
        "z": 0
      },
      {
        "x": 1,
        "z": 0
      },
      {
        "x": 0,
        "z": 1
      },
      {
        "x": 1,
        "z": 1
      }
    ]
  ],
  [
    "nearest-vertex",
    [
      "0,0;2,0;2,2;0,2",
      "-1",
      "0"
    ],
    {
      "vertex": 1,
      "distance": 1
    }
  ],
  [
    "nearest-edge",
    [
      "0,0;2,0;2,2;0,2",
      "1",
      "1"
    ],
    1
  ],
  [
    "diagonals",
    [
      "0,0;2,0;2,2;0,2"
    ],
    2
  ],
  [
    "vertex-angle-sum",
    [
      "0,0;2,0;2,2;0,2"
    ],
    360
  ]
];
function close(actual,expected) {
 if(typeof expected==='number') { assert.equal(typeof actual,'number');assert.ok(Math.abs(actual-expected)<=1e-8*Math.max(1,Math.abs(expected)),`${actual} != ${expected}`); }
 else if(expected && typeof expected==='object') { assert.deepEqual(Object.keys(actual),Object.keys(expected)); for(const k of Object.keys(expected)) close(actual[k],expected[k]); }
 else assert.equal(actual,expected);
}
test('shape: 25 documented and distinct commands',()=>{assert.equal(SHAPE_COMMANDS.length,25);assert.equal(new Set(SHAPE_COMMANDS.map(([s])=>s.split(' ')[0])).size,25);});
for(const [command,args,expected] of cases) {
 test(`shape ${command}: direct expected result and Commander behavior`,async()=>{
  const result=shapeCalculation(command,args);close(result.result,expected);assert.match(result.note,/Offline|Continuous|Abstract/);
  const program=new Command().exitOverride();let printed;registerShapeTools(program,{print:value=>{printed=value;}});
  await program.parseAsync(['shape',command,...args],{from:'user'});close(printed.result,expected);
 });
 test(`shape ${command}: real CLI`,()=>{
  const run=spawnSync(process.execPath,['src/cli.js','shape',command,...args],{encoding:'utf8',timeout:15000});
  assert.equal(run.status,0,run.stderr); close(JSON.parse(run.stdout).result,expected);
 });
 test(`shape ${command}: malformed input rejected`,()=>{
  assert.throws(()=>shapeCalculation(command,[]));
  assert.throws(()=>shapeCalculation(command,args.map((v,i)=>i===0?'NaN':v)));
 });
}
test('shape: unknown command rejected',()=>assert.throws(()=>shapeCalculation('unknown',[])));
test('shape rejects bow-tie, degenerate, repeated and excessive polygons',()=>{for(const p of ['0,0;2,2;0,2;2,0','0,0;1,0;2,0','0,0;2,0;2,2;0,0',Array.from({length:101},(_,i)=>`${i},${i*i}`).join(';')]) assert.throws(()=>shapeCalculation('centroid',[p]));assert.throws(()=>shapeCalculation('raster-centers',['0,0;100,0;100,100;0,100']));});
