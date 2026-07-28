/**
 * Vite 8 + Rolldown upgrade.
 *
 * VITE8-REVERT
 * If build/HMR/polyfills break in a way that cannot be fixed quickly, roll back:
 * 1) package.json: set "vite" back to "^7.3.2" (was upgraded from Vite 7.3.2 to Vite 8)
 * 2) Restore vite-plugin-node-polyfills + optimizeDeps.esbuildOptions (see blocks below)
 * 3) pnpm install && pnpm build
 *
 * package.json note: JSON cannot hold comments — remember vite was "^7.3.2" before this upgrade.
 * Vite 7 also used "vite-plugin-node-polyfills": "^0.24.0" in the plugins array.
 *
 * Vite 7 reference (optimizeDeps):
 *   optimizeDeps: {
 *     esbuildOptions: {
 *       define: {
 *         global: "globalThis",
 *         "process.env": "{}",
 *         "process.browser": "true"
 *       }
 *     },
 *     include: ["buffer", "process", "stream", "util"],
 *     force: true
 *   }
 *
 * VITE8-REVERT — previous polyfills plugin usage:
 *   import { nodePolyfills } from "vite-plugin-node-polyfills";
 *   plugins: [ nodePolyfills({
 *     include: ["buffer", "process", "stream", "util"],
 *     globals: { Buffer: true, global: true, process: true }
 *   }) ]
 *   resolve.alias: [ { find: "buffer", replacement: "buffer" } ]
 *
 * Why replaced: Vite 8 Rolldown rejects string aliases that collide with trailing-slash
 * imports (`buffer/`, `process/`, …) — folder-to-folder mapping errors against package.json.
 * We keep Buffer via main.tsx + exact-match file aliases instead.
 */
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
// VITE8-REVERT: import { nodePolyfills } from "vite-plugin-node-polyfills";
// import { visualizer } from "rollup-plugin-visualizer";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

const bufferEntry = require.resolve("buffer/");
const processEntry = require.resolve("process/browser.js");
const streamEntry = require.resolve("stream-browserify");
const utilEntry = require.resolve("util/");
const eventsEntry = require.resolve("events/");

/**
 * Strip trailing slashes on Node builtin polyfill imports so Rolldown does not
 * treat `buffer/` as a folder mapping against a file replacement.
 */
function normalizeNodeBuiltinImports(): Plugin {
  const bare = new Set([
    "buffer",
    "process",
    "stream",
    "util",
    "events",
    "node:buffer",
    "node:process",
    "node:stream",
    "node:util",
    "node:events"
  ]);
  return {
    name: "normalize-node-builtin-trailing-slash",
    enforce: "pre",
    async resolveId(source, importer, options) {
      if (!source.endsWith("/")) return;
      const withoutSlash = source.slice(0, -1);
      if (!bare.has(withoutSlash)) return;
      return this.resolve(withoutSlash, importer, { ...options, skipSelf: true });
    }
  };
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    normalizeNodeBuiltinImports(),
    react(),
    tailwindcss()
    // VITE8-REVERT: restore nodePolyfills({...}) here when rolling back to Vite 7
    // visualizer({ open: false, gzipSize: true, brotliSize: true })
  ],
  resolve: {
    alias: [
      {
        find: "@",
        replacement: path.resolve(__dirname, "src")
      },
      // Exact-match aliases (regex) — avoid prefix remapping of `buffer/index.js` etc.
      { find: /^buffer$/, replacement: bufferEntry },
      { find: /^node:buffer$/, replacement: bufferEntry },
      { find: /^process$/, replacement: processEntry },
      { find: /^node:process$/, replacement: processEntry },
      { find: /^stream$/, replacement: streamEntry },
      { find: /^node:stream$/, replacement: streamEntry },
      { find: /^util$/, replacement: utilEntry },
      { find: /^node:util$/, replacement: utilEntry },
      { find: /^events$/, replacement: eventsEntry },
      { find: /^node:events$/, replacement: eventsEntry }
    ]
  },
  define: {
    global: "globalThis",
    "process.env": "{}",
    "process.browser": "true"
  },
  optimizeDeps: {
    // VITE8: was optimizeDeps.esbuildOptions (see file header for Vite 7 revert block)
    rolldownOptions: {
      transform: {
        define: {
          global: "globalThis",
          "process.env": "{}",
          "process.browser": "true"
        }
      }
    },
    include: ["buffer", "process", "stream-browserify", "util", "events"],
    // Force pre-bundling of problematic dependencies
    force: true
  },
  build: {
    // Multi-chain wallet SDKs make the bundle very large; gzip size reporting
    // alone can push CI past the Node heap limit near the end of the build.
    reportCompressedSize: false,
    chunkSizeWarningLimit: 2000
  },
  server: {
    host: "0.0.0.0",
    port: 5174
  }
});
