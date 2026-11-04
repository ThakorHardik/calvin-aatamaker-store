import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';
import path from 'node:path';

async function main() {
  const envContent = fs.readFileSync(path.resolve('.env.local'), 'utf8');
  const getEnv = (key) => {
    const m = envContent.match(new RegExp(`^${key}=["']?([^"'\\r\\n]+)["']?`, 'm'));
    return m ? m[1].trim() : process.env[key];
  };

  const url = getEnv('NEXT_PUBLIC_SUPABASE_URL');
  const key = getEnv('SUPABASE_SECRET_KEY') || getEnv('SUPABASE_SERVICE_ROLE_KEY') || getEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY');
  const supabase = createClient(url, key, { auth: { persistSession: false } });

  console.log('--- DETAILED PRODUCT ROW IN SUPABASE ---');
  const { data: product, error } = await supabase
    .from('products')
    .select('*, product_images(*), product_variants(*)')
    .eq('slug', 'compact-domestic-aatamaker-20c2f7')
    .maybeSingle();

  if (error) {
    console.error('Fetch error:', error.message);
  } else {
    console.log('Product row:', JSON.stringify(product, null, 2));
  }
}

main().catch(console.error);

