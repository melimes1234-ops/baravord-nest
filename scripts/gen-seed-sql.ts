// Writes supabase/setup.sql = schema.sql + the starting catalog from src/core/seed.ts.
import { readFileSync, writeFileSync } from 'node:fs'
import { seedCatalog } from '../src/core'

const schema = readFileSync('supabase/schema.sql', 'utf8')
const json = JSON.stringify(seedCatalog()).replace(/'/g, "''")
const seed = `
-- Starting catalog (only inserted once; re-running this file keeps your data).
insert into public.app_config (key, value, version)
values ('catalog', '${json}'::jsonb, 1)
on conflict (key) do nothing;
`
writeFileSync('supabase/setup.sql', schema + seed)
console.log('supabase/setup.sql written')
