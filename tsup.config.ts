import { defineConfig } from "tsup";

export default defineConfig([
  {
    entry: { cli: "src/cli/index.ts" },
    format: ["esm"],
    outExtension: () => ({ js: ".mjs" }),
    dts: false,
    sourcemap: true,
    clean: true,
    target: "node20",
    platform: "node",
    splitting: false,
    banner: { js: "#!/usr/bin/env node" },
    external: [],
  },
  {
    entry: { index: "src/index.ts" },
    format: ["esm"],
    outExtension: () => ({ js: ".mjs" }),
    dts: false,
    sourcemap: true,
    target: "node20",
    platform: "node",
    splitting: false,
    external: [],
  },
]);
