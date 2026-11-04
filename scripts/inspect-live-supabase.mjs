/**
 * Read-only live Supabase inspection script.
 * Never prints secret keys or sensitive tokens.
 */
import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';
import path from 'node:path';

async function main() {
  console.log('=== LIVE SUPABASE PROJECT READ-ONLY INSPECTION ===\n');

  // Load .env.local without exposing credentials to stdout
  const envPath = path.resolve('.env.local');
  if (!fs.existsSync(envPath)) {
    console.error('Error: .env.local file not found');
    process.exit(1);
  }

  const envContent = fs.readFileSync(envPath, 'utf8');
  const getEnv = (key) => {
    const m = envContent.match(new RegExp(`^${key}=["']?([^"'\\r\\n]+)["']?`, 'm'));
    return m ? m[1].trim() : process.env[key];
  };

  const url = getEnv('NEXT_PUBLIC_SUPABASE_URL');
  const serviceKey = getEnv('SUPABASE_SECRET_KEY') || getEnv('SUPABASE_SERVICE_ROLE_KEY');
  const anonKey = getEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY') || getEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY');

  if (!url) {
    console.error('Error: Missing NEXT_PUBLIC_SUPABASE_URL');
    process.exit(1);
  }

  const keyToUse = serviceKey || anonKey;
  if (!keyToUse) {
    console.error('Error: Missing Supabase key');
    process.exit(1);
  }

  const host = new URL(url).hostname;
  console.log(`Target Supabase Host: ${host}`);
  console.log(`Using Key Type: ${serviceKey ? 'Service Role Key (Read-Only queries)' : 'Anon Key'}\n`);

  const supabase = createClient(url, keyToUse, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // 1. Products
  console.log('--- 1. PRODUCTS TABLE ---');
  try {
    const { data: products, error: pErr } = await supabase
      .from('products')
      .select('id, name, slug, sku, price, is_customisable, is_active, is_featured');
    if (pErr) {
      console.log(`  [Query Error]: ${pErr.message}`);
    } else {
      console.log(`  Total Products Found: ${products?.length ?? 0}`);
      (products || []).forEach((p) => {
        console.log(`  - [${p.id}] "${p.name}" (slug: ${p.slug}, SKU: ${p.sku}, Price: ₹${p.price}, Customizable: ${p.is_customisable}, Active: ${p.is_active})`);
      });
    }
  } catch (err) {
    console.log(`  [Connection Exception]: ${err.message}`);
  }

  // 2. Product Variants
  console.log('\n--- 2. PRODUCT VARIANTS TABLE ---');
  try {
    const { data: variants, error: vErr } = await supabase
      .from('product_variants')
      .select('id, product_id, name, sku, price, stock_quantity, is_active');
    if (vErr) {
      console.log(`  [Query Error]: ${vErr.message}`);
    } else {
      console.log(`  Total Variants Found: ${variants?.length ?? 0}`);
      (variants || []).forEach((v) => {
        console.log(`  - [${v.id}] ${v.name} (SKU: ${v.sku}, Price: ${v.price ? '₹' + v.price : 'base'}, Stock: ${v.stock_quantity}, Active: ${v.is_active})`);
      });
    }
  } catch (err) {
    console.log(`  [Connection Exception]: ${err.message}`);
  }

  // 3. Product 3D Models
  console.log('\n--- 3. PRODUCT 3D MODELS TABLE ---');
  try {
    const { data: models, error: mErr } = await supabase
      .from('product_3d_models')
      .select('id, product_id, model_code, name, version, status, is_active, dimensions_mm, glb_storage_path, front_mesh_name');
    if (mErr) {
      console.log(`  [Query Error]: ${mErr.message}`);
    } else {
      console.log(`  Total 3D Models Found: ${models?.length ?? 0}`);
      (models || []).forEach((m) => {
        console.log(`  - [${m.id}] Code: ${m.model_code}, Name: "${m.name}", Version: ${m.version}, Status: ${m.status}, Active: ${m.is_active}`);
        console.log(`    Dimensions (mm): ${JSON.stringify(m.dimensions_mm)}, Front Mesh: "${m.front_mesh_name}", GLB: "${m.glb_storage_path}"`);
      });
    }
  } catch (err) {
    console.log(`  [Connection Exception]: ${err.message}`);
  }

  // 4. Product Printable Surfaces
  console.log('\n--- 4. PRODUCT PRINTABLE SURFACES TABLE ---');
  try {
    const { data: surfaces, error: sErr } = await supabase
      .from('product_printable_surfaces')
      .select('id, model_id, surface_key, surface_name, physical_width_mm, physical_height_mm, safe_margin_top_mm, safe_margin_bottom_mm, safe_margin_left_mm, safe_margin_right_mm, fixed_branding_overlay, status');
    if (sErr) {
      console.log(`  [Query Error]: ${sErr.message}`);
    } else {
      console.log(`  Total Printable Surfaces Found: ${surfaces?.length ?? 0}`);
      (surfaces || []).forEach((s) => {
        console.log(`  - [${s.id}] Key: "${s.surface_key}", Name: "${s.surface_name}", Status: ${s.status}`);
        console.log(`    Physical Dimensions: ${s.physical_width_mm} mm (W) x ${s.physical_height_mm} mm (H)`);
        console.log(`    Safe Margins: Top=${s.safe_margin_top_mm}mm, Bottom=${s.safe_margin_bottom_mm}mm, Left=${s.safe_margin_left_mm}mm, Right=${s.safe_margin_right_mm}mm`);
        console.log(`    Fixed Branding: ${JSON.stringify(s.fixed_branding_overlay)}`);
      });
    }
  } catch (err) {
    console.log(`  [Connection Exception]: ${err.message}`);
  }

  // 5. Customer Designs
  console.log('\n--- 5. CUSTOMER DESIGNS TABLE ---');
  try {
    const { data: designs, error: dErr } = await supabase
      .from('customer_designs')
      .select('id, customer_id, product_id, model_id, surface_id, design_title, preview_thumbnail_path, status, created_at, updated_at');
    if (dErr) {
      console.log(`  [Query Error]: ${dErr.message}`);
    } else {
      console.log(`  Total Customer Designs Found: ${designs?.length ?? 0}`);
      (designs || []).forEach((d) => {
        const previewType = !d.preview_thumbnail_path
          ? 'empty'
          : d.preview_thumbnail_path.startsWith('data:')
          ? 'base64 data URI'
          : d.preview_thumbnail_path.startsWith('http')
          ? 'full URL'
          : 'permanent storage path';
        console.log(`  - [${d.id}] Title: "${d.design_title}", Status: ${d.status}, Customer: ${d.customer_id || 'guest'}`);
        console.log(`    Preview Thumbnail Type: ${previewType} (${d.preview_thumbnail_path ? d.preview_thumbnail_path.slice(0, 60) + '...' : 'none'})`);
      });
    }
  } catch (err) {
    console.log(`  [Connection Exception]: ${err.message}`);
  }

  // 6. Orders & Order Items
  console.log('\n--- 6. ORDERS & DEMONSTRATION TAG AUDIT ---');
  try {
    const { data: orders, error: oErr } = await supabase
      .from('orders')
      .select(`
        id,
        order_number,
        order_status,
        customer_notes,
        created_at,
        order_items (
          id,
          product_name,
          sku,
          customisation_details
        )
      `)
      .order('created_at', { ascending: false })
      .limit(10);
    if (oErr) {
      console.log(`  [Query Error]: ${oErr.message}`);
    } else {
      console.log(`  Recent Orders Found: ${orders?.length ?? 0}`);
      (orders || []).forEach((o) => {
        console.log(`  - Order ${o.order_number}: Status=${o.order_status}, Notes="${o.customer_notes || 'none'}"`);
        (o.order_items || []).forEach((item) => {
          const mode = item.customisation_details?._mode;
          console.log(`    * Item: "${item.product_name}" (SKU: ${item.sku}) Mode: ${mode || 'standard'}`);
        });
      });
    }
  } catch (err) {
    console.log(`  [Connection Exception]: ${err.message}`);
  }

  console.log('\n=== LIVE INSPECTION COMPLETE ===');
}

main().catch((e) => {
  console.error('Fatal inspection error:', e);
  process.exit(1);
});
