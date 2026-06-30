import { createClient } from '@supabase/supabase-js';
import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !GEMINI_API_KEY) {
  console.error('// ERROR: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and GEMINI_API_KEY must be defined in your environment variables to run seeding.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const CORPUS = [
  {
    title: 'GDPR Article 7 - Conditions for Consent',
    section: 'Data Privacy',
    content: 'Consent must be freely given, specific, informed, and unambiguous. Silence, pre-ticked boxes, or inactivity should not constitute consent. The data subject has the right to withdraw his or her consent at any time.'
  },
  {
    title: 'GDPR Article 82 - Right to compensation and liability',
    section: 'Liability',
    content: 'Any person who has suffered material or non-material damage as a result of an infringement of this Regulation shall have the right to receive compensation from the controller or processor for the damage suffered.'
  },
  {
    title: 'UCC § 2-302 - Unconscionable Contract or Clause',
    section: 'Commercial Contract Law',
    content: 'If the court as a matter of law finds the contract or any clause of the contract to have been unconscionable at the time it was made, the court may refuse to enforce the contract, or enforce the remainder without the unconscionable clause.'
  },
  {
    title: 'California Civil Code Section 1668 - Contracts Contrary to Policy',
    section: 'Liability Caps',
    content: 'All contracts which have for their object, directly or indirectly, to exempt anyone from responsibility for his own fraud, or willful injury to the person or property of another, or violation of law, whether willful or negligent, are against the policy of the law.'
  },
  {
    title: 'CCPA § 1798.140 - Service Provider Restrictions',
    section: 'Data Processing',
    content: 'A service provider shall not retain, use, or disclose personal information for any purpose other than for the business purposes specified in the contract, including retaining, using, or disclosing personal information for a commercial purpose other than providing the services.'
  },
  {
    title: 'Standard Confidentiality Term Limits',
    section: 'NDA Norms',
    content: 'Standard NDA commitments for proprietary details in commercial transactions usually last between two (2) and five (5) years from the date of disclosure. Indefinite confidentiality is only standard for trade secrets.'
  }
];

async function getEmbedding(text: string): Promise<number[]> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key=${GEMINI_API_KEY}`;
  const response = await axios.post(url, {
    model: 'models/text-embedding-004',
    content: {
      parts: [{ text }]
    }
  });
  return response.data.embedding.values;
}

async function seed() {
  console.log('// Starting Regulation Corpus Database Seeding...');
  
  try {
    for (const item of CORPUS) {
      console.log(`// Embedding: ${item.title}`);
      const vector = await getEmbedding(item.content);
      
      const { error } = await supabase.from('regulation_corpus').insert({
        title: item.title,
        section: item.section,
        content: item.content,
        vector
      });

      if (error) {
        throw error;
      }
    }
    console.log('// Seeding completed successfully! Regulation vectors loaded into Supabase.');
  } catch (err) {
    console.error('// Seeding failed:', err);
  }
}

seed();
