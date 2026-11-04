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
  const { data: prod, error: pErr } = await admin
    .from('products')
    .select('id, name, slug, price, stock_quantity, created_at, updated_at')
    .eq('id', '327d5d70-ec43-4d28-9aff-cd1de77a23c5')
    .single();

  if (pErr) console.error('Product err:', pErr);
  else console.log('Current Product in DB:', prod);

  const { data: variants, error: vErr } = await admin
    .from('product_variants')
    .select('*')
    .eq('product_id', '327d5d70-ec43-4d28-9aff-cd1de77a23c5');

  console.log('Variants count:', variants?.length, variants);

  const { data: orderItems, error: oiErr } = await admin
    .from('order_items')
    .select('id, order_id, product_name, quantity, created_at, orders(order_number, created_at, order_status)')
    .eq('product_id', '327d5d70-ec43-4d28-9aff-cd1de77a23c5')
    .order('created_at', { ascending: true });

  console.log('All historical order items for this product:');
  let totalOrderedQty = 0;
  for (const oi of orderItems || []) {
    totalOrderedQty += oi.quantity;
    console.log(`- Order ${oi.orders?.order_number}: Qty ${oi.quantity} at ${oi.created_at} (Status: ${oi.orders?.order_status})`);
  }
  console.log('Total historical ordered quantity:', totalOrderedQty);

  // Also inspect table columns
  const { data: ordSample } = await admin.from('orders').select('*').limit(1);
  console.log('orders columns:', ordSample && ordSample[0] ? Object.keys(ordSample[0]) : 'None');

  const { data: prodSample } = await admin.from('products').select('*').limit(1);
  console.log('products columns:', prodSample && prodSample[0] ? Object.keys(prodSample[0]) : 'None');

  const { data: oiSample } = await admin.from('order_items').select('*').limit(1);
  console.log('order_items columns:', oiSample && oiSample[0] ? Object.keys(oiSample[0]) : 'None');
}

run();
