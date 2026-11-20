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

test('near-identical vector excerpts are returned once, not as two sources',async()=>{
  const {deps}=fixture({embedding:[1],vectorRows:[
    {title:'Synthetic A',content:'The quick brown fox jumps over the lazy dog in this regulation text.'},
    {title:'Synthetic B',content:'The quick brown fox jumps over the lazy dog in this regulation text!'},
    {title:'Synthetic C',content:'A wholly different provision about payment terms applies here.'},
  ]});
  const text=await retrieveRegulations('liability',deps);
  assert.equal(text.match(/quick brown fox/g).length,1);
  assert.match(text,/wholly different provision/);
});

test('vector rows below the similarity threshold fall back to keywords',async()=>{
  const {effects,deps}=fixture({embedding:[1],
    vectorRows:[{title:'Weak',content:'Weak similarity excerpt',similarity:0.1}],
    keywordRows:[{title:'Keyword',content:'Keyword excerpt'}]});
  const text=await retrieveRegulations('liability',deps);
  assert.match(text,/Keyword excerpt/);
  assert.doesNotMatch(text,/Weak similarity/);
  assert.equal(effects.keywords,1);
});

test('vector rows at or above the threshold are used without keyword search',async()=>{
  const {effects,deps}=fixture({embedding:[1],
    vectorRows:[{title:'Strong',content:'Strong similarity excerpt',similarity:0.9}],
    keywordRows:[{title:'Keyword',content:'Keyword excerpt'}]});
  const text=await retrieveRegulations('liability',deps);
  assert.match(text,/Strong similarity excerpt/);
  assert.equal(effects.keywords,0);
});

test('malformed vector rows fall back to the keyword corpus',async()=>{
  const {deps}=fixture({embedding:[1],vectorRows:[{title:null,content:42}],
    keywordRows:[{title:'Keyword',content:'Keyword excerpt'}]});
  assert.match(await retrieveRegulations('liability',deps),/Keyword excerpt/);
});

test('keyword fallback drops generic contract stopwords',async()=>{
  const {effects,deps}=fixture({keywordRows:[{title:'Synthetic',content:'Synthetic excerpt'}]});
  await retrieveRegulations('the party shall review liability terms',deps);
  assert.equal(effects.terms,'review | liability | terms');
});

test('one oversized corpus row cannot blow up the retrieved context',async()=>{
  const {deps}=fixture({embedding:[1],vectorRows:[{title:'Huge',content:'x'.repeat(5000)}]});
  const text=await retrieveRegulations('liability',deps);
  assert.ok(text.length < 6500);
  assert.match(text,/\[...\]/);
});
