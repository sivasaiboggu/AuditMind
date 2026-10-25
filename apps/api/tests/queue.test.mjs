import {test} from 'node:test';
import assert from 'node:assert/strict';
import {processContract} from '../dist/services/queue.js';

function fixture({failure,empty=false,noStore=false,dbFails=false}={}){
  const effects={inserted:[],statuses:[],progress:[]};
  const store={async rpc(name,args){assert.equal(name,'commit_contract_analysis');if(dbFails)return {error:new Error('private-db-error')};effects.inserted.push(...args.p_clauses);effects.statuses.push({status:'completed',overall_risk_score:args.p_overall_score});return {error:null};},from(table){return {
    async insert(rows){effects.inserted.push(...rows);return {error:dbFails?new Error('private-db-error'):null};},
    update(value){effects.statuses.push(value);return {eq(){return this;},then(resolve,reject){return Promise.resolve({error:null}).then(resolve,reject);}}}
  };}};
  const deps={store:noStore?null:store,
    extract:async()=> 'Synthetic contract',
    segment:()=>empty?[]:[{number:1,title:'Synthetic',text:'Synthetic clause'}],
    validate:async()=>({isContract:true}),
    classify:async()=>{if(failure==='classify')throw new Error('private-provider-error');return {label:'high'};},
    score:async()=>42,retrieve:async()=>'',
    analyze:async()=>{if(failure==='analyze')throw new Error('private-provider-error');return {explanation:'Synthetic review',suggestedRedline:''};},
    progress:(...event)=>effects.progress.push(event)
  };
  return {effects,deps};
}

for(const failure of ['classify','analyze'])test(`${failure} failure must not become low-risk success`,async()=>{
  const {effects,deps}=fixture({failure});
  await processContract('synthetic','synthetic.txt','text/plain',Buffer.from('test'),deps);
  assert.deepEqual(effects.inserted,[]);assert.deepEqual(effects.statuses,[{status:'failed'}]);
  assert.equal(effects.progress.at(-1)[1],'failed');
  assert.doesNotMatch(JSON.stringify(effects.progress),/private-provider-error/);
  assert.ok(!effects.progress.some(event=>event[1]==='completed'));
});

for(const options of [{empty:true},{noStore:true},{dbFails:true}])test(`cannot complete an incomplete pipeline ${JSON.stringify(options)}`,async()=>{
  const {effects,deps}=fixture(options);
  await processContract('synthetic','synthetic.txt','text/plain',Buffer.from('test'),deps);
  assert.equal(effects.progress.at(-1)[1],'failed');
  assert.ok(!effects.statuses.some(value=>value.status==='completed'));
  assert.doesNotMatch(JSON.stringify(effects.progress),/private-db-error/);
});

test('successful synthetic pipeline persists actual scores before reporting completion',async()=>{
  const {effects,deps}=fixture();
  await processContract('synthetic','synthetic.txt','text/plain',Buffer.from('test'),deps);
  assert.equal(effects.inserted[0].risk_level,'high');assert.equal(effects.inserted[0].risk_score,42);
  assert.deepEqual(effects.statuses,[{status:'completed',overall_risk_score:42}]);
  assert.equal(effects.progress.at(-1)[1],'completed');
});

for(const score of [NaN,Infinity,-1,101,'42',null])test(`invalid risk score ${String(score)} cannot persist completed output`,async()=>{
 const {effects,deps}=fixture();deps.score=async()=>score;
 await processContract('synthetic','synthetic.txt','text/plain',Buffer.from('test'),deps);
 assert.deepEqual(effects.inserted,[]);assert.deepEqual(effects.statuses,[{status:'failed'}]);assert.equal(effects.progress.at(-1)[1],'failed');
});
for(const classification of [null,{}, {label:'safe'},{label:'HIGH'}])test(`invalid classification ${JSON.stringify(classification)} cannot persist`,async()=>{
 const {effects,deps}=fixture();deps.classify=async()=>classification;
 await processContract('synthetic','synthetic.txt','text/plain',Buffer.from('test'),deps);
 assert.deepEqual(effects.inserted,[]);assert.equal(effects.progress.at(-1)[1],'failed');
});
for(const analysis of [null,{}, {explanation:'',suggestedRedline:''},{explanation:'Review',suggestedRedline:null}])test(`invalid explanation ${JSON.stringify(analysis)} cannot complete`,async()=>{
 const {effects,deps}=fixture();deps.analyze=async()=>analysis;
 await processContract('synthetic','synthetic.txt','text/plain',Buffer.from('test'),deps);
 assert.deepEqual(effects.inserted,[]);assert.equal(effects.progress.at(-1)[1],'failed');
});
test('actual zero priority score is valid and remains zero',async()=>{
 const {effects,deps}=fixture();deps.score=async()=>0;
 await processContract('synthetic','synthetic.txt','text/plain',Buffer.from('test'),deps);
 assert.equal(effects.inserted[0].risk_score,0);assert.deepEqual(effects.statuses,[{status:'completed',overall_risk_score:0}]);
});


