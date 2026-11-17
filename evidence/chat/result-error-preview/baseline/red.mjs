// Source-grounded boundary regression. No vendor evaluation or provider execution.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { reasonChat, startTurn, applyReasonPayload } from '../../../src/features/chat/reason.ts';
import { emptyTranscript, applyChatEvents } from '../../../src/features/chat/reducer.ts';
import { buildRows } from '../../../src/features/chat/view.ts';
import { foldAgentRows } from '../../../src/features/chat/toolGroups.ts';

const cases=JSON.parse(fs.readFileSync(new URL('./cases.json',import.meta.url),'utf8'));
for(const entry of cases){
 test(entry.id,()=>{
  const before=JSON.stringify(entry);
  let state=reasonChat('source-only-chat:claude');
  let transcript=emptyTranscript(state.chatId);
  const now=new Date('2026-11-17T00:00:00.000Z');
  const apply=step=>{
    assert.ok(step,'recognized normalized boundary payload');
    state=step.state;
    const reduced=applyChatEvents(transcript,step.events);assert.ok(reduced.ok);
    transcript=reduced.transcript;
  };
  apply(startTurn(state,'Synthetic prompt.',now));
  apply(applyReasonPayload(state,{chatId:state.chatId,type:'text',text:entry.raw[0].message.content[0].text},new Date(now.getTime()+1)));
  apply(applyReasonPayload(state,{chatId:state.chatId,type:'turnEnded',end:entry.normalizedEnd},new Date(now.getTime()+2)));
  const rows=buildRows(transcript),display=foldAgentRows(rows,transcript.activeTurn);
  const previewTexts=display.flatMap(r=>r.kind==='agent'?r.items.flatMap(item=>item.kind==='part'&&item.preview&&item.part.kind==='text'?[item.part.text]:[]):[]);
  const footer=rows.find(r=>r.kind==='turn_end');
  console.log(JSON.stringify({id:entry.id,actual:{previewTexts,status:footer?.status,error:footer?.error??null},expected:entry.expected}));
  assert.equal(footer?.status,entry.expected.status);
  assert.equal(footer?.error??null,entry.expected.error);
  assert.equal(JSON.stringify(entry),before,'raw/normalized frozen inputs unchanged');
  assert.deepEqual(previewTexts,entry.expected.previewTexts,'source-grounded prior-text preview membership');
 });
}
