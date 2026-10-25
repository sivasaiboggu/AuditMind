import {test} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';import ts from 'typescript';
const source=fs.readFileSync(new URL('../../web/src/lib/auth-context.tsx',import.meta.url),'utf8');
const tick=()=>new Promise(r=>setImmediate(r));
function fixture(configured=true){
 let effect,event,resolveSession;const profiles=new Map();const changes=[],states=[];let resets=0;
 const react={createContext:()=>({Provider:'provider'}),useContext:()=>{},useState:initial=>[initial,value=>states.push(value)],useRef:value=>({current:value}),useEffect:fn=>effect=fn,createElement:(_t,props)=>props};
 const workspace={setUser:u=>changes.push(u),resetWorkspace:()=>resets++};
 const supabase=configured?{auth:{getSession:()=>new Promise(r=>resolveSession=r),onAuthStateChange:fn=>{event=fn;return {data:{subscription:{unsubscribe(){}}}}},signOut:async()=>{}},from:()=>({select(){return this},eq(_k,id){this.id=id;return this},single(){return new Promise(resolve=>profiles.set(this.id,resolve))}})}:null;
 const context={exports:{},require:name=>name==='react'?react:name==='./supabase'?{supabase}:{useContractStore:{getState:()=>workspace}},localStorage:{getItem:()=>'{"id":"demo","email":"demo@example.invalid"}',removeItem(){},setItem(){}},console};
 vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React,esModuleInterop:true}}).outputText,context);
 const api=context.exports.AuthProvider({children:null}).value;const cleanup=effect();return {api,event:(user)=>event('SIGNED_IN',user?{user}:null),resolveSession:s=>resolveSession({data:{session:s}}),profiles,changes,states,resets:()=>resets,cleanup};
}
test('sign-out invalidates pending profile and ignores demo storage with configured auth',async()=>{
 const f=fixture();f.event({id:'a',email:'a@example.invalid'});f.event(null);f.profiles.get('a')({data:{full_name:'Stale'}});f.resolveSession({user:{id:'a'}});await tick();
 assert.equal(f.changes.at(-1),null);assert.ok(!f.changes.some(u=>u?.fullName==='Stale'));assert.ok(!f.changes.some(u=>u?.id==='demo'));
});
test('account switch rejects old profile and preserves current account',async()=>{
 const f=fixture();f.event({id:'a'});f.event({id:'b'});f.profiles.get('b')({data:{full_name:'B'}});f.profiles.get('a')({data:{full_name:'A'}});await tick();assert.equal(f.changes.at(-1).id,'b');assert.equal(f.changes.at(-1).fullName,'B');
});
test('logout clears workspace before remote signout and late profile cannot restore it',async()=>{
 const f=fixture();f.event({id:'a'});await f.api.logout();f.profiles.get('a')({data:{full_name:'A'}});await tick();assert.equal(f.resets(),1);assert.ok(!f.changes.some(u=>u?.fullName==='A'));
});
test('configured auth rejects local demo bypass',async()=>{const f=fixture();await assert.rejects(f.api.loginBypass('fake@example.invalid'),/Demo login is unavailable/);assert.equal(f.changes.length,0);});
