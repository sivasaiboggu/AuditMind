import {test} from 'node:test';
import assert from 'node:assert/strict';
delete process.env.GEMINI_API_KEY;
const {getEmbedding,retrieveRegulations}=await import('../dist/services/rag.js');
function fixture({embedding=null,vectorError=false,keywordError=false,vectorRows=[],keywordRows=[]}={}){
  const effects={vectors:0,keywords:0,terms:''};
  return {effects,deps:{embed:async()=>embedding,store:{
    async rpc(){effects.vectors++;return {data:vectorRows,error:vectorError?new Error('private-vector-error'):null};},
    from(){return {select(){return this;},textSearch(_column,terms){effects.terms=terms;return this;},async limit(){effects.keywords++;return {data:keywordRows,error:keywordError?new Error('private-keyword-error'):null};}};}
  }}};
}
test('offline embedding is unavailable rather than a fake zero vector',async()=>assert.equal(await getEmbedding('Synthetic'),null));
test('no corpus does not invent UCC, GDPR or indemnity authority',async()=>{
  const text=await retrieveRegulations('indemnity',{store:null,embed:async()=>null});
  assert.match(text,/No verified regulatory context/);assert.doesNotMatch(text,/UCC|GDPR|Commercial Contract Law/);
});
test('missing embedding skips vector query and retrieves real keyword corpus',async()=>{
  const {effects,deps}=fixture({keywordRows:[{title:'Synthetic corpus',content:'Synthetic excerpt'}]});
  const text=await retrieveRegulations('liability & | arbitrary:*',deps);
  assert.equal(effects.vectors,0);assert.equal(effects.keywords,1);assert.equal(effects.terms,'liability | arbitrary');
  assert.match(text,/Applicability and currency have not been verified/);assert.match(text,/Synthetic excerpt/);
});
test('vector error can use corpus keyword fallback without invented source',async()=>{
  const {effects,deps}=fixture({embedding:[1],vectorError:true,keywordRows:[{title:'Synthetic',content:'Synthetic'}]});
  assert.match(await retrieveRegulations('liability',deps),/SOURCE: Synthetic/);assert.equal(effects.keywords,1);
});
test('both retrieval failures report absence and never expose provider error',async()=>{
  const {deps}=fixture({embedding:[1],vectorError:true,keywordError:true});
  const text=await retrieveRegulations('liability',deps);assert.match(text,/No verified/);assert.doesNotMatch(text,/private-|UCC|GDPR/);
});
test('malformed corpus rows are not rendered as authority',async()=>{
  const {deps}=fixture({embedding:[1],vectorRows:[{title:null,content:42}]});
  assert.match(await retrieveRegulations('liability',deps),/No verified/);
});
