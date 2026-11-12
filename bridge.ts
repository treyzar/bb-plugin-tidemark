import { z } from 'zod';
const answerSchema=z.object({selected:z.array(z.string()).max(100),freeText:z.string().max(32000).optional()}).strict();
const requestSchema=z.object({answers:z.record(z.string(),answerSchema).optional(),decision:z.enum(['allow_once','deny']).optional()}).strict();
export const targetSchema=z.object({threadId:z.string().min(1).max(200),interactionId:z.string().min(1).max(200)});
const messageSchema=z.object({threadId:z.string().min(1).max(200),text:z.string().min(1).max(32000).refine(s=>s.trim().length>0)}).strict();
export function validateMessage(input:unknown){return messageSchema.parse(input);}
type Question={id:string;required:boolean;allowFreeText:boolean;multiSelect:boolean;options?:{value:string}[]};
type Interaction={status:string;expiresAt?:number|null;payload:{kind:string;questions?:Question[];availableDecisions?:string[];subject?:{kind:string}}};
export function validateAnswer(interaction:Interaction,input:unknown){
 if(interaction.status!=='pending'||(interaction.expiresAt!=null&&interaction.expiresAt<=Date.now()))throw new Error('Interaction is no longer pending');
 const body=requestSchema.parse(input),p=interaction.payload;
 if(p.kind==='approval'){
  if(p.subject?.kind==='permission_grant')throw new Error('Open permission grants in bb');
  if(!body.decision||!p.availableDecisions?.includes(body.decision)||body.answers)throw new Error('Invalid approval decision');
  return body.decision==='deny'?{decision:'deny' as const}:{decision:'allow_once' as const,grantedPermissions:null};
 }
 if(p.kind!=='user_question'||!p.questions||body.decision)throw new Error('Open this interaction in bb');
 const answers=body.answers??{};
 if(Object.keys(answers).some(id=>!p.questions!.some(q=>q.id===id)))throw new Error('Unknown question');
 for(const q of p.questions){
  const a=answers[q.id];
  if(!a){if(q.required)throw new Error('Answer required');continue;}
  if(new Set(a.selected).size!==a.selected.length||(!q.multiSelect&&a.selected.length>1))throw new Error('Invalid selection');
  if(a.selected.some(v=>!q.options?.some(o=>o.value===v)))throw new Error('Invalid choice');
  if(a.freeText?.trim()&&!q.allowFreeText)throw new Error('Question does not allow free text');
  if(q.required&&a.selected.length===0&&!a.freeText?.trim())throw new Error('Answer required');
 }
 return {kind:'user_answer' as const,answers};
}
