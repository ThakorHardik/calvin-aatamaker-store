import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';
import path from 'node:path';

async function main() {
  const envPath = path.resolve('.env.local');
  const envContent = fs.readFileSync(envPath, 'utf8');
  const getEnv = (key) => {
    const m = envContent.match(new RegExp(`^${key}=["']?([^"'\\r\\n]+)["']?`, 'm'));
    return m ? m[1].trim() : process.env[key];
  };

  const url = getEnv('NEXT_PUBLIC_SUPABASE_URL');
  const serviceKey = getEnv('SUPABASE_SECRET_KEY') || getEnv('SUPABASE_SERVICE_ROLE_KEY');

  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Inspect product_3d_models columns & constraints
  const { data: mRows, error: mErr } = await supabase.from('product_3d_models').select('*').limit(1);
  console.log('--- product_3d_models ---');
  if (mErr) console.log('Error:', mErr.message);
  else console.log('Data:', mRows);

  // Inspect product_printable_surfaces columns
  const { data: sRows, error: sErr } = await supabase.from('product_printable_surfaces').select('*').limit(1);
  console.log('--- product_printable_surfaces ---');
  if (sErr) console.log('Error:', sErr.message);
  else console.log('Data:', sRows);
}

main().catch(console.error);

