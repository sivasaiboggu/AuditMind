import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';
import path from 'path';

// Load credentials
dotenv.config({ path: path.resolve('apps/api/.env') });

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

console.log('// Supabase Upload Diagnostics');
console.log('URL:', SUPABASE_URL);

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('ERROR: Missing Supabase credentials in apps/api/.env');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  try {
    // 1. Check storage bucket
    console.log('\nStep 1: Checking storage buckets...');
    const { data: buckets, error: bError } = await supabase.storage.listBuckets();
    if (bError) {
      console.error('Storage bucket list error:', bError);
    } else {
      console.log('Existing buckets:', buckets.map(b => b.name));
      const hasContracts = buckets.some(b => b.name === 'contracts');
      console.log('Has "contracts" bucket?', hasContracts);
      
      if (!hasContracts) {
        console.log('Attempting to create "contracts" bucket automatically...');
        const { data: createData, error: createError } = await supabase.storage.createBucket('contracts', {
          public: true
        });
        if (createError) {
          console.error('Failed to create bucket:', createError);
        } else {
          console.log('Created contracts bucket successfully:', createData);
        }
      }
    }

    // 2. Test file upload
    console.log('\nStep 2: Testing file upload to "contracts" storage...');
    const testId = randomUUID();
    const testFilePath = `contracts/diag-${testId}.txt`;
    const testBuffer = Buffer.from('hello world diagnostic file content');
    
    console.log(`Uploading test file to: ${testFilePath}...`);
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('contracts')
      .upload(testFilePath, testBuffer, { contentType: 'text/plain' });

    if (uploadError) {
      console.error('UPLOAD FAILED:', uploadError);
    } else {
      console.log('UPLOAD SUCCESSFUL:', uploadData);
      
      // Cleanup file
      console.log('Cleaning up uploaded file...');
      await supabase.storage.from('contracts').remove([testFilePath]);
    }

    // 3. Test db insert
    console.log('\nStep 3: Testing db row insert...');
    const { data: insertData, error: insertError } = await supabase
      .from('contracts')
      .insert({
        id: testId,
        name: 'diag_contract.pdf',
        file_path: 'contracts/diag-test.pdf',
        status: 'processing',
        overall_risk_score: 0
      })
      .select();

    if (insertError) {
      console.error('INSERT FAILED:', insertError);
    } else {
      console.log('INSERT SUCCESSFUL:', insertData);
      
      // Cleanup row
      console.log('Cleaning up insert row...');
      await supabase.from('contracts').delete().eq('id', testId);
    }

    console.log('\nDiagnostics completed successfully!');
  } catch (err) {
    console.error('Unhandled diagnostic exception:', err);
  }
}

run();
