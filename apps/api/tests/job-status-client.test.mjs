import {test} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';import ts from 'typescript';
const context={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync(new URL('../../web/src/lib/job-status.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,context);
const notice=context.exports.jobStatusNotice;
test('exhausted retries show a stop and no duplicate upload instruction',()=>{assert.match(notice({processingError:'RETRY_LIMIT_REACHED',processingAttempts:3}),/stopped after 3 attempts.*operator review.*do not upload a duplicate/);});
test('pending retry is clearly automatic and invalid dates are not displayed',()=>{const text=notice({processingError:'STORAGE_RETRY_PENDING',processingAttempts:1,nextRetryAt:'bad'});assert.match(text,/Attempt 1 of 3; next automatic attempt/);assert.doesNotMatch(text,/Invalid Date/);});
test('terminal analysis failure is not described as an upcoming retry',()=>{assert.match(notice({processingError:'ANALYSIS_INCOMPLETE'}),/No completed review/);assert.equal(notice({status:'completed'}),null);});
