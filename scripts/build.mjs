// Bouwt de app naar ./dist (statische site voor Vercel).
// Gebruik: node scripts/build.mjs            -> productiebuild
//          node scripts/build.mjs --serve    -> lokale server op http://localhost:5173
import * as esbuild from 'esbuild';
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';

const serve = process.argv.includes('--serve');
const out = 'dist';

rmSync(out, { recursive: true, force: true });
mkdirSync(`${out}/assets`, { recursive: true });
if (existsSync('public')) cpSync('public', out, { recursive: true });

const version = Date.now().toString(36);
const html = readFileSync('index.html', 'utf8').replaceAll('__VERSION__', version);
writeFileSync(`${out}/index.html`, html);

// Optionele Supabase-instellingen uit omgevingsvariabelen (Vercel > Settings > Environment Variables)
const env = {
  SUPABASE_URL: process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '',
  SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '',
};

const options = {
  entryPoints: { app: 'src/main.tsx' },
  bundle: true,
  outdir: `${out}/assets`,
  format: 'esm',
  target: ['es2020'],
  jsx: 'automatic',
  minify: !serve,
  sourcemap: serve,
  loader: { '.css': 'css' },
  define: {
    'process.env.NODE_ENV': serve ? '"development"' : '"production"',
    __SUPABASE_URL__: JSON.stringify(env.SUPABASE_URL),
    __SUPABASE_ANON_KEY__: JSON.stringify(env.SUPABASE_ANON_KEY),
  },
  // Lokaal (zonder npm install) kan een map met node_modules meegegeven worden.
  nodePaths: process.env.EXTRA_NODE_PATH ? [process.env.EXTRA_NODE_PATH] : [],
  logLevel: 'info',
};

if (serve) {
  const ctx = await esbuild.context(options);
  await ctx.watch();
  const { port } = await ctx.serve({ servedir: out, port: 5173 });
  console.log(`Klasbeheer draait op http://localhost:${port}`);
} else {
  await esbuild.build(options);
  console.log('Build klaar in ./dist');
}
