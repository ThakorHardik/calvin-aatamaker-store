import { readFileSync } from 'node:fs';
import path from 'node:path';
import nextEnv from '@next/env';
import pg from 'pg';

const { loadEnvConfig } = nextEnv;
const { Client } = pg;

loadEnvConfig(process.cwd());

const connectionString = process.env.CALVIN_READONLY_DATABASE_URL;
if (!connectionString) {
  console.error('No CALVIN_READONLY_DATABASE_URL');
  process.exit(1);
}

const certPath = path.join(process.cwd(), '.local-certs', 'supabase-prod-ca.crt');
const ca = readFileSync(certPath, 'utf8');

const parsedUrl = new URL(connectionString.trim());
parsedUrl.searchParams.delete('sslmode');
parsedUrl.searchParams.delete('sslrootcert');

const client = new Client({
  connectionString: parsedUrl.toString(),
  ssl: { ca, rejectUnauthorized: true },
});

async function run() {
  await client.connect();

  console.log('=== 1. TABLES & RLS STATUS ===');
  const rlsRes = await client.query(`
    SELECT 
      c.relname AS table_name,
      c.relrowsecurity AS rls_enabled,
      c.relforcerowsecurity AS rls_forced
    FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r'
    ORDER BY c.relname;
  `);
  console.table(rlsRes.rows);

  console.log('=== 2. RLS POLICIES ===');
  const policiesRes = await client.query(`
    SELECT 
      schemaname,
      tablename,
      policyname,
      permissive,
      roles,
      cmd,
      qual,
      with_check
    FROM pg_catalog.pg_policies
    WHERE schemaname = 'public'
    ORDER BY tablename, policyname;
  `);
  for (const pol of policiesRes.rows) {
    console.log(`[${pol.tablename}] "${pol.policyname}" FOR ${pol.cmd} TO ${pol.roles}: USING (${pol.qual}) WITH CHECK (${pol.with_check})`);
  }

  console.log('=== 3. CONSTRAINTS (pg_constraint) ===');
  const pgConRes = await client.query(`
    SELECT 
      conrelid::regclass::text AS table_name,
      conname AS constraint_name,
      contype AS constraint_type,
      pg_catalog.pg_get_constraintdef(oid, true) AS definition
    FROM pg_catalog.pg_constraint
    WHERE connamespace = 'public'::regnamespace
    ORDER BY conrelid::regclass::text, conname;
  `);
  console.table(pgConRes.rows);

  console.log('=== 4. TRIGGERS (pg_trigger) ===');
  const trigRes = await client.query(`
    SELECT 
      tgrelid::regclass::text AS table_name,
      tgname AS trigger_name,
      pg_catalog.pg_get_triggerdef(oid, true) AS definition
    FROM pg_catalog.pg_trigger
    WHERE NOT tgisinternal
      AND tgrelid::regclass::text IN ('banners', 'categories', 'order_items', 'orders', 'product_images', 'product_variants', 'products', 'profiles')
    ORDER BY tgrelid::regclass::text, tgname;
  `);
  console.table(trigRes.rows);

  console.log('=== 5. PUBLIC FUNCTIONS ===');
  const funcRes = await client.query(`
    SELECT 
      p.proname AS function_name,
      pg_catalog.pg_get_function_arguments(p.oid) AS arguments,
      pg_catalog.pg_get_function_result(p.oid) AS return_type,
      p.prosecdef AS is_security_definer
    FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
    ORDER BY p.proname;
  `);
  console.table(funcRes.rows);

  console.log('=== 6. STORAGE BUCKETS & POLICIES ===');
  try {
    const bucketsRes = await client.query(`
      SELECT id, name, public, file_size_limit, allowed_mime_types
      FROM storage.buckets
      ORDER BY name;
    `);
    console.table(bucketsRes.rows);
  } catch (e) {
    console.log('Storage buckets note:', e.message);
  }

  try {
    const storagePolRes = await client.query(`
      SELECT 
        schemaname, tablename, policyname, roles, cmd, qual, with_check
      FROM pg_catalog.pg_policies
      WHERE schemaname = 'storage'
      ORDER BY tablename, policyname;
    `);
    for (const pol of storagePolRes.rows) {
      console.log(`[storage.${pol.tablename}] "${pol.policyname}" FOR ${pol.cmd} TO ${pol.roles}`);
    }
  } catch (e) {
    console.log('Storage policies note:', e.message);
  }

  console.log('=== 7. TABLE RECORD COUNTS (AGGREGATE ONLY) ===');
  const tables = ['banners', 'categories', 'order_items', 'orders', 'product_images', 'product_variants', 'products', 'profiles'];
  for (const t of tables) {
    try {
      const cntRes = await client.query(`SELECT count(*)::int AS count FROM public."${t}"`);
      console.log(`Table ${t}: ${cntRes.rows[0].count} rows`);
    } catch (e) {
      console.log(`Table ${t}: error counting (${e.message})`);
    }
  }

  console.log('=== 8. CHECK CONSTRAINTS ===');
  const checkRes = await client.query(`
    SELECT tc.table_name, tc.constraint_name, cc.check_clause
    FROM information_schema.table_constraints tc
    JOIN information_schema.check_constraints cc 
      ON tc.constraint_name = cc.constraint_name
      AND tc.constraint_schema = cc.constraint_schema
    WHERE tc.constraint_schema = 'public'
    ORDER BY tc.table_name, tc.constraint_name;
  `);
  console.table(checkRes.rows);

  console.log('=== 9. AUTH TRIGGERS ===');
  try {
    const authTrig = await client.query(`
      SELECT 
        event_object_schema,
        event_object_table,
        trigger_name,
        action_timing,
        event_manipulation,
        action_statement
      FROM information_schema.triggers
      WHERE event_object_schema = 'auth'
      ORDER BY trigger_name;
    `);
    console.table(authTrig.rows);
  } catch (e) {
    console.log('Auth triggers query note:', e.message);
  }

  await client.end();
}

run().catch(err => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
