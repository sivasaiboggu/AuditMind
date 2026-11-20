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
test('wrapped numeric lines in running text do not fragment clauses',()=>{
  const text='Section 1 Payment\nThe fees are due within\n30 days of the invoice date.\n2. No appeal.';
  const result=segmentClauses(text);
  assert.equal(result.length,2);
  assert.equal(result[0].text,'Section 1 Payment\nThe fees are due within\n30 days of the invoice date.');
  assert.equal(result[1].text,'2. No appeal.');
});
test('numeric headings with markers, dotted forms and titles still segment',()=>{
  const result=segmentClauses('10 Indemnity\nLiability applies.\n3.1 Termination\nEnds on notice.\n4\nStandalone.');
  assert.equal(result.length,3);
  assert.equal(result[0].number,'Section 10');
  assert.equal(result[1].number,'Section 3.1');
  assert.equal(result[2].number,'Section 4');
});

test('hyphenated line wraps rejoin so wrapped words still match risk patterns',()=>{
  const result=segmentClauses('Section 1 Confidentiality\nThe confi-\ndentiality clause applies.');
  assert.equal(result.length,1);
  assert.match(result[0].text,/confidentiality clause/);
  assert.doesNotMatch(result[0].text,/confi-/);
});

test('spaced dashes and sentence breaks are not dehyphenated',()=>{
  const result=segmentClauses('Section 1 Term\nThe term -\nrenewal is separate.');
  assert.equal(result.length,1);
  assert.match(result[0].text,/term -\nrenewal/);
});

test('exact duplicate clauses are dropped instead of double-counted',()=>{
  const result=segmentClauses('Section 1 Payment\nPay now.\nSection 1 Payment\nPay now.');
  assert.equal(result.length,1);
  assert.equal(result[0].text,'Section 1 Payment\nPay now.');
});

test('repeated section numbers with different text are disambiguated',()=>{
  const result=segmentClauses('Section 1 Payment\nPay now.\nSection 1 Refund\nRefund later.');
  assert.equal(result.length,2);
  assert.equal(result[0].number,'Section 1');
  assert.equal(result[1].number,'Section 1 (2)');
  assert.equal(result[1].text,'Section 1 Refund\nRefund later.');
});

test('four-digit years at a line start are dates, not section numbers',()=>{
  const result=segmentClauses('2024. Revenue grew.\nSection 1 Payment\nPay now.');
  assert.equal(result.length,2);
  assert.equal(result[0].number,'Preamble');
  assert.equal(result[0].text,'2024. Revenue grew.');
  assert.equal(segmentClauses('2024 Revenue grew sharply.').length,1);
});

test('oversized input and empty buffers are rejected, not scanned',async()=>{
  assert.throws(()=>segmentClauses('x'.repeat(1_000_001)),/review size limit/);
  await assert.rejects(extractText(Buffer.alloc(0),'text/plain'),/empty/);
  await assert.rejects(extractText(Buffer.alloc(15*1024*1024+1),'text/plain'),/15 MB/);
});

test('more than 500 distinct clauses exceeds the review limit',()=>{
  const text=Array.from({length:501},(_,i)=>`Section ${i+1} Clause`).join('\n');
  assert.throws(()=>segmentClauses(text),/500/);
});
