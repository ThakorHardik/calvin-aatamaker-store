import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const content = fs.readFileSync('.env.local', 'utf8');
const env = {};
content.split('\n').forEach((line) => {
  const m = line.match(/^([^#=]+)=(.*)$/);
  if (m) env[m[1].trim()] = m[2].trim().replace(/^['"]|['"]$/g, '');
});

const key = env.SUPABASE_SECRET_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, key);
const { data } = await supabase
  .from('products')
  .select('id, name, slug, is_customisable, price, customization_config');

console.log(JSON.stringify(data, null, 2));
