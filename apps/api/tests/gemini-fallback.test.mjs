import {test} from 'node:test';
import assert from 'node:assert/strict';
// This process is intentionally offline; never read a developer key for this suite.
delete process.env.GEMINI_API_KEY;
const {analyzeClauseWithGemini,streamChatWithGemini}=await import('../dist/services/gemini.js');
for(const title of ['Indemnity','Liability cap','General'])test(`offline ${title} explanation invents no clause findings or redlines`,async()=>{
  const text='Synthetic clause with no stated liability amount.';
  const response=await analyzeClauseWithGemini(title,text,'');
  assert.equal(response.suggestedRedline,text);
  assert.match(response.explanation,/has not been assessed/);
  assert.doesNotMatch(response.explanation,/excessively broad|3-months|12-month|nominal amount|shielding/);
});
test('offline chat does not invent obligations, default terms or clause references',async()=>{
  let text='';await streamChatWithGemini([{role:'user',content:'What happens?'}],'Synthetic text',token=>text+=token);
  assert.match(text,/No AI contract assessment was performed/);
  assert.doesNotMatch(text,/immediate default|Section 2.1|obligations are binding/);
});
