import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';
import path from 'node:path';

async function main() {
  const envContent = fs.readFileSync('.env.local', 'utf8');
  const getEnv = (key) => {
    const m = envContent.match(new RegExp(`^${key}=["']?([^"'\\r\\n]+)["']?`, 'm'));
    return m ? m[1].trim() : process.env[key];
  };

  const url = getEnv('NEXT_PUBLIC_SUPABASE_URL');
  const serviceKey = getEnv('SUPABASE_SECRET_KEY') || getEnv('SUPABASE_SERVICE_ROLE_KEY');

  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  console.log('--- Orders Table Columns Check ---');
  const { data: orderData, error: orderError } = await supabase
    .from('orders')
    .select('id, order_number, checkout_idempotency_key, customer_id, total_amount, order_status, payment_status, customer_notes')
    .limit(1);

  console.log('Order query result:', { orderData, orderError });

  console.log('--- Order Items Table Columns Check ---');
  const { data: itemData, error: itemError } = await supabase
    .from('order_items')
    .select('id, order_id, product_id, variant_id, product_name, sku, variant_name, unit_price, quantity, line_total, customisation_details')
    .limit(1);

  console.log('Order items query result:', { itemData, itemError });

  console.log('--- Test calling create_checkout_order RPC with dummy uuid key ---');
  const testKey = '00000000-0000-4000-8000-000000000001';
  const { data: rpcData, error: rpcError } = await supabase.rpc('create_checkout_order', {
    p_customer_id: null,
    p_customer_name: 'Test Customer',
    p_email: 'test@example.com',
    p_phone: '9876543210',
    p_shipping_address_line1: '123 Test St',
    p_shipping_address_line2: null,
    p_city: 'Mumbai',
    p_state: 'Maharashtra',
    p_postal_code: '400001',
    p_country: 'India',
    p_customer_notes: null,
    p_subtotal: 18999,
    p_shipping_amount: 0,
    p_tax_amount: 0,
    p_discount_amount: 0,
    p_total_amount: 18999,
    p_currency: 'INR',
    p_idempotency_key: testKey,
    p_items: [
      {
        product_id: '327d5d70-ec43-4d28-9aff-cd1de77a23c5',
        variant_id: null,
        product_name: 'Compact Domestic Aatamaker',
        sku: null,
        variant_name: null,
        unit_price: 18999,
        quantity: 1,
        line_total: 18999,
        customisation_details: {}
      }
    ]
  });

  console.log('RPC response test:', { rpcData, rpcError });
  console.log('--- Customer Designs Table Columns Check ---');
  const { data: cdData, error: cdError } = await supabase
    .from('customer_designs')
    .select('id, customer_id, product_id, model_id, surface_id, design_title, design_data, preview_thumbnail_path, status, order_id, created_at, updated_at')
    .limit(1);

  console.log('Customer designs query result:', { cdData, cdError });
}

main().catch(console.error);
