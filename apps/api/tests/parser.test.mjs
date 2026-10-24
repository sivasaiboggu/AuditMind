import {test} from 'node:test';
import assert from 'node:assert/strict';
import {extractText} from '../dist/services/parser.js';
test('corrupted PDF is not recovered by guessing text from binary',async()=>{
  await assert.rejects(extractText(Buffer.from('%PDF-1.7\n(agreement) (liability) (shall) broken'),'application/pdf'),/PDF text could not be extracted/);
});
test('legacy DOC, images and arbitrary binary types are explicitly unsupported',async()=>{
  for(const type of ['application/msword','image/png','application/octet-stream'])await assert.rejects(extractText(Buffer.from('agreement'),type),/Unsupported document type/);
});
test('malformed DOCX cannot fall back to raw bytes',async()=>{
  await assert.rejects(extractText(Buffer.from('agreement'),'application/vnd.openxmlformats-officedocument.wordprocessingml.document'),/DOCX text could not be extracted/);
});
test('plain text must be nonempty valid UTF-8 without binary controls',async()=>{
  for(const bytes of [Buffer.from('  \n'),Buffer.from([0xff,0xfe]),Buffer.from('agreement\x00liability')])await assert.rejects(extractText(bytes,'text/plain'));
  assert.equal(await extractText(Buffer.from('Synthetic agreement\nReadable clause.'),'text/plain'),'Synthetic agreement\nReadable clause.');
});

const {segmentClauses}=await import('../dist/services/parser.js');
test('same-line obligations and short clauses remain in analyzed text',()=>{
  const text='1. Pay now.\n2. No appeal.\nSection 3.1 Liability is unlimited.';
  const result=segmentClauses(text);
  assert.equal(result.length,3);
  assert.deepEqual(result.map(s=>s.text),text.split('\n'));
});
test('multiline sections retain heading and all body lines',()=>{
  const result=segmentClauses('Agreement preamble\nArticle II: Confidentiality\nKeep secrets.\nClause 2.1 Termination\nNo notice.');
  assert.equal(result.length,3);
  assert.equal(result[1].text,'Article II: Confidentiality\nKeep secrets.');
  assert.equal(result[2].number,'Section 2.1');
  assert.equal(result[2].text,'Clause 2.1 Termination\nNo notice.');
});
test('ordinary first-person and prefix-lookalike lines are not Roman headings',()=>{
  const text='I agree to the terms.\nCivil law may apply.\nSectional arrangement is not a heading.';
  const result=segmentClauses(text);
  assert.equal(result.length,1);assert.equal(result[0].text,text);
});
test('Roman headings require punctuation unless explicitly named',()=>{
  const result=segmentClauses('IV. Rights\nNo waiver.\nArticle V Obligations\nPay fees.');
  assert.equal(result.length,2);assert.equal(result[0].number,'Section IV');assert.equal(result[1].number,'Section V');
});
test('header-only and tiny unstructured documents are preserved, empty stays empty',()=>{
  assert.equal(segmentClauses('Section 1 Liability')[0].text,'Section 1 Liability');
  assert.equal(segmentClauses('Pay now.')[0].text,'Pay now.');
  assert.deepEqual(segmentClauses(' \n '),[]);
});
