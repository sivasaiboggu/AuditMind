import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const root=new URL('../../../supabase/migrations/',import.meta.url);
const read=name=>fs.readFileSync(new URL(name,root),'utf8');
test('fresh baseline does not drop tables or expose null-owned private rows',()=>{
 const sql=read('20240101000000_init.sql');assert.doesNotMatch(sql,/DROP TABLE|user_id IS NULL/i);
});
test('profile trigger migration adds its missing field and avoids public profile reads',()=>{
 const sql=read('20240101000001_profiles.sql');assert.match(sql,/ADD COLUMN IF NOT EXISTS avatar_url/);assert.doesNotMatch(sql,/USING \(true\)/);assert.match(sql,/SET search_path = public, pg_temp/);
});
test('compatibility migration cannot redeclare conflicting tables, RPC or permissive policies',()=>{
 const sql=read('20260630000000_init_schema.sql');assert.doesNotMatch(sql,/CREATE TABLE|CREATE POLICY|CREATE OR REPLACE FUNCTION/i);
});
test('additive owner repair drops all known broad policies before owner reads',()=>{
 const sql=read('20261025000000_owner_policy_hardening.sql');assert.match(sql,/BEGIN;/);assert.match(sql,/COMMIT;/);assert.doesNotMatch(sql,/DROP TABLE|DELETE FROM|USING \(true\)/i);
 for(const table of ['profiles','contracts','clauses','risk_reports','chat_sessions','chat_messages'])assert.ok(sql.includes(`auditmind_owner_read_${table}`));
 for(const policy of ['Allow public read access to profiles','Enable read access for contract owner','Enable insert access for contract owner','Enable update access for contract owner','Enable read access for clauses','Enable write access for clauses','Enable access for chat sessions','Enable access for chat messages'])assert.ok(sql.includes(`DROP POLICY IF EXISTS "${policy}"`));
});
