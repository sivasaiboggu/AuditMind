import {test} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';import ts from 'typescript';import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
function store(){const context={exports:{},require};vm.runInNewContext(ts.transpileModule(fs.readFileSync(new URL('../../web/src/store/contractStore.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,context);return context.exports.useContractStore;}
test('switching contracts clears clauses, chat, report, session and progress',()=>{
 const s=store();s.setState({activeContract:{id:'a'},activeClauses:[{id:'a-clause'}],chatMessages:[{message:'private-a'}],activeReport:{id:'a'},activeSessionId:'a',progress:{stage:'completed'}});
 s.getState().setActiveContract({id:'b'});const state=s.getState();assert.equal(state.activeContract.id,'b');assert.equal(state.activeClauses.length,0);assert.equal(state.chatMessages.length,0);assert.equal(state.activeReport,null);assert.equal(state.activeSessionId,null);assert.equal(state.progress,null);
});
test('refreshing same contract metadata preserves its context',()=>{const s=store();s.setState({activeContract:{id:'a'},chatMessages:[{message:'keep'}]});s.getState().setActiveContract({id:'a',name:'updated'});assert.equal(s.getState().chatMessages[0].message,'keep');});
test('clearing contract clears private chat context',()=>{const s=store();s.setState({activeContract:{id:'a'},chatMessages:[{message:'private'}]});s.getState().setActiveContract(null);assert.equal(s.getState().chatMessages.length,0);});
function routeEffect(fetch,ownerCurrent=()=>true){
 const source=fs.readFileSync(new URL('../../web/src/pages/contract-view.tsx',import.meta.url),'utf8');
 const start=source.indexOf('  useEffect(() => {',source.indexOf('// Scope each load'));
 const end=source.indexOf('\n\n  // 2. Configure',start);let effect;const calls=[];
 const context={user:{id:'owner'},workspaceGuard:()=>ownerCurrent,useEffect:fn=>effect=fn,id:'a',useContractStore:{getState:()=>({contracts:[{id:'a'}]})},authenticatedFetch:fetch,API_URL:'synthetic',console:{error(){}},navigate:x=>calls.push(['navigate',x])};
 for(const name of ['setClausesLoading','setLoadError','setSelectedClause','setChatInput','setIsChatGenerating','setWsConnected','setCopiedId','setActiveTab','setActiveContract','setActiveClauses','setContracts'])context[name]=value=>calls.push([name,value]);
 vm.runInNewContext(ts.transpileModule(source.slice(start,end),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,context);return {cleanup:effect(),calls};
}
const tick=()=>new Promise(resolve=>setImmediate(resolve));
test('late clause response after route cleanup cannot update selected context',async()=>{
 let resolve;const response=new Promise(r=>resolve=r);const {cleanup,calls}=routeEffect(()=>response);cleanup();const count=calls.length;
 resolve({ok:true,json:async()=>[{id:'private-a'}]});await tick();await tick();assert.equal(calls.length,count);
});
test('cleanup during JSON parsing also blocks late context writes',async()=>{
 let resolve;const json=new Promise(r=>resolve=r);const {cleanup,calls}=routeEffect(async()=>({ok:true,json:()=>json}));await tick();cleanup();const count=calls.length;
 resolve([{id:'private-a'}]);await tick();assert.equal(calls.length,count);
});
test('current empty clause response resets selection instead of retaining stale clause',async()=>{
 const {calls}=routeEffect(async()=>({ok:true,json:async()=>[]}));await tick();assert.ok(calls.some(([name,value])=>name==='setSelectedClause' && value===null));assert.deepEqual(calls.at(-1),['setClausesLoading',false]);
});
test('account switch clears all private workspace data',()=>{
 const s=store();s.setState({user:{id:'a'},contracts:[{id:'private'}],activeContract:{id:'a'},chatMessages:[{message:'private'}],activeClauses:[{id:'private'}],isAnalyzing:true});
 s.getState().setUser({id:'b'});assert.equal(s.getState().contracts.length,0);assert.equal(s.getState().chatMessages.length,0);assert.equal(s.getState().activeClauses.length,0);assert.equal(s.getState().activeContract,null);assert.equal(s.getState().isAnalyzing,false);
});
test('same-owner profile refresh preserves workspace and explicit logout clears it',()=>{
 const s=store();s.setState({user:{id:'a'},contracts:[{id:'keep'}],chatMessages:[{message:'keep'}]});s.getState().setUser({id:'a',name:'Updated'});assert.equal(s.getState().contracts.length,1);s.getState().resetWorkspace();assert.equal(s.getState().contracts.length,0);assert.equal(s.getState().user,null);
});

test('pending same-route clause load cannot write after account changes before effect cleanup',async()=>{
 let resolve;let owner=true;const json=new Promise(r=>resolve=r);const {calls}=routeEffect(async()=>({ok:true,json:()=>json}),()=>owner);await tick();owner=false;const count=calls.length;resolve([{id:'private'}]);await tick();assert.equal(calls.length,count);
});
test('workspace epochs invalidate A to B to A and logout to same account',()=>{
 const s=store();s.getState().setUser({id:'a'});const first=s.getState().workspaceEpoch;s.getState().setUser({id:'b'});s.getState().setUser({id:'a'});assert.ok(s.getState().workspaceEpoch>first);const second=s.getState().workspaceEpoch;s.getState().resetWorkspace();s.getState().setUser({id:'a'});assert.ok(s.getState().workspaceEpoch>second);
});
test('same account profile refresh does not invalidate pending work',()=>{
 const s=store();s.getState().setUser({id:'a'});const epoch=s.getState().workspaceEpoch;s.getState().setUser({id:'a',name:'Updated'});assert.equal(s.getState().workspaceEpoch,epoch);
});
