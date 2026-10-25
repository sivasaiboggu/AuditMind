import {test} from 'node:test';import assert from 'node:assert/strict';
import ts from 'typescript';import fs from 'node:fs';import vm from 'node:vm';
const source=fs.readFileSync(new URL('../../web/src/lib/chat-stream.ts',import.meta.url),'utf8');
const context={exports:{}};vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,context);
const {interruptChat,chatHistory}=context.exports;
const row=(id,sender,message)=>({id,sender,message,sessionId:'synthetic',createdAt:'2026-10-25'});
for(const partial of ['', 'The liability cap is'])test(`interrupt ${partial?'partial':'empty'} answer preserves question and other history`,()=>{
 const messages=[row('old','assistant','Prior complete answer'),row('user','user','Latest question'),row('answer','assistant',partial),row('other','user','Unrelated update')];
 const result=interruptChat(messages,'answer');
 assert.equal(result.length,4);assert.equal(result[1].message,'Latest question');assert.equal(result[3].message,'Unrelated update');
 assert.match(result[2].message,/Incomplete answer/);assert.doesNotMatch(result[2].message,/liability cap/);assert.equal(messages[2].message,partial);
 const history=chatHistory(result);assert.equal(history.length,3);assert.ok(!history.some(item=>item.content.includes('Incomplete answer')));
});
test('complete and actual user messages remain in next request, empty placeholder does not',()=>{
 const result=chatHistory([row('u','user','Question'),row('a','assistant','Complete answer'),row('empty','assistant','')]);
 assert.equal(result.length,2);assert.equal(result[0].role,'user');assert.equal(result[1].role,'model');
});
