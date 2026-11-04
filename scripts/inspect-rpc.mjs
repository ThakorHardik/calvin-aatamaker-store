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

  // Call rpc with empty or test to see signature error if any
  try {
    const { data, error } = await supabase.rpc('create_checkout_order', {});
    console.log('RPC response:', { data, error });
  } catch (err) {
    console.log('RPC error:', err.message);
  }
}

main().catch(console.error);

