import { test } from 'node:test';
import assert from 'node:assert/strict';
import {createFakePluginHost,makeThreadResponse} from '@get-bb/plugin-sdk/testing';
import plugin from './server.ts';

const q={id:'q1',prompt:'Which?',required:true,allowFreeText:true,multiSelect:false,options:[{label:'One',value:'one'}]};
const asyncForm={id:'pint_test',threadId:'thr_test',status:'pending',origin:{kind:'plugin',pluginId:'provider-codex',rendererId:'async-question'},payload:{kind:'plugin',title:'Question',data:{questions:[{title:'Question',options:['A','B','C']}]}}};
function setup(options:{project?:string;stale?:boolean;form?:typeof asyncForm;pauseRespond?:Promise<void>}={}){
 const thread=makeThreadResponse({id:'thr_test',projectId:'proj_test',title:'Test agent'});
 const interaction=options.form??{id:'int_test',threadId:thread.id,status:options.stale?'resolved':'pending',payload:{kind:'user_question',questions:[q]}};
 const resolved:unknown[]=[];const responded:unknown[]=[];const sent:unknown[]=[];
 const fake=createFakePluginHost({pluginId:'tidemark',settings:options.project?{project:options.project}:{},sdk:{threads:{
  list:async()=>[thread],get:async()=>thread,
  interactions:{list:async()=>[interaction],get:async()=>interaction,resolve:async args=>{resolved.push(args);interaction.status='resolved';return interaction;},respond:async args=>{responded.push(args);await options.pauseRespond;interaction.status='resolved';return interaction;}},
  send:async args=>{sent.push(args);return{delivery:'queued'};},
 }} as any});
 plugin(fake.bb);return{...fake,resolved,responded,sent};
}

test('state presents Codex async questions as selectable standard questions',async()=>{
 const h=setup({form:structuredClone(asyncForm)});try{const r=await h.harness.behavior.fetchHttp('GET','/state');const b=await r.json();assert.equal(b.interactions[0].payload.kind,'user_question');assert.equal(b.interactions[0].payload.questions[0].options[1].value,'option-2');}finally{await h.harness.lifecycle.dispose();}
});

for(const answer of [{selected:['option-2']},{selected:[],freeText:'My own answer'}]){
 test(`async input responds using renderer wire value: ${JSON.stringify(answer)}`,async()=>{
  const h=setup({form:structuredClone(asyncForm)});try{
   const body={threadId:'thr_test',interactionId:'pint_test',response:{answers:{'question-1':answer}}};
   assert.equal((await post(h,'/answer',body)).status,200);
   assert.deepEqual(h.responded,[{threadId:'thr_test',interactionId:'pint_test',value:{answers:{'question-1':answer}}}]);
   assert.deepEqual(h.resolved,[]);
   assert.equal((await post(h,'/answer',body)).status,400);
   assert.equal(h.responded.length,1);
  }finally{await h.harness.lifecycle.dispose();}
 });
}

test('simultaneous async answers only submit once',async()=>{
 let release!:()=>void;const pauseRespond=new Promise<void>(resolve=>{release=resolve;});
 const h=setup({form:structuredClone(asyncForm),pauseRespond});try{
  const body={threadId:'thr_test',interactionId:'pint_test',response:{answers:{'question-1':{selected:['option-1']}}}};
  const first=post(h,'/answer',body);
  while(!h.responded.length)await new Promise(resolve=>setImmediate(resolve));
  assert.equal((await post(h,'/answer',body)).status,400);
  release();assert.equal((await first).status,200);assert.equal(h.responded.length,1);
 }finally{release();await h.harness.lifecycle.dispose();}
});

test('unknown plugin forms never reach respond or resolve',async()=>{
 const form=structuredClone(asyncForm);form.origin.rendererId='unknown';
 const h=setup({form});try{const r=await post(h,'/answer',{threadId:'thr_test',interactionId:'pint_test',response:{answers:{'question-1':{selected:['option-1']}}}});assert.equal(r.status,400);assert.deepEqual(h.responded,[]);assert.deepEqual(h.resolved,[]);}finally{await h.harness.lifecycle.dispose();}
});
async function post(h:ReturnType<typeof setup>,route:string,body:unknown){
 return h.harness.behavior.fetchHttp('POST',route,{body:JSON.stringify(body),headers:{'content-type':'application/json'}});
}
test('state includes only pending questions',async()=>{
 const h=setup({stale:true});try{const r=await h.harness.behavior.fetchHttp('GET','/state');assert.equal(r.status,200);const b=await r.json();assert.equal(b.threads.length,1);assert.deepEqual(b.interactions,[]);}finally{await h.harness.lifecycle.dispose();}
});
test('stale answers never resolve through SDK',async()=>{
 const h=setup({stale:true});try{const r=await post(h,'/answer',{threadId:'thr_test',interactionId:'int_test',response:{answers:{q1:{selected:['one']}}}});assert.equal(r.status,400);assert.equal(h.resolved.length,0);}finally{await h.harness.lifecycle.dispose();}
});
test('valid custom answer reaches correct thread and question',async()=>{
 const h=setup();try{const r=await post(h,'/answer',{threadId:'thr_test',interactionId:'int_test',response:{answers:{q1:{selected:[],freeText:'My answer'}}}});assert.equal(r.status,200);assert.deepEqual(h.resolved,[{threadId:'thr_test',interactionId:'int_test',resolution:{kind:'user_answer',answers:{q1:{selected:[],freeText:'My answer'}}}}]);}finally{await h.harness.lifecycle.dispose();}
});
test('project restriction rejects writes outside configured project',async()=>{
 const h=setup({project:'proj_other'});try{const r=await post(h,'/send',{threadId:'thr_test',text:'Do it'});assert.equal(r.status,400);assert.equal(h.sent.length,0);}finally{await h.harness.lifecycle.dispose();}
});
test('follow-up is a structured text input and queued delivery is visible',async()=>{
 const h=setup();try{const r=await post(h,'/send',{threadId:'thr_test',text:'Дополнение\n$(literal)'});assert.equal(r.status,200);assert.equal((await r.json()).delivery,'queued');assert.deepEqual(h.sent,[{threadId:'thr_test',input:[{type:'text',text:'Дополнение\n$(literal)',mentions:[]}],mode:'auto'}]);}finally{await h.harness.lifecycle.dispose();}
});
