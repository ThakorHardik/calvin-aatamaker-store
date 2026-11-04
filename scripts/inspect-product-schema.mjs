import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';
import path from 'node:path';

async function main() {
  console.log('=== INSPECTING LIVE PRODUCTS SCHEMA IN SUPABASE ===\n');

  const envPath = path.resolve('.env.local');
  if (!fs.existsSync(envPath)) {
    console.error('Error: .env.local not found');
    process.exit(1);
  }

  const envContent = fs.readFileSync(envPath, 'utf8');
  const getEnv = (key) => {
    const m = envContent.match(new RegExp(`^${key}=["']?([^"'\\r\\n]+)["']?`, 'm'));
    return m ? m[1].trim() : process.env[key];
  };

  const url = getEnv('NEXT_PUBLIC_SUPABASE_URL');
  const serviceKey = getEnv('SUPABASE_SECRET_KEY') || getEnv('SUPABASE_SERVICE_ROLE_KEY');

  if (!url || !serviceKey) {
    console.error('Error: Missing URL or service key');
    process.exit(1);
  }

  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // 1. Select * from products
  console.log('--- 1. SELECT * FROM products LIMIT 1 ---');
  const { data: products, error: pErr } = await supabase
    .from('products')
    .select('*')
    .limit(1);

  if (pErr) {
    console.error('Error querying products table:', pErr);
  } else if (products && products[0]) {
    const row = products[0];
    console.log('Available columns in public.products:');
    console.log(Object.keys(row));
    console.log('\nRow details:');
    console.log(JSON.stringify(row, null, 2));
    console.log('\nDoes "customization_config" exist on row?:', 'customization_config' in row);
  } else {
    console.log('No rows found in products table.');
  }

  // 2. Try explicitly selecting customization_config
  console.log('\n--- 2. EXPLICIT SELECT customization_config FROM products ---');
  const { data: cData, error: cErr } = await supabase
    .from('products')
    .select('id, customization_config')
    .limit(1);

  if (cErr) {
    console.log('Explicit select error:', cErr.message);
  } else {
    console.log('Explicit select success:', cData);
  }

  // 3. Inspect if migration 202611020004 or 202611030001 is recorded in supabase_migrations or schema_migrations
  console.log('\n--- 3. CHECKING MIGRATIONS TABLE IF ACCESSIBLE ---');
  for (const tbl of ['schema_migrations', 'supabase_migrations']) {
    try {
      const { data: mData, error: mErr } = await supabase
        .from(tbl)
        .select('*');
      if (mErr) {
        console.log(`Table "${tbl}" check error: ${mErr.message}`);
      } else {
        console.log(`Table "${tbl}" rows:`, mData);
      }
    } catch (e) {
      console.log(`Table "${tbl}" exception: ${e.message}`);
    }
  }

  // 4. Check product_3d_models and product_printable_surfaces
  console.log('\n--- 4. CHECKING 3D MODEL & PRINTABLE SURFACES TABLES ---');
  const { data: mData, error: mErr } = await supabase.from('product_3d_models').select('*').limit(1);
  console.log('product_3d_models error:', mErr ? mErr.message : 'None (table exists)');
  const { data: sData, error: sErr } = await supabase.from('product_printable_surfaces').select('*').limit(1);
  console.log('product_printable_surfaces error:', sErr ? sErr.message : 'None (table exists)');
  const { data: cdData, error: cdErr } = await supabase.from('customer_designs').select('*').limit(1);
  console.log('customer_designs error:', cdErr ? cdErr.message : 'None (table exists)');

  // 5. Check order_items columns
  console.log('\n--- 5. CHECKING ORDER_ITEMS COLUMNS ---');
  const { data: oiData, error: oiErr } = await supabase.from('order_items').select('*').limit(1);
  if (oiErr) {
    console.log('order_items error:', oiErr.message);
  } else if (oiData && oiData[0]) {
    console.log('order_items columns:', Object.keys(oiData[0]));
    console.log('Has customisation_details?:', 'customisation_details' in oiData[0]);
  }
}

main().catch(console.error);
