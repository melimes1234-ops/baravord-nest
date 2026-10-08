// Splits supabase/schema.sql into supabase/setup/1..5-*.sql (small pieces that are easy to paste into the
// Supabase SQL Editor one after another) and writes the same content as one file, supabase/setup.sql.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'

const schema = readFileSync('supabase/schema.sql', 'utf8')
const marker = (name: string) => schema.indexOf(`-- ---------------------------------------------------------------- ${name}`)
const cut = [0, marker('users'), marker('formulas'), marker('API (called as supabase.rpc)'), schema.indexOf('create or replace function public.add_batch')]
if (cut.some((c, i) => i > 0 && c <= cut[i - 1])) throw new Error('schema.sql section markers not found in order')

const parts: [string, string][] = [
  ['1-tables', schema.slice(cut[0], cut[1])],
  ['2-users', schema.slice(cut[1], cut[2])],
  ['3-formulas', schema.slice(cut[2], cut[3])],
  ['4-api-a', schema.slice(cut[3], cut[4])],
  ['5-api-b', schema.slice(cut[4])],
]
mkdirSync('supabase/setup', { recursive: true })
for (const [name, body] of parts) writeFileSync(`supabase/setup/${name}.sql`, body)
writeFileSync('supabase/setup.sql', parts.map(p => p[1]).join('\n'))
console.log(parts.map(([n, b]) => `${n}: ${(b.length / 1024).toFixed(1)} KB`).join(', '))
