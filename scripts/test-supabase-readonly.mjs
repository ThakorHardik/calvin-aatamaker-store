import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import nextEnv from '@next/env';
import pg from 'pg';

const { loadEnvConfig } = nextEnv;
const { Client } = pg;

// 1. Load environment variables from .env.local
const projectDir = process.cwd();
loadEnvConfig(projectDir);

// 2. Read CALVIN_READONLY_DATABASE_URL from process.env
const connectionString = process.env.CALVIN_READONLY_DATABASE_URL;

if (!connectionString || typeof connectionString !== 'string' || connectionString.trim() === '') {
  console.error('[FAILURE] CALVIN_READONLY_DATABASE_URL environment variable is missing or empty in .env.local.');
  process.exit(1);
}

// 3. Read CA certificate from .local-certs/supabase-prod-ca.crt
const certPathPrimary = path.join(projectDir, '.local-certs', 'supabase-prod-ca.crt');
const certPathFallback = path.join(projectDir, '.local-certs', 'prod-ca-2021.crt');
const certPath = existsSync(certPathPrimary) ? certPathPrimary : certPathFallback;

if (!existsSync(certPath)) {
  console.error('[FAILURE] Supabase CA certificate not found in .local-certs.');
  process.exit(1);
}

let certificateContents;
try {
  certificateContents = readFileSync(certPath, 'utf8');
} catch (err) {
  console.error('[FAILURE] Failed to read Supabase CA certificate:', err?.message || err);
  process.exit(1);
}

// 4. Parse CALVIN_READONLY_DATABASE_URL using URL and remove sslmode/sslrootcert parameters
let sanitizedConnectionString;
try {
  const parsedUrl = new URL(connectionString.trim());
  parsedUrl.searchParams.delete('sslmode');
  parsedUrl.searchParams.delete('sslrootcert');
  sanitizedConnectionString = parsedUrl.toString();
} catch (err) {
  console.error('[FAILURE] Failed to parse CALVIN_READONLY_DATABASE_URL:', err?.message || err);
  process.exit(1);
}

// 5. Configure Client with explicit SSL validation using the CA certificate
const clientConfig = {
  connectionString: sanitizedConnectionString,
  ssl: {
    ca: certificateContents,
    rejectUnauthorized: true,
  },
};

let client;

async function verifyReadOnlyConnection() {
  try {
    client = new Client(clientConfig);

    console.log('[INFO] Connecting to Supabase database with CA certificate verification (rejectUnauthorized: true)...');
    await client.connect();

    // Verify connection identity and database
    const authRes = await client.query('SELECT current_user, current_database();');
    const { current_user, current_database } = authRes.rows[0];
    console.log(`[SUCCESS] Connected to database "${current_database}" as user "${current_user}".`);

    // Inspect public table and column metadata using pg_catalog only
    const catalogQuery = `
      SELECT 
        c.relname AS table_name,
        a.attname AS column_name,
        pg_catalog.format_type(a.atttypid, a.atttypmod) AS data_type,
        a.attnotnull AS is_not_null
      FROM pg_catalog.pg_class c
      JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
      JOIN pg_catalog.pg_attribute a ON a.attrelid = c.oid
      WHERE n.nspname = 'public'
        AND c.relkind = 'r'
        AND a.attnum > 0
        AND NOT a.attisdropped
      ORDER BY c.relname, a.attnum;
    `;

    const catalogRes = await client.query(catalogQuery);

    const tables = new Map();
    for (const row of catalogRes.rows) {
      if (!tables.has(row.table_name)) {
        tables.set(row.table_name, []);
      }
      tables.get(row.table_name).push({
        column: row.column_name,
        type: row.data_type,
        notNull: row.is_not_null,
      });
    }

    console.log(`[INFO] Discovered ${tables.size} public table(s) via pg_catalog:`);
    for (const [tableName, columns] of tables.entries()) {
      const colSummary = columns.map(c => `${c.column} (${c.type}${c.notNull ? ', NOT NULL' : ''})`).join(', ');
      console.log(`  - ${tableName} [${columns.length} columns]: ${colSummary}`);
    }

    console.log('[SUCCESS] Read-only verification completed successfully. Certificate validation and metadata inspection passed.');
  } catch (err) {
    // Never print connection URI, password, or sensitive environment variables
    const safeMessage = err && typeof err === 'object' && err.message ? err.message : String(err);
    console.error(`[FAILURE] Verification encountered an error: ${safeMessage}`);
    process.exitCode = 1;
  } finally {
    // Close database connection in finally block
    if (client) {
      try {
        await client.end();
      } catch {
        // Ignore disconnection errors during cleanup
      }
    }
  }
}

verifyReadOnlyConnection();
