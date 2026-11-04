import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';
import path from 'node:path';

async function main() {
  console.log('=== INSPECTING LIVE PRODUCT & 3D MODEL RELATIONSHIPS ===\n');

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

  // 1. Live Product
  const { data: products, error: pErr } = await supabase
    .from('products')
    .select('id, name, slug, is_customisable, price, stock_quantity');

  console.log('Products:', products, pErr?.message || '');

  // 2. 3D Models
  const { data: models, error: mErr } = await supabase
    .from('product_3d_models')
    .select('*');

  console.log('\nProduct 3D Models:', models, mErr?.message || '');

  // 3. Printable Surfaces
  const { data: surfaces, error: sErr } = await supabase
    .from('product_printable_surfaces')
    .select('*');

  console.log('\nPrintable Surfaces:', surfaces, sErr?.message || '');

  // 4. Customer Designs
  const { data: designs, error: dErr } = await supabase
    .from('customer_designs')
    .select('id, product_id, model_id, surface_id, design_name');

  console.log('\nCustomer Designs:', designs, dErr?.message || '');
}

main().catch(console.error);

