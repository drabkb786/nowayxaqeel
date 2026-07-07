// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, nitro (build-only using cloudflare as a default target),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  vite: {
    // Force pdf-lib + tslib to be bundled by Vite (not treated as external CJS)
    // so tslib's helpers (__extends, __awaiter, ...) resolve as ESM named imports
    // on the Cloudflare Worker SSR runtime. Without this the bundler emits a
    // broken __toESM(require("tslib")).default shim and blows up at runtime.
    ssr: {
      noExternal: ["pdf-lib", "tslib"],
    },
  },
});
