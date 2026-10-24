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
