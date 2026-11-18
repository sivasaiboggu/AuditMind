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
