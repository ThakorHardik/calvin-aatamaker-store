import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const envContent = fs.readFileSync('.env.local', 'utf8');
const env = {};
for (const line of envContent.split('\n')) {
  const t = line.trim();
  if (t && !t.startsWith('#') && t.includes('=')) {
    const i = t.indexOf('=');
    env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
  }
}
const admin = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

async function run() {
  const orderId = '3d3761e4-f0c5-43e7-b76d-f96bcd054059';
  console.log('=== [ORDER DETAILS] ===');
  const { data: order } = await admin.from('orders').select('*').eq('id', orderId).single();
  console.log('Order:', JSON.stringify(order, null, 2));

  console.log('\n=== [ORDER ITEMS & CUSTOMISATION DETAILS] ===');
  const { data: items } = await admin.from('order_items').select('*').eq('order_id', orderId);
  for (const it of items || []) {
    console.log('Item ID:', it.id);
    console.log('Product Name:', it.product_name);
    console.log('Customisation Details:');
    console.dir(it.customisation_details, { depth: null });
  }

  console.log('\n=== [CUSTOMER DESIGNS TABLE CHECK] ===');
  const { data: designs, error: dErr } = await admin.from('customer_designs').select('*').limit(5);
  console.log('customer_designs error:', dErr?.message || 'None');
  console.log('customer_designs rows:', designs?.length || 0);

  console.log('\n=== [STORAGE BUCKETS & OBJECTS CHECK] ===');
  const { data: buckets } = await admin.storage.listBuckets();
  console.log('Buckets:', buckets?.map(b => b.name));

  for (const b of buckets || []) {
    const { data: files } = await admin.storage.from(b.name).list('', { limit: 50 });
    console.log(`Bucket ${b.name} root items:`, files?.map(f => f.name));
    for (const f of files || []) {
      if (f.id === null || !f.metadata) {
        const { data: subFiles } = await admin.storage.from(b.name).list(f.name, { limit: 50 });
        console.log(`  ${b.name}/${f.name} items:`, subFiles?.map(sf => sf.name));
        for (const sf of subFiles || []) {
          if (sf.id === null || !sf.metadata) {
            const { data: deepFiles } = await admin.storage.from(b.name).list(`${f.name}/${sf.name}`, { limit: 50 });
            console.log(`    ${b.name}/${f.name}/${sf.name} items:`, deepFiles?.map(df => df.name));
          }
        }
      }
    }
  }
}
run();

