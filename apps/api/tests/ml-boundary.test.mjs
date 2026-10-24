import { test } from 'node:test';
import assert from 'node:assert/strict';
import axios from 'axios';
import { classifyClauseRisk, getRiskScore } from '../dist/services/ml.js';

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
      assert.equal((await classifyClauseRisk('ordinary clause')).confidence,.6);
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
      assert.equal(await getRiskScore('ordinary clause'),20);
    }
  } finally {axios.post=original;}
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
