// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, nitro (build-only using cloudflare as a default target),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { fileURLToPath } from "node:url";

const tslibEsmPath = fileURLToPath(new URL("./node_modules/tslib/tslib.es6.js", import.meta.url));

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  vite: {
    resolve: {
      alias: [
        // tslib v1's package "import" condition points at modules/index.js,
        // which default-imports the CJS build and can compile to
        // __toESM(...).default === undefined in the Worker SSR bundle. Force
        // true ESM helpers so pdf-lib can safely import __extends/__awaiter.
        { find: /^tslib$/, replacement: tslibEsmPath },
      ],
    },
    // Keep pdf-lib in the SSR bundle so the alias above is applied consistently.
    ssr: {
      noExternal: ["pdf-lib", "tslib"],
    },
  },
});
