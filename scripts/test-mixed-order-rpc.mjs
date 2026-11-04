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

  const productId = '327d5d70-ec43-4d28-9aff-cd1de77a23c5';
  const testKeyMixed = '11111111-0000-4000-8000-000000000002';

  console.log('--- Test 1: Mixed Order RPC call (1 normal + 1 customized) ---');
  const { data: mixedData, error: mixedError } = await supabase.rpc('create_checkout_order', {
    p_customer_id: null,
    p_customer_name: 'Test Mixed',
    p_email: 'mixed@example.com',
    p_phone: '9876543211',
    p_shipping_address_line1: '456 Mixed Lane',
    p_shipping_address_line2: null,
    p_city: 'Ahmedabad',
    p_state: 'Gujarat',
    p_postal_code: '380001',
    p_country: 'India',
    p_customer_notes: 'Mixed order test',
    p_subtotal: 37998,
    p_shipping_amount: 0,
    p_tax_amount: 0,
    p_discount_amount: 0,
    p_total_amount: 37998,
    p_currency: 'INR',
    p_idempotency_key: testKeyMixed,
    p_items: [
      {
        product_id: productId,
        variant_id: null,
        product_name: 'Compact Domestic Aatamaker',
        sku: null,
        variant_name: null,
        unit_price: 18999,
        quantity: 1,
        line_total: 18999,
        customisation_details: {}
      },
      {
        product_id: productId,
        variant_id: null,
        product_name: 'Compact Domestic Aatamaker',
        sku: null,
        variant_name: null,
        unit_price: 18999,
        quantity: 1,
        line_total: 18999,
        customisation_details: {
          _design_id: 'd1111111-2222-3333-4444-555555555555',
          front_panel_finish: 'royal_walnut'
        }
      }
    ]
  });

  console.log('Mixed Order Result:', { mixedData, mixedError });

  // Clean up test order if created
  if (mixedData?.order_id) {
    await supabase.from('order_items').delete().eq('order_id', mixedData.order_id);
    await supabase.from('orders').delete().eq('id', mixedData.order_id);
    console.log('Cleaned up test mixed order.');
  }
}

main().catch(console.error);

