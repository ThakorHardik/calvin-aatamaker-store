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
  console.log('=== AUDITING ORDER: ' + orderId + ' ===');

  const { data: order, error: oErr } = await admin
    .from('orders')
    .select('*')
    .eq('id', orderId)
    .single();

  if (oErr) {
    console.error('Order query error:', oErr);
    return;
  }
  console.log('Order Number:', order.order_number);
  console.log('Customer ID:', order.customer_id);
  console.log('Customer Name:', order.customer_name);
  console.log('Created At:', order.created_at);
  console.log('Order Status:', order.order_status);

  const { data: items, error: iErr } = await admin
    .from('order_items')
    .select('*')
    .eq('order_id', orderId);

  if (iErr) {
    console.error('Items query error:', iErr);
    return;
  }

  for (const item of items) {
    console.log('\n--- Item ID: ' + item.id + ' (' + item.product_name + ') ---');
    const cd = item.customisation_details;
    console.log('_preview_storage_path:', cd?._preview_storage_path);
    console.log('_preview_thumbnail_path:', cd?._preview_thumbnail_path);
    console.log('_flat_artwork_path:', cd?._flat_artwork_path);
    console.log('_model_code:', cd?._model_code);
    console.log('_surface_key:', cd?._surface_key);
    console.log('_design_id:', cd?._design_id);
    console.log('_mode:', cd?._mode);
    console.log('_surface_dimensions_mm:', cd?._surface_dimensions_mm);

    console.log('\nLayers Count in _layers:', cd?._layers?.length);
    console.log('_layers:', JSON.stringify(cd?._layers, null, 2));

    console.log('\nText Layers in _text_layers:', cd?._text_layers?.length);
    console.log('_text_layers:', JSON.stringify(cd?._text_layers, null, 2));

    console.log('\nSnapshot Structure:');
    let snap = cd?._snapshot;
    if (typeof snap === 'string') {
      try { snap = JSON.parse(snap); } catch {}
    }
    console.log('Snapshot keys:', snap ? Object.keys(snap) : 'null');
    console.log('Snapshot preview_storage_path:', snap?.preview_storage_path);
    console.log('Snapshot flat_artwork_storage_path:', snap?.flat_artwork_storage_path);
    console.log('Snapshot flat_artwork_path:', snap?.flat_artwork_path);
    console.log('Snapshot text_layers:', JSON.stringify(snap?.text_layers, null, 2));
    console.log('Snapshot original_assets:', JSON.stringify(snap?.original_assets, null, 2));

    // Check customer_designs table for related design
    if (cd?._design_id) {
      console.log('\n--- Checking customer_designs for design_id:', cd._design_id);
      const { data: designRecord, error: dErr } = await admin
        .from('customer_designs')
        .select('*')
        .eq('id', cd._design_id)
        .maybeSingle();
      console.log('customer_designs error:', dErr?.message || 'none');
      console.log('customer_designs record:', designRecord ? JSON.stringify(designRecord, null, 2) : 'NOT FOUND');
    }

    // Inspect files in customer-customizations bucket
    console.log('\n--- Checking Supabase Storage bucket: customer-customizations ---');
    const customerPrefix = order.customer_id;
    if (customerPrefix) {
      const { data: photosList } = await admin.storage
        .from('customer-customizations')
        .list(customerPrefix + '/photos');
      console.log('Photos in ' + customerPrefix + '/photos:', photosList?.map(f => f.name));

      const { data: previewsList } = await admin.storage
        .from('customer-customizations')
        .list(customerPrefix + '/previews');
      console.log('Previews in ' + customerPrefix + '/previews:', previewsList?.map(f => f.name));

      const { data: artworkList } = await admin.storage
        .from('customer-customizations')
        .list(customerPrefix + '/artwork');
      console.log('Artwork in ' + customerPrefix + '/artwork:', artworkList?.map(f => f.name) || 'None');
    }
  }
}

run().catch(console.error);

