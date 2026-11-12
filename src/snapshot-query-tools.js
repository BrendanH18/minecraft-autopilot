import { parseSnapshot } from './cli-views.js';
import { readLedgerSnapshot, ledgerNumber } from './ledger-tools.js';
// Paths are JSON Pointers (RFC 6901), so keys containing dots remain addressable.
export function pointerParts(pointer){if(typeof pointer!=='string'||pointer.length>1000||pointer!==''&&!pointer.startsWith('/')||/~(?![01])/u.test(pointer))throw new Error('Use a JSON Pointer, with empty string for root.');return pointer===''?[]:pointer.slice(1).split('/').map(k=>k.replace(/~1/g,'/').replace(/~0/g,'~'));}
export function pointerGet(value,pointer){let node=value;for(const part of pointerParts(pointer)){if(node===null||typeof node!=='object'||!Object.hasOwn(node,part))return {present:false,value:null};node=node[part];}return {present:true,value:node};}
const escape=s=>s.replace(/~/g,'~0').replace(/\//g,'~1');
export function walkEvidence(input){const nodes=[];const visit=(value,path,depth)=>{if(typeof value==='number'&&!Number.isFinite(value))throw new Error('Evidence numbers must be finite.');if(depth>40||nodes.length>=20000)throw new Error('Evidence traversal limited to depth40 and20000 nodes.');nodes.push({path,value,depth});if(value!==null&&typeof value==='object')for(const [key,v]of Object.entries(value))visit(v,`${path}/${escape(key)}`,depth+1);};visit(input,'',0);return nodes;}
const kind=v=>v===null?'null':Array.isArray(v)?'array':typeof v;
const specs=[
 ['field',' <pointer>','Read one JSON Pointer with explicit presence.'],['keys',' <pointer>','List immediate keys at an object or array.'],['field-type',' <pointer>','Report a selected JSON value type.'],['has-path',' <pointer>','Check whether a path was explicitly recorded.'],['children',' <pointer>','List immediate child paths, values, and types.'],['leaves','','List scalar leaves with JSON Pointer provenance.'],['numeric-leaves','','List finite numeric leaves.'],['string-leaves','','List string leaves.'],['null-leaves','','List explicitly null leaf paths.'],['array-lengths','','List every array and its recorded length.'],['object-sizes','','List key counts of non-array objects.'],['deepest-paths','','Find paths at the maximum nesting depth.'],['node-count','','Count all nodes and scalar leaves.'],['key-frequency','','Count field-name occurrences at any depth.'],['key-search',' <text>','Find paths whose final key contains literal text.'],['value-search',' <text>','Find string leaves containing literal text.'],['subtree-paths',' <pointer>','List all nodes of one selected subtree with relative pointers.'],['project',' <pointers...>','Read several explicit paths retaining missing markers.'],['missing-paths',' <pointers...>','List requested paths absent from the evidence.'],['numeric-range',' <minimum> <maximum>','Find numeric leaves in an inclusive supplied range.'],['string-lengths','','Report lengths of all string leaves in UTF-16 units.'],['empty-values','','Find empty strings, arrays, and objects.'],['boolean-leaves','','List explicitly recorded booleans.'],['compare-paths',' <first> <second>','Compare two present values by canonical structural JSON equality.'],['array-distinct',' <pointer>','Count structurally distinct entries in an array.'],
];
export const SNAPSHOT_QUERY_COMMANDS=specs.map(([n,a,d])=>[`${n} <file>${a}`,d]);
function canonical(value){if(value===null||typeof value!=='object')return JSON.stringify(value);if(Array.isArray(value))return `[${value.map(canonical).join(',')}]`;return `{${Object.keys(value).sort().map(k=>`${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`;}
export function snapshotQueryReport(value,command,args=[]){parseSnapshot(JSON.stringify(value));const nodes=walkEvidence(value),leaves=nodes.filter(n=>n.value===null||typeof n.value!=='object'),view=n=>({path:n.path,type:kind(n.value),value:n.value});const get=p=>pointerGet(value,p);const listArgs=()=>{const ps=args.flat();if(!ps.length||ps.length>100)throw new Error('Give 1 to100 pointers.');ps.forEach(pointerParts);return ps;};const text=()=>{if(typeof args[0]!=='string'||!args[0].length||args[0].length>1000)throw new Error('Give 1 to1000 text characters.');return args[0];};let result;
 switch(command){
 case 'field':result=get(args[0]);break;
 case 'field-type':{const got=get(args[0]);result={present:got.present,type:got.present?kind(got.value):null};break;}
 case 'has-path':result=get(args[0]).present;break;
 case 'keys':case 'children':{const got=get(args[0]);if(!got.present||got.value===null||typeof got.value!=='object')result=null;else result=command==='keys'?Object.keys(got.value):Object.entries(got.value).map(([k,v])=>({path:`${args[0]}/${escape(k)}`,type:kind(v),value:v}));break;}
 case 'leaves':result=leaves.map(view);break;
 case 'numeric-leaves':result=leaves.filter(n=>typeof n.value==='number').map(view);break;
 case 'string-leaves':result=leaves.filter(n=>typeof n.value==='string').map(view);break;
 case 'null-leaves':result=leaves.filter(n=>n.value===null).map(n=>n.path);break;
 case 'array-lengths':result=nodes.filter(n=>Array.isArray(n.value)).map(n=>({path:n.path,length:n.value.length}));break;
 case 'object-sizes':result=nodes.filter(n=>n.value!==null&&typeof n.value==='object'&&!Array.isArray(n.value)).map(n=>({path:n.path,keys:Object.keys(n.value).length}));break;
 case 'deepest-paths':{const depth=Math.max(...nodes.map(n=>n.depth));result={depth,paths:nodes.filter(n=>n.depth===depth).map(n=>n.path)};break;}
 case 'node-count':result={nodes:nodes.length,leaves:leaves.length};break;
 case 'key-frequency':{const counts=new Map();for(const n of nodes.filter(n=>n.path)){const k=pointerParts(n.path).at(-1);counts.set(k,(counts.get(k)??0)+1);}result=Object.fromEntries(counts);break;}
 case 'key-search':{const t=text();result=nodes.filter(n=>n.path&&pointerParts(n.path).at(-1).includes(t)).map(view);break;}
 case 'value-search':{const t=text();result=leaves.filter(n=>typeof n.value==='string'&&n.value.includes(t)).map(view);break;}
 case 'subtree-paths':{const got=get(args[0]);result=got.present?walkEvidence(got.value).map(view):null;break;}
 case 'project':result=listArgs().map(path=>({path,...get(path)}));break;
 case 'missing-paths':result=listArgs().filter(p=>!get(p).present);break;
 case 'numeric-range':{const low=ledgerNumber(args[0],-1e12,1e12),high=ledgerNumber(args[1],low,1e12);result=leaves.filter(n=>typeof n.value==='number'&&n.value>=low&&n.value<=high).map(view);break;}
 case 'string-lengths':result=leaves.filter(n=>typeof n.value==='string').map(n=>({path:n.path,length:n.value.length}));break;
 case 'empty-values':result=nodes.filter(n=>n.value===''||n.value!==null&&typeof n.value==='object'&&!Object.keys(n.value).length).map(view);break;
 case 'boolean-leaves':result=leaves.filter(n=>typeof n.value==='boolean').map(view);break;
 case 'compare-paths':{const a=get(args[0]),b=get(args[1]);result=a.present&&b.present?canonical(a.value)===canonical(b.value):null;break;}
 case 'array-distinct':{const got=get(args[0]);result=got.present&&Array.isArray(got.value)?{entries:got.value.length,distinct:new Set(got.value.map(canonical)).size}:null;break;}
 default:throw new Error(`Unknown snapshot query: ${command}.`);
 }return {query:command,result,note:'Saved evidence structure only. Presence and value comparisons do not establish current world state or task success. Paths use JSON Pointer syntax; missing differs from explicit null.'};}
export function registerSnapshotQueryTools(program,{print}){const group=program.command('snapshot-query').description('Query recorded snapshot fields using JSON Pointers.');for(const [signature,description]of SNAPSHOT_QUERY_COMMANDS)group.command(signature).description(description).action(async(file,...values)=>print(snapshotQueryReport(await readLedgerSnapshot(file),signature.split(' ')[0],values.slice(0,-2).flat())));return group;}
