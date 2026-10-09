import { execFileSync } from "node:child_process";
import { defineConfig, mergeConfig } from "vite";
import baseConfig from "../../vite.config.ts";

// Serve the Phase 1 source directly from main, using this checkout's dependencies.
// No worktree, source rewrites or production-only comparison hooks are needed.
const files = new Set(["src/tryon/scroll-viewer.ts", "src/pages/v2-demo.tsx", "src/pages/v2-demo.css"]);
const revision = execFileSync("git", ["rev-parse", "main"], { encoding: "utf8" }).trim();
export default defineConfig(async (env) => mergeConfig(
  await (typeof baseConfig === "function" ? baseConfig(env) : baseConfig),
  {
    plugins: [{
      name: "v2-main-baseline",
      enforce: "pre",
      load(id: string) {
        const path = id.replaceAll("\\", "/").split("?")[0];
        for (const file of files) {
          if (path.endsWith("/" + file)) return execFileSync("git", ["show", `${revision}:${file}`], { encoding: "utf8" });
        }
      },
    }],
  },
));
