// Esbuild build for the Dafke CLI (avoids the rollup native-binary npm bug).
// Bundles to ESM and injects a createRequire shim so CommonJS deps
// (execa, cross-spawn, …) that call require() keep working at runtime.
import { build } from 'esbuild'

const requireShim = [
  "import { createRequire as __cr } from 'module'",
  'const require = __cr(import.meta.url)',
].join('\n')

const shared = {
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'esm',
  sourcemap: true,
  outdir: 'dist',
  outExtension: { '.js': '.mjs' },
}

await build({
  ...shared,
  entryPoints: { cli: 'src/cli/index.ts' },
  banner: { js: '#!/usr/bin/env node\n' + requireShim },
})

await build({
  ...shared,
  entryPoints: { index: 'src/index.ts' },
  banner: { js: requireShim },
})

console.log('Build complete → dist/cli.mjs, dist/index.mjs')
