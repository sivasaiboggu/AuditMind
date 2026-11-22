import {test} from 'node:test';
import assert from 'node:assert/strict';
// This process is intentionally offline; never read a developer key for this suite.
delete process.env.GEMINI_API_KEY;
const {analyzeClauseWithGemini,streamChatWithGemini,buildLocalSearchReply}=await import('../dist/services/gemini.js');
for(const title of ['Indemnity','Liability cap','General'])test(`offline ${title} explanation fails instead of completing with unassessed text`,async()=>{
  await assert.rejects(analyzeClauseWithGemini(title,'Synthetic clause with no stated liability amount.',''),/not configured/);
});
test('offline chat does not invent obligations, default terms or clause references',async()=>{
  let text='';await streamChatWithGemini([{role:'user',content:'What happens?'}],'Synthetic text',token=>text+=token);
  assert.match(text,/No AI contract assessment was performed/);
  assert.doesNotMatch(text,/immediate default|Section 2.1|obligations are binding/);
});
test('local search reply is plain text: no emoji, no invented assessment, and it names the missing key',()=>{
  const context = 'Section 1 (Confidentiality): The receiving party shall keep all confidential information private.\n\nSection 2 (Liability): Liability is limited to the fees paid in the prior twelve months.';
  const reply = buildLocalSearchReply('What does the confidentiality clause say?', context, true);
  assert.match(reply, /local search mode/);
  assert.match(reply, /confidential information/);
  assert.match(reply, /GEMINI_API_KEY/);
  assert.doesNotMatch(reply, /⚠️|AI-powered|AI-powered/i);
  assert.doesNotMatch(reply, /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}]/u);
});
test('local search reply falls back to the first provisions when nothing matches',()=>{
  const context = 'Section 1 (Confidentiality): The receiving party shall keep all confidential information private.\n\nSection 2 (Liability): Liability is limited to the fees paid in the prior twelve months.';
  const reply = buildLocalSearchReply('What about the weather in Gooty?', context, false);
  assert.match(reply, /couldn't find an exact match/);
  assert.match(reply, /Confidentiality/);
  assert.doesNotMatch(reply, /⚠️/);
});
