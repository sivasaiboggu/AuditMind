import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Readable} from 'node:stream';
import {readGeminiSse} from '../dist/services/gemini-stream.js';
const event=text=>'data: '+JSON.stringify({candidates:[{content:{parts:[{text}]}}]})+'\r\n\r\n';
async function decode(chunks){let text='';await readGeminiSse(Readable.from(chunks),part=>text+=part);return text;}
test('every byte boundary preserves escaped quotes, newlines, unicode and adjacent events',async()=>{
 const parts=['Clause "A" says:\n','café ₹ 😀\\end'];const bytes=Buffer.from(parts.map(event).join(''));
 for(let split=1;split<bytes.length;split++)assert.equal(await decode([bytes.subarray(0,split),bytes.subarray(split)]),parts.join(''));
 assert.equal(await decode([...bytes].map(b=>Buffer.from([b]))),parts.join(''));
});
test('SSE comments, metadata-only events and DONE do not invent output',async()=>{
 assert.equal(await decode([Buffer.from(': heartbeat\n\ndata: {"usageMetadata":{}}\n\n'+event('Answer')+'data: [DONE]\n\n')]),'Answer');
});
test('complete final event without newline is read once',async()=>{
 assert.equal(await decode([Buffer.from(event('Answer').trimEnd())]),'Answer');
});
for(const body of ['', 'data: {"candidates":', 'data: {"error":{"message":"private"}}\n\n'])test(`empty or malformed stream fails (${body.length} bytes)`,async()=>{
 await assert.rejects(decode([Buffer.from(body)]));
});
test('oversized pending event is rejected',async()=>{await assert.rejects(decode([Buffer.alloc(1024*1024+1,97)]),/exceeds limit/);});
test('partial response followed by error rejects rather than reporting success',async()=>{
 const stream=Readable.from((async function*(){yield Buffer.from(event('Partial'));throw Error('synthetic failure');})());let text='';
 await assert.rejects(readGeminiSse(stream,s=>text+=s));assert.equal(text,'Partial');
});
