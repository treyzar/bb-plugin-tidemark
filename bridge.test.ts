import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateAnswer, validateMessage } from './bridge.ts';

const question = { id: 'q1', prompt: 'Выбрать?', required: true, allowFreeText: true, multiSelect: false, options: [{label:'Первый',value:'one'}] };
const pending = { id:'i1', threadId:'t1', status:'pending', payload:{kind:'user_question',questions:[question]} };
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
