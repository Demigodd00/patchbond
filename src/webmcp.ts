import {useEffect,useRef} from 'react';
import type {Job} from './model';

type Tool={name:string;title:string;description:string;inputSchema:object;annotations:{readOnlyHint:boolean;untrustedContentHint:boolean};execute:(input:unknown)=>unknown|Promise<unknown>};
type Registry={registerTool:(tool:Tool,options:{signal:AbortSignal})=>void|Promise<void>};
function object(input:unknown){if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Expected an object.');return input as Record<string,unknown>;}

export function usePatchTools(jobs:Job[],mode:string,open:(id:string)=>void){
 const current=useRef({jobs,mode,open});current.current={jobs,mode,open};
 useEffect(()=>{
  const context=(document as Document&{modelContext?:Registry}).modelContext;if(!context?.registerTool)return;
  const lifecycle=new AbortController();
  const tools:Tool[]=[
   {name:'list_patchbond_jobs',title:'List PatchBond commitments',description:'Read the current workspace records. Returns the mode so simulated examples are never mistaken for chain evidence.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true,untrustedContentHint:true},execute(input){if(Object.keys(object(input)).length)throw Error('No input fields are supported.');const c=current.current;return{mode:c.mode,simulated:c.mode==='demo',jobs:c.jobs.map(j=>({id:j.id,title:j.title,status:j.status,revision:j.revision}))};}},
   {name:'open_patchbond_job',title:'Open a PatchBond commitment',description:'Navigate to an existing commitment in the current mode. Does not connect a wallet, sign, fund, review, or submit anything.',inputSchema:{type:'object',properties:{id:{type:'string'}},required:['id'],additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:true},async execute(input){const p=object(input);if(Object.keys(p).length!==1||typeof p.id!=='string'||!current.current.jobs.some(j=>j.id===p.id))throw Error('Unknown commitment in the current workspace.');current.current.open(p.id);await new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve())));return{id:p.id,mode:current.current.mode,navigated:true};}},
  ];
  for(const tool of tools){try{Promise.resolve(context.registerTool(tool,{signal:lifecycle.signal})).catch(()=>{});}catch{/* Optional capability; normal UI remains available. */}}
  return()=>lifecycle.abort();
 },[]);
}
