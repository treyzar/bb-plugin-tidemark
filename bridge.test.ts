import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizePayload, validateAnswer, validateMessage } from './bridge.ts';

const question = { id: 'q1', prompt: 'Выбрать?', required: true, allowFreeText: true, multiSelect: false, options: [{label:'Первый',value:'one'}] };
const pending = { id:'i1', threadId:'t1', status:'pending', payload:{kind:'user_question',questions:[question]} };
const asyncQuestion = {id:'pint_test',threadId:'thr_test',status:'pending',origin:{kind:'plugin',pluginId:'provider-codex',rendererId:'async-question'},payload:{kind:'plugin',title:'Question',data:{questions:[{title:'Question',options:['A','B','C']},{title:'Explain',options:null}]}}};

test('actual Codex plugin input normalizes to its renderer question and option IDs',()=>{
 assert.deepEqual(normalizePayload(asyncQuestion),{kind:'user_question',title:'Question',questions:[
  {id:'question-1',prompt:'Question',shortLabel:'Question 1',required:true,allowFreeText:true,multiSelect:false,options:[{value:'option-1',label:'A'},{value:'option-2',label:'B'},{value:'option-3',label:'C'}]},
  {id:'question-2',prompt:'Explain',shortLabel:'Question 2',required:true,allowFreeText:true,multiSelect:false,options:[]},
 ]});
 assert.deepEqual(validateAnswer(asyncQuestion,{answers:{'question-1':{selected:['option-2']},'question-2':{selected:[],freeText:'Custom'}}}),{kind:'user_answer',answers:{'question-1':{selected:['option-2']},'question-2':{selected:[],freeText:'Custom'}}});
 assert.equal(normalizePayload(pending),pending.payload);
});

test('unknown, malformed and lookalike plugin forms stay unsupported',()=>{
 const variants=[
  {...asyncQuestion,origin:{...asyncQuestion.origin,pluginId:'another-plugin'}},
  {...asyncQuestion,origin:{...asyncQuestion.origin,rendererId:'mcp-elicitation'}},
  {...asyncQuestion,origin:undefined},
  {...asyncQuestion,payload:{kind:'plugin',data:{questions:[{title:'Question',options:[]}]}}},
 ];
 for(const form of variants){assert.equal(normalizePayload(form),form.payload);assert.throws(()=>validateAnswer(form,{answers:{}}),/bb/);}
});

test('async forms reject expired, unknown, blank and multi-choice submissions',()=>{
 assert.throws(()=>validateAnswer({...asyncQuestion,expiresAt:Date.now()-1},{answers:{}}),/pending/);
 assert.throws(()=>validateAnswer(asyncQuestion,{answers:{unknown:{selected:[]}}}),/Unknown/);
 assert.throws(()=>validateAnswer(asyncQuestion,{answers:{'question-1':{selected:[],freeText:' '}}}),/required/);
 assert.throws(()=>validateAnswer(asyncQuestion,{answers:{'question-1':{selected:['option-1','option-2']}}}),/selection/);
 assert.throws(()=>validateAnswer(asyncQuestion,{answers:{'question-1':{selected:['B']}}}),/choice/);
});
test('answers must target a still pending interaction', () => {
  assert.throws(() => validateAnswer({...pending,status:'resolved'}, {answers:{q1:{selected:['one']}}}), /pending/);
});
test('invalid choices and multiple selections are refused', () => {
  assert.throws(() => validateAnswer(pending,{answers:{q1:{selected:['other']}}}), /choice/);
  assert.throws(() => validateAnswer(pending,{answers:{q1:{selected:['one','one']}}}), /selection/);
});
test('required questions cannot be omitted or blank', () => {
  assert.throws(() => validateAnswer(pending,{answers:{}}), /required/);
  assert.throws(() => validateAnswer(pending,{answers:{q1:{selected:[],freeText:'  '}}}), /required/);
});
test('custom text is preserved and yields a bb user_answer', () => {
  assert.deepEqual(validateAnswer(pending,{answers:{q1:{selected:[],freeText:'Своя мысль'}}}),{kind:'user_answer',answers:{q1:{selected:[],freeText:'Своя мысль'}}});
});
test('free text is refused when the question forbids it', () => {
  assert.throws(() => validateAnswer({...pending,payload:{kind:'user_question',questions:[{...question,allowFreeText:false}]}},{answers:{q1:{selected:[],freeText:'x'}}}), /free text/);
});
test('approval decisions must be explicitly offered, permission grants use bb', () => {
  const approval = {...pending,payload:{kind:'approval',availableDecisions:['deny'],subject:{kind:'command'}}};
  assert.throws(() => validateAnswer(approval,{decision:'allow_once'}), /decision/);
  assert.deepEqual(validateAnswer(approval,{decision:'deny'}),{decision:'deny'});
  assert.throws(() => validateAnswer({...approval,payload:{...approval.payload,subject:{kind:'permission_grant'}}},{decision:'deny'}), /bb/);
});
test('messages reject blanks and oversized bodies, preserve text', () => {
  assert.throws(() => validateMessage({threadId:'t1',text:' '}));
  assert.throws(() => validateMessage({threadId:'t1',text:'x'.repeat(32001)}));
  assert.deepEqual(validateMessage({threadId:'t1',text:'Привет\n$(literal)'}),{threadId:'t1',text:'Привет\n$(literal)'});
});
