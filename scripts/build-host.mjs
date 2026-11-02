// Builds the folder (and zip) to upload to an ordinary web host that can run a Node.js app:
//   wpc-host/app.cjs   the whole server in ONE file (no npm install needed on the host)
//   wpc-host/dist/     the web pages (configured to use this server, not Supabase)
//   wpc-host/README-FA.txt
// Usage: node scripts/build-host.mjs
import { execFileSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { build } from 'esbuild'

const OUT = 'wpc-host'
rmSync(OUT, { recursive: true, force: true })
mkdirSync(OUT, { recursive: true })

// 1. the web pages
execFileSync('npm', ['run', 'build'], { stdio: 'inherit' })
cpSync('dist', `${OUT}/dist`, { recursive: true })
// no Supabase here: an empty config makes the pages talk to this server
writeFileSync(`${OUT}/dist/config.js`, '// This installation uses its own server (no Supabase).\nwindow.WPC_CONFIG = {}\n')

// 2. the server, as one file that runs on Node 18 or newer
await build({
  entryPoints: ['server/index.ts'],
  bundle: true,
  platform: 'node',
  target: 'node18',
  format: 'cjs',
  outfile: `${OUT}/app.cjs`,
  external: ['node:sqlite'],
  legalComments: 'none',
  minify: true,
  logLevel: 'warning',
})

// 3. the instructions
if (existsSync('docs/HOST-FA.md')) writeFileSync(`${OUT}/README-FA.txt`, readFileSync('docs/HOST-FA.md', 'utf8'))

// 4. the zip
rmSync(`${OUT}.zip`, { force: true })
execFileSync('zip', ['-qr', `../${OUT}.zip`, '.'], { cwd: OUT, stdio: 'inherit' })
console.log(`ساخته شد: ${OUT}/ و ${OUT}.zip`)
