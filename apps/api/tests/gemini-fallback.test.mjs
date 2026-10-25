import {test} from 'node:test';
import assert from 'node:assert/strict';
// This process is intentionally offline; never read a developer key for this suite.
delete process.env.GEMINI_API_KEY;
const {analyzeClauseWithGemini,streamChatWithGemini}=await import('../dist/services/gemini.js');
for(const title of ['Indemnity','Liability cap','General'])test(`offline ${title} explanation fails instead of completing with unassessed text`,async()=>{
  await assert.rejects(analyzeClauseWithGemini(title,'Synthetic clause with no stated liability amount.',''),/not configured/);
});
test('offline chat does not invent obligations, default terms or clause references',async()=>{
  let text='';await streamChatWithGemini([{role:'user',content:'What happens?'}],'Synthetic text',token=>text+=token);
  assert.match(text,/No AI contract assessment was performed/);
  assert.doesNotMatch(text,/immediate default|Section 2.1|obligations are binding/);
});
