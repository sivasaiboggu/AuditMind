import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const source=name=>fs.readFileSync(new URL(`../../web/src/${name}`,import.meta.url),'utf8');
const tick=()=>new Promise(r=>setImmediate(r));
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
const run=(code,context)=>vm.runInNewContext(ts.transpileModule(code,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,context);
function dashboard(){
 let effect,alive=true,listener;const requests=[],writes=[],notifications=[];
 const context={refreshVersion:0,user:{id:'a'},workspaceGuard:()=>()=>alive,useRef:value=>({current:value}),useEffect:fn=>effect=fn,setNotification:x=>notifications.push(x),setContracts:x=>writes.push(x),API_URL:'synthetic',authenticatedFetch:()=>{const d=deferred();requests.push(d);return d.promise;},supabase:{channel:()=>({on(_t,_filter,fn){listener=fn;return this;},subscribe(){return this;}}),removeChannel(){}}};
 const text=source('pages/dashboard.tsx');run(text.slice(text.indexOf('  const listRead'),text.indexOf('  // Compute stats')),context);
 return {requests,writes,notifications,cleanup:effect(),invalidate:()=>alive=false,refresh:()=>listener({eventType:'DELETE',new:{}})};
}
test('dashboard rejects old refresh responses even when older JSON resolves last',async()=>{
 const f=dashboard();const json=deferred();f.requests[0].resolve({ok:true,json:()=>json.promise});await tick();f.refresh();f.requests[1].resolve({ok:true,json:async()=>[{id:'new'}]});await tick();json.resolve([{id:'stale'}]);await tick();assert.equal(f.writes.length,1);assert.equal(f.writes[0][0].id,'new');
});
for(const cleanup of [false,true])test(`dashboard ignores pending owner data after ${cleanup?'cleanup':'account epoch change'}`,async()=>{
 const f=dashboard();if(cleanup)f.cleanup();else f.invalidate();f.requests[0].resolve({ok:true,json:async()=>[{id:'private'}]});await tick();assert.equal(f.writes.length,0);
});
test('dashboard stale errors do not show notifications for new owner',async()=>{
 const f=dashboard();f.invalidate();f.requests[0].resolve({ok:false});await tick();assert.deepEqual(f.notifications,[null]);
});
function upload(){
 let effect,alive=true,request;let timer;const writes=[],sockets=[];const refs=[];
 class Socket {constructor(){sockets.push(this);}close(){this.closed=true;this.onclose?.();}}
 const context={useContractStore:{getState:()=>({isAnalyzing:false})},user:{id:'a'},isAnalyzing:false,workspaceGuard:()=>()=>alive,useRef:value=>{const ref={current:value};refs.push(ref);return ref;},useEffect:fn=>effect=fn,wsRef:{current:null},setError:x=>writes.push(['error',x]),setIsAnalyzing:x=>writes.push(['analyzing',x]),setProgress:x=>writes.push(['progress',x]),setActiveContract:x=>writes.push(['contract',x]),setIsDragOver(){},navigate:x=>writes.push(['navigate',x]),setInterval:fn=>{timer=fn;return 1;},clearInterval(){timer=null;},AbortController,FormData:class{append(){}},WebSocket:Socket,sendAuthenticated:async()=>{},authenticatedFetch:()=>{request=deferred();return request.promise;},API_URL:'synthetic',WS_URL:'synthetic',console:{log(){},error(){}}};
 const text=source('pages/upload.tsx');const start=text.indexOf('  const acceptanceUnknown');const before=text.indexOf('  const handleDragOver',start);const uploadStart=text.indexOf('  const handleUploadFile');const uploadEnd=text.indexOf('\n  const handleDrop',uploadStart);
 run(text.slice(start,before)+text.slice(uploadStart,uploadEnd)+'\nglobalThis.upload=handleUploadFile;',context);const cleanup=effect();
 return {start:()=>context.upload({name:'synthetic.txt',size:10}),request:()=>request,writes,sockets,cleanup,invalidate:()=>alive=false,timer:()=>timer?.()};
}
test('upload response cannot restore contract or open socket after unmount',async()=>{
 const f=upload();const pending=f.start();f.cleanup();const count=f.writes.length;f.request().resolve({ok:true,json:async()=>({id:'a'})});await pending;assert.equal(f.writes.length,count);assert.equal(f.sockets.length,0);
});
test('upload JSON and timers reject changed account before effect cleanup',async()=>{
 const f=upload();const json=deferred();const pending=f.start();f.request().resolve({ok:true,json:()=>json.promise});await tick();f.invalidate();const count=f.writes.length;f.timer();json.resolve({id:'private'});await pending;assert.equal(f.writes.length,count);assert.equal(f.sockets.length,0);
});
test('upload socket progress must match accepted contract and unexpected close ends pending UI',async()=>{
 const f=upload();const pending=f.start();f.request().resolve({ok:true,json:async()=>({id:'a'})});await pending;const socket=f.sockets[0];const count=f.writes.length;socket.onmessage({data:JSON.stringify({type:'progress',data:{contractId:'other',stage:'completed'}})});assert.equal(f.writes.length,count);socket.close();assert.match(f.writes.at(-1)[1],/dashboard before uploading again/);
});
test('old upload socket cannot write or navigate after account switch',async()=>{
 const f=upload();const pending=f.start();f.request().resolve({ok:true,json:async()=>({id:'a'})});await pending;f.invalidate();const count=f.writes.length;f.sockets[0].onmessage({data:JSON.stringify({type:'progress',data:{contractId:'a',stage:'completed'}})});f.sockets[0].close();assert.equal(f.writes.length,count);
});
for(const method of ['authenticatedFetch','sendAuthenticated'])test(`${method} does not send credentials after account changes during token lookup`,async()=>{
 const session=deferred();let alive=true,sends=0;const context={exports:{},require:name=>name==='./supabase'?{supabase:{auth:{getSession:()=>session.promise}}}:{workspaceGuard:()=>()=>alive},Headers,fetch:()=>{sends++;},WebSocket:{OPEN:1}};
 vm.runInNewContext(ts.transpileModule(source('lib/api.ts'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,context);
 const promise=method==='authenticatedFetch'?context.exports[method]('synthetic'):context.exports[method]({readyState:1,send(){sends++;}},{type:'chat'});alive=false;session.resolve({data:{session:{access_token:'synthetic-token'}}});await assert.rejects(promise,/Account changed/);assert.equal(sends,0);
});


test('ambiguous upload response preserves recovery reference and blocks another request',async()=>{
 const f=upload();const pending=f.start();f.request().resolve({ok:false,status:503,json:async()=>({code:'QUEUE_ACCEPTANCE_UNKNOWN',contractId:'recovery-id',error:'Queue acceptance unknown.'})});await pending;
 assert.match(f.writes.at(-1)[1],/recovery-id.*Acceptance is uncertain.*Do not upload again/);const request=f.request();await f.start();assert.equal(f.request(),request);assert.equal(f.sockets.length,0);
});
test('definite upload rejection leaves retry possible without implying accepted work',async()=>{
 const f=upload();const pending=f.start();f.request().resolve({ok:false,status:415,json:async()=>({error:'Unsupported type'})});await pending;assert.doesNotMatch(f.writes.at(-1)[1],/Acceptance is uncertain/);
});
test('authentication failure before fetch is marked definitely not sent',async()=>{
 let sent=false;const context={exports:{},require:name=>name==='./supabase'?{supabase:null}:{workspaceGuard:()=>()=>true},Headers,fetch:()=>{sent=true;}};
 vm.runInNewContext(ts.transpileModule(source('lib/api.ts'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,context);
 await assert.rejects(context.exports.authenticatedFetch('synthetic'),error=>error.requestNotSent===true);assert.equal(sent,false);
});
