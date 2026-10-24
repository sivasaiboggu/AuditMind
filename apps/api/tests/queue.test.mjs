import {test} from 'node:test';
import assert from 'node:assert/strict';
import {processContract} from '../dist/services/queue.js';

function fixture({failure,empty=false,noStore=false,dbFails=false}={}){
  const effects={inserted:[],statuses:[],progress:[]};
  const store={from(table){return {
    async insert(rows){effects.inserted.push(...rows);return {error:dbFails?new Error('private-db-error'):null};},
    update(value){effects.statuses.push(value);return {async eq(){return {error:null};}}}
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
