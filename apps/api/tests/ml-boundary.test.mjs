import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import axios from 'axios';
import { classifyClauseRisk, getRiskScore, fallbackClassify } from '../dist/services/ml.js';

// One battery, two implementations. The Python service rules test in
// apps/ml-service/tests/test_risk_rules.py loads the same file; tier or
// confidence edits that only land on one side fail here.
const HEURISTIC_BATTERY = JSON.parse(readFileSync(
  new URL('../../../fixtures/heuristic-clauses.json', import.meta.url), 'utf8'
)).clauses;

test('classification preserves explicit label, zero score and method', async () => {
  const original = axios.post;
  try {
    axios.post = async () => ({data:{label:'low',confidence:0,method:'heuristic_review_rules'}});
    assert.deepEqual(await classifyClauseRisk('ordinary clause'), {
      label:'low',confidence:0,method:'heuristic_review_rules',calibrated:false
    });
  } finally { axios.post=original; }
});

test('bad service labels and scores fall back rather than reaching callers', async () => {
  const original=axios.post;
  try {
    for (const data of [{label:'LABEL_0',confidence:.99},{label:'low',confidence:NaN},
      {label:'low',confidence:'0.8'},{label:'low',confidence:1.1},null]) {
      axios.post=async()=>({data});
      assert.equal((await classifyClauseRisk('ordinary clause')).label,'low');
      assert.equal((await classifyClauseRisk('ordinary clause')).confidence,.62);
    }
  } finally {axios.post=original;}
});

test('risk score accepts zero but rejects malformed and out-of-range responses',async()=>{
  const original=axios.post;
  try {
    axios.post=async()=>({data:{score:0}});
    assert.equal(await getRiskScore('ordinary clause'),0);
    for(const score of ['99',NaN,Infinity,-1,101,undefined]) {
      axios.post=async()=>({data:{score}});
      assert.equal(await getRiskScore('ordinary clause'),18);
    }
  } finally {axios.post=original;}
});

// The offline fallback must agree with the Python service's
// compute_local_heuristics tier for tier, confidence for confidence. The same
// shared battery runs in apps/ml-service/tests/test_risk_rules.py.
test('offline fallback mirrors the service heuristic rules exactly', () => {
  for (const clause of HEURISTIC_BATTERY) {
    const result = fallbackClassify(clause.text);
    assert.equal(result.label,clause.label,clause.text);
    assert.equal(result.confidence,clause.confidence,clause.text);
    assert.equal(result.method,'api_heuristic_review_rules');
    assert.equal(result.calibrated,false);
  }
});

test('offline risk score uses the service base scores and length modifier',async()=>{
  const original=axios.post;
  try{
    axios.post=async()=>{throw new Error('synthetic offline');};
    assert.equal(await getRiskScore('ordinary delivery clause'),18);
    const medium80='word '.repeat(79)+'confidentiality';
    assert.equal(medium80.trim().split(/\s+/).length,80);
    assert.equal(await getRiskScore(medium80),55);
  }finally{axios.post=original;}
});

test('offline rule classification always identifies its method and calibration limit',async()=>{
  const original=axios.post;
  try{
    axios.post=async()=>{throw new Error('synthetic offline');};
    for(const text of ['ordinary clause','confidentiality','indemnify','perpetual, irrevocable']){
      const result=await classifyClauseRisk(text);
      assert.equal(result.method,'api_heuristic_review_rules');assert.equal(result.calibrated,false);
    }
  }finally{axios.post=original;}
});

test('empty clause text throws instead of being fabricated as low risk',async()=>{
  const original=axios.post;
  try{
    axios.post=async()=>{throw new Error('synthetic offline');};
    assert.throws(()=>fallbackClassify('   '),/must not be empty/);
    assert.throws(()=>fallbackClassify(''),/must not be empty/);
    await assert.rejects(classifyClauseRisk('  '),/must not be empty/);
    await assert.rejects(getRiskScore(''),/must not be empty/);
  }finally{axios.post=original;}
});

test('offline fallback reports the matched words, not the regex source',()=>{
  assert.deepEqual(fallbackClassify('the party shall indemnify the other').matched,['indemnify']);
  assert.deepEqual(fallbackClassify('indemnify for negligence').matched,['indemnify','negligence']);
  assert.deepEqual(fallbackClassify('ordinary delivery clause').matched,[]);
});

test('offline fallback does not fire on substring hosts or negated terms',()=>{
  // "determination" holds "termination" inside it; "non-confidential" is
  // the opposite of a confidentiality risk. Both used to score medium.
  assert.equal(fallbackClassify('the determination of fees may change without notice').label,'low');
  assert.equal(fallbackClassify('all shared information is non-confidential and may be disclosed freely').label,'low');
  assert.deepEqual(fallbackClassify('all shared information is non-confidential').matched,[]);
});

test('service matched words pass through; malformed values are dropped, not surfaced', async () => {
  const original = axios.post;
  try {
    axios.post = async () => ({data:{label:'high',confidence:0.79,method:'heuristic_review_rules',matched:['indemnify','negligence']}});
    assert.deepEqual((await classifyClauseRisk('indemnify for negligence')).matched,['indemnify','negligence']);
    axios.post = async () => ({data:{label:'low',confidence:0,method:'configured_risk_model'}});
    assert.equal((await classifyClauseRisk('ordinary clause')).matched,undefined);
    axios.post = async () => ({data:{label:'high',confidence:0.79,method:'heuristic_review_rules',matched:'indemnify'}});
    assert.equal((await classifyClauseRisk('indemnify')).matched,undefined);
    axios.post = async () => ({data:{label:'high',confidence:0.79,method:'heuristic_review_rules',matched:['indemnify',42]}});
    assert.equal((await classifyClauseRisk('indemnify')).matched,undefined);
  } finally { axios.post=original; }
});

test('oversized clauses are truncated to the same bound the service accepts',async()=>{
  const original=axios.post;
  try{
    let received;
    axios.post=async(_url,body)=>{received=body.text;return {data:{label:'low',confidence:0.62,method:'heuristic_review_rules'}};};
    await classifyClauseRisk('x'.repeat(25000));
    assert.equal(received.length,20000);
    // A pattern past the bound must not fire in the offline fallback either.
    axios.post=async()=>{throw new Error('synthetic offline');};
    const beyond='word '.repeat(5000)+'confidentiality';
    assert.equal(await getRiskScore(beyond),33); // low 18 + length modifier 15, no signal
  }finally{axios.post=original;}
});

test('offline risk score adds a capped modifier per extra distinct signal',async()=>{
  const original=axios.post;
  try{
    axios.post=async()=>{throw new Error('synthetic offline');};
    assert.equal(await getRiskScore('indemnify'),64);
    assert.equal(await getRiskScore('indemnify governing law'),67);
    assert.equal(await getRiskScore('indemnify sole discretion governing law'),70);
    assert.equal(await getRiskScore('indemnify sole discretion governing law intellectual property'),73); // +9 cap reached
  }finally{axios.post=original;}
});