test('one failed clause waits for active siblings and does not start later provider batches',async()=>{
 const {effects,deps}=fixture();let release,entered;let calls=0;
 const started=new Promise(r=>entered=r);const pending=new Promise(r=>release=r);
 deps.segment=()=>Array.from({length:7},(_,i)=>({number:i+1,title:`Synthetic ${i}`,text:`Synthetic ${i}`}));
 deps.classify=async text=>{calls++;if(text==='Synthetic 0')throw new Error('synthetic failure');if(text==='Synthetic 1'){entered();await pending;}return {label:'high'};};
 const work=processContract('synthetic','synthetic.txt','text/plain',Buffer.from('test'),deps);await started;assert.ok(!effects.progress.some(event=>event[1]==='failed'));release();await work;assert.equal(calls,4);assert.equal(effects.progress.at(-1)[1],'failed');assert.equal(effects.inserted.length,0);
});
test('failure status update is conditional on processing and cannot downgrade completed jobs',async()=>{
 const {deps}=fixture();const filters=[];deps.classify=async()=>{throw new Error('synthetic');};deps.store.from=()=>({update(){return this;},eq(key,value){filters.push([key,value]);return this;},then(resolve,reject){return Promise.resolve({error:null}).then(resolve,reject);}});
 await processContract('synthetic','synthetic.txt','text/plain',Buffer.from('test'),deps);assert.deepEqual(filters,[['id','synthetic'],['status','processing']]);
});


test('ambiguous RPC commit stays for reconciliation instead of forcing failed status',async()=>{
 const {effects,deps}=fixture();deps.store.rpc=async()=>{throw new Error('connection lost after commit');};
 await processContract('synthetic','synthetic.txt','text/plain',Buffer.from('test'),deps);
 assert.deepEqual(effects.statuses,[]);assert.match(effects.progress.at(-1)[3],/may already have committed/);
});

const {runDurableJob}=await import('../dist/services/queue.js');
test('durable worker downloads original storage bytes and passes fenced lease to processor',async()=>{
 const calls=[];const store={rpc:async name=>{assert.equal(name,'claim_contract_job');return {data:[{contract_id:'synthetic',file_path:'synthetic.txt',mime_type:'text/plain',lease_token:'synthetic-lease'}],error:null};},storage:{from:()=>({download:async()=>({data:new Blob(['Synthetic original bytes']),error:null})})}};
 assert.equal(await runDurableJob(store,async(...args)=>calls.push(args)),true);
 assert.equal(calls[0][3].toString(),'Synthetic original bytes');assert.equal(calls[0][5],'synthetic-lease');
});
test('durable worker leaves transient download failure recoverable after lease expiry',async()=>{
 let processed=false;const store={rpc:async()=>({data:[{contract_id:'synthetic'}],error:null}),storage:{from:()=>({download:async()=>({data:null,error:new Error('unavailable')})})}};
 assert.equal(await runDurableJob(store,async()=>{processed=true;}),true);assert.equal(processed,false);
});
test('empty durable poll does not download or process',async()=>{
 assert.equal(await runDurableJob({rpc:async()=>({data:[],error:null})}),false);
});
test('fenced processor uses job commit and job failure rather than unfenced writes',async()=>{
 const {deps,effects}=fixture();const calls=[];deps.store.rpc=async(name,args)=>{calls.push([name,args]);return {error:null};};
 await processContract('synthetic','synthetic.txt','text/plain',Buffer.from('test'),deps,'lease-a');assert.equal(calls[0][0],'complete_contract_job');assert.equal(calls[0][1].p_lease_token,'lease-a');
 deps.classify=async()=>{throw new Error('synthetic');};calls.length=0;await processContract('synthetic','synthetic.txt','text/plain',Buffer.from('test'),deps,'lease-b');assert.equal(calls[0][0],'fail_contract_job');assert.equal(calls[0][1].p_lease_token,'lease-b');assert.deepEqual(effects.statuses,[]);
});
