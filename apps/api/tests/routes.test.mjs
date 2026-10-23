import { test } from 'node:test';
import assert from 'node:assert/strict';
import WebSocket from 'ws';
import { once } from 'node:events';
import { buildApp } from '../dist/app.js';

function isolatedStore({storageFails = false} = {}) {
  const rows = [
    { id: 'contract-a', user_id: 'user-a', name: 'Synthetic A', file_path: 'a.txt', status: 'completed' },
    { id: 'contract-b', user_id: 'user-b', name: 'Synthetic B', file_path: 'b.txt', status: 'completed' },
  ];
  const effects = { removed: [], deleted: [], queued: [], chats: 0 };
  const store = {
    auth: { async getUser(token) {
      return { data: { user: ['user-a','user-b'].includes(token) ? { id: token } : null }, error: null };
    } },
    storage: { from() { return { async remove(paths) { effects.removed.push(...paths); return { error: storageFails ? new Error('private-storage-detail') : null }; } }; } },
    from(table) {
      const filters = {}; let deleting = false;
      const query = {
        select() { return this; }, eq(k,v) { filters[k]=v; return this; },
        delete() { deleting=true; return this; }, order() { return this; },
        async maybeSingle() { return { data: rows.find(r=>Object.entries(filters).every(([k,v])=>r[k]===v)) || null, error:null }; },
        single() { return this.maybeSingle(); },
        then(resolve,reject) {
          let data = table === 'contracts' ? rows.filter(r=>Object.entries(filters).every(([k,v])=>r[k]===v)) : [];
          if(deleting) effects.deleted.push(...data.map(r=>r.id));
          if(table==='clauses') data=[{id:'clause',contract_id:filters.contract_id,text:'Synthetic contract text'}];
          return Promise.resolve({data,error:null}).then(resolve,reject);
        }
      }; return query;
    }
  };
  return { store, effects };
}
async function fixture(options) {
  const {store,effects}=isolatedStore(options);
  const app=await buildApp({store,initialize:async()=>{},enqueue:async(...args)=>effects.queued.push(args),streamChat:async()=>{effects.chats++;}});
  return {app,effects};
}
const headers=user=>({authorization:`Bearer ${user}`});

test('real list and clause routes deny missing tokens and isolate two users',async()=>{
  const {app}=await fixture();
  try {
    assert.equal((await app.inject({url:'/contracts'})).statusCode,401);
    const list=await app.inject({url:'/contracts?userId=user-b',headers:headers('user-a')});
    assert.equal(list.statusCode,200);assert.deepEqual(list.json().map(r=>r.id),['contract-a']);
    for(const user of ['user-a','user-b']) {
      const other=user==='user-a'?'b':'a',own=user==='user-a'?'a':'b';
      assert.equal((await app.inject({url:`/contracts/contract-${other}/clauses`,headers:headers(user)})).statusCode,404);
      assert.equal((await app.inject({url:`/contracts/contract-${own}/clauses`,headers:headers(user)})).statusCode,200);
    }
  } finally {await app.close();}
});

test('real delete route does not touch another owner storage or rows',async()=>{
  const {app,effects}=await fixture();
  try {
    assert.equal((await app.inject({method:'DELETE',url:'/contracts/contract-b',headers:headers('user-a')})).statusCode,404);
    assert.deepEqual(effects.removed,[]);assert.deepEqual(effects.deleted,[]);
    assert.equal((await app.inject({method:'DELETE',url:'/contracts/contract-a',headers:headers('user-a')})).statusCode,200);
    assert.deepEqual(effects.removed,['a.txt']);assert.deepEqual(effects.deleted,['contract-a']);
  } finally {await app.close();}
});

test('real upload route authenticates before accepting a body or dispatching work',async()=>{
  const {app,effects}=await fixture();
  try {
    assert.equal((await app.inject({method:'POST',url:'/contracts/upload',payload:'synthetic'})).statusCode,401);
    assert.deepEqual(effects.queued,[]);
  } finally {await app.close();}
});

test('real WebSocket rejects cross-owner subscription before leaking progress/chat',async()=>{
  const {app,effects}=await fixture();
  let ws;
  try {
    await app.listen({port:0,host:'127.0.0.1'});
    ws=new WebSocket(`ws://127.0.0.1:${app.server.address().port}/ws`);
    await once(ws,'open');
    const message=once(ws,'message'),closed=once(ws,'close');
    ws.send(JSON.stringify({type:'chat',accessToken:'user-a',contractId:'contract-b',messages:[]}));
    const [data]=await message;assert.equal(JSON.parse(data.toString()).type,'error');
    const [code]=await closed;assert.equal(code,1008);assert.equal(effects.chats,0);
  } finally {ws?.terminate();await app.close();}
});

test('real WebSocket admits the owner and serves completed status',async()=>{
  const {app,effects}=await fixture();let ws;
  try {
    await app.listen({port:0,host:'127.0.0.1'});
    ws=new WebSocket(`ws://127.0.0.1:${app.server.address().port}/ws`);
    await once(ws,'open');
    const frames=[];
    const done=new Promise((resolve,reject)=>{
      ws.on('message',raw=>{const frame=JSON.parse(raw.toString());frames.push(frame);if(frame.type==='progress')resolve();});
      ws.on('error',reject);
    });
    ws.send(JSON.stringify({type:'subscribe',accessToken:'user-a',contractId:'contract-a'}));await done;
    assert.equal(frames[0].type,'subscribed');assert.equal(frames[1].data.stage,'completed');
    assert.equal(effects.chats,0);
  } finally {ws?.terminate();await app.close();}
});


test('browser preflight is accepted but protected requests still need a token',async()=>{
  const {app}=await fixture();
  try {
    const response=await app.inject({method:'OPTIONS',url:'/contracts',headers:{origin:'http://localhost:5173','access-control-request-method':'GET','access-control-request-headers':'authorization'}});
    assert.equal(response.statusCode,204);
    assert.equal(response.headers['access-control-allow-origin'],'http://localhost:5173');
    assert.equal((await app.inject({url:'/contracts',headers:{origin:'http://localhost:5173'}})).statusCode,401);
    const denied=await app.inject({method:'OPTIONS',url:'/contracts',headers:{origin:'https://untrusted.invalid','access-control-request-method':'GET'}});
    assert.equal(denied.headers['access-control-allow-origin'],undefined);
  } finally {await app.close();}
});

test('storage deletion failure preserves database record and hides provider details',async()=>{
  const {app,effects}=await fixture({storageFails:true});
  try {
    const response=await app.inject({method:'DELETE',url:'/contracts/contract-a',headers:headers('user-a')});
    assert.equal(response.statusCode,500);
    assert.deepEqual(effects.deleted,[]);
    assert.doesNotMatch(response.body,/private-storage-detail/);
  } finally {await app.close();}
});

test('health reports configured state without pretending it probed connectivity',async()=>{
  const {app}=await fixture();
  try {assert.match((await app.inject({url:'/health'})).json().database,/not checked/);}
  finally {await app.close();}
});
